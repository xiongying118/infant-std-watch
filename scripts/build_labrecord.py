# -*- coding: utf-8 -*-
"""把 9 份真实原始记录 Word 原表 1:1 还原成网页模板 prototype/labrecord.js。

源头：data/record_oo/*.xml —— Word COM 的 Document.Content.WordOpenXML（只读，
      不另存、不改源文件）。这是 Word 自己的 OOXML，段落与表格（含嵌套表格、
      gridSpan 横向合并、vMerge 纵向合并）按文档真实顺序排列。

★ 1:1 不只还原文字，也还原 Word 原生排版：
      A4 纵向 + 页边距；字体（宋体等）、字号（w:sz 半点）、加粗、
      段落对齐、行距；表格宽度（tblW）、每列宽度（tblGrid）、
      行高（trHeight）、单元格垂直对齐、合并；公式 WMF 矢量图转 PNG。
  这些属性以 inline style 写进 HTML，CSS 不再统一覆盖字体/字号/列宽。

本地重取 OOXML（PowerShell）：
    $w=New-Object -ComObject Word.Application; $w.Visible=$false; $w.DisplayAlerts=0
    $d=$w.Documents.Open($src,$false,$true,$false); $x=$d.Content.WordOpenXML
    data/record_oo/*.xml 与 data/record_media/ 都是本机中间产物，不进仓库。
公式图片：pkg:binaryData 提取 WMF → scripts/wmf2png.py（Windows GDI+）→
      3 倍清晰度 PNG → base64 内嵌；显示宽度按 Word 原尺寸（PNG 宽 /3）。

★ 铁律：Word 原表所有文字、表格、合并结构一律照抄，一个字不改、不删、不补。
  唯一例外是用户明确指定的动态字段：
    样品名称 / 生产商 / 批号或生产日期 / 检测日期
        —— 每次打印填一次，全部项目自动带出；检测日期默认空，绝不写死示例日期
    标准溶液编码 / 有效期至
        —— 保留 Word 原文值，打印不用填；只有过期重配时才改一次（本机记住）
  其余（检验人、复核人、检验日期、预置数值、方法说明、计算公式、签字栏）全部原文照录。
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

# ★ 字体名只能用单引号：整段 css 会被塞进 HTML 的 style="" 属性里，
#   双引号会提前终止属性，字体设置就整段失效。
DEFAULT_FONT = "'宋体',SimSun,serif"


def esc(s):
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def num(v, d=0):
    try:
        return int(v)
    except (TypeError, ValueError):
        return d


def tw2px(tw):
    """Word twip(1/1440 inch) → CSS px(96dpi)。"""
    return max(1, int(round(tw / 15.0)))


# ------------------------- Word 原生文字格式 -------------------------

def font_family(rPr):
    f = rPr.find(W + "rFonts") if rPr is not None else None
    if f is None:
        return DEFAULT_FONT
    name = f.get(W + "eastAsia") or f.get(W + "ascii") or f.get(W + "hAnsi") or ""
    if not name or name in ("宋体", "SimSun"):
        return DEFAULT_FONT
    if name.startswith("FZ") or "GBK" in name:      # 方正字库，本机多半没装
        return DEFAULT_FONT
    return "'%s',%s" % (name, DEFAULT_FONT)


def para_css(p):
    """段落的字体/字号/加粗/对齐/行距，全部取自 Word 原生 rPr + pPr。"""
    pPr = p.find(W + "pPr")
    rPr = pPr.find(W + "rPr") if pPr is not None else None
    # 正文第一个 run 的格式优先于段落标记格式
    for r in p.findall(W + "r"):
        x = r.find(W + "rPr")
        if x is not None and (x.find(W + "sz") is not None or x.find(W + "rFonts") is not None):
            rPr = x
            break
    css = ["font-family:" + font_family(rPr)]
    if rPr is not None:
        sz = rPr.find(W + "sz")
        if sz is not None:
            css.append("font-size:%gpt" % (num(sz.get(W + "val"), 21) / 2.0))
        b = rPr.find(W + "b")
        if b is not None and b.get(W + "val") not in ("0", "false"):
            css.append("font-weight:bold")
        u = rPr.find(W + "u")
        if u is not None and u.get(W + "val") not in ("none",):
            css.append("text-decoration:underline")
        i = rPr.find(W + "i")
        if i is not None and i.get(W + "val") not in ("0", "false"):
            css.append("font-style:italic")
    if pPr is not None:
        jc = pPr.find(W + "jc")
        if jc is not None:
            m = {"center": "center", "right": "right", "both": "justify",
                 "left": "left", "distribute": "justify"}
            css.append("text-align:" + m.get(jc.get(W + "val"), "left"))
        sp = pPr.find(W + "spacing")
        if sp is not None and sp.get(W + "line"):
            line = num(sp.get(W + "line"), 0)
            if line >= 200 and sp.get(W + "lineRule") in (None, "auto", "atLeast"):
                css.append("line-height:%.2f" % (line / 240.0))
    return ";".join(css)


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


def part_block(root, kind, cls):
    """Word 页眉 / 页脚原文（也是原始记录的一部分），带原生字体字号。"""
    for p in root.findall(PKG + "part"):
        if kind not in (p.get(PKG + "name") or ""):
            continue
        paras = p.findall(".//" + W + "p")
        txt = "\n".join(inline_text(x) for x in paras).strip()
        if not txt:
            return ""
        css = para_css(paras[0]) if paras else ""
        # Word 页眉是「分散对齐」：左公司名 + 长空格串 + 右记录编号，同一行。
        # CSS justify 只会把空格撑大反而换行，这里用 flex 两端对齐还原成一行，
        # 两段文字一个字不改（空格本来就是排版留白）。
        m = re.search(r" {4,}", txt) if kind == "header" and "\n" not in txt else None
        if m:
            inner = "<span>%s</span><span>%s</span>" % (
                esc(txt[:m.start()]), esc(txt[m.end():]))
            cls += " lr-hdr-flex"
        else:
            inner = esc(txt).replace("\n", "<br>")
        return '<div class="%s"%s>%s</div>' % (
            cls, (' style="%s"' % css) if css else "", inner)
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


# ------------------------- Word 原生表格结构 -------------------------

def parse_table(tbl):
    """返回 {rows, cols, width, trh}；cols/trh/width 单位是 twip。
       rows=[[cell]]，cell.items 按 Word 顺序存 ('p',文字,css) / ('tbl',子表,"")。"""
    tblPr = tbl.find(W + "tblPr")
    width = 0
    if tblPr is not None:
        tw = tblPr.find(W + "tblW")
        if tw is not None and tw.get(W + "type") == "dxa":
            width = num(tw.get(W + "w"), 0)
    grid = tbl.find(W + "tblGrid")
    cols = [num(g.get(W + "w"), 0) for g in grid.findall(W + "gridCol")] if grid is not None else []

    rows, trh = [], []
    for tr in tbl.findall(W + "tr"):
        h, rule = 0, "atLeast"
        trPr = tr.find(W + "trPr")
        if trPr is not None:
            th = trPr.find(W + "trHeight")
            if th is not None:
                h = num(th.get(W + "val"), 0)
                rule = th.get(W + "hRule") or "atLeast"
        trh.append((h, rule))

        cells = []
        for tc in tr.findall(W + "tc"):
            gs, vm, valign, cw = 1, None, None, 0
            tcPr = tc.find(W + "tcPr")
            if tcPr is not None:
                g = tcPr.find(W + "gridSpan")
                if g is not None:
                    gs = num(g.get(W + "val"), 1)
                v = tcPr.find(W + "vMerge")
                if v is not None:
                    vm = "restart" if v.get(W + "val") == "restart" else "continue"
                va = tcPr.find(W + "vAlign")
                if va is not None:
                    valign = {"center": "middle", "top": "top", "bottom": "bottom"}.get(
                        va.get(W + "val"), None)
                w = tcPr.find(W + "tcW")
                if w is not None and w.get(W + "type") == "dxa":
                    cw = num(w.get(W + "w"), 0)
            items = []
            for ch in list(tc):
                if ch.tag == W + "p":
                    items.append(("p", inline_text(ch), para_css(ch)))
                elif ch.tag == W + "tbl":
                    items.append(("tbl", parse_table(ch), ""))
            cells.append({
                "items": items, "gs": gs, "vm": vm, "valign": valign, "w": cw,
                "text": "\n".join(t for k, t, _ in items if k == "p" and t),
                "nested": [v for k, v, _ in items if k == "tbl"],
            })
        rows.append(cells)
    return {"rows": rows, "cols": cols, "width": width or sum(cols), "trh": trh}


def walk_tables(t):
    """递归遍历文档里每一张表（含嵌套表），用于统一标记动态字段。"""
    yield t
    for row in t["rows"]:
        for c in row:
            for sub in c["nested"]:
                for x in walk_tables(sub):
                    yield x


def cell_html(c):
    if c.get("ov") is not None:
        return c["ov"]
    parts = []
    for k, v, css in c["items"]:
        if k == "p":
            if v.strip():
                parts.append('<div class="lr-wp"%s>%s</div>' %
                             ((' style="%s"' % css) if css else "",
                              esc(v).replace("\n", "<br>")))
        else:
            parts.append(render_table(v))
    return "".join(parts)


def render_table(t):
    rows, cols = t["rows"], t["cols"]
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

    # Word 原生列宽 + 固定布局，列宽不再被 CSS 均分
    st = ['<table class="lr-wt" style="width:%dpx;table-layout:fixed">' % tw2px(t["width"])]
    if cols:
        st.append('<colgroup>' + "".join('<col style="width:%dpx">' % tw2px(x) for x in cols)
                  + '</colgroup>')
    st.append('<tbody>')
    for ri, row in enumerate(rows):
        h, rule = t["trh"][ri] if ri < len(t["trh"]) else (0, "atLeast")
        attr = ""
        if h:
            attr = ' style="%s:%dpx"' % ("min-height" if rule == "atLeast" else "height",
                                         tw2px(h))
        st.append("<tr%s>" % attr)
        for c in row:
            if c["vm"] == "continue":
                continue
            a = ""
            if c["gs"] > 1:
                a += ' colspan="%d"' % c["gs"]
            if c.get("rs", 1) > 1:
                a += ' rowspan="%d"' % c["rs"]
            cs = ' style="vertical-align:%s"' % c["valign"] if c["valign"] else ""
            st.append("<td%s%s>%s</td>" % (a, cs, cell_html(c)))
        st.append("</tr>")
    st.append("</tbody></table>")
    return "".join(st)


def norm(s):
    return re.sub(r"\s+", "", s or "")


def mark_dynamic(t, solutions, hits, origs):
    """只标记用户指定的动态字段；其它单元格一律不动。"""
    LABELS = [
        ("sample", ("样品名称:", "样品名称：", "样品名称")),
        ("maker",  ("生产商名称:", "生产商名称：", "生产商名称")),
        ("batch",  ("批号/生产日期:", "批号/生产日期：", "批号/生产日期")),
        ("date",   ("检测日期:", "检测日期：", "检测日期")),
    ]
    rows = t["rows"]
    for ri, row in enumerate(rows):
        for ci, c in enumerate(row):
            t_ = norm(c["text"])
            for key, labels in LABELS:
                if t_ in labels and ci + 1 < len(row):
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

    blocks, roots = [], []
    hdr = part_block(root, "header", "lr-hdr")
    if hdr:
        blocks.append(hdr)
    for ch in list(body):
        if ch.tag == W + "p":
            t = inline_text(ch)
            css = para_css(ch)
            blocks.append('<div class="lr-wp"%s>%s</div>' %
                          ((' style="%s"' % css) if css else "",
                           esc(t).replace("\n", "<br>") if t.strip() else "&nbsp;"))
        elif ch.tag == W + "tbl":
            tb = parse_table(ch)
            roots.append(tb)
            blocks.append(("tbl", tb))
    ftr = part_block(root, "footer", "lr-ftr")
    if ftr:
        blocks.append(ftr)

    solutions = []
    hits = {"sample": 0, "maker": 0, "batch": 0, "date": 0, "std": 0}
    origs = []
    for tb in roots:
        for sub in walk_tables(tb):
            mark_dynamic(sub, solutions, hits, origs)

    html = "".join(b if isinstance(b, str) else render_table(b[1]) for b in blocks)
    n_img = len(re.findall(r"\x01IMG:", html))
    html = re.sub(r"\x01IMG:([A-Za-z0-9]+)\x01",
                  lambda m: img_tag(key, m.group(1)), html)

    # 文字完整性自检：OOXML 里每个中文片段都必须在输出里出现（动态位原值补回）
    src = re.sub(r"\s+", "", "".join(t.text or "" for t in root.iter(W + "t")))
    out = re.sub(r"<[^>]+>", "", html).replace("&nbsp;", "") \
             .replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    out = re.sub(r"\s+", "", out) + re.sub(r"\s+", "", "".join(origs))
    lost = [s for s in re.findall(r"[\u4e00-\u9fa5]{5,}", src) if s not in out]
    print("%-11s 表=%-2d 公式图=%-2d 原文字=%-6d 输出=%-6d 缺字=%-2d %s" %
          (key, html.count('<table class="lr-wt"'), n_img,
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
        "key": key, "name": META[key]["name"], "unit": META[key]["unit"],
        "order": META[key]["order"], "file": FILES[key],
        "html": html, "solutions": sols,
    }


def main():
    projects = [build_one(k) for k in META]
    projects.sort(key=lambda x: x["order"])
    obj = {"v": "2026-11-15c",
           "source": "9 份检测中心原始记录（Word 原生 OOXML 1:1 还原：文字、表格、字体字号、列宽行高、页面设置均未改）",
           "page": "A4 portrait", "projects": projects}
    js = ("/* 原始记录项目模板 · 由 scripts/build_labrecord.py 从 9 份 Word 原表的\n"
          "   Document.Content.WordOpenXML 1:1 生成；除动态字段外文字与排版未改，勿手改 */\n"
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
