#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从「检测方法原理」docx 套件抽取结构化数据 → data/_methodjs.txt。

================================================================
数据来源与合规边界（重要，改代码前先看这段）
================================================================
用户 2026-10-10 提供 `D:/食品标准/检测方法原理.zip`，内含 18 份docx，
是他自己整理的**方法原理笔记**（不是标准原文）。
这份内容不进STD/REFGROUPS，也不当检测依据 ——
它是「这方法为什么这么做」的**教学补充**，性质与检验方法卡片一致。

★ 与「标准全文」的红线 ★
  本项目一贯不存标准正文（见 general_refs.py 的合规说明）。
  这里存的是**用户自己写的原理摘要**，不含标准正文的条文、章节、
  试验条件表 —— 但仍然要写清来源与免责，不能让检测员误以为
  读了这一页就不用翻标准原文。

================================================================
docx 解析（实测结构，2026-10-10）
================================================================
每份文档的段落序列大致是：
    [0] 标准号 + 标准名GB5009.5-2025 食品中蛋白质的测定
    [1] 第N法 + 方法名（**可能缺失**，如 GB5413.36/GB5413.40 直接从原理开始）
    [2] 检测方法原理：……
    [3] 试剂名称            ← 表头
    [4] 在方法中的主要作用   ← 表头
    [5] 试剂名（短，无冒号）
    [6] 作用说明（长，含「：」）
    ...
    [k] 一个章节标题（如「工作流程简述」「核心要点与操作提示」「安全防护：…」）
    [k+] 该章节的正文/ 编号步骤（1、2、3…）

★ 关键启发式 ★
  试剂名与作用是**成对**的，靠「冒号」区分：
    - 含「：」且冒号前较短→ 视为某试剂的「作用」
    - 不含「：」且较短 → 视为「试剂名」
  但有几份文档里**一条试剂的作用被拆成多段**（如 GB5413.36 的氨水
  占 3 段、GB5413.20 的前处理说明占 15 段），
  所以要靠「下一个试剂名 / 章节标题」来判定配对结束。

★ 踩过的坑 ★
  - `re.findall(r'<w:p[ >].*?</w:p>')` 在`<w:p/>` 自闭合标签上匹配不到
    → 先把 `<w:p/>` 替换成 `<w:p></w:p>`。
  - 一段文本会被拆成多个 `<w:r><w:t>` 片段（Word 里逐字run），
    必须把段内所有 `<w:t>` **先拼起来**再判词，不能逐 run 提取。
"""
from __future__ import annotations

import io
import json
import os
import re
import sys
import zipfile

sys.stdout.reconfigure(encoding="utf-8")

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "..", "data")

SRC_ZIP = os.environ.get("METHOD_ZIP", r"D:\食品标准\检测方法原理.zip")

# 章节标题识别：这些段落是「小标题」，其后的段落归到该章节
SECTION_RE = re.compile(
    r"^(?:[一二三四五六七八九十]+、|"
    r".{0,12}?(?:工作流程|协同工作|核心要点|操作提示|安全防护|注意事项|"
    r"方法原理与试剂|试剂的协同|干扰|说明)$)")
# 「N、xxx」编号步骤
STEP_RE = re.compile(r"^\d+\s*[、.]")
# 明确的表头行，遇到就跳过
HEADERS = ("试剂名称", "在方法中的主要作用", "主要作用")

STD_NO_RE = re.compile(r"^\s*((?:GB|GB/T|JJ)\s*[\d.]+-\d{4})\s*(.*)$")

# 方法名：带「第N法」前缀的，或纯仪器方法名（GB5009.299 那种）
METHOD_NAME_RE = re.compile(
    r"^第[一二三四五六七八九十]+法"
    r"|^高效液相色谱法|^气相色谱法|^液相色谱|^高效液相色谱|^分光光度法"
    r"|^原子吸收|^ICP|^离子色谱|^酶比色|^气相色谱-")


# ---------------------------------------------------------------- docx 解析
def docx_paragraphs(raw: bytes) -> list[str]:
    """docx 字节 → 段落纯文本列表。"""
    z = zipfile.ZipFile(io.BytesIO(raw))
    xml = z.read("word/document.xml").decode("utf-8", "replace")
    # ★ 自闭合的 <w:p/> 必须补成成对标签，否则正则匹配不到 ★
    xml = xml.replace("<w:p/>", "<w:p></w:p>")
    out: list[str] = []
    for p in re.findall(r"<w:p[ >].*?</w:p>", xml, re.S):
        # ★ 段内多个 run 要先拼接再判词 ★（Word 逐字 run 很常见）
        ts = re.findall(r"<w:t(?:\s[^>]*)?>(.*?)</w:t>", p, re.S)
        s = "".join(ts)
        s = (s.replace("&amp;", "&").replace("&lt;", "<")
              .replace("&gt;", ">").replace("&quot;", '"')
              .replace("&apos;", "'"))
        s = re.sub(r"[\u0000-\u0008\u000b\u000c\u000e-\u001f]", "", s)
        s = " ".join(s.split())
        if s:
            out.append(s)
    return out


def esc(s) -> str:
    return (str(s or "").replace("\\", "\\\\").replace('"', '\\"')
            .replace("\n", " ").replace("\r", " "))


# ---------------------------------------------------------------- 语义切分
def parse_doc(name: str, paras: list[str]) -> dict:
    """把段落序列切成 {stdNo, title, method, principle, reagents, sections}。"""
    d = {
        "stdNo": "", "title": "", "method": "", "principle": "",
        "reagents": [],       # [{name, role}]
        "sections": [],       # [{h, items:[...]}]
    }
    if not paras:
        return d

    i = 0
    # ---- 标题行 ----
    m = STD_NO_RE.match(paras[0])
    if m:
        d["stdNo"] = m.group(1).replace(" ", "")
        d["title"] = m.group(2).strip()
        i = 1
    else:
        d["title"] = paras[0]
        i = 1

    # ---- 方法名 ----
    #   绝大多数是「第N法 xxx」，但 GB5009.299-2024 只写了
    #   「高效液相色谱法」—— 没有「第N法」前缀。
    #   ★ 不加这条判定，它会被当成「试剂名」★
    #   → 试剂表里凭空多出一条叫「高效液相色谱法」的试剂，
    #     同时真正的检测方法原理被当成它的「作用」吞掉。
    if i < len(paras) and METHOD_NAME_RE.match(paras[i]):
        d["method"] = paras[i].strip()
        i += 1

    # ---- 检测方法原理 ----
    if i < len(paras) and paras[i].startswith("检测方法原理"):
        d["principle"] = paras[i].split("：", 1)[-1].strip()
        i += 1

    # ---- 跳到试剂表头 ----
    #  ★ 必须「往后找」表头，不能只看当前位置 ★
    #    GB5413.20（胆碱）的顺序是：
    #      [2] 检测方法原理：…
    #      [3..16] 一张**流程图表格**（酸水解/ 酶促反应 / 显色反应…）
    #      [17..22] 「1、」「2、」「3、」分步说明
    #      [23] 试剂名称     ← 真正的试剂表在这里才开始
    #    原来只 `while paras[i] in HEADERS` 跳过当前位置，
    #    于是流程图那些短行被当成试剂名（页面显示「试剂：酸水解」「试剂：样品前处理」）。
    i = _find_reagent_header(paras, i)
    if i is None:
        i = len(paras)

    # ---- 试剂名 / 作用 成对扫描 ----
    # 判定「试剂名」：不含「：」且长度 <= 24
    # 判定「作用」：含「：」或明显是说明性长句
    cur_name = None
    cur_parts: list[str] = []

    def flush():
        nonlocal cur_name, cur_parts
        if cur_name and cur_parts:
            d["reagents"].append({
                "name": cur_name,
                "role": " ".join(cur_parts).strip(),
            })
        cur_name, cur_parts = None, []

    while i < len(paras):
        p = paras[i]

        # 章节标题 → 收尾试剂，后面进入章节模式
        if is_section_head(p):
            break

        if p in HEADERS:
            i += 1
            continue

        # ★ 编号步骤不是试剂名 ★
        #   GB5009.5（凯氏定氮法）的试剂表前面是一张**流程图表格**，
        #   单元格文本形如「1、消化处理」「2、碱化蒸馏」，
        #   不拦掉会变成「试剂：1、消化处理」。
        #
        #   ★ 但不能无条件 skip ★
        #   GB5413.36 的「氨水」有 3 段作用，第 2、3 段以「2、」「3、」开头。
        #   在这里一律 skip → 氨水只剩第 1 段，甚至整条消失。
        #   真正的判据在下面 is_name 分支里：**有cur_name 就当成它的作用续写**，
        #   没有才跳过。这个顺序不能颠倒 —— 实测两种写法的差别就是氨水在不在。

        is_role = ("：" in p) or (len(p) >= 30)
        is_name = ("：" not in p) and len(p) <= 24

        if is_role:
            if cur_name is None:
                # 没有配对的试剂名 —— 当成散段，跳过
                i += 1
                continue
            cur_parts.append(p)
        elif is_name:
            # ★ 编号步骤不能当试剂名，但**它可能是上一条试剂作用的续写** ★
            #   GB5413.36 的「氨水」有 3 段作用，第 2、3 段以「2、」「3、」开头。
            #   原来一律 skip → 氨水只有第 1 段作用，且被判成「流程图残留」清掉，
            #   实测该标准从 6 条掉到 5 条，氨水整条丢失。
            #   正确做法：有 cur_name 就当成它的作用续写。
            if STEP_RE.match(p):
                if cur_name:
                    cur_parts.append(p)
                i += 1
                continue
            flush()
            cur_name = p
        else:
            # 又长又没冒号：接在当前作用后面
            if cur_name:
                cur_parts.append(p)
        i += 1
    flush()

    # ---- 剩余段落 → 章节 ----
    cur_h = "要点"
    cur_items: list[str] = []
    while i < len(paras):
        p = paras[i]
        if p in HEADERS:
            i += 1
            continue
        if is_section_head(p):
            # ★ 章节内部若还有一张试剂表，就地收进 reagents ★
            #   GB5009.5（凯氏定氮法）就是这样：正文先来一张流程图表格，
            #   紧接着「试剂作用效应分析」章节里才是真正的试剂表。
            #   不在这里补收，页面上的试剂表会是空的（实测只剩 3 条流程图文字）。
            if d["reagents"] and _looks_like_reagent_table(paras, i):
                j = _collect_reagents(d, paras, i + 1)
                if j > i + 1:
                    i = j
                    continue
            if cur_items:
                d["sections"].append({"h": cur_h, "items": cur_items})
            cur_h = section_title(p)
            cur_items = []
        else:
            cur_items.append(p)
        i += 1
    if cur_items:
        d["sections"].append({"h": cur_h, "items": cur_items})
    d["reagents"] = _clean_reagents(d["reagents"])
    return d


def _looks_like_reagent_table(paras: list[str], i: int) -> bool:
    """从 i 往后看几行，是不是「试剂名 / 作用」成对的表格。"""
    seen = 0
    j = i + 1
    while j < len(paras) and seen < 4:
        p = paras[j]
        if p in HEADERS:
            j += 1
            continue
        if is_section_head(p):
            return False
        if ":" not in p and "：" not in p and len(p) <= 24:
            seen += 1                      # 疑似试剂名
        j += 1
        if j - i > 10:
            break
    return seen >= 2


def _collect_reagents(d: dict, paras: list[str], j: int) -> int:
    """从 j 开始收「试剂名 / 作用」对，写进 d["reagents"]，返回结束下标。"""
    start_n = len(d["reagents"])
    cur_name = None
    cur_parts: list[str] = []

    def flush():
        nonlocal cur_name, cur_parts
        if cur_name and cur_parts:
            d["reagents"].append({"name": cur_name,
                                  "role": " ".join(cur_parts).strip()})
        cur_name, cur_parts = None, []

    while j < len(paras):
        p = paras[j]
        if is_section_head(p):
            break
        if p in HEADERS or STEP_RE.match(p):
            j += 1
            continue
        if "：" in p or len(p) >= 30:
            if cur_name:
                cur_parts.append(p)
        elif len(p) <= 24:
            flush()
            cur_name = p
        elif cur_name:
            cur_parts.append(p)
        j += 1
    flush()
    return j if len(d["reagents"]) > start_n else j


def _clean_reagents(items: list[dict]) -> list[dict]:
    """剔除被误当成试剂名的流程图文字。

    ★ 为什么需要这一步 ★
      GB5009.5（凯氏定氮法）正文先来一张**流程图表格**，
      单元格文本形如「分步原理详解」「H₃BO₃ + NH₃ → NH₄H₂BO₃」
      「c 是盐酸标准溶液的准确浓度（mol/L）。」——
      它们和试剂名一样「短、且不含冒号」，光看形态分不出来。
      真正的试剂表在后面的「试剂作用效应分析」章节里。

      判据：真正的试剂名几乎都带**化学式/浓度/英文缩写**，
      且不含「→」「是」「详解」这类叙述词。
      混在一起的话页面会显示「试剂：分步原理详解」，很荒唐。
    """
    out = []
    for r in items:
        n = r["name"]
        core = n.rstrip("。．.；;，,")
        # ★ 判定「这是叙述句而不是试剂名」★
        #   判据是**句子形态**（含主谓宾），不是「有没有『是』字」——
        #   踩过：原来写 `是[^，。]{0,14}$`，结果把试剂「氨水」误删，
        #   因为它的作用正文是「1、提供碱性环境…」。
        #   真正的叙述句长这样：「c 是盐酸标准溶液的准确浓度（mol/L）」
        #   —— 判据：含中文动词「是」且后面跟着 >=4 字的内容。
        if re.search(r"(是.{4,}|[a-zA-Z一-鿿]{1,3}是[一-鿿]{4,})$", core):
            continue
        if "→" in n or "←" in n:
            continue
        if re.search(r"(详解|步骤|计算|公式|说明|如下)$", core):
            continue
        if not re.search(r"[A-Za-z一-鿿]", n):
            continue
        out.append(r)
    return out


def _find_reagent_header(paras: list[str], start: int):
    """在 start 之后找下一个「试剂名称」表头，返回其后的第一个下标；找不到返回 None。

    GB5009.5 这类文档：正文先来一张流程图表格，
    真正的试剂表在后面的「试剂作用效应分析」标题下。
    """
    j = start
    while j < len(paras):
        if paras[j] == "试剂名称":
            k = j + 1
            while k < len(paras) and paras[k] in HEADERS:
                k += 1
            return k
        j += 1
    return None


# ==============================================================
# 按「检测项目」归类（2026-10-10 用户要求：把排序归类排）
# ==============================================================
# ★ 为什么按检测项目分，而不是按标准号排★
#   按标准号字符串排序会得到荒谬的顺序：
#     GB5009.154 → GB5009.158 → GB5009.168 → … → GB5009.44 → GB5009.5
#   —— "44" 排在 "5" 前面（同长度才比大小，位数不同就按字典序），
#   GB 5413 整段又甩到所有 GB 5009 后面。检测员是按「我要测什么」找方法的，
#   不是按标准号找 —— 所以归类口径必须和「通则引用标准」一致。
#
#   类别与顺序沿用 build_refgroups.py 的 GROUPS：
#     蛋白质与基础成分 → 脂肪酸与反式脂肪酸 → 矿物质 → 维生素 → 婴配特殊成分
#   这样两个页面能对得上：通则引用里看到「维生素」组，点进原理页也是维生素。
#
#   ★ 归类依据是标准**名称里的检测对象** ★
#     不靠猜、不靠标准号段 —— GB 5009 是「食品中××的测定」的合集，
#     号段完全无法区分项目（5009.5 蛋白质 / 5009.89 烟酸 / 5009.267 碘）。
# ★ 类别顺序 = 匹配优先级，**不能随便排** ★
#   踩过：原来「蛋白质与基础成分」排第一，它含「脂肪酸」这个词，
#   于是 GB5009.168《食品中脂肪酸的测定》被判成「蛋白质与基础成分」。
#   归类要按**最具体的对象**优先，所以范围窄的类别在前：
#     反式脂肪酸（窄） → 脂肪酸（窄） → 维生素/矿物质/婴配（各自成词，不会互相命中）
#     → 蛋白质、脂肪（最宽，最后兜底）
#   「其它」永远排最后。
CATEGORY = [
    ("脂肪酸与反式脂肪酸", ["反式脂肪酸"]),
    ("脂肪酸与反式脂肪酸", ["脂肪酸"]),
    ("矿物质", ["碘", "磷", "氯化物"]),
    ("维生素", ["维生素B1", "维生素B2", "维生素B6", "维生素K1", "烟酸", "烟酰胺"]),
    ("婴配特殊成分", ["牛磺酸", "肌醇", "乳铁蛋白", "左旋肉碱", "胆碱", "核苷酸"]),
    ("蛋白质与基础成分", ["蛋白质", "脂肪"]),
]

# 展示用的分组顺序（去重后）——比匹配顺序更符合阅读习惯
DISPLAY_ORDER = ["蛋白质与基础成分", "脂肪酸与反式脂肪酸", "矿物质",
                 "维生素", "婴配特殊成分", "其它"]


def classify(title: str) -> str:
    """按标准名里的检测对象归类；匹配不上就归「其它」。"""
    t = (title or "").replace(" ", "")
    for cat, objs in CATEGORY:
        for o in objs:
            if o in t:
                return cat
    return "其它"


def sort_key(d: dict) -> tuple:
    """先按类别顺序，再按标准号**按位数比大小**排（不是字典序）。

    ★ 必须按数值排 ★
      字典序会把 GB 5009.44 排到 GB 5009.5 前面
      （'4' < '5' 成立，但 44 和 5 根本不是同一量级的编号）。
    """
    m = re.match(r"([A-Z]+)\s*(\d+)\.(\d+)(?:-(\d+))?", d.get("stdNo", ""))
    if not m:
        return (99, 0, 0, 0)
    prefix, major, minor, year = m.groups()
    return (prefix, int(major), int(minor), int(year or 0))


def is_section_head(p: str) -> bool:
    """是不是章节小标题。

    ★ 必须拦掉带 emoji 的标题 ★
      实测「💡 实验流程与关键点」「⚠️ 安全防护」这类带符号的标题，
      一旦被当成「试剂名」，整段正文会被塞进它的 role 里 ——
      页面显示成「试剂名叫『💡 实验流程与关键点』」，非常荒谬。

    ★ 也必须拦掉方括号/圆括号括注 ★
      GB5009.5（凯氏定氮法）前面是一张**流程图表格**，单元格里的标注是
      「(含硫酸铵)」「[氮含量x折算系数]」这种括号形式。
      误判成标题 → 试剂表整段消失（实测 14 条 → 0 条）。
    """
    if p in HEADERS:
        return False
    # 括注（可能是流程图单元格标注）一律不是标题
    if re.match(r"^[(（\[【]", p) or re.search(r"[(（\[【][^)）\]】]*[)）\]】]\s*$", p):
        return False
    #★ 「工作流程简述」「核心反应原理」这类也是标题 ★
    #   它们的形态和试剂名一模一样（短、无冒号、无编号），
    #   实测 GB5413.20 的「工作流程简述」被当成试剂名收了进去。
    #   判据：含「流程/原理/简述/概述/小结」等抽象词且不带具体化学名。
    if (len(p) <= 20 and not p.endswith("。") and "：" not in p
            and re.search(r"(流程|简述|概述|小结|原理)$", p)
            and not re.search(r"[\(\)]", p)):
        return True
    # 带 emoji / 项目符号的短行 → 章节标题
    if len(p) <= 24 and re.match(r"^[^\w\sA-Za-z0-9]", p) and not p.endswith("。"):
        return True
    # 「1、xxx」「2、xxx」编号步骤属于正文，不算标题
    if STEP_RE.match(p):
        return False
    if len(p) <= 20 and not p.endswith("。") and "：" not in p:
        if re.search(
                r"(流程|要点|提示|防护|注意|协同|说明|干扰|作用|关键点|"
                r"注意事项|工作原理|效应分析|核心.+)$", p):
            return True
    return False


def section_title(p: str) -> str:
    """章节标题：去掉 emoji / 项目符号与「：」后缀。"""
    s = p.split("：", 1)[0]
    s = re.sub(r"^\d+\s*[、.]\s*", "", s)
    # 去掉行首的 emoji / 符号（💡 ⚠️ ✅ ◆ 等）
    s = re.sub(r"^[^\w\s]+\s*", "", s, flags=re.U)
    return s.strip() or "要点"


# ---------------------------------------------------------------- 主流程
def main() -> int:
    if not os.path.exists(SRC_ZIP):
        print("[x] 找不到源 zip：%s" % SRC_ZIP)
        print("    用环境变量 METHOD_ZIP 指定路径")
        return 1

    z = zipfile.ZipFile(SRC_ZIP)
    names = [n for n in z.namelist() if n.lower().endswith(".docx")]
    names.sort()
    docs: list[dict] = []

    for n in names:
        paras = docx_paragraphs(z.read(n))
        d = parse_doc(n, paras)
        d["file"] = os.path.basename(n)
        if not d["stdNo"]:
            # 兜底：从文件名抠标准号
            m = re.search(r"((?:GB|GB/T|JJ)[\d.]+-\d{4})",
                          os.path.basename(n))
            d["stdNo"] = m.group(1) if m else ""
            d["title"] = d["title"] or os.path.basename(n)
        docs.append(d)

    # ---- 归类 + 排序（类别序 → 标准号数值序）----
    cat_order = {c: i for i, c in enumerate(DISPLAY_ORDER)}
    for d in docs:
        d["category"] = classify(d["title"])
    docs.sort(key=lambda d: (cat_order.get(d["category"], 99),)
              + sort_key(d))

    # ---- 输出 JS ----
    rows = []
    for d in docs:
        reagents = ",".join(
            '{name:"%s", role:"%s"}' % (esc(r["name"]), esc(r["role"]))
            for r in d["reagents"])
        sections = ",".join(
            '{h:"%s", items:[%s]}' % (
                esc(s["h"]),
                ",".join('"%s"' % esc(t) for t in s["items"]))
            for s in d["sections"])
        rows.append(
            '  {{stdNo:"{no}", title:"{ti}", method:"{me}", cat:"{ct}", '
            'principle:"{pr}", reagents:[{rg}], sections:[{sc}]}}'.format(
                no=esc(d["stdNo"]), ti=esc(d["title"]), me=esc(d["method"]),
                ct=esc(d["category"]), pr=esc(d["principle"]),
                rg=reagents, sc=sections))

    # ★ 每行不能自带尾逗号 ★
    #   原来行尾是 `}},`，而 join 用的是 ",\n" ——
    #   结果每个元素后面出现 `}]},`，JS 里逗号后是**空元素**，
    #   18 个对象的数组变成长度 35 的**稀疏数组**（18 对象 + 17 空洞）。
    #   node 能解析、_node_check 也过，肉眼极难发现，
    #   但页面 forEach/map 拿到的长度是错的（`METHODS.length` = 35）。
    #   这个坑与 _cnasjs.txt 当初踩的「尾逗号」是同一个，只是方向相反。
    io.open(os.path.join(DATA, "_methodjs.txt"), "w",
            encoding="utf-8").write("[\n" + ",\n".join(rows) + "\n]\n")
    json.dump(docs, io.open(os.path.join(DATA, "method_principles.json"), "w",
                            encoding="utf-8"), ensure_ascii=False, indent=1)

    # ---- 报告 ----
    print("检测方法原理：%d 份" % len(docs))
    for d in docs:
        print("  %-10s %-18s %-38s 试剂 %2d · 章节 %d" % (
            d["category"], d["stdNo"], d["title"][:38],
            len(d["reagents"]), len(d["sections"])))
    no_reagent = [d["stdNo"] for d in docs if not d["reagents"]]
    if no_reagent:
        print("  ⚠ 没解析出试剂：%s" % "、".join(no_reagent))
    no_principle = [d["stdNo"] for d in docs if not d["principle"]]
    if no_principle:
        print("  ⚠ 没解析出原理：%s" % "、".join(no_principle))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())