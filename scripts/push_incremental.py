#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""增量推送：只上传内容变了的文件（rebuild_repo.py 的加速版）。

================================================================
为什么不用 rebuild_repo.py
================================================================
它每次把本地全部文件（300+）逐个 POST /git/blobs 重传一遍。
网络一慢就是 20 分钟起步，而且每次都白传一遍没变的东西。

增量版做法：
  ① GET /git/trees/{sha}?recursive=1  → 远端所有文件的 blob sha（1 次调用）
  ② 本地算 git blob sha = sha1("blob <size>\\0" + 内容)
  ③ sha 相同 → 跳过（不用传）
  ④ sha 不同或远端没有 → 只传这些
实测：300 个文件里通常只有 10~30 个变了，推送时间从 20 分钟降到 1~2 分钟。

================================================================
规则不变
================================================================
* prototype/data.js 与 .github/workflows/daily-check.yml **沿用远端**，
  不推本地版本（前者由 Actions 独占写入，后者 GitHub API 写不进去）。
"""
import base64
import hashlib
import json
import os
import sys
import time

import requests

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.environ.get("REPO_NAME", "infant-std-watch")
USER = os.environ.get("GITHUB_USER", "xiongying118")
TOKEN = os.environ.get("GITHUB_TOKEN", "")
API = "https://api.github.com"
BASE = API + "/repos/%s/%s" % (USER, REPO)

H = {
    "Authorization": "Bearer " + TOKEN,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "std-watch-push",
}

SKIP_DIRS = {".git", "__pycache__", "node_modules", "_shots", ".idea", ".vscode"}
SKIP_SUFFIX = (".pyc", ".log", ".bak")

# ★ 本机临时目录，绝不能推 ★
#   .workbuddy/tmp 下有 4 份 13 MB 的 baseline 快照 + 各种探针文件，
#   一次就是 50+ MB 垃圾。远端仓库只需要站点代码、脚本和数据。
SKIP_PATH_PREFIX = (".workbuddy/tmp/",)

# 必须沿用远端版本的文件
KEEP_REMOTE = {
    ".github/workflows/daily-check.yml",
    "prototype/data.js",
}


def call(method, url, data=None, timeout=(10, 60), tries=3):
    for k in range(tries):
        try:
            r = requests.request(method, url, headers=H, json=data, timeout=timeout)
            try:
                body = r.json()
            except Exception:
                body = {"message": r.text[:200]}
            if r.status_code in (409, 422) and body.get("sha"):
                return r.status_code, body
            if r.status_code >= 500:
                time.sleep(2 * (k + 1))
                continue
            return r.status_code, body
        except Exception as e:
            if k == tries - 1:
                return 0, {"message": str(e)[:200]}
            time.sleep(2 * (k + 1))
    return 0, {"message": "重试耗尽"}


def collect():
    out = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            if fn.endswith(SKIP_SUFFIX):
                continue
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, ROOT).replace("\\", "/")
            if rel.startswith(SKIP_PATH_PREFIX):
                continue
            out.append((rel, full))
    out.sort()
    return out


def blob_sha(path):
    """算 git blob sha：sha1("blob <len>\\0" + 内容)"""
    with open(path, "rb") as f:
        raw = f.read()
    h = hashlib.sha1()
    h.update(b"blob %d\0" % len(raw))
    h.update(raw)
    return h.hexdigest()


def main():
    if not TOKEN:
        print("[x] 未设置 GITHUB_TOKEN")
        return 1

    code, me = call("GET", API + "/user")
    if code != 200:
        print("[x] token 无效 HTTP %s: %s" % (code, str(me.get("message"))[:150]))
        return 1
    print("-- 已认证为 %s" % me.get("login"))

    code, ref = call("GET", BASE + "/git/ref/heads/main")
    if code != 200:
        print("[x] 取 main 分支失败 HTTP %s" % code)
        return 1
    head = ref["object"]["sha"]
    code, cm = call("GET", BASE + "/git/commits/" + head)
    base_tree = cm["tree"]["sha"]
    print("-- HEAD %s  base_tree %s" % (head[:10], base_tree[:10]))

    # 远端所有文件的 blob sha
    code, tree = call("GET", BASE + "/git/trees/%s?recursive=1" % base_tree,
                      timeout=(10, 90))
    remote = {}
    if code == 200:
        for it in tree.get("tree", []):
            if it.get("type") == "blob":
                remote[it["path"]] = it["sha"]
    print("-- 远端文件 %d 个" % len(remote))

    files = collect()
    files = [(r, f) for r, f in files if r not in KEEP_REMOTE]
    print("-- 本地待比对 %d 个（data.js 与工作流沿用远端）" % len(files))

    changed = []
    same = 0
    for rel, full in files:
        try:
            ls = blob_sha(full)
        except Exception as e:
            print("   [!] 读不到 %s: %s" % (rel, e))
            continue
        if remote.get(rel) == ls:
            same += 1
            continue
        changed.append((rel, full, ls))
    print("-- 未变 %d 个 · 需上传 %d 个" % (same, len(changed)))

    if not changed:
        print("-- 无变化，跳过推送")
        return 0

    entries = []
    failed = []
    for i, (rel, full, ls) in enumerate(changed, 1):
        with open(full, "rb") as f:
            raw = f.read()
        code, d = call("POST", BASE + "/git/blobs",
                       {"content": base64.b64encode(raw).decode("ascii"),
                        "encoding": "base64"})
        if code == 409 and d.get("sha"):
            code, d = 201, d
        if code != 201:
            failed.append((rel, code, str(d.get("message"))[:80]))
            print("   [!] 跳过 %s HTTP %s" % (rel, code))
            continue
        entries.append({"path": rel, "mode": "100644", "type": "blob", "sha": d["sha"]})
        if i % 10 == 0 or i == len(changed):
            print("   [%d/%d] blob 就绪" % (i, len(changed)))

    if not entries:
        print("[x] 没有可提交的变更")
        return 1

    # 建 tree（base_tree 叠加，未列出的路径自动保留）
    code, t = call("POST", BASE + "/git/trees",
                   {"base_tree": base_tree, "tree": entries})
    if code != 201:
        print("[x] 建 tree 失败 HTTP %s: %s" % (code, str(t.get("message"))[:200]))
        return 1
    print("-- tree %s" % t["sha"][:10])

    msg = ("feat: 实验室管理台账 + 全新界面主题（%d 个文件变更）"
           % len(entries))
    code, c = call("POST", BASE + "/git/commits",
                   {"message": msg, "tree": t["sha"], "parents": [head]})
    if code != 201:
        print("[x] 建 commit 失败 HTTP %s: %s" % (code, str(c.get("message"))[:200]))
        return 1
    print("-- commit %s" % c["sha"][:10])

    code, r2 = call("PATCH", BASE + "/git/refs/heads/main",
                    {"sha": c["sha"], "force": False})
    if code != 200:
        print("[x] 更新 ref 失败 HTTP %s: %s" % (code, str(r2.get("message"))[:200]))
        return 1
    print("-- [OK] 已推送到 main")

    if failed:
        print("-- 失败 %d 个（下次推送会补）:" % len(failed))
        for f_ in failed[:10]:
            print("   %s HTTP %s" % (f_[0], f_[1]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
