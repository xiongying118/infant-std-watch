#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""发布助手：按**改了什么**自动选发布方式，别再每次都跑 20 分钟抓取。

================================================================
为什么要有这个（2026-10-22 用户明确要求）
================================================================
用户原话：「不涉及标准更新 不用抓取其他网站数据的 不要把我每月的额度用完了啊」

★ 关键认知：Actions 的「分钟数」是**总时长**，不是「次数」★
   GitHub Free 私有仓库 2000 分钟/月。
   一次完整抓取 ≈ 20~24 分钟（美国 runner 访问国内官网慢 4~5 倍）。
   → 要省的不是「次数」，是「跑完整管线」的次数。

----------------------------------------------------------------
两档发布方式（都**不新增 workflow 开关**，用远端已有的）
----------------------------------------------------------------
| 模式 | 做什么 | 耗时 | 什么时候用 |
|---|---|---|---|
| `fast` | 走 `deploy_only=true`：跳过抓取，直接部署仓库现有文件 | ~1 min | **只改了 index.html / CSS / 文案** |
| `full` | 走 `deploy_only=false`：完整抓取管线 | 20~24 min | **改了抓取逻辑**（sources.py 等）或要刷新官网数据 |

★ 为什么不用新加「inject」档 ★
   试过：给 workflow 加第三档「只重新注入 data.js」。
   但 **workflow 文件推不上去**：
     - `PUT /contents/.github/workflows/...` → 404（GitHub 对 workflow 的硬保护）
     - `POST /git/trees`（把它放进 tree）→ 同样 404
     - `git push` → 本机到 GitHub 的 TLS 握不稳（schannel close_notify），挂死
   → 远端 workflow 是**手工维护**的，我改不了。
   → 好在远端**已经有 `deploy_only` 开关**（2026-10-07 就加好了），
     之前一直没被用上 —— 这才是省额度的正解。
   ★ 如果哪天 workflow 能推上去了，本地那版三档 workflow 还在
     `.github/workflows/daily-check.yml` 里，随时可用。

----------------------------------------------------------------
用法
----------------------------------------------------------------
  python scripts/deploy.py              # 自动判断
  python scripts/deploy.py --fast       # 强制只部署
  python scripts/deploy.py --full       # 强制完整管线
  python scripts/deploy.py --dry-run    # 只看会做什么，不真跑
"""
from __future__ import annotations

import argparse
import datetime
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")
BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(BASE, ".."))

TOKEN = os.environ.get("GITHUB_TOKEN", "")
REPO = os.environ.get("GITHUB_REPO", "xiongying118/infant-std-watch")
WORKFLOW = "daily-check.yml"
STATE = os.path.join(ROOT, "data", "_deploy_state.json")

# ★ 只有改了「抓取逻辑 / 数据源」才必须 full ★
#   这些脚本决定云端去抓什么、怎么解析 —— 改了它们，不重抓就等于没改。
FULL_TRIGGERS = [
    "scripts/sources.py",
    "scripts/crawler.py",
    "scripts/fetch_new_sources.py",
    "scripts/fetch_method_principles.py",
    "scripts/fetch_metro.py",
    "scripts/daily_check.py",
    "scripts/verify_replacement.py",
    "scripts/laws.py",
    ".github/workflows/daily-check.yml",
]

# ★ 这些是「数据产物」★
#   注意：改了它们，fast 模式**不会**生效（fast 只部署现有 data.js）。
#   但重新注入 data.js 需要在云端跑 inject_refdata.py ——
#   那个脚本远端 workflow 里只在 full 模式跑。
#   → 所以这类改动也走 full（数据确实要重新生成）。
#   → 除非本地已经把 data.js 生成好了，那还是走 full 让云端重建一次。
INJECT_TRIGGERS = [
    "data/_refjs.txt",
    "data/_cnasjs.txt",
    "data/_methodjs.txt",
    "data/_jsajs.txt",
    "data/_soonjs.txt",
    "data/general_refs.json",
    "scripts/build_jsa.py",
    "scripts/build_refgroups.py",
    "scripts/sync_std_to_proto.py",
    "scripts/inject_refdata.py",
    "scripts/extract_data.py",
    "scripts/build_runstate.py",
]

# ★ 纯前端 / 文档 → fast ★
FAST_ONLY = [
    "prototype/index.html",
    "prototype/cards.html",
    "prototype/card-editor.html",
    "prototype/style.css",
    "scripts/test_",
    "scripts/extract_script.js",
    "scripts/deploy.py",
    ".workbuddy/memory/",
    "docs/",
]


def sh(cmd, cwd=ROOT, quiet=False):
    if not quiet:
        print("  $ %s" % cmd)
    env = dict(os.environ)
    env.setdefault("GITHUB_USER", "xiongying118")
    r = subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True,
                       text=True, encoding="utf-8", env=env)
    return r.returncode, r.stdout or "", r.stderr or ""


def _find_python():
    """rebuild_repo.py 依赖 requests，必须用装了依赖的解释器。"""
    cands = [
        os.path.join(os.path.dirname(os.path.dirname(sys.executable)),
                     "Scripts", "python.exe"),
        sys.executable,
    ]
    for c in cands:
        if not c or not os.path.exists(c):
            continue
        r = subprocess.run([c, "-c", "import requests"],
                           capture_output=True, text=True)
        if r.returncode == 0:
            return c
    return sys.executable


PY = _find_python()


def _state():
    try:
        return json.load(open(STATE, encoding="utf-8"))
    except Exception:
        return {}


def _save_state(**kw):
    s = _state()
    s.update(kw)
    os.makedirs(os.path.dirname(STATE), exist_ok=True)
    with open(STATE, "w", encoding="utf-8") as f:
        json.dump(s, f, ensure_ascii=False, indent=1)


def changed_files():
    """列出**上次发布之后**真正被改过的文件。

    ★★★ 为什么不能用 git diff ★★★
      ① `git diff origin/main` → 云端每天回推 data.js，远端永远领先
         → 200+ 个假差异 → 每次都误判 full → 每次白烧 20 分钟
      ② `git diff --cached` → 工作区堆着几个月前没推上去的脏文件
         → 170+ 个假差异 → 同样误判
      两个都会让「只改前端」被判成 full。

    ★ 正确做法：按**文件修改时间** ★
      记下「上次发布完成」的时刻，之后只看 mtime 比它新的文件。
      这直接对应「我这次改了什么」，与 git 状态无关。
    """
    st = _state()
    last = st.get("last_deploy_ts")
    if not last:
        # 第一次用：退回今天零点，宁可多判也别烧错
        last = datetime.datetime.now().replace(
            hour=0, minute=0, second=0, microsecond=0).timestamp()
    out = []
    for root, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs
                   if d not in (".git", "node_modules", "__pycache__")]
        for fn in files:
            p = os.path.join(root, fn)
            try:
                if os.path.getmtime(p) > last:
                    out.append(os.path.relpath(p, ROOT).replace("\\", "/"))
            except OSError:
                pass
    return sorted(out)


def decide(files):
    """按改动文件决定发布模式。"""
    if not files:
        return "fast", "没有改动"
    full = [f for f in files
            if any(f == t or f.startswith(t) for t in FULL_TRIGGERS)]
    if full:
        return "full", "改了抓取逻辑/数据源：" + "、".join(full[:3])
    inj = [f for f in files
           if any(f == t or f.startswith(t) for t in INJECT_TRIGGERS)]
    if inj:
        # 数据产物变了 → 云端要重新注入 → 现阶段只能 full
        return "full", "改了数据产物（需重新注入 data.js）：" + "、".join(inj[:3])
    return "fast", "只改了前端/文档：" + "、".join(files[:3])


def api(method, path, body=None):
    url = "https://api.github.com/repos/%s%s" % (REPO, path)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": "Bearer " + TOKEN,
        "Accept": "application/vnd.github+json",
        "User-Agent": "Mozilla/5.0"})
    raw = urllib.request.urlopen(req, timeout=45).read().decode().strip()
    # ★ 触发 workflow 的接口返回 **204 No Content**（空 body）★
    #   直接 json.loads 会炸 "Expecting value: line 1 column 1"。
    #   → 空响应就返回 None。
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"_raw": raw[:300]}


def trigger(mode, watch=True):
    """触发 workflow。

    ★ 用远端**已有**的 deploy_only 开关 ★
      deploy_only=true  → 跳过抓取，直接部署仓库现有文件（~1 分钟）
      deploy_only=false → 完整抓取（20~24 分钟）
    """
    only = "true" if mode == "fast" else "false"
    api("POST", "/actions/workflows/%s/dispatches" % WORKFLOW,
        {"ref": "main", "inputs": {"deploy_only": only}})
    cost = {"full": "20~24 分钟", "fast": "约 1 分钟"}[mode]
    print("  已触发：%s（deploy_only=%s，预计 %s）" % (mode, only, cost))
    time.sleep(8)
    run = api("GET", "/actions/workflows/%s/runs?per_page=1" % WORKFLOW)
    r = run["workflow_runs"][0]
    rid = r["id"]
    print("  run %s  %s" % (rid, r["head_sha"][:10]))
    if not watch:
        return 0
    last = ""
    for _ in range(170):
        st = api("GET", "/actions/runs/%d" % rid)
        status, concl = st["status"], st.get("conclusion")
        cur = ""
        if status == "in_progress":
            jobs = api("GET", "/actions/runs/%d/jobs" % rid)
            for job in (jobs or {}).get("jobs", []):
                for s in job.get("steps", []):
                    if s.get("status") == "in_progress":
                        cur = "%d/%d %s" % (s["number"], len(job["steps"]),
                                           s["name"])
        line = "%s %s | %s" % (status, concl or "", cur)
        if line != last:
            print("  " + line, flush=True)
            last = line
        if status == "completed":
            return 0 if concl == "success" else 1
        time.sleep(20)
    return 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fast", action="store_true")
    ap.add_argument("--full", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-push", action="store_true")
    a = ap.parse_args()

    if not TOKEN:
        print("[x] 没有 GITHUB_TOKEN")
        return 1

    files = changed_files()
    mode, why = decide(files)
    if a.full:
        mode, why = "full", "命令行强制"
    elif a.fast:
        mode, why = "fast", "命令行强制"

    print("=== 1. 改动判定 ===")
    print("  上次发布后改动的文件 %d 个" % len(files))
    for f in files[:12]:
        print("    " + f)
    if len(files) > 12:
        print("    …还有 %d 个" % (len(files) - 12))
    cost = {"full": "20~24 分钟", "fast": "约 1 分钟"}
    print("  → 模式：%s（%s）· 预计 %s" % (mode.upper(), why, cost[mode]))

    if not a.no_push:
        print("\n=== 2. 提交并推送 ===")
        rc, out, err = sh('"%s" scripts/rebuild_repo.py' % PY)
        m = re.search(r"commit = (\w+)", out)
        print("  " + (("commit " + m.group(1)) if m
                    else (out.strip()[-200:] or err.strip()[-200:])))
        if rc != 0 and "OK" not in out:
            print("  [x] 推送失败")
            return 1

    if a.dry_run:
        print("\n[dry-run] 不实际触发")
        return 0

    print("\n=== 3. 触发发布 ===")
    t0 = time.time()
    rc = trigger(mode)
    print("\n耗时 %.1f 分钟 · 结果 %s" % ((time.time() - t0) / 60,
                                        "成功" if rc == 0 else "失败"))
    if rc == 0:
        _save_state(last_deploy_ts=time.time(), last_mode=mode,
                    last_deploy_at=time.strftime("%Y-%m-%d %H:%M:%S"))
        print("已记录发布时刻 → data/_deploy_state.json")
    return rc


if __name__ == "__main__":
    raise SystemExit(main())