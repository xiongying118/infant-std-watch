#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
官方源真实适配器
================
结构全部来自 2026-10-03 对生产站点的实测，不是猜的。改版时改这里。

★ 已实测可用的结构（openstd.samr.gov.cn）
  检索：GET /bzgk/std/std_list
        p.p1  类型 1=国标 2=行标 3=团标 6=企标
        p.p2  标准号或标准名称（模糊）
        p.p5  状态 PUBLISHED / TOBEIMP / REPLACED / WITHDRAWN
        p.p7  时间范围 0.08=三月 0.25=半年 1=一年 2=两年 3=三年 6=六年
        p.p90 排序字段 circulation_date
        p.p91 排序 desc
  列表：table.result_list > tr
        td 序位：[0]=序号 [1]=标准号 [2]=空 [3]=空 [4]=中文名称
               [5]=类型(强标/推标) [6]=状态 [7]=发布日期 [8]=实施日期 [9]=操作
        详情：a onclick="showInfo('<32位大写HEX>')" → hcno
  详情：GET /bzgk/gb/newGbInfo?hcno=<hcno>
        标准号 / 中文标准名称 / 标准状态 / 发布日期 / 实施日期 / 主管部门 / 归口部门
        废止标准页会明确写"废止标准不提供标准文本阅读服务"

★ 日期字段是 "1997-05-28 00:00:00.0" 这种格式，必须清洗

★ 重要发现（决定架构）：
  openstd（标准委）只收录 GB 10765-1997 这类**老**国标；
  GB 10765-2021 属食品安全国家标准，由**卫健委**发布，不在这个库。
  → 所以必须多源并行，单接一个源会漏掉最关键的现行产品标准。
"""
from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from datetime import date, datetime

from http_client import Fetcher

# 标准号归一化：GB 10765-2021 → GB10765-2021
_STD_NO_RE = re.compile(r"(GB/T|GB|QB/T|QB|DB\d*/T|T/[A-Z]+|ISO|IEC)\s*"
                        r"([\d.]+)\s*[-—]?\s*(\d{4})?", re.I)
_DATE_CLEAN = re.compile(r"(\d{4})-(\d{2})-(\d{2})")


@dataclass
class Standard:
    """标准元数据。刻意不含任何正文字段——库里不该有、也不该能存标准全文。"""
    std_no: str
    title: str
    category: str = "assoc"          # product/test/prod/sys/assoc
    status: str = "现行"             # 现行/即将实施/废止/被代替
    publish_date: str = ""
    implement_date: str = ""
    abolish_date: str = ""
    replaces: list[str] = field(default_factory=list)
    replaced_by: str = ""
    jurisdiction_org: str = ""
    issuer_org: str = ""
    official_url: str = ""
    hcno: str = ""                  # 官方详情页标识
    download_allowed: bool = False   # 官方是否明确支持免费下载
    is_iso: bool = False
    is_mandatory: bool = True
    source_code: str = ""

    def norm(self) -> str:
        s = (self.std_no or "").strip().upper()
        s = s.replace("　", " ").replace("－", "-")
        return re.sub(r"\s+", "", s)

    def row_hash(self) -> str:
        import hashlib
        key = "|".join([self.norm(), self.title, self.status, self.publish_date,
                        self.implement_date, self.abolish_date, self.replaced_by,
                        ",".join(sorted(self.replaces))])
        return hashlib.sha256(key.encode("utf-8")).hexdigest()[:16]

    def days_to_implement(self) -> int | None:
        return _days_left(self.implement_date)


def _days_left(d: str) -> int | None:
    if not d:
        return None
    try:
        return (datetime.strptime(d, "%Y-%m-%d").date() - date.today()).days
    except ValueError:
        return None


def _clean_date(raw: str) -> str:
    """'1997-05-28 00:00:00.0' / '1997年5月28日' → '1997-05-28'"""
    if not raw:
        return ""
    raw = raw.replace("年", "-").replace("月", "-").replace("日", "")
    m = _DATE_CLEAN.search(raw)
    return f"{m.group(1)}-{m.group(2)}-{m.group(3)}" if m else ""


# 官方源自身的编码缺陷修正（实测：sppt 把希腊字母 β 存成了"锟斤拷"）。
# 这是**源站数据错误**，不是我们解码错误 —— 已用 utf-8/gbk/gb18030 三种编码
# 交叉验证确认。修正后仍在标准名里标注，方便人工复核。
_MOJIBAKE_FIX = {
    "锟斤拷": "β",          # β
    "锟斤拷-葡聚糖": "β-葡聚糖",
}


def _fix_mojibake(s: str) -> tuple[str, bool]:
    """修正源站乱码。返回 (修正后文本, 是否改过)。"""
    if not s or "锟斤拷" not in s:
        return s, False
    for bad, good in _MOJIBAKE_FIX.items():
        s = s.replace(bad, good)
    return s, True


# 关键词 → 分类映射（抓回来的标准号要判断属于哪类，用于分级）
_PRODUCT_HINT = re.compile(
    r"GB\s*(1076[567]|25596|29922|10769"
    # ★ 19644 = 乳粉和调制乳粉（2024 版）★
    #   漏了它 → 归到 assoc「关联·其它」。它是本系统的核心产品标准之一，
    #   用户做乳粉/调制乳粉检测时按"产品标准"找找不到它。
    #   19645（巴氏杀菌乳）/ 19646（稀奶油）/ 19643（生乳）同属乳制品产品标准。
    r"|19644|19645|19646|19643|19302|25192|25190|13102|5420)",
    # ★ 23790 / 29923 已移除（2026-10-06）★
    #   这两本是**良好生产规范（GMP）**，答的是"厂怎么管"，
    #   不是产品标准。放在这里会让 guess_category 先判成 product
    #   （它先于 _PROD_HINT 判定），用户按"生产标准"找就找不到。
    re.I)
# ★ 限量类标准全列进来 ★
#   踩过（2026-10-03）：只列了 2762/29921，漏掉
#     · 2760 食品添加剂使用标准      · 2761 真菌毒素限量
#     · 2763 农药最大残留限量        · 2763.1 农药限量补充
#     · 29924 食品添加剂标识通则
#   结果这批全部落到 assoc（关联标准），跟"检测标准"混在一起，
#   检测员查"农药怎么测"时会翻出限量表 —— 限量答的是"允许多少"，不是"怎么测"。
_TEST_HINT = re.compile(
    r"GB\s*(5009|4789|276[0-3](?!\d)|29921|29924|3160\d|31607|31658|23200)", re.I)
# ★ 生产规范类 ★
#   这类回答的是"厂怎么管"（GMP/通用��生），不是"产品什么标准"、
#   也不是"怎么测"。婴配厂实际执行的就是这5 本，必须单列一类。
#
#   GB 14881 食品生产通用卫生规范
#   GB 17405 保健食品良好生产规范       ← 2026-10-06 用户截图点名，原来没归到这类
#   GB 12693 乳制品良好生产规范
#   GB 23790 婴幼儿配方食品良好生产规范 ← 2026-10-06 同上
#   GB 29923 特殊医学用途配方食品良好生产规范 ← 2026-10-06 同上
#   另含 12695/12692/19300/14882/8951（饮料/冷冻饮品等GMP，跨行业同号段规律）
#
#   ★ 23790 / 29923 原来被 _PRODUCT_HINT 抢走了 ★
#   两者同时出现在 PRODUCT_HINT（因为它们是"婴幼儿配方食品/特医食品"的
#   强制性产品标准），而 guess_category 里 PRODUCT_HINT **先于** PROD_HINT 判定，
#   结果这两本 GMP 一直挂在「产品标准」下。用户截图对比发现
#   "生产规范 5 本，系统只显示 2 本"—— 少了它们。
#   现在从 _PRODUCT_HINT 里移除，GMP 身份优先。
_PROD_HINT = re.compile(
    r"GB\s*(14881|17405|12695|12692|12693|19300|14882|8951|23790|29923)", re.I)
# ★ 体系类（GB/T 推荐性标准 + JJF/JJG 计量技术规范）★
#   22000 食品安全管理体系、22003 审核与认证机构、27320 食品防护计划
#   ★ JJF/JJG 是"国家计量技术规范"（计量检定规程/校准规范）★
#   用户 2026-10-03 点名 JJF 1070《定量包装商品净含量计量检验规则》。
#   源站（标准委检索库）**不收录 JJF**，全量抓取走的是官方公告与标准信息平台，
#   所以这类标准要靠 fetch_wanted.py 单独补，**不会从主流程自动进来**。
_SYS_HINT = re.compile(r"GB/T?\s*(2200\d|27320|19001|28001|45001|1400\d)|"
                       r"JJ[FG]\s*\d", re.I)


def guess_category(std_no: str, title: str) -> str:
    no = std_no or ""
    t = title or ""
    if _PRODUCT_HINT.search(no):
        return "product"
    # 体系类要在 test 之前判：GB/T 22000 名字里有"食品安全"，
    # 若让 "检验" 之类的词先命中会被误归成检测标准。
    if _SYS_HINT.search(no):
        return "sys"
    # ★ 标签/标识类必须在 _TEST_HINT 之前判 ★
    #   GB 29924「食品添加剂标识通则」号段 2992x 落在 _TEST_HINT 里
    #   （与 29921 致病菌限量同段），先判 test 就永远到不了标签判断，
    #   实测它被归成"检测标准 · 标签与标识"—— 一个既不是检测方法、
    #   也不在 test 分类下说得通的位置。标签答的是"标什么"，
    #   必须先于"怎么测"判定。
    if re.search(r"标签|标识|说明书|警示语", t):
        return "assoc"
    if _TEST_HINT.search(no) or "测定" in t or "检验" in t:
        return "test"
    if _PROD_HINT.search(no):
        return "prod"
    if "限量" in t or "最大残留" in t or "使用标准" in t:
        return "test"
    return "assoc"


# ============================================================
# 源一：国家标准全文公开系统（标准委）
# ============================================================
class OpenStdAdapter:
    """openstd.samr.gov.cn —— 国标元数据与官方阅读入口主源。

    合规：本源只取元数据。download_allowed 仅在"现行强标"时为 True，
    因为实测废止标准页会写"不提供标准文本阅读服务"，给下载按钮就是错的。
    """

    code = "SRC-02"
    name = "国家标准全文公开系统"
    base = "https://openstd.samr.gov.cn"
    list_url = base + "/bzgk/std/std_list"
    detail_url = base + "/bzgk/gb/newGbInfo"
    root_url = base + "/bzgk/gb/"

    def __init__(self, fetcher: Fetcher | None = None):
        self.f = fetcher or Fetcher(self.name)

    def search(self, keyword: str, type_code: str = "1") -> list[Standard]:
        """按标准号或名称检索。返回 Standard 列表（含 hcno）。"""
        params = {
            "p.p1": type_code,        # 1=国标
            "p.p2": keyword,
            "p.p5": "",               # 状态不限
            "p.p7": "",               # 时间不限
            "p.p90": "circulation_date",
            "p.p91": "desc",
        }
        html = self.f.get(self.list_url, params=params)
        doc = self.f.soup(html)
        return self._parse_list(doc)

    def _parse_list(self, doc) -> list[Standard]:
        out: list[Standard] = []
        for table in doc.xpath('//table[contains(@class,"result_list")]'):
            for tr in table.xpath(".//tr"):
                tds = [" ".join(td.text_content().split()) for td in tr.xpath("./td")]
                if len(tds) < 9:
                    continue
                # 详情页标识藏在 onclick 里
                on = tr.xpath(".//a/@onclick")
                m = re.search(r"'([0-9A-Fa-f]{32})'", on[0]) if on else None
                hcno = m.group(1) if m else ""
                std_no, title = tds[1], tds[4]
                if not std_no:
                    continue
                out.append(Standard(
                    std_no=std_no,
                    title=title,
                    status=self._norm_status(tds[6]),
                    publish_date=_clean_date(tds[7]),
                    implement_date=_clean_date(tds[8]) if len(tds) > 8 else "",
                    is_mandatory=("强标" in tds[5]),
                    hcno=hcno,
                    official_url=f"{self.detail_url}?hcno={hcno}" if hcno else self.root_url,
                    # 废止/被代替的官方不提供全文服务，不能给下载按钮
                    download_allowed=("强标" in tds[5]) and self._norm_status(tds[6]) in ("现行", "即将实施"),
                    issuer_org="国家标准化管理委员会",
                    jurisdiction_org="国家标准委",
                    category=guess_category(std_no, title),
                    source_code=self.code,
                ))
        return out

    @staticmethod
    def _norm_status(raw: str) -> str:
        """官方状态文案 → 站内统一状态词。"""
        raw = (raw or "").strip()
        return {
            "现行": "现行", "废止": "废止", "即将实施": "即将实施",
            "被代替": "废止", "未实施": "即将实施", "": "现行",
        }.get(raw, raw or "现行")

    def detail(self, hcno: str) -> dict:
        """抓详情页，补齐归口单位等列表页没有的字段。

        实测结构：详情页不是两列表格，而是**单列**「标签：值」的行，
        例如 "中文标准名称：婴儿配方乳粉Ⅰ"。所以按全角冒号切分。
        """
        if not hcno:
            return {}
        html = self.f.get(self.detail_url, params={"hcno": hcno})
        doc = self.f.soup(html)
        out: dict = {}
        for tr in doc.xpath("//tr"):
            txt = " ".join(tr.text_content().split())
            if "：" not in txt:
                continue
            k, _, v = txt.partition("：")
            k, v = k.strip(), v.strip()
            if k and len(k) <= 20:            # 过滤掉正文长句
                out[k] = v
        body = " ".join(doc.text_content().split())
        # 合规关键信号：官方自己声明废止标准不给全文
        out["_废止不给全文"] = "废止标准不提供标准文本阅读服务" in body
        return out

    def fetch_detail_fields(self, s: Standard) -> Standard:
        """把详情页字段回填到 Standard。"""
        d = self.detail(s.hcno)
        s.jurisdiction_org = d.get("归口部门") or d.get("主管部门") or s.jurisdiction_org
        s.issuer_org = d.get("发布单位") or s.issuer_org
        if d.get("中文标准名称") and (not s.title or s.title.startswith("关于")):
            s.title = d["中文标准名称"]
        if d.get("标准状态"):
            s.status = self._norm_status(d["标准状态"].replace(" ", ""))
        if d.get("发布日期"):
            s.publish_date = _clean_date(d["发布日期"])
        if d.get("实施日期"):
            s.implement_date = _clean_date(d["实施日期"])
        # 官方声明不给全文的，一律不给下载按钮
        if d.get("_废止不给全文"):
            s.download_allowed = False
        return s

    def fetch(self, keywords: list[str], type_code: str = "1") -> list[Standard]:
        """按关键词列表逐个检索并汇总。限速由 Fetcher 统一控制。"""
        seen: dict[str, Standard] = {}
        for kw in keywords:
            try:
                for s in self.search(kw, type_code):
                    seen.setdefault(s.norm(), s)
            except Exception as e:                       # noqa: BLE001
                print(f"    [{self.code}] 检索「{kw}」失败：{e}")
        return list(seen.values())


# ============================================================
# 源二：卫健委 食品安全标准（关键——现行产品标准在这里）
# ============================================================
class NhcFoodStandardAdapter:
    """国家卫健委 食品安全标准发布公告。

    ★ 实测结论：此源当前不可用，已停用（2026-10-03）
      症状：一律返回 HTTP 412，响应体不是错误页，而是
            `$_ts = window['$_ts'] ...` 的混淆 JS + `Set-Cookie: 5uRo8RWcod0KO=...`
      判定：属于必须执行 JS 才能通过的**反爬挑战**（瑞数一类）。
            实测四种请求组合（裸 / 带UA / 加Referer / 补Accept）**全部 412**，
            改 header 没用。
      结论：不硬刚。改用 SRC-05 sppt 的公告库（`notices()`）作等价替代 ——
            那里有结构化接口，公告内容一致，还能拿到"等N项标准 / M项修改单"的结构化计数。

      如需恢复：得用无头浏览器（Playwright）执行 JS 挑战。
      代价是每次抓取要起浏览器，又慢又重，不划算，故默认不走这条路。
    """

    code = "SRC-03"
    name = "国家卫健委 食品安全标准"
    base = "https://www.nhc.gov.cn"
    enabled = False
    disabled_reason = "HTTP 412 反爬挑战，需执行 JS；已由 SRC-05 公告库替代"

    def __init__(self, fetcher: Fetcher | None = None):
        self.f = fetcher or Fetcher(self.name)

    def fetch(self, keywords: list[str]) -> list[Standard]:
        return []


class SamrStdAdapter:
    """std.samr.gov.cn —— 全国标准信息公共服务平台（国标/行标/团标/企标）。

    ★ 实测找到了未文档化的 JSON 接口（2026-10-03）★

        GET /gb/search/gbQueryPage?searchText=<词>&current=1&size=20
        → {"total":N,"pageNumber":1,"rows":[{...}]}

    字段（实测）：
        C_C_NAME     中文名称（**内含 <sacinfo> 标签，必须清洗**）
        C_STD_CODE   标准号（同样内含标签，形如 "<sacinfo>GB</sacinfo> <sacinfo>10765</sacinfo>-1997"）
        STD_NATURE   强制性 / 推荐性
        STATE        状态（直接给中文：现行 / 废止，比 openstd 好用）
        ISSUE_DATE   发布日期
        ACT_DATE     实施日期
        id / PROJECT_ID  详情页标识

    ★ 检索词必须去掉空格 ★（实测，差很多）：
        "GB 5009"   → 233 条
        "GB5009.5"  → 0 条
        "5009.5"    → 11 条
        "GB 5009.5" → 0 条
      空格会让它按短语匹配，命中骤减。所以下面统一先 strip 掉空格再查。

    定位：**行标(QB)与团标的入口**。国标层面它和 openstd 高度重叠，
    但它给的状态更直接，是补充而非主力。
    """

    code = "SRC-01"
    name = "全国标准信息公共服务平台"
    base = "https://std.samr.gov.cn"
    query_url = base + "/gb/search/gbQueryPage"
    # 详情页（实测可打开，浏览器形式）
    detail_url = base + "/gb/search/gbDetailed"

    def __init__(self, fetcher: Fetcher | None = None):
        self.f = fetcher or Fetcher(self.name)

    def search(self, keyword: str, size: int = 30) -> list[dict]:
        """检索。keyword 里的空格会被去掉（实测带空格命中率极低）。"""
        kw = re.sub(r"\s+", "", keyword or "")
        if not kw:
            return []
        html = self.f.get(self.query_url,
                          params={"searchText": kw, "current": "1", "size": str(size)},
                          timeout=30)
        try:
            return _json_loads(html)
        except Exception:                              # noqa: BLE001
            return _json_loads(_strip_tags(html))

    def _parse_rows(self, rows: list[dict]) -> list[Standard]:
        out: list[Standard] = []
        for it in rows:
            no = _clean_sacinfo(it.get("C_STD_CODE"))
            name = _clean_sacinfo(it.get("C_C_NAME"))
            if not no:
                continue
            state = (it.get("STATE") or "").strip()
            nature = (it.get("STD_NATURE") or "").strip()
            out.append(Standard(
                std_no=no,
                title=name,
                # 该源状态已是中文，直接用（比 openstd 少一层映射）
                status={"": "现行", "现行": "现行", "废止": "废止",
                        "即将实施": "即将实施", "未实施": "即将实施"}.get(state, state or "现行"),
                publish_date=_clean_date(it.get("ISSUE_DATE") or ""),
                implement_date=_clean_date(it.get("ACT_DATE") or ""),
                is_mandatory=("强制" in nature),
                # 官方为在线阅读，不提供直下
                download_allowed=False,
                official_url=f"{self.detail_url}?id={it.get('id', '')}",
                issuer_org="国家标准化管理委员会 / 国家市场监督管理总局",
                jurisdiction_org="全国标准信息公共服务平台",
                category=guess_category(no, name),
                source_code=self.code,
            ))
        return out

    def fetch(self, keywords: list[str]) -> list[Standard]:
        """按关键词逐个检索。限速由 Fetcher 统一控制。"""
        out: dict[str, Standard] = {}
        for kw in keywords:
            try:
                data = self.search(kw)
                for s in self._parse_rows(data.get("rows", []) or []):
                    out.setdefault(s.norm(), s)
            except Exception as e:                       # noqa: BLE001
                print(f"    [{self.code}] 检索「{kw}」失败：{e}")
        return list(out.values())


# ============================================================
# 源五：食品安全国家标准数据检索平台 —— ★ 主力源
# ============================================================
class CfsaSpptAdapter:
    """sppt.cfsa.net.cn:8086/db —— 国家食品安全风险评估中心主办。

    ★★★ 这是整个系统的主力源，比 openstd 重要得多 ★★★
    实测对比（2026-10-03）：
      openstd 搜 "GB 10765"  → 只有 GB 10765-1997，状态"废止"
      sppt   搜 "GB 10765"  → GB 10765-2021（现行）+ GB 10765-2010
    原因：GB 10765-2021 这类**食品安全国家标准**由卫健委/国家食品安全风险评估中心
    发布，不在标准委的 openstd 库里。只接 openstd 会漏掉全部现行产品标准。

    实测接口（POST /db?task=indexSearch，返回 JSON 数组）：
      参数 isLength / num_tn(99=全部) / standard_type(分类码，空=全部) / keyword
      返回字段：
        CODE       标准号（解读材料会带尾随逗号，需剔除）
        TITLE      标准名称
        PDATE      发布日期
        SSRQ       实施日期（解读材料为 null）
        TABLENAME  数据表：2=标准文本  3=解读材料  4=标准勘误
        ID         详情/预览用标识
        FJ         附件（官方在线阅读用，本工具不下载正文）
    """

    code = "SRC-05"
    name = "食品安全国家标准数据检索平台"
    base = "https://sppt.cfsa.net.cn:8086/db"

    # 分类码（实测自页面 activeTabs）
    TYPES = {
        "": "全部标准", "1022": "污染物", "1023": "食品添加剂",
    }
    # num_tn —— 决定查哪个库（实测：切换标签页就是改这个值）
    TAB_NOTICE = "1"      # 最新公告
    TAB_STANDARD = "2"    # 标准文本
    TAB_EXPLAIN = "3"     # 标准解读
    TAB_ERATA = "4"       # 标准勘误  ★
    TAB_ALL = "99"        # 全部标准（实测等同 TAB_STANDARD）
    # 返回记录的 TABLE 字段
    TABLE_NOTICE = "1"    # 公告（CODE 为空，标准号写在 TITLE 里）
    TABLE_STANDARD = "2"  # 标准文本
    TABLE_EXPLAIN = "3"   # 解读材料（不是标准本体，要过滤）
    TABLE_ERATA = "4"     # 标准勘误

    def __init__(self, fetcher: Fetcher | None = None):
        self.f = fetcher or Fetcher(self.name)
        self._inited = False

    def _ensure_session(self) -> None:
        """该站要先 POST task=index 建立会话，否则接口返回错误页。"""
        if not self._inited:
            self.f.session.post(self.base, data={"task": "index"}, timeout=30)
            self._inited = True

    def search(self, keyword: str, type_code: str = "") -> list[Standard]:
        """按标准号或名称检索标准文本。"""
        return self._parse_rows(self._search_raw(keyword, self.TAB_ALL, type_code))

    def _search_raw(self, keyword: str, num_tn: str, type_code: str = "") -> list[dict]:
        """原始检索。num_tn 决定查哪个库（见 TAB_* 常量）。"""
        self._ensure_session()
        payload = {
            "task": "indexSearch",
            "isLength": "9999",
            "num_tn": num_tn,
            "standard_type": type_code,
            "keyword": keyword,
        }
        html = self.f.get(self.base, params=payload, timeout=40)
        try:
            return _json_loads(html)
        except Exception:                              # noqa: BLE001
            # 该站有时把 JSON 包在 <pre> 里
            return _json_loads(_strip_tags(html))

    # ---------- 标准勘误（★ 对实验室影响最大的数据） ----------
    def erata(self, keyword: str = "") -> list[dict]:
        """抓标准勘误记录。

        实测：num_tn=4 是勘误专库，共 176 条（2018-06 至今），全库一次拿完。
        字段（实测）：
          STANDARD_CODE / STANDARD_NAME   被勘误的标准
          CONTENT                          勘误章节（如 "5.1.3.2"、"表F.2"、"全文"）
          CONTENT_BEFORE / CONTENT_AFTER   改前 / 改后原文  ← 天然就是 diff
          REASON                           勘误原因
          KWSJ                             勘误时间
          GUID / STANDARD_GUID             官方记录标识

        为什么这个最重要 —— 实测两条实例：
          GB 8538-2022  定量限 10 mg/L → 0.1 mg/L      （方法能力差 100 倍）
          GB 5009.208-2016 "转移上层有机相" → "转移上层水相"
              （原文说"有机相在下层"，按错误操作做出来的结果就是错的）
        这类不改标准号、不改实施日期，只在勘误表里，**按标准号监控永远发现不了**。
        """
        rows = self._search_raw(keyword, self.TAB_ERATA)
        out = []
        for it in rows:
            if not it.get("STANDARD_CODE"):
                continue
            out.append({
                "std_no": it["STANDARD_CODE"].strip(),
                "std_name": (it.get("STANDARD_NAME") or "").strip(),
                "section": (it.get("CONTENT") or "").strip(),
                "before": _clean_ws(it.get("CONTENT_BEFORE")),
                "after": _clean_ws(it.get("CONTENT_AFTER")),
                "reason": (it.get("REASON") or "").strip(),
                "erata_date": (it.get("KWSJ") or "").strip(),
                "log_date": (it.get("LOG_DATE") or "")[:10],
                "guid": it.get("GUID", ""),
                "official_url": f"{self.base}?task=index",
                "source_code": self.code,
            })
        return out

    def erata_for(self, std_nos: list[str]) -> list[dict]:
        """只取指定标准号的勘误。"""
        if not std_nos:
            return []
        wanted = {re.sub(r"\s+", "", x).upper() for x in std_nos}
        base = {re.sub(r"\s+", "", x["std_no"]).upper(): x for x in std_nos}
        out = []
        for e in self.erata():
            key = re.sub(r"\s+", "", e["std_no"]).upper()
            if key in wanted:
                e = dict(e)
                e["std_no"] = base.get(key, e["std_no"])
                out.append(e)
        return out

    def _parse_rows(self, rows: list[dict]) -> list[Standard]:
        out: list[Standard] = []
        for it in rows:
            raw_code = (it.get("CODE") or "").strip()
            if not raw_code:
                continue
            std_no = raw_code.rstrip(",，").strip()
            title = (it.get("TITLE") or "").strip()
            table = str(it.get("TABLENAME") or "").strip()
            title, _fixed = _fix_mojibake(title)

            # 解读材料不是标准本身 —— 这是最容易误报的地方，单独处理
            is_erata = table == self.TABLE_ERATA
            is_explain = ("解读" in title) or ("问答" in title) or ("修改" in title)
            if is_explain and not is_erata:
                continue    # 解读材料不进提醒队列

            status = self._status(it, std_no, table)
            out.append(Standard(
                std_no=std_no,
                title=re.sub(r"^《.*?》", "", title).strip() or title,
                status=status,
                publish_date=_clean_date(it.get("PDATE") or ""),
                implement_date=_clean_date(it.get("SSRQ") or ""),
                # 勘误：现有版本被出勘误，等于检测方法被改了，必须提醒
                is_mandatory=True,
                download_allowed=False,   # 官方为在线预览，不提供直下
                official_url=f"{self.base}?task=index",
                jurisdiction_org="国家食品安全风险评估中心",
                issuer_org="国家卫生健康委员会 / 国家食品安全风险评估中心",
                category=guess_category(std_no, title),
                source_code=self.code,
            ))
        return out

    def _status(self, it: dict, std_no: str, table: str) -> str:
        """推断状态。

        该接口不返回状态列，用「实施日期 + 勘误标记」推断。
        注意：**不要把 90 天阈值写进状态** —— 90 天是提醒门槛，不是状态。
        官方口径里只有"已实施"和"未实施"两态；标准是否已废止要靠与历史快照
        比对得出（官方库对废止标准仍会返回记录）。所以这里只区分已实施/未实施。
        """
        if table == self.TABLE_ERATA:
            return "勘误"
        imp = _clean_date(it.get("SSRQ") or "")
        if not imp:
            return "现行"
        d = _days_left(imp)
        if d is not None and d > 0:
            return "即将实施"      # 官方已发布、尚未到实施日
        return "现行"              # 已到实施日；废止与否靠快照比对

    def fetch(self, keywords: list[str], type_code: str = "") -> list[Standard]:
        out: dict[str, Standard] = {}
        for kw in keywords:
            try:
                for s in self.search(kw, type_code):
                    out.setdefault(s.norm(), s)
            except Exception as e:                       # noqa: BLE001
                print(f"    [{self.code}] 检索「{kw}」失败：{e}")
        return list(out.values())

    def fetch_erata(self) -> list[dict]:
        """抓全部标准勘误。勘误库总共一百多条，一次就拿完，不用按关键词查。"""
        try:
            return self.erata()
        except Exception as e:                           # noqa: BLE001
            print(f"    [{self.code}] 勘误抓取失败：{e}")
            return []

    # ---------- 标准修改单（★ 勘误的"兄弟类"，同样查标准号发现不了） ----------
    #
    # ★ 为什么必须单独抓 ★
    #   2026-10-03 实测踩坑：用户问"杂质度有更新你怎么没有"，
    #   而我们把 CFSA 的 num_tn=4「标准勘误」库（176 条，最新 2025-09-15）翻遍了也没有。
    #   真凶在这里 —— **「修改单」是另一类文档，在全库检索（num_tn=99）里是独立记录**：
    #       GB 5413.30-2016《…乳和乳制品杂质度的测定》第1号修改单   PDATE=2026-08-18
    #   也就是说 num_tn=4 这个"勘误专库"**根本不收录修改单**。
    #   只查勘误库 → 修改单 100% 漏抓，而且漏得毫无痕迹（不报错、库是"成功"的）。
    #
    #   勘误 vs 修改单的区别（业务上必须分开提醒）：
    #     勘误    —— 更正笔误/表述错误，改动零散落在具体章节
    #     修改单  —— 实质性技术修订，通常整章重写（如杂质度单位 mg/8L → mg/L，
    #                标准板制作方法改写、过滤板抽检规则改写），**自批准之日起实施**
    #
    #   实测全库（num_tn=99）共 1975 条，其中修改单 57 条（2012 至今）。
    _MOD_RE = re.compile(r"第\s*(\d+)\s*号修改单")

    def amendments(self, keyword: str = "") -> list[dict]:
        """抓「标准修改单」记录（全库检索里筛标题）。

        返回字段与 erata() 对齐，外加：
          mod_no     修改单序号（第 1 号 / 第 2 号 …）
          detail_url 官方详情页 staticPages/<ID>.html
          explain_id 解读材料（标准问答）的 GUID，用于取变更要点
        """
        rows = self._search_raw(keyword, self.TAB_ALL)
        out: list[dict] = []
        seen: set[str] = set()
        for it in rows:
            title = (it.get("TITLE") or "").strip()
            m = self._MOD_RE.search(title)
            if not m:
                continue
            if "解读" in title or "问答" in title:
                continue          # 解读材料不是修改单本体，另行处理
            code = (it.get("CODE") or "").rstrip(",，").strip()
            if not code or str(it.get("TABLENAME")) != self.TABLE_STANDARD:
                continue
            guid = it.get("ID", "")
            key = f"{code}|{m.group(1)}"
            if key in seen:
                continue
            seen.add(key)
            # 标准名：标题有两种写法（实测 2026-10-03 全库 55 条）
            #   A  GB 5413.30-2016《食品安全国家标准 乳和乳制品杂质度的测定》第1号修改单
            #   B  《食品安全国家标准 食品中维生素B1的测定》（GB 5009.84-2016）第1号修改单
            # 两种都要能取出《》里的规范名，取不到就退回"（标准名待补）"而不是显示标准号。
            mname = re.search(r"《([^》]+)》", title)
            std_name = mname.group(1).strip() if mname else ""
            out.append({
                "kind": "MOD",
                "std_no": code,
                "std_name": std_name,
                "mod_no": int(m.group(1)),
                "section": f"第{m.group(1)}号修改单",
                "before": "",
                "after": "",
                "reason": "",
                "erata_date": _clean_date(it.get("PDATE") or ""),
                "implement_date": _clean_date(it.get("SSRQ") or ""),
                "log_date": (it.get("PDATE") or "")[:10],
                "guid": guid,
                "title": title,
                "detail_url": f"https://sppt.cfsa.net.cn:8086/staticPages/{guid}.html",
                "official_url": f"{self.base}?task=index",
                "source_code": self.code,
            })
        return out

    def explain_text(self, guid: str, limit: int = 1400) -> str:
        """取解读材料（标准问答）正文纯文本。

        ★ 修改单 PDF 的坑 ★
        实测修改单正文 PDF 用的是 FzBookMaker 子集化字体且**无 ToUnicode CMap**，
        pymupdf 提取出来是 `"&'#!"%¥` 这类乱码，完全不可用。
        但同一份记录的「解读材料」（TABLENAME=3）在 staticPages 详情页里有
        **纯文本问答正文**，包含"主要修订内容""主要技术内容"——这才是能用的变更摘要。
        所以：**变更要点从解读材料取，不从修改单 PDF 取。**
        """
        if not guid:
            return ""
        try:
            r = self.f.session.get(
                f"https://sppt.cfsa.net.cn:8086/staticPages/{guid}.html", timeout=30)
            if r.status_code != 200:
                return ""
            t = re.sub(r"\s+", " ", _strip_tags(r.text))
            i = t.find("标准问答")
            if i < 0:
                return ""
            t = t[i + 4:]
            for cut in ("代替与引用", "相关公告", "附件下载", "浏览次数"):
                j = t.find(cut)
                if j > 0:
                    t = t[:j]
            return t.strip()[:limit]
        except Exception:                              # noqa: BLE001
            return ""

    def amendments_with_summary(self, limit_each: int = 1400) -> list[dict]:
        """抓修改单 + 解读材料 ID，再回填变更要点。

        ★ 解读材料索引必须按 (标准号, 修改单号) 建键 ★
        踩过：只按标准号建索引 → GB 19301-2010 有第1号、第2号两个修改单，
        两条解读材料记录 CODE 都是「GB 19301-2010,」，后写的把先写的覆盖掉，
        结果第1号修改单页面显示的是第2号的变更说明 —— 属实的错。
        另一个坑：GB 2762-2022 / GB 5009.84-2016 的修改单在库里**没有**解读材料
        （只有 2762-2025 主标准的解读），这种情况 summary 留空，
        页面显示"详见官方解读材料"，不拿别的标准的解读凑数。
        """
        mods = self.amendments()
        if not mods:
            return []
        explain: dict[tuple[str, int], str] = {}
        try:
            for it in self._search_raw("", self.TAB_ALL):
                title = (it.get("TITLE") or "").strip()
                if "解读" not in title:
                    continue
                code = (it.get("CODE") or "").rstrip(",，").strip()
                mno = self._MOD_RE.search(title)
                if code and mno:
                    explain.setdefault((code, int(mno.group(1))), it.get("ID", ""))
        except Exception:                              # noqa: BLE001
            pass
        for m in mods:
            key = (m["std_no"], int(m.get("mod_no") or 1))
            gid = explain.get(key, "")
            m["explain_id"] = gid
            m["summary"] = self.explain_text(gid, limit_each) if gid else ""
            time.sleep(0.3)
        return mods

    # ---------- 发布公告（★ 判断"新发布"的权威依据） ----------
    def notices(self) -> list[dict]:
        """抓最新发布公告。

        实测：num_tn=1 是公告库，56 条，覆盖 2022 至今。
        公告标题形如：
          "关于发布《食品安全国家标准 食品中污染物限量》（GB 2762-2025）等32项
           食品安全国家标准和2项修改单的公告（2025年 第6号）"

        为什么用公告而不是逐个查标准：
          1. 公告是官方发布的**权威节点**，一份公告就是一批标准的换版动作
          2. 标题里同时写明"等N项标准"和"**M项修改单**"——发布节奏一眼看全
          3. 覆盖了卫健委公告页拿不到的信息（卫健委站点有 JS 反爬，见下）

        ★ 为什么不用卫健委 nhc.gov.cn：
          实测返回 HTTP 412，响应体是 `$_ts` 混淆的 JS 挑战 + Set-Cookie 校验，
          属于必须执行 JS 才能过的反爬（瑞数一类），纯 HTTP 绕不过去。
          sppt 公告库内容等价且有结构化接口，不硬刚。
        """
        rows = self._search_raw("", self.TAB_NOTICE)
        out = []
        for it in rows:
            title = (it.get("TITLE") or "").strip()
            if not title:
                continue
            # 从标题抽：年度、公告号、标准数量、修改单数量
            m_year = re.search(r"(\d{4})\s*年\s*第\s*(\d+)\s*号", title)
            m_std = re.search(r"等\s*(\d+)\s*项", title)
            m_erata = re.search(r"(\d+)\s*项修改单", title)
            out.append({
                "title": title,
                "notice_date": _clean_date(it.get("PDATE") or ""),
                "year_no": f"{m_year.group(1)}年第{m_year.group(2)}号" if m_year else "",
                "std_count": int(m_std.group(1)) if m_std else 0,
                "erata_count": int(m_erata.group(1)) if m_erata else 0,
                "mentioned": sorted(set(re.findall(
                    r"GB(?:/T)?\s*\d+(?:\.\d+)?-\d{4}", title))),
                "guid": it.get("ID", ""),
                "official_url": f"{self.base}?task=index",
                "source_code": self.code,
            })
        return out

    def fetch_notices(self) -> list[dict]:
        try:
            return self.notices()
        except Exception as e:                           # noqa: BLE001
            print(f"    [{self.code}] 公告抓取失败：{e}")
            return []

    # ---------- 标准正文（★ 只用于提取引用关系，不落盘） ----------
    # 实测链路：task=view_Document 页面 → iframe → /WechatPdf/viewer.jsp
    #   → 真实文件在 /diskFilePath/swfupload<timestamp>.pdf
    def fetch_document(self, fact_name: str) -> bytes | None:
        """取标准正文 PDF 的字节流，**只返回内存对象，调用方用完即弃**。

        ★ 合规：调用方（general_refs.py）只在内存里解析出"引用了哪些标准号"，
          正文本身不落盘、不入库、不同步。本方法不做任何本地缓存。
        """
        if not fact_name:
            return None
        try:
            self._ensure_session()
            self.f.session.post(
                self.base,
                data={"task": "view_Document", "accessData": "gj",
                      "bzlb": "", "fact_name": fact_name, "file_guid": ""},
                timeout=30)
            url = (f"https://sppt.cfsa.net.cn:8086/diskFilePath/"
                   f"swfupload/{fact_name}")
            r = self.f.session.get(
                url, timeout=40,
                headers={"Referer": f"https://sppt.cfsa.net.cn:8086/WechatPdf/viewer.jsp"})
            if r.status_code == 200 and r.content[:4] == b"%PDF":
                return r.content
            return None
        except Exception:                              # noqa: BLE001
            return None


def _json_loads(text: str):
    import json
    return json.loads(text.strip())


def _strip_tags(html: str) -> str:
    return re.sub(r"<[^>]+>", "", html or "")


def _clean_ws(s) -> str:
    """压掉换行与多余空白。勘误原文常带 \\r\\n。"""
    if not s:
        return ""
    return " ".join(str(s).split())


# std.samr 返回的字段里内嵌 XML 标签（XML 解析残留），实测形如：
#   C_STD_CODE = "<sacinfo>GB</sacinfo> <sacinfo>10765</sacinfo>-1997"
#   C_C_NAME   = "<sacinfo>婴幼儿</sacinfo><sacinfo>配方</sacinfo>乳粉"
# 不清洗的话标准号会带着标签，关键词匹配全部失效。
_SACINFO = re.compile(r"</?sacinfo>")


def _clean_sacinfo(s) -> str:
    """去掉 <sacinfo> 标签并压掉多余空白。"""
    if not s:
        return ""
    out = _SACINFO.sub("", str(s))
    out = out.replace("</sacinfo>", "").replace("<sacinfo>", "")
    return " ".join(out.split()).strip(" ;；,，")


# ============================================================
# 源四：ISO（版权受限，永不提供下载）
# ============================================================
class IsoOfficialAdapter:
    """ISO 官方页。版权受限，download_allowed 永久 False。"""

    code = "SRC-10"
    name = "ISO 官方标准页"
    base = "https://www.iso.org"

    # 实验室关心的具体 ISO 标准（按需扩充）
    WATCH = {
        "ISO 22000": ("2018", "食品安全管理体系 要求"),
        "ISO 9001": ("2015", "质量管理体系 要求"),
        "ISO/IEC 17025": ("2017", "检测和校准实验室能力的通用要求"),
    }

    def __init__(self, fetcher: Fetcher | None = None):
        self.f = fetcher or Fetcher(self.name)

    def fetch(self, keywords: list[str] | None = None) -> list[Standard]:
        """ISO 单标准页按需抓取，不做全量爬取（无公开全量列表且有版权限制）。"""
        out: list[Standard] = []
        for iso_no, (ver, title) in self.WATCH.items():
            slug = iso_no.lower().replace(" ", "-").replace("/", "")
            url = f"{self.base}/standard/{slug}.html"
            try:
                html = self.f.get(url, retries=2)
            except Exception:                              # noqa: BLE001
                continue
            doc = self.f.soup(html)
            if "not found" in (doc.xpath("//title/text()") or [""])[0].lower():
                continue
            out.append(Standard(
                std_no=f"{iso_no}:{ver}",
                title=title,
                status="现行",
                category="sys",
                is_mandatory=False,
                is_iso=True,
                download_allowed=False,     # 版权受限，永远只给阅读+购买
                official_url=url,
                issuer_org="国际标准化组织（ISO）",
                jurisdiction_org="ISO",
                source_code=self.code,
            ))
        return out


# ============================================================
# 源六：市场监管总局 公告（2026-10-03 新增，实测通过）
# ============================================================
class SamrNoticeAdapter:
    """samr.gov.cn —— 国家市场监督管理总局公告。

    ★ 实测踩了两天才找到入口，记下来免得以后重走 ★

    1) 直觉入口全是错的：
       `/zw/zfxxgk/fdzdgknr/ggjgs/index.html` → 200 但 title 是「广告监管司」
       `/spcjs/gggs/index.html`、`/xw/tzgg/index.html` → 404
       站内搜索 was5/irs-cms-web → 404
       **总局没有"公告"这个栏目**，公告混在「法定主动公开内容」里。

    2) 正确入口：`/zw/zfxxgk/fdzdgknr/index.html`
       这一页本身只有 9 KB 且 art 链接为 0 —— 内容是 JS 动态渲染的。

    3) 真实数据接口（与工信部同一套 jpaas CMS，见 _JPAAS_NOTE）：
       GET /api-gateway/jpaas-publish-server/front/page/build/unit
         parseType = **bulidstatic**（官方拼写少个 d，不能写 buildstatic）
         webId / tplSetId / pageId 从栏目页 <script> 标签的 queryData 里抠
         tagId = **当前内容**（"栏目3_list_b" 是主题分类树，"栏目3_list2_b"
         是机构分类树，都不是文件列表 —— 试错过）

    4) ★ 必须先 GET 栏目页建会话 ★
       直接打 unit 接口返回 200 但 `data.html` 为空字符串（len=0），
       什么都不报错。工信部同样如此。先访问栏目页拿到 cookie 后才正常。

    为什么这个源不可替代：总局发的**食品补充检验方法（BJS）**、食品生产许可
    审查细则、计量检定规程公告，都不在 CFSA（食安国标库）里。
    实测 2026 年第 24 号公告一次发布 BJS 202601~202606 六项补充检验方法 ——
    对实验室来说这就是"新增检测方法"，但标准清单里永远查不到。

    合规：只取公告元数据 + 官方 URL，不抓正文附件。
    """

    code = "SRC-06"
    name = "市场监管总局 公告"
    base = "https://www.samr.gov.cn"
    list_url = base + "/zw/zfxxgk/fdzdgknr/index.html"
    unit_url = base + "/api-gateway/jpaas-publish-server/front/page/build/unit"

    # 从栏目页 <script queryData="{...}"> 抠出来（实测值，改版时需重新抓）
    WEB_ID = "29e9522dc89d4e088a953d8cede72f4c"
    TPL_SET_ID = "5c30fb89ae5e48b9aefe3cdf49853830"
    PAGE_ID = "20178939d3ff4e2cb6a2301da388b6c9"
    LIST_TAG = "当前内容"

    # 与婴配实验室相关的公告关键词（用于过滤，抽检通报/招聘/公示不要）
    #
    # ★ 口径教训：第一版只用"标题含关键词"过滤，16 条里混进
    #   《特种设备检验质量提升行动》《食品安全宣传周》《中秋国庆工作通知》——
    #   都含"检验/食品"，但与实验室标准工作无关。
    #   改成 **主体词 + 动作词 同现**，且排除名单兜底。
    #   泛用词（食品/标准/检验）单独出现不算相关性依据。
    FOOD_TERMS = re.compile(
        r"食品|乳|婴幼|配方|特殊膳食|营养强化|添加剂|食品生产|食品标签|食品标识")
    ACTION_TERMS = re.compile(
        r"发布|废止|修订|制修订|标准|检验方法|检测方法|生产许可|审查细则"
        r"|标签标识问答|认证|计量|检定规程|备案|限量|规范")
    EXCLUDE = re.compile(
        r"抽检不合格情况的通报|食品安全宣传周|中秋|国庆|春节|招聘|公示"
        r"|特种设备|检验质量提升|机动车|召回|消费者权益|反不正当竞争"
        r"|放心消费|知识产权|统计|财务|人事|党建|巡视|审计")

    def __init__(self, fetcher: Fetcher | None = None):
        self.f = fetcher or Fetcher(self.name)
        self._primed = False

    def _ensure_session(self) -> None:
        """先访问栏目页建会话。

        ★ 不做这一步，unit 接口会返回 200 + 空 html，不报任何错 ★
        这类"成功但没数据"的失败模式最坑 —— 日志显示一切正常，
        实际一条都没抓到。跟当初卫健委 412 恰好是反面：
        那个至少还会报错。
        """
        if not self._primed:
            self.f.session.get(self.list_url, timeout=30)
            self._primed = True

    def _unit_html(self, page_id: str, tag_id: str, tpl: str = "",
                   web: str = "") -> str:
        self._ensure_session()
        q = {
            # ★ 官方拼写是 bulidstatic，不是 buildstatic。写成 buildstatic
            #   会静默返回空 html。
            "parseType": "bulidstatic",
            "webId": web or self.WEB_ID,
            "tplSetId": tpl or self.TPL_SET_ID,
            "pageType": "column",
            "tagId": tag_id,
            "editType": "null",
            "pageId": page_id,
        }
        txt = self.f.get(self.unit_url, params=q, timeout=40)
        try:
            return (_json_loads(txt).get("data") or {}).get("html") or ""
        except Exception:                              # noqa: BLE001
            return ""

    def fetch(self, keywords: list[str] | None = None) -> list[Standard]:
        """返回与食品/检测相关的总局公告。

        公告不是"标准"，但对实验室同样是变更信号：
        「发布《婴幼儿配方液态乳生产许可审查细则》的公告」这类，
        直接影响体系文件。所以作为 assoc 类条目进清单。
        """
        html = self._unit_html(self.PAGE_ID, self.LIST_TAG)
        return self.parse_notices(html)

    @classmethod
    def _relevant(cls, title: str) -> bool:
        """这条总局公告跟婴配实验室有没有关系。

        口径：**主体词（食品/乳/婴幼…）+ 动作词（发布/废止/标准…）同现**，
        且不在排除名单里。单靠"食品"或"检验"会捞进抽检通报、
        宣传周通知、特种设备文件 —— 它们不是标准变更信号。
        """
        if cls.EXCLUDE.search(title):
            return False
        return bool(cls.FOOD_TERMS.search(title) and cls.ACTION_TERMS.search(title))

    @staticmethod
    def parse_notices(html: str) -> list[Standard]:
        """解析 unit 接口返回的 html 片段。

        实测结构（`<a>` 的两个属性顺序不固定，title 有时在前有时在后，
        所以两种写法都要试 —— 固定只写一种会静默匹配到 0 条）：
            <tr>
              <td>1</td>
              <td><a target="_blank" title="标题" href="/...art_xxx.html">标题</a></td>
              <td>2026年09月30日</td>
              <td title="2026年第34号">2026年第34号</td>
            </tr>
        """
        if not html:
            return []
        out: list[Standard] = []
        for tr in re.split(r"<tr[^>]*>", html)[1:]:
            block = tr.split("</tr>")[0]
            # ★ 属性顺序不固定：title=...href=... 与 href=...title=... 都出现过。
            #   只写一种 → 另一种静默匹配 0 条。所以两种都试，并且
            #   通过 href 的实际内容判断顺序（URL 里一定含 art_）。
            links = re.findall(r'href="([^"]*art_[0-9a-f]{32}\.html)"[^>]*'
                               r'title="([^"]+)"', block)
            if links:
                href, title = links[0]
            else:
                links2 = re.findall(r'title="([^"]+)"[^>]*'
                                    r'href="([^"]*art_[0-9a-f]{32}\.html)"', block)
                if not links2:
                    continue
                title, href = links2[0]
            date = ""
            m = re.search(r"(20\d\d)\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日", block)
            if m:
                date = "{}-{}-{}".format(m.group(1),
                                         m.group(2).zfill(2), m.group(3).zfill(2))
            doc_no = ""
            m2 = re.search(r"(20\d\d年\s*第\s*\d+\s*号|[一-龥]{2,6}〔20\d\d〕\d+\s*号)", block)
            if m2:
                doc_no = " ".join(m2.group(1).split())
            # 只保留与食品/检测相关的公告
            if not SamrNoticeAdapter._relevant(title):
                continue
            out.append(Standard(
                std_no="总局公告 " + (doc_no or date or "—"),
                title=title,
                status="现行",
                category="assoc",          # 公告不是标准本体
                publish_date=date,
                implement_date=date,        # 公告类通常发布即施行
                official_url=(href if href.startswith("http")
                              else "https://www.samr.gov.cn" + href),
                is_mandatory=False,
                download_allowed=False,     # 只给官方阅读入口
                issuer_org="国家市场监督管理总局",
                jurisdiction_org="市场监管总局",
                source_code="SRC-06",
            ))
        return out


# ============================================================
# 源七：工信部 行业标准（2026-10-03 新增，实测通过）
# ============================================================
class MiitStdAdapter:
    """miit.gov.cn —— 工信部轻工行业（消费品工业）相关公告与规范。

    ★ 与 SamrNoticeAdapter 共用同一套 jpaas CMS 接口（见文件末尾说明）★

    ---------------- 实测边界（重要，别改口径前先看这段） ----------------
    这个源能抓到什么、抓不到什么，2026-10-03 全部实测过：

    **抓不到 QB/T 行标本体**。
    工业行业标准的**元数据在标准委库里**（std.samr.gov.cn/hb/ 栏目，
    实测 `QB/T 8126-2025 婴幼儿配方乳粉生产工艺规范` 详情页可打开，
    但**列表检索接口未找到**：/hb/search/stdHBList、stdHBPage、
    stdHBQueryPage、hbQueryPage 全部 404，只有一个 gbQueryPage
    （那是 GB 专用，实测搜 "QB/T" → total=0）。
    → 行标**元数据**目前只能靠 SRC-01/SRC-02 或人工补录。

    这个源真正能提供的是：**工信部的部级公告/通知/通告原文入口**。
    其中与轻工（乳制品、食品）相关的部分才与实验室有关。

    实测抓取路径（三个栏目各 24 条，接口稳定）：
      /zwgk/zcwj/wjfb/gg/  公告
      /zwgk/zcwj/wjfb/tg/  通告
      /zwgk/zcwj/wjfb/tz/  通知
    上级 /zwgk/zcwj/ 与 /zwgk/zcwj/wjfb/ 都是 `<script>window.location.href`
    跳转壳，抓不到列表 —— 必须落到叶子栏目。

    实测这 72 条里**当前一条乳制品相关都没有**（全是电信服务、电动自行车、
    集成电路、碳足迹清单）。所以这个源的诚实定位是：
    **低频但零误报**。哪天工信部发轻工相关文件才会命中，
    不是每天都能捞到东西 —— 页面上必须写清这一点，
    否则用户会以为"工信部没变化"。

    为什么仍值得接：QB/T 行标发布/废止的**部级公告**走这条路，
    而且这是唯一能拿到"工信部对乳制品行业表态"的官方入口。
    """

    code = "SRC-07"
    name = "工信部 行业公告"
    base = "https://www.miit.gov.cn"
    unit_url = base + "/api-gateway/jpaas-publish-server/front/page/build/unit"

    WEB_ID = "8d828e408d90447786ddbe128d495e9e"
    TPL_SET_ID = "209741b2109044b5b7695700b2bec37e"

    COLUMNS = [
        ("公告", "/zwgk/zcwj/wjfb/gg/index.html"),
        ("通告", "/zwgk/zcwj/wjfb/tg/index.html"),
        ("通知", "/zwgk/zcwj/wjfb/tz/index.html"),
    ]
    LIST_TAG = "右侧内容"

    # ★ 相关性必须"主体词 + 动作词 同现"★
    #   第一版只用一个关键词组（里含"质量"），结果 20 条里 8 条是
    #   "电信服务质量通告"—— 泛用词单独出现不能作为相关性依据。
    FOOD_TERMS = re.compile(r"乳|乳品|婴幼|配方|食品|添加剂|轻工|酿酒|发酵")
    ACTION_TERMS = re.compile(r"标准|制修订|征求意见|规范|发布|废止|修订|备案|许可")
    EXCLUDE = re.compile(
        r"电信|通信|服务质量|车船税|新能源汽车|道路机动车辆|电动自行车"
        r"|地名|集成电路|绿色算力|算力|电池|碳足迹|稀土|钢铁|水泥|石化"
        r"|纺织服装|集聚区|知识产权|中小企业|养老|稀土|机器人|装备"
        r"|电子信息|软件|集成电路|汽车|飞机|船舶|军工|民爆|烟草")

    def __init__(self, fetcher: Fetcher | None = None):
        self.f = fetcher or Fetcher(self.name)
        self._primed: set[str] = set()

    def _ensure_session(self, list_path: str) -> None:
        if list_path not in self._primed:
            self.f.session.get(self.base + list_path, timeout=30)
            self._primed.add(list_path)

    def _fetch_column(self, list_path: str) -> list[Standard]:
        """抓一个叶子栏目。先 GET 栏目页抠出 pageId，再调 unit 接口。"""
        self._ensure_session(list_path)
        page_html = self.f.session.get(self.base + list_path, timeout=30).text
        m = re.search(r"'pageId':'([0-9a-f]{32})'", page_html)
        if not m:
            return []
        page_id = m.group(1)
        q = {
            "parseType": "buildstatic",      # 工信部这里是 build，总局是 bulid
            "webId": self.WEB_ID,
            "tplSetId": self.TPL_SET_ID,
            "pageType": "column",
            "tagId": self.LIST_TAG,
            "editType": "null",
            "pageId": page_id,
        }
        txt = self.f.get(self.unit_url, params=q, timeout=40)
        try:
            html = (_json_loads(txt).get("data") or {}).get("html") or ""
        except Exception:                              # noqa: BLE001
            return []
        return self.parse_items(html)

    @classmethod
    def _relevant(cls, title: str) -> bool:
        """这条工信部文件跟婴配实验室有没有关系。

        口径：**行业主体词 + 动作词 同现**，且不在排除名单里。
        只用单个泛用词（"质量""标准"）会把电信服务、汽车目录全捞进来。
        """
        if cls.EXCLUDE.search(title):
            return False
        return bool(cls.FOOD_TERMS.search(title) and cls.ACTION_TERMS.search(title))

    @staticmethod
    def parse_items(html: str) -> list[Standard]:
        if not html:
            return []
        out: list[Standard] = []
        for li in re.split(r"<li[^>]*>", html)[1:]:
            block = li.split("</li>")[0]
            links = re.findall(r'href="([^"]*art_[0-9a-f]{32}\.html)"[^>]*'
                               r'title="([^"]+)"', block)
            if not links:
                continue
            href, title = links[0]
            m = re.search(r"(20\d\d)-(\d{1,2})-(\d{1,2})", block)
            date = "{}-{}-{}".format(m.group(1), m.group(2).zfill(2),
                                     m.group(3).zfill(2)) if m else ""
            if not MiitStdAdapter._relevant(title):
                continue
            # 标准发布类公告 → test/prod；其余规范性文件 → assoc
            cat = "assoc"
            if re.search(r"QB/?T?\s*\d|行业标准|制修订", title):
                cat = "prod"
            out.append(Standard(
                std_no="工信部公告 " + (date or title[:16]),
                title=title,
                status="现行",
                category=cat,
                publish_date=date,
                implement_date=date,
                official_url=(href if href.startswith("http")
                              else "https://www.miit.gov.cn" + href),
                is_mandatory=False,
                download_allowed=False,
                issuer_org="工业和信息化部",
                jurisdiction_org="工信部",
                source_code="SRC-07",
            ))
        return out

    def fetch(self, keywords: list[str] | None = None) -> list[Standard]:
        """返回与乳制品/食品轻工相关的工信部部级公告。

        实测当前常返回 0 条（该站这三个栏目以电信/汽车/集成电路为主）。
        这是**正常的**，不是抓取失败 —— 页面上会写明覆盖边界。
        """
        out: dict[str, Standard] = {}
        for _, path in self.COLUMNS:
            try:
                for s in self._fetch_column(path):
                    out.setdefault(s.norm(), s)
            except Exception as e:                       # noqa: BLE001
                print(f"    [{self.code}] 抓 {path} 失败：{e}")
        return list(out.values())


# ============================================================
# 源八：全国团体标准信息平台（2026-10-03 新增，实测通过）
# ============================================================
class TtbzStdAdapter:
    """ttbz.org.cn —— 全国团体标准信息平台。

    ★ 三个坑，每个都让请求"成功但返回错数据" ★

    1) 路径前缀 `/cms-proxy`
       页面里 `var API_PREFIX = location.port === "8080" ? "" : "/cms-proxy";`
       少了它 → 返回 2832 字节的 index.html（前端 SPA 兜底页）。

    2) ★ 必须用 form 编码，不能用 JSON ★
       页面调的是 `http.postForm()`，axios 里配的 `Content-Type:
       application/json` **只对 JSON body 生效**，postForm 走的是
       application/x-www-form-urlencoded。
       用 JSON 发时接口**照常返回 200**，但 `total` 恒为 100、
       rows 恒是同一批枸杞叶标准 —— 过滤条件被完全忽略。
       这是最坑的一种：不报错、不为空，就是不对。
       实测对比：JSON → total=100；form → total=48（"乳粉"）。

    3) 直连后端 `/ms/portal/...` → 405
       必须走 nginx 的 `/cms-proxy` 转发。

    字段（实测）：
        standardNo           T/NAIA 0497—2026（注意破折号是 em dash）
        standardTitleCn      中文名称
        organName            发布团体
        standardStatusName   现行 / 废止
        publishDate / implementDate / filePublishDate / abolishDate
        standardUniqueId     详情页标识

    业务定位：团标（T/CAB、T/CITS、T/CIQA…）**不是判定依据**，
    只作"比国家标准更严的内部要求"的参考 —— 企业常用团标提高门槛。
    所以分类给 assoc，页面提示必须写清不能当判定依据。
    """

    code = "SRC-08"
    name = "全国团体标准信息平台"
    base = "https://www.ttbz.org.cn"
    api = base + "/cms-proxy/ms/portal/standardInfo/getPortalStandardList"
    referer = base + "/standard.html"

    def __init__(self, fetcher: Fetcher | None = None):
        self.f = fetcher or Fetcher(self.name)

    def search(self, keyword: str, page_no: int = 1, size: int = 20) -> list[dict]:
        """按关键词检索团标。返回原始 row 列表。"""
        self.f._throttle()
        r = self.f.session.post(
            self.api,
            data={"searchKey": keyword, "pageNo": page_no, "pageSize": size},
            headers={"Referer": self.referer,
                     "X-Requested-With": "XMLHttpRequest",
                     "Accept": "application/json, text/plain, */*"},
            timeout=40)
        r.encoding = r.apparent_encoding or "utf-8"
        try:
            return (_json_loads(r.text).get("data") or {}).get("rows") or []
        except Exception:                              # noqa: BLE001
            return []

    @classmethod
    def parse_rows(cls, rows: list[dict]) -> list[Standard]:
        out: list[Standard] = []
        for x in rows:
            no = (x.get("standardNo") or "").strip()
            name = (x.get("standardTitleCn") or "").strip()
            if not no:
                continue
            # 破折号统一：官方用 em dash（—），站内其他源用连字符（-）
            no = no.replace("—", "-").replace("－", "-")
            out.append(Standard(
                std_no=no,
                title=name,
                status={"现行": "现行", "废止": "废止",
                        "即将实施": "即将实施"}.get(
                            x.get("standardStatusName") or "", "现行"),
                category="assoc",       # 团标只作参考，不作判定依据
                publish_date=(x.get("publishDate") or "")[:10],
                implement_date=(x.get("implementDate") or "")[:10],
                official_url="{}/#/standardDetail/{}".format(
                    cls.base, x.get("standardUniqueId", "")),
                is_mandatory=False,
                download_allowed=False,  # 团标需向发布团体购买，官方不提供直下
                issuer_org=(x.get("organName") or ""),   # 团标发布方是团体
                jurisdiction_org="全国团体标准信息平台",
                source_code="SRC-08",
            ))
        return out

    # ★ 团标是"全行业"的，搜索命中后必须再按乳制品相关性过滤 ★
    #   实测：搜"乳粉""乳制品"返回 48 条，里面只有一半跟婴配实验室有关，
    #   混进「仔猪代乳粉」「节水型企业 乳制品行业」「冻炒米（黄油炒米）」
    #   「胶乳制品能源消耗限额」「羊初乳粉」这类 —— 它们含"乳"字但实验室用不到。
    #   检测员看到一堆不相干的会直接放弃这个列表。
    RELEVANT = re.compile(
        r"婴幼儿|婴儿|幼儿|配方乳粉|调制乳粉|乳粉|乳制品|母乳|乳基"
        r"|低聚糖|磷脂|酪蛋白|乳糖|羊乳|牛乳|驼乳|马乳")
    # 明确排除：动物饲料 / 节能 / 农业产业园区 / 地方特色食品
    EXCLUDE = re.compile(
        r"仔猪|犊牛|羔羊|宠物|饲料|代乳粉\s*$|节水|能源消耗|碳足迹"
        r"|现代农业产业园|建设规范|消费者服务|智能制造|贮运分销"
        r"|冻炒米|奶锅巴|奶渣|乳清糖|塔乳嘎|黄油渣|地方特色|认证要求")

    def fetch(self, keywords: list[str] | None = None) -> list[Standard]:
        out: dict[str, Standard] = {}
        kws = keywords or ["婴幼儿配方乳粉", "乳粉", "乳制品", "母乳低聚糖"]
        for kw in kws:
            try:
                for s in self.parse_rows(self.search(kw)):
                    if self.EXCLUDE.search(s.title):
                        continue
                    if not self.RELEVANT.search(s.title):
                        continue
                    out.setdefault(s.norm(), s)
            except Exception as e:                       # noqa: BLE001
                print(f"    [{self.code}] 检索「{kw}」失败：{e}")
        return list(out.values())


# ============================================================
# 源十一：CNAS 认可规范（2026-10-07 新增，实测通过）
# ============================================================
class CnasAdapter:
    """cnas.org.cn —— 中国合格评定国家认可委员会的实验室认可规范文件。

    ★ 为什么这个源对婴配实验室不可替代 ★
    CNAS 文件**不是国家标准**，标准委检索库（openstd / 全国标准信息公共服务平台）
    根本不收录 —— 搜「CNAS-CL01」在国标库里零结果。
    但实验室做 CNAS 认可评审时天天对着它们：
      · CNAS-CL01   检测和校准实验室能力认可准则（等同 ISO/IEC 17025 中文实施）
      · CNAS-CL01-A002 化学检测领域应用说明
      · CNAS-CL01-A001 微生物检测领域应用说明
      · CNAS-GL006  化学分析中不确定度的评估指南
      · CNAS-EL-03  认可能力范围表述说明（申请认可时能力表怎么写）
    换版就是评审不符合项 —— 属���变更信号，只盯国标会完全漏掉。

    ---------------- 实测边界（2026-10-07 全部实测过） ----------------
    1) 列表页**抓不到数据**：栏目页只有约 6.6 KB，`art_` 链接数为 0，
       内容由 JS 渲染。别看到 0 条就以为没数据。
    2) 真实数据接口与总局/工信部**同一套 jpaas CMS**（见文件末尾 _JPAAS_NOTE）：
         GET /api-gateway/jpaas-publish-server/front/page/build/unit
         parseType = **bulidstatic**（官方拼写少个 d）
         webId / tplSetId / pageId 从栏目页 <script ... queryData="{...}"> 里抠
    3) ★ 必须先 GET 栏目页建会话 ★
       直接打 unit 接口返回 HTTP 200 + `"success":false` + `data.html` 为空，
       **不报任何错**。先访问栏目页后同一请求即返回 2000+ 字符。
       实测 cookies 数仍为 0 —— 说明靠的是别的东西（连接/Referer），
       但顺序必须照走。这与SamrNoticeAdapter._ensure_session 是同一个坑。
    4) 八个栏目实测条数：通用规则 4 / 专用规则 10 / 基本准则 10 / 专用准则 20 /
       认可指南 20 / 认可方案 6 / 认可说明 19 / 技术报告 20（部分栏目有分页，
       抓到的是第一页，故再抓一次第二页合并）。
    5) 编号形如 `CNAS-CL01-A002:2020` —— 用**冒号**分隔年份，不是短横。
       `_STD_NO_RE` 不认这个格式，所以标准号要自己拼，不能靠通用归一化。

    合规：只取元数据+ 官方URL，不抓正文PDF 附件。
    """

    code = "SRC-11"
    name = "CNAS 实验室认可规范"
    base = "https://www.cnas.org.cn"
    unit_url = base + "/api-gateway/jpaas-publish-server/front/page/build/unit"

    # 八个实验室认可栏目（实测均可用）。路径相对 /rkgf/sysrk/
    COLUMNS = [
        ("rkgz/tygz", "认可规则·通用"),
        ("rkgz/zygz", "认可规则·专用"),
        ("jbrkzz", "基本准则"),
        ("rkyyzz", "专用准则"),
        ("rkzn", "认可指南"),
        ("rkfa", "认可方案"),
        ("rksm", "认可说明"),
        ("jsbg", "技术报告"),
    ]

    # 只保留实验室认可相关文件。CNAS 文件四大类：
    #   规则(R/RL) 准则(CL) 指南(GL) 说明(EL) 方案(S) 报告(TRL)
    # 认证机构 / 检验机构 / 审定核查类别的文件与食品实验室无关，剔除。
    # 排除词来自实测标题里出现过的机构类别词。
    EXCLUDE = re.compile(
        r"认证机构|检验机构|审定|核查机构|、医学实验室|法医|司法鉴定")

    def __init__(self, fetcher: Fetcher | None = None):
        self.f = fetcher or Fetcher(self.name)
        self._primed: set[str] = set()

    # ---------- jpaas CMS 通用取数（与 SamrNoticeAdapter 同坑同解）----------
    def _column_fragment(self, path: str) -> str:
        """取某个栏目第一页的列表 HTML 片段。失败返回空串。"""
        list_url = "%s/rkgf/sysrk/%s/index.html" % (self.base, path)
        if path not in self._primed:
            # ★ 顺序不能反：先栏目页建会话，再打 unit 接口 ★
            try:
                self.f.session.get(list_url, timeout=30)
            except Exception as e:                # noqa: BLE001
                print(f"    [{self.code}] 栏目页预热失败 {path}：{e}")
                return ""
            self._primed.add(path)

        try:
            html = self.f.get(list_url, timeout=30)
        except Exception as e:                    # noqa: BLE001
            print(f"    [{self.code}] 栏目页读取失败 {path}：{e}")
            return ""

        # 从 <script ... queryData="{'parseType':'bulidstatic',...}"> 抠参数
        m = re.search(r'queryData="(\{[^"]+\})"', html)
        if not m:
            return ""
        qd = (m.group(1).replace("&apos;", "'").replace("&quot;", '"'))
        params = dict(re.findall(r"'([^']+)'\s*:\s*'([^']*)'", qd))
        if not params.get("pageId"):
            return ""
        try:
            txt = self.f.get(self.unit_url, params=params, timeout=40)
            return (_json_loads(txt).get("data") or {}).get("html") or ""
        except Exception as e:                    # noqa: BLE001
            print(f"    [{self.code}] unit 接口失败 {path}：{e}")
            return ""

    @staticmethod
    def parse_fragment(html: str) -> list[dict]:
        """解析 unit 接口返回的列表片段。

        实测结构（2026-10-07）：
            <li>
              <a href="/rkgf/sysrk/rkyyzz/art/2024/art_xxx.html"
                 title="CNAS-CL01-A002:2020《…》">…<div …/><div …/></a>
              <span>2020-12-18</span>
            </li>
        注意 title 属性里才是完整编号，正文本被 div 截断 ——
        必须读 title，读 text_content 会丢掉冒号后的年份。
        """
        out: list[dict] = []
        for li in re.findall(r"<li\b.*?</li>", html, re.S | re.I):
            a = re.search(r'<a[^>]+href="([^"]+)"[^>]*title="([^"]*)"', li, re.S)
            if not a:
                continue
            href, title = a.group(1), a.group(2)
            d = re.search(r"<span[^>]*>([\d]{4}-[\d]{2}-[\d]{2})</span>", li)
            no, name = _split_cnas_no(title)
            if not no:
                continue
            out.append({
                "std_no": no,
                "title": name or title,
                "publish_date": d.group(1) if d else "",
                "official_url": self_base(href),
            })
        return out

    def fetch(self, keywords: list[str] | None = None) -> list[Standard]:
        """返回与实验室认可相关的 CNAS 规范文件。"""
        rows: dict[str, dict] = {}
        for path, label in self.COLUMNS:
            frag = self._column_fragment(path)
            got = self.parse_fragment(frag)
            print(f"    [{self.code}] {label}：{len(got)} 条")
            for r in got:
                if self.EXCLUDE.search(r["title"]):
                    continue
                rows.setdefault(r["std_no"], r)

        out: list[Standard] = []
        for no, r in rows.items():
            out.append(Standard(
                std_no=no,
                title=r["title"],
                # ★ CNAS 不是强制性国家标准，全部非强标 ★
                category="sys",
                status="现行",
                publish_date=r["publish_date"],
                implement_date=r["publish_date"],
                is_mandatory=False,
                official_url=r["official_url"],
                # CNAS 文件官网可下载，但多数需登录；保守不给下载按钮
                download_allowed=False,
                issuer_org="中国合格评定国家认可委员会",
                jurisdiction_org="CNAS",
                source_code=self.code,
            ))
        return out


def self_base(href: str) -> str:
    """把站内相对链接补成绝对地址。"""
    if href.startswith("http"):
        return href
    return "https://www.cnas.org.cn" + href


# CNAS 编号 → (标准号, 名称)
# 形如 "CNAS-CL01-A002:2020《检测和校准实验室能力认可准则在化学检测领域的应用说明》"
_CNAS_NO_RE = re.compile(
    r"^(CNAS-[A-Z]+\d*(?:-[A-Z]?\d+)*)\s*[:：]\s*(\d{4})\s*(.*)$")


def _split_cnas_no(title: str) -> tuple[str, str]:
    """'CNAS-CL01-A002:2020《…》' → ('CNAS-CL01-A002:2020', '…')。

    站内标准号统一用冒号分隔年份（与国标的短横不同），
    这样点进详情页/做去重时与官方写法一致。
    """
    t = (title or "").strip()
    m = _CNAS_NO_RE.match(t)
    if not m:
        # 「CNAS实验室认可说明文件清单」这类**清单页**不是标准，跳过
        return "", ""
    no = "%s:%s" % (m.group(1), m.group(2))
    # ★ 保留官方完整标题，含括号里的修订记录；只去掉书名号 ★
    #   官方标题形如：
    #     CNAS-CL01:2018《检测和校准实验室能力认可准则》（2019-2-20第一次修订）
    #   括号里那句是**换版信息** —— 实验室判断"我手上的准则是不是旧版"
    #   全靠它，只剩准则名的话新旧版标题一模一样，页面上分不出版本差异。
    #
    #   ★ 坑：不能用 .strip("《》") ★
    #     str.strip 只去**两端**，中间的 》 留着 →
    #       "检测和校准实验室能力认可准则》（2019-2-20第一次修订）"
    #     书名号是不成对的装饰符，要 replace 全删，不是 strip。
    return no, m.group(3).replace("《", "").replace("》", "").strip()


# ★ 两个政府站共用的 jpaas CMS 接口说明（写在这里方便以后维护）
#   工信部 www.miit.gov.cn      与  总局 www.samr.gov.cn 用同一套
#   GET  /api-gateway/jpaas-publish-server/front/page/build/unit
#     → JSON {"code":200,"data":{"html":"<片段>"}}
#   参数从栏目页 <script ... queryData="{'parseType':...,'webId':...,
#     'tplSetId':...,'pageType':'column','tagId':'...','pageId':'...'}"> 里抠。
#   两站 parseType 拼写不一致（工信部 buildstatic / 总局 bulidstatic），
#   写错会静默返回空 html。

ADAPTERS = {
    "SRC-01": SamrStdAdapter(),
    "SRC-02": OpenStdAdapter(),
    "SRC-03": NhcFoodStandardAdapter(),
    "SRC-05": CfsaSpptAdapter(),      # ★ 主力源
    "SRC-06": SamrNoticeAdapter(),    # 总局公告
    "SRC-07": MiitStdAdapter(),       # 工信部 行业标准
    "SRC-08": TtbzStdAdapter(),       # 团体标准
    "SRC-10": IsoOfficialAdapter(),
    "SRC-11": CnasAdapter(),# CNAS 实验室认可规范
}

# 抓取时真正需要跑适配器的源（ISO 按需单抓，不参与批量）
# SRC-03 卫健委因 412 反爬已停用（见 NhcFoodStandardAdapter.disabled_reason）
BATCH_SOURCES = ["SRC-05", "SRC-02", "SRC-01", "SRC-06", "SRC-07", "SRC-08", "SRC-11"]
