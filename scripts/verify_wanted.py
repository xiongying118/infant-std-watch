#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""核对：本轮补抓的标准是否都进了清单、分类是否合理、有没有混进不相干的。"""
import io
import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")
PROTO = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                     "..", "prototype", "index.html")

# 用户截图 1 点名的标准 → 期望的分类
WANT = {
    "GB2763-2021": "限量/判定依据",
    "GB2763.1-2022": "限量/判定依据",
    "GB5749-2022": "关联（水质）",
    "GB28050-2011": "关联（标签）",
    "GB28050-2025": "关联（标签，即将实施）",
    "GB29924-2013": "关联（添加剂标识）",
    "GB7718-2011": "关联（标签）",
    "GB7718-2025": "关联（标签，即将实施）",
    "GB12693-2023": "生产规范",
    "GBT22000-2006": "体系标准",
    "GBT22003-2017": "体系标准",
    "GBT27320-2010": "体系标准",
}
# 应当被过滤掉的（已被替代）
SHOULD_DROP = ["GB 2762-2022", "GB 14881-2013", "GB/T 22003-2008",
               "GB 12693-2010", "GB 5749-2006", "GB 5749-1985"]

# 用户截图 2 点名的法规
WANT_LAW = ["食品标识监督管理办法", "食品生产许可管理办法",
            "婴幼儿配方乳粉生产许可审查细则", "中华人民共和国进出口商品检验法",
            "中华人民共和国进出口食品安全管理办法"]


def main():
    s = io.open(PROTO, encoding="utf-8").read()
    m = re.search(r"const STD = \[(.*?)\n\];", s, re.S)
    rows = [l for l in m.group(1).split("\n") if l.strip().startswith("{")]
    m2 = re.search(r"const LAWS = \[(.*?)\n\];", s, re.S)
    laws = re.findall(r'no:"([^"]+)"', m2.group(1))

    def key(no):
        # GB/T 与 GB 一视同仁（去掉斜杠），否则 GBT22000 匹配不上 GB/T 22000
        return re.sub(r"\s+", "", no).upper().replace("/", "")

    have = {}
    for l in rows:
        no = re.search(r'no:"([^"]+)"', l).group(1)
        cat = re.search(r'cat:"([^"]+)"', l).group(1)
        sub = re.search(r'sub:"([^"]*)"', l).group(1)
        st = re.search(r'status:"([^"]*)"', l)
        imp = re.search(r'imp:"([^"]*)"', l)
        ist = re.search(r'impState:"([^"]*)"', l)
        have[key(no)] = (no, cat, sub,
                         (ist.group(1) if ist else ""),
                         (imp.group(1) if imp else ""))

    print("清单 {} 条 / 法规 {} 条\n".format(len(rows), len(laws)))
    print("=== 本轮补抓标准的落位 ===")
    bad = 0
    for k, expect in WANT.items():
        if k in have:
            no, cat, sub, ist, imp = have[k]
            print("  ✓ {:<18s} {:<8s} {:<22s} {:<8s} {}".format(
                no, cat, sub, ist, imp))
        else:
            print("  ✗ 缺失 {}".format(k))
            bad += 1

    print("\n=== 应当被过滤的（已被替代）===")
    for k in SHOULD_DROP:
        kk = key(k)
        if kk in have:
            print("  ✗ 仍在清单里：{}".format(have[kk][0]))
            bad += 1
        else:
            print("  ✓ 已过滤 {}".format(k))

    print("\n=== 本轮补抓法规 ===")
    for w in WANT_LAW:
        hit = [x for x in laws if w in x]
        if hit:
            print("  ✓ {}".format(hit[0]))
        else:
            print("  ✗ 缺 {}".format(w))
            bad += 1

    print("\n问题 {}".format(bad))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
