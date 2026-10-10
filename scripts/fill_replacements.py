#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
按检测项目补全替代者
====================
★ 这是第四轮返工的另一半 ★

光改判定逻辑不够 —— **替代者本身不在库里**。

根因：库是按"通则引用的标准号"建的，而通则引用的是**老编号**
（GB 10765-2021 规范性引用文件里写的是 GB 5413.14），
新版 GB 5009.285 从来没被检索过，于是：
  · 库里没有替代者 → 跨号判定找不到
  · 实验室真正该用的新方法不在监控范围里

补救：把库里每条标准按"检测对象"归一化后，**拿这个关键词回官方源再搜一轮**，
把同检测对象、不同标准号的新版一并收进来。

实测能捞到（用户指出问题后才发现）：
  GB 5009.285-2022  食品中维生素B12的测定      ← 替 GB 5413.14-2010
  GB 5009.296-2023  食品中维生素D的测定        ← 维D 独立新方法
  GB 5009.183-2025  食品中脲酶的测定           ← 替 GB 5413.31-2013
  GB 5009.300-2025  食品中左旋肉碱的测定        ← 替 GB 29989-2013
  GB 5009.140-2023  食品中钾、钠的测定          ← 替 GB 5009.91-2017
"""
from __future__ import annotations

import io
import json
import os
import re
import sys
import time
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import verify_validity2 as V
from sources import CfsaSpptAdapter, SamrStdAdapter

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "..", "data")


def main():
    g = json.load(io.open(os.path.join(DATA, "general_refs.json"), encoding="utf-8"))
    details = dict(g.get("details") or {})

    # 1) 检测对象来源：库里的 + 一份固定的"实验室常测项目"全表
    #    ★ 必须加固定全表 ★（踩过）：只从库里提取的话，触发不了库外的新标准。
    #    实测：通则引用的是 GB 5009.82（维生素 A、D、E 合并测定），
    #    所以"维生素 D"这个对象在库里压根不存在 → GB 5009.296-2023 永远捞不到，
    #    而它正是通则 2021 版发布之后新增的独立方法（用户指出过）。
    subjects = set(V.LAB_SUBJECTS)
    for v in details.values():
        s = V.subject_of(v.get("title", ""))
        if s:
            subjects.add(s)
    subjects = sorted(subjects)
    print("待查检测对象 {} 个（含实验室常测全表）".format(len(subjects)))

    # 2) 每个检测对象回源搜一轮
    #    ★ 必须按"别名"逐个搜 ★（踩过）：归一化后叫"维生素C"，
    #    但官方源里 `GB 5009.86 食品中抗坏血酸的测定` 用的是化学名，
    #    搜"维生素C"根本搜不到它 —— 只搜归一化名会漏掉真替代者。
    #    所以每个检测对象配一组检索别名，逐一搜、结果合并。
    SEARCH_ALIASES = {
        "维生素C": ["维生素C", "抗坏血酸"],
        "维生素B12": ["维生素B12"],
        "维生素A": ["维生素A"],
        "肌醇": ["肌醇"],
        "钾钠": ["钾、钠", "钾钠"],
        "钙铁锌钠钾镁铜锰": ["钙、铁、锌、钠、钾、镁、铜和锰"],
        # ★ 乳铁蛋白 ★（用户明确指出缺失）
        #   归一化名能搜到，但要连带把"营养强化剂 乳铁蛋白"（GB 1903.17）一起捞，
        #   否则只拿到测定方法、拿不到强化剂使用依据。
        "乳铁蛋白": ["乳铁蛋白"],
        # ★ 反式脂肪酸 ★
        #   GB 5009.257（食品中反式脂肪酸）现行，
        #   GB 5413.36-2026（特殊膳食用食品中脂肪酸和反式脂肪酸）2027-08-18 实施。
        #   两条都要在库，否则判定链断一半。
        "反式脂肪酸": ["反式脂肪酸", "特殊膳食用食品中脂肪酸和反式脂肪酸"],
        # ★ 污染物与糖类（用户指出缺失）★
        "亚硝酸盐与硝酸盐": ["亚硝酸盐", "硝酸盐"],
        "黄曲霉毒素B族和G族": ["黄曲霉毒素B"],
        "黄曲霉毒素M族": ["黄曲霉毒素M"],
        "糖类": ["果糖、葡萄糖、蔗糖、麦芽糖、乳糖"],
        "乳糖": ["乳糖"],
        "还原糖": ["还原糖"],
        "低聚半乳糖": ["低聚半乳糖"],
        "低聚果糖": ["低聚果糖"],
        "三聚氰胺": ["三聚氰胺"],
    }
    # ★ 部分检测对象必须补查 std.samr ★（踩过）
    #   sppt（食品安全国标库）里**没有** GB/T 22388-2008
    #   「原料乳与乳制品中三聚氰胺检测方法」—— 它是 GB/T 推荐性标准，
    #   只在 std.samr（全国标准信息公共服务平台）里。用户明确指出这条要收。
    #   但不是所有对象都要双源查：SAMR_ONLY 只在双源对象上加，
    #   否则每个检测对象都去查一遍，耗时翻倍。
    SAMR_ONLY = {"三聚氰胺", "亚硝酸盐与硝酸盐", "低聚半乳糖", "低聚果糖"}
    ads_main = [CfsaSpptAdapter()]
    ads_samr = SamrStdAdapter()
    found: dict[str, dict] = {}
    for subj in subjects:
        olds = [no for no, v in details.items() if V.subject_of(v.get("title", "")) == subj]
        keywords = SEARCH_ALIASES.get(subj, [subj])
        hits = []
        plan = ads_main + ([ads_samr] if subj in SAMR_ONLY else [])
        for kw in keywords:
            for ad in plan:
                try:
                    if ad is ads_samr:
                        # SamrStdAdapter.search 返回原始 JSON dict（total/rows），
                        # 不是 Standard 对象 —— 直接 extend 会拿到 dict 列表，
                        # 后面访问 s.title 就炸。必须先 _parse_rows 转。
                        raw = ad.search(kw)
                        hits.extend(ad._parse_rows(raw.get("rows", []) or []))
                    else:
                        hits.extend(ad.search(kw))
                except Exception as e:                      # noqa: BLE001
                    print("  搜「{}」@{} 失败：{}".format(kw, type(ad).__name__, e))
                time.sleep(0.8)
        got = 0
        for s in hits:
            s_subj = V.subject_of(s.title)
            if s_subj != subj or s.std_no in details or s.std_no in found:
                continue
            # 只收"食品中/乳中/婴幼儿食品中"的通用检测方法，
            # 排除食品接触材料、添加剂、农药残留等无关领域
            if not _is_food_method(s.title):
                continue
            found[s.std_no] = {
                "std_no": s.std_no, "title": s.title, "status": s.status,
                "category": s.category, "publish_date": s.publish_date,
                "implement_date": s.implement_date,
                "official_url": s.official_url,
                "download_allowed": s.download_allowed,
                "_subject": s_subj, "_replaces_hint": olds,
            }
            got += 1
        if got:
            print("  {:<14s} 新增 {} 条".format(subj, got))

    print("\n共补入 {} 条".format(len(found)))
    for no, v in sorted(found.items()):
        print("  {:20s} {:46s}".format(no, v["title"][:46]))

    # 3) 合并回库
    for no, v in found.items():
        details[no] = {k: val for k, val in v.items() if not k.startswith("_")}
    g["details"] = details
    json.dump(g, io.open(os.path.join(DATA, "general_refs.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print("\n库总量 → {}".format(len(details)))


# 只有"食品/乳/婴幼儿食品"的通用检测方法才入库
_IRRELEVANT = re.compile(
    r"食品接触材料|食品添加剂|营养强化剂|饲料|宠物|水产|农产品|茶叶|酒类|"
    r"蜂蜜|蜂王浆|植物源性|动物性|动物源|肉制品|乳饮料|冰淇淋|"
    r"食品生产通用卫生规范|餐饮|快餐|学生餐|特殊膳食|食品用香精|"
    # 农药残留 / 兽药 / 放射性 —— 实验室不测，且会污染判定
    r"农药|除草剂|残留量|有机磷|兽药|放射性|禁用物质|真菌毒素|污染物限量|"
    r"食品中反式脂肪酸的测定$|氯丙醇|磷酸盐|叶绿素|丙酸钠|β-羟基|"
    r"磷脂酰|专用于|肉中|水中|土壤")


def _is_food_method(title: str) -> bool:
    """只收"食品中/乳中/婴幼儿食品中"的通用检测方法。"""
    if not title:
        return False
    if _IRRELEVANT.search(title):
        return False
    return bool(re.search(
        r"食品中|乳中|乳与乳制品|婴幼儿食品|食品微生物学检验|食品理化检验|食品毒理",
        title))


if __name__ == "__main__":
    main()
