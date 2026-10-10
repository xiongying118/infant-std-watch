#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从真实抓取记录生成页面运行状态，并注入原型。

================================================================
★ 为什么必须有这个脚本 ★
2026-10-04 用户问"今天怎么没看到自动检查" —— 查下来是：

  1. **调度器从来没常驻运行**。scheduler_loop() 只写在代码里，
     没有任何东西拉起它，进程列表里也没有。快照最新的是
     SRC-08（昨天 21:24 手动跑的），今天 0 次。
  2. **页面在硬编码"假装检查过"**：
       - 侧栏「上次检查：今天 07:00 / 下次检查：明天 07:00」是写死的字符串
       - LOGS 那一串抓取日志是 10-03 12:xx 的历史记录，写死在 JS 里
       - SRCS 的 cnt（386 / 176 / 56 …）是当时手写的
     所以用户看到"今天 07:00 检查过"，实际根本没这回事。

  **这是比"功能缺失"更严重的问题：它在骗用户。**
  实验室会以为"今天没有变更"= "查过了，确实没变更"，
  实际是"根本没查"。

================================================================
所以本脚本做两件事：
  A. 读真实的快照/基线/日志文件，算出「上次/下次检查」与各源条数
  B. 把页面里写死的假数据换成真实的，并在**没跑过**时明确显示

设计原则：**宁可显示"未运行"，也不显示假的"已检查"**。
"""
import io
import json
import os
import re
import sys
from datetime import datetime, timedelta

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
DATA = os.path.join(ROOT, "data")
SNAP = os.path.join(DATA, "snapshots")
PROTO = os.path.join(ROOT, "prototype", "index.html")
OUT = os.path.join(DATA, "_runstate.js")
DATAJS = os.path.join(ROOT, "prototype", "data.js")

# ---------------------------------------------------------------- 定时配置
# ★ 这里的每一个值都必须和 .github/workflows/daily-check.yml 里的
#   cron 表达式一致。改 cron 忘了改这里，页面就会显示错的频率 ——
#   2026-10-07 就踩过：cron 早改成每天一次（'7 1 * * *'），
#   但 SCHEDULE 文案和 _CRON_HOURS 还写着 09:07/17:07，
#   页面显示「每日 09:07 / 17:07」，用户以为跑两次。
#
# 真实 cron（2026-10-06 改为每天一次，省 Actions 额度）：
#   '7 1 * * *'  = UTC 01:07 = **北京时间 09:07**
#
# 如需改回一天两次：cron 改 '7,17 1,9 * * *'，
# _CRON_HOURS 改 [1, 9]，SCHEDULE 改 "每日 09:07 / 17:07"。
# 三处必须一起改。
_CRON_HOURS = [1]         # UTC 小时
_CRON_MINUTE = 7
_CRON_UTC_OFFSET = 8      # UTC+8

# 文案由上面两个常量拼出来，不再单独手写 —— 杜绝改了 cron 忘改文案
_CRON_CN_HOURS = sorted((h + _CRON_UTC_OFFSET) % 24 for h in _CRON_HOURS)
SCHEDULE = ("每日 " + " / ".join("%02d:%02d" % (h, _CRON_MINUTE)
                                  for h in _CRON_CN_HOURS)
            if len(_CRON_CN_HOURS) > 1
            else "每日 %02d:%02d" % (_CRON_CN_HOURS[0], _CRON_MINUTE))

# 源 → 快照文件（与 sources.py 的 ADAPTERS 对应）
SRC_FILES = {
    "SRC-01": "SRC-01_latest.json",
    "SRC-02": "SRC-02_latest.json",
    "SRC-05": "SRC-05_latest.json",
    "SRC-06": "SRC-06_latest.json",
    "SRC-07": "SRC-07_latest.json",
    "SRC-08": "SRC-08_latest.json",
    "SRC-11": "SRC-11_latest.json",
}
EXTRA_FILES = {
    "公告": "notice_latest.json",
    "勘误与修改单": "erata_latest.json",
}

# 快照文件 → 抓取日志文案
LOG_TEXT = {
    "SRC-01_latest.json": "[SRC-01] 全国标准信息公共服务平台 gbQueryPage 抓取 %d 条",
    "SRC-02_latest.json": "[SRC-02] 国家标准全文公开系统 openstd 抓取 %d 条",
    "SRC-05_latest.json": "[SRC-05] 食品安全国家标准数据检索平台 抓取 %d 条",
    "SRC-06_latest.json": "[SRC-06] 市场监管总局公告 抓取 %d 条（BJS 补充检验方法等）",
    "SRC-07_latest.json": "[SRC-07] 工信部行业公告 抓取 %d 条（该源常为 0，属正常）",
    "SRC-08_latest.json": "[SRC-08] 全国团体标准 抓取 %d 条（仅作参考）",
    "SRC-11_latest.json": "[SRC-11] CNAS 实验室认可规范 抓取 %d 条（非国标，标准委不收录）",
    "notice_latest.json": "[公告] 收录 %d 条发布公告",
    "erata_latest.json": "[勘误] 收录 %d 条标准勘误 / 修改单",
}
# 各源快照写入时间 → 用来判断"这次跑了哪些源"


def now_cn():
    """当前时间，同样换算到**北京时间基准**（必须与 mtime() 同一时基）。

    ★ 这里踩过坑 ★
      原来直接`datetime.now()`，想着"本机显示的就是本地时间"。
      但 mtime() 已经把文件时间换算成北京时间了，而云端 runner 是 UTC：
          now_cn()   -> UTC 04:22   （未换算）
          mtime()    -> 11:22       （已 +8）
          相减       -> **负数** -7 小时，页面直接显示「-7.7 小时前」
      用户看到的是"刚抓的数据，却显示负数时间"，比不显示更糟。

      所以 now 也必须走同样的换算：
          云端（偏移0）-> datetime.now() + 8h  = 北京时间
          本机（偏移8）-> datetime.now() + 0h  = 已是北京时间
    """
    return datetime.now() + timedelta(
        hours=_CRON_UTC_OFFSET - _local_utc_offset_hours())


def _local_utc_offset_hours():
    """本机当前 UTC 偏移小时数（东八区机器返回 8，UTC 机器返回 0）。

    用 time.timezone 而不是 datetime.utcnow()：
    后者在 3.12+ 已弃用，会在每次运行时刷DeprecationWarning。
    """
    import time
    return int(round(-time.timezone / 3600))


def mtime(p):
    """取文件修改时间，统一换算成北京时间。

    ★ 为什么必须换算★
      抓取分两处跑：
        - 本机（Windows，东八区）—— 早期的手动/计划任务
        - GitHub Actions runner（**UTC**）—— 现在的定时任务

      两者写下的 mtime 时基不同。不换算的话，云端抓的时间会显示成
      UTC 原值：UTC 01:18 抓的显示成 "01:18"，用户下午看会以为
      "这是凌晨跑的、今天没跑" —— **连日期都会看错一天**。

    ★ 换算量必须自适应，不能写死+8★
      写死 +8 在本机跑就错了（本机已经是东八区，会多算8 小时）。
      所以先探测本机偏移：
        本机偏移 8（东八区）→ 文件 mtime 已是本地时间，加 0
        云端偏移 0（UTC）    → 文件 mtime 是 UTC，要加 8
      这样同一个脚本在两边跑都对。
    """
    try:
        t = datetime.fromtimestamp(os.path.getmtime(p))
    except OSError:
        return None
    return t + timedelta(hours=_CRON_UTC_OFFSET - _local_utc_offset_hours())


def collect():
    """读真实文件，算出运行状态。返回可直接注入页面的 dict。"""
    out = {"schedule": SCHEDULE, "sources": [], "extras": [],
           "lastRun": "", "nextRun": "", "everRan": False,
           "lastRunDetail": "", "healthy": True}

    # ---- 各源快照 ----
    latest = None
    for code, fn in SRC_FILES.items():
        p = os.path.join(SNAP, fn)
        t = mtime(p)
        n = 0
        if t:
            try:
                d = json.load(io.open(p, encoding="utf-8"))
                n = len(d) if hasattr(d, "__len__") else 0
            except Exception:                            # noqa: BLE001
                n = -1                                    # 文件坏了
        out["sources"].append({
            "code": code, "file": fn, "count": n,
            "mtime": t.strftime("%Y-%m-%d %H:%M") if t else "",
        })
        if t and (latest is None or t > latest):
            latest = t

    # ---- 公告 / 勘误 ----
    for label, fn in EXTRA_FILES.items():
        p = os.path.join(SNAP, fn)
        t = mtime(p)
        n = 0
        if t:
            try:
                d = json.load(io.open(p, encoding="utf-8"))
                n = len(d) if hasattr(d, "__len__") else 0
            except Exception:                            # noqa: BLE001
                n = -1
        out["extras"].append({
            "label": label, "file": fn, "count": n,
            "mtime": t.strftime("%Y-%m-%d %H:%M") if t else "",
        })
        if t and (latest is None or t > latest):
            latest = t

    out["srcCount"] = {}
    for fn in list(SRC_FILES.values()) + list(EXTRA_FILES.values()):
        p = os.path.join(SNAP, fn)
        if os.path.exists(p):
            try:
                d = json.load(io.open(p, encoding="utf-8"))
                out["srcCount"][fn] = len(d) if hasattr(d, "__len__") else 0
            except Exception:                            # noqa: BLE001
                out["srcCount"][fn] = -1
        else:
            out["srcCount"][fn] = 0

    # ---- 上次 / 下次 ----
    # 判定"是否真的按时跑过"：最近一次要落在最近 36 小时内
    # now 与 mtime() 同为北京时间基准，才能直接相减
    now = now_cn()
    if latest:
        # ★ 时区修正（关键）★
        # `latest` 来自快照文件的 mtime，而**云端 GitHub Actions runner 用 UTC**，
        # 本机是东八区。两者直接比会差8 小时：
        #   实际 UTC 01:18 抓的→ 页面显示 "01:18"
        #   用户在北京时间下午看，会以为"这是凌晨跑的、今天没跑"，
        #   实际是今天上午 09:18 跑的。**显示的日期都可能差一天。**
        #
        # 修法：把mtime 一律当UTC 处理，再转成北京时间展示。
        # 这样无论脚本跑在本机还是云端，输出都对得上真实时刻。
        latest_cn = latest          # mtime() 里已统一换算成北京时间
        out["lastRun"] = latest_cn.strftime("%Y-%m-%d %H:%M")
        out["everRan"] = True
        age_h = (now - latest_cn).total_seconds() / 3600
        out["lastRunDetail"] = "{} 小时前".format(round(age_h, 1))
        if age_h > 36:
            out["healthy"] = False

        # 下次 = 按真实 cron 推算（北京时间 09:07 / 17:07）
        nxt = _next_cron_cn(latest_cn)
        out["nextRun"] = nxt.strftime("%Y-%m-%d %H:%M")
        if nxt < now:
            out["nextRun"] = "已逾期（原定 {}）".format(nxt.strftime("%Y-%m-%d %H:%M"))
            out["healthy"] = False
    else:
        out["lastRun"] = "从未运行"
        out["lastRunDetail"] = "无任何快照文件"
        out["nextRun"] = "需先手动执行一次"
        out["healthy"] = False
    return out


def _next_cron_cn(latest_cn):
    """按真实 cron 推下一次运行时间（返回北京时间）。

    cron 是 UTC `7,17 1,9 * * *`，即 UTC 01:07 / 09:07，
    换算成北京时间是 09:07 / 17:07。
    """
    cand = []
    for day in (0, 1, 2):
        d = (latest_cn + timedelta(days=day)).date()
        for h in _CRON_HOURS:
            # UTC 小时 + 8=北京时间；UTC 01:07 -> 09:07，09:07 -> 17:07
            cand.append(datetime(d.year, d.month, d.day,
                                 h + _CRON_UTC_OFFSET, _CRON_MINUTE))
    for c in sorted(cand):
        if c > latest_cn:
            return c
    return latest_cn + timedelta(days=1)


def build_logs(st) -> list:
    """从各快照文件的**真实修改时间**生成抓取日志。

    ★ 为什么不用硬编码日志 ★
      原来 LOGS 是 10-03 12:xx 手写的一串，之后每跑一次抓取都不同步。
      用户看不到"今天这次检查抓了什么、哪个源落后了"。
      现在每条日志都挂在真实文件的 mtime 上，跑过就有、没跑就没有。
    """
    rows = []
    now = now_cn()
    for code, fn in SRC_FILES.items():
        p = os.path.join(SNAP, fn)
        t = mtime(p)
        if not t:
            rows.append(["—", "wr", "[%s] 无快照文件，该源从未成功抓取" % code])
            continue
        n = st["srcCount"].get(fn, 0)
        # ★ 时间戳要带日期，且统一按北京时间 ★
        #   只用 HH:MM:SS 排序时，"昨天 21:24" 会排在 "13:23" 后面 ——
        #   跨天就没法比了。日志表是给用户看"最新在哪"的，顺序错了就失去意义。
        #
        #   时区：mtime 来自文件写入时刻。**云端 runner 是 UTC**，
        #   不换算的话日志会整体差 8 小时，用户看"今天"的日志会看到昨天的。
        rows.append([t.strftime("%Y-%m-%d %H:%M:%S"), "ok", LOG_TEXT[fn] % n])
    for label, fn in EXTRA_FILES.items():
        p = os.path.join(SNAP, fn)
        t = mtime(p)
        if not t:
            rows.append(["—", "wr", "[%s] 无快照文件，从未成功抓取" % label])
            continue
        n = st["srcCount"].get(fn, 0)
        rows.append([t.strftime("%Y-%m-%d %H:%M:%S"), "ok", LOG_TEXT[fn] % n])
    # 倒序（新的在上），页面显示最近 20 条
    # "—" 排最后（无快照的源，提示性质的）
    rows.sort(key=lambda r: (r[0] == "—", r[0]))
    return rows[::-1][:20]


def esc(s) -> str:
    return str(s).replace("\\", "\\\\").replace('"', '\\"')


def render(st) -> str:
    """渲染成页面里的 JS 常量。

    ★ 不用 str.format ★
      JS 对象字面量里全是 { }，format 会把它们当占位符 → KeyError '{schedule}'。
      改用 %s 占位。
    """
    srcs = ",\n".join(
        '  {code:"%s", file:"%s", count:%d, mtime:"%s"}' % (
            esc(x["code"]), esc(x["file"]),
            x["count"] if x["count"] >= 0 else -1, esc(x["mtime"]))
        for x in st["sources"])
    exs = ",\n".join(
        '  {label:"%s", file:"%s", count:%d, mtime:"%s"}' % (
            esc(x["label"]), esc(x["file"]),
            x["count"] if x["count"] >= 0 else -1, esc(x["mtime"]))
        for x in st["extras"])
    logs = ",".join(
        '["%s","%s","%s"]' % (esc(r[0]), r[1], esc(r[2]))
        for r in st.get("logs", []))
    head = (
        "/* ===== 运行状态（由 scripts/build_runstate.py 从真实快照生成）=====\n"
        "   ★ 不要手改 ★ 每次抓取后跑：\n"
        "       python scripts/fetch_new_sources.py\n"
        "       python scripts/crawler.py --run\n"
        "       python scripts/build_runstate.py\n"
        "   字段全部来自 data/snapshots/*.json 的**文件修改时间**与条数，\n"
        "   不是页面上写死的字符串。跑没跑、跑了多少条，页面上看得见。 */\n"
    )
    body = (
        "const RUNSTATE = {\n"
        '  schedule:"%s",\n'
        '  lastRun:"%s",\n'
        '  lastRunDetail:"%s",\n'
        '  nextRun:"%s",\n'
        "  everRan:%s,\n"
        "  healthy:%s,\n"
        "  sources:[\n%s\n  ],\n"
        "  extras:[\n%s\n  ],\n"
        "  logs:[%s]\n"
        "};\n"
    ) % (
        esc(st["schedule"]), esc(st["lastRun"]), esc(st["lastRunDetail"]),
        esc(st["nextRun"]),
        "true" if st["everRan"] else "false",
        "true" if st["healthy"] else "false",
        srcs, exs, logs,
    )
    return head + body


def _literal_of(s: str, name: str):
    """从页面切出 `const <name> = <字面量>;`。找不到返回 None。"""
    m = re.search(r"^const " + name + r"\s*=\s*", s, re.M)
    if not m:
        return None
    i = m.end()
    if i >= len(s) or s[i] not in "[{":
        return None
    oc, cc = s[i], ("]" if s[i] == "[" else "}")
    depth = 0
    for k in range(i, len(s)):
        if s[k] == oc:
            depth += 1
        elif s[k] == cc:
            depth -= 1
            if depth == 0:
                return s[m.start():k + 1]
    return None


def inject(js: str) -> int:
    """把 RUNSTATE 写进页面或 data.js。

    ★ 2026-10-04：数据已外置到 data.js ★
      页面里的常量现在是 `const RUNSTATE = (window.STDWATCH_DATA && ...)`。
      原来这个函数往页面里塞字面量 —— 每次跑都把页面改回"未抽取"形态，
      和外置改造打架（extract_data.py 的幂等判据因此反复失效）。
      所以：**页面已引用 data.js 时改 data.js，否则才动页面。**

      返回 2 = 只改了 data.js；1 = 改了页面；0 = 没改成。
    """
    s = io.open(PROTO, encoding="utf-8").read()
    body = js[js.index("const RUNSTATE = "):].rstrip().rstrip(";")
    lit = body[body.index("{"):body.rindex("}") + 1]

    # ---- 情形一：页面已外置 → 只更新 data.js 里的 RUNSTATE ----
    if "window.STDWATCH_DATA" in s and os.path.exists(DATAJS):
        d = io.open(DATAJS, encoding="utf-8").read()
        m = re.search(r"^\s*RUNSTATE\s*:\s*", d, re.M)
        if m:
            st = d.index("{", m.end() - 1)
            depth = 0
            for k in range(st, len(d)):
                if d[k] == "{":
                    depth += 1
                elif d[k] == "}":
                    depth -= 1
                    if depth == 0:
                        break
            d = d[:st] + lit + d[k + 1:]
            io.open(DATAJS, "w", encoding="utf-8").write(d)
            return 2

    # ---- 情形二：页面仍是内嵌字面量 → 替换它 ----
    old = _literal_of(s, "RUNSTATE")
    if old:
        st = s.index(old)
        s = s[:st] + body + s[st + len(old):]
        io.open(PROTO, "w", encoding="utf-8").write(s)
        return 1

    # ---- 情形三：页面里没有（首次）→ 插到 LOGS 之前 ----
    anchor = "const LOGS ="
    if anchor in s:
        i = s.index(anchor)
        s = s[:i] + js + "\n" + s[i:]
        io.open(PROTO, "w", encoding="utf-8").write(s)
        return 1
    return 0


def main() -> int:
    st = collect()
    st["logs"] = build_logs(st)
    io.open(OUT, "w", encoding="utf-8").write(render(st))
    where = inject(render(st))
    print("  注入位置  {}".format(
        "data.js（数据已外置）" if where == 2 else "index.html"))

    print("运行状态：")
    print("  上次检查  {}".format(st["lastRun"]
                                   + "（{}）".format(st["lastRunDetail"])))
    print("  下次检查  {}".format(st["nextRun"]))
    print("  健康      {}".format("正常" if st["healthy"] else "★ 已逾期/未运行"))
    print("  各源：")
    for x in st["sources"]:
        n = x["count"]
        tag = "文件损坏" if n < 0 else ("{} 条".format(n) if n else "0 条")
        print("    {} {:<10} {:<26} {}".format(
            x["code"], tag, x["file"], x["mtime"] or "无快照"))
    for x in st["extras"]:
        n = x["count"]
        print("    {:<8} {:<10} {:<26} {}".format(
            x["label"], "{} 条".format(n) if n >= 0 else "损坏",
            x["file"], x["mtime"] or "无快照"))
    if not st["healthy"]:
        print()
        print("  ⚠ 页面会显示「未按时检查」。要恢复每日自动检查，见 README：")
        print("    python scripts/daily_check.py          （计划任务每天 07:00 调它）")
        print("    常驻模式：python scripts/crawler.py --serve")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())