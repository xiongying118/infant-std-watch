#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
标准勘误分析与提醒生成
======================
为什么单独一个模块：勘误是**独立于标准换版的一类变更**。
标准号不变、实施日期不变、公告也不会再发，只在勘误表里改一句话。
**按标准号做监控，永远发现不了勘误** —— 而实验室按错误勘误做出来的检测结果是错的。

实测数据（CFSA 勘误库 176 条，2018-06 至今）里最典型的两条：
  GB 8538-2022      定量限 10 mg/L → 0.1 mg/L        （方法能力差 100 倍）
  GB 5009.208-2016  "转移上层有机相" → "转移上层水相"
      （原文注明"有机相在下层"，照错误原文操作，结果就是错的）

分级思路：不按"改了多少字"分，按**改了会不会影响检测结果**分。
"""
from __future__ import annotations

import io
import json
import os
import re
from datetime import datetime, date

# ---------------- 严重度判据 ----------------

# 实质性错误：官方自己承认"与实际操作不符"或明说改错了
_SUBSTANTIVE_REASON = re.compile(
    r"与实际操作不符|原文有误|有误|错误|不正确|笔误|漏|多余|颠倒|相反")

# 改到了会影响数值的部分 → 结果可能变
# 注意：勘误 before/after 里常夹带 <img> 这类富文本标签，
# 直接对原文跑正则会被 "<img ...>" 里的符号骗到（实测误判 16 条），
# 所以先剥标签再判。
_NUMERIC_IMPACT = [
    (r"定量限|检出限|检测限|方法适用范围", "定量限/适用范围", "high"),
    (r"[限量指标].{0,12}[<>≥≤]|应\s*[<>≥≤]|不得超过|不得低于", "限量值比较符号", "high"),
    (r"限量|指标|含量要求|不得超过|应≤|应≥", "限量指标", "high"),
    (r"系数|折算|换算|计算公式", "换算系数/计算公式", "high"),
    (r"试剂.{0,10}(浓度|用量|配比)|标准溶液.{0,10}浓度|[Kk][OoO]H|NaOH", "试剂/滴定液标定", "high"),
    (r"提取|萃取|净化|消解|前处理|上机|进样|定容|转移", "前处理/上样步骤", "high"),
    (r"计算|结果报告|判定|报告", "结果计算/判定", "high"),
    (r"菌落|计数|鉴定|培养基|显色|观察|判读|阳性|阴性", "微生物判读", "mid"),
    (r"上层|下层|水相|有机相", "萃取相选择", "high"),   # 取错相 = 测错东西
    (r"pH|酸度|温度|时间|压力|转速|波长|稀释", "关键操作参数", "mid"),
]
_NUMERIC_RE = [(re.compile(p), lb, lv) for p, lb, lv in _NUMERIC_IMPACT]

# 明显只是改了错别字/编号/排版
_TYPO_RE = re.compile(
    r"^\s*(GB/?T?\s*[\d.]+)\s*$|编号|页码|字体|排版|空格|换行|标点|"
    r"图\s*\d|表\s*\d.*?(编号|顺序)|^\s*[\d.]+\s*$")
_WORD_FIXUP = re.compile(r"[A-Za-z]")
# 富文本标签（勘误原文里夹带的编辑器产物）
_RICH_TAG = re.compile(r"<[^>]+>")


def _fmt_std_no(no: str) -> str:
    """统一标准号写法：GB 5009.235-2016 / GB 5009.296 -2023 → GB 5009.235-2016。

    官方勘误记录里同一个标准有三种写法（带年份 / 不带年份 / 年份前多空格），
    混着显示会让同一个标准看起来像好几个。统一成带年份的规范写法。
    查不到年份时保留原样（不硬编）。
    """
    s = re.sub(r"\s+", " ", (no or "").strip())
    s = re.sub(r"\s*-\s*(\d{4})\s*$", r"-\1", s)      # " -2023" → "-2023"
    s = re.sub(r"\s+", "", s.replace(" ", ""))              # 去所有空格
    m = re.match(r"^(GB/?T?[\d.]+)(-\d{4})?$", s, re.I)
    if not m:
        return s or (no or "")
    main = m.group(1).upper()
    # 归一后可能是 "GB5009.235" 或 "GB/T22388"（前缀与数字之间没有空格）
    if main.startswith("GB/T"):
        main = "GB/T " + main[4:]      # "GB/T22388"  → "GB/T 22388"
    elif main.startswith("GBT"):
        main = "GB/T " + main[3:]      # "GBT22388"   → "GB/T 22388"
    elif main.startswith("GB"):
        main = "GB " + main[2:]        # "GB5009.235" → "GB 5009.235"
    year = m.group(2) or ""
    if not year:
        # 没写年份 → 查 STD 库里该标准的现行版本，补上
        cur = _current_version(main)
        return cur if cur else main + "（版本待补）"
    return main + year


# STD 库缓存（从 data.js 的 STD 段读「标准号 → 现行版本号」）
_cur_ver_cache: dict[str, str] | None = None


def _current_versions() -> dict[str, str]:
    global _cur_ver_cache
    if _cur_ver_cache is not None:
        return _cur_ver_cache
    out: dict[str, str] = {}
    try:
        base = os.path.dirname(os.path.abspath(__file__))
        p = os.path.join(base, "..", "prototype", "data.js")
        if not os.path.exists(p):
            return out
        txt = io.open(p, encoding="utf-8", newline="").read().replace("\r\n", "\n")
        m = re.search(r"\n  STD: \[\n", txt)
        if not m:
            return out
        end = txt.find("\n],", m.start())
        seg = txt[m.start():end if end > 0 else len(txt)]
        for obj in re.finditer(r"\{[^}]*\}", seg):
            t = obj.group(0)
            no_m = re.search(r'(?:^|[,\{])no:"([^"]+)"', t)
            if not no_m:
                continue
            no = no_m.group(1)
            # 只要「现行有效」的版本
            if "现行有效" not in t and "现行" not in t:
                continue
            out.setdefault(_refkey(no), no)
    except Exception:                              # noqa: BLE001
        pass
    _cur_ver_cache = out
    return out


def _current_version(main_no: str) -> str:
    """查 STD 库里该标准的现行版本号（带年份），查不到返回空串。"""
    k = _refkey(main_no)
    return _current_versions().get(k, "")


def _plain(s: str) -> str:
    """剥掉 HTML 标签，只留纯文本。"""
    return _RICH_TAG.sub(" ", s or "")


# 勘误原文里的公式是**图片**（官方用富文本编辑器插入的）
#   <img title="1.png" src="/resources/script/ueditor/jsp/upload/20180404/16456378901234567890.png">
# 把 img 标签直接剥掉 → 公式内容**彻底丢失**（只剩空白），
# 用户看到「改前：（空）改后：（空）」，根本不知道改了什么（2026-11-05 用户截图指出）。
#   实测：GB 5009.154-2023「27公式（7）」这条，改前改后都是图片。
#
# 办法：把图片转成「公式图片 N（点此看官方原图）」并附上直链，
# 页面上显示成可点的链接，用户一点就看到官方那张公式图。
_IMG_TAG = re.compile(r'<img[^>]*?src="([^"]+)"[^>]*?>', re.I)
_IMG_TITLE = re.compile(r'title="([^"]*)"', re.I)


def _formula_text(s: str) -> str:
    """把含图片的勘误原文转成「文字 + 可点公式链接」。

    · 没有图片 → 原样返回（已剥标签的纯文本）
    · 有图片   → 图片位置替换成「📐 公式图 N（点此看官方原图）」+ 直链
    """
    s = s or ""
    if "<img" not in s.lower():
        return " ".join(_plain(s).split())
    out = []
    idx = [0]
    for m in _IMG_TAG.finditer(s):
        # 图片前面的文字（可能是公式编号）
        head = " ".join(_plain(s[idx[0]:m.start()]).split())
        if head:
            out.append(head)
        url = m.group(1)
        if url.startswith("/"):
            url = "https://sppt.cfsa.net.cn:8086" + url
        tm = _IMG_TITLE.search(m.group(0))
        title = tm.group(1) if tm else ""
        n = idx[0] + 1
        idx[0] = m.end()
        label = "公式图" if not title or title.lower().endswith(".png") else title
        out.append("📐 %s %d（点此看官方原图：%s）" % (label, n, url))
    tail = " ".join(_plain(s[idx[0]:]).split())
    if tail:
        out.append(tail)
    return " ".join(out)


def _is_pure_typo(before: str, after: str) -> bool:
    """判断是否只是改了错别字/编号/排版。

    判据：把数字和英文单词去掉后，两边文本基本一致 → 认为是文字性修正。
    例：GB 50069.268 → GB 5009.268（编号写错）
    """
    b, a = _plain(before), _plain(after)
    if not b.strip() or not a.strip():
        # 剥完标签就没内容了（原文是图片），算纯展示层修改
        return True

    def core(s: str) -> str:
        return re.sub(r"\s+", "", re.sub(r"[\d.]+", "", s))
    cb, ca = core(b), core(a)
    if cb and ca and (cb == ca or ca in cb or cb in ca):
        return True
    # 只有字母/数字变化
    if _WORD_FIXUP.sub("", b).strip() == _WORD_FIXUP.sub("", a).strip():
        return True
    return False


def grade_erata(item: dict) -> tuple[str, str]:
    """给一条勘误定级。返回 (level, 一句话说明)。

    level: high / mid / low
    """
    before = _plain(item.get("before") or "")
    after = _plain(item.get("after") or "")
    reason = item.get("reason") or ""
    both = f"{before} {after}"

    # 0) 原文只是图片：剥标签后没文本，改的是排版，不影响检测
    if not before.strip() or not after.strip():
        return "low", "原文为图表，勘误仅涉及展示，不影响检测结果"

    # 1) 官方自己承认原文有误 → 至少 mid
    if _SUBSTANTIVE_REASON.search(reason) and "编辑性" not in reason:
        return "high", f"官方勘误原因：{reason}"

    # 2) 改到了会影响数值的具体位置
    for rx, label, lv in _NUMERIC_RE:
        if rx.search(both):
            return lv, f"改动涉及{label}"

    # 3) 纯文字性修正
    if _is_pure_typo(before, after):
        return "low", "文字性修正，不影响检测结果"

    # 4) 数字集合变了但位置看不出 → 可疑，判 mid
    nb = set(re.findall(r"\d+(?:\.\d+)?", before))
    na = set(re.findall(r"\d+(?:\.\d+)?", after))
    if nb != na:
        return "mid", "改前改后数值不同，需核对是否影响结果"

    if reason:
        return "low", f"原因：{reason}"
    return "low", "内容变更，需知悉"


def is_relevant_erata(item: dict) -> bool:
    """这条勘误跟婴配实验室有没有关系。

    ★ 2026-11-05 判定逻辑大改（用户要求：「只要现行版本有效，全部都要」）★
    原先靠一张关键词表判"相不相关"，实测误杀严重：
      GB 5009.86-2016「食品中抗坏血酸的测定」—— 名称里没有"维生素"三字，
      关键词表判 False → 实验室天天在测的抗坏血酸，勘误被丢掉。
      GB 5009.3 / 5009.4 / 5009.90 等同理。

    现在的判定（先范围、后关键词，顺序不能反）：
      1. **在通则引用范围内 → 直接相关**（这是最硬的依据：
         通则的规范性引用文件点了名，就是实验室必须执行的标准）
      2. 范围外的 → 再用排除表 + 关键词表兜底（避免整个勘误库 187 条全进来）
    """
    name = item.get("std_name") or ""

    # 1) ★ 范围优先 ★
    #   范围内（现行有效的通则引用标准）→ 全部收录，一个不丢。
    #   这是用户 2026-11-05 的明确要求：「只要现行版本有效，全部都要」。
    if in_ref_scope(item.get("std_no", "")):
        return True

    # 2) 范围外的，用排除表 + 关键词表兜底
    blob = " ".join([item.get("std_no", ""), name,
                     _plain(item.get("before", "")), _plain(item.get("after", ""))])
    if _EXCLUDE_RE.search(name):
        return False
    return bool(_RELEVANT_RE.search(blob))


# ============================================================
# ★ 范围限定：只保留"通则引用标准"里的勘误/修改单 ★
# ============================================================
# 用户要求（2026-10-03）：
#   "标准勘误的只需对通则引用标准里的进行更新提醒，其他的不需要"
#
# 为什么这个限定是合理的、而不是偷懒：
#   实验室真正要盯的是**通则正文规范性引用文件一章列出的那批标准** ——
#   婴配产品标准（GB 10765/10766/10767 + GB 19644 等）明确要求执行这些方法。
#   其余标准（食品添加剂 GB 1886 系列、营养强化剂 GB 1903 系列等）
#   不在婴配产品标准的引用清单里，出具婴配检测报告时用不到，
#   混进提醒队列只会稀释真正要处理的那几条。
#
# ★ 范围不是只有一级引用 ★（踩过）
#   第一版只按 general_refs.json 的 linked（一级）做范围，结果只有 10 条，
#   **黄曲霉毒素 GB 5009.22 / GB 5009.24 的勘误漏了** —— 可实验室天天在测。
#   原因：通则引用的是**限量标准**（GB 2761/2762/29921），
#   检测方法在限量标准的引用文件里，是**二级引用**。
#   现由 scripts/expand_refscope.py 生成 data/refscope.json（传递闭包 + 通则引用页
#   现行执行标准），本模块读它。范围数据缺失时回退到一级引用，且不误杀。
_SCOPE_CANDIDATES = ("refscope.json", "general_refs.json")
_refscope_cache: set[str] | None = None
_refscope_cache_map: dict[str, list[str]] | None = None


def _refscope_map() -> dict[str, list[str]]:
    """范围表（归一标准号 → 来源说明列表）。

    ★ 与 _refscope() 的区别 ★
      _refscope() 只返回 set（归一后的标准号），没有来源信息；
      页面要区分「官方通则引用的」和「实验室在检补充的」，
      就需要来源 → 用这个。
    """
    global _refscope_cache, _refscope_cache_map
    if _refscope_cache_map is not None:
        return _refscope_cache_map
    out: dict[str, list[str]] = {}
    for fn in _SCOPE_CANDIDATES:
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                            "..", "data", fn)
        if not os.path.exists(path):
            continue
        try:
            d = json.load(io.open(path, encoding="utf-8"))
        except Exception:                              # noqa: BLE001
            continue
        if fn == "refscope.json":
            for k, why in (d.get("scope") or {}).items():
                rk = _refkey(k)
                if rk:
                    out[rk] = list(why) if isinstance(why, list) else [str(why)]
        else:
            for key in (d.get("linked") or {}):
                out.setdefault(_refkey(key), []).append("通则直接引用")
        if out:
            break
    _refscope_cache_map = out
    _refscope_cache = set(out)
    return out


def _refscope() -> set[str]:
    """通则引用范围的**归一标准号**集合（大写、去空格、去年份、GB/T→GBT）。"""
    global _refscope_cache
    if _refscope_cache is not None:
        return _refscope_cache
    scope: set[str] = set()
    for fn in _SCOPE_CANDIDATES:
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                            "..", "data", fn)
        if not os.path.exists(path):
            continue
        try:
            d = json.load(io.open(path, encoding="utf-8"))
        except Exception:                              # noqa: BLE001
            continue
        if fn == "refscope.json":
            # ★ 必须走 _refkey() 归一 ★
            #   范围表的键是裸号（GB5009.5 / GB/T22388 / JJF1070），
            #   直接 .upper() 得到 "GB/T22388"，而 in_ref_scope 里比的是
            #   _refkey() 的结果 "GBT22388" → 永远对不上 → 该标准静默丢失。
            #   （GB/T 必须三字符整体替换，详见 _refkey 的注释）
            for k in (d.get("scope") or {}):
                rk = _refkey(k)
                if rk:
                    scope.add(rk)
        else:
            # 回退：general_refs.json 的一级引用（只有通则正文直接引用的那些）
            for key in (d.get("linked") or {}):
                scope.add(_refkey(key))
                for v in (d["linked"][key] or []):
                    scope.add(_refkey(v.get("std_no") or ""))
        if scope:
            break                      # 优先用 refscope.json
    _refscope_cache = {s for s in scope if s}
    return _refscope_cache


# ================================================================
# ★★★ 号段兜底 —— 已删除（2026-11-05，用户明确要求）★★★
#
# 原来这里有一层「检测方法类号段通配」：
#   GB 5009.x / GB 4789.x / GB 5413.x / GB 31604.x / GB 4806.x 全部纳入范围。
# 理由是"范围表靠人工维护必然漏"（实测漏掉 GB 5009.111 呕吐毒素、
# GB 5009.257 反式脂肪酸等实验室天天用的方法）。
#
# ★ 但这是错的 ★
#   号段通配 = 无限制扩张。实测后果（用户 2026-11-05 截图指正）：
#   42 个标准靠它混进了婴配勘误列表，其中大量与婴配实验室无关 ——
#   GB 5009.225 酒和食用酒精 / GB 4789.20 水产品采样 / GB 5009.139 饮料咖啡因
#   / GB 5009.202 食用油极性组分 / GB 5009.148 植物性食品游离棉酚
#   / GB 5009.42 食用盐指标 / GB 31604.x 食品接触材料迁移量 ……
#   用户原话：「我只要通则里的标准 你把其他放来干啥」
#
# ★ 正确做法 ★
#   范围只有一个权威来源 = refscope.json（范围表）：
#     ① 通则正文「规范性引用文件」直接引用
#     ② 通则引用页已核定的现行执行标准（含跨标准号替代后的新版）
#     ③ 限量标准（GB 2761/2762/29921）引用的检测方法（二级传递闭包）
#   这三层都由 expand_refscope.py 从官方正文算出，不是手工维护。
#   若某个方法标准漏了，正确动作是**把它补进范围表并注明来源**，
#   而不是把整个号段放行。
#
#   用户 2026-11-05 明确点了两个不要的：
#     「不要 GB 5009.235 氨基酸态氮、GB 5009.111 呕吐毒素」
#   —— 这两个都不在 refscope 里，删掉兜底后自然消失。
#
# ★ 顺带修掉一个隐蔽 bug ★
#   原来范围表缺失时 return True（"不误杀"）—— 那会让范围失控，
#   正是这次 42 个标准混入的隐患。→ 现在缺文件时返回空集合，
#     宁可少提醒也不误报。范围表由每日管线 refresh（expand_refscope.py --daily）。


def _refkey(no: str) -> str:
    """归一：GB 5413.30-2016 → GB5413.30；GB/T 22388-2008 → GBT22388。

    ★ "GB/T" 要三字符整体替换成 "GBT" ★
    用 s[3:] 切会剩个 T（"GB/T5009.11"[3:] == "T5009.11"），
    拼出来是 "GBTT5009.11"，所有 GB/T 方法都对不上 —— 踩过。
    """
    n = re.sub(r"\s+", "", (no or "").strip().rstrip(",，")).upper().replace("—", "-")
    n = re.sub(r"-\d{4}$", "", n)
    n = n.replace("GB/T", "GBT").replace("QB/T", "QBT")
    # ★ JJF / JB 也要认（计量检定规程，婴配实验室在用）★
    #   原来只要不是 GB/QB 开头就强加 "GB" 前缀 →
    #   "JJF 1070-2023" 变成 "GBJJF1070"，跟官方库的 "JJF1070" 对不上，
    #   这个标准的勘误/修改单永远匹配不上（2026-11-05 踩到）。
    if not n.startswith(("GB", "QB", "JJF", "JB")):
        n = "GB" + n
    return n


def bare_std_no(no: str) -> str:
    """对外的裸号（保持 GB/T 形态，仅去年份），供日志与调试用。"""
    n = re.sub(r"\s+", "", (no or "").strip().rstrip(",，"))
    return re.sub(r"-\d{4}$", "", n).upper()


def in_ref_scope(no: str) -> bool:
    """该标准是否在通则引用范围内。

    ★ 唯一判据 = refscope.json 范围表 ★（2026-11-05）
      范围表三层来源，全部由 expand_refscope.py 从官方正文算出：
        ① 通则正文「规范性引用文件」直接引用
        ② 通则引用页已核定的现行执行标准
        ③ 限量标准引用的检测方法（二级传递闭包）
      原来的「检测方法类号段通配」已删除 —— 它把 42 个与婴配无关的标准
      （酒类/水产品/饮料咖啡因/食用油…）放了进来。
      用户原话：「我只要通则里的标准 你把其他放来干啥」

    ★ 范围表缺失时不放行任何标准 ★
      原来缺文件时 return True（"不误杀"）—— 那会导致范围失控，
      正是这次 42 个标准混入的隐患。宁可少提醒，不可误报。
    """
    scope = _refscope()
    if not scope:
        return False
    return _refkey(no) in scope


# ============================================================
# ★ 标准修改单 —— 勘误的兄弟类，同样"按标准号监控发现不了" ★
# ============================================================
# 2026-10-03 实测：CFSA 的 num_tn=4「标准勘误」库（176 条，最新 2025-09-15）
# **完全不收录修改单**。修改单是全库检索（num_tn=99）里的独立文档。
# 实例：GB 5413.30-2016《乳和乳制品杂质度的测定》第1号修改单（2026-08-18 发布，
#       自批准之日起实施）—— 只查勘误库永远看不到它。
#
# 业务上必须分开提醒：
#   勘误    更正笔误/表述错误，改动零散
#   修改单  实质性技术修订，整章重写，自批准之日起实施（没有过渡期）
_MOD_KEY_RE = re.compile(r"第\s*(\d+)\s*号修改单")


def grade_mod(item: dict) -> tuple[str, str]:
    """给修改单定级。修改单一律 high —— 它是自批准之日起实施的实质修订。"""
    n = item.get("mod_no")
    if n and int(n) >= 2:
        return "high", f"第{n}号修改单，是在第1号基础上再次修订，作业文件很可能两轮都没跟上"
    return "high", "修改单自批准之日起正式实施，无过渡期，旧作业文件即刻失效"


def build_mod_alerts(mods: list[dict]) -> list[dict]:
    """把修改单转成提醒。变更要点取自官方解读材料（PDF 字体无 ToUnicode 提不出）。"""
    out = []
    for m in mods:
        if not in_ref_scope(m.get("std_no", "")):
            continue
        no = m.get("std_no", "")
        name = m.get("std_name") or "（标准名待补）"
        n = m.get("mod_no") or 1
        lvl, why = grade_mod(m)
        summary = _clean_summary(m.get("summary") or "")
        pub = m.get("erata_date") or "—"
        # 修改单「自批准之日起正式实施」——没有过渡期，所以实施日期=发布日期
        imp = m.get("implement_date") or pub

        title = f"修改单：{no} 第{n}号修改单已实施"
        body = (f"《{name}》发布第{n}号修改单。\n"
                f"发布日期：{pub}\n"
                f"实施日期：{imp}（自批准之日起正式实施）\n"
                f"官方变更说明：{summary or '详见官方解读材料'}")

        out.append({
            "std_no": no, "level": lvl, "title": title,
            "what_changed": body, "why_matters": why,
            "actions": [
                "下载官方修改单，逐条比对作业文件的对应章节",
                "检查近期该项目的检测数据是否受本次修订影响",
                "更新作业指导书版本号，并在记录里注明依据第N号修改单",
            ],
            "event_type": "MOD",
            "dedup_key": f"{no}|MOD|{n}",
            "official_url": m.get("detail_url") or m.get("official_url", ""),
            "source_code": m.get("source_code", "SRC-05"),
            "relevance": "core",
            "erata": {
                "section": f"第{n}号修改单",
                "before": "", "after": summary,
                "reason": "标准修改单（实质性技术修订）",
                "date": pub, "implement_date": imp,
                "kind": "MOD", "modNo": n,
            },
        })
    return out


_SECTION_SPLIT = re.compile(r"（[一二三四五六七八九十]）")


def _clean_summary(text: str) -> str:
    """从解读材料正文里挑出"主要修订内容 / 主要技术内容"两段。

    解读材料有两种体例（实测）：
      长文（GB 5413.30 修改单）：（一）修订目的 （二）适用范围
          （三）主要修订内容 （四）主要技术内容 —— 分段规整，取（三）（四）
      短问答（GB 19301 第2号修改单）：一整段说明，没有分段标记
          → 分段抽不到就回退到正文本身（去掉页脚）
    全都拿不到返回空，页面显示"详见官方解读材料"——**不编造**。
    """
    if not text:
        return ""
    t = text.strip()
    # 先切掉页脚（"相关文本 / 标准文本 / 发布日期"之后没有信息量）
    for cut in ("相关文本", "标准文本", "浏览次数", "Copyright"):
        j = t.find(cut)
        if j > 0:
            t = t[:j]
    t = t.strip()
    if not t:
        return ""

    # 官方解读材料是 HTML 转出来的文本，残留 &nbsp; / &#xxx; 实体
    # 直接显示会让 "mg/8&nbsp;L" 这种单位看起来像乱码。
    t = (t.replace("&nbsp;", " ").replace("&amp;", "&")
          .replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"'))
    t = re.sub(r"&#\d+;", "", t)

    parts = _SECTION_SPLIT.split(t)
    want = []
    for i, p in enumerate(parts):
        head = p[:12]
        if "主要修订内容" in head or "主要技术内容" in head:
            body = parts[i + 1] if i + 1 < len(parts) else ""
            body = re.sub(r"（[一二三四五六七八九十]）.*$", "", body).strip()
            if body:
                want.append(body)
    s = " ".join(want) if want else t
    s = re.sub(r"\s+", " ", s).strip()
    if len(s) > 700:
        s = s[:700] + "…"
    return s


def is_relevant_mod(item: dict) -> bool:
    """修改单是否属于婴配实验室要跟的范围。

    与勘误用同一套范围口径：**必须在通则引用清单内**。
    """
    return in_ref_scope(item.get("std_no", ""))



# 明确不属于婴配实验室检测范围的品类
_EXCLUDE_RE = re.compile(
    r"食品添加剂|营养强化剂|食品用香精|食品工业用加工助剂|"
    r"茶叶|酒类|烟草|饲料|宠物食品|水产|可可|巧克力|饼干|糖果|"
    # ★ 饮用水 / 矿泉水 ★
    #   踩过：GB 8538-2022「**饮用天然矿泉水**检验方法」的勘误
    #   混进婴配实验室的勘误列表。它有"铅""镉"字样所以命中了相关词，
    #   但矿泉水跟婴配检测毫无关系。范围外的品类一律排除。
    r"饮用天然矿泉水|矿泉水|饮用水|包装饮用水|净水器|"
    r"食品生产通用卫生规范|良好生产规范")


_RELEVANT_RE = re.compile(
    r"蛋白|脂肪|水分|灰分|总氮|总糖|还原糖|乳糖|能量|膳食纤维|"
    r"维生素|矿物质|烟酸|叶酸|胆碱|牛磺酸|左旋肉碱|肌醇|"
    r"钙|铁|锌|钠|钾|氯|镁|铜|锰|碘|硒|磷|"
    r"铅|砷|汞|镉|铬|镍|锡|氰化物|亚硝酸盐|二氧化硫|"
    r"菌落总数|大肠菌群|沙门氏菌|金黄色葡萄球菌|阪崎肠杆菌|单增李斯特|霉菌|酵母|"
    r"毒素|抗生素|兽药|农药残留|三聚氰胺|苏丹红|甲醛|双酚|壬基酚|邻苯|增塑剂|"
    r"过敏原|乳球蛋白|酪蛋白|"
    r"婴幼儿|婴儿配方|较大婴儿|幼儿配方|特殊医学用途|婴配|乳粉|母乳|"
    r"食品生产通用卫生规范|良好生产规范|取样|留样")


def build_erata_alerts(erata_items: list[dict], include_low: bool = False) -> list[dict]:
    """把勘误转成结构化条目。文案格式固定，说人话。

    ★ 范围限定（用户要求 2026-10-03）★
    只保留通则引用标准里的勘误。产品标准（GB 10765/10766/10767 等）
    的「规范性引用文件」一章列出的那 60 来个标准才是实验室真正要执行的，
    其余标准的勘误与婴配检测无关，进提醒队列只会稀释重点。

    ★ include_low 的用途区分（2026-11-05 加）★
    这个函数原先同时干两件事，导致「页面勘误列表只有 15 条」：
      · 推提醒（crawler.py）→ low 级该丢（文字性修正不必打扰人）
      · 填页面数据（build_erata_js.py）→ **low 级也该收**
    用户原话：「特别是通则引用标准里的更新、勘误修改每天一定要抓取」
    —— 页面要能查全，查不到就等于没抓。
    实测：官方范围内 53 条勘误，原先只进页面 15 条（丢 44 条）。
    现在：推提醒仍只推 mid/high，页面数据全收（low 标出来即可）。
    """
    out = []
    for it in erata_items:
        if not in_ref_scope(it.get("std_no", "")):
            continue
        if not is_relevant_erata(it):
            continue
        lvl, why = grade_erata(it)
        if lvl == "low" and not include_low:
            continue      # 文字性修正不进提醒队列
        # ★ 标准号格式统一（2026-11-05）★
        #   官方勘误记录里同一个标准有三种写法：
        #     "GB 5009.235-2016" / "GB 5009.235" / "GB 5009.296 -2023"
        #   页面上混着显示很难看，而且同标准的条目看起来像两个标准。
        #   统一成「GB 5009.235-2016」这种带年份的标准写法。
        no = _fmt_std_no(it.get("std_no", ""))
        name = it.get("std_name", "")
        sec = it.get("section") or "全文"
        # ★ before/after 要剥掉 HTML 标签（2026-11-05）★
        #   官方勘误原文里夹着编辑器富文本标签，实测见过
        #   "<p style=\"text-align: center;\">同时取80 mL水</p>"、
        #   "<p>显色剂：15mL37%甲醇…</p>"
        #   → 直接显示在页面上就是一屏标签乱码。
        #   _plain() 只做剥标签，不压空白；再压一次空白更好看。
        before = _formula_text(it.get("before") or "")
        after = _formula_text(it.get("after") or "")

        title = f"勘误：{no} {sec} 章节内容已更正"
        body = (f"《{name}》的 {sec} 章节有勘误。\n"
                f"原因：{it.get('reason') or '官方未标注'}\n"
                f"勘误时间：{it.get('erata_date') or '—'}\n"
                f"改前：{_trunc(before)}\n"
                f"改后：{_trunc(after)}")

        if lvl == "high":
            why_matters = ("勘误内容会直接影响检测结果或判定结论。"
                           "如果你的作业文件照的是改前原文，做出来的数据可能是错的。")
            acts = [
                f"立即核对作业指导书 {sec} 章节是否与勘误后一致",
                "检查近期检测数据是否受此勘误影响，必要时重新检测",
                "检查已出具报告，涉及的批次需评估是否要补充说明",
            ]
        elif lvl == "mid":
            why_matters = "勘误内容属需要留意但通常不改变检测结果的修改。"
            acts = [
                f"核对作业指导书 {sec} 章节",
                "留意即可，一般不需重新检测",
            ]
        else:
            # low：文字性修正（编号/页码/错别字），页面留档用
            why_matters = "文字性修正（编号、页码、错别字一类），不影响检测结果与判定。"
            acts = ["留档即可，作业文件无需改"]

        out.append({
            "std_no": no, "level": lvl, "title": title,
            "what_changed": body, "why_matters": why_matters, "actions": acts,
            "event_type": "ERATA",
            "dedup_key": f"{no}|ERATA|{it.get('guid') or it.get('erata_date')}",
            "official_url": it.get("official_url", ""),
            "source_code": it.get("source_code", "SRC-05"),
            "relevance": "core",
            "erata": {"section": sec, "before": before, "after": after,
                      "reason": it.get("reason", ""),
                      # ★ 标准名必须带上（2026-11-05）★
                      #   官方勘误记录里 STANDARD_NAME 字段 187 条全都有值，
                      #   但这里原来没往 erata 字典里放 → build_erata_js 取不到，
                      #   页面显示「（标准名待补）」。
                      #   （先用 STD 库兜底，再用这个原始字段 —— 顺序反了也没事，
                      #     build_erata_js 里优先用 erata 里的 std_name。）
                      "std_name": it.get("std_name", ""),
                      "date": it.get("erata_date", "")},
        })
    return out


def _trunc(s: str, n: int = 120) -> str:
    s = " ".join((s or "").split())
    return s if len(s) <= n else s[:n] + "…"


def diff_erata(old: list[dict], new: list[dict]) -> list[dict]:
    """勘误快照 diff：只报新增的勘误条目。

    勘误一旦发布基本不再改（实测 176 条里 KWSJ 跨度 7 年），所以按 GUID 去重即可。
    """
    seen = {x.get("guid") or x.get("log_date", "") + (x.get("std_no", "")) for x in old}
    out = []
    for it in new:
        key = it.get("guid") or (it.get("log_date", "") + it.get("std_no", ""))
        if key not in seen:
            out.append(it)
    return out
