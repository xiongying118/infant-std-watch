#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""对比：用户截图里的标准/法规 vs 现有页面数据，列出缺哪些。

只读，不改数据。用于回答"要加什么"。
"""
import io
import json
import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")
BASE = os.path.dirname(os.path.abspath(__file__))
PROTO = os.path.join(BASE, "..", "prototype", "index.html")

# 用户 2026-10-03 截图 1：标准与管理规范
WANT_STD = [
    "GB 2760-2024", "GB 2761-2017", "GB 2762-2022", "GB 2762-2025",
    "GB 2763.1-2022", "GB 2763-2021", "GB 5749-2022", "GB 14880-2012",
    "GB 28050-2011", "GB 28050-2025", "GB 29921-2021", "GB 29924-2013",
    "GB 7718-2011", "GB 7718-2025", "GB 12693-2023", "GB 13432-2013",
    "GB 14881-2013", "GB 14881-2025", "GB 23790-2023",
    "GB/T 22000-2006", "GB/T 22003-2017", "GB/T 27320-2010",
]

# 用户截图 2：法律法规 / 管理办法 / 婴幼儿乳粉生产许可细则
WANT_LAW = [
    "食品标识监督管理办法", "食品生产许可管理办法", "食品召回管理办法",
    "婴幼儿配方乳粉生产许可细则",
    "中华人民共和国产品质量法", "中华人民共和国进出口商品检验法",
    "中华人民共和国进出口食品安全管理办法", "中华人民共和国农产品质量安全法",
    "中华人民共和国食品安全法", "中华人民共和国食品安全法实施条例",
]


def main():
    s = io.open(PROTO, encoding="utf-8").read()
    m = re.search(r"const STD = \[(.*?)\n\];", s, re.S)
    std_rows = re.findall(r'\{no:"([^"]+)"', m.group(1))
    m2 = re.search(r"const LAWS = \[(.*?)\n\];", s, re.S)
    law_txt = m2.group(1) if m2 else ""
    law_names = re.findall(r'no:"([^"]+)"', law_txt)

    def bare(x):
        return re.sub(r"\s+", "", x).upper().replace("/", "/")

    have = {bare(x): x for x in std_rows}
    print("=== 标准（截图 1）现有 {} 条 ===".format(len(std_rows)))
    miss = []
    for w in WANT_STD:
        b = bare(w).rsplit("-", 1)[0]        # 去年份比主干
        hit = [v for k, v in have.items() if k == b or k.startswith(b + "-")]
        if hit:
            print("  有  {:<18s} → {}".format(w, "、".join(hit)))
        else:
            print("  缺  {:<18s}".format(w))
            miss.append(w)

    print()
    print("=== 法规（截图 2）现有 {} 条 ===".format(len(law_names)))
    lmiss = []
    for w in WANT_LAW:
        key = re.sub(r"中华人民共和国", "", w)
        hit = [n for n in law_names if key in n or n in w]
        if hit:
            print("  有  {:<28s} → {}".format(w, "、".join(hit[:2])))
        else:
            print("  缺  {:<28s}".format(w))
            lmiss.append(w)

    print()
    print("缺标准 {} 个：{}".format(len(miss), "、".join(miss)))
    print("缺法规 {} 个：{}".format(len(lmiss), "、".join(lmiss)))


if __name__ == "__main__":
    main()
