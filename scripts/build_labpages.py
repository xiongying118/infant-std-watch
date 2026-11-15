# -*- coding: utf-8 -*-
"""把 9 份原始记录 Word 文档「整页」导出成 A4 位图，并量出动态字段精确坐标。

★ 为什么改走整页图（2026-11-15 用户口径）：
    「我要的是 100% 复刻，包括排版，什么内容在哪一页上」
    HTML 从 OOXML 重排无法保证分页/页码/框线/标题居中与 Word 一致；
    浏览器打印还会自带页眉（日期、标题）和页脚（about:blank、1/1）。
    直接以 Word 自己导出的 PDF 每页为底图，页面编排天然 1:1。

★ 只擦「原值文字」，不擦框线：Word 单元格的 Information(5) 是文字起点，
    比真实边框右偏约 5.5pt。所以先用 PDF 的细矩形框线把单元格左右边界
    吸附到真实坐标，再用 PDF 文本 span 的 bbox 把原示例值涂白，
    网页端只在原位写当前值 —— 一根框线都不会被动到。

链路：
  Word COM(只读) 打开 9 份 .doc/.docx → ExportAsFixedFormat(PDF)
  → 单元格几何 + PDF 框线吸附 + 文本 span 基线校准 + 原值涂白
  → PyMuPDF 逐页渲染灰度 PNG（288dpi）→ prototype/recpages/
  → prototype/labpages.js（window.LABPAGES）

本机中间产物 data/record_pdf/ 不进仓库（SKIP_DIRS 已排除）。
运行：C:/Users/13104/.workbuddy/binaries/python/envs/default/Scripts/python.exe scripts/build_labpages.py
"""
import io, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = r"D:\食品标准\4 原始记录表格-理化-AI数据训练\4 原始记录表格"
PDFDIR = os.path.join(ROOT, "data", "record_pdf")
IMGDIR = os.path.join(ROOT, "prototype", "recpages")
OUTJS = os.path.join(ROOT, "prototype", "labpages.js")
LABRECJS = os.path.join(ROOT, "prototype", "labrecord.js")

FILES = {
    "protein":    "蛋白质原始记录 20260518.doc",
    "choline":    r"胆碱液质原始记录202507启用\胆碱测定原始记录-成品-20250707.docx",
    "peroxide":   "过氧化值 20260518.doc",
    "phosphorus": "磷 240929.doc",
    "chloride":   "氯化物的原始记录 20260518.docx",
    "acidvalue":  "酸价 20260518.doc",
    "nitrite":    "亚硝酸盐与硝酸盐 20260519.docx",
    "fat":        "脂肪原始记录20260920.doc",
    "moisture":   "水分 20260313.doc",
}

LABELS = {
    "样品名称": "sample", "生产商名称": "maker",
    "批号/生产日期": "batch", "检测日期": "date",
}

SCALE = 4.0          # 288 dpi，A4 ≈ 2382×3368，灰度 PNG ≈ 450KB/页


def norm(s):
    return re.sub(r"\s+", "", s or "")


def g(fn, default):
    try:
        return fn()
    except Exception:
        return default


# ---------------------------------------------------------------- Word COM
def collect_cells(doc):
    """递归列出所有（含嵌套）表格的单元格几何，单位 pt，页面左上角为原点。"""
    tables = []

    def walk(t, path):
        cs = list(t.Range.Cells)
        recs = []
        for i, c in enumerate(cs):
            recs.append(dict(
                i=i,
                row=g(lambda c=c: int(c.RowIndex), 0),
                col=g(lambda c=c: int(c.ColumnIndex), 0),
                x=g(lambda c=c: float(c.Range.Information(5)), 0.0),   # 文字起点（≈表左边+单元格内边距）
                y=g(lambda c=c: float(c.Range.Information(6)), 0.0),   # 行文本顶
                w=g(lambda c=c: float(c.Width), 0.0),
                pg=g(lambda c=c: int(c.Range.Information(3)), 1),
                fs=g(lambda c=c: float(c.Range.Font.Size), 10.5),
                s=g(lambda c=c: (c.Range.Text or "").replace("\r", "").replace("\x07", "").strip(), ""),
            ))
        tables.append(dict(path=path, cells=recs))
        for j, c in enumerate(cs):
            for k, nt in enumerate(list(g(lambda c=c: c.Tables, []) or [])):
                walk(nt, "%s.%d.%d" % (path, j, k))

    for i, t in enumerate(list(doc.Tables)):
        walk(t, "T%d" % i)
    return tables


def row_rects(tables):
    """按 (table,row) 分组，按列序累加宽度算出每个单元格左边界（初值）。"""
    out = []
    for tb in tables:
        groups = {}
        for c in tb["cells"]:
            groups.setdefault(c["row"], []).append(c)
        for r, cs in groups.items():
            cs.sort(key=lambda c: (c["col"], c["i"]))
            x0 = min(c["x"] for c in cs if c["x"] > 0) if any(c["x"] > 0 for c in cs) else 0.0
            acc = x0
            rects = []
            for c in cs:
                rects.append(dict(c=c, x=acc, y=c["y"], w=c["w"], h=24.75))
                acc += c["w"]
            out.append((tb["path"], r, rects))
    return out


def load_labrec():
    s = io.open(LABRECJS, encoding="utf-8").read()
    m = re.search(r"window\.LABREC\s*=\s*(\{.*\})\s*;", s, re.S)
    if not m:
        raise SystemExit("解析 labrecord.js 失败")
    return {p["key"]: p for p in json.loads(m.group(1))["projects"]}


def find_fields(rows, labrec_sols):
    """只找用户认可的 4 个动态位 + 标准溶液编码/有效期至。"""
    fields, seen = [], set()

    def add(k, rect, orig, std=None):
        c = rect["c"]
        key = (k, std, round(rect["x"], 1), round(rect["y"], 1))
        if key in seen:
            return
        seen.add(key)
        fs = c["fs"] if 0 < c["fs"] < 100 else 10.5
        fields.append(dict(k=k, std=std, pg=c["pg"], x=rect["x"], y=rect["y"],
                           w=rect["w"], h=rect["h"], fs=fs, v=orig))

    for path, r, rects in rows:
        for i, rc in enumerate(rects):
            n = norm(rc["c"]["s"]).rstrip(":：")
            if n in LABELS and i + 1 < len(rects):
                add(LABELS[n], rects[i + 1], rects[i + 1]["c"]["s"])

    sol_by_norm = {norm(s["name"]): s["name"] for s in labrec_sols}
    for path, r, rects in rows:
        head = [norm(rc["c"]["s"]) for rc in rects]
        if "标准溶液编码" not in head or "有效期至" not in head:
            continue
        ic, ie = head.index("标准溶液编码"), head.index("有效期至")
        inm = head.index("标准溶液名称") if "标准溶液名称" in head else 0
        for path2, r2, rects2 in rows:
            if path2 != path or r2 <= r or max(ic, ie, inm) >= len(rects2):
                continue
            nm = norm(rects2[inm]["c"]["s"])
            if not nm or nm == "标准溶液名称":
                continue
            std = sol_by_norm.get(nm)
            if not std:
                continue
            add("stdcode", rects2[ic], rects2[ic]["c"]["s"], std)
            add("stdexp", rects2[ie], rects2[ie]["c"]["s"], std)
    return fields


# ---------------------------------------------------------------- PDF 校准
def pdf_meta(doc):
    """收集每页的文本 span 与真实框线（Word 把框线画成极细的实心矩形）。"""
    spans = {i + 1: [] for i in range(len(doc))}
    borders = {i + 1: dict(vx=[], hy=[]) for i in range(len(doc))}
    for pno, page in enumerate(doc, 1):
        for b in page.get_text("dict")["blocks"]:
            for l in b.get("lines", []):
                for s in l.get("spans", []):
                    if s["text"].strip():
                        spans[pno].append(dict(bbox=s["bbox"], by=s["origin"][1],
                                               size=s["size"], t=s["text"]))
        for dr in page.get_drawings():
            for it in dr["items"]:
                if it[0] != "re":
                    continue
                r = it[1]
                if r.width < 1.6 and r.height > 3:
                    borders[pno]["vx"].append((r.x0, r.y0, r.y1))
                elif r.height < 1.6 and r.width > 3:
                    borders[pno]["hy"].append((r.y0, r.x0, r.x1))
                    # 横框线的两端也是真实列边界（最后一列常没有独立竖线）
                    borders[pno]["vx"].append((r.x0, r.y0 - 1, r.y1 + 1))
                    borders[pno]["vx"].append((r.x1, r.y0 - 1, r.y1 + 1))
    return spans, borders


def nearest(vals, target, tol):
    if not vals:
        return None
    v = min(vals, key=lambda x: abs(x - target))
    return v if abs(v - target) <= tol else None


def snap_fields(fields, borders):
    """把单元格左右边界吸附到 PDF 里的真实竖框线，消除 5.5pt 内边距偏差。"""
    for f in fields:
        B = borders.get(f["pg"], dict(vx=[], hy=[]))
        x0, x1 = f["x"], f["x"] + f["w"]
        mid = f["y"] + f["h"] / 2
        vx = [x for (x, y0, y1) in B["vx"] if y0 - 3 <= mid <= y1 + 3]
        l, r = nearest(vx, x0, 12), nearest(vx, x1, 12)
        nl = l if l is not None else x0
        nr = r if r is not None else x1
        if nr - nl > 8:
            f["x"], f["w"] = nl, nr - nl
        y0, y1 = f["y"], f["y"] + f["h"]
        hy = [y for (y, hx0, hx1) in B["hy"]
              if hx0 - 3 <= f["x"] + f["w"] / 2 <= hx1 + 3]
        t, b = nearest(hy, y0, 12), nearest(hy, y1, 12)
        nt = t if t is not None else y0
        nb = b if b is not None else y1
        if nb - nt > 6:
            f["y"], f["h"] = nt, nb - nt
    return fields


def calibrate(fields, spans):
    """用 PDF 文本 span 校准基线 y / 字号 / 对齐；空单元格借同一行标签校准。"""
    for f in fields:
        x0, x1 = f["x"], f["x"] + f["w"]
        y0, y1 = f["y"] - 3, f["y"] + f["h"] + 3
        S = spans.get(f["pg"], [])
        band = [s for s in S if s["bbox"][1] >= y0 and s["bbox"][3] <= y1]
        incell = [s for s in band if s["bbox"][0] >= x0 - 3 and s["bbox"][2] <= x1 + 3]
        cand = incell if incell else band
        mid_c = (x0 + x1) / 2
        if cand:
            cand.sort(key=lambda s: -(s["bbox"][2] - s["bbox"][0]))
            ref = cand[0]
            f["by"] = ref["by"]
            f["fs"] = ref["size"]
            if incell:
                mid_s = (ref["bbox"][0] + ref["bbox"][2]) / 2
                f["anchor"] = "start" if abs(mid_s - mid_c) > f["w"] * 0.18 else "middle"
                f["tx"] = ref["bbox"][0] if f["anchor"] == "start" else mid_c
            else:
                f["anchor"], f["tx"] = "middle", mid_c
        else:
            f["by"] = f["y"] + f["h"] / 2 + f["fs"] * 0.35
            f["anchor"], f["tx"] = "middle", mid_c
        for k in ("x", "y", "w", "h", "tx", "by", "fs"):
            f[k] = round(f[k], 2)
    return fields


def erase_originals(doc, fields, spans):
    """只把动态格里的「原示例值文字」涂白，边框/其它文字一根线都不碰。"""
    n = 0
    for f in fields:
        x0, x1 = f["x"] + 1, f["x"] + f["w"] - 1
        y0, y1 = f["y"] + 1, f["y"] + f["h"] - 1
        hit = [s for s in spans.get(f["pg"], [])
               if s["bbox"][0] >= x0 - 2 and s["bbox"][2] <= x1 + 2
               and s["bbox"][1] >= y0 - 2 and s["bbox"][3] <= y1 + 2]
        if not hit:
            continue
        r = [min(s["bbox"][0] for s in hit) - 0.8, min(s["bbox"][1] for s in hit) - 0.8,
             max(s["bbox"][2] for s in hit) + 0.8, max(s["bbox"][3] for s in hit) + 0.8]
        import pymupdf
        doc[f["pg"] - 1].draw_rect(pymupdf.Rect(*r), color=None, fill=(1, 1, 1), overlay=True)
        n += 1
    return n


def render_pages(key, pdfpath, outdir, doc):
    from PIL import Image
    imgs, size = [], None
    for i, page in enumerate(doc):
        r = page.rect
        size = (round(r.width, 2), round(r.height, 2))
        pix = page.get_pixmap(matrix=__import__("pymupdf").Matrix(SCALE, SCALE),
                              colorspace=__import__("pymupdf").csGRAY, alpha=False)
        im = Image.frombytes("L", (pix.width, pix.height), pix.samples)
        # Word 原页就是黑白文字：16 级灰度足够保住笔画边缘，
        # 体积比 8bit 灰度 PNG 小约 36%，手机上 13 页也不至于卡。
        im = im.quantize(colors=16)
        name = "%s_%d.png" % (key, i + 1)
        im.save(os.path.join(outdir, name), format="PNG", optimize=True)
        imgs.append("recpages/" + name)
    return imgs, size


# ---------------------------------------------------------------- main
def main():
    import win32com.client as W
    import pymupdf
    os.makedirs(PDFDIR, exist_ok=True)
    os.makedirs(IMGDIR, exist_ok=True)
    labrec = load_labrec()
    word = W.Dispatch("Word.Application")
    word.Visible = False
    word.DisplayAlerts = 0
    out = {}
    try:
        for key, fn in FILES.items():
            src = os.path.normpath(os.path.join(BASE, fn))
            if not os.path.isfile(src):
                raise SystemExit("缺源文件：" + src)
            doc = word.Documents.Open(FileName=src, ConfirmConversions=False,
                                     ReadOnly=True, AddToRecentFiles=False, Visible=False)
            tables = collect_cells(doc)
            pdfpath = os.path.join(PDFDIR, key + ".pdf")
            doc.ExportAsFixedFormat(pdfpath, 17)      # wdExportFormatPDF
            doc.Close(0)

            pdf = pymupdf.open(pdfpath)
            spans, borders = pdf_meta(pdf)
            fields = calibrate(snap_fields(find_fields(row_rects(tables),
                                                      labrec[key]["solutions"]), borders), spans)
            erased = erase_originals(pdf, fields, spans)
            imgs, size = render_pages(key, pdfpath, IMGDIR, pdf)
            pdf.close()
            out[key] = dict(w=size[0], h=size[1], pages=imgs, fields=fields)
            kinds = {}
            for f in fields:
                kinds[f["k"]] = kinds.get(f["k"], 0) + 1
            print("%-11s pages=%d  %s  erased=%d  fields=%s" %
                  (key, len(imgs), "x".join(str(round(v)) for v in size), erased, kinds))
    finally:
        word.Quit()

    js = ("/* 9 份 Word 原表整页原版式 · 由 scripts/build_labpages.py 生成，勿手改 */\n"
          "window.LABPAGES = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
    io.open(OUTJS, "w", encoding="utf-8", newline="\n").write(js)
    total = sum(os.path.getsize(os.path.join(IMGDIR, f)) for f in os.listdir(IMGDIR)) / 1024 / 1024
    print("WROTE labpages.js %.1fKB / recpages %.2fMB" % (len(js) / 1024, total))


if __name__ == "__main__":
    main()
