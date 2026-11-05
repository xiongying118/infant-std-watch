#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成 prototype/data.js 的 ERATA 段（标准勘误 + 标准修改单）——来自真实抓取数据。

★ 2026-11-05 重写：适配外置式 data.js ★
  原版是给「内嵌式 index.html」写的（找 `const ERATA = [`、写 index.html），
  但数据早就外置成 data.js 了 → 这个脚本**每天都跑失败**
  （ValueError: substring not found），而且它不在 daily_check 流程里。
  结果：页面上的勘误列表永远停在 2026-11-03 那 15 条。
  用户原话：「特别是通则引用标准里的更新、勘误修改每天一定要抓取」

★ 范围限定（用户要求 2026-10-03，2026-11-05 补充）★
  只保留通则引用标准里的勘误。
  2026-11-05 补充：「只要现行版本有效，全部都要」
  → 范围判定以 refscope.json 为准（通则引用 + 传递闭包 + 引用页现行执行标准），
    范围内的一条不丢（含 low 级文字性修正，页面要能查全）；
    推提醒时才丢 low 级（erata.build_erata_alerts 的 include_low 参数）。

★ 为什么必须带上 std_name 和 erataDate ★
  用户要求：把标准名称和勘误时间写出来。理由很实在 ——
    · 没有标准名，只看到「GB 5009.7-2016 3.4.4」，
      不知道测的是什么，出报告时无法向委托方解释依据哪一版
    · 没有勘误时间，不知道这个错误是 2018 年还是上周发现的，
      判断"我手上的作业文件是不是照着错版本写的"要靠猜

★ 为什么加了"修改单"这一类（2026-10-03 修正）★
  用户反馈"杂质度就有更新的了，你都没有"。查证结果：
  GB 5413.30-2016《乳和乳制品杂质度的测定》第1号修改单，2026-08-18 发布、
  自批准之日起实施。而 CFSA 的「标准勘误」专库（num_tn=4）**根本不收录修改单**
  —— 修改单是全库检索（num_tn=99）里的独立文档。只查勘误库 = 这类变更 100% 漏抓。

  改法：sources.CfsaSpptAdapter.amendments_with_summary() 抓修改单 +
  官方解读材料正文，变更要点从解读材料取。

分级沿用 erata.py 的判定（按"改了是否影响结果"，不按改了多少字）。
修改单一律 high：自批准之日起实施，没有过渡期。
"""
from __future__ import annotations

import io
import json
import os
import re
import sys
import urllib.parse
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8")
import erata as E                                            # noqa: E402

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "..", "data")
PROTO = os.path.join(BASE, "..", "prototype", "data.js")

# 外置式 data.js 里必须存在的锚点（缺任何一个都不写盘，防止把文件写坏）
REQUIRED = ["STD: [", "REFGROUPS: [", "ERATA: [", "ALERTS: [", "KWS: ["]


def esc(s) -> str:
    """转义成 JS 字符串字面量内容。"""
    s = str(s or "")
    s = s.replace("\\", "\\\\").replace('"', '\\"')
    s = s.replace("\r", " ").replace("\n", " ")
    return s


def CFSA_ERATA_URL(no: str) -> str:
    """官方「标准勘误」tab 所在的人可读检索页。

    ★ 为什么不是 indexSearch 接口 ★
      `?task=indexSearch&...` 返回的是 **JSON**（浏览器打开只有 41 字符纯文本，
      什么都看不出来，实测过）；`?task=index` 才是那个平台页面
      （26438 字符，顶部有「标准文本 / 标准勘误 / 标准解读 / 全部标准」几个 tab，
      用户 2026-11-05 截图指的就是「标准勘误」那个 tab）。
    → 链接指到检索页，用户点进去搜一下标准号就能看到官方那张勘误表。
    """
    return ("https://sppt.cfsa.net.cn:8086/db?task=index&keyword="
            + urllib.parse.quote(str(no or "").replace(" ", "")))


def _mod_name(mods: list[dict], no: str, mod_no) -> str:
    for m in mods:
        if m.get("std_no") == no and str(m.get("mod_no")) == str(mod_no):
            return m.get("std_name") or ""
    return ""


def _std_name(x: dict) -> str:
    e = x.get("erata") or {}
    return e.get("std_name") or x.get("std_name") or ""


def _std_titles() -> dict[str, str]:
    """从 data.js 的 STD 库取「标准号 → 标准名」，用来补勘误条目缺失的 std_name。

    ★ 为什么需要（2026-11-05）★
      官方勘误记录里，STANDARD_NAME 字段**有 187 条中的 134 条是空的**
      （实测补完后仍有 53 条显示「（标准名待补）」）。
      但同一个标准在 STD 库（标准清单）里是有名字的 ——
      官方那 187 条是「勘误专库」的记录，字段本身就不全。
      所以：条目生成时用 STD 库补名，用户看到的就是完整标准名。
    """
    out: dict[str, str] = {}
    p = os.path.join(BASE, "..", "prototype", "data.js")
    if not os.path.exists(p):
        return out
    try:
        # ★ 必须归一换行符 ★
        #   data.js 是 CRLF，直接找 "\n  STD: [\n" 匹配不到（实际是 \r\n 开头）
        txt = io.open(p, encoding="utf-8", newline="").read().replace("\r\n", "\n")
    except Exception:                              # noqa: BLE001
        return out
    # 逐条扫 STD 段，提取 no 与 title/title_cn
    m = re.search(r"\n  STD: \[\n", txt)
    if not m:
        return out
    end = txt.find("\n],", m.start())
    if end < 0:
        end = len(txt)
    seg = txt[m.start():end]
    cur: dict[str, str] = {}
    for mm in re.finditer(r'no:"([^"]+)"', seg):
        cur["no"] = mm.group(1)
    # STD 段的字段名不固定，逐条对象提取更稳
    for obj in re.finditer(r"\{[^}]*\}", seg):
        t = obj.group(0)
        no_m = re.search(r'no:"([^"]+)"', t)
        if not no_m:
            continue
        no = no_m.group(1)
        # data.js 的 STD 段字段名是**不带引号**的（no:"...",title:"..."）
        name = ""
        for key in ("title", "stdName", "name", "title_cn"):
            km = re.search(r"(?:^|[,\{])" + key + r':"([^"]*)"', t)
            if km and km.group(1):
                name = km.group(1)
                break
        if name:
            k = E._refkey(no)
            out.setdefault(k, name)
    return out


def load_items() -> list[dict]:
    """勘误 + 修改单 → 统一结构的列表。

    数据来源（三个，按可靠性排序）：
      1. data/snapshots/erata_latest.json —— crawler.py 每次抓取都写的快照（最新最全）
      2. data/_erata_fresh.json —— crawler.py 抓取时另存的一份
      3. data/_mods.json —— 修改单
    全部按 include_low=True 收（页面要查得全）。
    """
    items: list[dict] = []
    seen: set[str] = set()

    # ---- 1) 修改单 ----
    mods_path = os.path.join(DATA, "_mods.json")
    mods: list[dict] = []
    if os.path.exists(mods_path):
        mods = json.load(io.open(mods_path, encoding="utf-8"))
        for a in E.build_mod_alerts(mods):
            e = a["erata"]
            key = f"{a['std_no']}|MOD|{e.get('modNo')}"
            if key in seen:
                continue
            seen.add(key)
            # ★ 修改单官方页：staticPages/<GUID>.html（GET 可开，实测 200）★
            #   勘误记录**不能**用它 —— 实测 122 条勘误的 staticPages 全 404
            #   （勘误是另一种文档，staticPages 只对修改单有效）。
            murl = a.get("official_url") or ""
            if murl and "type=2&guid=" in murl:
                murl = ""
            if not murl:
                murl = "https://sppt.cfsa.net.cn:8086/db?task=index&keyword=" \
                       + urllib.parse.quote(str(a["std_no"]).replace(" ", ""))
            items.append({
                "no": a["std_no"],
                "stdName": _mod_name(mods, a["std_no"], e.get("modNo")),
                "erataDate": e.get("date") or "",
                "impDate": e.get("implement_date") or "",
                "sec": e.get("section") or "",
                "lvl": "high",
                "kind": "MOD",
                "modNo": e.get("modNo") or 1,
                "reason": e.get("reason") or "",
                "before": "",
                "after": e.get("after") or "",
                "why": a.get("why_matters") or "",
                "acts": a.get("actions") or [],
                "url": murl,
            })

    # ---- 2) 勘误 ----
    src: list[dict] = []
    snap = os.path.join(DATA, "snapshots", "erata_latest.json")
    if os.path.exists(snap):
        for it in json.load(io.open(snap, encoding="utf-8")):
            got = E.build_erata_alerts([it], include_low=True)
            if got:
                src.append(got[0])
    fresh = os.path.join(DATA, "_erata_fresh.json")
    if os.path.exists(fresh):
        for a in E.build_erata_alerts(json.load(io.open(fresh, encoding="utf-8")),
                                      include_low=True):
            src.append(a)
    # 旧的 prototype_data.json（如果有）也并进来
    pd = os.path.join(DATA, "prototype_data.json")
    if os.path.exists(pd):
        d = json.load(io.open(pd, encoding="utf-8"))
        for x in (d.get("erata") or []):
            src.append(x)

    # 标准名补全表（从 STD 库来）
    titles = _std_titles()

    for x in src:
        if not x:
            continue
        e = x.get("erata") or {}
        no = x.get("std_no", "")
        if not no or not E.in_ref_scope(no):
            continue
        # ★ 去重键要带内容指纹（2026-11-05）★
        #   官方对**同一章节**可能有多条不同勘误（实测 GB 5009.257-2016 表A.1 有 3 条、
        #   GB 5009.235-2016 第 12 章有 3 条），它们的 before/after 各不相同。
        #   原来只用「标准号+日期+章节」去重 → **误当重复丢掉 2 条真实勘误**。
        #   → 加上 before/after 的指纹，才是真正的去重。
        fp = str(e.get("before") or "")[:60] + "|" + str(e.get("after") or "")[:60]
        key = f"{no}|ERATA|{e.get('date')}|{e.get('section')}|{fp}"
        if key in seen:
            continue
        seen.add(key)
        sname = _std_name(x)
        if not sname:
            # 官方勘误记录里 STANDARD_NAME 大量为空 → 用 STD 库补
            sname = titles.get(E._refkey(no), "")
        items.append({
            "no": no,
            "stdName": sname,
            "erataDate": e.get("date") or "",
            "impDate": "",
            "sec": e.get("section") or "",
            "lvl": x.get("level") or "mid",
            "kind": "ERATA",
            "modNo": 0,
            "reason": e.get("reason") or "",
            "before": e.get("before") or "",
            "after": e.get("after") or "",
            "why": x.get("why_matters") or "",
            "acts": x.get("actions") or [],
            # ★ 勘误记录没有可直开的静态页（实测 staticPages 对勘误全 404）★
            #   → 指向官方「标准勘误」tab 的检索结果页（GET 可开，
            #     页面直接列出该标准的勘误记录表，正是用户截图指的那个位置）。
            "url": CFSA_ERATA_URL(no),
        })
    return items


def render(items: list[dict]) -> str:
    """渲染成 data.js 的 ERATA 段（缩进 2 空格，跟 data.js 其它段一致）。"""
    lines = ["  ERATA: ["]
    for x in items:
        acts = ",".join('"%s"' % esc(a) for a in (x.get("acts") or []))
        # ★ 用 .replace 而不是 .format ★
        #   JS 对象字面量里全是 { }，.format 会把它们当占位符解析 → 崩。
        tpl = ('  {no:"__no__",stdName:"__sn__",erataDate:"__dt__",'
               'impDate:"__imp__",sec:"__sec__",lvl:"__lvl__",'
               'kind:"__kind__",modNo:__mod__,reason:"__rs__",'
               'before:"__bf__",after:"__af__",why:"__why__",'
               'url:"__url__",acts:[__acts__]},')
        tpl = (tpl.replace("__no__", esc(x.get("no")))
                  .replace("__sn__", esc(x.get("stdName")))
                  .replace("__dt__", esc(x.get("erataDate")))
                  .replace("__imp__", esc(x.get("impDate")))
                  .replace("__sec__", esc(x.get("sec")))
                  .replace("__lvl__", esc(x.get("lvl") or "mid"))
                  .replace("__kind__", esc(x.get("kind") or "ERATA"))
                  .replace("__mod__", str(int(x.get("modNo") or 0)))
                  .replace("__rs__", esc(x.get("reason")))
                  .replace("__bf__", esc(x.get("before")))
                  .replace("__af__", esc(x.get("after")))
                  .replace("__why__", esc(x.get("why")))
                  .replace("__url__", esc(x.get("url")))
                  .replace("__acts__", acts))
        lines.append(tpl)
    # ★ 不在这里写收尾的 "]," ★
    #   原文件里 ERATA 段的收尾是 "],\n"（无缩进），由 main() 保留。
    #   这里多写一行 → 替换后多出一个 "]" → 整个 data.js 语法崩。
    return "\n".join(lines)


def render_scope() -> str:
    """渲染 ERATASCOPE 段 —— 通则范围表里的标准号清单。

    ★ 为什么要有这一段 ★
      页面要显示「范围共 N 个标准」，还得能自己复核
      「列表里的每一条都在范围内」（范围是硬边界，不能只靠生成时过滤）。
      → 把范围表的原始标准号一并写进 data.js，页面端自查用。
    """
    scope = sorted(E._refscope())
    lines = ["  ERATASCOPE: ["]
    for k in scope:
        lines.append('  "%s",' % esc(k))
    # ★ 自带收尾 ★
    #   这一段是**整段插入**（不是替换已有段），所以必须自己写 "],"。
    #   之前漏了收尾 → data.js 数组没闭合 → 整个语法崩。
    lines.append("  ],")
    return "\n".join(lines)


def main() -> int:
    items = load_items()
    if not items:
        print("✗ 勘误/修改单数据为空（快照缺失？）")
        return 1

    body = render(items)

    if not os.path.exists(PROTO):
        print("✗ 找不到 prototype/data.js")
        return 1
    s = io.open(PROTO, encoding="utf-8", newline="").read()
    CRLF = "\r\n" in s
    s2 = s.replace("\r\n", "\n")

    # 外置式 data.js 的 ERATA 段：从 "  ERATA: [" 到匹配的收尾
    m = re.search(r"\n  ERATA: \[\n", s2)
    if not m:
        print("✗ 中止：data.js 里找不到 '  ERATA: [' —— 不写盘")
        return 1
    start = m.start() + 1

    # ★ 用「字符级括号配平」精确定位段尾 ★
    #   不能用正则找 "],\n" —— ERATA 内容里有嵌套数组（acts:[...]），
    #   第一个匹配的 "]" 不是段尾（2026-11-05 踩过：区间跨到 REFGROUPS 段，
    #   把后面 65 KB 覆盖没了）。
    #   也不能靠「下一个顶层段名」—— 顶层段名清单一改就失效。
    in_str = False
    esc = False
    depth = 0
    seg_end = -1
    for k in range(start, len(s2)):
        ch = s2[k]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
            continue
        if ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                seg_end = k
                break
    if seg_end < 0:
        print("✗ 中止：ERATA 段括号不配平 —— 不写盘")
        return 1
    # seg_end 指向段尾的 "]"；它后面紧跟 "," 和换行
    end = seg_end          # 替换区间 [start, end)，原文件的 "]," 保留

    # body 不含收尾（render 里已去掉），原文件的 "]," 保留
    body = body.rstrip("\n")

    new_s = s2[:start] + body + s2[end:]

    # ---- 写 ERATASCOPE 段（范围表）----
    #   ★ 整段插入到 "  ERATA: [" 之前 ★
    #   上一版试过"定位已有段再替换"，两处坑：
    #     ① 插入点算错（mi+1 落在空格上，把 ERATA 的 "[" 吞了）→ 语法崩
    #     ② 段尾括号配平和 ERATA 段共用同一套逻辑，容易互相干扰
    #   → 改成：先把已有的 ERATASCOPE 段**整段删掉**，再在 ERATA 前**整段插入**。
    #     两步都不碰 ERATA 段的内容，只在它前面加东西。
    scope_body = render_scope()

    # ① 删掉可能存在的旧 ERATASCOPE 段（从段头到它自己的 "],"）
    ms = re.search(r"\n  ERATASCOPE: \[\n", new_s)
    if ms:
        st = ms.start() + 1
        depth = 0
        in_str = False
        escf = False
        se = -1
        for k in range(st, len(new_s)):
            ch = new_s[k]
            if in_str:
                if escf:
                    escf = False
                elif ch == "\\":
                    escf = True
                elif ch == '"':
                    in_str = False
                continue
            if ch == '"':
                in_str = True
                continue
            if ch == "[":
                depth += 1
            elif ch == "]":
                depth -= 1
                if depth == 0:
                    se = k
                    break
        if se < 0:
            print("✗ 中止：ERATASCOPE 段括号不配平 —— 不写盘")
            return 1
        # 段尾 "]" 之后应有 ","，一并吃掉
        tail = se + 1
        if tail < len(new_s) and new_s[tail] == ",":
            tail += 1
        if tail < len(new_s) and new_s[tail] == "\n":
            tail += 1
        # ★ 起点用 ms.start() + 1（保留段头前面那个换行符）★
        #   ms.start() 指向的是 "\n  ERATASCOPE: [\n" 里**那个 \n**。
        #   若从 ms.start() 开始删，会把「上一段结尾 ↔ ERATASCOPE 段头」之间的
        #   换行也一起删掉 → 拼接后 "  ERATA: [" 不在行首
        #   → 后面 index("\n  ERATA: [") 直接 ValueError。
        #   （这个坑我踩了两次：插入点算错一次、删除起点算错一次。）
        new_s = new_s[:ms.start() + 1] + new_s[tail:]

    # ② 在 ERATA 段头之前整段插入
    mi = new_s.index("\n  ERATA: [")
    new_s = new_s[:mi + 1] + scope_body + "\n" + new_s[mi + 1:]

    missing = [k for k in REQUIRED if k not in new_s]
    if missing:
        print("✗ 中止：缺少 {} —— 不写盘".format("、".join(missing)))
        return 1

    io.open(PROTO, "w", encoding="utf-8", newline="").write(
        new_s.replace("\n", "\r\n") if CRLF else new_s)

    hi = [x for x in items if x.get("lvl") == "high"]
    mid = [x for x in items if x.get("lvl") == "mid"]
    low = [x for x in items if x.get("lvl") == "low"]
    mods = [x for x in items if x.get("kind") == "MOD"]
    nos = {E._refkey(x.get("no", "")) for x in items}
    print("已生成 {} 条（涉及 {} 个标准）".format(len(items), len(nos)))
    print("  通则范围：{} 个标准（范围外的已剔除）".format(len(E._refscope())))
    print("  等级：高优 {} · 中优 {} · 低优 {}    其中修改单 {} 条".format(
        len(hi), len(mid), len(low), len(mods)))
    print("  今日 {}".format(date.today()))
    for x in sorted(items, key=lambda y: y.get("erataDate") or "", reverse=True)[:12]:
        tag = "修改单" if x.get("kind") == "MOD" else "勘误"
        print("  [{}] {} {} {}（{}）· {}".format(
            (x.get("lvl") or "").upper(), x.get("no"),
            (x.get("stdName") or "")[:26], x.get("sec") or "-",
            x.get("erataDate") or "-", tag))
    return 0


if __name__ == "__main__":
    sys.exit(main())
