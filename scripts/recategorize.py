#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""按最新 guess_category 规则重算全部快照的 category 字段。

★ 为什么需要 ★
  `category` 是在**抓取当时**写进快照的。之后改了 `guess_category` 的号段表，
  快照里的老值不会自动更新 —— `load()` 也不重算。
  实测踩过：GB 19644《乳粉和调制乳粉》因为 `_PRODUCT_HINT` 漏了 19644，
  一直归在「关联·其它」，改了规则后重跑 fetch_wanted（只抓截图那批）
  更新 0 条，分类还是不对。

  与 `fetch_wanted.py` 的区别：
    fetch_wanted —— 回源抓取，补/覆盖**指定那批**标准
    recategorize —— **不联网**，纯按规则重算已有快照的全部条目

  跑这个之前先跑 fetch_wanted（补数据），再跑本脚本（修分类）。
"""
from __future__ import annotations

import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8")
from sources import guess_category  # noqa: E402

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "..", "data")
SNAP = os.path.join(DATA, "snapshots")
GP = os.path.join(DATA, "general_refs.json")


def main() -> int:
    total = 0
    for code in ("SRC-05", "SRC-02", "SRC-01"):
        p = os.path.join(SNAP, f"{code}_latest.json")
        if not os.path.exists(p):
            continue
        d = json.load(io.open(p, encoding="utf-8"))
        n = 0
        for no, v in d.items():
            want = guess_category(no, v.get("title") or "")
            if v.get("category") != want:
                print("  {:<20s} {:<8s} → {}".format(
                    no, v.get("category") or "（空）", want))
                v["category"] = want
                n += 1
        if n:
            json.dump(d, io.open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print("{}: 修正 {} 条".format(code, n))
        total += n

    # general_refs.details 同理
    g = json.load(io.open(GP, encoding="utf-8"))
    m = 0
    for no, v in (g.get("details") or {}).items():
        want = guess_category(no, v.get("title") or "")
        if v.get("category") != want:
            v["category"] = want
            m += 1
    if m:
        json.dump(g, io.open(GP, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("general_refs.details: 修正 {} 条".format(m))

    print("\n共修正 {} 条分类".format(total + m))
    return 0


if __name__ == "__main__":
    sys.exit(main())
