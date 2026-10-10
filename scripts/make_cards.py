#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""检测方法「可执行卡片」生成器。

================================================================
合规边界（先读这段，别改）
================================================================
本项目红线：**不存标准全文，只存元数据 + 官方链接**。
所以卡片分两层：

  【自动层】从官方元数据自动生成，不需要人工、不碰标准正文
    · 方法编号、名称、现行状态、实施/发布日期
    · 通则引用关系（GB 10767 要求这个项目时用哪条方法）
    · 替代关系（旧版→新版提醒）
    · 官方在线阅读链接（只给链接，不存正文）
    · 方法类型推断（按检测对象分类：元素/维生素/微生物/污染物/理化）
    · 同类方法横向对照（同组还有哪些方法、限值口径差异）

  【知识层】**由你或检验员填写**，我们只提供结构与录入界面
    · 原理要点（你们自己的理解，一两句）
    · 实际用到的试剂
    · 本实验室遇到的干扰因素
    · 注意事项与经验

为什么不自动填原理/试剂/干扰因素：
  这些内容只存在于**标准正文**。自动生成等于把标准正文搬过来，
  违反上面那条红线；更重要的是——**我编不出来**。
  编出来的试剂作用会误导实际检验，比空白更危险。
  这一层填的是你们工厂的隐性经验，本来就该由人写。

用法
  python scripts/make_cards.py                 # 生成全部卡片
  python scripts/make_cards.py --limit 20# 只生成前 20 条看效果
  python scripts/make_cards.py --card GB 5009.12-2023   # 单条
"""
import json
import os
import sys
import re
import subprocess

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
OUT = os.path.join(DATA, "method_cards.json")
KNOWLEDGE = os.path.join(DATA, "card_knowledge.json")

# ================================================================
# 方法类型推断
# ================================================================
# 依据标准名称里的检测对象关键词。
# 只做粗分类，用于「同类横向对照」和卡片图标，不做精确判定。
#
# 规则按**优先级从上到下**匹配，命中即返回。
# 顺序很讲究：
#   「乳/乳制品/微生物学检验」必须排在「理化」之前，
#   否则 GB 4789.x 会被误判成理化（"检验"两字太泛）。
#   反过来「三聚氰胺」要先于「元素」判掉，否则会撞上"元素"里的"胺"？不会，
#   但「亚硝酸盐」里的"酸"也不能进理化。
# 教训：这类规则必须用真实数据回归验证，不能凭想象写。
# ================================================================
TYPE_RULES = [
    # —— 微生物（放最前，GB 4789.x 全系列）——
    ("微生物", r"微生物学检验|菌落总数|大肠菌群|致病菌|金黄色葡萄球菌|"
                r"沙门氏菌|阪崎|肠球菌|单增李斯特|铜绿假单胞|蜡样芽孢杆菌|"
                r"商业无菌|酵母|霉菌|菌数|克罗诺杆菌|弯曲杆菌|副溶血性弧菌"),
    # —— 污染物 / 添加剂 / 掺假（早于理化，避免"酸""酯"误命中）——
    ("污染物", r"污染物|农药残留|兽药残留|添加剂|塑化剂|迁移|掺杂|掺假|"
                r"三聚氰胺|亚硝酸盐|硝酸盐|氰化物|硼砂|脲酶|吊白块|"
                r"工业染料|非食用|过氧化苯甲酰"),
    # —— 毒素 / 生物胺 ——
    ("毒素", r"毒素|真菌毒素|黄曲霉毒素|赭曲霉毒素|呕吐毒素|黄曲霉|"
             r"生物胺|组胺|腐霉酚|白藜芦醇|展青霉素|脱氢雪腐镰刀菌"),
    # —— 元素 ——
    ("元素", r"铅|镉|总铬|铬|汞|砷|锡|锌|铁|钙|硒|铜|锰|镁|钾|钠|磷|"
             r"氯化物|碘|镍|锶|铝|硼|钒|钼|氟化物|硫酸盐|碳酸盐|钾钠"),
    # —— 维生素 ——
    ("维生素", r"维生素|核黄素|硫胺素|烟酸|叶酸|泛酸|生物素|抗坏血酸|"
              r"胆碱|肌醇|牛磺酸|叶黄素|DHA|ARA|二十碳五烯酸|"
              r"二十二碳六烯酸|左旋肉碱"),
    # —— 糖类 / 脂肪酸（早于理化，"糖"和"酸"都太泛）——
    ("糖类", r"糖类|乳糖|蔗糖|麦芽糖|半乳糖|葡萄糖|果糖|糊精|焦糖|低聚糖"),
    ("脂肪", r"脂肪|脂肪酸|反式脂肪酸|酸价|过氧化值|羰基|极性组分|胆固醇|油脂"),
    # —— 理化 / 营养成分 ——
    ("理化", r"水分|灰分|蛋白质|密度|比容|粒度|溶解性|乳化|杂质度|"
             r"游离棉酚|植酸|咖啡因|核酸|酸度|挥发性盐基氮|净含量|"
             r"乳固体|可溶性固形物|酸碱度|硬度|色泽|气味|感官"),
    # —— 计量 / 包装 ——
    ("计量", r"计量检验规则|定量包装商品|净含量"),
]

# 关键营养素清单（婴配特色）—— 用于特别标记
KEY_NUTRIENTS = {
    "GB 5009.92": "钙", "GB 5009.90": "铁", "GB 5009.14": "锌",
    "GB 5009.93": "硒", "GB 5009.267": "碘", "GB 5009.241": "镁",
    "GB 5009.242": "锰", "GB 5009.13": "铜", "GB 5009.91": "钾钠",
    "GB 5009.12": "铅", "GB 5009.16": "锡", "GB 5009.11": "总砷",
    "GB 5009.5": "蛋白质", "GB 5009.6": "脂肪", "GB 5009.3": "水分",
    "GB 5009.4": "灰分", "GB 5009.39": "镍", "GB 5009.300": "左旋肉碱",
    "GB 14880": "营养强化剂",
}


def infer_type(title):
    """从标准名称推断方法类型。"""
    for t, pat in TYPE_RULES:
        if re.search(pat, title):
            return t
    return "其他"


def nutrient_of(no):
    """按标准号前缀判定关键营养素。"""
    no = (no or "").strip()
    for k, v in KEY_NUTRIENTS.items():
        if no.startswith(k):
            return v
    return ""


# ================================================================
# 只保留「检测方法」类标准
# ================================================================
# ★ 为什么必须过滤 ★
#   通则引用里混着两类东西：
#     方法标准 —— GB 5009.12 食品中铅的测定      ✓ 要做卡片
#     限量标准 —— GB 2762 食品中污染物限量        ✗ 不是方法
#   限量标准规定"允许多少"，方法标准规定"怎么测"。
#   给检验员做"怎么测"的卡片时混入"允许多少"，等于答非所问。
#   （用户原话：「这个不用做啊，这个又不是检验方法」）
#
# 判据用**标题里有没有方法动词**，比匹配关键词可靠：
#   "食品中铅的测定" 有「测定」→ 方法
#   "食品中污染物限量"  没有    → 不是方法
# 反过来用关键词黑名单容易误伤（搜"食品"会命中所有条目）。
# ================================================================
METHOD_WORD = re.compile(r"测定|检验|计数|测量|检测")
# 标准性质上就与方法无关的，即使含"检验"二字也不是检测方法
NOT_METHOD = re.compile(
    r"使用标准|限量|检验规则|安全要求|营养标签|良好规范|通用卫生|生产通用")


def is_method(title, std_no=""):
    """判断是否检测方法标准。返回 (bool, 原因)。"""
    t = (title or "")
    if NOT_METHOD.search(t):
        return False, "标准性质：非检测方法（限量/使用/规则类）"
    if not METHOD_WORD.search(t):
        return False, "标题无「测定/检验/计数/检测」等方法标识"
    return True, ""


# ================================================================
# 数据组装
# ================================================================

def read_js_data():
    """从 prototype/data.js 读现有数据。

    ★ 为什么必须借 node ★
      data.js 是 **JS 对象字面量**（键可以不加引号、可能有单引号、
      末尾带分号），不是合法 JSON：
        json.loads() 会报
        "Expecting property name enclosed in double quotes"
      硬写正则去改写 JS 语法很脆。正解是让 node 自己求值再导出 JSON：
        node -e "global.window={};require('./prototype/data.js');
                  fs.writeFileSync('data/_dump.json',
                                   JSON.stringify(window.STDWATCH_DATA))"
    """
    dump = os.path.join(DATA, "_dump.json")
    node = os.environ.get("STDWATCH_NODE") or "node"
    js = (
        "global.window={};require('./prototype/data.js');"
        "require('fs').writeFileSync(%s,JSON.stringify(global.window.STDWATCH_DATA))"
        % json.dumps(dump.replace("\\", "/"))
    )
    r = subprocess.run([node, "-e", js], cwd=ROOT,
                       capture_output=True, text=True, encoding="utf-8")
    if r.returncode != 0 or not os.path.exists(dump):
        raise SystemExit("node 读取 data.js 失败：%s"
                         % ((r.stderr or "")[:300]))
    with open(dump, encoding="utf-8") as f:
        return json.load(f)


def build_cards(data):
    """把通则引用 + 标准库合成为卡片。

    卡片来源有二，取并集：
      1. REFGROUPS 里的检测方法（这些是通则要求必检的，最常用）
      2. STD 里 cat==test 的（覆盖面更广，但未必每条都用得上）
    优先用 REFGROUPS 的，因为它带"通则引用"这条关键关系。
    """
    ref_by_no = {}
    for g in data.get("REFGROUPS", []) or []:
        for it in (g.get("items") or []):
            no = it.get("no")
            if not no:
                continue
            c = ref_by_no.setdefault(no, {"no": no, "title": it.get("title", ""),
                                          "groups": [], "ref": it})
            c["groups"].append(g.get("g", ""))

    std_by_no = {}
    for s in data.get("STD", []) or []:
        if s.get("no"):
            std_by_no[s["no"]] = s

    cards = []
    skipped_non_method = []
    for no, c in sorted(ref_by_no.items()):
        std = std_by_no.get(no, {})
        title = c["title"] or std.get("title", "")
        ok, why = is_method(title, no)
        if not ok:
            skipped_non_method.append((no, title, why))
            continue
        card = {
            "no": no,
            "title": title,
            "groups": c["groups"],
            "type": infer_type(title),
            "nutrient": nutrient_of(no),
            "validity": c["ref"].get("validity") or std.get("status", ""),
            "pub": c["ref"].get("pub") or std.get("pub", ""),
            "imp": c["ref"].get("imp") or std.get("imp", ""),
            "url": std.get("url", ""),
            "replace": std.get("replace", ""),
            "dead": std.get("dead", ""),
            "knowledge": {},
        }
        cards.append(card)

    # 同类横向对照：同组里的其他方法
    by_group = {}
    for c in cards:
        for g in c["groups"]:
            by_group.setdefault(g, []).append(c)
    for c in cards:
        sibs = []
        seen = {c["no"]}
        for g in c["groups"]:
            for s in by_group.get(g, []):
                if s["no"] not in seen:
                    seen.add(s["no"])
                    sibs.append({"no": s["no"], "title": s["title"],
                                 "type": s["type"]})
        c["siblings"] = sibs[:12]
    return cards, skipped_non_method


def load_knowledge():
    p = KNOWLEDGE
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_knowledge(k):
    with open(KNOWLEDGE, "w", encoding="utf-8") as f:
        json.dump(k, f, ensure_ascii=False, indent=1)


KNOWLEDGE_FIELDS = [
    ("principle", "原理要点", "一句话说清怎么测的（你们自己的理解）"),
    ("reagents", "实际试剂", "你们实验室真正用的试剂名称，用逗号分隔"),
    ("interference", "干扰因素", "本实验室遇到的干扰，写现象+处理"),
    ("precautions", "注意事项", "操作要点、避坑经验"),
    ("instr", "关键仪器", "用到的仪器型号"),
]


def main():
    limit = None
    only = None
    if "--limit" in sys.argv:
        limit = int(sys.argv[sys.argv.index("--limit") + 1])
    if "--card" in sys.argv:
        only = sys.argv[sys.argv.index("--card") + 1]

    data = read_js_data()
    cards, skipped = build_cards(data)
    kn = load_knowledge()

    if only:
        cards = [c for c in cards if only in c["no"]]
    if limit:
        cards = cards[:limit]

    # 合并已有知识层
    for c in cards:
        c["knowledge"] = kn.get(c["no"], {})

    os.makedirs(DATA, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(cards, f, ensure_ascii=False, indent=1)

    filled = sum(1 for c in cards if c["knowledge"])
    by_type = {}
    for c in cards:
        by_type.setdefault(c["type"], []).append(c["no"])

    print("已生成 %d 张卡片 -> %s" % (len(cards), os.path.relpath(OUT, ROOT)))
    print()
    if skipped:
        print("已剔除 %d 条非检测方法（限量/使用标准等）：" % len(skipped))
        for no, title, why in skipped:
            print("   %-20s %-38s %s" % (no[:20], title[:36], why))
        print()
    print("按方法类型：")
    for t, v in sorted(by_type.items(), key=lambda x: -len(x[1])):
        print("   %-8s %2d 条" % (t, len(v)))
    print()
    print("自动层已填：编号/名称/状态/日期/引用关系/替代关系/官方链接/同类对照")
    print("知识层待填：%d/%d 条已录入" % (filled, len(cards)))
    if filled < len(cards):
        print()
        print("录入方式：编辑 %s，按标准号加条目：" % os.path.relpath(KNOWLEDGE, ROOT))
        print(json.dumps({cards[0]["no"]: {k: "…" for k, _, _ in KNOWLEDGE_FIELDS}},
                         ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
