#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把远端 data.js 里的 JSA 段替换成本地新版本，其余原样保留，然后推上去。

================================================================
为什么需要这个脚本
================================================================
远端 workflow（daily-check.yml）**推不上去**（GitHub 对 workflow 路径有硬保护，
Contents API 404、git trees 也 404），所以只有 `deploy_only` 一个开关：
  true  → fast：只部署仓库现有文件（约 1 分钟），但**不会重建 data.js**
  false → full：完整抓取（20~24 分钟）
用户明确要求别浪费额度：「不涉及标准更新 不用抓取其他网站数据的
不要把我每月的额度用完了啊」。

这次改动要更新 data.js 里的 JSA（18 区 108 步），按 deploy.py 的判定会走 full。

★ 折中方案 ★
  ① 先对比远端与本地 data.js 的**每个键**
     —— 实测只有 JSA（我扩的）和 RUNSTATE（上次抓取时间戳）不同，
        STD/LAWS/ERATA/ALERTS/REFGROUPS 等官方数据**完全一致**；
  ② 用远端 data.js 做底，只把 JSA 段换成新版本
     → RUNSTATE 保留云端最新值，不把「上次检查」时间戳退回去；
  ③ 连同代码一起推到仓库，再走 fast 档部署。
  → 结果与 full 档一致，但只花 1 分钟，不烧抓取额度。

★ 换行符陷阱 ★
  远端 data.js 是 CRLF，本地是 LF。
  → 必须**二进制**读写（open(...,'rb') / 'wb'），
    用文本模式读会把 \r\n 变成 \n，写回去时又变 \r\n，
    结果每个换行变成两个字节 → 文件凭空多 6883 字节、格式全乱。
"""
import base64
import json
import os
import sys
import time
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.environ.get("REPO_NAME", "infant-std-watch")
USER = os.environ.get("GITHUB_USER", "xiongying118")
TOKEN = os.environ.get("GITHUB_TOKEN", "")
API = "https://api.github.com"
BASE = API + "/repos/%s/%s" % (USER, REPO)

REMOTE_CACHE = os.path.join(ROOT, "prototype", "_remote_data.js")
MERGED = os.path.join(ROOT, "prototype", "_merged_data.js")
LOCAL = os.path.join(ROOT, "prototype", "data.js")


def call(method, url, body=None, tries=4):
    data = json.dumps(body).encode() if body is not None else None
    for k in range(tries):
        try:
            req = urllib.request.Request(url, data=data, method=method, headers={
                "Authorization": "Bearer " + TOKEN,
                "Accept": "application/vnd.github+json",
                "User-Agent": "std-watch-jsa-push",
            })
            raw = urllib.request.urlopen(req, timeout=90).read().decode().strip()
            return json.loads(raw) if raw else None
        except Exception as e:
            print("   重试 %d：%s" % (k + 1, str(e)[:70]))
            time.sleep(2)
    return None


def seg(txt, key):
    """取 data.js 里某个键的完整数组段（含方括号）。

    ★ 必须做括号配平，不能用 find(']') ★
      数组里有嵌套对象和字符串，字符串里还可能有 ']'。
    """
    head = "  %s: [" % key
    i = txt.find(head)
    if i < 0:
        return None
    j = txt.find("[", i + len("  %s: " % key))
    depth = 0
    quote = None
    esc = False
    while j < len(txt):
        ch = txt[j]
        if quote:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == quote:
                quote = None
        elif ch in "\"'`":
            quote = ch
        elif ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                return (i, j + 1)
        j += 1
    return None


def main():
    if not TOKEN:
        print("[x] 没有 GITHUB_TOKEN")
        return 1

    # ---- 1. 取远端 data.js（blob API，能拿完整内容）----
    if os.path.exists(REMOTE_CACHE):
        os.remove(REMOTE_CACHE)
    ref = call("GET", BASE + "/contents/prototype/data.js")
    if not ref or "sha" not in ref:
        print("[x] 取远端 data.js 失败")
        return 1
    blob = call("GET", API + "/repos/%s/%s/git/blobs/%s" % (USER, REPO, ref["sha"]))
    raw = base64.b64decode(blob["content"])
    open(REMOTE_CACHE, "wb").write(raw)          # ★ 二进制，不做换行转换 ★
    print("远端 data.js：%d 字节（sha %s）" % (len(raw), ref["sha"][:12]))

    remote = raw.decode("utf-8")
    local = open(LOCAL, "rb").read().decode("utf-8")

    rs = seg(remote, "JSA")
    ls = seg(local, "JSA")
    if not rs or not ls:
        print("[x] 找不到 JSA 段")
        return 1
    print("远端 JSA 段 [%d,%d]  本地 JSA 段 [%d,%d]"
          % (rs[0], rs[1], ls[0], ls[1]))

    # ---- 2. 只替换 JSA 段，其余（RUNSTATE 等）保留远端版本 ----
    merged = remote[:rs[0]] + local[ls[0]:ls[1]] + remote[rs[1]:]
    # 换行符统一成本地的（本地是 LF，GitHub Pages 无关，但保持一致）
    if "\r\n" in local and "\r\n" not in remote:
        merged = merged.replace("\n", "\r\n")
    open(MERGED, "wb").write(merged.encode("utf-8"))
    print("合并后：%d 字节" % len(merged.encode("utf-8")))

    # ---- 3. 校验：合并结果必须只有 JSA 变了，且语法正确 ----
    node_check = (
        "global.window={};"
        "require(%r);"
        "const d=global.window.STDWATCH_DATA;"
        "if(!d||!d.JSA||!d.JSA[0]){console.error('FAIL JSA 缺失');process.exit(1);}"
        "const z=d.JSA[0].zones;"
        "const n=z.reduce((a,x)=>a+(x.steps||[]).length,0);"
        "console.log('OK 分区='+z.length+' 步骤='+n+' RUNSTATE='+d.RUNSTATE.lastRun);"
        "if(z.length<18||n<100){console.error('FAIL 数据不完整');process.exit(1);}"
    ) % MERGED
    r = os.system('node -e "%s"' % node_check.replace('"', '\\"'))
    if r != 0:
        print("[x] 合并后的 data.js 校验失败")
        return 1

    # ---- 4. 推到仓库 ----
    content = open(MERGED, "rb").read()
    sha = call("GET", BASE + "/contents/prototype/data.js")
    cur = sha.get("sha") if sha else None
    body = {
        "message": "data: 更新 JSA 预填内容（18 区 108 步）+ 保留云端 RUNSTATE",
        "content": base64.b64encode(content).decode("ascii"),
        "branch": "main",
    }
    if cur:
        body["sha"] = cur
    res = call("PUT", BASE + "/contents/prototype/data.js", body)
    if not res or "content" not in (res or {}):
        print("[x] 推送失败：%s" % str(res)[:200])
        return 1
    print("已推送 prototype/data.js → %s" % res["content"]["sha"][:12])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
