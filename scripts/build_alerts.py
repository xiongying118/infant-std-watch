#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成原型的 ALERTS 数组（提醒队列）——全部来自真实抓取数据。

★ 为什么不用手写 ★
  原型初版的 ALERTS 是我手写的演示数据，结果：
    · 漏了 2027-02-18 那批 13 项真菌毒素/污染物方法换版（138 天后实施）
    · 漏了 2027-08-18 的脂肪酸方法换版（319 天后实施）
    · 写的实施日期与源站对不上
  这类"提醒"如果不准，整个系统就没有价值 —— 用户会按错的日期做准备。
  所以改成：每次从 general_refs.json 实算，按距实施天数排序生成。

分级：
  高（≤90 天）  —— 红点，必须现在动手
  中（≤365 天） —— 提前知道，作业文件要排期
  低（更远）    —— 知悉即可
"""
from __future__ import annotations

import io
import json
import os
import re
import sys
from datetime import date

sys.stdout.reconfigure(encoding="utf-8")
BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "..", "data")
PROTO = os.path.join(BASE, "..", "prototype", "index.html")

# 检测对象 → 为什么重要 / 要做什么
# 按检测对象给，不按标准逐条写：同一类项目的动作是一样的。
PLAYBOOK = {
    "真菌毒素": (
        "**黄曲霉毒素是真菌毒素限量里最严的指标**，方法换了意味着提取净化效率、"
        "回收率都变了，新旧数据不可直接比较。",
        ["核对作业文件执行的是哪一版方法", "旧数据若用于放行判定，需评估是否需复测",
         "确认标准品与试剂配套是否随方法更换"],
    ),
    "污染物与有害物质": (
        "**污染物限量是放行否决项**，方法变更直接影响判定结论。",
        ["更新污染物检验作业指导书", "确认前处理与仪器方法配套标准是否同步换版",
         "比对新旧方法历史数据"],
    ),
    "脂肪酸": (
        "**脂肪酸组成是婴配强制标示项目**，反式脂肪酸限量直接关系配方合规；"
        "2027 版把脂肪酸与反式脂肪酸合并测定，前处理和色谱条件都会变。",
        ["确认现行作业文件执行的是 GB 5413.27-2010 还是 GB 5009.168-2016",
         "提前准备方法切换：试剂、色谱柱、标准品",
         "更新报告模板中的方法引用"],
    ),
    "反式脂肪酸": (
        "**反式脂肪酸是婴配重点监控项**，新方法改为与脂肪酸合并测定。",
        ["确认现行方法版本", "评估合并测定对现有分离方案的影响",
         "更新作业指导书与报告模板"],
    ),
    "营养成分": (
        "**营养成分是婴配标签标示的基础**，方法变更直接影响标示值合规性。",
        ["确认作业文件执行的方法版本", "比对新旧方法历史数据",
         "更新标签复核流程中的方法引用"],
    ),
    "污染物检测": (
        "**污染物检测方法换版**，涉及前处理与仪器条件。",
        ["更新作业指导书", "确认标准物质与试剂配套"],
    ),
}

DEFAULT_PLAY = (
    "该标准已发布新版，实施日期临近，作业文件需同步。",
    ["确认现行作业文件执行的是哪一版", "更新作业指导书与报告模板",
     "确认试剂、标准物质、仪器方法是否需同步换版"],
)


def subject_of(no: str, title: str) -> str:
    """把标准归到一个"提醒话术"类别。"""
    text = (no or "") + " " + (title or "")
    if re.search(r"黄曲霉毒素B|黄曲霉毒素M|展青霉素|桔青霉素|赤霉烯酮|"
                 r"脱氧雪腐|赭曲霉|交链孢|多种真菌毒素|黄曲霉毒素", text):
        return "真菌毒素"
    if re.search(r"反式脂肪酸", text) and "脂肪酸和" not in text:
        return "反式脂肪酸"
    if re.search(r"脂肪酸", text):
        return "脂肪酸"
    if re.search(r"铅|砷|汞|镉|多氯联苯|全氟|亚硝酸盐|氯酸盐", text):
        return "污染物与有害物质"
    if re.search(r"蛋白|脂肪|水分|灰分|维生素|矿物质|乳糖|糖", text):
        return "营养成分"
    if re.search(r"限量|真菌毒素限量", text):
        return "污染物检测"
    return ""


def main() -> int:
    g = json.load(io.open(os.path.join(DATA, "general_refs.json"), encoding="utf-8"))
    det = g.get("details") or {}
    today = date.today()

    # 收集"已发布、未实施"的换版项
    pending = []
    for no, v in det.items():
        imp = v.get("implement_date") or ""
        if not imp:
            continue
        try:
            y, m, d = (int(x) for x in imp.split("-"))
        except ValueError:
            continue
        days = (date(y, m, d) - today).days
        if days < 0:
            continue
        pending.append((days, no, v))
    pending.sort(key=lambda x: x[0])

    # 同一实施日期的合并成一条提醒（一次公告发一批方法是常态）
    alerts = []
    by_date: dict[str, list] = {}
    for days, no, v in pending:
        by_date.setdefault(v["implement_date"], []).append((days, no, v))

    for imp, group in sorted(by_date.items()):
        days = group[0][0]
        if days <= 90:
            lvl = "high"
        elif days <= 365:
            lvl = "mid"
        else:
            lvl = "low"
        names = "、".join(no for _, no, _ in group)
        cats = [subject_of(no, v.get("title", "")) for _, no, v in group]
        cat = next((c for c in cats if c in PLAYBOOK), "")
        why, acts = PLAYBOOK.get(cat, DEFAULT_PLAY)
        replaces = sorted({(v.get("replaced_by") or "") for _, _, v in group} - {""})
        alerts.append({
            "lvl": lvl,
            "no": names if len(names) < 60 else "{} 等 {} 项".format(
                group[0][1], len(group)),
            "title": "{} 项检测标准将于 {} 实施（还有 {} 天）".format(
                len(group), imp, days),
            # 抓取日：距实施 ≤90 天的是本周要动手的，更远的标"提前 {} 天"
            "time": "今天 07:02" if days <= 90 else "提前 {} 天".format(days),
            "body": "实施日期 {}；发布 {}。{}".format(
                imp, group[0][2].get("publish_date") or "—",
                ("替代 " + "、".join(replaces)) if replaces else "首次发布或换版"),
            "why": why,
            "acts": acts,
            "unread": lvl == "high",
        })

    if not alerts:
        print("没有待实施的标准")
        return 0

    lines = ["const ALERTS = ["]
    for a in alerts:
        lines.append(
            '  {{lvl:"{lvl}",no:"{no}",title:"{title}",time:"{time}",\n'
            '   body:"{body}",\n'
            '   why:"{why}",\n'
            '   acts:[{acts}],unread:{unread}}},'.format(
                lvl=a["lvl"], no=a["no"].replace('"', "'"), title=a["title"],
                time=a["time"], body=a["body"], why=a["why"].replace('"', "'"),
                acts=",".join('"{}"'.format(x) for x in a["acts"]),
                unread="true" if a["unread"] else "false"))
    lines.append("];")
    body = "\n".join(lines)

    s = io.open(PROTO, encoding="utf-8").read()
    a0 = s.index("const ALERTS = [")
    b0 = s.index("\n];", a0) + 3
    s = s[:a0] + body + s[b0:]

    required = ["const STD = [", "const CATS = [", "const LAWS = [",
                "const REFGROUPS = ", "const ERATA = [", "const ALERTS = [",
                "function renderList", "function renderLaw", "function route("]
    missing = [k for k in required if k not in s]
    if missing:
        print("✗ 中止：缺少 {} —— 不写盘".format("、".join(missing)))
        return 1
    io.open(PROTO, "w", encoding="utf-8").write(s)

    print("已生成 {} 条提醒（真实数据，今天 {}）".format(len(alerts), today))
    for a in alerts:
        print("  [{}] {} 项 → {}（{} 天）  {}".format(
            a["lvl"].upper(), len(a["no"]), a["title"].split("将于 ")[-1][:40],
            a["time"], a["no"][:56]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
