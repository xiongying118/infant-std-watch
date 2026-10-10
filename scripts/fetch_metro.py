#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""补录计量技术规范（JJF / JJG）——人工核实，走独立数据源。

★ 为什么不能用主流程抓 ★
  `SamrStdAdapter` / `OpenStdAdapter` 查的都是**标准委的 GB/GB-T 检索库**，
  实测搜 "JJF1070" 返回 total=0 —— 该库**不收录国家计量技术规范**。
  JJF/JJG 由市场监管总局计量标准管理处发布，官方入口是：
    · 计量标准规范全文公开系统 https://jjf.samr.gov.cn
    · 市场监管总局公告（批准发布/修改单）
  所以这类标准只能人工核实后补录，并明确标注来源。

★ 用户 2026-10-03 点名 JJF 1070，核实结论 ★
  截图里的 **JJF 1070 是旧版，已作废**：
    JJF 1070-2005  2005-10-09 发布 / 2006-01-01 实施
                    **2024-10-12 作废**（被 JJF 1070-2023 代替）
    JJF 1070-2023  2023-10-12 发布 / 2024-10-12 实施  ← 现行
                    另附 2024 年第 1 号修改单（总局 2024 年第 13 号公告，2024-04-09）
  配套的分产品子规范（都是现行）：
    JJF 1070.1-2011  肥皂        2011-01-21 发布 / 2012-02-01 实施
    JJF 1070.2-2011  小麦粉      2011-09-14 发布 / 2011-12-14 实施（另附 XG1-2012 修改单）
    JJF 1070.3-2021  大米        2021-10-18 发布 / 2022-04-18 实施

  依据：市场监管总局公告2023年第45号、2024年第13号；
       国家数字标准馆 / 各省标准信息公共服务平台备案信息。

合规：只录编号、名称、发布/实施日期、状态与官方入口，不存规范正文。
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

# 官方计量规范统一入口
METRO_URL = "https://jjf.samr.gov.cn"

# (标准号, 名称, 发布日期, 实施日期, 状态, 备注)
METRO = [
    ("JJF 1070-2023", "定量包装商品净含量计量检验规则",
     "2023-10-12", "2024-10-12", "现行",
     "代替 JJF 1070-2005；另附 2024 年第 1 号修改单"
     "（市场监管总局 2024 年第 13 号公告，2024-04-09）。"
     "适用于定量包装商品净含量的**计量监督检验和仲裁检验**，"
     "委托检验可参照。**实验室出具净含量数据时按它抽样与判定**。"),
    ("JJF 1070.1-2011", "定量包装商品净含量计量检验规则 肥皂",
     "2011-01-21", "2012-02-01", "现行", "JJF 1070 的分产品子规范。"),
    ("JJF 1070.2-2011", "定量包装商品净含量计量检验规则 小麦粉",
     "2011-09-14", "2011-12-14", "现行",
     "JJF 1070 的分产品子规范；另附 XG1-2012 修改单。"),
    ("JJF 1070.3-2021", "定量包装商品净含量计量检验规则 大米",
     "2021-10-18", "2022-04-18", "现行", "JJF 1070 的分产品子规范。"),
    # 已作废：保留在库里做 diff 基准（改了要知道），但清单页会自动过滤掉
    ("JJF 1070-2005", "定量包装商品净含量计量检验规则",
     "2005-10-09", "2006-01-01", "废止",
     "已于 2024-10-12 作废，被 JJF 1070-2023 代替。勿再使用。"),
    ("JJF 1070-2000", "定量包装商品净含量计量检验规则",
     "2000-07-03", "2000-09-01", "废止", "早已作废，被 JJF 1070-2005 代替。"),
]


def main() -> int:
    # ---- 1) 写进 general_refs.details（通则引用页的元数据源）----
    g = json.load(io.open(GP, encoding="utf-8"))
    details = g.setdefault("details", {})
    added = []
    for no, title, pub, imp, status, note in METRO:
        rec = {
            "std_no": no, "title": title, "status": status,
            "category": guess_category(no, title),
            "publish_date": pub, "implement_date": imp,
            "official_url": METRO_URL, "download_allowed": False,
            "note": note, "source": "人工核实（JJF 不在标准委检索库）",
        }
        if no not in details:
            added.append(no)
        details[no] = rec
    json.dump(g, io.open(GP, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("general_refs.details 新增 {} 条：{}".format(len(added), "、".join(added)))

    # ---- 2) 写进 SRC-02 快照（标准清单的数据源）----
    p = os.path.join(SNAP, "SRC-02_latest.json")
    d = json.load(io.open(p, encoding="utf-8"))
    n = 0
    for no, title, pub, imp, status, note in METRO:
        if no in d:
            continue
        d[no] = {
            "std_no": no, "title": title, "status": status,
            "category": guess_category(no, title),
            "publish_date": pub, "implement_date": imp,
            "official_url": METRO_URL, "download_allowed": False,
        }
        n += 1
    json.dump(d, io.open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("SRC-02 快照新增 {} 条".format(n))

    print()
    print("=== 补录结果（现行 + 已废止）===")
    for no, title, pub, imp, status, note in METRO:
        print("  {:<18s} {:<38s} {:<4s} {} → {}".format(
            no, title[:38], status, pub, imp))
    return 0


if __name__ == "__main__":
    sys.exit(main())
