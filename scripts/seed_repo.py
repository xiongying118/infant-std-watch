#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""用 Git Trees +单个 commit 一次性建仓（Contents API 逐文件太慢且会失败）。

================================================================
为什么必须有这个脚本
================================================================
前两次尝试都失败了，根因值得记下来：

1. Contents API（PUT /contents/{path}）传 79 个文件 = 79 个 commit，
   79 次往返，跑 5 分钟没跑完，被外层超时杀掉。

2. 仓库明明有 main 分支、contents API 也能读到 69 个文件，
   但 repo.size 一直是 0 KB —— 说明那些"成功"的写入
   并没有真正落进 git 对象库，仓库在 GitHub 眼里仍是空的。

3. 关键症状：PUT .github/workflows/daily-check.yml 返回 **404**，
   而不是通常的 403/422。
   404 在这里的意思是"找不到 base commit"，
   即仓库根本没有可用的提交历史 —— 因为前面的写入全是悬空的。

所以换 Git Data API：git/blobs -> git/trees -> git/commits -> git/refs。
这条路只建**一个** commit，一次网络往返搞定全部 80 个文件，
而且是 git 原生对象模型，不会有悬空写入的问题。
"""
import base64
import os
import sys
import time

import requests

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.environ.get("REPO_NAME", "infant-std-watch")
USER = os.environ.get("GITHUB_USER", "xiongying118")
TOKEN = os.environ.get("GITHUB_TOKEN", "")
BASE = "https://api.github.com/repos/%s/%s" % (USER, REPO)
API = "https://api.github.com"

H = {
    "Authorization": "Bearer " + TOKEN,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "std-watch-seed",
}

SKIP_DIRS = {".git", "__pycache__", "node_modules", "_shots", ".idea", ".vscode"}
SKIP_SUFFIX = (".pyc", ".log", ".bak")


def call(method, url, body=None, timeout=(8, 60)):
    for attempt in range(3):
        try:
            r = requests.request(method, url, headers=H, json=body, timeout=timeout)
            if r.status_code in (502, 503, 504) and attempt < 2:
                time.sleep(1.5 * (attempt + 1))
                continue
            try:
                return r.status_code, r.json()
            except ValueError:
                return r.status_code, {"message": r.text[:300]}
        except requests.RequestException as e:
            if attempt < 2:
                time.sleep(1.5 * (attempt + 1))
                continue
            return -1, {"message": "%s: %s" % (type(e).__name__, str(e)[:150])}
    return -1, {"message": "重试耗尽"}


def local_files():
    out = []
    for base, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for fn in files:
            if fn.endswith(SKIP_SUFFIX):
                continue
            full = os.path.join(base, fn)
            rel = os.path.relpath(full, ROOT).replace("\\", "/")
            out.append((rel, full))
    return sorted(out)


def main():
    if not TOKEN:
        print("[x] 未设置 GITHUB_TOKEN")
        return 1

    code, me = call("GET", API + "/user")
    if code != 200:
        print("[x] token 无效 HTTP %s: %s" % (code, str(me.get("message"))[:150]))
        return 1
    print("-- 已认证为 %s" % me.get("login"))

    code, repo = call("GET", BASE)
    if code != 200:
        print("[x] 仓库不存在 HTTP %s" % code)
        return 1
    branch = repo.get("default_branch") or "main"
    print("-- 仓库 %s/%s  默认分支 %s  当前 %s KB"
          % (USER, REPO, branch, repo.get("size")))

    files = local_files()
    total_kb = sum(os.path.getsize(f) for _, f in files) / 1024
    print("-- 待写入 %d 个文件，共 %.0f KB" % (len(files), total_kb))

    # --- 1. 建 blob ----------------------------------------------------
    print("-- 第1步：写入 blob")
    tree = []
    ok = fail = 0
    for i, (rel, full) in enumerate(files, 1):
        with open(full, "rb") as f:
            raw = f.read()
        blob = {"content": base64.b64encode(raw).decode("ascii"),
                "encoding": "base64"}
        code, d = call("POST", API + "/repos/%s/%s/git/blobs" % (USER, REPO),
                       blob, timeout=(8, 60))
        if code != 201:
            fail += 1
            print("   [x] %s HTTP %s: %s" % (rel, code, str(d.get("message"))[:100]))
            continue
        tree.append({"path": rel, "mode": "100644", "type": "blob",
                     "sha": d["sha"]})
        ok += 1
        if i % 20 == 0 or i == len(files):
            print("   [%d/%d] 已建 blob %d 个" % (i, len(files), ok))
    print("   blob 完成：成功 %d，失败 %d" % (ok, fail))
    if fail:
        print("   [x] 有 blob 失败，中止（避免建出残缺的树）")
        return 1

    # --- 2. 建 tree ----------------------------------------------------
    print("-- 第 2 步：组装tree")
    code, d = call("POST", API + "/repos/%s/%s/git/trees" % (USER, REPO),
                   {"tree": tree})
    if code != 201:
        print("[x] 建 tree 失败 HTTP %s: %s" % (code, str(d.get("message"))[:300]))
        return 1
    tree_sha = d["sha"]
    print("   tree = %s（%d 项）" % (tree_sha[:12], len(d.get("tree", []))))

    # --- 3. 建 commit --------------------------------------------------
    print("-- 第 3 步：建 commit")
    code, d = call("POST", API + "/repos/%s/%s/git/commits" % (USER, REPO),
                   {"message": "feat: 婴配标准雷达初始提交\n\n"
                               "- 每日官方源抓取（CFSA/标准委/总局/工信部等）\n"
                               "- GitHub Actions 云端定时 + 条数断崖守卫\n"
                               "- 数据外置到 data.js，避免每天重新构建整站",
                    "tree": tree_sha})
    if code != 201:
        print("[x] 建 commit 失败 HTTP %s: %s" % (code, str(d.get("message"))[:300]))
        return 1
    commit_sha = d["sha"]
    print("   commit = %s" % commit_sha[:12])

    # --- 4. 挂到分支上 --------------------------------------------------
    print("-- 第 4 步：更新分支引用")
    # PATCH refs 而不是 PUT：分支已存在时 PATCH 才不会 422。
    # PUT /git/refs/{ref} 仅用于创建；更新必须用 PATCH。
    code, ref = call("GET", BASE + "/git/ref/heads/" + branch)
    if code == 200:
        code, d = call("PATCH", BASE + "/git/refs/heads/" + branch,
                       {"sha": commit_sha, "force": True})
        verb = "强制更新"
    else:
        code, d = call("POST", API + "/repos/%s/%s/git/refs" % (USER, REPO),
                       {"ref": "refs/heads/" + branch, "sha": commit_sha})
        verb = "新建"
    if code not in (200, 201):
        print("[x] %s分支失败 HTTP %s: %s" % (verb, code, str(d.get("message"))[:300]))
        return 1
    print("   %s %s -> %s" % (verb, branch, commit_sha[:12]))

    # --- 5. 验证 -------------------------------------------------------
    print("-- 第 5 步：验证")
    code, repo = call("GET", BASE)
    print("   仓库大小 %s KB（原为 0）" % repo.get("size"))

    code, wf = call("GET", BASE + "/contents/.github/workflows/daily-check.yml"
                    "?ref=" + branch)
    print("   工作流文件%s" % ("已就位" if code == 200 else "仍然缺失 HTTP %s" % code))

    code, acts = call("GET", BASE + "/actions/workflows")
    n = len(acts.get("workflows", [])) if code == 200 else -1
    if code == 200 and n > 0:
        for w in acts["workflows"]:
            print("   Actions 已识别工作流：%s（状态 %s）"
                  % (w["name"], w["state"]))
    else:
        print("   Actions 尚未识别工作流（HTTP %s），可能需要等 10~30 秒"
              % code)

    print()
    print("-- 下一步（需你在网页点两下）")
    print("1) 开 Pages： https://github.com/%s/%s/settings/pages" % (USER, REPO))
    print("   Build and deployment -> Source 选 GitHub Actions -> Save")
    print("2) 手动触发： https://github.com/%s/%s/actions" % (USER, REPO))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())