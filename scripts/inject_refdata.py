#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 data/_refjs.txt 与 data/_soonjs.txt 注入 prototype/index.html。

★ 为什么单独一个注入脚本 ★
  build_refgroups.py 只负责产出数据，注入页面的逻辑原先散在几个脚本里，
  每次改数据都要手工拼一段注入代码 —— 容易漏、也容易插错位置。
  这里收敛成一个幂等入口：**可重复执行**，跑第二遍结果与第一遍相同。

注入用**注释锚点**定位，不找 "\n];"（踩过：数组里某条记录结尾也是 "\n];"，
用它做区间终点会切坏数据）。
"""
from __future__ import annotations

import io
import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")
BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "..", "data")
PROTO = os.path.join(BASE, "..", "prototype", "index.html")
# ★ 数据已外置到 data.js（2026-10-04），注入目标随之改变★
DATAJS = os.path.join(BASE, "..", "prototype", "data.js")

# 块起止锚点：每次替换 [START, END) 之间的内容
BLOCKS = [
    {
        "name": "REFGROUPS",
        "start": ("/* ===== 通则引用标准（真实数据：从 GB 10765/10766/10767 正文 PDF 提取）\n"
                  "   这批标准不会出现在关键词检索里，但实验室天天在用 —— 规范性引用文件一章列的。\n"
                  "   数据来源：通则正文 PDF → 提取引用标准号 → 回官方源抓元数据（按实施日期取最新版） */\n"
                  "const REFGROUPS = "),
        # ★ 用「下一个块的注释锚点」当终点，不用 "\n]" ★
        #   踩过：REFGROPS 数组体里有 `    ]\n  }` 这种缩进结尾，
        #   找 "\n]" 会命中第一条记录，切出来的区间不完整 ——
        #   实测累积出 3 个多余的 "];"，页面直接 SyntaxError。
        "end_anchor": ("/* ===== 一年内换版（按标准号去重；同一标准被多个检测对象引用时合并来源）====="),
        "file": "_refjs.txt",
    },
    {
        "name": "SOONPOOL",
        "start": ("/* ===== 一年内换版（按标准号去重；同一标准被多个检测对象引用时合并来源）=====\n"
                  "   原先由页面把每个检测对象的 altsSoon 平铺汇总，同一标准号会被登记多次\n"
                  "   （脂肪酸 / 反式脂肪酸两个检测对象指向同一批标准）→ 列表出现重复行。\n"
                  "   改由 build_refgroups.py 预先去重输出，一个标准号一行。===== */\n"
                  "const SOONPOOL = "),
        "end_anchor": "const ERATA = [",
        "file": "_soonjs.txt",
    },
]

REQUIRED = ["const STD = [", "const CATS = [", "const LAWS = [",
            "const REFGROUPS = ", "const SOONPOOL = ", "const ERATA = [",
            "const ALERTS = [", "function renderList", "function renderLaw",
            "function renderRefDigest", "function route("]


def inject(s: str, spec: dict) -> tuple[str, int]:
    """替换 [start+len(start) .. end_anchor) 之间的内容。

    ★ 终点用「下一个块的锚点」而不是找 "\n]" ★
      数组体内部也有 `]`（`{...},\n  ]` 这种缩进结尾），
      找 "\n]" 会命中第一条记录而非整个数组结尾 —— 实测累积出多余 "];"，
      页面直接 SyntaxError。锚点是唯一且稳定的。
    """
    start = spec["start"]
    end_anchor = spec["end_anchor"]
    p = os.path.join(DATA, spec["file"])
    if not os.path.exists(p):
        return s, 0
    raw = io.open(p, encoding="utf-8").read().rstrip("\n")
    if not raw:
        return s, 0
    # 数据源尾部是 "]"，页面里对应 "];"
    body = raw + ";\n\n"

    if start in s:
        a = s.index(start) + len(start)
        b = s.index(end_anchor, a)
        return s[:a] + body + s[b:], 1
    anchor = "const ERATA = ["
    i = s.index(anchor)
    return s[:i] + start + body + s[i:], 1


def _append_datajs_key(s: str, name: str, raw: str) -> tuple[str, int]:
    """data.js 里还没有这个键 → 在对象末尾追加一个新块。

    ★ 为什么要自动长出来 ★
      新增数据键（CNASDOCS / CNASKINDS）时，若要求「先手工在 data.js 里
      加一个空数组占位」，那data.js 既是 Actions 产物又要人先改一遍——
      和 ensure_src11 踩的坑是同一个。这里让管线自己把键建出来。
    """
    # 插在整个 window.STDWATCH_DATA 对象的最末尾（最后一个 "};" 前）
    tail = "\n};\n"
    i = s.rfind(tail)
    if i < 0:
        # 兜底：找最后一个键的结束位置
        j = s.rfind("  },\n")
        if j < 0:
            raise SystemExit("[x] data.js 结构异常，无法追加键 %s" % name)
        i = j
    block = "\n  /* ---- %s ---- */\n  %s: %s,\n" % (name, name, raw)
    return s[:i] + block + s[i:], 1


def inject_datajs(s: str, name: str) -> tuple[str, int]:
    """往 **data.js** 的 `/* ---- NAME ---- */\n  NAME: [...]` 里灌数据。

    ★ 为什么改投data.js ★
      数据自 2026-10-04 外置到 data.js，index.html 里的常量已变成
      `(window.STDWATCH_DATA && window.STDWATCH_DATA.REFGROUPS) || [];`
      本脚本按旧的「内嵌形态」找长注释锚点 → 找不到 → ValueError 中止。
      和 sync_std_to_proto.py 当初空转是同一类病：
      **脚本还停留在架构切换前的假设上。**

      data.js 里的锚点短且稳定：`/* ---- REFGROUPS ---- */`。

    ★ 新键（CNASDOCS/CNASKINDS）首次注入 ★
      data.js 里还没有这个锚点 → 原逻辑会 raise SystemExit 中止整个脚本。
      改成：找不到锚点就在 SRCS 之后插入新块，这样**新增数据键不需要
      先手工改 data.js**，管线自己能长出来（与 ensure_src11 同一个思路）。
    """
    p = os.path.join(DATA, FILES[name])
    if not os.path.exists(p):
        return s, 0
    raw = io.open(p, encoding="utf-8").read().rstrip("\n")
    if not raw:
        return s, 0
    # ★ _cnasjs.txt 里两个数组用 @@KINDS@@ 分隔，按目标键取对应那一段 ★
    if "@@KINDS@@" in raw:
        docs, kinds = raw.split("@@KINDS@@")
        raw = (docs if name == "CNASDOCS" else kinds).strip()
        if not raw:
            return s, 0

    anchor = "  /* ---- %s ---- */" % name
    if anchor not in s:
        return _append_datajs_key(s, name, raw)
    start = s.index(anchor)
    key = "\n  %s: " % name
    i = s.index(key, start) + len(key)
    while s[i] in " \n":
        i += 1
    if s[i] != "[":
        raise SystemExit("[x] %s 的值不是数组" % name)
    depth, end = 0, None
    for k in range(i, len(s)):
        if s[k] == "[":
            depth += 1
        elif s[k] == "]":
            depth -= 1
            if depth == 0:
                end = k + 1
                break
    if end is None:
        raise SystemExit("[x] %s 括号不配平" % name)
    # 数组后面原本就有逗号（对象属性分隔符），**必须保留**。
    # 实测 2026-10-07 两个错法都踩过：
    #   吃掉逗号 → node 报 "Unexpected identifier 'SOONPOOL'"
    #   补两个   → node 报 "Unexpected token ','"
    tail = s[end:]
    lead = len(tail) - len(tail.lstrip(" \n"))
    rest = tail[lead:]
    if rest.startswith(","):
        rest = rest[1:]          # 已有一个逗号，沿用
    return s[:i] + raw + "," + rest, 1


FILES = {"REFGROUPS": "_refjs.txt", "SOONPOOL": "_soonjs.txt",
         # ★ CNAS 独立键（2026-10-07 用户要求从通则引用里移出）★
         #   CNASDOCS 与 CNASKINDS 共用 _cnasjs.txt（中间用 @@KINDS@@ 分隔）。
         "CNASDOCS": "_cnasjs.txt",
         "CNASKINDS": "_cnasjs.txt",
         # ★ 检测方法原理（2026-10-10 用户提供 18 份 docx）★
         "METHODS": "_methodjs.txt"}

# ★ SRCS 也要在这里补，不能靠手改 data.js ★
#   踩过（2026-10-07）：新增 SRC-11 后直接编辑本机 data.js 的 SRCS 段，
#   本机页面显示 11 个源、也对 —— 但 rebuild_repo.py 的 KEEP_REMOTE
#   **故意不推 data.js**（设计原则「只推代码，数据由 Actions 写」），
#   云端跑完管线后 data.js 是 Actions 生成的，SRCS 里没有 SRC-11，
#   线上「数据源」列表仍是 10 个。本机对、线上不对，同一类病。
#   → 凡是「云端会重写的文件里的静态内容」，都必须由管线里的脚本产出。
SRC11_ROW = ('  {code:"SRC-11", run:"SRC-11", n:"CNAS 实验室认可规范", '
             'ok:"正常", real:true,\n'
             '   note:"非国标，标准委检索库不收录 · 认可评审依据"}')


def _srcs_span(s: str) -> tuple[int, int] | None:
    """返回 SRCS 数组的 [start, end) 区间（end 为']' 的后一位）。

    ★ 必须先切出区间再判断，不能全文件搜 'code:"SRC-11"' ★
      RUNSTATE 里也有 `{code:"SRC-11", file:…}` （运行状态按源列条数），
      全文件搜会命中它→ 误判「SRCS 已经有 SRC-11」→ 永远不补。
      实测踩过：本地补好了、云端跑完仍是 10 个源。
    """
    tag = s.find("  /* ---- SRCS ---- */")
    if tag < 0:
        return None
    key = s.find("\n  SRCS: ", tag)
    if key < 0:
        return None
    try:
        i = s.index("[", key)
    except ValueError:
        return None
    depth = 0
    for k in range(i, len(s)):
        if s[k] == "[":
            depth += 1
        elif s[k] == "]":
            depth -= 1
            if depth == 0:
                return i, k + 1
    return None


def ensure_src11(s: str) -> tuple[str, int]:
    """幂等：确保 data.js 的 SRCS 里有 SRC-11 这一行。"""
    span = _srcs_span(s)
    if not span:
        return s, 0
    a, b = span
    body = s[a:b]
    if 'code:"SRC-11"' in body:          # 只在 SRCS 区间内判断
        return s, 0
    return s[:b - 1] + ",\n" + SRC11_ROW + s[b - 1:], 1


def main() -> int:
    s = io.open(DATAJS, encoding="utf-8").read()
    orig = len(s)

    # ★ 必须按 data.js 里的先后顺序替换 ★
    #   REFGROUPS 在 SOONPOOL 之前。若按固定顺序先替SOONPOOL，
    #   它会连带把 REFGROUPS 顶掉；反过来先替 REFGROUPS，
    #   逗号会被吃掉 —— 两种都会让 node 报
    #   "Unexpected identifier 'SOONPOOL'"。
    #   办法：谁在文件里靠前就先替谁。
    #
    #★ CNASDOCS / CNASKINDS 排在最后 ★
    #   这两个键 data.js 里原本没有，走 _append_datajs_key 追加到对象末尾。
    #   放最后是为了不干扰前面「按位置排序替换」的既有逻辑。
    keys = ["REFGROUPS", "SOONPOOL"]
    present = [n for n in keys if ("  /* ---- %s ---- */" % n) in s]
    ordered = sorted(present, key=lambda n: s.index("  /* ---- %s ---- */" % n))
    total = 0
    for name in ordered:
        s, n = inject_datajs(s, name)
        total += n
        print("data.js {}: {}".format(name, "已更新" if n else "跳过（无数据）"))

    for name in ("CNASDOCS", "CNASKINDS", "METHODS"):
        s, n = inject_datajs(s, name)
        total += n
        print("data.js {}: {}".format(name, "已更新" if n else "跳过（无数据）"))

    s, n11 = ensure_src11(s)
    print("data.js SRCS: {}".format("已补 SRC-11" if n11 else "已含 SRC-11"))
    total += n11

    if not total:
        print("没有改动，不写盘")
        return 0

    # 落盘前必须让 node 真解析一遍 —— 只比对字符数证明不了是合法 JS
    ok, err = _node_check(s)
    if not ok:
        print("[x] 注入后 data.js 不是合法 JS，未写盘：\n" + err[:400])
        return 1

    io.open(DATAJS, "w", encoding="utf-8").write(s)
    print("data.js 已更新（%d → %d 字节）" % (orig, len(s)))
    return 0


def _node_check(js_text: str):
    import subprocess
    import tempfile
    node = os.environ.get("STDWATCH_NODE", "node")
    fd, tmp = tempfile.mkstemp(suffix=".js")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(js_text)
        r = subprocess.run([node, "-e",
                            "global.window={};require(process.argv[1]);"
                            "const d=window.STDWATCH_DATA;"
                            "if(!d.REFGROUPS||!d.SOONPOOL)throw new Error('缺块');"
                            # ★ 稀疏数组守卫 ★
                            #   逗号多打一个，JS 里就是「空元素」：
                            #   数组能解析、语法完全合法，但 forEach/map
                            #   拿到的长度比真实元素数多（空洞算 undefined）。
                            #   实测踩过：18 个对象被打成 [obj,undefined,obj,…]
                            #   长度 35、node 校验全绿，只有页面渲染才暴露。
                            #   这里对所有数组键统一查空洞。
                            "for(const k of Object.keys(d)){"
                            "  const v=d[k];"
                            "  if(!Array.isArray(v))continue;"
                            "  if(v.some(x=>x===undefined||x===null))"
                            "    throw new Error(k+' 含空元素（稀疏数组），共'+v.length+'项');"
                            "}"
                            # ★ 断言 REFGROUPS 里不能再有 CNAS ★
                            #   CNAS 已按用户要求移到独立页（CNASDOCS）。
                            #   这里显式拦住「改回去」—— 通则引用页的语义是
                            #   「产品标准正文里引用的文件」，CNAS 不属于，
                            #   混进去会让检测员误以为它是强制检测方法。
                            "if(d.REFGROUPS.some(g=>/CNAS/.test(g.g)))"
                            "  throw new Error('CNAS 不应出现在 REFGROUPS');"
                            "if(d.METHODS&&d.METHODS.length!==18)"
                            "  throw new Error('METHODS 应为 18 份，实际'+d.METHODS.length);",
                            tmp],
                           capture_output=True, text=True, encoding="utf-8")
        return (True, "") if r.returncode == 0 else (False, (r.stdout or "") + (r.stderr or ""))
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass


def _unused_inject(s: str, spec: dict) -> tuple[str, int]:
    """旧的内嵌版注入逻辑，已停用（数据外置到 data.js 后锚点不再存在）。

    保留在此仅作对照参考，**不要调用** —— 它会往 index.html 写，
    而那里已没有 REFGROUPS / SOONPOOL 数组了。
    """
    io.open(PROTO, "w", encoding="utf-8").write(s)
    print("已注入 {} 个数据块".format(total))

    # 幂等验证：再跑一遍内容应完全一致
    s2 = io.open(PROTO, encoding="utf-8").read()
    for spec in BLOCKS:
        p = os.path.join(DATA, spec["file"])
        if not os.path.exists(p):
            continue
        body = io.open(p, encoding="utf-8").read().rstrip("\n") + ";"
        if body not in s2:
            print("✗ 幂等校验失败：{} 内容与数据源不一致".format(spec["name"]))
            return 1
    print("幂等校验通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())
