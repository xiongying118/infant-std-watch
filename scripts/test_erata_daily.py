# -*- coding: utf-8 -*-
"""test_erata_daily.py —— 校验「通则引用标准的勘误/修改单每日抓取」链路

★ 为什么要专门写这个（2026-11-05）★
  用户原话：「特别是通则引用标准里的更新、勘误修改每天一定要抓取」
  实测查出**五处断链**，每一处都让"每日更新"名存实亡：
    ① expand_refscope.py 不在每日流程 → 范围停在 10-03 那版，漏现行标准
    ② build_erata_js.py 不在每日流程 → 页面勘误列表永远不更新
    ③ _erata_fresh.json / _mods.json 没人写 → 页面数据源是空的
    ④ is_relevant_erata 关键词表误杀 → 范围内的标准被当成"不相关"
    ⑤ low 级勘误整条丢弃 → 页面只收 mid/high

  这个测试把这五条逐条钉死，防止以后再断。

跑法：python scripts/test_erata_daily.py
"""
from __future__ import annotations

import io
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
sys.path.insert(0, HERE)
sys.stdout.reconfigure(encoding="utf-8")

PASS = 0
FAIL = 0


def ck(ok: bool, msg: str) -> None:
    global PASS, FAIL
    if ok:
        PASS += 1
        print("  ✓ " + msg)
    else:
        FAIL += 1
        print("  ✗ " + msg)


def read(rel: str) -> str:
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        return ""
    return io.open(p, encoding="utf-8", newline="").read()


def main() -> int:
    print("=== ① 每日流程必须包含全部关键脚本 ===")
    dc = read("scripts/daily_check.py")
    for name, why in [
        ("expand_refscope.py", "刷新通则引用范围（漏了它范围永远停在旧版）"),
        ("build_erata_js.py", "生成页面 ERATA 段（漏了它页面勘误永不更新）"),
        ("fetch_ref_details.py", "补抓引用标准元数据"),
        ("fill_replacements.py", "补全跨号替代关系"),
    ]:
        ck(name in dc, f"daily_check 里有 {name} —— {why}")
    ck("--daily" in dc, "expand_refscope 用 --daily 轻量模式（不联网、不解析 PDF）")

    print()
    print("=== ② 页面数据源必须有人写 ===")
    cr = read("scripts/crawler.py")
    ck("_erata_fresh.json" in cr, "crawler.py 会写 data/_erata_fresh.json")
    ck("_mods.json" in cr, "crawler.py 会写 data/_mods.json")

    print()
    print("=== ③ 范围数据必须新鲜且覆盖现行标准 ===")
    import erata as E
    scope = E._refscope()
    ck(len(scope) >= 95, f"refscope 有 {len(scope)} 个标准（应 ≥95）")
    # 之前漏掉的 5 个现行标准必须都在
    for no, why in [
        ("GB 5009.229", "酸价（2025 新版）"),
        ("GB 5009.227", "过氧化值"),
        ("GB 5009.16", "锡"),
        ("GB 4789.14", "蜡样芽孢杆菌"),
        ("JJF 1070", "定量包装商品净含量计量检验规则"),
    ]:
        ck(E._refkey(no) in scope, f"范围内含 {no}（{why}）")

    print()
    print("=== ④ 范围内一条都不能被关键词表误杀 ===")
    # 官方勘误快照里，范围内且实际存在的条目
    snap_p = os.path.join(ROOT, "data", "snapshots", "erata_latest.json")
    snap = json.load(io.open(snap_p, encoding="utf-8")) if os.path.exists(snap_p) else []
    in_scope = [e for e in snap if E.in_ref_scope(e.get("std_no", ""))]
    killed = [e for e in in_scope if not E.is_relevant_erata(e)]
    ck(not killed, "范围内勘误全部判为相关（未判相关的：%d 条）" % len(killed))
    for e in killed[:5]:
        print("      被误杀：%s %s" % (e.get("std_no"), (e.get("section") or "")[:20]))

    print()
    print("=== ⑤ 页面 ERATA 必须全收（含 low 级）===")
    import inspect
    sig = inspect.signature(E.build_erata_alerts)
    ck("include_low" in sig.parameters, "build_erata_alerts 有 include_low 参数")
    bej = read("scripts/build_erata_js.py")
    ck(bej.count("include_low=True") >= 2,
       "build_erata_js 用 include_low=True 填页面（%d 处）" % bej.count("include_low=True"))
    # 实跑：范围内多少条，页面收多少条
    got = E.build_erata_alerts(in_scope, include_low=True)
    ck(len(got) == len(in_scope),
       "范围内 %d 条 → 页面收 %d 条" % (len(in_scope), len(got)))
    # 推提醒仍只推 mid/high
    hi = E.build_erata_alerts(in_scope, include_low=False)
    ck(len(hi) <= len(got), "推提醒只推 mid/high（%d 条 ≤ 页面 %d 条）" % (len(hi), len(got)))

    print()
    print("=== ⑥ data.js 里的 ERATA 段必须是最新且完整 ===")
    import subprocess
    node = shutil_which = None
    for c in ("node", "node.exe"):
        try:
            node = subprocess.run([c, "-v"], capture_output=True).returncode == 0
            if node:
                node = c
                break
        except Exception:
            continue
    if not node:
        print("  (跳过：没找到 node)")
    else:
        js = ("global.window={};require('./prototype/data.js');"
              "const d=global.window.STDWATCH_DATA;"
              "console.log(JSON.stringify({"
              "n:d.ERATA.length,"
              "nos:new Set(d.ERATA.map(e=>e.no.replace(/-\\d{4}$/,''))).size,"
              "mods:d.ERATA.filter(e=>e.kind==='MOD').length,"
              "low:d.ERATA.filter(e=>e.lvl==='low').length,"
              "std:d.STD.length,rg:d.REFGROUPS.length,jsa:d.JSA[0].zones.length,"
              "qm:d.QMTOOLS[0].tools.length,rd:d.RDTOOLS[0].modules.length}));")
        r = subprocess.run([node, "-e", js], cwd=ROOT, capture_output=True,
                           text=True, encoding="utf-8")
        if r.returncode != 0:
            ck(False, "data.js 解析失败：" + ((r.stderr or "")[:200]))
        else:
            d = json.loads((r.stdout or "").strip())
            # data.js 的 ERATA = 范围内勘误 + 修改单
            ck(d["n"] >= len(in_scope),
               "data.js ERATA %d 条（官方范围内勘误 %d 条 + 修改单）" % (d["n"], len(in_scope)))
            ck(d["n"] == len(in_scope) + d["mods"],
               "条数完全对齐：%d = 勘误 %d + 修改单 %d" % (d["n"], len(in_scope), d["mods"]))
            ck(d["nos"] >= 20, "涉及 %d 个标准（应 ≥20）" % d["nos"])
            ck(d["mods"] >= 5, "含 %d 条修改单（应 ≥5）" % d["mods"])
            ck(d["low"] > 0, "含 %d 条 low 级文字性修正（页面要能查全）" % d["low"])
            ck(d["std"] >= 340, "STD 库 %d 条（未被破坏）" % d["std"])
            ck(d["rg"] >= 13, "REFGROUPS %d 组（未被破坏）" % d["rg"])
            ck(d["jsa"] == 18, "JSA 18 区（未被破坏）")
            ck(d["qm"] == 16, "QM 工具 16 个（未被破坏）")
            ck(d["rd"] == 18, "RD 模块 18 个（未被破坏）")

    print()
    print("=== ⑥b 去重键必须带内容指纹（同一章节可能有多条不同勘误）===")
    bej_src = read("scripts/build_erata_js.py")
    ck('fp = str(e.get("before")' in bej_src,
       "去重键含 before/after 指纹（否则同章节的多条勘误会被误丢）")

    print()
    print("=== ⑦ 修改单必须来自官方全库（勘误专库不收录）===")
    src = read("scripts/sources.py")
    ck('TAB_ERATA = "4"' in src, "勘误走专库 num_tn=4")
    ck('TAB_ALL = "99"' in src, "修改单走全库 num_tn=99")
    ck("def amendments(" in src, "sources.py 有 amendments() 单独抓修改单")
    ck("amendments_with_summary" in cr, "crawler.py 调用 amendments_with_summary")

    print()
    print("=" * 60)
    print("  通过 %d / 失败 %d" % (PASS, FAIL))
    print("=" * 60)
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
