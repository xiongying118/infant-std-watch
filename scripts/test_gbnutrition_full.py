#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""营养素配比计算 · 三份产品标准全项数据回归（2026-11-09）

用户要求「原料营养成分不够全，营养素的也是一样，补充完整，按三个产品标准来」。
本测试锁死：39 项指标 / 36 个可录入字段 / 三段限值逐表取自
GB 10765-2021、GB 10766-2021、GB 10767-2021 原文，乳基豆基分开，
以及预混料校准不会产出负数或 NaN。

跑法：python scripts/test_gbnutrition_full.py
"""
from __future__ import annotations

import importlib.util
import io
import json
import math
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")
BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(BASE)
spec = importlib.util.spec_from_file_location("bgn", os.path.join(BASE, "build_gbnutrition.py"))
bgn = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bgn)

PASS, FAIL = 0, 0


def ck(ok, msg):
    global PASS, FAIL
    if ok:
        PASS += 1
        print("  ✓ " + msg)
    else:
        FAIL += 1
        print("  ✗ " + msg)


def near(a, b, tol=1e-9):
    return a is not None and b is not None and abs(float(a) - float(b)) < tol


print("=== 指标定义完整性 ===")
NUT = bgn.NUTRIENTS
keys = [n["key"] for n in NUT]
ck(len(NUT) == 39, "营养素共 39 项（三份标准表 1~4 并集）")
ck(len(set(keys)) == 39, "指标 key 无重复")
groups = {}
for n in NUT:
    groups[n["group"]] = groups.get(n["group"], 0) + 1
ck(groups == {"宏量营养素": 7, "维生素": 14, "矿物质": 13, "可选择成分": 5},
   "分组 7 宏量 / 14 维生素 / 13 矿物质 / 5 可选成分（实际 %s）" % groups)
ck(len(bgn.KEYMAP) == 36, "原料可录入成分 36 个（39 减能量与 2 个比值）")
ck(len(set(bgn.KEYMAP.values())) == 36, "原料字段名无重复")
ck(set(bgn.KEYMAP) == set(keys) - {"energy", "la_ala", "ca_ratio"},
   "keymap 恰好覆盖全部可算指标，无遗漏无多余")
for nk in ("vk1", "vb1", "vb2", "vb6", "vb12", "pantothenic", "k", "cu",
           "mg", "fe", "zn", "mn", "iodine", "chloride", "selenium",
           "carnitine", "inositol", "taurine", "dha", "ara"):
    ck(nk in bgn.KEYMAP, "新指标可录入：" + nk)
for n in NUT:
    if n["basis"] == "ratio":
        ck(all(x in bgn.KEYMAP for x in n["ratio"]), "比值型分母分子都有原料字段：" + n["key"])

print("=== 三段限值（官方原文） ===")
SEGS = {"1": (bgn.L1_MILK, bgn.L1_SOY, "GB 10765-2021", 250, 295),
        "2": (bgn.L2_MILK, bgn.L2_SOY, "GB 10766-2021", 250, 314),
        "3": (bgn.L3_MILK, bgn.L3_SOY, "GB 10767-2021", 250, 334)}
for s, (milk, soy, std, elo, ehi) in SEGS.items():
    ck(len(milk) == 38, "%s段 %s 乳基 38 项限值" % (s, std))
    ck(len(soy) == 38, "%s段 %s 豆基 38 项限值" % (s, std))
    ck(all(k in milk for k in bgn.KEYMAP if k not in ("energy",)),
       "%s段 每个可算指标都有限值" % s)
    ck(bgn.ENERGY[s] == (elo, ehi), "%s段 即食能量 %d~%d kJ/100mL" % (s, elo, ehi))
    ck(bgn.STANDARDS[s]["no"] == std, "%s段 标准号 %s" % (s, std))

ck(near(bgn.L1_MILK["protein"]["max"], 0.72), "1 段乳基蛋白上限 0.72 g/100kJ")
ck(near(bgn.L1_MILK["protein"]["min"], 0.43), "1 段乳基蛋白下限 0.43 g/100kJ")
ck(near(bgn.L1_SOY["protein"]["min"], 0.53), "1 段豆基蛋白下限 0.53 g/100kJ")
ck(near(bgn.L1_MILK["va"]["max"], 36), "1 段 VA 上限 36 μg/100kJ")
ck(near(bgn.L1_MILK["biotin"]["min"], 0.36), "1 段生物素下限 0.36 μg/100kJ")
ck(near(bgn.L1_MILK["ca_ratio"]["min"], 1.0), "1 段钙磷比 1:1~2:1")
ck(near(bgn.L1_MILK["cu"]["min"], 14.3), "1 段铜下限 14.3 μg/100kJ")
ck(near(bgn.L1_MILK["selenium"]["min"], 0.72), "1 段硒下限 0.72 μg/100kJ")

ck(near(bgn.L2_MILK["protein"]["max"], 0.84), "2 段乳基蛋白上限 0.84 g/100kJ")
ck(near(bgn.L2_MILK["carb"]["min"], 2.2), "2 段碳水下限 2.2 g/100kJ")
ck(near(bgn.L2_MILK["vb6"]["min"], 11.0), "2 段 VB6 下限 11.0 μg/100kJ")
ck(near(bgn.L2_MILK["niacin"]["min"], 110), "2 段烟酸下限 110 μg/100kJ")
ck(bgn.L2_MILK["na"]["min"] is None and near(bgn.L2_MILK["na"]["max"], 20),
   "2 段钠只有上限 20 mg/100kJ（N.S. 下限）")
ck(near(bgn.L2_SOY["fe"]["min"], 0.36), "2 段豆基铁下限 0.36 mg/100kJ")
ck(near(bgn.L2_SOY["phos"]["min"], 10), "2 段豆基磷下限 10 mg/100kJ")

ck(near(bgn.L3_MILK["protein"]["max"], 0.96), "3 段蛋白上限 0.96 g/100kJ")
ck(near(bgn.L3_MILK["carb"]["max"], 3.6), "3 段碳水上限 3.6 g/100kJ")
ck(near(bgn.L3_MILK["vb2"]["max"], 155), "3 段 VB2 上限 155 μg/100kJ")
ck(near(bgn.L3_MILK["vb12"]["max"], 0.478), "3 段 VB12 上限 0.478 μg/100kJ")
ck(near(bgn.L3_MILK["k"]["max"], 69), "3 段钾上限 69 mg/100kJ")
ck(bgn.L3_MILK["dha"]["min"] is None and near(bgn.L3_MILK["dha"]["max"], 9.6),
   "3 段 DHA 只有上限 9.6 mg/100kJ")
ck(bgn.L1_MILK["dha"]["min"] is not None, "1 段 DHA 有下限 3.6 mg/100kJ")
ck(bgn.L3_MILK["ca_ratio"]["min"] == 1.2, "2/3 段钙磷比 1.2:1~2:1")
ck(bgn.L2_MILK["ca_ratio"]["min"] == 1.2, "2 段钙磷比 1.2:1~2:1")

# 三段不能还是同一份抄表
diff = sum(1 for k in bgn.KEYMAP
           if len({(bgn.L1_MILK[k]["min"], bgn.L1_MILK[k]["max"]),
                   (bgn.L2_MILK[k]["min"], bgn.L2_MILK[k]["max"]),
                   (bgn.L3_MILK[k]["min"], bgn.L3_MILK[k]["max"])}) > 1)
ck(diff >= 20, "三段限值存在实质差异（%d 项不同，不是互相抄表）" % diff)
ck(bgn.L1_SOY["protein"] != bgn.L1_MILK["protein"], "1 段乳基/豆基蛋白不同")
ck(bgn.L2_SOY["fe"] != bgn.L2_MILK["fe"], "2 段乳基/豆基铁不同")

print("=== 可选成分段位差异 ===")
opt = {n["key"]: n.get("optionalSegs", []) for n in NUT}
for k in ("choline", "mn", "selenium"):
    ck(opt.get(k) == ["3"], "%s 在 3 段列为可选择成分" % k)
ck("choline" in bgn.L3_MILK and "choline" in bgn.L1_MILK,
   "可选成分在三段都有可比对限值")

print("=== 原料库字段与预混料校准 ===")
mats = bgn.MATERIALS
ck(len(mats) >= 24, "内置原料 %d 种" % len(mats))
all_fields = set()
for m in mats:
    all_fields.update(m.keys())
ck(set(bgn.COMP_KEYS) <= all_fields,
   "36 个原料字段在内置库里都有出现（缺 %s）" % sorted(set(bgn.COMP_KEYS) - all_fields))
bgn.calibrate_premixes(mats, bgn.DEFAULT_RECIPE, bgn.L3_MILK)
bad = []
for pk, nks in bgn.PREMIX_MAP.items():
    m = next(x for x in mats if x["key"] == pk)
    for nk in nks:
        v = m.get(bgn.KEYMAP[nk])
        if v is None or not isinstance(v, (int, float)) or not math.isfinite(v) or v < 0:
            bad.append(pk + "." + nk)
ck(not bad, "预混料校准值全部为有限非负数（异常 %s）" % bad[:5])
ck(any(x.get("p", 0) > 0 for x in mats if x["key"] == "whole_milk"),
   "基础原料仍保留蛋白等原始成分")
ck(next(x for x in mats if x["key"] == "dha_oil")["dha"] > 0,
   "DHA 藻油保留有效成分含量")

print("=== 生成产物与 data.js 一致性 ===")
p = os.path.join(ROOT, "data", "_gbnutjs.txt")
d = json.load(io.open(p, encoding="utf-8"))[0]
ck(len(d["nutrients"]) == 39, "_gbnutjs.txt 里 39 项指标")
ck(len(d["keymap"]) == 36, "_gbnutjs.txt 里 36 个原料字段")
ck(set(d["limits"]) == {"1", "2", "3"}, "_gbnutjs.txt 三段限值齐全")
ck(all(len(d["limits"][s]["milk"]) == 38 for s in "123"),
   "_gbnutjs.txt 每段 38 项限值")
ck(len(d["materials"]) == len(mats), "_gbnutjs.txt 原料数量一致")
djs = io.open(os.path.join(ROOT, "prototype", "data.js"), encoding="utf-8").read()
ck("GBNUTRITION: [" in djs, "data.js 里有 GBNUTRITION 段")
for token in ("GB 10765-2021", "GB 10766-2021", "GB 10767-2021",
              "pantothenic", "左旋肉碱", "可选择成分"):
    ck(token in djs, "data.js 已注入：" + token)

print("\n通过 %d / 失败 %d" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
