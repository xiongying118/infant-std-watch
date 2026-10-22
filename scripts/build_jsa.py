#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把「实验室JSA工作安全分析模板.xlsx」转成页面数据 JS。

数据来源：用户 2026-10-22 提供的
  D:\\食品标准\\实验室安全\\实验室JSA工作安全分析模板.xlsx
五个工作表全部收录：
  使用说明与评级规则 / 基础信息 / 工作危害分析 / 分区预填清单 / 审批与追踪

合规：只收录标准、评级规则、红线、作业步骤与控制措施原文，
**不代填任何签字与日期**（JSA 是要签字的正式文件，
预填签名等于伪造记录）。
"""
from __future__ import annotations

import io
import json
import os
import re
import sys

import openpyxl

sys.stdout.reconfigure(encoding="utf-8")
BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "..", "data")
SRC = r"D:\食品标准\实验室安全\实验室JSA工作安全分析模板.xlsx"

# ★ 只转规则与预填清单，不转「工作危害分析」的前几行 ★
#   那张表第 1 行是表头、之后是「示例：克罗诺杆菌属检验」的 7 行已填样例。
#   它是**示例**，不是本实验室的真实记录 —— 页面里要明确标注，
#   否则会被当成已完成的 JSA 存档，用户以为可以不算了。
SHEET_MAP = {
    "基础信息": "BASIC",
    "分区预填清单": "ZONES",
    "审批与追踪": "SIGNOFF",
}


def clean(v) -> str:
    if v is None:
        return ""
    s = str(v).replace("\r", "\n")
    s = re.sub(r"[ \t　]+", " ", s)
    s = re.sub(r"\n{2,}", "\n", s)
    return s.strip()


def rows_of(ws) -> list[list[str]]:
    out = []
    for r in range(1, ws.max_row + 1):
        vals = [clean(ws.cell(r, c).value) for c in range(1, ws.max_column + 1)]
        if any(vals):
            out.append(vals)
    return out


def parse_guide(ws) -> dict:
    """使用说明与评级规则 → 结构化。

    ★ 坑：这列表的「值」在**第一列**，键也在第一列 ★
       原表：
         | 可能性 L | 1=几乎不可能 / 2=极少 / 3=偶尔 / 4=较常 / 5=经常发生 |
       键是 A 列、值是 **B 列**，但如果按"A 列 = 键、B 列 = 值"来读就对了；
       真正的问题是有些行的键和值**都挤在 A 列**（如「风险等级低风险 R=1~4…」）。
       所以每行都要 A、B 两列都试，按哪个含"="判定它是值。
    """
    out = {"usage": [], "levels": {}, "grades": [], "matrix": [],
           "matrixNote": "", "redlines": []}
    section = None

    def add_level(key, val):
        """把「1=a / 2=b / 3=c」拆成数组。

        ★ 坑：值里带**半角逗号**（如「4=严重(重伤/中毒)」）★
           直接 split("/") 会把「重伤,中毒」切成两段 →
           严重度 S 变成 7 项（实测）。
           → 只在「数字=」这种新条目前才切。
        """
        parts = re.split(r"(?=\d\s*=)", str(val))
        items = []
        for seg in parts:
            seg = seg.strip().strip("/").strip()
            if not seg:
                continue
            k, _, v = seg.partition("=")
            k, v = k.strip(), v.strip().strip("/").strip()
            # 半角逗号会被 clean() 换成换行，这里压回去（原文是「重伤,中毒」）
            v = v.replace("\n", ",")
            items.append(k + "=" + v if v else k)
        out["levels"][key] = items

    for r in range(1, ws.max_row + 1):
        cells = [clean(ws.cell(r, c).value) for c in range(1, 4)]
        a, b, c = cells[0], cells[1], cells[2]
        if not any(cells):
            continue
        if a.startswith("一、"):
            section = "usage"; continue
        if a.startswith("二、"):
            section = "redlines"; continue
        if a.startswith("三、"):
            section = "matrix"; continue
        if a in ("L \\ S", "L \\S"):
            continue

        if section == "usage":
            # ★ 表结构实测（A 列=键、B 列=值）★
            #   R8: A='可能性 L'  B='1=几乎不可能 / 2=极少 / …'
            # 先按「A 是键、B 是值」处理；
            # 只有当 B 为空、A 自己又含 '=数字' 时，才把 A 当值。
            if a in ("可能性 L", "严重度 S") and "=" in b:
                add_level(a, b); continue
            if a == "风险等级" and "=" in b:
                # ★ 简单切法就够 ★
                #   原文：「低风险 R=1~4 / 一般风险 R=5~9 / 中等风险 R=10~14 / 高风险 R=15~25」
                #   等级名里没有斜杠 → 直接按 " / " 切。
                #   ★ 别用正则前瞻 ★（试过 `(?=[^\s/]{2,6}\s*R\s*=)`，
                #     它会在「低」这种单字后面也匹配，把"低风险"切成"低"+"风险 R=1~4"，
                #     10 项碎片）。
                out["grades"] = [x.strip() for x in b.split(" / ") if x.strip()]
                out["usage"].append({"k": a, "v": b}); continue
            if a and "=" in b:
                out["usage"].append({"k": a, "v": b}); continue
            # 兜底：只有 A 列且形如「键=值1 / 值2 …」
            if a and re.match(r"^[^=]{1,12}=\d", a):
                k, v = a.split("=", 1)
                k = k.strip()
                if k in ("可能性 L", "严重度 S"):
                    add_level(k, a)
                elif k == "风险等级":
                    out["grades"] = [x.strip() for x in v.split("/")]
                    out["usage"].append({"k": k, "v": v})
                else:
                    out["usage"].append({"k": k, "v": v})
                continue
            if a:
                out["usage"].append({"k": a, "v": b or c})

        elif section == "redlines":
            if a.startswith("红线"):
                out["redlines"].append({"no": a, "text": b})

        elif section == "matrix":
            if a.startswith("L="):
                L = int(a[2:])
                row = []
                for cc in range(2, 7):
                    v = clean(ws.cell(r, cc).value)
                    row.append(int(v) if v.isdigit() else None)
                out["matrix"].append({"L": L, "vals": row})
            elif a.startswith("绿色"):
                out["matrixNote"] = a
    return out


def parse_zones(ws) -> list[dict]:
    """分区预填清单 → 5 个分区，每区一个作业步骤表。"""
    zones = []
    cur = None
    hdr = []
    for r in range(1, ws.max_row + 1):
        vals = [clean(ws.cell(r, c).value) for c in range(1, 6)]
        a = vals[0]
        if not a:
            continue
        if re.match(r"^[一二三四五]、", a):
            cur = {"title": a[2:].strip(), "icon": "", "steps": []}
            zones.append(cur)
            hdr = []
            continue
        if cur is None:
            continue
        if a == "作业步骤":
            hdr = vals[:4]
            continue
        if a.startswith("婴配实验室") or a.startswith("分区预填"):
            continue
        if not hdr:
            continue
        cur["steps"].append({
            "step": a,
            "hazard": vals[1] if len(vals) > 1 else "",
            "event": vals[2] if len(vals) > 2 else "",
            "control": vals[3] if len(vals) > 3 else "",
        })
    icons = ["⚗️", "🔬", "🦠", "☣️", "🚨"]
    for i, z in enumerate(zones):
        z["icon"] = icons[i] if i < len(icons) else "•"
    return zones


def parse_signoff(ws) -> dict:
    roles, revs = [], []
    mode = None
    for r in range(1, ws.max_row + 1):
        a = clean(ws.cell(r, 1).value)
        b = clean(ws.cell(r, 2).value)
        c = clean(ws.cell(r, 3).value)
        if not a:
            continue
        if a == "修订记录":
            mode = "rev"; continue
        if a == "版本":
            continue
        if mode == "rev":
            revs.append({"ver": a, "what": b, "who": c})
        elif "签字" in b or "复核人" in b:
            roles.append({"role": a, "line": b, "note": c})
    return {"roles": roles, "revisions": revs}


def esc(s) -> str:
    return (str(s or "").replace("\\", "\\\\").replace('"', '\\"')
            .replace("\n", "\\n").replace("\r", ""))


def main() -> int:
    if not os.path.exists(SRC):
        print("[x] 源文件不存在：%s" % SRC)
        return 1
    wb = openpyxl.load_workbook(SRC, data_only=True)

    guide = parse_guide(wb["使用说明与评级规则"])
    zones = parse_zones(wb["分区预填清单"])
    signoff = parse_signoff(wb["审批与追踪"])

    basic = {"fields": [], "sample": {}}
    ws = wb["基础信息"]
    head = [clean(ws.cell(1, c).value) for c in range(1, 10)]
    vals = [clean(ws.cell(2, c).value) for c in range(1, 10)]
    basic["fields"] = head
    basic["sample"] = {head[i]: vals[i] for i in range(len(head)) if head[i]}
    basic["options"] = ("理化前处理 / 精密仪器操作 / 微生物检验 / "
                        "危化品与标液管理 / 现场应急处置")

    # ---- 工作危害分析：只取表头 + 示例行 ----
    ws2 = wb["工作危害分析"]
    wha_head = [clean(ws2.cell(1, c).value) for c in range(1, 14)]
    wha_rows = []
    for r in range(2, ws2.max_row + 1):
        v = [clean(ws2.cell(r, c).value) for c in range(1, 14)]
        if not v[1]:
            continue
        wha_rows.append({
            "no": v[0], "step": v[1], "hazard": v[2], "event": v[3],
            "control": v[4], "L": v[5], "S": v[6], "R": v[7],
            "grade": v[8],
        })

    out = {
        "guide": guide,
        "basic": basic,
        "zones": zones,
        "signoff": signoff,
        "wha": {"fields": wha_head, "sample": wha_rows},
    }

    # ★ 产物格式：必须是**裸 JSON 数组** ★
    #   inject_refdata.py 的注入器只支持数组值（扫到 `  KEY: [` 后按数组
    #   边界替换，遇到 `{` 直接报 "[x] JSA 的值不是数组"）。
    #   JSA 本身是嵌套对象 → 外面包一层 `[...]`，页面侧取 `JSA[0]`。
    #   ★ 别写成 `window.STDWATCH_DATA.JSA = {...}`，那会整体塞进括号里，
    #     报 SyntaxError: Unexpected token ';'。
    js = json.dumps([out], ensure_ascii=False, indent=1)

    p = os.path.join(DATA, "_jsajs.txt")
    io.open(p, "w", encoding="utf-8").write(js)
    print("JSA 数据已写入 %s（%d 字节）" % (p, os.path.getsize(p)))
    print("  分区 %d 个 · 作业步骤 %d 条 · 红线 %d 条 · 危害分析示例 %d 条"
          % (len(zones), sum(len(z["steps"]) for z in zones),
             len(guide["redlines"]), len(wha_rows)))
    for z in zones:
        print("    %s %s（%d 步）" % (z["icon"], z["title"], len(z["steps"])))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())