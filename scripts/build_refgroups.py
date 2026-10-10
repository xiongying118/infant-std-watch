#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""按检测项目构建通则引用页数据。

★ 上一版的错 ★
分组表写的是"通则引用的编号"（GB5009.5、GB5413.14…），
而通则引的是**老编号**，真正该执行的新标准（GB 5009.285、GB 5009.86…）
根本不在分组表里 → 引用页少了这几条，用户要的新标准没放上去。

★ 正确做法 ★
分组表写"检测对象"，每个对象取**当前该执行的那一版**：
    对象"维生素B12" → GB 5413.14-2010（老，被替代）
                     → GB 5009.285-2022（新，★ 取这个）
    对象"维生素C"  → GB 5413.18-2010（老）
                     → GB 5009.86-2025（★ 取这个）
"""
import io
import json
import re
import os
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import verify_validity2 as V

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "..", "data")

# ★ 分组按"检测对象"，不是标准号 ★
GROUPS = [
    ("蛋白质与基础成分", ["蛋白质", "脂肪", "水分", "灰分", "脂肪酸"]),
    ("矿物质", ["钙", "铁", "锌", "硒", "碘", "镁", "锰", "铜", "钾钠", "磷", "氯化物"]),
    ("维生素", ["维生素A", "维生素D", "维生素E", "维生素B1", "维生素B2",
                "维生素B6", "维生素B12", "维生素C", "维生素K1", "维生素K2",
                "烟酸", "泛酸", "叶酸", "生物素"]),
    ("婴配特殊成分", ["牛磺酸", "肌醇", "胆碱", "左旋肉碱", "脲酶", "杂质度",
                      "乳铁蛋白", "低聚半乳糖", "低聚果糖"]),
    ("糖类", ["糖类", "还原糖"]),
    # ★ 反式脂肪酸是脂质类，不是糖类 ★
    #   踩过：把它塞进「糖类」组，被用户一眼看出来。
    #   检测对象归一化本身是对的（反式脂肪酸 ≠ 脂肪酸），错的是分组。
    ("脂肪酸与反式脂肪酸", ["脂肪酸", "反式脂肪酸"]),
    # ★ 油脂氧化指标（2026-10-07 用户点名）★
    #   酸价、过氧化值 —— 反映油脂氧化程度，即乳粉脂质新鲜度。
    #   单列一组而不是并进「脂肪酸与反式脂肪酸」：
    #   脂肪酸测的是组成（多少饱和/不饱和），酸价和过氧化值测的是
    #   **变质程度**，回答的是不同的问题，检验时也不会一起做。
    #   → GB 5009.229-2025（酸价）、GB 5009.227-2023（过氧化值）
    ("油脂氧化指标", ["酸价", "过氧化值"]),
    ("污染物检测", ["亚硝酸盐与硝酸盐", "黄曲霉毒素B族和G族", "黄曲霉毒素M族",
                    "三聚氰胺"]),
    #   ★ 阪崎肠杆菌已移出本组 ★
    #   它是克罗诺杆菌属的旧称，GB 4789.40-2024 已改名为「克罗诺杆菌检验」，
    #   同一个检测对象。留在「微生物」组里会因为 2016 版已被 2024 版替代
    #   而取不到现行版本 → 空池 → 每次构建都报"库里找不到"。
    ("微生物", ["菌落总数", "大肠菌群", "金黄色葡萄球菌", "商业无菌"]),
    ("限量与强化", ["污染物限量", "真菌毒素限量", "营养强化剂", "致病菌限量"]),
    # ==============================================================
    # 2026-10-03 用户截图点名追加的两个组
    # ==============================================================
    # ★ 污染物元素（限量标准里点名的检测方法）★
    #   GB 5009.12 铅(以Pb计)、GB 5009.16 锡(以Sn计)
    #   截图来自污染物限量的检测方法列。GB 2762-2025 的「污染物限量」表
    #   里铅、锡都是必检项，实验室天天在用。
    #   注意 GB 5009.16 的官方名是「食品中锡的测定」，截图写的"锡(以Sn计)"
    #   是限量表里的表述 —— 归一后是同一个检测对象。
    ("污染物元素检测", ["铅", "锡"]),
    # ★ 致病菌限量（微生物限量的仲裁方法）★
    #   截图给的 6 条：GB 4789.40 克罗诺杆菌、GB 4789.10 金黄色葡萄球菌、
    #   GB 4789.4 沙门氏菌、GB 4789.2 菌落总数、GB 4789.14 蜡样芽胞杆菌、
    #   GB 4789.3 大肠菌群。
    #   其中 4789.2 / 4789.3 / 4789.10 已在「微生物」组里
    #   （下面的 DETECT_MAP 会自动跳过已存在的，不重复放）。
    #   克罗诺杆菌、蜡样芽胞杆菌、沙门氏菌是限量标准 GB 29921 指定的
    #   **仲裁方法**，婴配成品检验会用到。
    #   ★ 阪崎肠杆菌不在这里单列 ★
    #   它是克罗诺杆菌属的旧称，GB 4789.40-2024 已改名为「克罗诺杆菌检验」，
    #   两者是同一个检测对象。拆成两项会让"阪崎肠杆菌"取不到现行版本
    #   （2016 版已被 2024 版替代）→ 空池。已归并到"克罗诺杆菌"。
    ("致病菌限量检测", ["克罗诺杆菌", "蜡样芽胞杆菌", "沙门氏菌"]),
    # ==============================================================
    # 计量与包装（2026-10-03 用户截图点名 JJF 1070）
    # ==============================================================
    #   JJF 1070《定量包装商品净含量计量检验规则》—— 婴配罐装样品报净含量时，
    #   抽样数、单件负偏差允许值、评定规则都按它。它是**国家计量技术规范**
    #   （JJF），不是 GB 标准，标准委检索库不收录，由 fetch_metro.py 补录。
    #   通则（GB 10765 等）本身不引用 JJF —— 归到这里是因为它是
    #   **实验室出具净含量数据时的执行依据**，性质与"实验室用得上的方法"一致。
    #
    #   同一对象下有多个现行版本（通用 2023 + 肥皂/小麦粉/大米三个子规范），
    #   取条规则会挑实施日期最新的那个 —— 子规范不该上位，
    #   所以在 SCOPE_LIMIT 之外再加一条：带产品名的子规范排除出上位候选。
("计量与包装", ["净含量"]),
    # ★ CNAS 已从通则引用里移出（2026-10-07 用户第二次要求）★
    #   原来放在这儿是错的。通则引用页的定位是
    #   「**从产品标准正文里读出来的**规范性引用文件」——
    #   每一条都要能追到某本产品通则的引用列表。
    #   CNAS 文件不在任何产品标准正文里，它是**独立的实验室认可规范**，
    #   放在这一页等于谎称「通则引用了它」。检测员会误以为
    #   CNAS-CL01 是我要执行的方法标准，其实它是评审时对
    #   实验室**整体能力**的要求，不针对某一个检测项目。
    #   → 改为独立数据键 CNASDOCS + 左侧导航单独一组（见文件末尾）。
]


# ==============================================================
# CNAS 认可规范：独立产物，不混进通则引用
# ==============================================================
# ★ 用户 2026-10-07 明确要求：「CNAS不要放在通则里，
#   放在左边单独一组（新建），放在法规与体系下」★
#
#   CNAS 与其它标准是两个维度：
#     · 通则引用 / 标准清单 = 测什么、怎么测（技术方法）
#     · 法规与体系 / CNAS   = 谁来测、凭什么出报告（资质与体系）
#   混在一起，检测员分不清「CNAS-CL01 是不是我该执行的方法标准」。
#
#   产物单独写 data/_cnasjs.txt → data.js 的 CNASDOCS 键，
#   页面左侧导航「认可规范」单独一页渲染，位置在「法规与体系」下面。
#
#   为什么仍放在这个脚本里：它和通则引用共用同一份 SRC-11 快照与
#   同一套「哪些文件跟食品实验室有关」的筛选口径
#   （CNAS_KEEP / CNAS_DROP），拆到另一个脚本就要复制一遍正则，
#   两处口径迟早会漂。产物分开、代码同源，是这里想要的取舍。

# 筛选口径：不能把 98 条全放进来 —— 里面有医学实验室、纺织、玩具、汽车、
# 建材、医疗器械等领域的应用说明，与食品检测无关，混进来等于把有用的埋掉。
#
# ★ 口径改成**前缀分层 + 关键词双筛**，不用「关键词命中就留」★
#   第一版只用关键词（化学|微生物|不确定度|检测和校准实验室…），
#   结果 CNAS-CL01-A012/A013/A014（卫生/动物/植物检疫）、
#   CNAS-GL007（电器领域不确定度）、CNAS-TRL-007（建设领域计量溯源）
#   全被「检测和校准实验室」「不确定度」这几个**通用词**捞进来了 ——
#   通用词命中 ≠ 相关，这些文件食品实验室一条都用不到。
CNAS_KEEP = re.compile(
    r"实验室认可规则|检测和校准实验室|化学|微生物|食品|不确定度"
    r"|能力范围表述|实验室认可指南|公正性和保密|认可标识|申诉")
# 明确剔除：与食品实验室无关的专业领域 / 机构类别
CNAS_DROP = re.compile(
    r"医学实验室|法医|司法鉴定|纺织|玩具|汽车|摩托车|通信|电磁兼容"
    r"|金属材料|电气|电器|无损检测|医疗器械|建材|建设|石油石化|电煤|机动车"
    r"|家具|人造板|基因扩增|生物样本库|实验动物|标准物质|能源之星"
    r"|蓝牙|反兴奋剂|计量科学研究院|木竹|轻纺|输变电|环境检测"
    # ★ 检疫类（卫生/动物/植物）也算无关：那是国境口岸检验，不是产品检测
    r"|检疫|科研实验室|能力验证提供者")
# ★「认可规则」类要用否定式排除，不能写「认可规则$」★
#   CNAS-RL01《实验室认可规则》是实验室最基础的一份文件，必须留着；
#   但同前缀下还有 RL07 标准物质生产者、RL08 实验动物、RL09 科研实验室、
#   RL10 生物样本库 —— 这些是别的机构类别的规则，与食品实验室无关。
#   所以只排除**已列举的**几类，而不是排除所有「…认可规则」。

# CNAS 文件类别 → 页面分组（对应独立页里的子标签）
CNAS_KIND = [
    ("CL", "认可准则", "实验室该达到什么能力（17025 的中文实施 + 各领域应用说明）"),
    ("RL", "认可规则", "评审流程、能力验证、收费等规则性文件"),
    ("R", "通用规则", "标识使用、公正性与保密、申诉投诉"),
    ("GL", "认可指南", "不确定度评定、能力验证统计等操作指南"),
    ("EL", "认可说明", "受理要求与能力范围表述（申请认可时能力表怎么写）"),
    ("TRL", "技术报告", "专题技术报告与实例"),
]


def cnas_kind_of(no: str) -> tuple[str, str]:
    """CNAS 编号 → (分组 key, 分组名)。

    ★ 用最长前缀匹配 ★
      直接取 `CNAS-([A-Z]+)` 会把 CNAS-CL01-G001 归成 CL（对），
      但 CNAS-TRL-002 归成 TRL（也对）—— 真正会错的是
      「CL 与 RL 前缀互相包含」这类情形，故按 CNAS_KIND 声明顺序
      逐个精确比对，不用字符类。
    """
    m = re.match(r"CNAS-([A-Z]+)", no or "")
    pfx = m.group(1) if m else ""
    for k, name, _ in CNAS_KIND:
        if pfx == k:
            return k, name
    return pfx, pfx


def _rank_cnas(no: str) -> tuple:
    """排序：准则 → 规则 → 指南/说明 → 报告，同类按编号升序。"""
    m = re.match(r"CNAS-([A-Z]+)", no or "")
    pfx = m.group(1) if m else ""
    order = {k: i for i, (k, _, _) in enumerate(CNAS_KIND)}
    return (order.get(pfx, 99), no)


def build_cnas_items() -> list[dict]:
    """从 SRC-11 快照构造 CNAS 认可规范条目。返回 [] 表示无快照。"""
    snap = os.path.join(DATA, "snapshots", "SRC-11_latest.json")
    if not os.path.exists(snap):
        return []
    raw = json.load(io.open(snap, encoding="utf-8"))
    items = []
    for _, v in raw.items():
        no = (v.get("std_no") or "").strip()
        title = (v.get("title") or "").strip()
        if not no or not title:
            continue
        if CNAS_DROP.search(title):
            continue
        if not CNAS_KEEP.search(title):
            continue
        k, kname = cnas_kind_of(no)
        items.append({
            "no": no,
            "title": title,
            "kind": k,
            "kindName": kname,
            # CNAS 官网列表只给发布日期，没有「实施日期」字段 ——
            # 如实存发布日期，不编造实施日期。
            "pub": (v.get("publish_date") or "").strip(),
            "url": (v.get("official_url") or "").strip(),
        })
    items.sort(key=lambda x: _rank_cnas(x["no"]))
    return items


def write_cnas_js(items: list[dict]) -> None:
    """把 CNAS 条目写成 data/_cnasjs.txt（注入 data.js 的 CNASDOCS 键）。

    字段刻意比 REFGROUPS 简单：CNAS 文件没有「实施日期 / 现行有效 /
    被替代版本」这套国标语义，硬套会逼出一堆假字段。
    """
    rows = []
    for x in items:
        rows.append(
            '  {{no:"{no}", title:"{ti}", kind:"{k}", kindName:"{kn}", '
            'pub:"{pub}", url:"{url}"}}'.format(
                no=esc(x["no"]), ti=esc(x["title"]), k=esc(x["kind"]),
                kn=esc(x["kindName"]), pub=esc(x["pub"]), url=esc(x["url"])))
    # 分类清单也一起输出，页面用它渲染子标签与说明文案
    #★ 用 ",\n".join 而不是让每行自带尾逗号 ★
    #   自带尾逗号时最后一行会多出一个 `},` → node 报
    #   "Unexpected token ','"；而 join 里不加逗号又会让元素之间缺分隔符
    #   → "Unexpected token '{'"。两种错法都踩过，统一用 ",\n".join。
    kinds = ",\n".join(
        '  {{k:"{k}", name:"{n}", desc:"{d}"}}'.format(
            k=esc(k), n=esc(n), d=esc(d)) for k, n, d in CNAS_KIND)
    body = ("[\n" + ",\n".join(rows) + "\n]\n@@KINDS@@\n[\n" + kinds + "\n]\n")
    io.open(os.path.join(DATA, "_cnasjs.txt"), "w", encoding="utf-8").write(body)



def esc(s):
    return (str(s or "").replace("\\", "\\\\").replace('"', '\\"')
            .replace("\n", " ").replace("\r", " "))


# 限量类标准：不走"检测对象"归一化（它们是限量标准，不是测定方法），
# 直接按标准号主干匹配，**取该主干下的现行版**。
LIMIT_SUBJECTS = {
    "污染物限量": "GB2762",
    "真菌毒素限量": "GB2761",
    "营养强化剂": "GB14880",
    "致病菌限量": "GB29921",
    "特殊膳食用食品标签": "GB13432",
}


INFANT_SPECIFIC = re.compile(r"婴幼儿|婴配|儿童|幼儿|母乳")
# ★ 适用范围与乳基质不符的标记词（油脂类方法）★
#   GB 5009.257-2016 官方范围是「动植物油脂、氢化植物油、精炼植物油脂及煎炸油
#   和含动植物油脂…的食品」，代替 GB/T 22507-2008（油脂），不是乳粉方法。
#   源站标题只写食品中，看不出这个限制 —— 只能靠这些词识别。
_SCOPE_MISMATCH = re.compile(
    r"动植物油脂|植物油脂|动物油脂|油脂中|煎炸油|氢化植物油"
)

_SCREENING = re.compile(r"快速检测|快检|快速法|筛查|初筛|现场检验|便携|试纸|比色|速测")

# ★ 分产品子规范（如 JJF 1070.1 肥皂 / 1070.2 小麦粉 / 1070.3 大米）★
#   标题结尾带产品名的，是母规范的分支，只适用于该产品，
#   不能参与"当前该执行哪一版"的上位竞争 —— 否则按日期挑会挑到子规范。
#
#   ★ 必须同时限定标准号前缀为 JJF ★
#   踩过：一开始只按产品名匹配，结果把
#     GB 19644-2024《食品安全国家标准 **乳粉**和调制乳粉》  ← 核心产品标准！
#   也判成"分产品子规范"降级。**婴配/乳粉产品标准必须留在上位候选里**，
#   降级的后果是实验室可能拿到别的产品标准当婴配判定依据。
#   正确口径：只有**计量技术规范**才分产品规格（JJF 1070.x 系列），
#   GB 系列的"XX 食品"标准本身就是独立产品标准，不存在母/子关系。
def _is_sub_specialty(std_no: str, title: str) -> bool:
    if not re.match(r"^\s*JJ[FG]\b", std_no or "", re.I):
        return False
    return bool(re.search(r"(肥皂|小麦粉|大米|饲料|食糖|食用酒精|"
                          r"婴幼儿配方|乳粉|奶粉)\s*$", title or ""))


_SUB_SPECIALTY_TITLES = ("肥皂", "小麦粉", "大米", "饲料", "食糖",
                         "食用酒精", "婴幼儿配方", "乳粉", "奶粉")


def _is_screening(title: str) -> bool:
    """筛查/快检法：可用于初筛，不能替代仲裁法出报告。"""
    return bool(_SCREENING.search(title or ""))


def main():
    g = json.load(io.open(os.path.join(DATA, "general_refs.json"), encoding="utf-8"))
    details = g.get("details") or {}

    allstd = [{"std_no": k, "title": v.get("title", ""),
               "implement_date": v.get("implement_date", ""),
               "publish_date": v.get("publish_date", "")}
              for k, v in details.items()]
    res = V.audit(allstd)
    byno = {r["std_no"]: r for r in res}

    # 按检测对象归拢全部版本
    by_subject: dict[str, list[dict]] = {}
    for v in allstd:
        subj = V.subject_of(v.get("title", ""))
        if subj:
            by_subject.setdefault(subj, []).append(v)
    # 限量类：按标准号主干匹配，收集该主干下所有版本
    for label, base in LIMIT_SUBJECTS.items():
        vs = [v for v in allstd if V.std_base(v["std_no"]) == base]
        if vs:
            by_subject[label] = vs

    blocks, total, missing = [], 0, []
    # ★ 跨检测对象的重复登记 ★
    #   踩过（2026-10-03，用户截图指正）：页面「N 项标准在一年内换版」里
    #   GB 5009.168-2026 与 GB 5413.36-2026 各出现两次。
    #   根因：GROUPS 里"脂肪酸"和"反式脂肪酸"是两个**检测对象**，
    #   而它们指向同一批标准 —— 页面把每个检测对象的 altsSoon 平铺汇总，
    #   同一标准号就被登记了两次。
    #   同一个标准被两个检测对象引用是正常业务事实（要合并显示，不是删一条），
    #   所以这里保留所有来源，由页面按标准号合并成一行、列出"用于哪些检测"。
    #   seen_pool: {标准号: {imp, desc, subjects: [检测对象…]}}
    seen_pool: dict[str, dict] = {}

    def note_soon(std_no: str, desc: str, subj: str) -> None:
        if std_no not in seen_pool:
            seen_pool[std_no] = {"desc": desc, "subjects": []}
        if subj not in seen_pool[std_no]["subjects"]:
            seen_pool[std_no]["subjects"].append(subj)

    for gname, subjects in GROUPS:
        items = []
        for subj in subjects:
            vs = by_subject.get(subj) or []
            if not vs:
                missing.append(subj)
                continue
            # 当前该执行的那一版：现行有效里实施日期最新的
            live = []
            for v in vs:
                r = byno.get(v["std_no"])
                if r and r["validity"] == "现行有效":
                    live.append((v, r))
            # ★★ 取条规则（2026-10-03 两次修正）★★
            #   修正 1：原规则「婴配专用 > 全方法 > 快检」给"标题含婴幼儿"开了
            #     豁免权，于是 GB 5413.27-2010（脂肪酸，2010 实施）被当"现行"上位，
            #     而真正现行的 GB 5009.168-2016（2017 实施）被挤掉。
            #     → 婴配专用性不享有豁免。
            #   修正 2：只按实施日期取最新，会取到**还没实施**的版本。
            #     脂肪酸对象下最新的是 GB 5009.168-2026（2027-08-18），
            #     今天 2026-10 它还没生效，显示它是错的 —— 现在该执行的是 2016 版。
            #     → 必须先取"已实施"，只有当该对象下**没有任何已实施版本**时
            #       才用未实施的（意味着要准备换版了）。
            #   修正 3（用户指出）：**适用范围不符的不能参与上位竞争**。
            #     GB 5009.257-2016 官方适用范围是「动植物油脂、氢化植物油、
            #     精炼植物油脂及煎炸油和含动植物油脂…的食品」，
            #     代替的是 GB/T 22507-2008（**油脂**），不是乳粉方法。
            #     反式脂肪酸这一检测对象下它 2017 实施、比婴配专用的
            #     GB 5413.36-2010（2010）新，纯按日期会选错 ——
            #     而乳粉基质根本不该用油脂方法。
            #     → 适用范围与乳基质冲突的，剔出上位候选，只在 alts 里提示。
            #   保留的硬规则：筛查法/快检法不与全方法争上位（三聚氰胺案例）。
            live_implemented = [x for x in live
                                if byno.get(x[0]["std_no"], {})
                                .get("implement_state") == "已实施"]

            def tier(pair):
                # ★ 用标准号查适用范围，不靠标题 ★
                #   源站标题只有「食品中反式脂肪酸的测定」，没有"油脂"字样，
                #   靠正则识别不出来。SCOPE_LIMIT 是按标准号登记的
                #   （官方原文：GB 5009.257 适用于动植物油脂、氢化植物油、
                #   精炼植物油脂及煎炸油和含油脂食品，代替 GB/T 22507 油脂方法）。
                if V.SCOPE_LIMIT.get(V.std_base(pair[0].get("std_no", ""))):
                    return 3               # 油脂等非乳基质方法，排在最后
                # ★ 分产品子规范不参与上位竞争（2026-10-03）★
                #   JJF 1070 有 4 个现行版本：通用 2023 + 肥皂/小麦粉/大米子规范。
                #   子规范实施日期不一定更晚，按日期挑会挑错 ——
                #   实验室做婴配净含量仲裁要按**通用规则**，不是按肥皂的。
                if _is_sub_specialty(pair[0].get("std_no", ""),
                                     pair[0].get("title", "")):
                    return 2               # 分产品子规范
                return 1 if _is_screening(pair[0].get("title", "")) else 0

            if live_implemented:
                base_pool = live_implemented
            else:
                # 该检测对象下目前没有已实施版本 → 全是未实施的新版，
                # 取最新的那个（页面会配合 altsSoon 提示换版）
                base_pool = live
            # ★ 空池保护 ★
            #   踩过（2026-10-03）：GROUPS 里新增了「蜡样芽胞杆菌」，
            #   但库里没有（官方名是「蜡样芽**孢**杆菌」，规则没匹配上），
            #   live 与 live_implemented 都是空 → min() 抛 ValueError 整个脚本崩。
            #   检测对象取不到标准是**数据问题**，不是致命错误：
            #   记进 missing、跳过这一项，让其余组照常产出。
            if not base_pool:
                missing.append(subj + "（库中无现行有效版本）")
                continue
            best = min(tier(x) for x in base_pool)
            pool = [x for x in base_pool if tier(x) == best]
            v, r = sorted(pool, key=lambda x: x[0].get("implement_date") or "",
                          reverse=True)[0]
            if not r and vs:
                v = sorted(vs, key=lambda x: x.get("implement_date") or "",
                           reverse=True)[0]
                r = byno.get(v["std_no"])
            if not r:
                continue
            # 该对象下被替代的老版本，一并列出来（说清"不要用哪个"）
            olds = [x["std_no"] for x in vs
                    if byno.get(x["std_no"], {}).get("validity") == "已被替代"]
            olds = [o for o in olds if o and o != r["std_no"]]
            # ★ 同一对象的其它现行方法也列出来 ★
            #   筛查法（GB/T 22400）和仲裁法（GB/T 22388）都有效，
            #   但用途不同 —— 界面要说清，不然会拿筛查法去出仲裁报告。
            # ★ 同一对象下"其它仍现行"的方法，分两类显示 ★
            #   1) alts  —— 已实施但用途不同（筛查法 vs 仲裁法）
            #   2) altsSoon —— 还没实施，**必须带倒计时**
            #   实测踩过：GB 5009.168-2026 / GB 5413.36-2026 都是 2027-08-18
            #   实施，混在 alts 里只显示标准号，用户看不出"我明年就得换方法"，
            #   而这正是这个系统存在的意义。所以未实施的必须单独标。
            alts, alts_soon = [], []
            for x in live:
                if x[0]["std_no"] == r["std_no"]:
                    continue
                ar = byno.get(x[0]["std_no"], {})
                if ar.get("validity") != "现行有效":
                    continue
                # ★ 组内去重 ★
                #   踩过（2026-10-03）：同一检测对象下可能有多条记录指向
                #   同一版本（by_subject 是按标题归拢的，"反式脂肪酸"与
                #   "脂肪酸"两个对象都会收进 GB 5009.168-2026），
                #   不去重就会出现同一标准号在 altsSoon 里出现两遍。
                if x[0]["std_no"] in alts:
                    continue
                if ar.get("implement_state") == "即将实施":
                    if x[0]["std_no"] in [a.split("（")[0] for a in alts_soon]:
                        continue
                    alts_soon.append("{}（{}）".format(
                        x[0]["std_no"], ar.get("implement_desc") or "即将实施"))
                    note_soon(x[0]["std_no"],
                              ar.get("implement_desc") or "即将实施", subj)
                else:
                    alts.append(x[0]["std_no"])
            alts_soon_s = "；".join(alts_soon)
            items.append({
                "no": r["std_no"], "title": r["title"],
                "imp": r["implement_date"] or "", "pub": r["publish_date"] or "",
                "validity": r["validity"], "impState": r["implement_state"],
                "impDesc": r["implement_desc"], "reason": r["reason"],
                "subject": subj,
                "alts": alts, "altsSoon": alts_soon_s, "olds": "、".join(sorted(set(olds))[:3]),
            })
        if not items:
            continue
        total += len(items)
        rows = []
        for x in items:
            rows.append(
                '      {{no:"{no}", title:"{ti}", imp:"{imp}", pub:"{pub}", '
                'validity:"{val}", impState:"{st}", impDesc:"{desc}", reason:"{rs}", '
                'subject:"{subj}", alts:"{alts}", altsSoon:"{altsSoon}", olds:"{olds}"}},'.format(
                    no=esc(x["no"]), ti=esc(x["title"]), imp=esc(x["imp"]),
                    pub=esc(x["pub"]), val=esc(x["validity"]),
                    st=esc(x["impState"]), desc=esc(x["impDesc"]),
                    rs=esc(x["reason"]), subj=esc(x["subject"]),
                    alts=esc("、".join(x.get("alts") or [])), altsSoon=esc(x["altsSoon"]), olds=esc(x["olds"])))
        blocks.append('  {{\n    g:"{g}",\n    items:[\n'.format(g=gname)
                      + "\n".join(rows) + "\n    ]\n  }")

    io.open(os.path.join(DATA, "_refjs.txt"), "w", encoding="utf-8").write(
        "[\n" + ",\n".join(blocks) + "\n]")

    # ★ 输出「一年内换版」去重汇总（按标准号唯一，合并检测对象来源）★
    #   页面原来是把每个检测对象的 altsSoon 平铺汇总，同一标准号会被登记多次
    #   （脂肪酸 / 反式脂肪酸两个检测对象指向同一批标准）→ 列表出现重复行。
    #   改成独立数据源：一个标准号一行，so 用"｜"分隔列出它服务的检测对象。
    import re as _re
    soon_rows = []
    # 按"距实施天数"升序输出（数据源本身有序，不依赖页面再排一次）
    def _days(info):
        d = _re.search(r"还有 (\d+) 天", info["desc"] or "")
        return int(d.group(1)) if d else 99999
    for no, info in sorted(seen_pool.items(), key=lambda kv: _days(kv[1])):
        d = _re.search(r"还有 (\d+) 天", info["desc"] or "")
        imp = _re.search(r"（([\d-]+)）", info["desc"] or "")
        soon_rows.append(
            '  {{no:"{no}", d:{d}, imp:"{imp}", so:"{so}"}},'.format(
                no=esc(no),
                d=int(d.group(1)) if d else 99999,
                imp=esc(imp.group(1) if imp else ""),
                so=esc("｜".join(info["subjects"]))))
    io.open(os.path.join(DATA, "_soonjs.txt"), "w", encoding="utf-8").write(
        "[\n" + "\n".join(soon_rows) + "\n]\n")

    json.dump(res, io.open(os.path.join(DATA, "validity_audit.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    # ★ CNAS 单独产物（2026-10-07 用户要求从通则引用里移出）★
    #   写到独立文件 → inject_refdata.py 灌进 data.js 的 CNASDOCS 键，
    #   页面左侧导航「认可规范」单独一页渲染，不再出现在通则引用里。
    cnas = build_cnas_items()
    write_cnas_js(cnas)
    if cnas:
        byk = {}
        for x in cnas:
            byk[x["kindName"]] = byk.get(x["kindName"], 0) + 1
        print("CNAS 认可规范（独立页）：{} 条 · {}".format(
            len(cnas), "、".join("%s %d" % (k, v) for k, v in byk.items())))
    else:
        print("  ⚠ CNAS 无快照（data/snapshots/SRC-11_latest.json），"
              "独立页将为空")

    print("通则引用页：{} 条".format(total))
    print("一年内换版（按标准号去重后）：{} 项".format(len(seen_pool)))
    for no, info in seen_pool.items():
        if len(info["subjects"]) > 1:
            print("  {} 合并了 {} 个检测对象：{}".format(
                no, len(info["subjects"]), "、".join(info["subjects"])))
    if missing:
        print("  ⚠ 库里找不到：{}".format("、".join(missing)))
    print()
    print("=== 各组实际放入的标准 ===")
    for gname, subjects in GROUPS:
        rows = []
        for b in blocks:
            if '"{}"'.format(gname) in b:
                import re
                rows = re.findall(r'no:"([^"]+)"', b)
        print("  {:<12s} {}".format(gname, "、".join(rows)))


if __name__ == "__main__":
    main()
