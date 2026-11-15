# -*- coding: utf-8 -*-
"""把 9 份真实原始记录 Word 原表 1:1 还原成网页模板 prototype/labrecord.js。

源头：data/record_oo/*.xml —— Word COM 的 Document.Content.WordOpenXML（只读，
      不另存、不改源文件）。这是 Word 自己的 OOXML，段落与表格（含嵌套表格、
      gridSpan 横向合并、vMerge 纵向合并）按文档真实顺序排列，
      没有 editor_sdk 扁平化造成的文字重复。

本地重取 OOXML（PowerShell，一次 Word 实例逐个读 Content.WordOpenXML）：
    $base='D:\\食品标准\\4 原始记录表格-理化-AI数据训练\\4 原始记录表格'
    $w=New-Object -ComObject Word.Application; $w.Visible=$false; $w.DisplayAlerts=0
    $d=$w.Documents.Open($src,$false,$true,$false); $x=$d.Content.WordOpenXML
生成的 data/record_oo/*.xml 是本机中间产物，不进仓库。
公式图片：Word 里的计算公式是 WMF 矢量图，先由 data/record_media/*.wmf
      （同样从 OOXML 的 pkg:binaryData 提取）经 scripts/wmf2png.py
      用 Windows GDI+ 转成 3 倍清晰度 PNG，再 base64 内嵌进模板；
      显示宽度按 Word 原尺寸（PNG 宽 /3），保证版式 1:1。

★ 铁律：Word 原表所有文字、所有表格、所有合并结构一律照抄，一个字不改、不删、不补。
  唯一例外是用户明确指定的「动态字段」：
    样品名称 / 生产商 / 批号或生产日期  —— 每次打印填一次，全部项目自动带出
    标准溶液编码 / 有效期至            —— 保留 Word 原文值；只有标准溶液过期重配时
                                          才改一次（本机记住），打印时无需填写
  其余（检验日期、检验人、复核人、预置数值、方法说明、计算公式、签字栏）全部原文照录。
"""
import io, json, os, re, base64, struct
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "record_oo")
MEDIA = os.path.join(ROOT, "data", "record_media")
OUT = os.path.join(ROOT, "prototype", "labrecord.js")

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
V = "{urn:schemas-microsoft-com:vml}"
PKG = "{http://schemas.microsoft.com/office/2006/xmlPackage}"
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"

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

FILES = {
    "protein":    "蛋白质原始记录 20260518.doc",
    "choline":    "胆碱液质原始记录202507启用/胆碱测定原始记录-成品-20250707.docx",
    "peroxide":   "过氧化值 20260518.doc",
    "phosphorus": "磷 240929.doc",
    "chloride":   "氯化物的原始记录 20260518.docx",
    "acidvalue":  "酸价 20260518.doc",
    "nitrite":    "亚硝酸盐与硝酸盐 20260519.docx",
    "fat":        "脂肪原始记录20260920.doc",
    "moisture":   "水分 20260313.doc",
}


def esc(s):
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def inline_text(el):
    """Word 段落文字：w:t / w:tab / w:br，并给公式图片留占位标记。"""
    parts = []
    for n in el.iter():
        if n.tag == W + "t":
            parts.append(n.text or "")
        elif n.tag == W + "tab":
            parts.append("    ")
        elif n.tag == W + "br":
            parts.append("\n")
        elif n.tag == V + "imagedata":
            parts.append("\x01IMG:%s\x01" % (n.get(REL + "id") or ""))
    return "".join(parts)


def part_text(root, kind):
    """Word 页眉 / 页脚原文（也是原始记录的一部分）。"""
    for p in root.findall(PKG + "part"):
        if kind in (p.get(PKG + "name") or ""):
            return "".join(t.text or "" for t in p.iter(W + "t")).strip()
    return ""


def img_tag(key, rid):
    p = os.path.join(MEDIA, "%s__%s.png" % (key, rid))
    if not os.path.exists(p):
        return ""
    raw = io.open(p, "rb").read()
    # PNG 是按 3 倍 96dpi 栅格化的；显示宽度 /3 才是 Word 里的原始尺寸
    pw, ph = struct.unpack(">II", raw[16:24])
    css_w = max(24, int(pw / 3))
    b = base64.b64encode(raw).decode("ascii")
    return ('<img class="lr-eq" alt="计算公式" style="width:%dpx" '
            'src="data:image/png;base64,%s">') % (css_w, b)


def parse_table(tbl):
    """rows=[[cell]]；cell.items 按 Word 顺序保存 ('p',文字) / ('tbl',子表rows)。"""
    rows = []
    for tr in tbl.findall(W + "tr"):
        cells = []
        for tc in tr.findall(W + "tc"):
            gs, vm = 1, None
            tcPr = tc.find(W + "tcPr")
            if tcPr is not None:
                g = tcPr.find(W + "gridSpan")
                if g is not None:
                    gs = int(g.get(W + "val", "1") or 1)
                v = tcPr.find(W + "vMerge")
                if v is not None:
                    vm = "restart" if v.get(W + "val") == "restart" else "continue"
            items = []
            for ch in list(tc):
                if ch.tag == W + "p":
                    items.append(("p", inline_text(ch)))
                elif ch.tag == W + "tbl":
                    items.append(("tbl", parse_table(ch)))
            cells.append({
                "items": items, "gs": gs, "vm": vm,
                "text": "\n".join(t for k, t in items if k == "p" and t),
                "nested": [v for k, v in items if k == "tbl"],
            })
        rows.append(cells)
    return rows


def walk_tables(rows):
    """递归遍历文档里每一张表（含嵌套表），用于统一标记动态字段。"""
    yield rows
    for row in rows:
        for c in row:
            for sub in c["nested"]:
                for x in walk_tables(sub):
                    yield x


def cell_html(c):
    if c.get("ov") is not None:
        return c["ov"]
    parts = []
    for k, v in c["items"]:
        if k == "p":
            if v.strip():
                parts.append(esc(v).replace("\n", "<br>"))
        else:
            parts.append(render_table(v))
    return "<br>".join(parts)


def render_table(rows):
    for row in rows:
        col = 0
        for c in row:
            c["sc"] = col
            col += c["gs"]
    for ri, row in enumerate(rows):
        for c in row:
            if c["vm"] == "restart":
                rs = 1
                for rj in range(ri + 1, len(rows)):
                    if any(c2["sc"] == c["sc"] and c2["vm"] == "continue"
                           and c2["gs"] == c["gs"] for c2 in rows[rj]):
                        rs += 1
                    else:
                        break
                c["rs"] = rs
    out = ['<table class="lr-wt"><tbody>']
    for row in rows:
        out.append("<tr>")
        for c in row:
            if c["vm"] == "continue":
                continue
            a = ""
            if c["gs"] > 1:
                a += ' colspan="%d"' % c["gs"]
            if c.get("rs", 1) > 1:
                a += ' rowspan="%d"' % c["rs"]
            out.append("<td%s>%s</td>" % (a, cell_html(c)))
        out.append("</tr>")
    out.append("</tbody></table>")
    return "".join(out)


def norm(s):
    return re.sub(r"\s+", "", s or "")


def mark_dynamic(rows, solutions, hits, origs):
    """只标记用户指定的 5 类字段；其它单元格一律不动。"""
    LABELS = [
        ("sample", ("样品名称:", "样品名称：", "样品名称")),
        ("maker",  ("生产商名称:", "生产商名称：", "生产商名称")),
        ("batch",  ("批号/生产日期:", "批号/生产日期：", "批号/生产日期")),
    ]
    for ri, row in enumerate(rows):
        for ci, c in enumerate(row):
            t = norm(c["text"])
            for key, labels in LABELS:
                if t in labels and ci + 1 < len(row):
                    nxt = row[ci + 1]
                    if nxt.get("dyn"):
                        continue
                    origs.append(nxt["text"])            # 记住原表里的示例值
                    nxt["ov"] = '<span class="lr-dyn" data-lr="%s"></span>' % key
                    nxt["dyn"] = key
                    hits[key] += 1
        head = [norm(c["text"]) for c in row]
        if "标准溶液编码" in head and "有效期至" in head:
            ic = head.index("标准溶液编码")
            ie = head.index("有效期至")
            inm = head.index("标准溶液名称") if "标准溶液名称" in head else 0
            for rj in range(ri + 1, len(rows)):
                r2 = rows[rj]
                if max(ic, ie, inm) >= len(r2):
                    continue
                nm = r2[inm]["text"].strip()
                if not nm or nm == "标准溶液名称" or r2[ic].get("dyn"):
                    continue
                code, exp = r2[ic]["text"].strip(), r2[ie]["text"].strip()
                solutions.append({"name": nm, "code": code, "expiry": exp})
                r2[ic]["ov"] = ('<span class="lr-dyn" data-lr="stdcode" data-std="%s">%s</span>'
                                % (esc(nm), esc(code)))
                r2[ie]["ov"] = ('<span class="lr-dyn" data-lr="stdexp" data-std="%s">%s</span>'
                                % (esc(nm), esc(exp)))
                r2[ic]["dyn"] = r2[ie]["dyn"] = "std"
                hits["std"] += 1


def build_one(key):
    p = os.path.join(SRC, key + ".xml")
    if not os.path.exists(p):
        raise SystemExit("缺少 Word OOXML：" + p)
    root = ET.fromstring(io.open(p, encoding="utf-8").read())
    body = next(root.iter(W + "body"))

    hdr, ftr = part_text(root, "header"), part_text(root, "footer")
    blocks, roots = [], []
    if hdr:
        blocks.append('<div class="lr-hdr">%s</div>' % esc(hdr).replace("\n", "<br>"))
    for ch in list(body):
        if ch.tag == W + "p":
            t = inline_text(ch)
            blocks.append('<div class="lr-wp">%s</div>' %
                          (esc(t).replace("\n", "<br>") if t.strip() else "&nbsp;"))
        elif ch.tag == W + "tbl":
            rows = parse_table(ch)
            roots.append(rows)
            blocks.append(("tbl", rows))
    if ftr:
        blocks.append('<div class="lr-ftr">%s</div>' % esc(ftr).replace("\n", "<br>"))

    solutions, hits, origs = [], {"sample": 0, "maker": 0, "batch": 0, "std": 0}, []
    for rows in roots:
        for sub in walk_tables(rows):
            mark_dynamic(sub, solutions, hits, origs)

    html = "".join(b if isinstance(b, str) else render_table(b[1]) for b in blocks)
    n_img = len(re.findall(r"\x01IMG:", html))
    html = re.sub(r"\x01IMG:([A-Za-z0-9]+)\x01",
                  lambda m: img_tag(key, m.group(1)), html)

    # 文字完整性自检：OOXML 里每个 w:t 文字片段都必须在输出里出现（动态位原值补回）
    src = re.sub(r"\s+", "", "".join(t.text or "" for t in root.iter(W + "t")))
    out = re.sub(r"<[^>]+>", "", html).replace("&nbsp;", "") \
             .replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    out = re.sub(r"\s+", "", out) + re.sub(r"\s+", "", "".join(origs))
    lost = [s for s in re.findall(r"[\u4e00-\u9fa5]{5,}", src) if s not in out]
    print("%-11s 表=%-2d 公式图=%-2d 原文字=%-6d 输出=%-6d 缺字=%-2d %s" %
          (key, html.count('<table class="lr-wt">'), n_img,
           len(src), len(out), len(lost), {k: v for k, v in hits.items() if v}))
    if lost:
        print("   ⚠ 原文疑似缺失：", lost[:3])

    seen, sols = set(), []
    for s in solutions:
        if s["name"] in seen:
            continue
        seen.add(s["name"])
        sols.append(s)
    return {
        "key": key, "name": meta_name(key), "unit": META[key]["unit"],
        "order": META[key]["order"], "file": FILES[key],
        "html": html, "solutions": sols,
    }


def meta_name(key):
    return META[key]["name"]


def main():
    projects = [build_one(k) for k in META]
    projects.sort(key=lambda x: x["order"])
    obj = {"v": "2026-11-15b",
           "source": "9 份检测中心原始记录（Word 原生 OOXML 1:1 还原，文字与表格结构未改）",
           "projects": projects}
    js = ("/* 原始记录项目模板 · 由 scripts/build_labrecord.py 从 9 份 Word 原表的\n"
          "   Document.Content.WordOpenXML 1:1 生成；除动态字段外文字未改，勿手改 */\n"
          + "window.LABREC = " + json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + ";\n")
    io.open(OUT, "w", encoding="utf-8", newline="\n").write(js)
    print("-> %s  %d bytes" % (OUT, os.path.getsize(OUT)))
    for p in projects:
        if p["solutions"]:
            print("   标准溶液 %-12s %s" %
                  (p["name"], ", ".join(s["name"] + "=" + s["code"] + "/" + s["expiry"]
                                        for s in p["solutions"])))


if __name__ == "__main__":
    main()
