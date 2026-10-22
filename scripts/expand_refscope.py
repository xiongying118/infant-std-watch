#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""二级引用展开：限量标准 → 它引用的检测方法。

★ 为什么需要这一步（2026-10-03）★
  用户要求"标准勘误只对通则引用标准里的提醒"。第一版只按
  general_refs.json 的 linked（一级引用）做范围，结果只有 10 条，
  而且**黄曲霉毒素（GB 5009.22 / GB 5009.24）的勘误漏了** ——
  可实验室天天在测黄曲霉毒素。

  原因：通则正文（GB 10765/10766/10767）引用的是**限量标准**
  （GB 2761 真菌毒素限量、GB 2762 污染物限量），不是检测方法本身。
  检测方法在限量标准的「规范性引用文件」里，是**二级引用**。
  实测一级清单里确实有 GB2761/GB2762，但没有 GB5009.22/GB5009.24。

  所以范围要按**传递闭包**算：一级引用 ∪ 二级引用。
  只做一次性的传递闭包（深度 2），不递归到底 ——
  再往下就是培养基、试剂、通用仪器规范，与婴配检测结果无关了。

★ 合规边界（与 general_refs.py 一致）★
  标准正文只在内存里解析，不落盘；只提取标准号；落盘的只有标准号。
"""
from __future__ import annotations

import io
import json
import os
import re
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8")
import pymupdf                                       # noqa: E402
from sources import CfsaSpptAdapter                   # noqa: E402
from general_refs import extract_refs_from_pdf, _clean_no   # noqa: E402

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "..", "data")

# 只展开"限量类"标准 —— 它们是通则的同级引用，正文里引用的是检测方法。
# 不展开 GB 2760（添加剂使用标准）/ GB 14880（营养强化剂）：
# 那两个引用的是添加剂/强化剂品种标准（GB 1886/GB 1903 系列），
# 实验室不测这些，且范围会无谓膨胀。
EXPAND = ["GB 2761", "GB 2762", "GB 29921"]

# 传递闭包里明确不要的（培养基/试剂/通用规范，与婴配检测结果无关）
_BLOCK = re.compile(
    r"^(GB\s*(1886|1903|14880|2760|T\s|31604|31646|4806|14881|7718|7719|28050|14930|14934|4806)"
    r"|QB)", re.I)

# ★ 明确要排掉的具体标准 ★
# GB 8538 是**饮用天然矿泉水**检验方法 —— GB 2762 正文里提到它（水样），
# 但实验室做婴配检测不测矿泉水，混进来只会污染提醒列表。
# 踩过：2026-10-03 二级展开后 GB 8538 进了范围，
# 而它的勘误（定量限 10 mg/L → 0.1 mg/L）之前就是这么混进婴配勘误列表的。
_BLOCK_NO = re.compile(r"^(GB\s*(8538|2715|2762\.?$))", re.I)


def _ref_key(no: str) -> str:
    s = re.sub(r"\s+", "", no or "").upper().replace("—", "-")
    s = re.sub(r"-\d{4}$", "", s)
    # ★ "GB/T" 三字符整体替换，不能用 s[3:]（会剩个 T 变成 GBTTxxx）
    s = s.replace("GB/T", "GBT").replace("QB/T", "QBT")
    if not s.startswith(("GB", "QB")):
        s = "GB" + s
    return s


def main() -> int:
    ad = CfsaSpptAdapter()
    p = os.path.join(DATA, "general_refs.json")
    g = json.load(io.open(p, encoding="utf-8"))

    # 一级范围
    scope: dict[str, list[str]] = {}          # ref_key -> 来源说明
    for key in (g.get("linked") or {}):
        scope.setdefault(_ref_key(key), []).append("通则直接引用")
    lvl1 = set(scope)
    print("一级引用：{} 个".format(len(lvl1)))

    # ★ 并入"通则引用标准"页已核定的现行执行标准 ★
    #   那一页（data/_refjs.txt）是按检测对象组织的，每条都过了有效性核对，
    #   含**跨标准号替代后**的新版（如维生素B12：通则引 GB 5413.14，
    #   现行执行的是 GB 5009.285）。这些是实验室真正在执行的标准，
    #   勘误/修改单盯着它们才有意义 —— 只按通则原文引用号会把替代后的漏掉。
    rj = os.path.join(DATA, "_refjs.txt")
    if os.path.exists(rj):
        txt = io.open(rj, encoding="utf-8").read()
        extra = 0
        for m in re.finditer(r'no:"(GB[^"]+)"', txt):
            k = _ref_key(m.group(1))
            if k and k not in scope:
                scope[k] = ["通则引用页现行执行标准"]
                extra += 1
        print("并入通则引用页执行标准：{} 个".format(extra))
    else:
        print("⚠ 未找到 data/_refjs.txt，通则引用页执行标准未并入")

    # 找限量标准的正文
    found: dict[str, str] = {}
    for kw in EXPAND:
        try:
            for it in ad._search_raw(kw, ad.TAB_STANDARD):
                code = _clean_no(it.get("CODE") or "")
                if _ref_key(code) != _ref_key(kw):
                    continue
                title = (it.get("TITLE") or "")
                # 只要标准本体，不要解读材料
                if str(it.get("TABLENAME")) != ad.TABLE_STANDARD or "解读" in title:
                    continue
                fj = it.get("FJ") or []
                if fj and fj[0].get("FACT_NAME"):
                    found[code] = fj[0]["FACT_NAME"]
        except Exception as e:                          # noqa: BLE001
            print("  查 {} 失败：{}".format(kw, e))
    print("找到限量标准正文：{}".format("、".join(sorted(found)) or "无"))

    # 读正文提二级引用
    added = Counter()
    for code, fact in found.items():
        try:
            b = ad.fetch_document(fact)
        except Exception:                              # noqa: BLE001
            b = None
        if not b:
            print("  {} 正文取不到，跳过".format(code))
            continue
        refs = extract_refs_from_pdf(b)
        del b
        n = 0
        for r in refs:
            k = _ref_key(r)
            if k in lvl1 or k in scope:
                continue
            if _BLOCK.match(re.sub(r"\s+", "", r)):
                continue
            if _BLOCK_NO.match(re.sub(r"\s+", "", r)):
                continue
            scope[k] = ["经" + code + " 引用"]
            added[code] += 1
            n += 1
        print("  {} 二级新增 {} 个".format(code, n))

    out = {"scope": {k: v for k, v in sorted(scope.items())},
           "level1": sorted(lvl1)}
    op = os.path.join(DATA, "refscope.json")
    json.dump(out, io.open(op, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("\n范围合计 {} 个（一级 {} + 二级新增 {}）→ {}".format(
        len(scope), len(lvl1), len(scope) - len(lvl1), op))
    for k, v in sorted(scope.items()):
        if v[0] != "通则直接引用":
            print("  + {}  ← {}".format(k, v[0]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
