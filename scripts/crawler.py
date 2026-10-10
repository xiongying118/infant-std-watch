#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
标准雷达 · 抓取与变更检测工作流（可执行骨架）
================================================
定位：每天跑一次，从官方源拉元数据 → 与上次快照做 diff → 生成提醒队列。
不做标准全文分发，只存元数据 + 官方链接。

合规红线（写死在代码里，别删）：
  1. 只存标准元数据（号/名/状态/日期/替代关系/官方链接），不下载、不存储标准全文 PDF；
  2. 拿不准官方是否支持免费下载 → download_allowed=False，只给"官方在线阅读"；
  3. ISO/IEC 采标类 → 永远不给下载，只给阅读 + 正版购买渠道；
  4. 单源最小间隔 4 小时，禁止秒级轮询，避免被封。

运行：
  python crawler.py --run              # 执行一次全量检查
  python crawler.py --run --source SRC-01   # 只查一个源
  python crawler.py --init-db          # 初始化 SQLite（演示用，生产用 PostgreSQL）
"""
from __future__ import annotations
import os, sys, json, re, time, hashlib, sqlite3, argparse, logging
from datetime import date, datetime, timedelta
from dataclasses import dataclass, asdict, field
from typing import Any
from urllib.parse import urljoin

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("stdwatch")

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "..", "data")
DB_PATH = os.path.join(DATA, "stdwatch.db")
SNAP_DIR = os.path.join(DATA, "snapshots")
# 每个源一次全量检查最多用多少个检索词。官方站点有频率限制，别打太狠。
# SRC-05 有结构化接口、单个查询快，给到 60（关键词表 23 + 通则引用 49 去重后约 60）；
# SRC-02 是逐词页面检索，慢，给 12。
# SRC-06/07 是"公告列表全量"型，不按关键词逐个查（内部已有相关性过滤），
#        给多少都只发一次列表请求，所以配额小也无妨。
SOURCE_QUERY_LIMIT = {
    "SRC-05": 60, "SRC-02": 12, "SRC-01": 10,
    "SRC-06": 6, "SRC-07": 6, "SRC-08": 8,
}

# ★ 各源专用的检索词（2026-10-06 新增）★
#
#   为什么必须有：全局检索词是"关键词表 + 通则引用"合出来的，
#   全是国标用语（婴幼儿配方乳粉、蛋白质…）。SRC-08是**团标库**，
#   里面存的是 T/CAB、T/CITS 这类团标 —— 拿国标用语去搜团标库，
#   一条都搜不到。
#
#   后果不是"抓不到"那么简单，而是**静默丢数据**：
#     搜不到 → 返回 0 条 → 判定"未接通" → 快照写成空 {}
#     → 下次重建data.js 时，这批数据被当成"本来就没有"而消失
#   实测丢了 33 条团标（T/CAB、T/CITS、T/CIQA…），全程无任何报错。
#
#   团标库实测有货的词（每个都能搜出 14~20 条）：
SOURCE_OWN_TERMS = {
    "SRC-08": ["乳粉", "婴幼儿配方", "婴幼儿配方乳粉", "乳制品",
                "调制乳粉", "羊乳粉", "乳业", "婴幼儿"],
}
# 官方门户兜底链接（邮件里给不出具体详情页时用）
OFFICIAL_PORTAL = "https://sppt.cfsa.net.cn:8086/db"   # 食品安全国家标准数据检索平台
# 熔断：某源连续失败到这次数，24 小时内跳过。实测卫健委 412 时白等 85 秒，
# 每天都这样等纯属浪费 —— 但也不能因为一次失败就永久停用，所以要冷却而非禁用。
SOURCE_FAIL_THRESHOLD = 3
SOURCE_COOLDOWN_H = 24
os.makedirs(SNAP_DIR, exist_ok=True)

# 抓取间隔下限（小时）——合规约束
MIN_INTERVAL_H = 4


# ============================================================
# 1. 数据结构与源适配器
#    真实抓取实现全部在 sources.py（结构来自 2026-10-03 对生产站点的实测）
# ============================================================
from sources import (                      # noqa: E402
    Standard,
    OpenStdAdapter, CfsaSpptAdapter, NhcFoodStandardAdapter,
    SamrStdAdapter, IsoOfficialAdapter,
    ADAPTERS, BATCH_SOURCES, guess_category,
)
import erata as ERATA                    # noqa: E402  标准勘误分析
import general_refs as GREF               # noqa: E402  通则引用标准


def _to_std(d: dict) -> Standard:
    """把快照 dict 还原成 Standard（快照里多了 row_hash / days_to_implement 字段）。"""
    fields = set(Standard.__dataclass_fields__.keys())
    return Standard(**{k: v for k, v in d.items() if k in fields})


def fetch_source(code: str, keywords: list[str]) -> list[Standard]:
    """跑一个源，返回该源抓到的全部标准。适配器不存在时返回空。"""
    ad = ADAPTERS.get(code)
    if ad is None:
        log.warning("源 %s 无适配器，跳过", code)
        return []
    try:
        return ad.fetch(keywords) or []
    except Exception as e:                              # noqa: BLE001
        log.error("[%s] 抓取异常：%s", code, e)
        return []


# ============================================================
# 3. 关键词匹配
# ============================================================
def load_keywords() -> list[dict]:
    """读关键词表。CSV 是中文表头，这里映射成英文字段名。"""
    import csv
    p = os.path.join(BASE, "..", "config", "keywords.csv")
    out = []
    with open(p, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            if (r.get("状态") or "").strip() != "启用":
                continue
            out.append({
                "term": r["关键词"], "category": r["类别"],
                "match_type": r["匹配方式"], "priority": r["优先级"],
                "note": r.get("说明", ""),
            })
    return out


def _std_no_match(term: str, no: str) -> bool:
    """标准号是否匹配。

    ★ 不能用 `term in no` —— 会误命中：
        订阅「GB 5009.3」（水分）会命中 GB 5009.312（多种真菌毒素）
        订阅「GB 5009.9」（还原糖）会命中 GB 5009.96（赭曲霉毒素A）
      实测这两条都真实存在于官方库，会直接造成提醒噪音。
    正确做法：按"前缀+分部号"精确比对，段内不允许前缀相同的多余数字。
    """
    t = re.sub(r"\s+", "", term).upper().rstrip("-")
    if not t:
        return False
    if t == no:
        return True
    # 允许订阅不带年份：GB 5009.3 匹配 GB5009.3-2016
    base = no.split("-")[0]
    if t == base:
        return True
    # 前缀相同且下一位不是数字才算命中（GB 5009.3 vs GB 5009.312）
    if no.startswith(t):
        nxt = no[len(t):]
        return bool(nxt) and not nxt[0].isdigit()
    return False


def match_keywords(std: Standard, kws: list[dict]) -> list[dict]:
    """返回命中的关键词列表。空列表 = 不相关，不进提醒队列。"""
    hits = []
    no, title = std.norm(), std.title or ""
    for k in kws:
        term, mtype = k["term"].strip().upper(), k["match_type"]
        cat, pri = k.get("category", ""), k.get("priority", "中")
        if mtype == "通配" and "*" in term:
            if re.fullmatch(term.replace(".", r"\.").replace(r"\.\*", ".*").replace("*", ".*"),
                            no):
                hits.append({"term": k["term"], "category": cat, "priority": pri})
        elif mtype == "精确":
            if _std_no_match(term, no) or term in title:
                hits.append({"term": k["term"], "category": cat, "priority": pri})
        else:  # 模糊
            if term in title or term in no:
                hits.append({"term": k["term"], "category": cat, "priority": pri})
    return hits


# ---- 婴配实验室真正在测的项目 ----
# 实测教训：`GB 5009.*` 通配词会一次拉回整个 5009 系列（实测 124 条），
# 其中绝大多数是食品添加剂、真菌毒素、农残残留等与婴配检测无关的方法。
# 全推给用户等于噪音，订阅就废了。
# 所以：通配命中只负责"把标准收进库"，**是否提醒**另由下面的相关性判定决定。
# 核心：实验室天天用的，必须提醒
_CORE_RELEVANT_PATTERNS = [
    # 营养成分（婴配强制标示的核心指标）
    r"蛋白", r"脂肪", r"水分|含水量", r"灰分", r"总氮|总砷|无机砷",
    r"还原糖|乳糖|总糖", r"能量", r"钙|铁|锌|钠|碘|硒|牛磺酸|左旋肉碱",
    r"维生素|烟酸|叶酸|胆碱|核黄素",
    # 安全限量（判定与否决项）
    r"污染物|限量", r"铅|砷|汞|镉|铬|氰化物|亚硝酸盐|二氧化硫",
    r"致病菌|菌落总数|大肠菌群|沙门氏菌|金黄色葡萄球菌|阪崎肠杆菌|单增李斯特",
    r"三聚氰胺|苏丹红|甲醛|双酚|壬基酚|塑化剂|邻苯二甲酸",
    r"抗生素|兽药残留|农药残留",
    # 婴配专有
    r"婴幼儿|婴儿配方|较大婴儿|幼儿配方|特殊医学用途|婴配|乳粉|母乳",
    r"过敏原|乳球蛋白|酪蛋白",
]
# 边缘：有限量要求但不是日常必做，进库不打扰
_EDGE_RELEVANT_PATTERNS = [
    r"真菌毒素|黄曲霉毒素|赭曲霉毒素|脱氧雪腐镰刀菌烯醇|展青霉素",
    r"食品添加剂|营养强化剂",
    r"抗氧化剂|着色剂|防腐剂|甜味剂",
]
_CORE_RELEVANT_RE = [re.compile(p) for p in _CORE_RELEVANT_PATTERNS]
_EDGE_RELEVANT_RE = [re.compile(p) for p in _EDGE_RELEVANT_PATTERNS]


def is_relevant(std: Standard, hits: list[dict]) -> tuple[bool, str]:
    """这条标准跟婴配实验室有没有关系。返回 (是否提醒, 原因, 权重)。

    分三档处理 —— 这是实测调出来的，不是拍脑袋：
    · 精确/模糊命中（用户主动订阅的项，如 GB 10765）→ 相关，权重 full
    · 通配命中 + 核心营养/限量指标（蛋白、脂肪、水分、铅砷、致病菌）
      → 相关，权重 core。这才是实验室天天用的
    · 通配命中 + 边缘项（真菌毒素、添加剂、农残）
      → 相关但权重 edge，收进库、只进"知悉"列表，不占提醒队列
    实测依据：不做这层区分时，一次提醒里 5/7 是真菌毒素类，订阅直接被噪音埋掉。
    """
    for h in hits:
        if "*" not in h["term"]:
            return True, f"精确订阅项「{h['term']}」", "full"

    title = std.title or ""
    for rx in _CORE_RELEVANT_RE:
        if rx.search(title):
            return True, f"核心检测指标（{rx.pattern}）", "core"
    for rx in _EDGE_RELEVANT_RE:
        if rx.search(title):
            return True, f"边缘相关（{rx.pattern}）", "edge"

    return False, "通配词命中但不在婴配检测领域，不打扰", "none"


def classify(std: Standard, hits: list[dict]) -> str:
    """分级规则（按需求固定）：
    高 = 产品标准 / 安全限量 / 强制检测方法
    中 = 生产规范 / 体系标准
    低 = 参考性、指南性、术语类
    """
    if std.category in ("product",) or std.is_mandatory:
        return "high"
    if std.category == "test":
        # GB 5009 系列（检测方法）+ 安全限量类 → 高优
        if re.search(r"GB/?T?\s*5009|GB\s*2762|GB\s*29921|GB\s*3160|GB\s*31607", std.norm()):
            return "high"
        return "mid"
    if std.category in ("prod", "sys"):
        return "mid"
    if std.category == "assoc":
        return "mid" if any(h["priority"] == "高" for h in hits) else "low"
    return "mid"


# ============================================================
# 4. 快照 + diff
# ============================================================
def init_db():
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    sql = open(os.path.join(BASE, "..", "db", "schema.sql"), encoding="utf-8").read()
    # SQLite 演示用：把 PG 方言降级。生产环境直接用 PostgreSQL/Supabase，不需要这层。
    for pg, lite in [
        ("SERIAL PRIMARY KEY", "INTEGER PRIMARY KEY"),
        ("BIGSERIAL PRIMARY KEY", "INTEGER PRIMARY KEY"),
        ("TIMESTAMPTZ", "TEXT"), ("NUMERIC", "REAL"), ("BOOLEAN", "INTEGER"),
        ("UUID", "TEXT"), ("JSONB", "TEXT"),
        ("TEXT[] DEFAULT ARRAY['inapp','email']", "TEXT DEFAULT 'inapp,email'"),
        ("TEXT[]", "TEXT"),
        ("REFERENCES standards(id)", ""), ("REFERENCES sources(id)", ""),
        ("REFERENCES change_events(id) ON DELETE CASCADE", ""),
        ("REFERENCES snapshots(id) ON DELETE CASCADE", ""),
        ("REFERENCES users(id) ON DELETE CASCADE", ""),
        ("REFERENCES keywords(id) ON DELETE CASCADE", ""),
        ("now()", "CURRENT_TIMESTAMP"),
    ]:
        sql = sql.replace(pg, lite)
    # SQLite 3.53 才认 TRUE/FALSE 关键字作默认值，老版本用 1/0 更稳
    sql = re.sub(r"DEFAULT (TRUE|FALSE)", lambda m: "DEFAULT " + ("1" if m.group(1) == "TRUE" else "0"), sql)
    con.executescript(sql)
    con.commit()
    con.close()
    log.info("数据库已初始化：%s", DB_PATH)


def _con():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def load_snapshot(source_code: str) -> dict[str, dict]:
    """读上次快照。首次运行返回空 dict。"""
    p = os.path.join(SNAP_DIR, f"{source_code}_latest.json")
    if not os.path.exists(p):
        return {}
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def save_snapshot(source_code: str, items: dict[str, dict]) -> None:
    p = os.path.join(SNAP_DIR, f"{source_code}_latest.json")
    with open(p, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=1)
    # 只留最近 30 份历史快照，便于追溯
    d = os.path.join(SNAP_DIR, source_code)
    os.makedirs(d, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    with open(os.path.join(d, f"{stamp}.json"), "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=1)


def _fmt_change(c: dict) -> str:
    """字段变化格式化：原来没值就只说"新增为 X"，不出现"空 → X"。"""
    f_, t_ = c.get("from"), c.get("to")
    if not f_ and t_:
        return f"{c['field']}新增为「{t_}」"
    if f_ and not t_:
        return f"{c['field']}由「{f_}」清空"
    return f"{c['field']} {f_} → {t_}"


# ---------- 标准勘误快照（独立于标准换版的一类变更） ----------
def load_erata_snapshot() -> list[dict]:
    """读上次抓到的勘误列表。"""
    p = os.path.join(SNAP_DIR, "erata_latest.json")
    if not os.path.exists(p):
        return []
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except Exception:                              # noqa: BLE001
        return []


def save_erata_snapshot(items: list[dict]) -> None:
    p = os.path.join(SNAP_DIR, "erata_latest.json")
    with open(p, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=1)
    d = os.path.join(SNAP_DIR, "erata")
    os.makedirs(d, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    with open(os.path.join(d, f"{stamp}.json"), "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=1)


# ---------- 首次运行基线标记 ----------
def _baseline_path() -> str:
    return os.path.join(SNAP_DIR, "_baseline_done.json")


def _baseline_done() -> bool:
    """是否已完成过首次基线。

    三条流程（标准 / 公告 / 勘误）必须共用这一个判定。
    之前各自按"自己的快照是否为空"判首次，结果出现过：
    标准流已建基线、勘误快照也被上一轮写好了 → 首次运行就把 176 条历史勘误全推出来。
    实测踩过，所以统一。
    """
    return os.path.exists(_baseline_path())


def _mark_baseline_done(counts: dict) -> None:
    with open(_baseline_path(), "w", encoding="utf-8") as f:
        json.dump({"at": datetime.now().isoformat(timespec="seconds"),
                   "counts": counts}, f, ensure_ascii=False, indent=1)
    log.info("首次基线已完成：%s", counts)


# ---------- 发布公告快照 ----------
def load_notice_snapshot() -> list[dict]:
    p = os.path.join(SNAP_DIR, "notice_latest.json")
    if not os.path.exists(p):
        return []
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except Exception:                              # noqa: BLE001
        return []


def save_notice_snapshot(items: list[dict]) -> None:
    p = os.path.join(SNAP_DIR, "notice_latest.json")
    with open(p, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=1)


def crawl_notices() -> list[dict]:
    """抓官方发布公告并生成提醒。

    为什么必须有这一步：公告是官方发布的**权威节点**，一份公告就是一批标准的
    换版动作。实测最近一份是 2026-08-18「等50项食品安全国家标准和修改单的公告
    （2026年 第6号）」—— 只按关键词逐个查标准，这种批量发布容易漏。

    公告标题还直接写明"等N项标准"和"**M项修改单**"，
    发布节奏一眼可见，不用自己去数。
    """
    ad = ADAPTERS.get("SRC-05")
    if not isinstance(ad, CfsaSpptAdapter):
        return []
    t0 = time.time()
    try:
        items = ad.fetch_notices()
    except Exception as e:                          # noqa: BLE001
        log.error("[公告] 抓取失败：%s", e)
        return []
    if not items:
        log.warning("[公告] 返回 0 条，跳过")
        return []

    old = load_notice_snapshot()
    # 首次判定用全局基线标记，不用"快照是否为空"。
    # 原因：三条流程（标准/公告/勘误）共享一个基线，若按各自的快照判首次，
    # 会出现"标准已建基线但勘误快照已存在"的错位，导致首次运行就推历史勘误。
    first_run = not _baseline_done()
    seen = {x.get("guid") for x in old if x.get("guid")}
    fresh = [x for x in items if x.get("guid") not in seen] if not first_run else []

    alerts = []
    for n in fresh:
        std_txt = f"{n['std_count']} 项标准" if n.get("std_count") else "若干标准"
        era_txt = f"，另有 {n['erata_count']} 项修改单" if n.get("erata_count") else ""
        title = f"官方发布公告（{n.get('year_no') or '—'}）：{std_txt}{era_txt}"
        body = f"{n['title']}\n发布日期：{n.get('notice_date') or '—'}"
        if n.get("mentioned"):
            body += "\n公告点名的标准：" + "、".join(n["mentioned"][:6])
        body += "\n提示：公告只列示首个标准，其余需到官方平台按关键词检索确认。"
        alerts.append({
            "std_no": "（发布公告）", "level": "mid", "title": title,
            "what_changed": body,
            "why_matters": ("官方发布的权威节点，说明这批标准已正式发布。"
                            "与你相关的部分要逐条确认实施日期并更新作业文件。"),
            "actions": ["打开官方平台按关键词检索，确认与你相关的标准是否在本次公告内",
                        "重点看公告里的「修改单」部分——修改单改的是既有标准",
                        "检查本次公告是否包含你正在用的检测方法的换版"],
            "event_type": "NOTICE",
            "dedup_key": f"NOTICE|{n.get('guid') or n.get('year_no')}",
            "official_url": n.get("official_url") or OFFICIAL_PORTAL,
            "source_code": n.get("source_code", "SRC-05"),
            "relevance": "full",
        })

    if first_run:
        log.info("[公告] 首次建基线：收录 %d 条公告（不推送）", len(items))
    else:
        log.info("[公告] 共 %d 条，新增 %d 条", len(items), len(fresh))
    save_notice_snapshot(items)

    con = _con()
    con.execute(
        "INSERT INTO crawl_logs(level,source_code,message,cost_ms) VALUES(?,?,?,?)",
        ("ok", "SRC-05-NOTICE", f"公告 {len(items)} 条，新增 {len(fresh)}",
         int((time.time() - t0) * 1000)))
    con.commit()
    con.close()
    return alerts


def crawl_erata(force: bool = False) -> list[dict]:
    """抓勘误并生成提醒。

    为什么要单独一套流程：勘误**不改标准号、不改实施日期、不再发公告**，
    只在勘误表里改一句话。按标准号做 diff 永远发现不了它。
    实验室如果照改前的原文操作，做出来的结果是错的。

    首次运行只建库不提醒（勘误库一次就是全部历史，176 条，
    全推出来等于刷屏）；之后只报新增的。
    """
    ad = ADAPTERS.get("SRC-05")
    if not isinstance(ad, CfsaSpptAdapter):
        log.info("[勘误] 主力源不可用，跳过")
        return []

    t0 = time.time()
    try:
        items = ad.fetch_erata()
    except Exception as e:                          # noqa: BLE001
        log.error("[勘误] 抓取失败：%s", e)
        return []
    if not items:
        log.warning("[勘误] 返回 0 条，跳过（接口可能变更）")
        return []

    old = load_erata_snapshot()
    first_run = not _baseline_done()
    fresh = ERATA.diff_erata(old, items) if not first_run else []
    # ★ 只对**新增**的勘误生成提醒 ★
    #   早先写成 build_erata_alerts(items)，结果第二次运行日志显示
    #   「新增 0 条」却「生成提醒 23 条」—— 没变化也照推，等于每天刷一次全量勘误。
    alerts = ERATA.build_erata_alerts(fresh) if fresh else []

    # ★ 同时抓「标准修改单」★
    #   实测踩坑（2026-10-03）：官方「标准勘误」专库**不收录修改单**。
    #   GB 5413.30-2016《乳和乳制品杂质度的测定》第1号修改单 2026-08-18 发布，
    #   勘误库里查了 176 条也没有 —— 修改单是全库检索里的独立文档。
    #   只跑勘误库 = 这一类变更 100% 漏抓，而且不报错（库是"成功"的）。
    #   修改单同样是"不改标准号、自批准之日起实施"，漏掉的代价一样大。
    mod_alerts: list[dict] = []
    try:
        mods = ad.amendments_with_summary()
        # 去重交给 push_inapp（按 dedup_key 查 change_events），这里不重复造轮子
        mod_alerts = ERATA.build_mod_alerts(mods) if mods else []
    except Exception as e:                          # noqa: BLE001
        log.error("[修改单] 抓取失败：%s", e)
    alerts.extend(mod_alerts)

    if first_run:
        log.info("[勘误] 首次建基线：收录 %d 条勘误（不推送）", len(items))
    else:
        log.info("[勘误] 共 %d 条，新增 %d 条，生成提醒 %d 条",
                 len(items), len(fresh), len(alerts) - len(mod_alerts))
    if mod_alerts:
        log.info("[修改单] 范围内新增 %d 条（已推送）", len(mod_alerts))

    save_erata_snapshot(items)

    con = _con()
    con.execute(
        "INSERT INTO crawl_logs(level,source_code,message,cost_ms) VALUES(?,?,?,?)",
        ("ok", "SRC-05-ERATA",
         f"勘误 {len(items)} 条，新增 {len(fresh)}，提醒 {len(alerts)}",
         int((time.time() - t0) * 1000)))
    con.commit()
    con.close()
    return alerts


WATCH_FIELDS = [("status", "状态"), ("implement_date", "实施日期"),
                ("publish_date", "发布日期"), ("replaced_by", "被代替为"),
                ("title", "名称"), ("abolish_date", "废止日期")]


def diff_snapshots(old: dict, new: dict, first_run: bool = False) -> list[dict]:
    """字段级 diff，输出变更事件。

    去重要点：同一个标准一次抓取可能同时变多个字段（比如状态变废止 + 出现废止日期
    + 出现替代关系）。这些**合并成一条事件**，changed 字段列出全部变化，
    否则一次换版会刷出 3-4 条提醒，正是需求里要避免的"刷屏"。

    首次建基线（first_run=True）：只建库、**不产生任何提醒**。
    否则第一次跑就会把库里 150+ 条全当"新发布"推给用户，一次性刷屏。
    基线里"即将实施"的标仍然要记，因为那是真实需要提醒的。
    """
    events = []
    for no, cur in new.items():
        prev = old.get(no)
        if prev is None:
            if not first_run:
                events.append({"type": "NEW", "std": cur, "before": None, "after": cur,
                               "changed": [], "primary": "新发布"})
            continue

        changed = [{"field": lb, "from": prev.get(f), "to": cur.get(f)}
                   for f, lb in WATCH_FIELDS if prev.get(f) != cur.get(f)]
        if not changed:
            continue

        # 状态转废止/被代替 → 主事件定为 ABOLISH（最高优先级，单独措辞）
        status_change = next((c for c in changed if c["field"] == "状态"), None)
        if status_change and cur.get("status") in ("废止", "被代替"):
            etype, primary = "ABOLISH", "已废止"
        elif status_change:
            etype, primary = "REVISION", "状态变更"
        else:
            etype, primary = "REVISION", changed[0]["field"] + "变更"

        events.append({"type": etype, "std": cur, "before": prev, "after": cur,
                       "changed": changed, "primary": primary,
                       "changed_field": changed[0]["field"],
                       "from": changed[0]["from"], "to": changed[0]["to"]})
    return events


# ============================================================
# 5. 提醒生成
# ============================================================
def dedup_key(std_no: str, etype: str, bucket: str = "") -> str:
    """去重键。同一标准同一事件类型 30 天内只提醒一次。"""
    b = bucket or (date.today() - timedelta(days=date.today().day % 30)).isoformat()
    return f"{std_no}|{etype}|{b}"


def countdown_events(old: dict, new: dict) -> list[dict]:
    """倒计时提醒：≤90 天首次、≤30 天二次。用 stage 控制不刷屏。

    首次建基线时也生效——"90 天内要实施"是真实待办，必须提醒。
    只对**还没实施**的标准算倒计时，已过实施日期的走状态比对，不在这刷。
    """
    out = []
    for no, cur in new.items():
        d = cur.get("days_to_implement")
        if d is None or d < 0:
            continue
        # 需求定的是 ≤90 天提醒。实操中 90~365 天的也该给个"提前知道"的机会，
        # 但级别降为中，且同样只提醒一次，不进高优红点。
        if d <= 30:
            out.append({"type": "UPCOMING", "std": cur, "stage": "30d",
                        "days_left": d, "urgent": True})
        elif d <= 90:
            out.append({"type": "UPCOMING", "std": cur, "stage": "90d",
                        "days_left": d, "urgent": True})
        elif d <= 365:
            out.append({"type": "UPCOMING", "std": cur, "stage": "1y",
                        "days_left": d, "urgent": False})
    return out


def _why_by_category(std: Standard) -> str:
    """按标准类别给"为什么重要"。

    刻意不用最终级别（level）来措辞 —— 级别会因倒计时远近被降级，
    但重要性不会跟着降。实测反例：特医通则距实施 164 天被降为"中"，
    若按级别措辞就会写成"属生产规范/体系标准"，把产品标准说轻了。
    """
    no = std.norm()
    if std.category == "product":
        if "25596" in no or "29922" in no or "29923" in no:
            return ("特医产品通则，直接关系注册证与检验依据的有效性；"
                    "换版后注册检验需重新对接方法，实验室要提前准备。")
        return "产品标准，是该年龄段产品的强制判定依据，直接决定产品合不合规。"
    if std.category == "test":
        if re.search(r"2762|29921|限量|污染物|致病菌", no):
            return "安全限量类检测方法，限量值或方法变化会直接改变放行判定结论。"
        if re.search(r"5009", no):
            return ("理化检测方法。方法换版后新旧数据不可直接比较，"
                    "历史数据要能解释清楚，报告模板也要跟着改。")
        return "检测方法标准，影响检验结果的可比性与报告引用。"
    if std.category == "prod":
        return ("生产规范，影响取样、留样、场所与人员卫生要求，"
                "不改判定阈值但会被审核查到。")
    if std.category == "sys":
        return "体系/认证类要求，审核时要求版本与证书一致，需同步更新体系文件。"
    return "关联标准，间接影响，建议知悉。"


def build_alerts(events: list[dict], kws: list[dict]) -> list[dict]:
    """把变更事件翻译成人话提醒。文案规则见 docs/REMINDER_TEMPLATE.md。"""
    alerts = []
    for e in events:
        std_d = e["std"]
        std = _to_std(std_d)
        hits = match_keywords(std, kws)
        if not hits:
            continue
        etype = e["type"]
        # 相关性闸门：通配词拉进来的先过这一关
        ok, why_relevant, weight = is_relevant(std, hits)
        if not ok:
            log.debug("过滤：%s %s", std.std_no, why_relevant)
            continue
        # 边缘相关项收进库但不生成提醒 —— 实验室不需要为真菌毒素方法换版弹红点。
        # 例外：它要是"新标准发布"，那仍然值得知道（说明官方新出了一版方法）。
        if weight == "edge" and etype != "NEW":
            log.debug("仅入库：%s %s", std.std_no, why_relevant)
            continue
        lvl = classify(std, hits)
        # 中期提醒（90~365 天）强制降级为"中"，不占用高优红点
        if etype == "UPCOMING" and e.get("urgent") is False:
            lvl = "mid" if lvl == "high" else lvl
        dk = dedup_key(std.std_no, etype, e.get("stage", ""))

        if etype == "NEW":
            title = f"新标准发布：{std.std_no} {std.title}"
            body = (f"发布日期 {std.publish_date or '—'}，实施日期 "
                    f"{std.implement_date or '—'}。命中关键词："
                    + "、".join(h["term"] for h in hits[:3]))
            acts = ["确认是否属于在检产品适用标准", "判断是否需要纳入检验计划"]
        elif etype == "ABOLISH":
            title = f"《{std.title}》（{std.std_no}）已废止，请勿再作为判定依据"
            bits = "；".join(_fmt_change(c) for c in e.get("changed", []))
            body = (f"本次变更：{bits}。"
                    f"替代标准为 {std.replaced_by or '以官方公告为准'}。")
            acts = ["核查所有引用该标准的作业指导书、检验规程",
                    "报告模板中删除该标准号引用",
                    "已出具的报告：如客户有异议需出具补充说明",
                    "原料乳/包材质量协议中的检验依据条款同步修订"]
        elif etype == "UPCOMING":
            stage = e.get("stage", "90d")
            title = (f"{std.std_no} 距实施还有 {e['days_left']} 天"
                     if e.get("urgent", True) else
                     f"{std.std_no} 将于 {std.implement_date} 实施（提前 {e['days_left']} 天）")
            body = (f"《{std.title}》将于 {std.implement_date} 实施。")
            # 动作清单按类别给，别一套模板打天下
            if std.category == "product":
                acts = ["核对在检产品适用哪个通则，确认新旧版衔接方式",
                        "更新检验计划与判定细则中的标准年份号",
                        "涉及注册检验的，同步通知注册检验机构"]
            elif std.category == "test":
                acts = ["确认实验室当前作业文件执行的是哪一版方法",
                        "安排新旧方法验证或实验室间比对",
                        "更新试剂、标准物质与仪器方法配置",
                        "比对新旧数据，评估对历史报告的影响"]
            elif std.category == "prod":
                acts = ["更新取样与留样作业指导书的引用条款",
                        "复核实验室与生产区域的卫生控制要求"]
            else:
                acts = ["安排相关方法验证/比对", "更新作业指导书与报告模板",
                        "确认试剂、标准物质、仪器方法是否需同步换版"]
        else:  # REVISION
            # 一次可能变多个字段，全部列出来，别只报第一个
            bits = "；".join(_fmt_change(c) for c in e.get("changed", []))
            title = f"{std.std_no} {e.get('primary', '信息变更')}"
            body = f"《{std.title}》本次变更：{bits}。"
            acts = ["比对新旧版本差异，评估对现有检测数据的影响",
                    "必要时在报告中说明方法变更",
                    "确认作业指导书引用的标准年份号是否需更新"]

        # "为什么重要"按**标准类别**说，不能按最终级别说。
        # 反例（实测踩过）：特医通则是产品标准，却因为 164 天才实施被降级为"中"，
        # 结果文案写成"属生产规范/体系标准"—— 等级降了，但重要性没降。
        why = _why_by_category(std)

        alerts.append({
            "std_no": std.std_no, "level": lvl, "title": title,
            "what_changed": body, "why_matters": why, "actions": acts,
            "event_type": etype, "dedup_key": dk,
            # 带上官方入口，提醒里要能一键跳到该标准实际来源的官方页面
            "official_url": std.official_url or OFFICIAL_PORTAL,
            "source_code": std.source_code,
            "relevance": weight,
        })
    return alerts


# ============================================================
# 6. 推送（站内 / 邮件）
# ============================================================
def push_inapp(alerts: list[dict]) -> None:
    """站内红点：写 alerts 表，前端读未读数。"""
    con = _con()
    n = 0
    for a in alerts:
        exists = con.execute(
            "SELECT id FROM change_events WHERE dedup_key=?", (a["dedup_key"],)
        ).fetchone()
        if exists:
            continue   # 去重：已提醒过就跳过
        cur = con.execute(
            "INSERT INTO change_events(std_no,event_type,level,title,what_changed,"
            "why_matters,actions,dedup_key,detected_at) VALUES(?,?,?,?,?,?,?,?,datetime('now'))",
            (a["std_no"], a["event_type"], a["level"], a["title"],
             a["what_changed"], a["why_matters"],
             json.dumps(a["actions"], ensure_ascii=False), a["dedup_key"]))
        ce_id = cur.lastrowid
        con.execute(
            "INSERT INTO alerts(change_id,std_no,level,title,body,status,created_at)"
            " VALUES(?,?,?,?,?, 'unread', datetime('now'))",
            (ce_id, a["std_no"], a["level"], a["title"], a["what_changed"]))
        n += 1
    con.commit()
    con.close()
    return n


def push_email(alerts: list[dict], to: list[str]) -> None:
    """邮件推送。生产环境接 SMTP；周报用同一模板。
    TODO: 配置 SMTP_SERVER / SMTP_PORT / SMTP_USER / SMTP_PASS，走企业邮箱。
    """
    if not alerts:
        return
    lv_txt = {"high": "高优", "mid": "中", "low": "低"}
    lines = ["婴配标准变更提醒（本周共 %d 条）" % len(alerts), "=" * 46]

    for a in alerts:
        lines += [
            "",
            f"[{lv_txt.get(a['level'], '中')}] {a['std_no']}",
            a["title"],
        ]
        if a.get("erata"):
            # 勘误：改动前/后并排最直观，实验室要拿这段去核作业文件
            e = a["erata"]
            lines += [
                f"  勘误章节：{e.get('section') or '全文'}",
                f"  勘误原因：{e.get('reason') or '官方未标注'}",
                f"  勘误时间：{e.get('date') or '—'}",
                f"  改前：{e.get('before') or '—'}",
                f"  改后：{e.get('after') or '—'}",
                "  → 请直接对照作业指导书该章节，比对后者的写法与改后是否一致",
            ]
        else:
            lines += [f"  变了什么：{a['what_changed']}"]
        lines += [
            f"  为什么重要：{a['why_matters']}",
            "  要做什么：",
            *[f"    - {x}" for x in a["actions"]],
            # 官方详情页：给该标准实际来源的入口，不写死某一个站点
            f"  官方详情页：{a.get('official_url') or OFFICIAL_PORTAL}  （请以官方文本为准）",
        ]

    lines += ["", "—", "本邮件仅做变更提醒，不附带标准全文。标准文本版权归发布机构所有。"]
    body = "\n".join(lines)
    # TODO: smtp 发送；此处先落盘便于验证
    out = os.path.join(DATA, "latest_email.txt")
    with open(out, "w", encoding="utf-8") as f:
        f.write("收件人: " + ", ".join(to) + "\n\n" + body)
    log.info("邮件正文已生成：%s（生产环境在此调用 SMTP 发送）", out)


# ============================================================
# 7. 调度
# ============================================================
def run_once(source_codes: list[str] | None = None, run_extras: bool = True) -> None:
    """一次全量检查。串行执行，源之间加间隔，避免把官方站点当靶子打。

    run_extras: 是否同时抓发布公告与标准勘误（默认开）。
    """
    kws = load_keywords()
    # 只用关键词表里的"精确/通配"项去查源（模糊词是本地过滤用的，不适合当检索词）
    all_terms = [k["term"] for k in kws if k["match_type"] in ("精确", "通配")]

    # ★ 追加"通则引用的标准"检索词 ★
    # 关键词表只列了实验室最常查的十几条，但三个产品通则正文里规范性引用了 49 个标准
    # （GB 5009 系列营养素检测、GB 4789 微生物、GB 2762/2761 限量、GB 14880 强化剂…），
    # 这些不会主动出现在关键词检索里，却天天在用。通读通则才能挖出来。
    # 一次解析、多次复用，产物在 data/general_refs.json。
    gref_terms = GREF.ref_keywords()
    if gref_terms:
        merged = list(dict.fromkeys(all_terms + gref_terms))
        log.info("检索词 %d 个（关键词表 %d + 通则引用 %d）",
                 len(merged), len(all_terms), len(gref_terms))
        all_terms = merged
    else:
        log.info("检索词 %d 个（未找到通则引用缓存，"
                 "先跑一次 python general_refs.py）", len(all_terms))

    all_alerts: list[dict] = []
    codes = source_codes or BATCH_SOURCES
    counts: dict[str, int] = {}

    for code in codes:
        ad = ADAPTERS.get(code)
        if not ad:
            log.warning("源 %s 未配置适配器，跳过", code)
            continue
        limit = SOURCE_QUERY_LIMIT.get(code, 12)
        query_terms = all_terms[:limit]
        base = getattr(ad, "base", getattr(ad, "base_url", ""))

        # ★ 各源用自己的检索词，别共用全局的 ★
        #   实测 2026-10-06：SRC-08（团标）拿到的是全局前 8 个词
        #   （关键词表 + 通则引用，都是「婴幼儿配方乳粉」这类国标用语），
        #   在团标库里一条都搜不到 → 返回 0 条→ 判定"未接通" →
        #   快照写空{} → 重建 data.js 时 33 条团标永久消失。
        #
        #   同一个接口手工搜「乳粉」能出 20 条，说明源是好的，
        #   错的只是给它搜什么。
        own = SOURCE_OWN_TERMS.get(code)
        if own:
            query_terms = own[:limit]

        # 熔断：连续失败太多次就在冷却期内跳过，别每次都白等超时
        fails, last_fail = _source_fail_state(code)
        if fails >= SOURCE_FAIL_THRESHOLD and _hours_since(last_fail) < SOURCE_COOLDOWN_H:
            log.warning("[%s] 连续失败 %d 次，冷却中（%d 小时内跳过）", code, fails, SOURCE_COOLDOWN_H)
            continue

        t0 = time.time()
        try:
            log.info("[%s] 开始抓取 %s（%d 个检索词）", code, base, len(query_terms))
            stds = fetch_source(code, query_terms)
            if not stds and not load_snapshot(code):
                # 空结果 + 无历史快照 = 这个源我们没真正接通，别假装成功
                raise RuntimeError("返回 0 条且无历史快照，视为未接通（可能接口变更或被风控）")
            new = {s.norm(): {**asdict(s), "row_hash": s.row_hash(),
                              "days_to_implement": s.days_to_implement()} for s in stds}
            old = load_snapshot(code)
            first_run = len(old) == 0
            events = diff_snapshots(old, new, first_run) + countdown_events(old, new)
            log.info("[%s] 抓取 %d 条，%s变更事件 %d 条",
                     code, len(new), "首次建基线，" if first_run else "", len(events))
            counts[code] = len(new)

            alerts = build_alerts(events, kws)
            all_alerts.extend(alerts)
            save_snapshot(code, new)
            _mark_source_ok(code)

            con = _con()
            con.execute(
                "INSERT INTO crawl_logs(level,source_code,message,cost_ms)"
                " VALUES('ok',?,?,?)",
                (code, f"抓取 {len(new)} 条，变更 {len(events)} 条",
                 int((time.time() - t0) * 1000)))
            con.commit()
            con.close()
        except Exception as e:                     # noqa: BLE001
            log.error("[%s] 失败：%s", code, e)
            con = _con()
            con.execute("INSERT INTO crawl_logs(level,source_code,message) VALUES('error',?,?)",
                        (code, str(e)))
            con.commit()
            con.close()
            _mark_source_fail(code)
        time.sleep(2)                              # 源之间 2 秒礼貌间隔

    # 勘误与公告各自一条流程：它们不改标准号，标准级 diff 发现不了
    if (not source_codes or "SRC-05" in source_codes) and run_extras:
        na = crawl_notices()
        if na:
            log.info("[公告] 贡献 %d 条提醒", len(na))
        all_alerts.extend(na)
        ea = crawl_erata()
        if ea:
            log.info("[勘误] 贡献 %d 条提醒", len(ea))
        all_alerts.extend(ea)

    # 全部流程跑完才打基线标记（中途崩溃则下次仍视为首次，安全）
    if not _baseline_done():
        _mark_baseline_done(counts)

    n = push_inapp(all_alerts)
    log.info("去重后新增提醒 %d 条", n)
    push_email(all_alerts, ["qc@example.com"])


# ---------- 源健康状态（供熔断判断） ----------
def _source_state_path() -> str:
    return os.path.join(DATA, "source_health.json")


def _load_health() -> dict:
    p = _source_state_path()
    if not os.path.exists(p):
        return {}
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except Exception:                              # noqa: BLE001
        return {}


def _save_health(h: dict) -> None:
    with open(_source_state_path(), "w", encoding="utf-8") as f:
        json.dump(h, f, ensure_ascii=False, indent=1)


def _mark_source_fail(code: str) -> None:
    h = _load_health()
    st = h.get(code, {"fails": 0, "last_fail": ""})
    st["fails"] = int(st.get("fails", 0)) + 1
    st["last_fail"] = datetime.now().isoformat(timespec="seconds")
    h[code] = st
    _save_health(h)


def _mark_source_ok(code: str) -> None:
    h = _load_health()
    if h.get(code):
        h[code] = {"fails": 0, "last_fail": ""}
        _save_health(h)


def _source_fail_state(code: str) -> tuple[int, str]:
    st = _load_health().get(code, {})
    return int(st.get("fails", 0)), st.get("last_fail", "")


def _hours_since(ts: str) -> float:
    if not ts:
        return 999.0
    try:
        d = datetime.fromisoformat(ts)
    except ValueError:
        return 999.0
    return (datetime.now() - d).total_seconds() / 3600


def scheduler_loop():
    """简易调度：每天 07:00 跑一次。生产环境用系统 cron / 云调度调 run_once() 即可。"""
    import time as _t
    log.info("调度器启动：每日 07:00 执行。当前 %s", datetime.now().strftime("%Y-%m-%d %H:%M"))
    while True:
        now = datetime.now()
        nxt = now.replace(hour=7, minute=0, second=0, microsecond=0)
        if now > nxt:
            nxt = (nxt + timedelta(days=1))
        wait = (nxt - now).total_seconds()
        log.info("下次执行：%s（%.1f 小时后）", nxt.strftime("%Y-%m-%d %H:%M"), wait / 3600)
        _t.sleep(wait)
        run_once()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", action="store_true", help="立即执行一次检查")
    ap.add_argument("--source", help="只查指定源，如 SRC-02")
    ap.add_argument("--init-db", action="store_true", help="初始化 SQLite")
    ap.add_argument("--serve", action="store_true", help="启动每日调度")
    ap.add_argument("--no-extras", action="store_true", help="本次跳过公告与勘误抓取")
    ap.add_argument("--erata-only", action="store_true",
                    help="只跑勘误+修改单（不跑标准源）")
    a = ap.parse_args()

    if a.init_db:
        init_db()
    if a.erata_only:
        if not os.path.exists(DB_PATH):
            init_db()
        alerts = crawl_erata()
        print(f"勘误/修改单提醒 {len(alerts)} 条")
        for x in alerts:
            kind = "修改单" if x.get("event_type") == "MOD" else "勘误"
            print(f"  [{x['level'].upper():4s}] {kind} {x['std_no']}  {x['erata']['section']}")
    if a.run:
        if not os.path.exists(DB_PATH):
            init_db()
        if a.erata_only:
            run_once([], run_extras=True)
        else:
            run_once([a.source] if a.source else None, run_extras=not a.no_extras)
    if a.serve:
        if not os.path.exists(DB_PATH):
            init_db()
        scheduler_loop()
    if not (a.run or a.serve or a.init_db or a.erata_only):
        ap.print_help()
