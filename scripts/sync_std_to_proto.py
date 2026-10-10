#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把真实抓取快照同步到原型的 STD 数组。"""
import json
import io
import os
import re
from collections import Counter

BASE = os.path.dirname(os.path.abspath(__file__))
PROTO = os.path.join(BASE, "..", "prototype", "index.html")
DATAJS = os.path.join(BASE, "..", "prototype", "data.js")


def _strip_wrapper(literal: str) -> str:
    """从 "const XXX = [...]" 里取出纯数组字面量。

    ★ 两个坑都踩过（2026-10-06）★
      1. 别用 lstrip("const ") 之类的链式 strip —— str.lstrip(chars)
         按**字符集**匹配，会连不该吃的字符一起吃。
      2. 别用 rindex("]") 找结尾 —— literal 是从拼接串里截出来的，
         它后面还跟着 REFGROUPS / ERATA / ALERTS / ... 整块数据，
         rindex 会一路找到**全文最后一个 ]**，把中间所有数组
         都当成 STD 的一部分切掉（实测一刀砍掉 87 KB）。

    正确做法：从第一个 '[' 开始，**按括号配平**找对应的 ']'。
    """
    i = literal.index("[")
    depth = 0
    for k in range(i, len(literal)):
        if literal[k] == "[":
            depth += 1
        elif literal[k] == "]":
            depth -= 1
            if depth == 0:
                return literal[i:k + 1]
    raise ValueError("数组括号不配平")


def _replace_literal(js: str, name: str, literal: str) -> str:
    """把 data.js 里 `  /* ---- NAME ---- */\n  NAME: [...]` 整段换掉。

    用「注释锚点 + 括号配平」定位，不找裸 `];`——
    数组记录里也会有 `],`，按裸标记切会切在半条记录上。
    """
    anchor = "  /* ---- %s ---- */" % name
    if anchor not in js:
        raise SystemExit("[x] data.js 里找不到锚点 %s" % anchor)
    start = js.index(anchor)
    key = "\n  %s: " % name
    i = js.index(key, start) + len(key)
    while js[i] in " \n":
        i += 1
    if js[i] != "[":
        raise SystemExit("[x] %s 的值不是数组（实际是 %r）" % (name, js[i:i + 20]))
    depth = 0
    end = None
    for k in range(i, len(js)):
        if js[k] == "[":
            depth += 1
        elif js[k] == "]":
            depth -= 1
            if depth == 0:
                end = k + 1
                break
    if end is None:
        raise SystemExit("[x] %s 数组括号不配平" % name)
    # 数组后面**原本就有逗号**（对象属性分隔符），保留它即可。
    # 之前踩过两次相反的错：
    #   · 把逗号吃掉 → "Unexpected identifier 'REFGROUPS'"（缺分隔符）
    #   · 再补一个 → "Unexpected token ','"（双逗号）
    return js[:i] + _strip_wrapper(literal) + js[end:]


def _node_check(js_text: str, require_key: str = "STD"):
    """用 node 校验这段 data.js 文本能否被解析。返回 (ok, err)。

    require_key=None 时只验语法、不验字段（给单段字面量自检用）。
    """
    import subprocess
    import tempfile
    node = os.environ.get("STDWATCH_NODE", "node")
    fd, tmp = tempfile.mkstemp(suffix=".js")
    body = "global.window={};require(process.argv[1]);"
    if require_key:
        body += ("const d=window.STDWATCH_DATA;"
                 "if(!d.%s)throw new Error('%s 缺失');" % (require_key, require_key))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(js_text)
        r = subprocess.run([node, "-e", body, tmp],
                           capture_output=True, text=True, encoding="utf-8")
        if r.returncode == 0:
            return True, ""
        return False, ((r.stdout or "") + (r.stderr or ""))
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass


def _count_std(js: str) -> int:
    """数现有 data.js 里的 STD 条数（按 `{no:` 记录数，不靠解析）。"""
    lit = _extract_old(js, "STD")
    return lit.count('{no:"') if lit else 0


def _extract_old(js: str, name: str) -> str:
    """取出 data.js 里某个键当前的数组字面量（用于长度核对）。"""
    anchor = "  /* ---- %s ---- */" % name
    if anchor not in js:
        return ""
    i = js.index("\n  %s: " % name, js.index(anchor)) + len("\n  %s: " % name)
    while js[i] in " \n":
        i += 1
    depth = 0
    for k in range(i, len(js)):
        if js[k] == "[":
            depth += 1
        elif js[k] == "]":
            depth -= 1
            if depth == 0:
                return js[i:k + 1]
    return ""


def _write_to_datajs(std_lit: str, laws_lit: str, cats_lit: str,
                      rows, dead) -> int:
    """外置形态：更新 data.js 里的 STD / LAWS / CATS。

    三段字面量由调用方**直接传入**，不在这里做二次字符串切割——
    之前靠 `body.index("\n];\n")` 从拼接串里反解，测试串一旦格式不同
    就 substring not found。传参更直白，也更好测。
    """
    js = io.open(DATAJS, encoding="utf-8").read()
    orig_len = len(js)

    # 切 LAWS 会连带吃掉后面的 CATS（两段在同一区间里），
    # 所以先切后面的 CATS，再切前面的 LAWS，避免越界。
    js2 = _replace_literal(js, "CATS", cats_lit)
    js2 = _replace_literal(js2, "LAWS", laws_lit)
    js2 = _replace_literal(js2, "STD", std_lit)

    for key in ("STD", "LAWS", "CATS"):
        if key not in js2:
            raise SystemExit("[x] 写入后 data.js 里 %s 丢失，未写盘" % key)
    # 长度守卫：不能砍掉与本次替换无关的内容。
    #
    # 逐段算"该变长多少 / 该变短多少"，再和实际净变化比。
    # ★ 不能用 abs(总差) ★
    #   团标恢复那次 STD 变长 11 KB，其他段几乎不动。
    #   如果把「变长」和「变短」都取绝对值再相加，
    #   预期就成了 +11009，而实际净变化是 -11009（因为旧文件本来更大），
    #   一比差两倍 —— 守卫把**正确**的写入拦了（2026-10-06 踩过）。
    #
    # 正确做法：净变化应当等于「变长 - 变短」。
    grew = shrank = 0
    for key, new in (("STD", std_lit), ("LAWS", laws_lit), ("CATS", cats_lit)):
        d = len(new) - len(_extract_old(js, key))
        if d > 0:
            grew += d
        else:
            shrank += -d
    actual_net = len(js2) - orig_len
    expected_net = grew - shrank
    tol = max(300, (grew + shrank) // 10)
    if abs(actual_net - expected_net) > tol:
        raise SystemExit(
            "[x] 长度变化与预期不符（原 {} → 新 {}，实际净变化 {:+}，"
            "预期 {:+}），疑似切到相邻数据块，未写盘".format(
                orig_len, len(js2), actual_net, expected_net))
        raise SystemExit(
            "[x] 长度变化与预期不符（原 {} → 新 {}，实际减少 {}，预期减少 {}），"
            "疑似切到相邻数据块，未写盘".format(
                orig_len, len(js2), actual_delta, expected_delta))

    # 逐个确认**不该动**的数据块原样还在。
    # 这比"总长度不能掉一半"可靠：STD 本身占全文 2/3，
    # 换成小得多的新内容时掉一半以上完全正常（2026-10-06 误报过）。
    untouched = ["REFGROUPS", "ERATA", "ALERTS", "SUBS", "KWS",
                 "SRCS", "HIST", "RUNSTATE", "SOONPOOL",
                 # CNAS 独立键（2026-10-07 新增）。这两个块由
                 # inject_refdata.py 负责写，本脚本只改 STD/LAWS/CATS，
                 # 必须一并断言没被动过 —— 否则区块整体被替换掉时
                 # 只有这里能发现。
                 "CNASDOCS", "CNASKINDS"]
    for key in untouched:
        a = _extract_old(js, key)
        b = _extract_old(js2, key)
        if a != b:
            raise SystemExit("[x] 数据块 {} 被意外改动（{} → {} 字符），未写盘"
                             .format(key, len(a), len(b)))

    # ★ 落盘前必须让 node 真解析一遍 ★
    #   长度和逐块比对都只能证明「没切坏」，证明不了「内容是合法 JS」。
    #   2026-10-06 踩过：内容里的引号被上游转义掉一次，
    #   生成出 `{no:/X/}/n]`，node 报 SyntaxError——
    #   而当时脚本已经把坏文件写进 data.js 了，只能靠 git checkout 回滚。
    ok, err = _node_check(js2)
    if not ok:
        raise SystemExit("[x] 替换后 data.js 不是合法 JS，未写盘：\n" + err[:400])

    # ★ 条数断崖守卫（2026-10-06）★
    #   上面所有检查都只保证「没切坏」，不保证「内容对」。
    #   实测事故：SRC-08（全国团体标准）某次抓取返回 0 条，
    #   快照被写成空 {}，重建data.js 时 33 条团标就此永久消失，
    #   而脚本全程没报任何错。
    #
    #   这跟sanity_guard.py 防的是同一类风险，但层次不同：
    #     sanity_guard —— 抓取完看条数有没有崩（每日管线里跑）
    #     本守卫      —— 重建前看新旧差多少（写盘最后一道）
    #   两道都要有：源崩了守卫会拦住，但源只崩一半（比如团标源挂、
    #   主源正常）时，只有"新旧对比"才看得出来。
    old_n = _count_std(js)
    new_n = len(rows)
    if old_n and new_n < old_n * 0.75:
        raise SystemExit(
            "[x] 条数断崖：现有 {} 条 → 本次只有 {} 条（跌 {}/{}）。"
            "多半是某个源抓空了（团标/公告类源尤其容易返回 0）。\n"
            "    先跑 scripts/crawler.py --run 确认快照，再重跑本脚本。\n"
            "    已写盘的文件未改动。".format(
                old_n, new_n, old_n - new_n, old_n))

    io.open(DATAJS, "w", encoding="utf-8").write(js2)

    hist = os.path.join(BASE, "..", "data", "superseded.json")
    json.dump([{"std_no": n, "replaced_by": r, "title": t} for n, r, t in sorted(dead)],
              io.open(hist, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    print("已写入 data.js：%d 条（现行有效）" % len(rows))
    print("  分类:", dict(Counter(r["cat"] for r in rows)))
    print("  过滤掉失效 %d 条 → data/superseded.json" % len(dead))
    return 0


def load():
    std = {}
    # ★ SRC-06/07/08 是公告与团标类源（2026-10-03 接入）★
    #   SRC-06 市场监管总局公告 —— 食品补充检验方法（BJS）、生产许可审查细则
    #   SRC-07 工信部行业公告     —— 轻工/乳制品相关部级文件
    #   SRC-08 全国团体标准     —— T/CAB 等团标（只作参考，不作判定依据）
    # 三者的 std_no 是「总局公告 2026年第34号」这类**非标准号**，
    # 与 GB 标准号天然不冲突，但走同一套有效性管道也没问题
    # （它们 status 都是"现行"，不会被过滤）。
    for code in ("SRC-05", "SRC-02", "SRC-01", "SRC-06", "SRC-07", "SRC-08"):
        p = os.path.join(BASE, "..", "data", "snapshots", f"{code}_latest.json")
        if not os.path.exists(p):
            continue
        d = json.load(io.open(p, encoding="utf-8"))
        for key, v in d.items():
            no = v.get("std_no")
            if not no:
                continue
            # 同一标准多源时保留字段更全的那条
            if no not in std or len(v) > len(std[no]):
                std[no] = v
    gp = os.path.join(BASE, "..", "data", "general_refs.json")
    if os.path.exists(gp):
        g = json.load(io.open(gp, encoding="utf-8"))
        for no, meta in (g.get("details") or {}).items():
            if no not in std:
                std[no] = dict(meta)
    return std


def esc(s):
    return (str(s or "").replace("\\", "\\\\").replace('"', '\\"')
            .replace("\n", " ").replace("\r", " "))


def audit_validity(std: dict) -> dict:
    """核对有效性与实施状态。

    ★ 用 verify_validity2（跨标准号版）★
    旧版 verify_validity 只在同号内找新版，会漏掉整类替代关系：
        GB 5413.14-2010（维生素B12）  →  GB 5009.285-2022
    不同标准号、不同编号段，测的是同一个东西，源站两边状态都写"现行"。

    ★ 也不能用源站的 state 字段 ★
    实测 sppt 对已被替代的历史版本也标"现行"。
    """
    import sys
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import verify_validity2 as V

    # 全库一起判 —— 跨标准号替代必须看到全库
    allstd = [{"std_no": no, "title": v.get("title", ""),
               "implement_date": v.get("implement_date", ""),
               "publish_date": v.get("publish_date", "")}
              for no, v in std.items()]
    res = V.audit(allstd)
    return {r["std_no"]: {
        "validity": r["validity"],
        "newer": r.get("newer") or "",
        "implement_state": r["implement_state"],
        "implement_desc": r["implement_desc"],
    } for r in res}


# ★ 二级细分规则独立在 detect_rules.py ★
#  之前内嵌在 sync 里，规则顺序被反复追加搞乱过（117 条落到其它检测方法）。
#  拆出去之后：规则集中一处、每条有注释说明为什么在这个位置、
#  改完必须跑 test_detect_rules.py 的 83 条回归用例。
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from detect_rules import sub_category      # noqa: E402


def _laws_js() -> str:
    """把法律法规与体系清单输出成 JS 数组（内嵌形态用，仍保留给旧路径）。"""
    laws_lit, cats_lit = _laws_literals()
    return ("\n/* ===== 体系标准与法律法规（静态清单，人工核对，"
            "仅给官方查询入口，不存条文）===== */\nconst LAWS = "
            + laws_lit + "\n/* 一级分类：按标准性质分；每个一级下还有二级细分"
              "（规则见 detect_rules.py） */\nconst CATS = "
            + cats_lit + "\n")


def _laws_literals():
    """返回 (LAWS 数组字面量, CATS 数组字面量)，两者都**不带** `const X =` 前缀。

    拆成独立函数是为了让外置路径能直接拿到两段纯数组，
    不必再从拼接串里反解位置。
    """
    import laws
    rows = []
    for x in laws.ALL:
        rows.append(
            '  {{no:"{no}",title:"{t}",cat:"sys",sub:"{k} · {s}",'
            'status:"现行有效",impState:"日期待定",newer:"",pub:"{pub}",imp:"",dead:"",'
            'replace:"",by:"",url:"{url}",dl:false,level:"{lv}",org:"{org}",'
            'note:"{note}",scene:"{scene}"}},'.format(
                no=esc(x["no"]), t=esc(x["org"] + " " + x["no"]),
                k=esc(laws.KIND_NAMES.get(x["kind"], x["kind"])),
                s=esc(x["scene"]), lv=esc(x["level"]), pub=esc(x.get("pub") or ""),
                url=esc(x["url"]), org=esc(x["org"]), note=esc(x["note"]),
                scene=esc(x["scene"])))
    laws_lit = "[\n" + "\n".join(rows) + "\n]"
    cats_lit = ("[\n"
                '  {k:"all",name:"全部"},\n'
                '  {k:"product",name:"产品标准"},\n'
                '  {k:"test",name:"检测标准"},\n'
                '  {k:"prod",name:"生产标准"},\n'
                '  {k:"sys",name:"体系标准"},\n'
                '  {k:"assoc",name:"关联标准"}\n]')
    return laws_lit, cats_lit


def main():
    std = load()
    audit = audit_validity(std)

    # ★ 清单只放"现行有效"的 ★
    # 用户要求：标准清单里失效的不要放上来了。
    # 失效版本继续留在库里做 diff 基准（改了才知道），但不再进清单 ——
    # 清单是给检测员"现在该执行哪一版"用的，塞满已废止版本反而会照着错版本做。
    dead = []
    rows = []
    for no, v in std.items():
        a = audit.get(no, {})
        validity = a.get("validity") or (v.get("status") or "现行")
        if validity in ("已被替代", "已废止"):
            dead.append((no, a.get("newer") or "", v.get("title") or ""))
            continue
        cat = v.get("category") or "assoc"
        rows.append({
            "no": no,
            "title": v.get("title") or "",
            "cat": cat,
            "sub": sub_category(no, v.get("title") or "", cat),
            "status": validity,
            "impState": a.get("implement_state") or "日期待定",
            "newer": a.get("newer") or "",
            "pub": v.get("publish_date") or "",
            "imp": v.get("implement_date") or "",
            "url": v.get("official_url") or "https://sppt.cfsa.net.cn:8086/db",
        })
    rows.sort(key=lambda x: (x["cat"], x["sub"], x["no"]))

    lines = []
    for r in rows:
        lines.append(
            '  {{no:"{no}",title:"{title}",cat:"{cat}",sub:"{sub}",status:"{st}",'
            'impState:"{impState}",newer:"{newer}",pub:"{pub}",imp:"{imp}",dead:"",'
            'replace:"",by:"",url:"{url}",dl:false,chg:"",why:"",acts:[]}},'.format(
                no=esc(r["no"]), title=esc(r["title"]), cat=r["cat"],
                sub=esc(r["sub"]),
                st=esc(r["status"]), impState=esc(r["impState"]),
                newer=esc(r["newer"]), pub=r["pub"], imp=r["imp"], url=r["url"]))
    std_lit = "[\n" + "\n".join(lines) + "\n]"
    laws_lit, cats_lit = _laws_literals()
    body = ("const STD = " + std_lit + "\n"
            "/* ===== 体系标准与法律法规（静态清单，人工核对，"
            "仅给官方查询入口，不存条文）===== */\nconst LAWS = " + laws_lit
            + "\n/* 一级分类：按标准性质分；每个一级下还有二级细分"
              "（规则见 detect_rules.py） */\nconst CATS = " + cats_lit + "\n")

    # ★ 数据外置（2026-10-04起）★
    #   index.html 里的 `const STD = [...]` 已变成
    #   `const STD = (window.STDWATCH_DATA && window.STDWATCH_DATA.STD) || [];`
    #   真数据在 prototype/data.js 里。
    #   本脚本原来只认内嵌形态，遇到外置形态会：
    #     · 找不到 "const STD = [" → 走"首次注入"分支
    #     · 往页面里塞一份**第二份**字面量 STD
    #     · 然后完整性守卫发现 const CATS/ERATA 等（外置后是 || [] 形态，
    #       不含 `[`）不在 → 中止
    #   表现出来就是「改了分类规则重跑也没效果」——
    #   2026-10-06 用户截图对比发现"生产规范 5 本只显示 2 本"，
    #   根因就是它一直没写到真正的数据文件。
    #   现在：外置形态下改 data.js 里的 STD / LAWS / CATS 三段。
    #   判据用"window.STDWATCH_DATA" 全文出现，而不是只看开头 400 字——
    #   data.js 头部有约 580 字的长注释（生成命令、为什么外置等），
    #   限定开头会判错形态（踩过）。
    if os.path.exists(DATAJS) and \
            "window.STDWATCH_DATA" in io.open(DATAJS, encoding="utf-8").read():
        return _write_to_datajs(std_lit, laws_lit, cats_lit, rows, dead)

    s = io.open(PROTO, encoding="utf-8").read()
    # ★ 替换区间必须按"明确的注释锚点"切，不能找 "\n];" ★
    #   两次踩坑：
    #     1) s.index("\n];") 命中数组里某条记录的结尾 → 每跑一次多留一段旧数据，
    #        实测累积出 7 份 const LAWS，页面报 Identifier 已声明。
    #     2) 改用锚点后手工清理重复块，区间切太宽，把中间的
    #        const CATS 一起切掉了 → 标准清单整页空白（renderList 报
    #        "CATS is not defined"）。所以下面必须做完整性守卫。
    anchor = "/* ===== 通则引用标准"
    if "const STD = [" in s:
        a = s.index("const STD = [")
        b = s.index(anchor, a)
    else:
        # 首次注入：插在通则引用标准注释之前
        a = b = s.index(anchor)
    new_html = s[:a] + body + "\n" + s[b:]

    # ---- 完整性守卫：切区间可能切掉邻居，先验后写 ----
    required = ["const STD = [", "const CATS = [", "const LAWS = [",
                "const REFGROUPS = ", "const ERATA = [", "const ALERTS = [",
                "const SUBS = [", "const KWS = [", "const SRCS = [",
                "const LOGS = [", "const HIST = [",
                "function renderList", "function renderLaw", "function catName",
                "function route("]
    missing = [k for k in required if k not in new_html]
    if missing:
        print("✗ 中止：替换后缺少 {} —— 不写盘".format("、".join(missing)))
        print("  原文件保持不变。请检查替换区间。")
        raise SystemExit(1)

    io.open(PROTO, "w", encoding="utf-8").write(new_html)

    # 失效清单另存，供"标准换版历史"查询，不进界面
    hist = os.path.join(BASE, "..", "data", "superseded.json")
    json.dump([{"std_no": n, "replaced_by": r, "title": t} for n, r, t in
               sorted(dead)],
              io.open(hist, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    print("已写入 {} 条（现行有效）到原型".format(len(rows)))
    print("  分类:", dict(Counter(r["cat"] for r in rows)))
    print("  实施状态:", dict(Counter(r["impState"] for r in rows)))
    print("  过滤掉失效 {} 条 → data/superseded.json".format(len(dead)))
    for n, r, t in sorted(dead)[:6]:
        print("    {} → {}".format(n, r or "（无替代者）"))


if __name__ == "__main__":
    main()
