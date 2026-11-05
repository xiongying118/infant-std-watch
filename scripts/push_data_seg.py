#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把远端 data.js 里的指定段替换成本地新版本，其余原样保留，然后推上去。

================================================================
为什么要这个脚本
================================================================
远端 workflow（daily-check.yml）**推不上去**（GitHub 对 workflow 路径有硬保护），
所以只有 `deploy_only` 一个开关：
  true  → fast：只部署仓库现有文件（约 1 分钟），但**不会重建 data.js**
  false → full：完整抓取（20~24 分钟）
用户明确要求别浪费额度。

★ 本次用途（2026-11-05）★
  改了抓取逻辑（scripts/erata.py 的范围判定）+ 重建了 ERATA 段，
  按 deploy.py 的判定会走 full（20~24 分钟）。
  → 折中：用远端 data.js 做底，只把 **ERATA + ERATASCOPE** 两段换成新版本，
    RUNSTATE 等云端最新值保留，再走 fast 档部署。
  → 结果与 full 档一致，但只花 1 分钟，不烧抓取额度。

★ 换行符陷阱（踩过）★
  远端 data.js 是 CRLF，本地可能是 LF。
  → 必须**二进制**读写（open(...,'rb') / 'wb'），
    用文本模式读会把 \r\n 变成 \n，写回去时又变 \r\n，
    结果每个换行变成两个字节 → 文件凭空多几千字节、格式全乱。

用法：
  GITHUB_TOKEN=xxx python scripts/push_data_seg.py ERATA ERATASCOPE
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
                "User-Agent": "std-watch-seg-push",
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


def insert_seg(txt, key, seg_text):
    """远端没有这个段时，插到锚点段之前。"""
    head = "  %s: [" % key
    if head in txt:
        return None
    anchor = "\n  ERATA: ["
    i = txt.find(anchor)
    if i < 0:
        return None
    return txt[:i + 1] + seg_text + "\n" + txt[i + 1:]


def main():
    if not TOKEN:
        print("[x] 没有 GITHUB_TOKEN")
        return 1
    keys = sys.argv[1:] or ["ERATA", "ERATASCOPE"]
    print("待替换段：%s" % "、".join(keys))

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

    # ---- 2. 逐段替换 ----
    merged = remote
    for key in keys:
        ls = seg(local, key)
        if not ls:
            print("[x] 本地找不到段：%s" % key)
            return 1
        rs = seg(merged, key)
        if rs:
            print("  %s：替换远端段 [%d,%d] ← 本地段 [%d,%d]"
                  % (key, rs[0], rs[1], ls[0], ls[1]))
            merged = merged[:rs[0]] + local[ls[0]:ls[1]] + merged[rs[1]:]
        else:
            # 远端没有这个段 → 整段插入（本地段自带 "]," 收尾）
            head = "  %s: [" % key
            i = local.find(head)
            j = local.find("[", i + len("  %s: " % key))
            depth = 0
            quote = None
            escf = False
            while j < len(local):
                ch = local[j]
                if quote:
                    if escf:
                        escf = False
                    elif ch == "\\":
                        escf = True
                    elif ch == quote:
                        quote = None
                elif ch in "\"'`":
                    quote = ch
                elif ch == "[":
                    depth += 1
                elif ch == "]":
                    depth -= 1
                    if depth == 0:
                        j += 1
                        break
                j += 1
            seg_text = local[i:j]
            # 保证收尾带逗号
            if not seg_text.rstrip().endswith(","):
                seg_text = seg_text.rstrip() + ","
            ni = insert_seg(merged, key, seg_text)
            if ni is None:
                print("[x] 远端没有 %s 段，且找不到插入锚点" % key)
                return 1
            merged = ni
            print("  %s：远端无此段 → 整段插入" % key)

    # 换行符统一成本地的
    if "\r\n" in local and "\r\n" not in merged:
        merged = merged.replace("\n", "\r\n")
    open(MERGED, "wb").write(merged.encode("utf-8"))
    print("合并后：%d 字节" % len(merged.encode("utf-8")))

    # ---- 3. 校验：语法正确 + 目标段内容与本地一致 ----
    check = (
        "global.window={};"
        "require(%r);"
        "const d=global.window.STDWATCH_DATA;"
        "if(!d){console.error('FAIL 数据缺失');process.exit(1);}"
        "const e=d.ERATA||[];"
        "const s=d.ERATASCOPE||[];"
        "const mods=e.filter(x=>x.kind==='MOD').length;"
        "console.log('OK ERATA='+e.length+' 修改单='+mods+' 范围='+s.length"
        "+' 段数='+Object.keys(d).length+' RUNSTATE='+(d.RUNSTATE?d.RUNSTATE.lastRun:'-'));"
        "if(!e.length||!s.length){console.error('FAIL 数据不完整');process.exit(1);}"
    ) % MERGED
    r = os.system('node -e "%s"' % check.replace('"', '\\"'))
    if r != 0:
        print("[x] 合并后的 data.js 校验失败")
        return 1

    # ---- 4. 推到仓库 ----
    content = open(MERGED, "rb").read()
    sha = call("GET", BASE + "/contents/prototype/data.js")
    cur = sha.get("sha") if sha else None
    body = {
        "message": "data: 勘误列表按通则范围收紧 + 新增范围表（2026-11-05）",
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
