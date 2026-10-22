#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""抓取 2026-10-03 新接入的三个源（SRC-06/07/08）并写入快照。

为什么不放进 crawler 主流程：
  这三个源是"公告/团标"型，不按关键词逐个查标准；
  但快照结构与标准源完全一致，复用 sync_std_to_proto 的有效性管道最省事。
  所以单独一个脚本，跑一次即可；之后由 crawler 的 --refresh-new-sources 调用。
"""
import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8")

from sources import (SamrNoticeAdapter, MiitStdAdapter, TtbzStdAdapter,
                    CnasAdapter)  # noqa: E402

SNAP = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                    "..", "data", "snapshots")

# 团标默认检索词（团标是全行业的，靠关键词限定到乳制品）
TTBZ_KEYWORDS = ["婴幼儿配方乳粉", "乳粉", "乳制品", "母乳低聚糖"]


def dump(code: str, rows) -> int:
    d = {}
    for s in rows:
        d[s.norm()] = {
            "std_no": s.std_no, "title": s.title, "status": s.status,
            "category": s.category,
            "publish_date": s.publish_date,
            "implement_date": s.implement_date,
            "official_url": s.official_url,
            "issuer_org": s.issuer_org,
            "jurisdiction_org": s.jurisdiction_org,
            "download_allowed": False,
            "source_code": code,
        }
    os.makedirs(SNAP, exist_ok=True)
    p = os.path.join(SNAP, "{}_latest.json".format(code))
    json.dump(d, io.open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return len(d)


def main() -> int:
    n6 = dump("SRC-06", SamrNoticeAdapter().fetch())
    print("SRC-06 市场监管总局公告：{} 条".format(n6))
    n7 = dump("SRC-07", MiitStdAdapter().fetch())
    # 该源常为 0 条（三个栏目以电信/汽车/集成电路为主），这是正常的
    print("SRC-07 工信部行业公告：{} 条".format(n7))
    n8 = dump("SRC-08", TtbzStdAdapter().fetch(TTBZ_KEYWORDS))
    print("SRC-08 全国团体标准：{} 条".format(n8))
    # CNAS 认可规范（2026-10-07 新增）。不是国标，标准委检索库不收录，
    # 但实验室做认可评审天天在用 → 必须单独一个源。
    n11 = dump("SRC-11", CnasAdapter().fetch())
    print("SRC-11 CNAS 认可规范：{} 条".format(n11))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())