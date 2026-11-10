#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成「营养素配比计算」的完整指标表 + 限值表 + 原料库 → data/_gbnutjs.txt。

================================================================
★ 2026-11-09 用户要求「按三个产品标准补充完整」★
================================================================
此前只列了 23 项营养素、20 个原料字段，三段限值还大量互相抄，
不是完整的产品标准口径。本版按三份标准原文逐表重录：

  GB 10765-2021《婴儿配方食品》      0~6 月龄   1 段
  GB 10766-2021《较大婴儿配方食品》  6~12 月龄  2 段
  GB 10767-2021《幼儿配方食品》      12~36 月龄 3 段

查证来源（2026-11-09 下载原文 / 官方全文转载）：
  · GB 10765-2021 标准全文 PDF（国家卫健委发布，fzmq.gov.cn 镜像）
     表1 宏量 / 表2 维生素(14 项) / 表3 矿物质(13 项+钙磷比) / 表4 可选(5 项)
  · GB 10766-2021 标准全文（trfsz.com 全文 + CFSA 新旧对照 PDF）
     表1 宏量 / 表2 维生素 / 表3 矿物质 / 表4 可选，能量 250~314 kJ/100mL
  · GB 10767-2021 标准全文 PDF（CIRS 镜像，8 页）
     表1 宏量 / 表2 维生素 / 表3 矿物质 / 表4 可选，能量 250~334 kJ/100mL

★★ 口径 ★★
  · 除「能量」外，所有指标基准都是**每 100 kJ**（不是每 100g 粉剂）。
  · 能量标准值按**即食状态每 100 mL**；工具按粉剂每 100g 算，
    界面同时给出该段位即食能量区间，需按冲调倍数折算后比对。
  · 1/2 段把胆碱、锰、硒列为必需成分；3 段把它们放到表 4 可选成分。
  · 豆基与乳基在蛋白质、铁、锌、磷上要求不同（各段分别覆盖）。
  · N.S. = 没有特别说明 → 只有上限或只有下限。

★★ 原料成分表 ★★
  全表 36 个可录入成分字段（对应 39 项指标减去能量与 2 个比值）。
  内置数值是**行业典型参考值 / 演示数据**，不是供应商 CoA 实测值；
  页面已开放逐项区间录入、自定义原料、CSV 批量导入，用户录入值
  存浏览器本地并覆盖同名键，不会被这里重建覆盖。
  预混料浓度由 calibrate_premixes() 按「3 段乳基限值中值 − 基础原料本底」
  反解，保证默认配方在新指标上不是整表飘红。
"""
from __future__ import annotations

import io
import json
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")
BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "..", "data")

G_MACRO, G_VIT, G_MIN, G_OPT = "宏量营养素", "维生素", "矿物质", "可选择成分"


def N(key, name, unit, dec, src, group, basis="per100kJ",
      ratio=None, ratio_min=None, ratio_max=None, optional_segs=()):
    """一条营养素定义。src = 原料表里的单位（g / mg / ug）。"""
    d = {"key": key, "name": name, "unit": unit, "basis": basis,
         "srcUnit": src, "dec": dec, "group": group}
    if basis == "ratio":
        d["ratio"] = ratio
        d["ratioMin"] = ratio_min
        d["ratioMax"] = ratio_max
    if optional_segs:
        d["optionalSegs"] = list(optional_segs)
    return d


# ============================================================
# 一、营养素定义（39 项 = 三个产品标准表 1~4 的并集）
#   7 宏量 + 14 维生素 + 13 矿物质 + 5 可选成分
# ============================================================
NUTRIENTS = [
    # ---- 表 1 宏量营养素 ----
    N("energy",  "能量",              "kJ/100g", 0, "-",  G_MACRO, basis="per100g"),
    N("protein", "蛋白质",            "g/100kJ",  3, "g",  G_MACRO),
    N("fat",     "脂肪",              "g/100kJ",  3, "g",  G_MACRO),
    N("carb",    "碳水化合物",        "g/100kJ",  2, "g",  G_MACRO),
    N("la",      "亚油酸",            "g/100kJ",  3, "mg", G_MACRO),
    N("ala",     "α-亚麻酸",          "mg/100kJ", 1, "mg", G_MACRO),
    N("la_ala",  "亚油酸:α-亚麻酸",   "比值",     1, "-",  G_MACRO,
      basis="ratio", ratio=["la", "ala"], ratio_min=5.0, ratio_max=15.0),
    # ---- 表 2 维生素 ----
    N("va",          "维生素A（RE）",   "μg/100kJ", 1, "ug", G_VIT),
    N("vd",          "维生素D",         "μg/100kJ", 2, "ug", G_VIT),
    N("ve",          "维生素E（α-TE）", "mg/100kJ", 2, "mg", G_VIT),
    N("vk1",         "维生素K1",        "μg/100kJ", 2, "ug", G_VIT),
    N("vb1",         "维生素B1",        "μg/100kJ", 1, "ug", G_VIT),
    N("vb2",         "维生素B2",        "μg/100kJ", 1, "ug", G_VIT),
    N("vb6",         "维生素B6",        "μg/100kJ", 1, "ug", G_VIT),
    N("vb12",        "维生素B12",       "μg/100kJ", 3, "ug", G_VIT),
    N("niacin",      "烟酸（烟酰胺）",  "μg/100kJ", 0, "ug", G_VIT),
    N("folate",      "叶酸",            "μg/100kJ", 1, "ug", G_VIT),
    N("pantothenic", "泛酸",            "μg/100kJ", 0, "ug", G_VIT),
    N("vc",          "维生素C",         "mg/100kJ", 1, "mg", G_VIT),
    N("biotin",      "生物素",          "μg/100kJ", 2, "ug", G_VIT),
    N("choline",     "胆碱",            "mg/100kJ", 1, "mg", G_VIT,
      optional_segs=("3",)),
    # ---- 表 3 矿物质 ----
    N("na",        "钠",      "mg/100kJ", 1,  "mg", G_MIN),
    N("k",         "钾",      "mg/100kJ", 1,  "mg", G_MIN),
    N("cu",        "铜",      "μg/100kJ", 1,  "ug", G_MIN),
    N("mg",        "镁",      "mg/100kJ", 2,  "mg", G_MIN),
    N("fe",        "铁",      "mg/100kJ", 2,  "mg", G_MIN),
    N("zn",        "锌",      "mg/100kJ", 2,  "mg", G_MIN),
    N("mn",        "锰",      "μg/100kJ", 2,  "ug", G_MIN,
      optional_segs=("3",)),
    N("ca",        "钙",      "mg/100kJ", 1,  "mg", G_MIN),
    N("phos",      "磷",      "mg/100kJ", 1,  "mg", G_MIN),
    N("ca_ratio",  "钙磷比",  "比值",     2,  "-",  G_MIN,
      basis="ratio", ratio=["ca", "phos"], ratio_min=1.0, ratio_max=2.0),
    N("iodine",    "碘",      "μg/100kJ", 1,  "ug", G_MIN),
    N("chloride",  "氯",      "mg/100kJ", 1,  "mg", G_MIN),
    N("selenium",  "硒",      "μg/100kJ", 2,  "ug", G_MIN,
      optional_segs=("3",)),
    # ---- 表 4 可选择成分 ----
    N("inositol",  "肌醇",      "mg/100kJ", 1, "mg", G_OPT),
    N("taurine",   "牛磺酸",    "mg/100kJ", 2, "mg", G_OPT),
    N("carnitine", "左旋肉碱",  "mg/100kJ", 2, "mg", G_OPT),
    N("dha",       "DHA",       "mg/100kJ", 1, "mg", G_OPT),
    N("ara",       "ARA",       "mg/100kJ", 1, "mg", G_OPT),
]

# 营养素 key → 原料表字段名（39 项里除能量与 2 个比值外，全部可录入）
KEYMAP = {
    "protein": "p", "fat": "f", "carb": "c", "la": "la", "ala": "ala",
    "va": "va", "vd": "vd", "ve": "ve", "vk1": "vk1",
    "vb1": "vb1", "vb2": "vb2", "vb6": "vb6", "vb12": "vb12",
    "niacin": "niacin", "folate": "folate", "pantothenic": "panto",
    "vc": "vc", "biotin": "biotin", "choline": "choline",
    "na": "na", "k": "k", "cu": "cu", "mg": "mg", "fe": "fe", "zn": "zn",
    "mn": "mn", "ca": "ca", "phos": "phos", "iodine": "iodine",
    "chloride": "chloride", "selenium": "se",
    "inositol": "inositol", "taurine": "taurine", "carnitine": "carnitine",
    "dha": "dha", "ara": "ara",
}
COMP_KEYS = list(KEYMAP.values())


def L(lo, hi, ver=True):
    return {"min": lo, "max": hi, "verified": ver}


def table(pairs):
    """(min,max) 元组表 → 限值字典；None 表示该侧 N.S.。"""
    return {k: L(lo, hi) for k, (lo, hi) in pairs.items()}


# ============================================================
# 二、三份产品标准限量表（每 100 kJ）
# ============================================================
# 1 段 GB 10765-2021（0~6 月龄，即食能量 250~295 kJ/100mL）
L1_BASE = {
    "protein": (0.43, 0.72), "fat": (1.05, 1.43), "carb": (2.2, 3.3),
    "la": (0.07, 0.33), "ala": (12, None), "la_ala": (5.0, 15.0),
    "va": (14, 36), "vd": (0.48, 1.20), "ve": (0.12, 1.20),
    "vk1": (0.96, 6.45), "vb1": (14, 72), "vb2": (19, 120),
    "vb6": (8.4, 41.8), "vb12": (0.024, 0.359), "niacin": (96, 359),
    "folate": (2.9, 12.0), "pantothenic": (96, 478),
    "vc": (2.4, 16.7), "biotin": (0.36, 2.39), "choline": (4.8, 23.9),
    "na": (7, 14), "k": (17, 43), "cu": (14.3, 28.7), "mg": (1.2, 3.6),
    "fe": (0.10, 0.36), "zn": (0.12, 0.36), "mn": (0.72, 23.90),
    "ca": (12, 35), "phos": (6, 24), "ca_ratio": (1.0, 2.0),
    "iodine": (3.6, 14.1), "chloride": (12, 38), "selenium": (0.72, 2.06),
    "inositol": (1.0, 9.6), "taurine": (0.8, 4.0), "carnitine": (0.3, None),
    "dha": (3.6, 9.6), "ara": (None, 19.1),
}
L1_MILK = table(L1_BASE)
L1_SOY = table(dict(L1_BASE, **{
    "protein": (0.53, 0.72), "fe": (0.15, 0.36),
    "zn": (0.18, 0.36), "phos": (7, 24),
}))

# 2 段 GB 10766-2021（6~12 月龄，即食能量 250~314 kJ/100mL）
L2_BASE = {
    "protein": (0.43, 0.84), "fat": (0.84, 1.43), "carb": (2.2, 3.3),
    "la": (0.07, 0.33), "ala": (12, None), "la_ala": (5.0, 15.0),
    "va": (18, 43), "vd": (0.48, 1.20), "ve": (0.14, 1.20),
    "vk1": (0.96, 6.45), "vb1": (14, 72), "vb2": (19, 120),
    "vb6": (11.0, 41.8), "vb12": (0.041, 0.359), "niacin": (110, 359),
    "folate": (2.4, 12.0), "pantothenic": (96, 478),
    "vc": (2.4, 16.7), "biotin": (0.41, 2.39), "choline": (4.8, 23.9),
    "na": (None, 20), "k": (18, 54), "cu": (8.4, 28.7), "mg": (1.2, 3.6),
    "fe": (0.24, 0.48), "zn": (0.12, 0.36), "mn": (0.24, 23.90),
    "ca": (17, 43), "phos": (8, 26), "ca_ratio": (1.2, 2.0),
    "iodine": (3.6, 14.1), "chloride": (None, 52), "selenium": (0.48, 2.06),
    "inositol": (1.0, 9.6), "taurine": (0.8, 4.0), "carnitine": (0.3, None),
    "dha": (3.6, 9.6), "ara": (None, 19.1),
}
L2_MILK = table(L2_BASE)
L2_SOY = table(dict(L2_BASE, **{
    "protein": (0.53, 0.84), "fe": (0.36, 0.48),
    "zn": (0.18, 0.36), "phos": (10, 26),
}))

# 3 段 GB 10767-2021（12~36 月龄，即食能量 250~334 kJ/100mL）
#   ★ 3 段把胆碱 / 锰 / 硒移入表 4 可选成分；DHA 只有上限，没有下限。
L3_BASE = {
    "protein": (0.43, 0.96), "fat": (0.84, 1.43), "carb": (1.8, 3.6),
    "la": (0.07, 0.33), "ala": (12, None), "la_ala": (5.0, 15.0),
    "va": (18, 43), "vd": (0.48, 1.20), "ve": (0.14, 1.20),
    "vk1": (0.96, 6.45), "vb1": (14, 72), "vb2": (19, 155),
    "vb6": (11.0, 41.8), "vb12": (0.041, 0.478), "niacin": (110, 359),
    "folate": (2.4, 12.0), "pantothenic": (96, 478),
    "vc": (2.4, 16.7), "biotin": (0.41, 2.39), "choline": (4.8, 23.9),
    "na": (None, 20), "k": (18, 69), "cu": (6.9, 34.9), "mg": (1.4, 4.3),
    "fe": (0.24, 0.60), "zn": (0.10, 0.31), "mn": (0.24, 23.90),
    "ca": (17, 50), "phos": (8, 26), "ca_ratio": (1.2, 2.0),
    "iodine": (1.4, 14.1), "chloride": (None, 52), "selenium": (0.48, 2.06),
    "inositol": (1.0, 9.6), "taurine": (0.8, 4.0), "carnitine": (0.3, None),
    "dha": (None, 9.6), "ara": (None, 19.1),
}
L3_MILK = table(L3_BASE)
L3_SOY = table(L3_BASE)   # 3 段标准表 1 未分乳基 / 豆基

STANDARDS = {
    "1": {"no": "GB 10765-2021", "name": "婴儿配方食品", "age": "0~6 月龄",
          "energy": "250~295 kJ/100mL", "energyMin": 250, "energyMax": 295},
    "2": {"no": "GB 10766-2021", "name": "较大婴儿配方食品", "age": "6~12 月龄",
          "energy": "250~314 kJ/100mL", "energyMin": 250, "energyMax": 314},
    "3": {"no": "GB 10767-2021", "name": "幼儿配方食品", "age": "12~36 月龄",
          "energy": "250~334 kJ/100mL", "energyMin": 250, "energyMax": 334},
}
ENERGY = {"1": (250, 295), "2": (250, 314), "3": (250, 334)}


# ============================================================
# 三、原料库（每 100g 原料）
#   p/f/c → g/100g；维生素/矿物质按各自 srcUnit（mg 或 μg）
#   ★ 全部 36 个字段都可在页面录入，没写到的字段按 0 计。
#   ★ 数值是行业典型参考值（演示），不是供应商 CoA 实测值。
# ============================================================
def M(key, name, kind, **vals):
    d = {"key": key, "name": name, "kind": kind}
    d.update(vals)
    return d


# 乳原料常见的微量营养素本底（每 100g），用于让内置参考值不只是 0
DAIRY = {
    "k": 1100, "mg": 85, "fe": 0.5, "zn": 3.0, "cu": 100, "mn": 50,
    "iodine": 20, "chloride": 1000, "se": 10,
    "vk1": 10, "vb1": 300, "vb2": 1200, "vb6": 300, "vb12": 2,
    "panto": 3000, "biotin": 20, "folate": 50,
    "choline": 100, "inositol": 40, "carnitine": 10,
}


def dairy(base, scale=1.0, **extra):
    d = {k: round(v * scale, 3) for k, v in DAIRY.items()}
    d.update(base)
    d.update(extra)
    return d


MATERIALS = [
    M("whole_milk", "全脂乳粉", "粉", **dairy(
        {"p": 24.0, "f": 26.0, "c": 37.0, "ca": 900, "phos": 700,
         "na": 380, "va": 50, "vd": 1.0, "ve": 0.6, "niacin": 1200,
         "vc": 8.0})),
    M("dwp", "脱盐乳清粉", "粉", **dairy(
        {"p": 34.0, "f": 1.0, "c": 52.0, "ca": 800, "phos": 700,
         "na": 500, "vc": 3.0}, scale=0.75)),
    M("wpc80", "浓缩乳清蛋白粉 WPC80", "粉", **dairy(
        {"p": 80.0, "f": 3.0, "c": 8.0, "ca": 700, "phos": 600,
         "na": 400}, scale=0.55)),
    M("casein", "酪蛋白粉", "粉", **dairy(
        {"p": 85.0, "f": 0.5, "c": 3.0, "ca": 6000, "phos": 5000,
         "na": 500}, scale=0.35)),
    M("milk_fat", "乳脂（乳脂粉）", "粉",
      p=5.0, f=82.0, c=4.0, va=60, ve=2.0, vk1=20, chloride=80),
    # ★ 油脂脂肪酸用 mg/100g ★（玉米油亚油酸约 55% = 55000 mg/100g）
    M("blend_oil", "调和植物油（植物脂肪粉）", "油",
      p=0.0, f=99.8, c=0.0, ve=15.0, la=12000, ala=800),
    M("corn_oil", "玉米油", "油",
      p=0.0, f=99.8, c=0.0, ve=12.0, la=55000, ala=500),
    M("soy_oil", "大豆油", "油",
      p=0.0, f=99.9, c=0.0, ve=10.0, la=23000, ala=7000),
    M("coconut_oil", "椰子油", "油",
      p=0.0, f=99.9, c=0.0, la=2000, ala=100),
    M("soy_iso", "大豆分离蛋白", "粉", **dairy(
        {"p": 88.0, "f": 3.0, "c": 4.0, "ca": 300, "phos": 500,
         "na": 400, "ve": 1.5, "niacin": 1000, "k": 800, "mg": 250,
         "fe": 8.0, "zn": 4.0, "cu": 1000, "mn": 2000, "folate": 200,
         "vb1": 500, "vb2": 300, "panto": 1500}, scale=0.0)),
    M("glucose_syrup", "葡萄糖浆（玉米）", "糖", p=0.0, f=0.0, c=80.0),
    M("maltodextrin", "麦芽糊精", "糖", p=0.0, f=0.0, c=95.0),
    M("lactose", "乳糖", "糖", p=0.0, f=0.0, c=100.0, ca=100),
    M("gos", "低聚糖 GOS", "粉", p=0.0, f=0.0, c=60.0),
    # 预混料的浓度由 calibrate_premixes() 反解，下面只是占位
    M("vit_premix", "维生素预混料", "预混", p=0.0, f=0.0, c=0.0),
    M("min_premix", "矿物质预混料", "预混", p=0.0, f=0.0, c=0.0),
    M("choline_premix", "胆碱预混料", "预混", p=0.0, f=0.0, c=0.0),
    M("inositol_premix", "肌醇预混料", "预混", p=0.0, f=0.0, c=0.0),
    M("dha_oil", "DHA 藻油", "油", p=0.0, f=100.0, c=0.0, dha=3299),
    M("ara_oil", "ARA 油", "油", p=0.0, f=100.0, c=0.0, ara=2783),
    M("lecithin", "大豆卵磷脂", "油", p=0.0, f=100.0, c=0.0),
    M("antioxidant", "抗氧化物（VE）", "预混", p=0.0, f=0.0, c=0.0, ve=28879),
    M("citrate", "柠檬酸（酸度调节剂）", "粉", p=0.0, f=0.0, c=0.0),
    M("taurine", "牛磺酸", "粉", p=0.0, f=0.0, c=0.0, taurine=100000),
]

# 每个预混料承担哪些营养素（反解时按这些 key 写入浓度）
PREMIX_MAP = {
    "vit_premix": ["va", "vd", "ve", "vk1", "vb1", "vb2", "vb6", "vb12",
                   "niacin", "folate", "pantothenic", "vc", "biotin", "carnitine"],
    "min_premix": ["na", "k", "cu", "mg", "fe", "zn", "mn", "ca", "phos",
                   "iodine", "chloride", "selenium"],
    "choline_premix": ["choline"],
    "inositol_premix": ["inositol"],
}


# ============================================================
# 四、默认起始配方（3 段乳基，kg/1000kg）
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
# 五、预混料浓度反解
#   页面公式：每 100kJ = v(每100g原料) × amt/1000 × 100/e100g × 单位系数
#   反解：v = (目标 − 基础原料本底) / (amt/1000 × 100/e100g × 单位系数)
#   目标取 3 段乳基限值中值（只有单侧时取下限 1.3 倍 / 上限 0.6 倍）。
# ============================================================
def _tu(unit):
    t = unit.split("/")[0].strip()
    return {"μg": "ug", "ug": "ug", "mg": "mg", "g": "g"}.get(t, t)


def _unit_factor(src, tu):
    if src == tu:
        return 1.0
    pairs = {("mg", "g"): 1e-3, ("g", "mg"): 1e3, ("g", "ug"): 1e6,
             ("mg", "ug"): 1e3, ("ug", "mg"): 1e-3, ("ug", "g"): 1e-6}
    return pairs.get((src, tu), 1.0)


def _target(lim):
    lo, hi = lim["min"], lim["max"]
    if lo is not None and hi is not None:
        return (lo + hi) / 2.0
    if lo is not None:
        return lo * 1.3
    if hi is not None:
        return hi * 0.6
    return 0.0


def calibrate_premixes(materials, recipe, limits):
    """把预混料的各成分浓度写成「让默认配方达标」的参考值。"""
    by_key = {m["key"]: m for m in materials}
    amt = {r["key"]: r["amount"] for r in recipe}
    nt = {x["key"]: x for x in NUTRIENTS}

    # 能量只由蛋白/脂肪/碳水决定（每 100g 成品）
    e100g = 0.0
    for r in recipe:
        m = by_key.get(r["key"], {})
        k = r["amount"] / 1000.0
        e100g += (m.get("p", 0) * 17 + m.get("f", 0) * 37
                  + m.get("c", 0) * 17) * k
    if e100g <= 0:
        return

    # 先把所有待反解字段清零，避免基础本底里混进上一轮的占位值
    for pk, keys in PREMIX_MAP.items():
        for nkey in keys:
            by_key[pk].pop(KEYMAP[nkey], None)

    def base_of(nkey):
        mk = KEYMAP[nkey]
        src, tu = nt[nkey]["srcUnit"], _tu(nt[nkey]["unit"])
        s = 0.0
        for r in recipe:
            m = by_key.get(r["key"], {})
            v = m.get(mk, 0) or 0
            s += v * (r["amount"] / 1000.0) * (100.0 / e100g) \
                 * _unit_factor(src, tu)
        return s

    for pk, keys in PREMIX_MAP.items():
        coef_base = (amt.get(pk, 0) / 1000.0) * (100.0 / e100g)
        if coef_base <= 0:
            continue
        for nkey in keys:
            if nkey not in limits:
                continue
            src, tu = nt[nkey]["srcUnit"], _tu(nt[nkey]["unit"])
            coef = coef_base * _unit_factor(src, tu)
            need = _target(limits[nkey]) - base_of(nkey)
            by_key[pk][KEYMAP[nkey]] = round(max(0.0, need) / coef, 2)


# ============================================================
# 六、配方版本流转节点 / 调整建议
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
                   "蛋白质不足：上调乳粉/乳清蛋白粉。乳基 1 段还要满足「乳清蛋白 ≥60%」。"),
    "fat": adv("脂肪偏高：下调乳脂/植物油，注意亚油酸与α-亚麻酸比例不能破限。",
               "脂肪不足：增加乳脂或植物油。"),
    "carb": adv("碳水偏高：下调葡萄糖浆/麦芽糊精。乳基 1/2 段要保证乳糖占碳水 ≥90%。",
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
    "k": adv("钾偏高：下调矿物质预混料钾源。", "钾偏低：上调矿物质预混料钾源。"),
    "cu": adv("铜偏高：下调矿物质预混料铜源。", "铜偏低：上调矿物质预混料铜源。"),
    "mg": adv("镁偏高：下调矿物质预混料镁源。", "镁偏低：上调矿物质预混料镁源。"),
    "fe": adv("铁偏高：下调矿物质预混料铁源；豆基下限高于乳基。",
              "铁偏低：上调矿物质预混料铁源。"),
    "zn": adv("锌偏高：下调矿物质预混料锌源。", "锌偏低：上调矿物质预混料锌源。"),
    "mn": adv("锰偏高：下调矿物质预混料锰源。", "锰偏低：上调矿物质预混料锰源。"),
    "iodine": adv("碘偏高：下调矿物质预混料碘源。", "碘偏低：上调矿物质预混料碘源。"),
    "chloride": adv("氯偏高：检查乳原料与预混料的氯化物。", "氯偏低：上调氯化物来源。"),
    "selenium": adv("硒偏高：下调矿物质预混料硒源。", "硒偏低：上调矿物质预混料硒源。"),
    "va": adv("维生素A偏高：下调维生素预混料用量。",
              "维生素A偏低：上调维生素预混料用量；注意与维E配伍。"),
    "vd": adv("维生素D偏高：下调维生素预混料用量。",
              "维生素D偏低：上调维生素预混料用量。"),
    "ve": adv("维生素E偏高：减少抗氧化物添加量。",
              "维生素E偏低：增加抗氧化物/上调维生素预混料。"),
    "vk1": adv("维生素K1偏高：下调维生素预混料用量。",
               "维生素K1偏低：上调维生素预混料用量。"),
    "vb1": adv("维生素B1偏高：下调维生素预混料用量。",
               "维生素B1偏低：上调维生素预混料用量。"),
    "vb2": adv("维生素B2偏高：下调维生素预混料用量。",
               "维生素B2偏低：上调维生素预混料用量。"),
    "vb6": adv("维生素B6偏高：下调维生素预混料用量。",
               "维生素B6偏低：上调维生素预混料用量。"),
    "vb12": adv("维生素B12偏高：下调维生素预混料用量。",
                "维生素B12偏低：上调维生素预混料用量。"),
    "niacin": adv("烟酸偏高：下调维生素预混料用量。",
                  "烟酸偏低：上调维生素预混料用量。"),
    "folate": adv("叶酸偏高：下调维生素预混料用量。",
                  "叶酸偏低：上调维生素预混料用量。"),
    "pantothenic": adv("泛酸偏高：下调维生素预混料用量。",
                       "泛酸偏低：上调维生素预混料用量。"),
    "vc": adv("维生素C偏高：下调维生素预混料用量；注意高剂量对风味的影响。",
              "维生素C偏低：上调维生素预混料用量。"),
    "biotin": adv("生物素偏高：下调维生素预混料用量。",
                  "生物素偏低：上调维生素预混料用量。"),
    "choline": adv("胆碱偏高：下调胆碱预混料用量。",
                   "胆碱偏低：上调胆碱预混料用量（1/2 段为必需成分，3 段为可选成分）。"),
    "inositol": adv("肌醇偏高：下调肌醇预混料用量。",
                    "肌醇偏低：上调肌醇预混料用量。"),
    "taurine": adv("牛磺酸偏高：下调牛磺酸添加量。",
                   "牛磺酸偏低：上调牛磺酸添加量。"),
    "carnitine": adv("左旋肉碱偏高：下调预混料中的左旋肉碱。",
                     "左旋肉碱偏低：上调预混料中的左旋肉碱。"),
    "dha": adv("DHA偏高：下调DHA藻油添加量（按油的实际纯度折算）。1/2 段下限 3.6 mg/100kJ。",
               "DHA偏低：上调DHA藻油。注意：加了 DHA 必须同时加等量 ARA，EPA 不得超过 DHA。"),
    "ara": adv("ARA偏高：下调ARA油添加量。",
               "ARA偏低：上调ARA油（DHA 与 ARA 需同量级）。"),
    "ca_ratio": adv("钙磷比越界：优先调磷（幅度更可控），再调钙。1 段 1:1~2:1，2/3 段 1.2:1~2:1。",
                    "钙磷比越界：优先调磷，再调钙。"),
    "energy": adv("能量偏高：下调乳粉或油脂。",
                  "能量偏低：增加乳粉或油脂。"),
}


def main() -> int:
    limits = {}
    for seg, milk, soy in (("1", L1_MILK, L1_SOY),
                           ("2", L2_MILK, L2_SOY),
                           ("3", L3_MILK, L3_SOY)):
        limits[seg] = {
            "std": STANDARDS[seg]["no"], "stdVersion": "2021",
            "stdName": STANDARDS[seg]["name"], "age": STANDARDS[seg]["age"],
            "energy": {"min": ENERGY[seg][0], "max": ENERGY[seg][1],
                       "unit": "kJ/100mL(即食状态)",
                       "text": STANDARDS[seg]["energy"]},
            "milk": dict(milk), "soy": dict(soy),
        }

    calibrate_premixes(MATERIALS, DEFAULT_RECIPE, L3_MILK)

    out = {
        "nutrients": NUTRIENTS,
        "keymap": KEYMAP,
        "groups": [G_MACRO, G_VIT, G_MIN, G_OPT],
        "standards": STANDARDS,
        "limits": limits,
        "materials": MATERIALS,
        "defaultRecipe": DEFAULT_RECIPE,
        "flow": FLOW,
        "advice": ADVICE,
        "note": ("限值逐表取自 GB 10765-2021 / GB 10766-2021 / GB 10767-2021 原文"
                 "（除能量外均为每 100 kJ）；1/2 段胆碱、锰、硒为必需成分，"
                 "3 段归入可选择成分；豆基在蛋白质、铁、锌、磷上与乳基不同。"
                 "能量按粉剂每 100g 计算，标准给的即食状态能量需按冲调倍数折算。"
                 "原料成分表是行业典型参考值（演示用），请用供应商 CoA 实测值覆盖。"),
    }
    js = json.dumps([out], ensure_ascii=False, indent=1)

    p = os.path.join(DATA, "_gbnutjs.txt")
    # ★ 必须显式 newline="\n" ★
    #   Windows 上文本模式默认写 CRLF，而远端 data.js 是 LF；
    #   把这个文件直接当段替换进去会混进 \r，且云端 inject_refdata.py
    #   在 Linux 读时又会把 \r\n 转成 \n —— 本地与云端产物不一致。
    io.open(p, "w", encoding="utf-8", newline="\n").write(js)
    print("已写入 %s（%d 字节）" % (p, os.path.getsize(p)))
    print("  营养素 %d 项（可录入原料字段 %d 个）· 原料 %d 种"
          % (len(NUTRIENTS), len(COMP_KEYS), len(MATERIALS)))
    for s in ("1", "2", "3"):
        v = limits[s]["milk"]
        print("    %s段 %s：%d 项限值 · 即食能量 %s"
              % (s, limits[s]["std"], len(v), limits[s]["energy"]["text"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
