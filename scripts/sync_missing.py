#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""补传缺失文件（增量同步）。

push_via_api.py 一次跑完 79 个文件要好几分钟，容易撞上外层工具超时被杀，
结果就是"传了大半、剩几个大文件没传完"。

这个脚本只补差的：
  1. 递归列出远端已有文件（走 Contents API 的目录树）
  2. 本地扫描，算出缺失清单
  3. 只传缺失的
可反复运行，直到"缺失 0 个"为止。幂等。

★ 关键技术点：.github/workflows/ 的特殊性★
GitHub 对已存在于默认分支的 .github/ 路径会**忽略 Contents API 的更新**
（防止用仓库内容篡改工作流定义）。首次上传不存在这个问题，
但如果工作流已存在却需要改，就必须用 git push 走正常提交，
任何 API 都绕不过（GitHub 没提供这个口子）。
本脚本遇到这种情况会明确报出来，不假装成功。
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

H = {
    "Authorization": "Bearer " + TOKEN,
    "Accept": "application/vnd.github+json",
    "User-Agent": "std-watch-sync",
}
SKIP_DIRS = {".git", "__pycache__", "node_modules", "_shots", ".idea"}
SKIP_SUFFIX = (".pyc", ".log", ".bak")


def get(path):
    try:
        r = requests.get(BASE + "/contents/" + path, headers=H, timeout=(8, 25))
        return r.status_code, (r.json() if r.content else {})
    except requests.RequestException as e:
        return -1, {"message": str(e)[:150]}


def remote_files():
    """递归列出远端全部文件 -> {path: sha}"""
    out = {}

    def walk(path):
        code, data = get(path)
        if code != 200 or not isinstance(data, list):
            return
        for e in data:
            if e.get("type") == "dir":
                walk(e["path"])
            else:
                out[e["path"]] = e.get("sha")

    walk("")
    return out


def local_files():
    out = set()
    for base, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for fn in files:
            if fn.endswith(SKIP_SUFFIX):
                continue
            full = os.path.join(base, fn)
            out.add(os.path.relpath(full, ROOT).replace("\\", "/"))
    return out


def upload_one(rel, sha):
    with open(os.path.join(ROOT, rel), "rb") as f:
        b64 = base64.b64encode(f.read()).decode("ascii")
    body = {"message": "chore: 补传 %s" % rel, "content": b64}
    if sha:
        body["sha"] = sha
    try:
        r = requests.put(BASE + "/contents/" + rel, headers=H,
                         json=body, timeout=(8, 90))
        return r.status_code, r.json()
    except requests.RequestException as e:
        return -1, {"message": str(e)[:150]}


def main():
    if not TOKEN:
        print("[x] 未设置 GITHUB_TOKEN")
        return 1
    code, me = get("/../..")  # 故意打一个不存在的路径，只为快速失败
    if not TOKEN.startswith("gh"):
        print("[x] token 格式不对")
        return 1

    print("-- 读取远端文件树")
    remote = remote_files()
    print("   远端已有 %d 个文件" % len(remote))

    local = local_files()
    missing = sorted(local - set(remote))
    print("-- 本地应有 %d 个，缺失 %d 个" % (len(local), len(missing)))

    if not missing:
        print()
        print("[OK] 全部文件已在远端")
        return 0

    ok = fail = 0
    workflow_blocked = []
    for i, rel in enumerate(missing, 1):
        size = os.path.getsize(os.path.join(ROOT, rel))
        print("   [%d/%d] %s (%.0f KB)" % (i, len(missing), rel, size / 1024))
        code, d = upload_one(rel, None)
        if code in (200, 201):
            ok += 1
        else:
            msg = str(d.get("message", ""))[:150]
            if code in (422, 409) and ".github" in rel:
                workflow_blocked.append("%s -> HTTP %s %s" % (rel, code, msg))
            else:
                fail += 1
                print("      [x] HTTP %s %s" % (code, msg))
        time.sleep(0.2)

    print()
    print("-- 结果：成功 %d，失败 %d" % (ok, fail))

    if workflow_blocked:
        print()
        print("[!] 以下工作流文件被 GitHub 拒绝（已存在于默认分支时会被忽略更新）：")
        for w in workflow_blocked:
            print("    " + w)
        print()
        print("    工作流内容要改，只能用 git push 走正常提交。")
        print("    但本机 git push 会被代理卡死，所以请在 GitHub 网页上")
        print("    手动新建该文件并粘贴内容，或改用网页编辑器。")

    return 0 if fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())