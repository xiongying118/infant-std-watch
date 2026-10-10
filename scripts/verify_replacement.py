#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""标准有效性核查 —— 失效判断必须以官方数据为准。

★ 这个脚本存在的理由（2026-10-03 用户当面指出）★
  我连续几轮在"某标准是否还有效"上给错答案，根因是**用推理代替查证**：
    · 凭"号段看起来对"判替代关系，没查官方详情页
    · 凭"适用范围不同"推翻官方已声明的代替关系
    · 凭截图/行业习惯写法猜标准名（蜡样芽胞 vs 蜡样芽孢）
  用户原话："你要看下它是否有效，没有效就是就替代了"
         "你查哪里的方法，经常出错"

  所以定一条规矩：**凡涉及"是否失效/被谁替代"，一律回官方源查证，
  不允许靠推理下结论。** 本脚本就是把查证过程固化下来、可重复执行。

用法：
  python scripts/verify_replacement.py            # 核查 REPLACES_BY 里的每条
  python scripts/verify_replacement.py GB5009.87 # 核查指定标准（含全部版本）
  python scripts/verify_replacement.py --all     # 核查库里全部标准（慢）

判定的唯一权威来源（实测 2026-10-03）：
  CFSA 官方详情页 staticPages/<ID>.html 的「代替与引用」章节
    里面有 "代替了如下标准" 列表 —— 这是官方声明的代替关系，人可读。
  检索接口（indexSearch）**不返回**这个字段，所以只能抓详情页。

合规：只读元数据与代替关系，不下载标准正文。
"""
from __future__ import annotations

import io
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8")
from sources import CfsaSpptAdapter, _strip_tags   # noqa: E402

_DETAIL = "https://sppt.cfsa.net.cn:8086/staticPages/{}.html"
_REPLACES_SECTION = "代替与引用"


def _norm(no: str) -> str:
    return re.sub(r"\s+", "", no or "").upper().replace("—", "-")


def _base(no: str) -> str:
    """标准号主干（去年份），用于"同一标准号"比较。"""
    return _norm(no).rsplit("-", 1)[0] if "-" in _norm(no) else _norm(no)


def fetch_replaces(ad: CfsaSpptAdapter, keyword: str) -> list[dict]:
    """按标准号主干查全部版本，返回 [{std_no, title, publish, implement, replaced:[...]}]"""
    out = []
    for it in ad._search_raw(keyword, ad.TAB_ALL):
        title = (it.get("TITLE") or "").strip()
        if "解读" in title or str(it.get("TABLENAME")) != ad.TABLE_STANDARD:
            continue
        code = (it.get("CODE") or "").rstrip(",，").strip()
        if not code:
            continue
        # 号段主干必须完全匹配，避免把 5009.120 之类捎进来
        # ★ 比较前双方都要去年份 ★
        #   踩过：官方详情页里旧版标准号带年份（GB5413.22—2010），
        #   拿它去比主干（GB5413.22）会不等 → 把明明查得到的旧版
        #   误报成"官方源已无记录（已废止）"。方向反了很误导。
        if _base(code) != _base(keyword):
            continue
        replaced = []
        try:
            r = ad.f.session.get(_DETAIL.format(it.get("ID")), timeout=30)
            if r.status_code == 200:
                t = re.sub(r"\s+", " ", _strip_tags(r.text))
                i = t.find(_REPLACES_SECTION)
                if i > 0:
                    seg = t[i:i + 600]
                    # 只取「代替了如下标准」到「引用了如下标准」之间
                    j = seg.find("引用了如下标准")
                    if j > 0:
                        seg = seg[:j]
                    for m in re.finditer(
                            r"(GB/?T?\s*[\d.]+\s*[—\-]\s*\d{4})", seg):
                        replaced.append(re.sub(r"\s+", " ", m.group(1)))
        except Exception:                              # noqa: BLE001
            pass
        out.append({
            "std_no": code,
            "title": re.sub(r"^《.*?》", "", title).strip(),
            "publish": it.get("PDATE") or "",
            "implement": it.get("SSRQ") or "",
            "replaced": replaced,
        })
        time.sleep(0.2)
    return out


def cmd_check(ad: CfsaSpptAdapter, keyword: str) -> int:
    rows = fetch_replaces(ad, keyword)
    if not rows:
        print("✗ 官方源没查到 {}".format(keyword))
        return 1
    print("══ 官方源查证：{} ══".format(keyword))
    for r in rows:
        print("  {:<20s} 发布 {}  实施 {}".format(
            r["std_no"], r["publish"] or "—", r["implement"] or "—"))
        print("    {}".format(r["title"][:56]))
        if r["replaced"]:
            print("    官方声明代替：{}".format("、".join(r["replaced"])))
        else:
            print("    官方声明代替：（无）")
    # 反查：有没有更新的版本代替了它
    print()
    print("  ── 反查：这些旧版现在还有效吗 ──")
    bad = 0
    for r in rows:
        for old in r["replaced"]:
            # 官方页面里写成「GB5413.22—2010」（无空格 + em dash），
            # 要先归一成官方检索接口认的形态：**em dash → 连字符**，再补空格。
            # ★ 漏掉 em dash 转换是踩过的坑 ★
            #   _base() 只按 "-" 去年份，遇到 "—" 不剥 → 主干带着年份，
            #   跟 "GB5413.22" 比不等 → 把明明查得到的旧版误报成"已废止"。
            #   报错方向是反的（说官方没记录，实际有），比不报错更误导。
            probe = _norm(old)
            probe = re.sub(r"^(GB/?T?)(\d)", r"\1 \2", probe)
            if _base(probe) != _base(old):
                # 仍不等就说明是 GB/T 这类带斜杠的主干，直接用原文
                probe = old
            if _norm(probe) in {_norm(x["std_no"]) for x in rows}:
                print("  ✓ {} 已被本查询内的 {} 代替".format(old, r["std_no"]))
                continue
            old_rows = fetch_replaces(ad, probe)
            # ★ 比较双方都要过 _norm ★
            #   官方页面里的旧版号用 em dash（GB5413.22—2010），
            #   而检索结果返回的是连字符（GB 5413.22-2010），
            #   直接字符串比永远不等 → 把查得到的东西报成"已废止"。
            hit = next((x for x in old_rows
                        if _norm(x["std_no"]) == _norm(old)), None)
            if hit is None:
                print("  ✓ {} 官方源已无记录 → 确已废止".format(old))
            else:
                # ★ 说清"它自己代替了谁"，别写成"它仍被别人代替" ★
                #   这一栏查的是"这条旧版自己在官方还声称代替谁"，
                #   措辞含糊会让人以为它还有效。
                if hit["replaced"]:
                    print("  · {} 仍在官方库中（它自己代替了 {}）"
                          "—— 是否被更新版取代，见上方新版声明".format(
                              old, "、".join(hit["replaced"])))
                else:
                    print("  ⚠ {} 仍在官方库中且未声明代替谁"
                          "—— 需人工核对是否已废止".format(old))
    return 1 if bad else 0


def cmd_all(ad: CfsaSpptAdapter) -> int:
    """核查库里全部标准：抓每条详情页的代替关系，输出到 JSON 供比对。"""
    import json
    import verify_validity2 as V
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                     "..", "data", "general_refs.json")
    g = json.load(io.open(p, encoding="utf-8"))
    bases = sorted({V.std_base(k) for k in g["details"]})
    print("核查 {} 个标准号主干的官方代替关系…".format(len(bases)))
    out = {}
    for i, b in enumerate(bases, 1):
        # std_base 去掉年份了，这里补回检索词
        kw = "GB " + b[2:] if b.startswith("GB") else b
        rows = fetch_replaces(ad, kw)
        for r in rows:
            if r["replaced"]:
                out[r["std_no"]] = r["replaced"]
        if i % 20 == 0:
            print("  {}/{}".format(i, len(bases)))
    op = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                     "..", "data", "official_replaces.json")
    json.dump(out, io.open(op, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("已写出 {} 条官方代替关系 → {}".format(len(out), op))
    return 0


def main() -> int:
    args = [a for a in sys.argv[1:] if a != "--all"]
    ad = CfsaSpptAdapter()
    if "--all" in sys.argv:
        return cmd_all(ad)
    if not args:
        print(__doc__)
        print("示例：python scripts/verify_replacement.py GB 5009.87")
        return 0
    kw = " ".join(args)
    return cmd_check(ad, kw)


if __name__ == "__main__":
    sys.exit(main())
