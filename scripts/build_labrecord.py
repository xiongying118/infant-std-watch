# -*- coding: utf-8 -*-
"""把 9 份真实原始记录 Word 模板转成网页版数据层 prototype/labrecord.js。

源头：data/record_src/*.json（由 scripts/extract_records.py 通过本地 editor_sdk
      逐份读取 .doc/.docx 得到，只读、不改源文件）。
原则：表头、列名、预置值、检验依据、仪器与方法说明全部照抄原表，
      不补写、不推测、不编造任何数值。
输出：window.LABREC = {projects:[...]}
"""
import io, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "record_src")
OUT = os.path.join(ROOT, "prototype", "labrecord.js")

META = {
    "protein":    dict(name="蛋白质", unit="g/100g",   order=1),
    "fat":        dict(name="脂肪",   unit="g/100g",   order=2),
    "moisture":   dict(name="水分",   unit="g/100g",   order=3),
    "chloride":   dict(name="氯化物", unit="%",        order=4),
    "phosphorus": dict(name="磷",     unit="mg/100g",  order=5),
    "choline":    dict(name="胆碱",   unit="mg/100g",  order=6),
    "nitrite":    dict(name="亚硝酸盐与硝酸盐", unit="mg/kg", order=7),
    "acidvalue":  dict(name="酸价",   unit="mg/g",     order=8),
    "peroxide":   dict(name="过氧化值", unit="g/100g / meq/kg", order=9),
}

# 数据表小标题：只给标签，不改表内任何文字
CAPS = {
    ("choline", 2): "标准溶液信息", ("choline", 3): "样品测定",
    ("phosphorus", 2): "标准溶液信息", ("phosphorus", 3): "标准曲线",
    ("phosphorus", 4): "试样测定",
    ("chloride", 2): "标准溶液信息", ("chloride", 3): "试样测定",
    ("nitrite", 2): "硝酸钠标准溶液", ("nitrite", 3): "亚硝酸钠标准溶液",
    ("nitrite", 4): "标准曲线", ("nitrite", 5): "镉柱还原效率",
    ("nitrite", 6): "试样处理液体积", ("nitrite", 7): "试样测定",
    ("fat", 1): "空白试验", ("fat", 2): "试样测定",
    ("protein", 1): "试样测定", ("peroxide", 1): "试样测定",
    ("acidvalue", 1): "试样测定", ("moisture", 1): "试样测定",
}

STD_RE = re.compile(r"GB\s*[\d.]+\s*[—–-]\s*\d{4}")
BASIS_RE = re.compile(r"检验依据[:：]\s*(.{4,80}?)(?:检验项目|检测仪器|检测方法|环境条件|$)")


def grid_of(t):
    """合并区域 -> colspan/rowspan，返回按行排列的起始格。"""
    merges = t.get("merge") or []
    span, covered = {}, set()
    for m in merges:
        if len(m) != 2:
            continue
        (r1, c1), (r2, c2) = m[0], m[1]
        span[(r1, c1)] = (c2 - c1 + 1, r2 - r1 + 1)
        for r in range(r1, r2 + 1):
            for c in range(c1, c2 + 1):
                if (r, c) != (r1, c1):
                    covered.add((r, c))
    bypos = {}
    for c in t["detail"]["cells"]:
        bypos[(c["r"], c["c"])] = c
    lines = []
    for r in range(1, (t["rows"] or 0) + 1):
        line = []
        for c in range(1, (t["cols"] or 0) + 1):
            if (r, c) in covered:
                continue
            cell = bypos.get((r, c))
            if not cell or cell.get("m"):
                continue
            cs, rs = span.get((r, c), (1, 1))
            line.append({"t": cell["t"], "cs": cs, "rs": rs})
        lines.append(line)
    return lines


def is_head(t):
    return any("样 品 名 称" in (c["t"] or "") or "样品名称" in (c["t"] or "")
               for c in t["detail"]["cells"])


def is_sign(t):
    return any("检 验 人" in (c["t"] or "") or "检验人" in (c["t"] or "")
               for c in t["detail"]["cells"])


def long_texts(t):
    out = []
    for c in t["detail"]["cells"]:
        s = (c["t"] or "").strip()
        if len(s) >= 180:
            out.append(s)
    return out


def pick_basis(alltext):
    m = BASIS_RE.search(alltext)
    if m:
        return m.group(1).strip()
    m = STD_RE.search(alltext)
    return m.group(0) if m else ""


def pick_item(alltext):
    m = re.search(r"检验项目及数据记录[:：]\s*(.{2,40}?)(?:检测仪器|检测方法|环境条件|$)", alltext)
    return m.group(1).strip() if m else ""


def clean_note(s):
    # 原文里表格文字与正文粘连，保持原样，只在关键分节前留出换行（不删字）
    for kw in ("检测方法：", "计算公式：", "式中：", "结果保留", "检出限", "定量限",
               "环境条件：", "标准溶液信息", "标准品信息", "以下为空白", "以下为空"):
        s = s.replace(kw, "\n" + kw)
    return "\n".join(x.strip() for x in s.split("\n") if x.strip())


def build_one(key):
    p = os.path.join(SRC, key + ".json")
    if not os.path.exists(p):
        raise SystemExit("缺少提取结果：" + p)
    d = io.open(p, encoding="utf-8").read()
    j = json.loads(d)
    tables, notes, alltext = [], [], []

    for t in j["tables"]:
        cells = t["detail"]["cells"]
        for c in cells:
            alltext.append(c["t"] or "")
        for n in long_texts(t):
            if n not in notes:
                notes.append(n)
    for n in ((j.get("structure") or {}).get("nodes") or []):
        if n.get("type") != "Table":
            alltext.append(n.get("text_preview") or n.get("text") or "")
    blob = " ".join(alltext)

    for t in j["tables"]:
        if long_texts(t) or is_head(t) or is_sign(t):
            continue
        g = grid_of(t)
        if not g or not any(any(x["t"] for x in line) for line in g):
            continue
        tables.append({
            "cap": CAPS.get((key, t["index"]), "记录表"),
            "grid": g,
            "cols": t["cols"],
        })

    meta = META[key]
    return {
        "key": key,
        "name": meta["name"],
        "unit": meta["unit"],
        "order": meta["order"],
        "file": j["file"],
        "basis": pick_basis(blob),
        "item": pick_item(blob),
        "tables": tables,
        "notes": [clean_note(x) for x in notes],
    }


def main():
    projects = []
    for key in META:
        p = build_one(key)
        projects.append(p)
        print("%-12s 表 %d  依据 %s  项目 %s  说明 %d 字" %
              (key, len(p["tables"]), p["basis"][:32], p["item"][:18],
               sum(len(x) for x in p["notes"])))
    projects.sort(key=lambda x: x["order"])
    obj = {"v": "2026-11-15", "source": "9 份检测中心原始记录（Word 原表，逐格读取）",
           "projects": projects}
    js = "/* 原始记录项目模板 · 由 scripts/build_labrecord.py 从 9 份 Word 原表生成，勿手改 */\n" \
         + "window.LABREC = " + json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + ";\n"
    io.open(OUT, "w", encoding="utf-8", newline="\n").write(js)
    print("-> %s  %d bytes" % (OUT, os.path.getsize(OUT)))


if __name__ == "__main__":
    main()
