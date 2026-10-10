#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
标准有效性与实施状态核对
========================
回答两个问题：
  1. 这条标准**实施了吗**？
  2. 这条标准**还有效吗**？

★ 实测踩过的坑（2026-10-03）★

坑一：源站状态字段不可全信
  sppt 对**已被替代的历史版本也标"现行"**。
  实测：GB 5009.3 的 2010/2016 三个版本状态全是"现行"，
       但 2010 版显然已被 2016 版替代。
  → 状态不能只看 source.state，要用"同号最新版 + 实施日期"交叉判断。

坑二：不能用"实施日期 >= 某个固定年份"判已实施
  我在原型里写过 `imp>="2026-01-01" ? "已实施" : "即将实施"`，
  结果 GB 5009.168-2026（实施日 2027-08-18，今天 2026-10-03，**还有 319 天**）
  被标成"已实施"。方向完全反了。
  → 必须拿实施日期和**当天日期**比。

核对策略（不靠单一字段）：
  1. 实施日期 vs 今天  →  已实施 / 即将实施(N 天) / 待定
  2. 同标准号的其它版本 → 有更新的已实施版本 ⇒ 本条是历史版本
  3. 源站 state       → 仅作参考，不单独采信
  4. 勘误记录         → 有勘误说明它仍在用（而不是被废止）
"""
from __future__ import annotations

import re
from datetime import date, datetime




def today() -> date:
    """当天日期。

    ★ 不要把它写死 ★（踩过）：初版硬编码 date(2026,10,3)，
    第二天跑就会把"距今 N 天"算错，而实施状态判断全靠这个天数。
    需要复现历史某天的判定时才传参覆盖。
    """
    return date.today()


def parse_date(s) -> date | None:
    if not s:
        return None
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", str(s)[:10])
    if not m:
        return None
    try:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None


def std_base(no: str) -> str:
    """取标准号主干：GB 5413.14-2010 → GB5413.14"""
    s = re.sub(r"\s+", "", no or "").upper().replace("—", "-")
    s = re.sub(r"-\d{4}$", "", s)
    return s


def implement_state(imp_date, today=None) -> tuple[str, str, int | None]:
    """判断实施状态。返回 (状态, 说明, 剩余天数)。

    状态：已实施 / 即将实施 / 日期待定
    """
    t = today or date.today()
    d = parse_date(imp_date)
    if d is None:
        return "日期待定", "官方未给实施日期", None
    delta = (d - t).days
    if delta < 0:
        return "已实施", f"已于 {imp_date} 实施（{abs(delta)} 天前）", delta
    if delta == 0:
        return "即将实施", f"今日实施（{imp_date}）", 0
    return "即将实施", f"还有 {delta} 天实施（{imp_date}）", delta


def _same(no: str, target: str) -> bool:
    """两个标准号是否同一个（忽略空格与破折号差异）。"""
    return (re.sub(r"\s+", "", no or "").upper().replace("—", "-")
            == re.sub(r"\s+", "", target or "").upper().replace("—", "-"))


def validity_state(std_no: str, all_versions: list[dict], erata_hits: set | None = None,
                   today=None) -> dict:
    """判断某条标准的有效性。

    all_versions: 同标准号的全部版本（含本条），每条至少有 std_no / implement_date / state

    判定顺序（不靠单一字段）：
      1. 源站明确说废止            → 已废止
      2. 同号存在**更新且已实施**的版本 → 已被替代
      3. 同号存在更新但**尚未实施**   → 现行有效（新版还没接班）
      4. 有勘误记录                → 现行有效（还在用）
      5. 其余                      → 现行有效
    """
    t = today or date.today()
    base = std_base(std_no)

    # 同号全部版本，按实施日期倒序
    vers = sorted([v for v in all_versions if std_base(v.get("std_no", "")) == base],
                  key=lambda v: (v.get("implement_date") or ""), reverse=True)

    me = next((v for v in vers if _same(v.get("std_no", ""), std_no)), {})
    my_imp = parse_date(me.get("implement_date"))
    state, desc, _ = implement_state(me.get("implement_date"), t)

    # 比新的版本里，挑出「比本条新、且不含本条」的
    newer = [v for v in vers
             if not _same(v.get("std_no", ""), std_no)
             and (my_imp is None
                  or (parse_date(v.get("implement_date")) or date(2099, 1, 1)) > my_imp)]

    raw_state = (me.get("state") or "").strip()

    # 1) 源站明确废止
    if raw_state in ("废止", "被代替"):
        return {"validity": "已废止", "reason": f"官方状态：{raw_state}",
                "is_current": False, "newer": None,
                "implement_state": state, "implement_desc": desc,
                "source_state": raw_state}

    # 2) 有更新且已实施的版本 → 我被替代了
    effective_newer = [v for v in newer
                       if (parse_date(v.get("implement_date")) or date(2099, 1, 1)) <= t]
    if effective_newer:
        n0 = effective_newer[0]
        return {"validity": "已被替代",
                "reason": f"已被 {n0.get('std_no')} 替代（{n0.get('implement_date')} 实施）",
                "is_current": False, "newer": n0.get("std_no"),
                "implement_state": state, "implement_desc": desc,
                "source_state": raw_state}

    # 3) 有新版但还没到实施日 → 现在仍用本版
    if newer:
        n0 = newer[0]
        return {"validity": "现行有效",
                "reason": f"新版 {n0.get('std_no')} 已发布，{n0.get('implement_date')} 才实施，现在仍用本版",
                "is_current": True, "newer": n0.get("std_no"),
                "implement_state": state, "implement_desc": desc,
                "source_state": raw_state}

    # 4) 有勘误 → 还在用
    if erata_hits and _same_any(std_no, erata_hits):
        return {"validity": "现行有效", "reason": "官方有勘误记录，说明仍在使用",
                "is_current": True, "newer": None,
                "implement_state": state, "implement_desc": desc,
                "source_state": raw_state}

    return {"validity": "现行有效",
            "reason": f"官方状态：{raw_state or '现行'}，无更新版本",
            "is_current": True, "newer": None,
            "implement_state": state, "implement_desc": desc,
            "source_state": raw_state}


def _same_any(no: str, s: set) -> bool:
    return any(_same(no, x) for x in s)


def audit(linked: dict, erata_std_nos: set | None = None, today=None) -> list[dict]:
    """全量核对。

    linked 是 {引用号: [版本1, 版本2, ...]}，但**同一个标准号的不同版本可能分散在
    不同引用项下**（实测 GB 5009.5 和 GB 5009.3 的多个版本就分散着）。
    所以先按"标准号主干"重新分组，否则判不出"被替代"。
    """
    # 按主干分组：GB5413.14 -> [所有 GB 5413.14-* 版本]
    pool: dict[str, list[dict]] = {}
    for versions in linked.values():
        for v in versions or []:
            b = std_base(v.get("std_no", ""))
            pool.setdefault(b, []).append(v)

    out = []
    for ref, versions in linked.items():
        for v in versions or []:
            b = std_base(v.get("std_no", ""))
            r = validity_state(v.get("std_no", ""), pool.get(b, [v]), erata_std_nos, today)
            out.append({
                "ref": ref, "std_no": v.get("std_no"), "title": v.get("title"),
                "publish_date": v.get("publish_date"),
                "implement_date": v.get("implement_date"),
                "source_state": v.get("state"),
                "version_count": len(pool.get(b, [])),
                **r,
            })
    return out


if __name__ == "__main__":
    import json
    import io
    import os
    import sys

    sys.stdout.reconfigure(encoding="utf-8")
    base = os.path.dirname(os.path.abspath(__file__))
    g = json.load(io.open(os.path.join(base, "..", "data", "general_refs.json"), encoding="utf-8"))
    era = json.load(io.open(os.path.join(base, "..", "data", "prototype_data.json"),
                            encoding="utf-8")) if os.path.exists(
        os.path.join(base, "..", "data", "prototype_data.json")) else {}
    en = {x.get("std_no") for x in (era.get("erata") or [])}

    rows = audit(g.get("linked") or {}, en)
    print("核对 {} 条标准（今天 {}）\n".format(len(rows), date.today()))

    from collections import Counter
    print("有效性:", dict(Counter(r["validity"] for r in rows)))
    print("实施状态:", dict(Counter(r["implement_state"] for r in rows)))
    print()
    print("=== 需要注意的 ===")
    for r in rows:
        if r["validity"] != "现行有效" or r["implement_state"] == "即将实施":
            print(f"  {r['std_no']:20s} [{r['validity']}] [{r['implement_state']}]")
            print(f"     {r['title'][:44]}")
            print(f"     {r['reason']}")
            print(f"     实施：{r['implement_date']}  {r['implement_desc']}")
