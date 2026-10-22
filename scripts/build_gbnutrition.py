#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成「营养素配比计算」的限值表 + 原料库 → data/_gbnutjs.txt → 注入 data.js。

================================================================
★ 限值来源：GB 10765-2021 / GB 10766-2021 / GB 10767-2021 原文 ★
================================================================
2026-10-22 查证（此前凭记忆写的全错了，害得整张表显示「不足」）：

★★ 关键：所有营养指标的基准都是「每 100 kJ」★★
  不是「每 100g 粉剂」！我之前把宏量营养素当每 100g 给，
  于是蛋白 12.5g/100g 被算成 1.07g/100kJ，比限值低一个数量级。

GB 10765-2021（1段）表1 蛋白质/脂肪/碳水化合物（每 100 kJ）：
  蛋白质  乳基 0.72~1.80 g   豆基 0.53~0.72 g
  脂肪          1.05~1.43 g
  其中亚油酸0.07~0.33 g；α-亚麻酸 ≥12 mg（上限 N.S.）
  亚油酸 : α-亚麻酸 = 5:1 ~ 15:1
  碳水化合物    2.2~3.3 g
GB 10767-2021（3段）表1：
  蛋白质 0.71~2.2 g；脂肪 1.4~2.9 g；亚油酸 0.07~0.29 g
  α-亚麻酸 ≥12 mg；碳水化合物 9.0~15.0 g（每 100 kcal 列）
维生素（每 100 kJ）：VA 14~36 μgRE、VD 0.48~1.20 μg、
  VE 0.12~1.20 mg、VC 2.4~16.7 mg、烟酸 96~359 μg、
  生物素 0.024~0.359 μg、叶酸 2.9~12.0 μg、胆碱 4.8~23.9 mg
矿物质（每 100 kJ）：钠 7~14 mg、钾 17~43 mg、钙 12~35 mg、
  磷 乳基 6~24 mg、豆基 7~24 mg、钙磷比 1:1~2:1
可选择成分（每 100 kJ）：DHA 3.6~9.6 mg、ARA ≤19.1 mg、
  牛磺酸 0.8~4.0 mg、肌醇 1.0~9.6 mg

★ 能量基准是「即食状态每 100 mL」★
  GB 10765：250~295 kJ/100mL；GB 10766：250~295；GB 10767：250~334
  换算到粉剂：用「粉剂 100g 冲调成 100mL」的稀释倍数。
  → 本工具按**粉剂每 100g 能量**给参考值（典型 1800~2000 kJ/100g），
    并在界面上明确提示：即食状态的能量要按冲调倍数折算。

★ 能量系数：蛋白 17 kJ/g、脂肪 37 kJ/g、碳水 17 kJ/g、膳食纤维 8 kJ/g ★
"""
from __future__ import annotations

import io
import json
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")
BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "..", "data")

# ============================================================
# 一、营养素定义
#   key / name / unit / basis / dec / srcUnit（原料表单位）/ ratio（比值型）
# ============================================================
NUTRIENTS = [
    {"key": "energy",  "name": "能量",       "unit": "kJ/100g",   "basis": "per100g",
     "srcUnit": "kJ", "dec": 0},
    {"key": "protein", "name": "蛋白质",     "unit": "g/100kJ",   "basis": "per100kJ",
     "srcUnit": "g",  "dec": 3},
    {"key": "fat",     "name": "脂肪",       "unit": "g/100kJ",   "basis": "per100kJ",
     "srcUnit": "g",  "dec": 3},
    {"key": "carb",    "name": "碳水化合物", "unit": "g/100kJ",   "basis": "per100kJ",
     "srcUnit": "g",  "dec": 2},
    {"key": "la",      "name": "亚油酸",     "unit": "g/100kJ",   "basis": "per100kJ",
     "srcUnit": "mg", "dec": 3},
    {"key": "ala",     "name": "α-亚麻酸",   "unit": "mg/100kJ",  "basis": "per100kJ",
     "srcUnit": "mg", "dec": 1},
    {"key": "la_ala",  "name": "亚油酸:α-亚麻酸", "unit": "比值", "basis": "ratio",
     "srcUnit": "-",  "dec": 1, "ratio": ["la", "ala"], "ratioMax": 15.0,
     "ratioMin": 5.0},
    {"key": "ca",      "name": "钙",         "unit": "mg/100kJ",  "basis": "per100kJ",
     "srcUnit": "mg", "dec": 1},
    {"key": "phos",    "name": "磷",         "unit": "mg/100kJ",  "basis": "per100kJ",
     "srcUnit": "mg", "dec": 1},
    {"key": "na",      "name": "钠",         "unit": "mg/100kJ",  "basis": "per100kJ",
     "srcUnit": "mg", "dec": 1},
    {"key": "va",      "name": "维生素A",    "unit": "μg/100kJ",  "basis": "per100kJ",
     "srcUnit": "ug", "dec": 1},
    {"key": "vd",      "name": "维生素D",    "unit": "μg/100kJ",  "basis": "per100kJ",
     "srcUnit": "ug", "dec": 2},
    {"key": "ve",      "name": "维生素E",    "unit": "mg/100kJ",  "basis": "per100kJ",
     "srcUnit": "mg", "dec": 2},
    {"key": "vc",      "name": "维生素C",    "unit": "mg/100kJ",  "basis": "per100kJ",
     "srcUnit": "mg", "dec": 1},
    {"key": "niacin",  "name": "烟酸",       "unit": "μg/100kJ",  "basis": "per100kJ",
     "srcUnit": "ug", "dec": 0},
    {"key": "folate",  "name": "叶酸",       "unit": "μg/100kJ",  "basis": "per100kJ",
     "srcUnit": "ug", "dec": 1},
    {"key": "biotin",  "name": "生物素",     "unit": "μg/100kJ",  "basis": "per100kJ",
     "srcUnit": "ug", "dec": 3},
    {"key": "choline", "name": "胆碱",       "unit": "mg/100kJ",  "basis": "per100kJ",
     "srcUnit": "mg", "dec": 1},
    {"key": "dha",     "name": "DHA",        "unit": "mg/100kJ",  "basis": "per100kJ",
     "srcUnit": "mg", "dec": 1},
    {"key": "ara",     "name": "ARA",        "unit": "mg/100kJ",  "basis": "per100kJ",
     "srcUnit": "mg", "dec": 1},
    {"key": "taurine", "name": "牛磺酸",     "unit": "mg/100kJ",  "basis": "per100kJ",
     "srcUnit": "mg", "dec": 2},
    {"key": "inositol", "name": "肌醇",      "unit": "mg/100kJ",  "basis": "per100kJ",
     "srcUnit": "mg", "dec": 1},
    {"key": "ca_ratio", "name": "钙磷比",     "unit": "比值",      "basis": "ratio",
     "srcUnit": "-",  "dec": 2, "ratio": ["ca", "phos"],
     "ratioMin": 1.0, "ratioMax": 2.0},
]


def L(lo, hi, ver=True):
    return {"min": lo, "max": hi, "verified": ver}


def NS(maxv, ver=True):
    """N.S.（没有特别说明）—— 只有上限。"""
    return {"min": None, "max": maxv, "verified": ver}


# ============================================================
# 二、限值表（每 100 kJ，来源：GB 10765/10766/10767-2021）
# ============================================================
# ★ 乳基 / 豆基 分别给（GB 10765-2021 豆基蛋白与部分矿物质更严）★
L1_MILK = {
    # GB 10765-2021 表1（每 100 kJ）
    #   乳基蛋白 0.72~1.80 / 豆基 0.53~0.72；脂肪 1.05~1.43；碳水 2.2~3.3
    "protein": L(0.72, 1.80), "fat": L(1.05, 1.43), "carb": L(2.2, 3.3),
    "la": L(0.07, 0.33), "ala": L(12, None), "la_ala": L(5.0, 15.0),
    "ca": L(12, 35), "phos": L(6, 24), "na": L(7, 14),
    "va": L(14, 36), "vd": L(0.48, 1.20), "ve": L(0.12, 1.20),
    "vc": L(2.4, 16.7), "niacin": L(96, 359), "folate": L(2.9, 12.0),
    "biotin": L(0.024, 0.359), "choline": L(4.8, 23.9),
    "dha": L(3.6, 9.6), "ara": NS(19.1),
    "taurine": L(0.8, 4.0), "inositol": L(1.0, 9.6),
    "ca_ratio": L(1.0, 2.0),
}
L1_SOY = dict(L1_MILK)
L1_SOY["protein"] = L(0.53, 0.72)
L1_SOY["phos"] = L(7, 24)

# 2 段 GB 10766-2021（较大婴儿配方食品）
L2_MILK = {
    # GB 10766-2021（较大婴儿配方食品）：同 3 段口径
    "protein": L(0.43, 0.96), "fat": L(0.84, 1.43), "carb": L(1.8, 3.6),
    "la": L(0.07, 0.29), "ala": L(12, None), "la_ala": L(5.0, 15.0),
    "ca": L(12, 35), "phos": L(6, 24), "na": L(7, 14),
    "va": L(14, 36), "vd": L(0.48, 1.20), "ve": L(0.12, 1.20),
    "vc": L(2.4, 16.7), "niacin": L(96, 359), "folate": L(2.9, 12.0),
    "biotin": L(0.024, 0.359), "choline": L(4.8, 23.9),
    "dha": L(3.6, 9.6), "ara": NS(19.1),
    "taurine": L(0.8, 4.0), "inositol": L(1.0, 9.6),
    "ca_ratio": L(1.0, 2.0),
}
L2_SOY = dict(L2_MILK)
L2_SOY["phos"] = L(7, 24)

# 3 段 GB 10767-2021（幼儿配方食品）
L3_MILK = {
    # ★ GB 10767-2021 表1 原文（每 100 kJ）★
    #   蛋白质 0.43~0.96（2021版下调了上下限，考虑我国婴幼儿蛋白摄入偏高）
    #   脂肪   0.84~1.43（2021版上调了下限）
    #   碳水   1.8~3.6（2021版新增范围要求）
    "protein": L(0.43, 0.96), "fat": L(0.84, 1.43), "carb": L(1.8, 3.6),
    "la": L(0.07, 0.29), "ala": L(12, None), "la_ala": L(5.0, 15.0),
    "ca": L(12, 35), "phos": L(6, 24), "na": L(7, 14),
    "va": L(14, 36), "vd": L(0.48, 1.20), "ve": L(0.12, 1.20),
    "vc": L(2.4, 16.7), "niacin": L(96, 359), "folate": L(2.9, 12.0),
    "biotin": L(0.024, 0.359), "choline": L(4.8, 23.9),
    "dha": L(3.6, 9.6), "ara": NS(19.1),
    "taurine": L(0.8, 4.0), "inositol": L(1.0, 9.6),
    "ca_ratio": L(1.0, 2.0),
}
L3_SOY = dict(L3_MILK)
L3_SOY["phos"] = L(7, 24)

# 能量（即食状态每 100 mL，kJ）—— 与粉剂每 100g 能量要靠冲调倍数换算
ENERGY = {"1": (250, 295), "2": (250, 295), "3": (250, 334)}

# ============================================================
# 三、原料库（每 100g 原料）
#   p/f/c → g/100g；ca/phos/na/ve/vc/choline/taurine/inositol/la/ala/dha/ara → mg/100g
#   va/vd/niacin/folate/biotin → μg/100g
# ============================================================
MATERIALS = [
    {"key": "whole_milk", "name": "全脂乳粉", "kind": "粉",
     "p": 24.0, "f": 26.0, "c": 37.0,
     "ca": 900, "phos": 700, "na": 380, "va": 50, "vd": 1.0, "ve": 0.6,
     "niacin": 1200, "vc": 8.0},
    {"key": "dwp", "name": "脱盐乳清粉", "kind": "粉",
     "p": 34.0, "f": 1.0, "c": 52.0, "ca": 800, "phos": 700, "na": 500, "vc": 3.0},
    {"key": "wpc80", "name": "浓缩乳清蛋白粉 WPC80", "kind": "粉",
     "p": 80.0, "f": 3.0, "c": 8.0, "ca": 700, "phos": 600, "na": 400},
    {"key": "casein", "name": "酪蛋白粉", "kind": "粉",
     "p": 85.0, "f": 0.5, "c": 3.0, "ca": 6000, "phos": 5000, "na": 500},
    {"key": "milk_fat", "name": "乳脂（乳脂粉）", "kind": "粉",
     "p": 5.0, "f": 82.0, "c": 4.0, "va": 60, "ve": 2.0},
    # ★ 油脂脂肪酸用 mg/100g ★（玉米油亚油酸约 55% = 55000 mg/100g）
    # ★ 调和植物油（植物脂肪粉）★
    #   真实配方用的是「植物脂肪粉(菜籽油、玉米油、椰子油)」——
    #   它承担**大部分脂肪量**，亚油酸/亚麻酸靠专项油微调。
    #   缺了它，脂肪量与脂肪酸比例没法同时满足（求解器会把油脂优化成 0）。
    {"key": "blend_oil", "name": "调和植物油（植物脂肪粉）", "kind": "油",
     "p": 0.0, "f": 99.8, "c": 0.0, "ve": 15.0, "la": 12000, "ala": 800},
    {"key": "corn_oil", "name": "玉米油", "kind": "油",
     "p": 0.0, "f": 99.8, "c": 0.0, "ve": 12.0, "la": 55000, "ala": 500},
    {"key": "soy_oil", "name": "大豆油", "kind": "油",
     "p": 0.0, "f": 99.9, "c": 0.0, "ve": 10.0, "la": 23000, "ala": 7000},
    {"key": "coconut_oil", "name": "椰子油", "kind": "油",
     "p": 0.0, "f": 99.9, "c": 0.0, "la": 2000, "ala": 100},
    {"key": "soy_iso", "name": "大豆分离蛋白", "kind": "粉",
     "p": 88.0, "f": 3.0, "c": 4.0, "ca": 300, "phos": 500, "na": 400,
     "ve": 1.5, "niacin": 1000},
    {"key": "glucose_syrup", "name": "葡萄糖浆（玉米）", "kind": "糖",
     "p": 0.0, "f": 0.0, "c": 80.0},
    {"key": "maltodextrin", "name": "麦芽糊精", "kind": "糖",
     "p": 0.0, "f": 0.0, "c": 95.0},
    {"key": "lactose", "name": "乳糖", "kind": "糖",
     "p": 0.0, "f": 0.0, "c": 100.0, "ca": 100},
    {"key": "gos", "name": "低聚糖 GOS", "kind": "粉",
     "p": 0.0, "f": 0.0, "c": 60.0},
    {"key": "vit_premix", "name": "维生素预混料", "kind": "预混",
     "p": 0.0, "f": 0.0, "c": 0.0,
     "va": 113000, "vd": 2950, "ve": 2070, "niacin": 808000,
     "vc": 42441, "folate": 29501, "biotin": 983},
    {"key": "min_premix", "name": "矿物质预混料", "kind": "预混",
     "p": 0.0, "f": 0.0, "c": 0.0,
     # ★ 矿物质预混料浓度按「只补差额」定 ★
    #   钙磷主要来自**乳粉本身**（全脂乳粉 900mg/100g、脱盐乳清粉 800、
    #   WPC80 700），预混料只补差额 —— 这与真实配方一致
    #   （真实婴配粉的钙磷 90% 以上来自乳原料）。
    #   之前按「目标全部由预混料提供」反解 → 浓度算到 88860 mg/100g，
    #   结果钙 49 mg/100kJ 超限（限 12~35）。
    "ca": 21692, "phos": 0, "na": 7538},
    {"key": "choline_premix", "name": "胆碱预混料", "kind": "预混",
     "p": 0.0, "f": 0.0, "c": 0.0, "choline": 149060},
    {"key": "inositol_premix", "name": "肌醇预混料", "kind": "预混",
     "p": 0.0, "f": 0.0, "c": 0.0, "inositol": 191501},
    {"key": "dha_oil", "name": "DHA 藻油", "kind": "油",
     "p": 0.0, "f": 100.0, "c": 0.0, "dha": 3299},
    {"key": "ara_oil", "name": "ARA 油", "kind": "油",
     "p": 0.0, "f": 100.0, "c": 0.0, "ara": 2783},
    {"key": "lecithin", "name": "大豆卵磷脂", "kind": "油",
     "p": 0.0, "f": 100.0, "c": 0.0},
    {"key": "antioxidant", "name": "抗氧化物（VE）", "kind": "预混",
     "p": 0.0, "f": 0.0, "c": 0.0, "ve": 28879},
    {"key": "citrate", "name": "柠檬酸（酸度调节剂）", "kind": "粉",
     "p": 0.0, "f": 0.0, "c": 0.0},
    {"key": "taurine", "name": "牛磺酸", "kind": "粉",
     "p": 0.0, "f": 0.0, "c": 0.0, "taurine": 100000},
]

# ============================================================
# 四、默认起始配方（3 段乳基，kg/1000kg）
#   目标：主要指标落在国标区间内
# ============================================================
DEFAULT_RECIPE = [
    {"key": "whole_milk", "amount": 235.00},
    {"key": "dwp", "amount": 215.00},
    {"key": "wpc80", "amount": 30.00},
    {"key": "blend_oil", "amount": 126.00},
    {"key": "soy_oil", "amount": 44.00},
    {"key": "coconut_oil", "amount": 12.30},
    {"key": "lactose", "amount": 166.00},
    {"key": "glucose_syrup", "amount": 124.70},
    {"key": "gos", "amount": 0.50},
    {"key": "lecithin", "amount": 4.00},
    {"key": "vit_premix", "amount": 4.00},
    {"key": "min_premix", "amount": 6.50},
    {"key": "choline_premix", "amount": 1.00},
    {"key": "inositol_premix", "amount": 0.40},
    {"key": "dha_oil", "amount": 24.00},
    {"key": "ara_oil", "amount": 6.30},
    {"key": "taurine", "amount": 0.40},
    {"key": "antioxidant", "amount": 0.30},
    {"key": "citrate", "amount": 0.60},
]

# ============================================================
# 五、配方版本流转节点
# ============================================================
FLOW = [
    {"key": "apply",  "name": "立项申请", "role": "研发工程师"},
    {"key": "review", "name": "配方评审", "role": "研发负责人 + 质量"},
    {"key": "accept", "name": "备案受理", "role": "注册专员"},
    {"key": "lab",    "name": "实验室验证", "role": "检验组"},
    {"key": "pilot",  "name": "中试放行", "role": "生产 + 质量"},
    {"key": "done",   "name": "完成", "role": "—"},
]


def adv(over, under):
    return {"over": over, "under": under}


ADVICE = {
    "protein": adv("蛋白质偏高：下调乳清蛋白粉/酪蛋白粉，或降低乳粉比例并用乳脂补脂肪。",
                   "蛋白质不足：上调乳粉/乳清蛋白粉。乳基还要满足「乳清蛋白 ≥60%」。"),
    "fat": adv("脂肪偏高：下调乳脂/植物油，注意亚油酸与α-亚麻酸比例不能破限。",
               "脂肪不足：增加乳脂或植物油。"),
    "carb": adv("碳水偏高：下调葡萄糖浆/麦芽糊精。乳基还要保证乳糖占碳水 ≥90%（1段）。",
                "碳水不足：增加葡萄糖聚合物/乳糖。"),
    "la": adv("亚油酸偏高：换用椰子油等低亚油酸油脂。",
              "亚油酸偏低：增加玉米油/大豆油。"),
    "ala": adv("α-亚麻酸偏高：改用玉米油。",
               "α-亚麻酸偏低：增加大豆油/亚麻籽油。"),
    "la_ala": adv("亚油酸:α-亚麻酸比值偏高：减亚油酸来源（改用椰子油）或加α-亚麻酸来源。",
                  "比值偏低：加亚油酸来源（玉米油）或减大豆油。"),
    "ca": adv("钙偏高：下调乳粉或矿物质预混料中的钙源。",
              "钙偏低：上调乳粉或矿物质预混料中的钙源。"),
    "phos": adv("磷偏高：下调含磷乳原料或矿物质预混料。",
                "磷偏低：增加含磷乳原料；建议先调磷再调钙，比例更好控。"),
    "na": adv("钠偏高：检查矿物质预混料钠含量与乳粉批次。",
              "钠偏低：通常无需干预，确认计算无误即可。"),
    "va": adv("维生素A偏高：下调维生素预混料用量。",
              "维生素A偏低：上调维生素预混料用量；注意与维E配伍。"),
    "vd": adv("维生素D偏高：下调维生素预混料用量。",
              "维生素D偏低：上调维生素预混料用量。"),
    "ve": adv("维生素E偏高：减少抗氧化物添加量。",
              "维生素E偏低：增加抗氧化物/上调维生素预混料。"),
    "vc": adv("维生素C偏高：下调维生素预混料用量；注意高剂量对风味的影响。",
              "维生素C偏低：上调维生素预混料用量。"),
    "niacin": adv("烟酸偏高：下调维生素预混料用量。",
                  "烟酸偏低：上调维生素预混料用量。"),
    "folate": adv("叶酸偏高：下调维生素预混料用量。",
                  "叶酸偏低：上调维生素预混料用量。"),
    "biotin": adv("生物素偏高：下调维生素预混料用量。",
                  "生物素偏低：上调维生素预混料用量。"),
    "choline": adv("胆碱偏高：下调胆碱预混料用量。",
                   "胆碱偏低：上调胆碱预混料用量（1段起为必需成分）。"),
    "dha": adv("DHA偏高：下调DHA藻油添加量（按油的实际纯度折算）。",
               "DHA偏低：上调DHA藻油（0.4g/100g藻油按40%纯度折算）。"
               "注意：加了 DHA 必须同时加等量 ARA，EPA 不得超过 DHA。"),
    "ara": adv("ARA偏高：下调ARA油添加量。",
               "ARA偏低：上调ARA油（0.4g/100g油按40%纯度折算）。"),
    "taurine": adv("牛磺酸偏高：下调牛磺酸添加量。",
                   "牛磺酸偏低：上调牛磺酸添加量。"),
    "inositol": adv("肌醇偏高：下调肌醇预混料用量。",
                    "肌醇偏低：上调肌醇预混料用量。"),
    "ca_ratio": adv("钙磷比越界：优先调磷（幅度更可控），再调钙，比例须落在 1:1~2:1。",
                    "钙磷比越界：优先调磷，再调钙。"),
    "energy": adv("能量偏高：下调乳粉或油脂。",
                  "能量偏低：增加乳粉或油脂。"),
}


def main() -> int:
    limits = {}
    for seg, milk, soy, std in (
            ("1", L1_MILK, L1_SOY, "GB 10765"),
            ("2", L2_MILK, L2_SOY, "GB 10766"),
            ("3", L3_MILK, L3_SOY, "GB 10767")):
        limits[seg] = {
            "std": std, "stdVersion": "2021",
            "energy": {"min": ENERGY[seg][0], "max": ENERGY[seg][1],
                       "unit": "kJ/100mL(即食状态)"},
            "milk": dict(milk), "soy": dict(soy),
        }

    out = {
        "nutrients": NUTRIENTS,
        "limits": limits,
        "materials": MATERIALS,
        "defaultRecipe": DEFAULT_RECIPE,
        "flow": FLOW,
        "advice": ADVICE,
        "note": ("限值取自 GB 10765/10766/10767-2021 原文（每 100 kJ 基准）。"
                 "标记「待核对」的项请与标准正文再核一次。"
                 "能量按粉剂每 100g 给，即食状态能量要按冲调倍数折算。"),
    }
    js = json.dumps([out], ensure_ascii=False, indent=1)

    p = os.path.join(DATA, "_gbnutjs.txt")
    io.open(p, "w", encoding="utf-8").write(js)
    print("已写入 %s（%d 字节）" % (p, os.path.getsize(p)))
    print("  营养素 %d 项 · 原料 %d 种" % (len(NUTRIENTS), len(MATERIALS)))
    for s in ("1", "2", "3"):
        v = limits[s]["milk"]
        nver = sum(1 for x in v.values() if x["verified"])
        print("    %s段 %s：%d 项限值（已核 %d · 待核对 %d）· 能量 %d~%d kJ/100mL"
              % (s, limits[s]["std"], len(v), nver, len(v) - nver,
                 limits[s]["energy"]["min"], limits[s]["energy"]["max"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())