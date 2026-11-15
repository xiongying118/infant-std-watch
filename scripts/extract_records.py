# -*- coding: utf-8 -*-
"""批量读取 9 份原始记录 Word 模板的段落与表格结构，落盘 JSON。
   走本地 editor_sdk 通道（workbuddy-local-office-edit）。只读，不改动源文件。
   生成的 data/record_src/*.json 是本机中间产物，不进仓库。"""
import subprocess, sys, json, os, io, tempfile

SDK = r"D:/LenovoSoftstore/Install/WorkBuddy/resources/app.asar.unpacked/resources/plugins/workbuddy-builtin/skills/workbuddy-local-office-edit/edsdk.py"
BASE = r"D:\食品标准\4 原始记录表格-理化-AI数据训练\4 原始记录表格"
OUT = r"D:\workbuddy存储数据\2026-10-03-11-07-27\std-watch\data\record_src"
os.makedirs(OUT, exist_ok=True)

FILES = [
    ("protein",    "蛋白质原始记录 20260518.doc"),
    ("choline",    r"胆碱液质原始记录202507启用\胆碱测定原始记录-成品-20250707.docx"),
    ("peroxide",   "过氧化值 20260518.doc"),
    ("phosphorus", "磷 240929.doc"),
    ("chloride",   "氯化物的原始记录 20260518.docx"),
    ("acidvalue",  "酸价 20260518.doc"),
    ("nitrite",    "亚硝酸盐与硝酸盐 20260519.docx"),
    ("fat",        "脂肪原始记录20260920.doc"),
    ("moisture",   "水分 20260313.doc"),
]


def call(tool, **kw):
    tmp = os.path.join(tempfile.gettempdir(), "_edsdk_args.json")
    io.open(tmp, "w", encoding="utf-8").write(json.dumps(kw, ensure_ascii=False))
    r = subprocess.run([sys.executable, SDK, "call", tool, "--json-file", tmp],
                       capture_output=True, text=True, encoding="utf-8", errors="ignore")
    s = (r.stdout or "").strip()
    try:
        return json.loads(s)
    except Exception:
        return {"_raw": s[:8000], "_err": (r.stderr or "")[:500], "_rc": r.returncode}


def slim_cells(block):
    t = (block or {}).get("table") or {}
    out = []
    for c in t.get("cells", []):
        out.append({
            "r": c.get("row"), "c": c.get("col"),
            "t": (c.get("text") or "").strip(),
            "m": 1 if c.get("is_merge_continue") else 0,
        })
    return {"rows": t.get("row_count"), "cols": t.get("col_count"),
            "cells": out, "borders": t.get("borders")}


for key, rel in FILES:
    path = os.path.join(BASE, rel)
    print("OPEN", key, os.path.exists(path), flush=True)
    if not os.path.exists(path):
        continue
    o = call("open_file", file_path=path, file_type="doc", wait=True)
    fid = path
    res = {"key": key, "file": rel, "open": o if isinstance(o, dict) else str(o)}
    st = call("doc_resolve_document_structure", file_id=fid, mode="full",
              include_table_cells=True, text_preview_length=200, limit=0)
    res["structure"] = st
    lt = call("doc_list_tables", file_id=fid)
    res["list_tables"] = lt
    tabs = []
    for t in (lt.get("tables") or []):
        tid = t.get("table_id")
        info = call("doc_get_table_info", file_id=fid, **({"table_id": tid} if tid else {"idx": t.get("table_start")}))
        tabs.append({
            "index": t.get("index"), "id": tid,
            "rows": t.get("row_count"), "cols": t.get("col_count"),
            "merge": t.get("merge_ranges"),
            "first": t.get("first_row_texts"),
            "detail": slim_cells(info.get("block")),
            "_raw": info.get("_raw", "")[:1200] if "_raw" in info else "",
        })
    res["tables"] = tabs
    dest = os.path.join(OUT, key + ".json")
    io.open(dest, "w", encoding="utf-8").write(json.dumps(res, ensure_ascii=False, indent=1))
    print("  tables=%d out=%s bytes=%d" % (len(tabs), dest, os.path.getsize(dest)), flush=True)
    call("close_file", file_id=fid, force=True)
print("DONE")
