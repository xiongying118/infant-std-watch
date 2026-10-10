#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
通则引用标准解析
================
婴配产品标准（GB 10765/10766/10767）本身不含检测方法细节，
真正决定"实验室怎么做"的是它**引用的一堆标准** —— 45 个左右，全是 GB 5009 检测方法、
GB 4789 微生物、GB 2762/2761 限量、GB 14880 营养强化剂这些。

只按关键词表监控会漏：这些标准不会主动出现在关键词检索里，
但实验室天天在用。所以要**通读通则正文、把引用关系提出来**。

★ 合规边界（重要，改代码前先看这段）★
  · 标准正文**只在内存里解析，绝不落盘**，不存 PDF、不存全文、不存章节文本
  · 唯一提取出来的是**标准号**（GB 5009.5 这种），属事实性引用关系
  · 落盘的只有：标准号 + 官方元数据（名称/状态/日期）+ 官方链接
  · 任何"把标准正文存进数据库"的改动都不要做

实测要点（2026-10-03）：
  1. 官方正文 PDF 在 `/diskFilePath/swfupload<timestamp>.pdf`，由 `view_Document` 页面 iframe 引入
  2. **PDF 文本是全角字符**（`ＧＢ１０７６５—２０２１`），还夹私用区字形残留
     —— 不做全角→半角归一化，正则一个都匹配不到（实测踩过）
  3. 页码/章节标题里也有标准号（规范性引用文件一章），要连正文一起扫
"""
from __future__ import annotations

import io
import re
from collections import Counter, OrderedDict

import pymupdf

from sources import CfsaSpptAdapter, guess_category

# 产品标准：三个婴配通则 + 乳粉/调制乳粉
# ★ GB 19644 也必须通读 ★
#   实测《食品安全国家标准 乳粉和调制乳粉》（GB 19644-2024，2025-02-08 实施）
#   是调制乳粉、普通乳粉的判定依据，实验室做这两类产品时直接引用。
#   它引用的 GB5009/GB4789 系列与婴配通则大量重叠，但也有独有项
#   （如 GB 19301 谷物、GB 14880 营养强化剂）。
GENERAL_STANDARDS = [
    ("GB 10765-2021", "食品安全国家标准 婴儿配方食品"),
    ("GB 10766-2021", "食品安全国家标准 较大婴儿配方食品"),
    ("GB 10767-2021", "食品安全国家标准 幼儿配方食品"),
    # ---- 乳粉 / 调制乳粉（用户明确要求加入） ----
    ("GB 19644-2024", "食品安全国家标准 乳粉和调制乳粉"),
    # ---- 实验室常检的其它乳制品品类 ----
    # 这些不是"婴配"，但同一实验室常做：客户送检的乳粉、调制乳粉、
    # 含乳饮料、发酵乳、奶油、干酪，判定依据各不相同，
    # 监控范围只锁在婴配通则上会漏掉实际在检的品类。
    ("GB 19302-2025", "食品安全国家标准 发酵乳"),
    ("GB 19646-2025", "食品安全国家标准 稀奶油、奶油和无水奶油"),
    ("GB 25192-2022", "食品安全国家标准 再制干酪和干酪制品"),
    ("GB 5420-2021", "食品安全国家标准 干酪"),
    ("GB 25190-2010", "食品安全国家标准 灭菌乳"),
    ("GB 19645-2010", "食品安全国家标准 巴氏杀菌乳"),
    ("GB 13102-2010", "食品安全国家标准 炼乳"),
]

# 引用的标准号：GB / GB-T / GB-T 食品添加剂 / QB
_REF_PATTERNS = [
    re.compile(r"GB/T\s*\d+(?:\.\d+)?(?:\s*[-—]\s*\d{4})?"),
    re.compile(r"GB\s*\d+(?:\.\d+)?(?:\s*[-—]\s*\d{4})?"),
    re.compile(r"QB(?:/T)?\s*\d+(?:\.\d+)?(?:\s*[-—]\s*\d{4})?"),
]
_NOISE = re.compile(r"GB/T?\s*(?:Z|A)?")


def _normalize_pdf_text(s: str) -> str:
    """PDF 文本归一化：全角→半角，剔除私用区字形残留。

    实测：官方 PDF 里 `GB 10765` 提取出来是 `ＧＢ１０７６５`（全角），
    还夹杂 U+E000 段的字形映射残留字符。不处理的话正则匹配数为 0。
    """
    out = []
    for ch in s:
        o = ord(ch)
        if 0xFF01 <= o <= 0xFF5E:
            out.append(chr(o - 0xFEE0))     # 全角字母数字标点
        elif o == 0x3000:
            out.append(" ")                 # 全角空格
        elif 0xE000 <= o <= 0xF8FF:
            out.append("")                  # 私用区：PDF 字形映射残留
        else:
            out.append(ch)
    return "".join(out)


def _clean_no(no: str) -> str:
    """标准号归一化：去空格、破折号统一。

    源站返回 `GB 10765-2021`，这里统一成 `GB10765-2021`；
    目标常量也走同一个函数，两边才能对上（踩过：一边带空格一边不带，比不中）。
    """
    s = re.sub(r"\s+", "", no or "")
    return s.replace("—", "-").replace("–", "-").replace("－", "-")


def extract_refs_from_pdf(pdf_bytes: bytes) -> OrderedDict[str, int]:
    """从标准正文 PDF 提取引用的标准号。返回 {标准号: 出现次数}。

    pdf_bytes 只在内存里，不落盘。
    """
    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    try:
        raw = "".join(doc[i].get_text() for i in range(doc.page_count))
    finally:
        doc.close()
    text = _normalize_pdf_text(raw)

    counter: Counter[str] = Counter()
    for pat in _REF_PATTERNS:
        for m in pat.findall(text):
            no = _clean_no(m)
            # 过滤明显不是标准号的碎片
            if len(no) < 6 or not re.match(r"^(GB|QB)", no):
                continue
            counter[no] += 1
    return OrderedDict(counter.most_common())


def crawl_general_standards(keywords: list[str] | None = None) -> dict:
    """通读三个通则，提取引用标准，回官方源抓元数据。

    返回 {"refs": [...], "details": {标准号: {名称, 状态, 分类, 官方链接}}, "by_general": {...}}
    """
    ad = CfsaSpptAdapter()

    # 1) 找各产品标准的正文 PDF 文件名（检索词从 GENERAL_STANDARDS 推，不写死）
    print("[通则] 查找正文…")
    want = {_clean_no(g[0]) for g in GENERAL_STANDARDS}
    targets: dict[str, str] = {}       # 归一化标准号 -> fact_name
    for kw in [g[0].rsplit("-", 1)[0] for g in GENERAL_STANDARDS]:
        try:
            for it in ad._search_raw(kw, ad.TAB_STANDARD):
                code = _clean_no(it.get("CODE") or "")
                if code not in want:
                    continue
                fj = it.get("FJ") or []
                if fj and fj[0].get("FACT_NAME"):
                    targets[code] = fj[0]["FACT_NAME"]
        except Exception as e:                          # noqa: BLE001
            print(f"    查 {kw} 失败：{e}")
    if not targets:
        print("[通则] 未取到正文文件，检查接口是否变更")
        return {"refs": [], "details": {}, "by_general": {}}

    # 2) 读正文（只在内存）→ 提取引用
    by_general: dict[str, list[str]] = {}
    all_refs: Counter[str] = Counter()
    for code, fact in targets.items():
        try:
            pdf_bytes = ad.fetch_document(fact)
        except Exception as e:                          # noqa: BLE001
            print(f"    取 {code} 正文失败：{e}")
            continue
        if not pdf_bytes:
            continue
        refs = extract_refs_from_pdf(pdf_bytes)
        del pdf_bytes                     # 立刻释放，不留在内存
        # 去掉通则自己
        refs = {k: v for k, v in refs.items() if k != code}
        by_general[code] = list(refs.keys())
        all_refs.update(refs)
        print(f"    {code} 引用 {len(refs)} 个标准")

    if not all_refs:
        return {"refs": [], "details": {}, "by_general": by_general}

    # 3) 去掉年份后作为检索词（GB5009.5-2016 → GB 5009.5），
    #    否则按全称查会漏掉旧年份版本
    base_terms = sorted({"GB " + re.sub(r"-\d{4}$", "", k).replace("GB", "").replace("/", "/")
                         for k in all_refs if k.startswith("GB")})
    base_terms = [t.strip() for t in base_terms if t.strip()]
    print(f"[通则] 去重后 {len(all_refs)} 个引用标准，"
          f"派生出 {len(base_terms)} 个检索词，回源抓元数据…")

    # 4) 回官方源抓元数据（分批，避免单次请求过大）
    details: dict[str, dict] = {}
    for i in range(0, len(base_terms), 15):
        batch = base_terms[i:i + 15]
        try:
            for s in ad.fetch(batch):
                details[s.std_no] = {
                    "std_no": s.std_no, "title": s.title, "status": s.status,
                    "category": s.category, "publish_date": s.publish_date,
                    "implement_date": s.implement_date,
                    "official_url": s.official_url,
                    "download_allowed": s.download_allowed,
                }
        except Exception as e:                          # noqa: BLE001
            print(f"    批次 {i} 失败：{e}")
        print(f"    已抓 {len(details)} 条")

    return {"refs": list(all_refs.keys()), "details": details, "by_general": by_general}


def link_refs_to_details(refs: list[str], details: dict[str, dict]) -> dict[str, list[dict]]:
    """把"引用到的标准号"关联到"已抓到的元数据"。

    两侧格式天然不一致（实测）：
      引用侧：GB5009.5   （正文里写的，无空格无年份）
      元数据侧：GB 5009.5-2016（源站返回的，带空格带年份）
    所以要按"去掉空格 + 去掉年份 + 补上 GB 前缀"归一后再比。

    返回 {归一化引用号: [匹配到的元数据, ...]}，**按实施日期倒序** ——
    即实验室当前应该执行的那一版排在最前面。

    ★ 不能按 status 排 ★（踩过）：源站对历史版本也标"现行"
    （实测 GB 5009.5 的 2010/2016/2025 三个版本状态都是"现行"），
    按状态排会随机取到旧版。必须按 implement_date 倒序。
    """
    index: dict[str, list[dict]] = {}
    for full, meta in details.items():
        index.setdefault(_ref_key(full), []).append(meta)
    out: dict[str, list[dict]] = {}
    for r in refs:
        k = _ref_key(r)
        if k in index:
            # 实施日期倒序：最新实施的排前面，那才是实验室要用的版本
            ms = sorted(index[k], key=lambda m: (m.get("implement_date") or ""),
                        reverse=True)
            out[r] = ms
    return out


def _ref_key(no: str) -> str:
    """引用标准号归一键：去空格、去年份、统一大写与前缀。

    ★ 修过一个隐蔽的 bug（2026-10-03）★
      "GB/T 5009.11" → s[3:] 从 "GB/T5009.11" 的第 4 个字符切，
      切掉了 "GB/" 却留下了 "T"，拼成 "GBTT5009.11"。
      结果所有 GB/T 方法标准的引用键都对不上 —— 二级引用展开时
      整整 14 个 GB/T 方法被记成了不存在的 "GBTTxxx"。
      正确做法：把整个 "GB/T" 三字符一起替换成 "GBT"。
    """
    s = re.sub(r"\s+", "", no or "").upper().replace("—", "-")
    s = re.sub(r"-\d{4}$", "", s)          # 去掉年份
    s = s.replace("GB/T", "GBT").replace("QB/T", "QBT")
    if not s.startswith(("GB", "QB")):
        s = "GB" + s
    return s


def ref_keywords() -> list[str]:
    """从通则解析结果生成检索词，供主流程作为"附加检索词"使用。

    这批标准的特点：不会主动出现在关键词表检索里（关键词表只列了常见的十几条），
    但实验室天天在用。通读通则才能把它们挖出来。
    """
    import os
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                     "..", "data", "general_refs.json")
    if not os.path.exists(p):
        return []
    import json
    with io.open(p, encoding="utf-8") as f:
        d = json.load(f)
    bg = d.get("by_general") or {}
    refs = set()
    for v in bg.values():
        refs.update(v)
    # 归一成检索词：GB5009.5 → GB 5009.5
    terms = set()
    for r in refs:
        m = re.match(r"^(GB/T|GB|QB/T|QB)(\d+(?:\.\d+)?)", _clean_no(r))
        if m:
            prefix = {"GBT": "GB/T", "QB": "QB", "QBT": "QB/T"}.get(m.group(1), "GB")
            terms.add(f"{prefix} {m.group(2)}")
    return sorted(terms)


if __name__ == "__main__":
    import json
    import os

    r = crawl_general_standards()
    linked = link_refs_to_details(r["refs"], r["details"])
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                       "..", "data", "general_refs.json")
    with io.open(out, "w", encoding="utf-8") as f:
        json.dump({"details": r["details"], "by_general": r["by_general"],
                   "linked": linked}, f, ensure_ascii=False, indent=1)
    hit = len(linked)
    print(f"\n引用 {len(r['refs'])} 个标准号，"
          f"成功关联 {hit} 个；元数据共 {len(r['details'])} 条 → {out}")
