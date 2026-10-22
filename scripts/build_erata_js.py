#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成原型的 ERATA 数组（标准勘误 + 标准修改单）——来自真实抓取数据。

★ 范围限定（用户要求 2026-10-03）★
  "标准勘误的只需对通则引用标准里的进行更新提醒，其他的不需要"
  → 只保留 general_refs.json 的 linked 清单内的标准。

★ 为什么必须带上 std_name 和 erataDate ★
  用户要求：把标准名称和勘误时间写出来。理由很实在 ——
    · 没有标准名，只看到「GB 5009.7-2016 3.4.4」，
      不知道测的是什么，出报告时无法向委托方解释依据哪一版
    · 没有勘误时间，不知道这个错误是 2018 年还是上周发现的，
      判断"我手上的作业文件是不是照着错版本写的"要靠猜

★ 为什么加了"修改单"这一类（2026-10-03 修正）★
  用户反馈"杂质度就有更新的了，你都没有"。查证结果：
  GB 5413.30-2016《乳和乳制品杂质度的测定》第1号修改单，2026-08-18 发布、
  自批准之日起实施。而 CFSA 的「标准勘误」专库（num_tn=4，176 条，
  最新 2025-09-15）**根本不收录修改单** —— 修改单是全库检索（num_tn=99）
  里的独立文档。只查勘误库 = 这类变更 100% 漏抓，且不报错。

  改法：sources.CfsaSpptAdapter.amendments_with_summary() 抓修改单 +
  官方解读材料正文，变更要点从解读材料取（修改单 PDF 是子集化字体无
  ToUnicode，pymupdf 提出来是乱码，只能走解读材料）。

分级沿用 erata.py 的判定（按"改了是否影响结果"，不按改了多少字）。
修改单一律 high：自批准之日起实施，没有过渡期。
"""
from __future__ import annotations

import io
import json
import os
import re
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8")
import erata as E                                            # noqa: E402

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "..", "data")
PROTO = os.path.join(BASE, "..", "prototype", "index.html")

REQUIRED = ["const STD = [", "const CATS = [", "const LAWS = [",
            "const REFGROUPS = ", "const ERATA = [", "const ALERTS = [",
            "function renderList", "function renderLaw", "function route("]


def esc(s) -> str:
    """转义成 JS 字符串字面量内容。"""
    return (str(s or "").replace("\\", "\\\\").replace('"', "'")
            .replace("\n", " ").replace("\r", " ")
            .replace(" ", " "))


def _std_name(x: dict) -> str:
    """标准名称。

    勘误数据自带三种可能的写法，不能直接用：
      · std_name  —— 从库里查到的规范名（最佳）
      · title     —— 形如「勘误：GB 5009.7-2016 3.4.4 章节内容已更正」，
                     去掉前缀和标准号后能用
      · 都拿不到  —— 返回空，页面显示"（标准名待补）"，
                     宁可留空也不把标准号当名称展示
    """
    name = (x.get("std_name") or "").strip()
    if name and not re.match(r"^GB[/T]?\s*[\d.]", name):
        return name
    t = (x.get("title") or "").strip()
    t = re.sub(r"^勘误[：:]\s*", "", t)
    t = re.sub(r"^GB[/T]?\s*[\d.\s-]+", "", t).strip(" —-")
    t = re.sub(r"\s*\d+(\.\d+)*\s*章节内容已更正.*$", "", t).strip()
    return t


def load_items() -> list[dict]:
    """勘误 + 修改单 → 统一结构的列表。

    优先读 prototype_data.json 的 erata（已有 level/why/actions），
    再叠加 data/_erata_fresh.json + data/_mods.json 的真实抓取结果，
    后者经过 erata.py 的分级与范围过滤。
    """
    items: list[dict] = []
    seen: set[str] = set()

    # ---- 1) 修改单（新增的一类）----
    mods_path = os.path.join(DATA, "_mods.json")
    if os.path.exists(mods_path):
        mods = json.load(io.open(mods_path, encoding="utf-8"))
        for a in E.build_mod_alerts(mods):
            e = a["erata"]
            key = f"{a['std_no']}|MOD|{e.get('modNo')}"
            if key in seen:
                continue
            seen.add(key)
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
                "url": a.get("official_url") or "",
            })

    # ---- 2) 勘误 ----
    p = os.path.join(DATA, "prototype_data.json")
    src = []
    if os.path.exists(p):
        d = json.load(io.open(p, encoding="utf-8"))
        src = d.get("erata") or []
    else:
        snap = os.path.join(DATA, "snapshots", "erata_latest.json")
        if os.path.exists(snap):
            for it in json.load(io.open(snap, encoding="utf-8")):
                src.append(E.build_erata_alerts([it])[0] if
                           E.build_erata_alerts([it]) else {})
    fresh = os.path.join(DATA, "_erata_fresh.json")
    if os.path.exists(fresh):
        for a in E.build_erata_alerts(json.load(io.open(fresh, encoding="utf-8"))):
            src.append(a)

    for x in src:
        if not x:
            continue
        e = x.get("erata") or {}
        no = x.get("std_no", "")
        if not no or not E.in_ref_scope(no):
            continue
        key = f"{no}|ERATA|{e.get('date')}|{e.get('section')}"
        if key in seen:
            continue
        seen.add(key)
        items.append({
            "no": no,
            "stdName": _std_name(x),
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
            "url": x.get("official_url") or "",
        })
    return items


def _mod_name(mods: list[dict], no: str, mod_no) -> str:
    for m in mods:
        if m.get("std_no") == no and str(m.get("mod_no")) == str(mod_no):
            return m.get("std_name") or "（标准名待补）"
    return "（标准名待补）"


def render(items: list[dict]) -> str:
    # 排序：先按日期倒序；同一天里修改单优先于勘误（都是当天要动手的事）
    def key(x):
        return (x.get("erataDate") or "",
                1 if x.get("kind") == "MOD" else 0,
                0 if x.get("lvl") == "high" else 1)
    items = sorted(items, key=key, reverse=True)

    lines = ["const ERATA = ["]
    for x in items:
        acts = ",".join('"{}"'.format(esc(a)) for a in (x.get("acts") or []))
        lines.append(
            '  {{no:"{no}",stdName:"{sn}",erataDate:"{dt}",impDate:"{imp}",sec:"{sec}",'
            'lvl:"{lvl}",kind:"{kind}",modNo:{mod},reason:"{rs}",before:"{bf}",after:"{af}",'
            'why:"{why}",url:"{url}",acts:[{acts}]}},'.format(
                no=esc(x.get("no")),
                sn=esc(x.get("stdName")),
                dt=esc(x.get("erataDate")),
                imp=esc(x.get("impDate")),
                sec=esc(x.get("sec")),
                lvl=esc(x.get("lvl") or "mid"),
                kind=esc(x.get("kind") or "ERATA"),
                mod=int(x.get("modNo") or 0),
                rs=esc(x.get("reason")),
                bf=esc(x.get("before")),
                af=esc(x.get("after")),
                why=esc(x.get("why")),
                url=esc(x.get("url")),
                acts=acts))
    lines.append("];")
    return "\n".join(lines)


def main() -> int:
    items = load_items()
    if not items:
        print("✗ 勘误/修改单数据为空")
        return 1

    body = render(items)

    s = io.open(PROTO, encoding="utf-8").read()
    a = s.index("const ERATA = [")
    b = s.index("\n];", a) + 3
    new_html = s[:a] + body + s[b:]

    missing = [k for k in REQUIRED if k not in new_html]
    if missing:
        print("✗ 中止：缺少 {} —— 不写盘".format("、".join(missing)))
        return 1
    io.open(PROTO, "w", encoding="utf-8").write(new_html)

    hi = [x for x in items if x.get("lvl") == "high"]
    mods = [x for x in items if x.get("kind") == "MOD"]
    print("已生成 {} 条（高优 {}，其中修改单 {}），今天 {}".format(
        len(items), len(hi), len(mods), date.today()))
    for x in sorted(items, key=lambda y: y.get("erataDate") or "", reverse=True)[:10]:
        tag = "修改单" if x.get("kind") == "MOD" else "勘误"
        print("  [{}] {} {} {}（{}）".format(
            (x.get("lvl") or "").upper(), x.get("no"),
            (x.get("stdName") or "")[:26], x.get("sec") or "-",
            x.get("erataDate") or "-"), "·", tag)
    return 0


if __name__ == "__main__":
    sys.exit(main())
