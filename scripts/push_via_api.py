#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""用 GitHub REST API 上传仓库内容（不依赖 git 协议）。

================================================================
为什么不用 git push
================================================================
本机设了 HTTP 代理（127.0.0.1:60830），git 的 smart HTTP 协议
在代理链上会挂死 —— push 反复被 SIGTERM 超时kill，
但同样走代理的 curl 请求完全正常（api.github.com 200，耗时 <1s）。

也就是说：**网络通，git 协议不通**。这不是配置能修好的，
是 git over HTTPS + 本地代理这个组合的问题。

所以改用 API 上传：
  PUT/POST https://api.github.com/repos/{owner}/{repo}/contents/{path}
它走普通 HTTP，curl/python requests 都正常，且天然支持免交互 token。

代价是每个文件一次请求，本仓库约 80 个文件，一次性跑完约 1~2 分钟，
可接受（只在首次推送和后续同步时用，日常自动更新走 Actions）。

用法
  export GITHUB_TOKEN='ghp_xxxx'
  python scripts/push_via_api.py
"""
import base64
import json
import os
import sys
import time

import requests

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
REPO = os.environ.get("REPO_NAME", "infant-std-watch")
USER = os.environ.get("GITHUB_USER", "xiongying118")
TOKEN = os.environ.get("GITHUB_TOKEN", "")

API = "https://api.github.com"
HDRS = {
    "Authorization": "Bearer " + TOKEN,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "std-watch-push",
}

# 不上传这些：备份、缓存、日志、依赖
SKIP_DIRS = {".git", "__pycache__", "node_modules", "_shots", ".idea", ".vscode"}
SKIP_FILES = {".DS_Store", "Thumbs.db"}
SKIP_SUFFIX = (".pyc", ".log", ".bak")


def api(method, path, body=None):
    """调 GitHub API。

    ★ 这里必须用 requests，不能用 urllib ★
      本机有 HTTP 代理（127.0.0.1:60830）。实测同环境下：
        curl    -> 1.0s通
        requests-> 1.0s 通
        urllib  -> 挂死，直到超时被 kill
      urllib 对代理的环境变量处理和超时控制都不如 requests 稳。
      timeout 给 (8, 30)：连接 8 秒、读取 30 秒，别再设 60 秒那种
      会撞上外层工具超时的值 —— 挂死时快速失败比长时间等待好。
    """
    try:
        r = requests.request(method, API + path, headers=HDRS,
                             json=body, timeout=(8, 30))
    except requests.exceptions.RequestException as e:
        return -1, {"message": "%s: %s" % (type(e).__name__, str(e)[:200])}
    try:
        return r.status_code, r.json()
    except ValueError:
        return r.status_code, {"message": r.text[:300]}


def should_skip(rel):
    parts = rel.split("/")
    if any(p in SKIP_DIRS for p in parts):
        return True
    name = parts[-1]
    return name in SKIP_FILES or name.endswith(SKIP_SUFFIX)


def collect():
    """收集要上传的文件。排除 .github 的处理见main 的说明。"""
    out = []
    for base, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for fn in files:
            full = os.path.join(base, fn)
            rel = os.path.relpath(full, ROOT).replace("\\", "/")
            if should_skip(rel):
                continue
            out.append((rel, full))
    return sorted(out)


def get_sha(path):
    st, d = api("GET", "/repos/%s/%s/contents/%s" % (USER, REPO, path))
    return d.get("sha") if st == 200 else None


def put(path, content_b64, sha):
    body = {"message": "feat: 云端定时检查（GitHub Actions）+ 条数断崖守卫",
            "content": content_b64}
    if sha:
        body["sha"] = sha
    return api("PUT", "/repos/%s/%s/contents/%s" % (USER, REPO, path), body)


def main():
    if not TOKEN:
        print("[x] 未设置 GITHUB_TOKEN")
        return 1

    st, d = api("GET", "/user")
    if st != 200:
        print("[x] token 无效或权限不足，HTTP %s: %s"
              % (st, d.get("message")))
        return 1
    print("-- 已认证为 %s" % d.get("login"))

    st, d = api("GET", "/repos/%s/%s" % (USER, REPO))
    if st != 200:
        print("-- 仓库不存在，创建中")
        st, d = api("POST", "/user/repos", {
            "name": REPO, "private": False, "auto_init": False,
            "description": "婴幼儿配方乳粉官方标准变更提醒 — 云端每日自动抓取官方源"})
        if st != 201:
            print("[x] 创建失败 HTTP %s: %s" % (st, d.get("message")))
            return 1
        print("   [OK] 已创建 https://github.com/%s/%s" % (USER, REPO))

    files = collect()
    print("-- 待上传 %d 个文件" % len(files))

    ok = fail = skip = 0
    for i, (rel, full) in enumerate(files, 1):
        with open(full, "rb") as f:
            raw = f.read()
        b64 = base64.b64encode(raw).decode("ascii")
        sha = get_sha(rel)
        st, d = put(rel, b64, sha)
        if st in (200, 201):
            verb = "更新" if sha else "新增"
            ok += 1
            if i % 15 == 0 or i == len(files):
                print("   [%d/%d] %s %s" % (i, len(files), verb, rel))
        elif st == 422 and "sha" in json.dumps(d, ensure_ascii=False):
            # 并发改动：拿到新 sha 重试一次
            sha2 = get_sha(rel)
            st2, d2 = put(rel, b64, sha2)
            if st2 in (200, 201):
                ok += 1
                continue
            fail += 1
            print("   [x] %s HTTP %s" % (rel, st2))
        else:
            fail += 1
            print("   [x] %s HTTP %s: %s" % (rel, st, str(d.get("message"))[:120]))
        time.sleep(0.12)      # 别把二级限流打出来

    print()
    print("-- 完成：成功 %d，失败 %d（共 %d）" % (ok, fail, len(files)))

    # ---------------------------------------------------------------
    # Actions 工作流必须单独用 API 创建一次
    # ---------------------------------------------------------------
    # 原因：通过 Contents API 上传 .github/workflows/*.yml 时，
    # 如果该文件在默认分支上已存在，GitHub 出于安全考虑
    # 会**忽略**对 .github/ 路径的更新（防止用仓库内容改工作流）。
    # 结果就是"文件推上去了但 Actions 不认"。
    # 唯一可靠办法：本地建 git 仓库，走正常的 git push 建立初始提交。
    # 但本机 git 协议被代理卡死（见文件头说明）。
    #
    # 所以这里给出明确的人工步骤，而不是假装能自动绕过 ——
    # GitHub 没有任何 API 可以绕过这个限制。
    if ok and not fail:
        print()
        print("=" * 62)
        print("[OK] 文件已全部上传到 https://github.com/%s/%s" % (USER, REPO))
        print()
        print("还差两件必须你手动做的事：")
        print()
        print("A. 重新触发一次，验证工作流语法")
        print("   Actions 标签页 -> 左侧栏点文件名旁的i 图标下箭头")
        print("   -> 或直接访问：")
        print("   https://github.com/%s/%s/actions" % (USER, REPO))
        print()
        print("B. 开Pages")
        print("   https://github.com/%s/%s/settings/pages" % (USER, REPO))
        print("   Build and deployment -> Source 选 GitHub Actions，保存")
        print("=" * 62)
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())