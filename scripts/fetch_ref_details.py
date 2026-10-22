#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""补抓通则引用页新增的标准元数据。

2026-10-03 用户截图点名，要放进「通则引用标准」：
  · 污染物元素：GB 5009.12 铅、GB 5009.16 锡
  · 致病菌：GB 4789.40 克罗诺杆菌、GB 4789.10 金黄色葡萄球菌、
            GB 4789.4 沙门氏菌、GB 4789.2 菌落总数、
            GB 4789.14 蜡样芽胞杆菌、GB 4789.3 大肠菌群

这些标准号的元数据之前不在 general_refs.details 里
（通则正文没引用它们，是用户按污染物/微生物限量表指定的检测方法），
build_refgroups 靠 details 取名称与日期，取不到就会缺项。

做法：按标准号回官方源抓全部版本，写进 details —— 与通则引用同一份数据源，
不另开一套（两套数据必然对不上）。
"""
from __future__ import annotations

import io
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8")
from sources import CfsaSpptAdapter, guess_category  # noqa: E402

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "..", "data")
GP = os.path.join(DATA, "general_refs.json")

TARGETS = ["5009.12", "5009.16", "4789.40", "4789.10", "4789.4",
           "4789.2", "4789.14", "4789.3", "5413.22"]


def main() -> int:
    ad = CfsaSpptAdapter()
    g = json.load(io.open(GP, encoding="utf-8"))
    details = g.setdefault("details", {})

    added, updated = [], []
    for kw in TARGETS:
        try:
            for r in ad.search(kw):
                no = r.std_no
                if kw not in no.replace(" ", ""):
                    continue          # 号段必须完全匹配，别把 5009.120 之类捎进来
                rec = {
                    "std_no": no, "title": r.title, "status": r.status,
                    "category": guess_category(no, r.title),
                    "publish_date": r.publish_date,
                    "implement_date": r.implement_date,
                    "official_url": r.official_url,
                    "download_allowed": False,
                }
                if no in details and details[no].get("title") == r.title:
                    continue
                (updated if no in details else added).append(no)
                details[no] = rec
        except Exception as e:                      # noqa: BLE001
            print("  查 {} 失败：{}".format(kw, e))
        time.sleep(0.3)

    json.dump(g, io.open(GP, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("details 新增 {} 条：{}".format(len(added), "、".join(added)))
    if updated:
        print("details 更新 {} 条：{}".format(len(updated), "、".join(updated)))
    print("details 总计 {} 条".format(len(details)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
