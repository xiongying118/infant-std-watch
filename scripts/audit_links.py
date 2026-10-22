#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""全量核对标准清单里每一条的「官方查询」链接（2026-10-21）。

================================================================
这一版必须用 POST 判定，因为 cfsa 的 GET 是假成功
================================================================
sppt.cfsa.net.cn 对任何 GET 都返回 200，但 body 是一个
「自动提交表单」的空壳：

    window.onload = document.getElementById("form1").submit()
    <form method="post" action="/db"><input name="task" value="index"></form>

也就是说过 GET 只能拿到 597 字符的空壳，真页面要浏览器执行 JS 再POST。
**「返回 200」完全不能用来判断链接有效性** —— 这是本次踩的最大坑。

真详情页：POST /db?type=2&guid=<ID>，body task=goto
    实测真 ID → 9590 字符，含标准号/名称/实施日期/下载按钮
    实测假 ID → 7439 字符，明显不同（可据此判定有效性）

其他站点（samr.gov.cn、ttbz.org.cn）走 GET：
    ttbz 是 hash 路由 SPA，服务端只回骨架页（实测 52 条长度全为 241430），
    不能因为静态抓不到内容就判成「只到首页」—— 浏览器里是能正常打开的。

分档：
  DIRECT 直达该标准详情页（URL 因标准而异 + 内容能对上）
  SPA   hash 路由单页应用，需浏览器执行 JS（链接有效）
  LIST  只到列表/栏目页，URL 与其它标准共用 —— 检测员点进去还得自己再搜
  BAD   连接失败或 4xx/5xx
"""
from __future__ import annotations

import http.cookiejar
import io
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor

sys.stdout.reconfigure(encoding="utf-8")

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(BASE, ".."))
DATAJS = os.path.join(ROOT, "prototype", "data.js")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")
TIMEOUT = 25

# 共享一个 session：cfsa 需要 cookie，且并发下各建一次太慢
_CJ = http.cookiejar.CookieJar()
_OP = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(_CJ))
_OP.addheaders = [("User-Agent", UA),
                  ("Accept-Language", "zh-CN,zh;q=0.9")]


def _get(url):
    try:
        r = _OP.open(url, timeout=TIMEOUT)
        return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception as e:                        # noqa: BLE001
        return "ERR:" + type(e).__name__, ""


def _post(url, data):
    body = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(
        url, data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"})
    try:
        r = _OP.open(req, timeout=TIMEOUT)
        return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception as e:                        # noqa: BLE001
        return "ERR:" + type(e).__name__, ""


def norm(s) -> str:
    return re.sub(r"\s+", "", (s or "")).upper()


def load_std() -> list[dict]:
    import subprocess
    import tempfile
    fd, tmp = tempfile.mkstemp(suffix=".js")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write("global.window={};require(%r);" % DATAJS)
        f.write("console.log(JSON.stringify(window.STDWATCH_DATA.STD));")
    node = os.environ.get("STDWATCH_NODE", "node")
    r = subprocess.run([node, tmp], capture_output=True, text=True,
                       encoding="utf-8")
    os.remove(tmp)
    if r.returncode != 0:
        raise SystemExit("[x] node 解析 data.js 失败：\n" + r.stderr[:400])
    return json.loads(r.stdout)


def check_url(u: str, recs: list[dict]) -> tuple[str, str]:
    """判定一个 URL。返回 (verdict, note)。"""
    # ---- cfsa：必须 POST，GET 是假成功 ----
    if "sppt.cfsa.net.cn" in u:
        if re.search(r"[?&]guid=[0-9A-Fa-f-]{8,}", u):
            st, b = _post(u, {"task": "goto"})
            if isinstance(st, str):
                return "BAD", st
            if not (200 <= st < 300):
                return "BAD", "HTTP %d" % st
            key = norm(recs[0].get("no"))
            title = re.sub(r"\s+", "", recs[0].get("title") or "")
            flat = norm(b)
            if (key and key in flat) or (title and title[:8] in flat):
                return "DIRECT", "直达该标准详情页（%d 字符）" % len(b)
            if len(b) < 1500 and "form1" in b:
                return "BAD", "返回自动提交空壳页（未真正加载）"
            return "LIST", "未落到该标准（%d 字符）" % len(b)

        # ★ 检索深链（无 guid 但带 keyword）★
        # 官方_url_for() 给「库里没有 guid」的标准生成这种链接，
        # 浏览器打开会直接列出该标准的检索结果 —— 仍强于落到首页。
        m = re.search(r"[?&]keyword=([^&]+)", u)
        if m:
            st, b = _get(u)
            if isinstance(st, str):
                return "BAD", st
            if not (200 <= st < 300):
                return "BAD", "HTTP %d" % st
            kw = norm(urllib.parse.unquote(m.group(1)))
            flat = norm(b)
            title = re.sub(r"\s+", "", recs[0].get("title") or "")
            if (kw and kw in flat) or (title and title[:8] in flat):
                return "DIRECT", "站内检索深链，页面已列出该标准"
            return "LIST", "检索页未出现该标准"

        # 只到列表首页
        return "LIST", "只到列表首页（URL 无 guid 也无 keyword）"

    # ---- JS 渲染型页面：服务端只回骨架，列表由浏览器执行 JS 后加载 ----
    #   ttbz.org.cn  #/standardDetail/xxx  → hash 路由 SPA
    #   jjg.spc.org.cn 高级检索页            → 列表由 JS 异步加载
    #   两者在浏览器里都能正常看到内容，静态抓取看不到不代表链接有问题。
    if "/#/" in u:
        st, b = _get(u)
        if isinstance(st, str):
            return "BAD", st
        if not (200 <= st < 300):
            return "BAD", "HTTP %d" % st
        return "SPA", "hash 路由单页应用，需浏览器执行 JS（%d 字符骨架）" % len(b)

    if "jjg.spc.org.cn" in u:
        st, b = _get(u)
        if isinstance(st, str):
            return "BAD", st
        if not (200 <= st < 300):
            return "BAD", "HTTP %d" % st
        return "SPA", ("国家计量技术规范全文公开系统，检索结果由 JS 加载"
                      "（%d 字符骨架，浏览器里可正常输入编号检索）" % len(b))

    # ---- 其它：普通 GET ----
    st, b = _get(u)
    if isinstance(st, str):
        return "BAD", st
    if not (200 <= st < 300):
        return "BAD", "HTTP %d" % st
    if len(recs) > 1:
        return "LIST", "%d 条标准共用此 URL（列表/栏目页）" % len(recs)
    key = norm(recs[0].get("no"))
    title = re.sub(r"\s+", "", recs[0].get("title") or "")
    flat = norm(b)
    if (key and key in flat) or (title and title[:10] in flat):
        return "DIRECT", "直达该标准"
    return "LIST", "单条链接，但页面未出现该标准号/名称"


def main() -> int:
    rows = load_std()
    print("标准清单共 %d 条\n" % len(rows))

    by_url: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_url[(r.get("url") or "").strip()].append(r)
    print("URL 去重后 %d 个\n" % len([u for u in by_url if u]))

    # 先建 cfsa 会话
    try:
        _OP.open("https://sppt.cfsa.net.cn:8086/db?task=index", timeout=30).read()
        print("cfsa 会话已建立\n")
    except Exception as e:                        # noqa: BLE001
        print("cfsa 会话建立失败：%s\n" % e)

    out = []
    for u, recs in by_url.items():
        if not u:
            for r in recs:
                out.append({"no": r["no"], "title": r.get("title", ""),
                            "url": "", "verdict": "BAD", "note": "无链接"})
            continue
        v, note = check_url(u, recs)
        for r in recs:
            out.append({"no": r["no"], "title": r.get("title", ""),
                        "url": u, "verdict": v, "note": note})

    order = {"DIRECT": 0, "SPA": 1, "LIST": 2, "BAD": 3}
    out.sort(key=lambda x: (order[x["verdict"]], x["url"], x["no"]))
    io.open(os.path.join(ROOT, "data", "link_audit.json"), "w",
            encoding="utf-8").write(
        json.dumps(out, ensure_ascii=False, indent=1))

    c = Counter(x["verdict"] for x in out)
    print("=== 核对结果（共 %d 条）===" % len(out))
    print("  DIRECT 直达该标准       %4d" % c["DIRECT"])
    print("  SPA   hash路由需浏览器  %4d" % c["SPA"])
    print("  LIST  只到列表/栏目页    %4d" % c["LIST"])
    print("  BAD   链接失效          %4d" % c["BAD"])

    for tag, label in (("BAD", "失效"), ("LIST", "只到列表页"),
                       ("SPA", "hash 路由")):
        sel = [x for x in out if x["verdict"] == tag]
        if not sel:
            continue
        print("\n=== %s（%d 条）===" % (label, len(sel)))
        grouped = defaultdict(list)
        for x in sel:
            grouped[(x["url"], x["note"])].append(x["no"])
        for (u, n), nos in sorted(grouped.items(), key=lambda kv: -len(kv[1]))[:12]:
            print("  %s" % (u or '(空)'))
            print("     %s · %d 条：%s%s"
                  % (n, len(nos), "、".join(nos[:4]),
                     "…" if len(nos) > 4 else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())