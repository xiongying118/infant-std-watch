#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""重建 GitHub 仓库并推送全部文件（跳过工作流，由用户在网页补）。

================================================================
为什么重建
================================================================
首次建仓时description 写成了
"婴幼儿配方乳粉官方标准变更提醒 — 云端每日自动抓取官方源"
GitHub 拿它去生成仓库显示名时截断出了"婴儿性病观察"这种
不通顺的名字。已删库重建，这次描述写完整、不用破折号、
不放会被截断的冗长从句。

================================================================
为什么跳过 .github/workflows/
================================================================
实测：同一个 classic token（仅 public_repo 权限）
  -普通路径（新增/覆盖）-> 201成功
  - .github/workflows/*         -> 404，且换任何条目数/体积/字段组合都一样

而公开对照测试里，**只有工作流路径 404，其他路径全 201**，
所以这不是权限组的问题，而是 GitHub 对工作流文件的硬保护：
任何 API 都不能写（防供应链攻击）。只有两种办法：
  1. token 加 workflow 权限（该权限隶属 repo 组，会附带私有库全权）
  2. 在 GitHub 网页上手工粘贴
选 2，不为一次上传扩大 token 权限。

所以本脚本刻意把 .github/ 排除在外，剩下 80 个文件全部自动完成。
"""
import base64
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
    "User-Agent": "std-watch-seed",
}

# 描述单独用完整短句，避免 GitHub 截断生成怪显示名
DESCRIPTION = "婴幼儿配方乳粉官方标准变更提醒系统。每日自动抓取官方标准源，只信官方数据。"

SKIP_DIRS = {".git", "__pycache__", "node_modules", "_shots", ".idea", ".vscode"}
SKIP_SUFFIX = (".pyc", ".log", ".bak")


def call(method, url, body=None, timeout=(8, 60)):
    for i in range(3):
        try:
            r = requests.request(method, url, headers=H, json=body, timeout=timeout)
            if r.status_code in (502, 503, 504) and i < 2:
                time.sleep(1.5 * (i + 1))
                continue
            try:
                return r.status_code, r.json()
            except ValueError:
                return r.status_code, {"message": r.text[:300]}
        except requests.RequestException as e:
            if i < 2:
                time.sleep(1.5 * (i + 1))
                continue
            return -1, {"message": "%s: %s" % (type(e).__name__, str(e)[:150])}
    return -1, {"message": "重试耗尽"}


def collect():
    """收集要上传的文件。

    注意：**这里必须包含 .github/**
    早先版本刻意跳过 .github/（因为 GitHub API 写不进工作流），
    结果 tree 用 base_tree 叠加时把工作流**删掉了** ——
    base_tree 语义是「以它为基底，用这份tree 替换/新增其余条目」，
    新 tree 里没有的路径会被移除。
    用户辛苦在网页粘一次的工作流，就这么被冲掉了。两次。

    所以：把 .github/ 一起放进 tree。
    建 tree 本身不需要写权限（建好tree 后靠 commit 落上去），
    真正被GitHub 拦的是 Contents API 和建 tree 时的**写入**动作，
    而我们只需要它保持在 tree 里不丢。
    """
    out = []
    for base, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        rel_base = os.path.relpath(base, ROOT).replace("\\", "/")
        if rel_base == ".":
            rel_base = ""
        for fn in files:
            if fn.endswith(SKIP_SUFFIX):
                continue
            rel = (rel_base + "/" + fn).lstrip("/")
            out.append((rel, os.path.join(base, fn)))
    return sorted(out)


def main():
    if not TOKEN:
        print("[x] 未设置 GITHUB_TOKEN")
        return 1

    code, me = call("GET", API + "/user", timeout=(8, 25))
    if code != 200:
        print("[x] token 无效 HTTP %s: %s" % (code, str(me.get("message"))[:150]))
        return 1
    print("-- 已认证为 %s（权限 %s）"
          % (me.get("login"), (call("GET", API + "/user",
             timeout=(8, 25))[1].get("_scopes") or "见下")))

    # --- 建库 ----------------------------------------------------------
    code, repo = call("GET", BASE, timeout=(8, 25))
    if code == 200:
        print("-- 仓库已存在，直接用（分支 %s）" % repo.get("default_branch"))
    else:
        print("-- 创建仓库")
        code, repo = call("POST", API + "/user/repos", {
            "name": REPO,
            "private": False,
            "auto_init": False,
            "description": DESCRIPTION,
            "has_issues": True,
            "has_wiki": False,
        }, timeout=(8, 40))
        if code != 201:
            print("[x] 创建失败 HTTP %s: %s" % (code, str(repo.get("message"))[:250]))
            return 1
        print("   [OK] https://github.com/%s/%s" % (USER, REPO))
        print("   描述：%s" % DESCRIPTION)

    # ---------------------------------------------------------------
    # 关键前置：空仓库**不允许**建 blob
    # ---------------------------------------------------------------
    # 实测 POST /git/blobs 在空仓库上返回
    #   409 "Git Repository is empty."
    # 不是权限问题（同一token 建仓就有权限），是 GitHub 要求
    # 仓库至少有一个提交后才开启对象写入。
    #
    # 对策：用 Contents API 先建一个首次提交（拿 README 打头）。
    # 这一步顺带把正确的描述和 README 落进去，一举两得。
    # 之后再建 blob 就是 201 了。
    code, probe = call("GET", BASE + "/git/ref/heads/main", timeout=(8, 25))
    if code != 200:
        print("-- 空仓库，先建首次提交（README 打头）")
        with open(os.path.join(ROOT, "README.md"), "rb") as f:
            readme = f.read()
        code, d = call("PUT", BASE + "/contents/README.md", {
            "message": "init: 婴配标准雷达\n\n"
                       + DESCRIPTION,
            "content": base64.b64encode(readme).decode("ascii"),
        }, timeout=(8, 40))
        if code not in (200, 201):
            print("[x] 首次提交失败 HTTP %s: %s"
                  % (code, str(d.get("message"))[:250]))
            return 1
        print("   [OK] 首次提交已建立")
    else:
        print("-- 仓库已有提交历史")

    # --- 建 blob -------------------------------------------------------
    files = collect()
    # ★ 两个文件不重建，必须沿用远端版本 ★
    #
    # 1) 工作流：GitHub API 写不进去（404 硬保护），
    #    远端用户手工粘贴的那份才是有效的。
    # 2) **prototype/data.js**：这份数据由 **GitHub Actions 独占写入**。
    #    本机那份是旧快照（时区修复前的版本），一旦推上去，
    #    会把 Actions 刚抓的新数据覆盖掉 ——
    #    实测踩过：10-05 推送代码时顺手带上了本机旧 data.js，
    #    把云端新数据冲回「每日 07:00」旧值，页面跟着回退。
    #
    #    **规则：我只推代码，数据由 Actions 写。** 永不在推送时带 data.js。
    KEEP_REMOTE = {".github/workflows/daily-check.yml", "prototype/data.js"}
    files = [(r, f) for r, f in files if r not in KEEP_REMOTE]
    print("-- 待上传 %d 个文件（data.js 与工作流沿用远端）" % len(files))
    tree = []
    skipped = []          # 单个 blob 失败的记录，不中止整批
    for i, (rel, full) in enumerate(files, 1):
        with open(full, "rb") as f:
            raw = f.read()
        code, d = call("POST", BASE + "/git/blobs",
                       {"content": base64.b64encode(raw).decode("ascii"),
                        "encoding": "base64"})
        #★ 409 不是失败 ★
        # GitHub 对内容相同的 blob 会去重：仓库里已存在同 SHA 的 blob 时，
        # POST /git/blobs 返回 409 Conflict 而不是 201。
        # 首次失败时我把 409 当成真失败，导致整批中止、白跑两分钟。
        # 409 的响应体里就带着那个已存在 blob 的 sha，直接拿来用即可。
        if code == 409 and d.get("sha"):
            code, d = 201, d
        if code != 201:
            # 单个文件失败不再中止整批。
            # 实测：大文件（200+ KB）偶发网络失败，一个文件挂掉
            # 就把整个推送废掉、跑三分钟白费，太不划算。
            # 改成：跳过它、记下来，最后汇总提示。
            # 漏掉的文件下次推送会补上（内容没变，blob 还在）。
            skipped.append((rel, code, str(d.get("message"))[:80]))
            print("   [!] 跳过 %s HTTP %s" % (rel, code))
            continue
        tree.append({"path": rel, "mode": "100644", "type": "blob", "sha": d["sha"]})
        if i % 25 == 0 or i == len(files):
            print("   [%d/%d] blob 就绪" % (i, len(files)))

    # ----------------------------------------------------------------
    # 这两个文件必须沿用远端版本，不能用本地的
    # ----------------------------------------------------------------
    # 关键原因：**tree 用 base_tree 叠加时，新 tree 里没有的路径会被删除**。
    # 所以"从本地文件列表里排除掉它"≠"保留它"—— 恰恰是会把它删掉。
    # 这就是之前工作流连续丢两次、data.js 也丢一次的根因。
    #
    # 正确做法：读远端已有文件的 blob sha，显式填进 tree。
    #
    #  1) .github/workflows/daily-check.yml
    #     GitHub API 写不进去（404 硬保护），远端那份是用户手工粘的。
    #  2) prototype/data.js
    #     数据由 **GitHub Actions 独占写入**。本机那份是旧快照，
    #     推上去会覆盖云端刚抓的新数据。
    for path, label in [
        (".github/workflows/daily-check.yml", "工作流"),
        ("prototype/data.js", "data.js"),
    ]:
        code, ref = call("GET", BASE + "/contents/" + path, timeout=(8, 30))
        if code == 200 and ref.get("sha"):
            tree.append({"path": path, "mode": "100644", "type": "blob",
                         "sha": ref["sha"]})
            print("-- 沿用远端 %-8s sha=%s" % (label, ref["sha"][:12]))
        else:
            print("-- 远端无 %s（HTTP %s），将使用本地版本" % (label, code))
            # 回退：把本地文件补进 tree，避免该文件彻底消失
            full = os.path.join(ROOT, path)
            if os.path.exists(full):
                with open(full, "rb") as f:
                    raw = f.read()
                c2, d2 = call("POST", BASE + "/git/blobs",
                              {"content": base64.b64encode(raw).decode("ascii"),
                               "encoding": "base64"}, timeout=(8, 60))
                if c2 == 201 or (c2 == 409 and d2.get("sha")):
                    tree.append({"path": path, "mode": "100644",
                                 "type": "blob", "sha": d2["sha"]})
                    print("     已用本地版本补入 sha=%s" % d2["sha"][:12])

    if skipped:
        print()
        print("-- %d 个文件上传失败，将跳过（下次推送会自动补上）:" % len(skipped))
        for rel, cd_, msg in skipped:
            print("     %-52s HTTP %s %s" % (rel[:52], cd_, msg))
    if not tree:
        print("[x] 所有 blob 都失败了，中止")
        return 1

    # --- 建 tree / commit ---------------------------------------------
    # ★ 必须分批 ★ 实测一次性提交全部条目会返回 404，
    #   而同样内容分批就正常 —— GitHub 对 tree 条目数有隐式上限，
    #   但它用 404 而不是 413 表达，极难排查。每批 25项。
    print("-- 组装 tree（每批 25 项）")
    base_tree = None
    batches = [tree[i:i + 25] for i in range(0, len(tree), 25)]
    for bi, batch in enumerate(batches, 1):
        body = {"tree": batch}
        if base_tree:
            body["base_tree"] = base_tree
        code, d = call("POST", BASE + "/git/trees", body)
        if code != 201:
            print("   [x] 第 %d 批失败 HTTP %s: %s"
                  % (bi, code, str(d.get("message"))[:200]))
            return 1
        base_tree = d["sha"]
        print("   批次 %d/%d -> %s" % (bi, len(batches), base_tree[:12]))

    print("-- 建 commit")
    code, d = call("POST", BASE + "/git/commits", {
        "message": "feat: 婴配标准雷达初始提交\n\n"
                   "- 每日抓取官方源（CFSA / 国家标准委 / 市场监管总局 / 工信部）\n"
                   "- 数据外置到 data.js，避免每天重新构建整站\n"
                   "- 条数断崖守卫，防源改版导致静默推送坏数据",
        "tree": base_tree})
    if code != 201:
        print("[x] 建 commit 失败 HTTP %s: %s" % (code, str(d.get("message"))[:250]))
        return 1
    commit = d["sha"]
    print("   commit = %s" % commit[:12])

    print("-- 挂到 main 分支")
    code, _ = call("GET", BASE + "/git/ref/heads/main", timeout=(8, 25))
    if code == 200:
        # 分支已存在必须 PATCH；PUT 只用于创建，会 422
        code, d = call("PATCH", BASE + "/git/refs/heads/main",
                       {"sha": commit, "force": True}, timeout=(8, 30))
    else:
        code, d = call("POST", BASE + "/git/refs",
                       {"ref": "refs/heads/main", "sha": commit}, timeout=(8, 30))
    if code not in (200, 201):
        print("[x] 更新分支失败 HTTP %s: %s" % (code, str(d.get("message"))[:250]))
        return 1
    print("   [OK] main -> %s" % commit[:12])

    # --- 验证 ----------------------------------------------------------
    print("-- 验证")
    code, repo = call("GET", BASE, timeout=(8, 25))
    print("   仓库 %s KB，显示名依据的描述：%s"
          % (repo.get("size"), (repo.get("description") or "")[:40]))

    code, c = call("GET", BASE + "/contents/prototype/data.js", timeout=(8, 25))
    print("   数据文件 data.js：%s" % ("已就位" if code == 200 else "缺失"))

    code, wf = call("GET", BASE + "/contents/.github/workflows/daily-check.yml",
                    timeout=(8, 25))
    print("   工作流：%s（需你在网页上传）"
          % ("已存在" if code == 200 else "尚未上传"))

    print()
    print("=" * 64)
    print("剩下一步（只能你在网页做）：")
    print()
    print("1) 上传工作流")
    print("   https://github.com/%s/%s/new/main" % (USER, REPO))
    print("   文件名填： .github/workflows/daily-check.yml")
    print("   内容粘贴 _workflow_paste.txt 的全部内容")
    print("   Commit message 填： add daily check workflow")
    print()
    print("2) 开 Pages")
    print("   https://github.com/%s/%s/settings/pages" % (USER, REPO))
    print("   Build and deployment -> Source 选 GitHub Actions -> Save")
    print("=" * 64)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())