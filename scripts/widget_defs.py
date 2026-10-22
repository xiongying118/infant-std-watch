#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""34 个功能点的「可交互组件」定义。

================================================================
为什么要有这个
================================================================
2026-10-22 用户原话：
  「我要的是这种能直接使用的，不是你告诉我实操步骤这种垃圾」
  「其他也是 全部重做 包括质量管理工具」

→ 每个功能点都要变成**能输入、能算、能出结果**的工具，
  而不是一段「实操步骤」文字。

----------------------------------------------------------------
组件类型（通用引擎在 index.html 的 QW_* 里）
----------------------------------------------------------------
table      可增删改的表格 + 判定列自动着色 + 统计
checklist  逐项判定清单 + 进度 + 问题清单
calc       专用计算（每个工具一个小函数，fn 指到它）
pareto     帕累托图：粘数据 → 真图 + 累计曲线 + 梯队划分
spc        SPC 控制图：粘数据 → 控制限 + 失控判定
histogram  直方图：粘数据 → 分组 + 形态判读
strata     层别法：粘数据 + 选维度 → 分组统计对比
fishbone   鱼骨图：六分支可填 + 候选根因标记
why        5Why：五层链式追问 + 终止层 + 横向展开
flow       流程推进（PDCA / 配方版本流转 / 注册申报）
sub        原料替代测算（成本 + 营养影响）
shelf      货架期推算（加速 + 实时留样交叉验证）
trace      批次追溯（正向 / 反向展开）
diff       版本对比（两版逐项差异）

seed 里给的是**示例种子数据**，不是空表 —— 空表没法演示。
"""
from __future__ import annotations

# ============================================================
# 质量管理工具（16 个）· 键 = toolKey
# ============================================================
QW = {
    # ---------------- 体系工具 ----------------
    "haccp": {
        "type": "table",
        "title": "HACCP 计划表",
        "addLabel": "加一道工序",
        "cols": [
            {"key": "step",  "label": "工序",       "type": "text", "w": "13%"},
            {"key": "bio",   "label": "生物危害",   "type": "text", "w": "12%"},
            {"key": "chem",  "label": "化学危害",   "type": "text", "w": "12%"},
            {"key": "phys",  "label": "物理危害",   "type": "text", "w": "12%"},
            {"key": "ccp",   "label": "是否CCP",    "type": "select",
             "opts": ["是", "否", "待判定"], "w": "8%"},
            {"key": "limit", "label": "关键限（可测量数值）", "type": "text", "w": "17%"},
            {"key": "mon",   "label": "监控方式",   "type": "text", "w": "16%"},
            {"key": "fix",   "label": "纠偏措施",   "type": "text", "w": "16%"},
        ],
        "judge": {"col": "ccp", "bad": ["待判定"], "warn": ["待判定"]},
        "stats": [
            {"label": "工序数", "fn": "count"},
            {"label": "CCP 数", "fn": "countEq", "col": "ccp", "val": "是"},
            {"label": "待判定", "fn": "countEq", "col": "ccp", "val": "待判定"},
        ],
        "flags": [
            {"col": "ccp", "bad": ["待判定"], "text": "CCP 还没判定"},
            {"col": "limit", "empty": True, "text": "定了 CCP 却没写关键限"},
        ],
        "seed": [
            {"step": "原料奶接收", "bio": "致病菌（大肠菌群）", "chem": "兽药残留", "phys": "",
             "ccp": "否", "limit": "", "mon": "每批索取检验报告，季度现场审核", "fix": "报告不合格拒收"},
            {"step": "巴氏杀菌", "bio": "耐热菌芽孢残留", "chem": "", "phys": "",
             "ccp": "是", "limit": "72℃/15s 杀菌值 S≥3", "mon": "每批记录温度×时间，乳清蛋白磷酸酶试验", "fix": "偏离则隔离该批，复工至合格并记录"},
            {"step": "配料混合", "bio": "交叉污染", "chem": "预混料过量", "phys": "",
             "ccp": "是", "limit": "预混料添加量 ±2%，混合均匀度 CV≤5%", "mon": "称量双人复核，混合后取 5 点测均匀度", "fix": "重新混合，复测合格后放行"},
            {"step": "喷雾干燥", "bio": "", "chem": "", "phys": "金属异物",
             "ccp": "待判定", "limit": "", "mon": "每批金属探测", "fix": "剔除并追查前工序"},
            {"step": "灌装", "bio": "二次污染", "chem": "", "phys": "封口漏气",
             "ccp": "否", "limit": "", "mon": "在线检漏，密封性抽检", "fix": "停线检修密封头"},
        ],
    },
    "prp_oprp": {
        "type": "checklist",
        "title": "PRP/OPRP 核查表",
        "addLabel": "加一条检查点",
        "items": [
            {"t": "更衣室洗手池配皂液与烘手机", "hint": "缺一项即不符合"},
            {"t": "洗手流程图在位且张贴位置正确", "hint": "更衣室入口"},
            {"t": "工服每日更换、脏污随时更换", "hint": "查现场与更衣记录"},
            {"t": "清洗液浓度在有效范围并有记录", "hint": "例 200~250ppm，含测值"},
            {"t": "设备表面无积粉、无积水", "hint": "开机前查"},
            {"t": "虫害粘板编号齐全、粘板完好", "hint": "对照点位图"},
            {"t": "虫害检查记录当月齐全", "hint": "查最近一次"},
            {"t": "废弃物分类存放、当日清运", "hint": "查暂存区"},
            {"t": "批生产记录无空项、签章齐全", "hint": "抽查最近 3 批"},
            {"t": "洗眼器每周放水检查已记录", "hint": "查上周记录"},
        ],
        "judgeOptions": ["符合", "不符合", "不适用"],
        "bad": ["不符合"],
        "noteLabel": "不符合项描述",
        "needAction": "整改要求",
    },
    "iso22000": {
        "type": "table",
        "title": "内审 gap 分析表",
        "addLabel": "加一条条款",
        "cols": [
            {"key": "clause", "label": "标准条款", "type": "text", "w": "18%"},
            {"key": "now",    "label": "现状描述", "type": "text", "w": "22%"},
            {"key": "fit",    "label": "符合性",   "type": "select",
             "opts": ["符合", "部分符合", "不符合"], "w": "10%"},
            {"key": "evi",    "label": "证据",     "type": "text", "w": "18%"},
            {"key": "gap",    "label": "差距",     "type": "text", "w": "16%"},
            {"key": "act",    "label": "整改措施", "type": "text", "w": "16%"},
        ],
        "judge": {"col": "fit", "bad": ["不符合"], "warn": ["部分符合"]},
        "stats": [
            {"label": "条款数", "fn": "count"},
            {"label": "不符合", "fn": "countEq", "col": "fit", "val": "不符合"},
            {"label": "部分符合", "fn": "countEq", "col": "fit", "val": "部分符合"},
            {"label": "符合率", "fn": "rate", "col": "fit", "good": "符合"},
        ],
        "seed": [
            {"clause": "8.2 内部审核", "now": "有年度审核计划，上半年执行 1 次", "fit": "部分符合",
             "evi": "2026Q1 审核报告", "gap": "未覆盖全部过程、审核员独立性问题", "act": "增补夜班与外协工序，审核员交叉安排"},
            {"clause": "8.5 危害控制", "now": "HACCP 计划已建立", "fit": "符合",
             "evi": "HACCP 计划表 V3.2", "gap": "", "act": ""},
            {"clause": "9.1 监视测量分析", "now": "有检验记录", "fit": "部分符合",
             "evi": "检验记录 30 份", "gap": "趋势分析未系统开展", "act": "关键指标建控制图，季度评审"},
            {"clause": "9.2 内部验证", "now": "设备校准按计划", "fit": "符合",
             "evi": "校准证书 12 份", "gap": "", "act": ""},
            {"clause": "8.4 应急准备", "form": "", "now": "有应急预案文本", "fit": "不符合",
             "evi": "预案文本", "gap": "未演练，召回流程未覆盖", "act": "组织一次模拟召回演练"},
        ],
    },

    # ---------------- 问题分析 ----------------
    "fishbone": {
        "type": "fishbone",
        "title": "鱼骨图",
        "branches": [
            {"key": "man", "name": "人", "ph": "操作/培训/疲劳"},
            {"key": "mac", "name": "机", "ph": "设备/工装/维护"},
            {"key": "mat", "name": "料", "ph": "原料/包材/供应商"},
            {"key": "met", "name": "法", "ph": "工艺/方法/标准"},
            {"key": "env", "name": "环", "ph": "温湿度/空间/交叉污染"},
            {"key": "mea", "name": "测", "ph": "仪器/方法/抽样"},
        ],
        "seed": {
            "man": ["喷淋塔操作未按 SOP 定时清洗", "夜班人员流动大，新人多"],
            "mac": ["喷头部分堵塞", "除湿机滤网饱和"],
            "mat": ["乳清粉批次结块", "包材批次到货温控异常"],
            "met": ["加水量控制依赖人工目视", "清洗液浓度靠经验稀释"],
            "env": ["车间湿度升高（>65%）", "粉料间与投料间未隔断"],
            "mea": ["水分检测频次低（1次/班）", "取样点固定未覆盖出料口"],
        },
    },
    "five_why": {
        "type": "why",
        "title": "5Why 追根因",
        "levels": 5,
        "seed": {
            "problem": "3 罐产品检出金属异物",
            "chain": [
                {"why": "金属异物进入了罐内", "evi": "开罐发现 2mm 亮色金属屑", "veri": "已确认"},
                {"why": "密封垫磨损，金属屑从缝隙进入", "evi": "拆检密封垫发现磨损超标", "veri": "已确认"},
                {"why": "密封垫未按周期更换", "evi": "已使用 14 个月", "veri": "已确认"},
                {"why": "保养清单里没有这一项", "evi": "PM 清单 2019 年版无密封件条目", "veri": "已确认"},
                {"why": "PM 清单未随设备更新修订", "evi": "设备 2023 年改造，清单未同步", "veri": "已确认"},
            ],
        },
        "stopHint": "停在「能改动的地方」",
        "badWords": ["责任心", "不够认真", "疏忽", "培训不足", "意识淡薄"],
    },
    "pareto": {
        "type": "pareto",
        "title": "帕累托分析",
        "unit": "条",
        "seed": [
            {"cat": "包装密封性不合格", "n": 41},
            {"cat": "标签批号打印错", "n": 28},
            {"cat": "金属检出误报", "n": 10},
            {"cat": "灌装量偏差", "n": 9},
            {"cat": "粉体结块", "n": 7},
            {"cat": "外观色泽异常", "n": 5},
            {"cat": "其他", "n": 4},
        ],
    },
    "checklist": {
        "type": "table",
        "title": "点检 / 审核检查表",
        "addLabel": "加一条检查项",
        "cols": [
            {"key": "item", "label": "检查项目", "type": "text", "w": "30%"},
            {"key": "std",  "label": "判定标准", "type": "text", "w": "26%"},
            {"key": "val",  "label": "实测值",   "type": "text", "w": "16%"},
            {"key": "res",  "label": "判定",     "type": "select",
             "opts": ["合格", "不合格"], "w": "10%"},
            {"key": "fix",  "label": "异常处置", "type": "text", "w": "18%"},
        ],
        "judge": {"col": "res", "bad": ["不合格"]},
        "stats": [
            {"label": "检查项", "fn": "count"},
            {"label": "不合格", "fn": "countEq", "col": "res", "val": "不合格"},
            {"label": "合格率", "fn": "rate", "col": "res", "good": "合格"},
        ],
        "seed": [
            {"item": "清洗液浓度", "std": "200~250ppm", "val": "230", "res": "合格", "fix": ""},
            {"item": "工器具清洗后沥干", "std": "无积水", "val": "合格", "res": "合格", "fix": ""},
            {"item": "粉料间温度", "std": "≤25℃", "val": "27.4", "res": "不合格", "fix": "空调降温并复查"},
            {"item": "批号打印与配料单一致", "std": "完全一致", "val": "一致", "res": "合格", "fix": ""},
            {"item": "留样已入库并登记", "std": "当班完成", "val": "已完成", "res": "合格", "fix": ""},
        ],
    },

    # ---------------- 过程控制 ----------------
    "spc_control_chart": {
        "type": "spc",
        "title": "SPC 控制图（X 图）",
        "unit": "水分 %",
        "spec": {"low": 4.0, "high": 999, "label": "规格上限 ≤4.0%（内控 3.5%）"},
        "seed": [3.12, 3.18, 3.09, 3.22, 3.15, 3.11, 3.25, 3.19, 3.14, 3.08,
                 3.21, 3.17, 3.13, 3.24, 3.16, 3.20, 3.28, 3.31, 3.35, 3.42,
                 3.55, 3.61, 3.72, 3.85],
    },
    "histogram": {
        "type": "histogram",
        "title": "直方图",
        "unit": "粒度 D50 μm",
        "seed": [428, 435, 441, 447, 452, 458, 463, 469, 474, 480, 486, 491,
                 497, 503, 508, 514, 519, 525, 530, 536, 542, 547, 553, 558,
                 564, 569, 575, 581, 586, 592, 598, 603, 609, 614, 620, 626],
    },
    "stratification": {
        "type": "strata",
        "title": "层别分析",
        "dims": ["班次", "设备", "原料批次", "季节", "操作员", "供应商"],
        "seed": [
            {"dim": "班次", "grp": "甲班", "n": 120, "ok": 119},
            {"dim": "班次", "grp": "乙班", "n": 120, "ok": 115},
            {"dim": "设备", "grp": "1号喷雾塔", "n": 90, "ok": 90},
            {"dim": "设备", "grp": "2号喷雾塔", "n": 90, "ok": 89},
            {"dim": "设备", "grp": "3号喷雾塔", "n": 60, "ok": 54},
        ],
    },

    # ---------------- 现场管理 ----------------
    "five_s": {
        "type": "table",
        "title": "5S 责任区点检表",
        "addLabel": "加一个区域",
        "cols": [
            {"key": "zone", "label": "区域",       "type": "text", "w": "16%"},
            {"key": "item", "label": "标准",       "type": "text", "w": "26%"},
            {"key": "who",  "label": "责任人",     "type": "text", "w": "12%"},
            {"key": "freq", "label": "频次",       "type": "text", "w": "10%"},
            {"key": "res",  "label": "状态",       "type": "select",
             "opts": ["合格", "不合格"], "w": "10%"},
            {"key": "act",  "label": "整改内容",   "type": "text", "w": "26%"},
        ],
        "judge": {"col": "res", "bad": ["不合格"]},
        "stats": [
            {"label": "点检项", "fn": "count"},
            {"label": "不合格", "fn": "countEq", "col": "res", "val": "不合格"},
        ],
        "seed": [
            {"zone": "配粉间", "item": "所有物料离地 ≥30cm 上架", "who": "张班长", "freq": "每班", "res": "合格", "act": ""},
            {"zone": "配粉间", "item": "地面无空托盘纸箱", "who": "张班长", "freq": "每班", "res": "不合格", "act": "清空并划线定置"},
            {"zone": "灌装间", "item": "地面标线清晰、通道无堆物", "who": "李班长", "freq": "每班", "res": "不合格", "act": "重划黄色通道线"},
            {"zone": "空桶区", "item": "空桶加盖、离地存放", "who": "王班长", "freq": "每日", "res": "合格", "act": ""},
            {"zone": "检验室", "item": "试剂柜分类标识、标签朝外", "who": "检验组", "freq": "每周", "res": "合格", "act": ""},
        ],
    },
    "batch_trace": {
        "type": "trace",
        "title": "批次追溯演练",
        "forward": {
            "batch": "B260315",
            "chain": [
                {"level": "成品批", "no": "B260315", "info": "2段乳基 800g×24罐 · 2026-03-15 06:20 灌装"},
                {"level": "过程批", "no": "P260315-03", "info": "配料 2026-03-15 03:40 · 喷雾塔 2 号"},
                {"level": "原料批", "no": "R20260301", "info": "脱盐乳清粉 · 供应商 S · 到货 2026-03-02"},
                {"level": "原料批", "no": "W20260305", "info": "全脂乳粉 · 供应商 T · 到货 2026-03-06"},
                {"level": "包材批", "no": "K260311", "info": "马口铁罐 · 供应商 M · 到货 2026-03-11"},
            ],
        },
        "backward": {
            "batch": "R20260301",
            "products": [
                {"no": "B260315", "qty": "1860 罐", "cust": "华东经销商 A"},
                {"no": "B260316", "qty": "2400 罐", "cust": "华南经销商 B"},
                {"no": "B260318", "qty": "1200 罐", "cust": "西南经销商 C"},
            ],
        },
    },
    "allergen": {
        "type": "table",
        "title": "过敏原矩阵与换线控制",
        "addLabel": "加一个产品",
        "cols": [
            {"key": "prod",  "label": "产品",         "type": "text", "w": "16%"},
            {"key": "alg",   "label": "含何种过敏原", "type": "text", "w": "16%"},
            {"key": "src",   "label": "过敏原来源",   "type": "text", "w": "18%"},
            {"key": "clean", "label": "换线清洗要求", "type": "text", "w": "22%"},
            {"key": "label", "label": "标签提示语",   "type": "text", "w": "14%"},
            {"key": "res",   "label": "残留验证",     "type": "select",
             "opts": ["合格", "待验证", "不合格"], "w": "14%"},
        ],
        "judge": {"col": "res", "bad": ["不合格"], "warn": ["待验证"]},
        "stats": [
            {"label": "产品数", "fn": "count"},
            {"label": "待验证", "fn": "countEq", "col": "res", "val": "待验证"},
        ],
        "seed": [
            {"prod": "1段乳基", "alg": "乳", "src": "全脂乳粉/脱盐乳清粉/乳清蛋白粉",
             "clean": "—", "label": "含乳成分", "res": "合格"},
            {"prod": "2段乳基", "alg": "乳", "src": "同上",
             "clean": "—", "label": "含乳成分", "res": "合格"},
            {"prod": "3段豆基", "alg": "大豆", "src": "大豆分离蛋白/大豆油/大豆卵磷脂",
             "clean": "刮罐+CIP(2%碱30min)+酸洗+人工复擦", "label": "含大豆成分", "res": "合格"},
            {"prod": "乳基→豆基 换线", "alg": "乳→大豆", "src": "需彻底清除乳残留",
             "clean": "CIP+ ELISA 验证", "label": "—", "res": "待验证"},
        ],
    },

    # ---------------- 风险预防 ----------------
    "fmea": {
        "type": "table",
        "title": "FMEA 风险分析",
        "addLabel": "加一项失效模式",
        "cols": [
            {"key": "fn",   "label": "功能",       "type": "text", "w": "12%"},
            {"key": "fm",   "label": "失效模式",   "type": "text", "w": "16%"},
            {"key": "eff",  "label": "失效后果",   "type": "text", "w": "16%"},
            {"key": "s",    "label": "S", "type": "number", "w": "4%", "min": 1, "max": 10},
            {"key": "o",    "label": "O", "type": "number", "w": "4%", "min": 1, "max": 10},
            {"key": "d",    "label": "D", "type": "number", "w": "4%", "min": 1, "max": 10},
            {"key": "rpn",  "label": "RPN", "type": "computed", "w": "5%"},
            {"key": "act",  "label": "改进措施（优先防错）", "type": "text", "w": "23%"},
            {"key": "own",  "label": "责任人", "type": "text", "w": "8%"},
            {"key": "res",  "label": "验证", "type": "select",
             "opts": ["未做", "已验证", "不适用"], "w": "8%"},
        ],
        "computed": {
            "rpn": {"formula": "s*o*d", "label": "RPN=S×O×D",
                    "bands": [{"max": 60, "cls": "ok", "text": "低"},
                              {"max": 120, "cls": "warn", "text": "中"},
                              {"max": 1000, "cls": "bad", "text": "高"}]},
        },
        "sort": [{"col": "rpn", "dir": "desc"}],
        "judge": {"col": "res", "bad": ["未做"], "warn": ["未做"]},
        "stats": [
            {"label": "失效模式数", "fn": "count"},
            {"label": "RPN≥120", "fn": "countGe", "col": "rpn", "val": 120},
            {"label": "未验证", "fn": "countEq", "col": "res", "val": "未做"},
        ],
        "seed": [
            {"fn": "灌装封口", "fm": "漏封", "eff": "产品氧化变质、微生物进入",
             "s": 8, "o": 3, "d": 6, "act": "加装封口在线检测，检出即剔除（D→1）", "own": "设备组", "res": "已验证"},
            {"fn": "灌装封口", "fm": "封口强度不足", "eff": "运输中漏气",
             "s": 6, "o": 4, "d": 4, "act": "增加每周封口强度抽检并记录", "own": "质量组", "res": "已验证"},
            {"fn": "换批清洗", "fm": "残料带入下一批", "eff": "交叉污染、标签不符",
             "s": 9, "o": 4, "d": 5, "act": "加装清仓到位检测（未清仓不启动）", "own": "生产组", "res": "已验证"},
            {"fn": "配料称量", "fm": "称量误差", "eff": "营养素偏离",
             "s": 7, "o": 3, "d": 3, "act": "", "own": "", "res": "未做"},
        ],
    },
    "pdca": {
        "type": "flow",
        "title": "PDCA 改进循环",
        "phases": [
            {"key": "p", "name": "P 计划", "fields": [
                {"k": "现状数据", "v": "冲调失败率 3.0%（近 30 天，n=420）"},
                {"k": "目标值", "v": "≤1.0%，1 个月内达成"},
                {"k": "方案", "v": "调整冲调水温曲线 60→65℃；复核投料顺序"},
                {"k": "资源需求", "v": "1 名工艺员 3 天，无需额外设备"},
            ]},
            {"key": "d", "name": "D 执行", "fields": [
                {"k": "试点范围", "v": "A 产线 2 批次"},
                {"k": "责任人", "v": "陈工"},
                {"k": "时间节点", "v": "2026-04-05 ~ 04-12"},
            ]},
            {"key": "c", "name": "C 检查", "fields": [
                {"k": "试点结果", "v": "失败率 1.2%，n=140"},
                {"k": "与目标差距", "v": "差 0.2 个百分点，仍高于目标"},
            ]},
            {"key": "a", "name": "A 改进", "fields": [
                {"k": "标准化措施", "v": "水温曲线写入作业指导书 SOP-灌装-03 并更新培训"},
                {"k": "推广范围", "v": "全部 3 条产线"},
                {"k": "举一反三排查", "v": "所有涉及加热的工序复核温度曲线"},
                {"k": "跟踪期限", "v": "3 个月后复评"},
            ]},
        ],
        "keyPoint": "A 阶段不做 = 前面全白干。标准化与举一反三是 A 的核心。",
    },
    "poka_yoke": {
        "type": "table",
        "title": "防错设计清单",
        "addLabel": "加一条易错点",
        "cols": [
            {"key": "err",   "label": "易错场景",   "type": "text", "w": "18%"},
            {"key": "freq",  "label": "年发生次数", "type": "number", "w": "9%"},
            {"key": "sev",   "label": "后果严重度", "type": "number", "w": "9%"},
            {"key": "level", "label": "防错类型",   "type": "select",
             "opts": ["消除", "替代", "隔离", "报警", "提醒"], "w": "11%"},
            {"key": "design","label": "具体设计",   "type": "text", "w": "27%"},
            {"key": "veri",  "label": "挑战测试结果", "type": "select",
             "opts": ["通过", "未做", "不通过"], "w": "11%"},
            {"key": "res",   "label": "状态",       "type": "select",
             "opts": ["已实施", "待实施", "不适用"], "w": "15%"},
        ],
        "judge": {"col": "res", "bad": ["待实施"], "warn": ["待实施"]},
        "flags": [
            {"col": "level", "bad": ["提醒"], "text": "只做「提醒」等于没防错，优先升级到消除/替代/隔离"},
            {"col": "veri", "bad": ["未做"], "text": "防错没做挑战测试 = 不知道有没有效"},
        ],
        "stats": [
            {"label": "易错点", "fn": "count"},
            {"label": "待实施", "fn": "countEq", "col": "res", "val": "待实施"},
        ],
        "seed": [
            {"err": "乳糖与乳清粉加错", "freq": 2, "sev": 9, "level": "替代",
             "design": "两桶改不同颜色+不同高度，配料单按颜色区分，装料扫码核对（扫错不启动）", "veri": "通过", "res": "已实施"},
            {"err": "标签批号贴反", "freq": 5, "sev": 8, "level": "报警",
             "design": "贴标机加装批号自动比对，错批停机并声光报警", "veri": "通过", "res": "已实施"},
            {"err": "换批时残料带入", "freq": 1, "sev": 9, "level": "隔离",
             "design": "清仓到位检测，未清仓不启动下一批", "veri": "通过", "res": "已实施"},
            {"err": "取样时未摇匀", "freq": 12, "sev": 5, "level": "提醒",
             "design": "贴提示牌", "veri": "未做", "res": "待实施"},
        ],
    },
}

# ============================================================
# 研发管理（18 个）· 键 = moduleKey
# ============================================================
RW = {
    "reg_law": {
        "type": "table",
        "title": "产品配方注册台账",
        "addLabel": "加一个产品",
        "cols": [
            {"key": "name", "label": "产品名称", "type": "text", "w": "17%"},
            {"key": "seg",  "label": "段位", "type": "select",
             "opts": ["1段", "2段", "3段", "乳粉", "调制乳粉"], "w": "8%"},
            {"key": "cat",  "label": "类别", "type": "select",
             "opts": ["乳基", "豆基"], "w": "8%"},
            {"key": "std",  "label": "执行标准", "type": "text", "w": "14%"},
            {"key": "reg",  "label": "注册证号", "type": "text", "w": "16%"},
            {"key": "exp",  "label": "有效期至", "type": "date", "w": "12%"},
            {"key": "res",  "label": "状态", "type": "select",
             "opts": ["有效", "临近到期", "已过期", "注册中"], "w": "11%"},
        ],
        "judge": {"col": "res", "bad": ["已过期"], "warn": ["临近到期", "注册中"]},
        "stats": [
            {"label": "产品数", "fn": "count"},
            {"label": "有效", "fn": "countEq", "col": "res", "val": "有效"},
            {"label": "临近到期", "fn": "countEq", "col": "res", "val": "临近到期"},
        ],
        "seed": [
            {"name": "金装 1 段婴儿配方奶粉", "seg": "1段", "cat": "乳基", "std": "GB 10765",
             "reg": "国食注字20260001", "exp": "2027-03-15", "res": "有效"},
            {"name": "金装 2 段较大婴儿配方奶粉", "seg": "2段", "cat": "乳基", "std": "GB 10766",
             "reg": "国食注字20260012", "exp": "2027-03-20", "res": "临近到期"},
            {"name": "金装 3 段幼儿配方奶粉", "seg": "3段", "cat": "乳基", "std": "GB 10767",
             "reg": "国食注字20260023", "exp": "2027-06-01", "res": "有效"},
            {"name": "豆基 3 段幼儿配方奶粉", "seg": "3段", "cat": "豆基", "std": "GB 10767",
             "reg": "国食注字20260031", "exp": "2026-10-05", "res": "已过期"},
        ],
    },
    "raw_material_basis": {
        "type": "table",
        "title": "原辅料合规台账",
        "addLabel": "加一味原料",
        "cols": [
            {"key": "name", "label": "原料名称", "type": "text", "w": "16%"},
            {"key": "kind", "label": "类别", "type": "text", "w": "13%"},
            {"key": "seg",  "label": "允许段位", "type": "text", "w": "13%"},
            {"key": "lim",  "label": "使用量上限", "type": "text", "w": "13%"},
            {"key": "alg",  "label": "过敏原", "type": "text", "w": "10%"},
            {"key": "sup",  "label": "供应商", "type": "text", "w": "11%"},
            {"key": "res",  "label": "报告有效期", "type": "select",
             "opts": ["有效", "临期", "过期"], "w": "10%"},
        ],
        "judge": {"col": "res", "bad": ["过期"], "warn": ["临期"]},
        "stats": [
            {"label": "原料数", "fn": "count"},
            {"label": "报告过期", "fn": "countEq", "col": "res", "val": "过期"},
        ],
        "seed": [
            {"name": "全脂乳粉", "kind": "蛋白/脂肪", "seg": "1/2/3段", "lim": "按需", "alg": "乳",
             "sup": "供应商 T", "res": "有效"},
            {"name": "脱盐乳清粉", "kind": "蛋白", "seg": "1/2/3段", "lim": "按需", "alg": "乳",
             "sup": "供应商 S", "res": "有效"},
            {"name": "ARA 新型原料", "kind": "脂肪酸", "seg": "2/3段", "lim": "≤0.5g/100kJ", "alg": "",
             "sup": "供应商 P", "res": "有效"},
            {"name": "麦芽糊精", "kind": "碳水", "seg": "1/2/3段", "lim": "按需", "alg": "",
             "sup": "供应商 G", "res": "临期"},
        ],
    },
    "label_claim": {
        "type": "table",
        "title": "标签声称逐句核对表",
        "addLabel": "加一句声称",
        "cols": [
            {"key": "txt",  "label": "声称原文", "type": "text", "w": "18%"},
            {"key": "kind", "label": "声称类型", "type": "select",
             "opts": ["营养成分声称", "含量声称", "比较声称", "配方声称", "品质声称"], "w": "13%"},
            {"key": "law",  "label": "依据条款", "type": "text", "w": "14%"},
            {"key": "evi",  "label": "判定依据", "type": "text", "w": "20%"},
            {"key": "res",  "label": "是否可写", "type": "select",
             "opts": ["可写", "需修改", "不可写"], "w": "11%"},
            {"key": "fix",  "label": "修改建议", "type": "text", "w": "24%"},
        ],
        "judge": {"col": "res", "bad": ["不可写"], "warn": ["需修改"]},
        "stats": [
            {"label": "声称数", "fn": "count"},
            {"label": "需改/不可写", "fn": "countIn", "col": "res", "vals": ["需修改", "不可写"]},
        ],
        "seed": [
            {"txt": "每 100g 含钙 480mg", "kind": "含量声称", "law": "GB 28050",
             "evi": "检测报告 WB-2603-118", "res": "可写", "fix": ""},
            {"txt": "高钙 1.5 倍", "kind": "比较声称", "law": "GB 28050",
             "evi": "「高」未达阈值；「1.5 倍」缺基准声明", "res": "不可写", "fix": "改为「每 100g 含钙 480mg」"},
            {"txt": "含乳成分", "kind": "配方声称", "law": "GB 7718",
             "evi": "配方含全脂乳粉", "res": "可写", "fix": ""},
            {"txt": "不添加蔗糖", "kind": "配方声称", "law": "GB 28050",
             "evi": "配方无蔗糖，但含乳糖", "res": "需修改", "fix": "加注「乳糖为天然乳成分」，避免误导"},
        ],
    },
    "nutrient_calc": {"type": "calc", "fn": "gbCalcWidget",
                      "note": "见页面下方「营养素配比计算」工作台"},
    "human_milk_research": {
        "type": "table",
        "title": "母乳成分参照区间",
        "addLabel": "加一条研究",
        "cols": [
            {"key": "comp", "label": "成分", "type": "text", "w": "14%"},
            {"key": "age",  "label": "月龄段", "type": "select",
             "opts": ["0-6月", "6-12月", "12-36月"], "w": "10%"},
            {"key": "lo",   "label": "参照下限", "type": "number", "w": "10%"},
            {"key": "hi",   "label": "参照上限", "type": "number", "w": "10%"},
            {"key": "unit", "label": "单位", "type": "text", "w": "10%"},
            {"key": "src",  "label": "来源 / 样本量", "type": "text", "w": "22%"},
            {"key": "ours", "label": "本配方实测", "type": "number", "w": "10%"},
            {"key": "res",  "label": "是否在区间", "type": "select",
             "opts": ["在区间内", "低于区间", "高于区间"], "w": "14%"},
        ],
        "judge": {"col": "res", "bad": ["低于区间", "高于区间"]},
        "computed": {
            "inRange": {"label": "区间内", "good": ["在区间内"]},
        },
        "stats": [
            {"label": "参照项", "fn": "count"},
            {"label": "偏离", "fn": "countIn", "col": "res", "vals": ["低于区间", "高于区间"]},
        ],
        "seed": [
            {"comp": "钙", "age": "6-12月", "lo": 25, "hi": 35, "unit": "mg/100g",
             "src": "中国母乳队列研究 n=120", "ours": 38, "res": "高于区间"},
            {"comp": "DHA", "age": "0-6月", "lo": 0.3, "hi": 0.5, "unit": "%脂肪酸",
             "src": "文献综述 n=860", "ours": 0.35, "res": "在区间内"},
            {"comp": "钙", "age": "0-6月", "lo": 28, "hi": 40, "unit": "mg/100g",
             "src": "中国母乳队列研究 n=120", "ours": 38, "res": "在区间内"},
        ],
    },
    "material_sub": {
        "type": "sub",
        "title": "原料替代测算",
        "seed": {
            "current": {"name": "脱盐乳清粉", "sup": "供应商 S", "price": 78.0,
                        "p": 34.0, "f": 1.0, "c": 52.0, "ca": 800, "phos": 700},
            "cand": [{"name": "甜型乳清粉", "sup": "供应商 S2", "price": 71.0,
                      "p": 11.0, "f": 1.5, "c": 76.0, "ca": 600, "phos": 550},
                     {"name": "浓缩乳清蛋白 WPC80", "sup": "供应商 W", "price": 132.0,
                      "p": 80.0, "f": 3.0, "c": 8.0, "ca": 700, "phos": 600}],
            "useAmount": 200.0,
            "replacePct": 30,
        },
    },
    "formula_version": {
        "type": "table",
        "title": "配方版本主表",
        "addLabel": "加一个版本",
        "cols": [
            {"key": "no",   "label": "配方编号", "type": "text", "w": "12%"},
            {"key": "ver",  "label": "版本号", "type": "text", "w": "9%"},
            {"key": "chg",  "label": "变更内容", "type": "text", "w": "24%"},
            {"key": "why",  "label": "变更原因", "type": "text", "w": "20%"},
            {"key": "own",  "label": "批准人", "type": "text", "w": "9%"},
            {"key": "date", "label": "批准日期", "type": "date", "w": "12%"},
            {"key": "res",  "label": "状态", "type": "select",
             "opts": ["草稿", "生效", "已替代", "已冻结"], "w": "14%"},
        ],
        "judge": {"col": "res", "bad": ["草稿"], "warn": ["草稿"]},
        "stats": [
            {"label": "版本数", "fn": "count"},
            {"label": "生效中", "fn": "countEq", "col": "res", "val": "生效"},
        ],
        "seed": [
            {"no": "2B", "ver": "v1.0", "chg": "首次编制", "why": "新品立项",
             "own": "陈工", "date": "2025-11-20", "res": "已替代"},
            {"no": "2B", "ver": "v1.1", "chg": "脱盐乳清粉换供应商（指标等效）", "why": "原供应商断供",
             "own": "陈工", "date": "2026-01-08", "res": "已替代"},
            {"no": "2B", "ver": "v1.2", "chg": "ARA 油换品牌，添加量不变", "why": "降本",
             "own": "刘工", "date": "2026-02-15", "res": "生效"},
        ],
    },
    "lab_trial": {
        "type": "table",
        "title": "小试工艺参数记录",
        "addLabel": "加一批小试",
        "cols": [
            {"key": "no",   "label": "小试批号", "type": "text", "w": "11%"},
            {"key": "conc", "label": "进料浓度 %", "type": "number", "w": "9%"},
            {"key": "pres", "label": "均质压力 MPa", "type": "number", "w": "9%"},
            {"key": "tin",  "label": "进风温度 ℃", "type": "number", "w": "9%"},
            {"key": "tout", "label": "出风温度 ℃", "type": "number", "w": "9%"},
            {"key": "moist","label": "水分 %", "type": "number", "w": "8%"},
            {"key": "d50",  "label": "D50 μm", "type": "number", "w": "8%"},
            {"key": "sol",  "label": "溶解秒", "type": "number", "w": "8%"},
            {"key": "res",  "label": "感官", "type": "select",
             "opts": ["合格", "异常"], "w": "9%"},
        ],
        "judge": {"col": "res", "bad": ["异常"]},
        "stats": [
            {"label": "小试批次", "fn": "count"},
            {"label": "感官异常", "fn": "countEq", "col": "res", "val": "异常"},
        ],
        "seed": [
            {"no": "T-260401-01", "conc": 12, "pres": 15, "tin": 185, "tout": 88,
             "moist": 3.4, "d50": 520, "sol": 18, "res": "异常"},
            {"no": "T-260401-02", "conc": 9, "pres": 18, "tin": 185, "tout": 85,
             "moist": 3.2, "d50": 505, "sol": 14, "res": "合格"},
        ],
    },
    "pilot_scaleup": {
        "type": "strata",
        "title": "小试 vs 中试放大对比",
        "dims": ["中试批号", "工艺参数项"],
        "seed": [
            {"dim": "中试批号", "grp": "P-260501-01", "n": 100, "ok": 98},
            {"dim": "中试批号", "grp": "P-260501-02", "n": 100, "ok": 97},
            {"dim": "中试批号", "grp": "P-260501-03", "n": 100, "ok": 91},
        ],
    },
    "sensory_eval": {
        "type": "sensory",
        "title": "感官评价打分",
        "scale": ["1 很弱", "2 弱", "3 一般", "4 较强", "5 强"],
        "dims": ["色泽", "气味", "滋味", "质构", "冲调性"],
        "seed": [
            {"sample": "标样", "scores": [3, 3, 3, 3, 3]},
            {"sample": "本次配方", "scores": [3, 4, 4, 3, 4]},
            {"sample": "竞品A", "scores": [4, 3, 3, 4, 3]},
        ],
    },
    "accel_test": {
        "type": "shelf",
        "title": "加速试验与保质期推算",
        "mode": "accel",
        "seed": {
            "samples": [
                {"temp": 37, "weeks": 0, "vp": 0.8, "sens": "正常"},
                {"temp": 37, "weeks": 4, "vp": 0.9, "sens": "正常"},
                {"temp": 37, "weeks": 8, "vp": 1.1, "sens": "正常"},
                {"temp": 37, "weeks": 12, "vp": 1.4, "sens": "正常"},
                {"temp": 45, "weeks": 0, "vp": 0.8, "sens": "正常"},
                {"temp": 45, "weeks": 4, "vp": 1.2, "sens": "正常"},
                {"temp": 45, "weeks": 8, "vp": 2.1, "sens": "正常"},
                {"temp": 45, "weeks": 12, "vp": 3.4, "sens": "轻微异味"},
            ],
            "limit": 2.0,
            "targetMonths": 12,
        },
    },
    "retain_sample": {
        "type": "table",
        "title": "实时留样台账",
        "addLabel": "加一批留样",
        "cols": [
            {"key": "name", "label": "产品", "type": "text", "w": "16%"},
            {"key": "batch","label": "批次", "type": "text", "w": "12%"},
            {"key": "date", "label": "留样日期", "type": "date", "w": "11%"},
            {"key": "due",  "label": "到期检日", "type": "date", "w": "11%"},
            {"key": "qty",  "label": "留样量", "type": "text", "w": "9%"},
            {"key": "pos",  "label": "存放位置", "type": "text", "w": "14%"},
            {"key": "res",  "label": "到期检测", "type": "select",
             "opts": ["未到期", "已检合格", "已检异常", "待检"], "w": "13%"},
        ],
        "judge": {"col": "res", "bad": ["已检异常"], "warn": ["待检"]},
        "stats": [
            {"label": "留样批数", "fn": "count"},
            {"label": "待检", "fn": "countEq", "col": "res", "val": "待检"},
            {"label": "异常", "fn": "countEq", "col": "res", "val": "已检异常"},
        ],
        "seed": [
            {"name": "2段乳基", "batch": "B260201", "date": "2026-02-01", "due": "2027-02-01",
             "qty": "3罐", "pos": "留样柜 A-2", "res": "未到期"},
            {"name": "3段乳基", "batch": "B251215", "date": "2025-12-15", "due": "2026-12-15",
             "qty": "3罐", "pos": "留样柜 A-3", "res": "待检"},
            {"name": "1段乳基", "batch": "B250820", "date": "2025-08-20", "due": "2026-08-20",
             "qty": "3罐", "pos": "留样柜 B-1", "res": "已检异常"},
        ],
    },
    "shelf_life": {
        "type": "shelf",
        "title": "货架期判定",
        "mode": "shelf",
        "seed": {
            "samples": [
                {"temp": 25, "weeks": 0, "vp": 0.8, "sens": "正常"},
                {"temp": 25, "weeks": 13, "vp": 1.2, "sens": "正常"},
                {"temp": 25, "weeks": 26, "vp": 1.8, "sens": "正常"},
                {"temp": 25, "weeks": 39, "vp": 2.4, "sens": "轻微异味"},
            ],
            "limit": 2.0,
            "targetMonths": 12,
        },
    },
    "reg_filing": {
        "type": "flow",
        "title": "注册申报材料清单",
        "phases": [
            {"key": "m1", "name": "配方材料", "fields": [
                {"k": "完整配方（含预混料展开）", "v": "已提交 v3.2"},
                {"k": "原料质量标准", "v": "已提交"},
                {"k": "检验方法", "v": "已提交"},
            ]},
            {"key": "m2", "name": "检验报告", "fields": [
                {"k": "理化 / 微生物", "v": "报告 WB-2603-118"},
                {"k": "污染物 / 真菌毒素", "v": "报告 WB-2603-119"},
                {"k": "营养素全项", "v": "报告 WB-2603-120"},
            ]},
            {"key": "m3", "name": "稳定性报告", "fields": [
                {"k": "加速试验", "v": "报告 ST-2601-A"},
                {"k": "实时留样", "v": "报告 ST-2601-B（12 个月）"},
            ]},
            {"key": "m4", "name": "标签样稿", "fields": [
                {"k": "标签 V3.2 稿", "v": "已提交"},
                {"k": "声称逐句核对表", "v": "已签"},
            ]},
        ],
        "keyPoint": "提交前做形式审查：材料齐不齐、签字盖章全不全、编号规则对不对。",
    },
    "third_party_test": {
        "type": "table",
        "title": "第三方检测台账",
        "addLabel": "加一份报告",
        "cols": [
            {"key": "name", "label": "产品", "type": "text", "w": "15%"},
            {"key": "batch","label": "送检批号", "type": "text", "w": "12%"},
            {"key": "lab",  "label": "检测机构", "type": "text", "w": "15%"},
            {"key": "no",   "label": "报告编号", "type": "text", "w": "14%"},
            {"key": "item", "label": "主要项目", "type": "text", "w": "18%"},
            {"key": "res",  "label": "结论", "type": "select",
             "opts": ["符合", "不符合", "待复核"], "w": "12%"},
            {"key": "date", "label": "报告日期", "type": "date", "w": "14%"},
        ],
        "judge": {"col": "res", "bad": ["不符合"], "warn": ["待复核"]},
        "stats": [
            {"label": "报告数", "fn": "count"},
            {"label": "不符合", "fn": "countEq", "col": "res", "val": "不符合"},
        ],
        "seed": [
            {"name": "3段乳基", "batch": "B260315", "lab": "CMA 资质机构 A", "no": "WB-2603-118",
             "item": "理化 / 污染物 / 营养素", "res": "符合", "date": "2026-03-28"},
            {"name": "3段乳基", "batch": "B260402", "lab": "CMA 资质机构 A", "no": "WB-2604-201",
             "item": "铅（接近限值）", "res": "待复核", "date": "2026-04-15"},
        ],
    },
    "feeding_trial": {
        "type": "table",
        "title": "喂养试验记录",
        "addLabel": "加一个受试者",
        "cols": [
            {"key": "id",   "label": "编号", "type": "text", "w": "9%"},
            {"key": "prod", "label": "产品", "type": "text", "w": "15%"},
            {"key": "age",  "label": "起始月龄", "type": "text", "w": "10%"},
            {"key": "w0",   "label": "起始体重 kg", "type": "number", "w": "12%"},
            {"key": "w1",   "label": "结束体重 kg", "type": "number", "w": "12%"},
            {"key": "tol",  "label": "耐受性", "type": "select",
             "opts": ["良好", "一般", "差"], "w": "12%"},
            {"key": "res",  "label": "结论", "type": "select",
             "opts": ["完成", "终止", "进行中"], "w": "12%"},
        ],
        "judge": {"col": "tol", "bad": ["差"], "warn": ["一般"]},
        "stats": [
            {"label": "受试者", "fn": "count"},
            {"label": "耐受性差", "fn": "countEq", "col": "tol", "val": "差"},
            {"label": "已终止", "fn": "countEq", "col": "res", "val": "终止"},
        ],
        "seed": [
            {"id": "F-001", "prod": "特医配方 A", "age": "6月", "w0": 7.2, "w1": 8.9,
             "tol": "良好", "res": "完成"},
            {"id": "F-002", "prod": "特医配方 A", "age": "7月", "w0": 7.8, "w1": 9.4,
             "tol": "良好", "res": "完成"},
            {"id": "F-003", "prod": "特医配方 A", "age": "8月", "w0": 8.1, "w1": 9.2,
             "tol": "差", "res": "终止"},
        ],
    },
    "change_control": {
        "type": "table",
        "title": "配方变更影响评估",
        "addLabel": "加一项变更",
        "cols": [
            {"key": "no",   "label": "变更编号", "type": "text", "w": "10%"},
            {"key": "what", "label": "变更内容", "type": "text", "w": "19%"},
            {"key": "why",  "label": "变更原因", "type": "text", "w": "16%"},
            {"key": "lvl",  "label": "变更级别", "type": "select",
             "opts": ["一般变更", "重大变更"], "w": "10%"},
            {"key": "nut",  "label": "营养素影响", "type": "select",
             "opts": ["无影响", "需重算", "有影响"], "w": "10%"},
            {"key": "stab", "label": "稳定性影响", "type": "select",
             "opts": ["无", "需重做", "已评估"], "w": "10%"},
            {"key": "reg",  "label": "注册影响", "type": "select",
             "opts": ["无需", "需备案", "需批准"], "w": "10%"},
            {"key": "res",  "label": "状态", "type": "select",
             "opts": ["实施中", "已验证", "待审批"], "w": "15%"},
        ],
        "judge": {"col": "res", "bad": ["待审批"], "warn": ["实施中"]},
        "flags": [
            {"col": "lvl", "bad": ["重大变更"], "text": "重大变更必须先确认是否需要注册批准，未获批不得实施"},
        ],
        "stats": [
            {"label": "变更数", "fn": "count"},
            {"label": "重大变更", "fn": "countEq", "col": "lvl", "val": "重大变更"},
            {"label": "待审批", "fn": "countEq", "col": "res", "val": "待审批"},
        ],
        "seed": [
            {"no": "CR-2608-01", "what": "脱盐乳清粉比例 12%→13%",
             "why": "供应商乳清粉矿物质含量波动", "lvl": "重大变更", "nut": "需重算",
             "stab": "需重做", "reg": "需备案", "res": "待审批"},
            {"no": "CR-2608-02", "what": "ARA 油换品牌（等效替代）",
             "why": "降本", "lvl": "一般变更", "nut": "需重算", "stab": "已评估",
             "reg": "无需", "res": "已验证"},
        ],
    },
    "market_research": {
        "type": "table",
        "title": "竞品与母乳研究库",
        "addLabel": "加一条记录",
        "cols": [
            {"key": "type", "label": "类型", "type": "select",
             "opts": ["竞品", "母乳研究", "技术结论"], "w": "10%"},
            {"key": "name", "label": "品牌 / 来源", "type": "text", "w": "16%"},
            {"key": "seg",  "label": "段位", "type": "text", "w": "8%"},
            {"key": "key",  "label": "关键数据", "type": "text", "w": "24%"},
            {"key": "cmp",  "label": "与本厂对比", "type": "text", "w": "22%"},
            {"key": "src",  "label": "来源与日期", "type": "text", "w": "20%"},
        ],
        "stats": [
            {"label": "条目数", "fn": "count"},
            {"label": "竞品", "fn": "countEq", "col": "type", "val": "竞品"},
        ],
        "seed": [
            {"type": "母乳研究", "name": "中国母乳队列", "seg": "0-6月", "key": "DHA 0.3~0.5%脂肪酸",
             "cmp": "本配方 0.35%，在区间内", "src": "论文 2024，n=120"},
            {"type": "竞品", "name": "竞品 A", "seg": "3段", "key": "DHA 标称 0.30%",
             "cmp": "低于我方 0.35%", "src": "标签 2026-03"},
            {"type": "技术结论", "name": "高 DHA 卖点论证", "seg": "1/2/3段", "key": "定 0.35%",
             "cmp": "母乳参照 0.3~0.5%，国标上限 0.5%", "src": "内部 2026-04-10"},
        ],
    },
}
