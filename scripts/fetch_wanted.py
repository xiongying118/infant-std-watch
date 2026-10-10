#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""补充抓取：用户 2026-10-03 截图点名的标准与法规。

★ 为什么不直接往页面里塞 ★
  截图里那批条目的**版本状态有问题**（下面"逐条核实"），
  照抄截图会把已失效版本和不规范名称一起带进来。
  所以：先回官方源核实 → 写进快照 → 走 sync_std_to_proto.py 既有的有效性管道
  → 失效的自动被过滤，分类由 detect_rules 自动归位。

逐条核实（2026-10-03 实测 CFSA + openstd）：

| 截图条目 | 官方核实 | 处理 |
|---|---|---|
| GB 2760-2024 | 已有 | 跳过 |
| GB 2761-2017 | 已有 | 跳过 |
| GB 2762-2022（含第1号修改单） | 已被 GB 2762-2025 替代 | 抓了，管道会过滤掉 |
| GB 2762-2025 | 已有 | 跳过 |
| GB 2763.1-2022 | 现行 2023-05-11 实施 | **加**（农药限量） |
| GB 2763-2021 | 现行 2021-09-03 实施 | **加**（农药限量） |
| GB 5749-2022 | 现行 2023-04-01 实施（1985/2006 版废止） | **加**（生活饮用水） |
| GB 14880-2012 | 已有 | 跳过 |
| GB 28050-2011 | 现行（2025 版已发布但 2027-03-16 才实施） | **加**（旧版仍现行） |
| GB 28050-2025 | 即将实施 2027-03-16 | **加**（带倒计时） |
| GB 29921-2021 | 已有 | 跳过 |
| GB 29924-2013 | 现行 2015-06-01 实施 | **加**（添加剂标识） |
| GB 7718-2011 | 现行（2025 版 2027-03-16 实施） | **加** |
| GB 7718-2025 | 即将实施 2027-03-16 | **加**（带倒计时） |
| GB 12693-2023 | 现行 2024-09-06 实施（2010 版已被替代） | **加**（乳制品 GMP） |
| GB 13432-2013 | 已有 | 跳过 |
| GB 14881-2013 | 已被 GB 14881-2025 替代 | 抓了，管道会过滤掉 |
| GB 14881-2025 | 已有 | 跳过 |
| GB 23790-2023 | 已有 | 跳过 |
| GB/T 22000-2006 | 现行 | **加**（体系） |
| GB/T 22003-2017 | 现行（2008 版废止） | **加**（体系，注明新版） |
| GB/T 27320-2010 | 现行 | **加**（食品防护） |

合规：只抓元数据（标准号/名称/日期/状态/官方链接），不存标准正文。
"""
from __future__ import annotations

import io
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8")
from sources import (CfsaSpptAdapter, SamrStdAdapter, OpenStdAdapter,  # noqa: E402
                      guess_category)

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "..", "data")
SNAP = os.path.join(DATA, "snapshots")

# 要补抓的标准号（主干，不含年份；两个源都查，谁有算谁）
TARGETS = [
    "2763.1", "2763", "5749", "28050", "29924", "7718", "12693",
    "22000", "22003", "27320",
    # 2026-10-06 用户截图点名：保健食品良好生产规范。
    # 库里完全没有，CFSA 核实为GB 17405-2025 现行。
    "17405",
]


def _main_no(std_no: str) -> str:
    """标准号主干：去前缀、去空格、去年份。GB/T 25749.5-2012 → 25749.5"""
    s = re.sub(r"\s+", "", std_no or "").upper()
    s = re.sub(r"^GB/?T?", "", s)
    s = re.sub(r"-\d{4}$", "", s)
    return s.lstrip(".")


def main() -> int:
    # ---- 0) 清掉历史上误写进快照的脏数据 ----
    #   2026-10-03 早先用 `"5749" in no` 包含匹配，把三个不相干标准收了进来：
    #     GB/T 25749.5-2012 机械安全 空气传播有害物质排放评估
    #     GB/T 35749-2017  锦纶66弹力丝
    #     GB/T 45749-2025  市场和社会调查 定性和定量数据预处理
    #   没有任何清理机制的话，它们会永久留在库里（每轮 sync 都读快照）。
    JUNK = ["GB/T 25749.5-2012", "GB/T 25749.6-2012", "GB/T 25749.7-2012",
            "GB/T 25749.9-2012", "GB/T 35749-2017", "GB/T 45749-2025"]
    for code in ("SRC-05", "SRC-02", "SRC-01"):
        p = os.path.join(SNAP, f"{code}_latest.json")
        if not os.path.exists(p):
            continue
        d = json.load(io.open(p, encoding="utf-8"))
        rm = [k for k in JUNK if k in d]
        if rm:
            for k in rm:
                del d[k]
            json.dump(d, io.open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            print("清理脏数据 {}：{}".format(code, "、".join(rm)))

    sppt = CfsaSpptAdapter()
    samr = SamrStdAdapter()

    added: dict[str, dict] = {}

    # ---- 1) 食品安全国标（CFSA 主源）----
    for kw in TARGETS:
        try:
            for r in sppt.search(kw):
                if not r.std_no:
                    continue
                added[r.std_no] = {
                    "std_no": r.std_no, "title": r.title, "status": r.status,
                    # ★ 分类一律现算，不吃源站给的 category ★
                    #   踩过：早先直接用 r.category，而 CFSA 把 2760/2761/2763
                    #   全标成同一个值，补抓进来后一级分类全是 assoc，
                    #   跟检测方法混在一起。现 guess_category 已补齐这些号段。
                    "category": guess_category(r.std_no, r.title),
                    "publish_date": r.publish_date, "implement_date": r.implement_date,
                    "official_url": r.official_url, "download_allowed": False,
                }
        except Exception as e:                          # noqa: BLE001
            print("  CFSA 查 {} 失败：{}".format(kw, e))
        time.sleep(0.3)

    # ---- 2) GB/T 体系标准 + 非食安国标（CFSA 不收，走标准委检索接口）----
    #   ★ 5749 生活饮用水也在这一支 ★
    #   CFSA 是食品安全国标库，生活饮用水卫生标准是 GB 强标但不属于食安国标，
    #   在 CFSA 搜 "5749" 一条都没有，只在标准委库里有。
    #
    #   ★ 为什么用 SamrStdAdapter 而不是 OpenStdAdapter ★
    #   实测 OpenStdAdapter.search("22000") 返回 0 条（HTML 列表接口对
    #   GB/T 推荐性标准经常空手而归），而 SamrStdAdapter 走 JSON 检索接口
    #   能稳定拿到。两个都试，Samr 优先，OpenStd 兜底。
    targets_open = [("22000", "22003", "27320", "5749")]
    for kws in targets_open:
        for kw in kws:
            got = []
            for src_name, ad in (("samr", samr), ("openstd", OpenStdAdapter())):
                try:
                    got = ad.fetch([kw])
                except Exception as e:                  # noqa: BLE001
                    print("  {} 查 {} 失败：{}".format(src_name, kw, e))
                    got = []
                if any(kw in (r.std_no or "").replace(" ", "") for r in got):
                    break
            for r in got:
                no = r.std_no
                if not no.startswith(("GB/T", "GB")):
                    continue
                # ★ 必须是"号段完全相等"，不能用 in 包含匹配 ★
                #   踩过：搜 "5749" 时 `if "5749" in no` 把
                #     GB/T 25749.5-2012 机械安全空气净化系统
                #     GB/T 35749-2017 锦纶66弹力丝
                #     GB/T 45749-2025 市场和社会调查
                #   全当成生活饮用水标准收了进来 —— 三个跟乳品毫无关系的。
                #   正确判据：去掉 GB/T 与年份后，剩下的部分必须**等于**关键词。
                if _main_no(no) != kw:
                    continue
                added[no] = {
                    "std_no": no, "title": r.title, "status": r.status,
                    "category": guess_category(no, r.title),
                    "publish_date": r.publish_date, "implement_date": r.implement_date,
                    "official_url": r.official_url, "download_allowed": False,
                }
            time.sleep(0.5)

    # ---- 3) 合并进快照 ----
    # ★ 已存在的条目要**覆盖重写** ★
    #   踩过：早先写成 `if no in d: continue`（已有就跳过），
    #   结果改完 guess_category 再跑一次，这批标准的老 category 还留在快照里，
    #   load() 不会重算 → 一级分类永远纠正不过来。
    #   这里显式覆盖：抓取脚本是"以本次核实为准"的单一入口。
    for code in ("SRC-05", "SRC-02", "SRC-01"):
        p = os.path.join(SNAP, f"{code}_latest.json")
        if not os.path.exists(p):
            continue
        d = json.load(io.open(p, encoding="utf-8"))
        n = 0
        for no, v in added.items():
            # 归到最合适的源快照：食安国标进 SRC-05，GB/T 进 SRC-02
            target = "SRC-05" if no.startswith("GB ") and "T" not in no[:4] else "SRC-02"
            tp = os.path.join(SNAP, f"{target}_latest.json")
            if not os.path.exists(tp):
                continue
            td = json.load(io.open(tp, encoding="utf-8"))
            fresh = no not in td or td[no].get("category") != v["category"]
            td[no] = v
            json.dump(td, io.open(tp, "w", encoding="utf-8"),
                      ensure_ascii=False, indent=1)
            if fresh:
                n += 1
        print("{}: 更新 {} 条".format(code, n))

    print()
    print("=== 本次补抓结果（{} 条）===".format(len(added)))
    for no, v in sorted(added.items()):
        print("  {:<18s} {:<44s} {:<6s} {} → {}".format(
            no, (v["title"] or "")[:44], v["status"] or "",
            v["publish_date"] or "-", v["implement_date"] or "-"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
