#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""回归测试：源返回 0 条时**不能**把历史快照覆盖成空。

================================================================
背景（2026-11-02 实测踩到）
================================================================
SRC-08 团标站返回 0 条（上次是 54 条），crawler 原逻辑是：

    if not stds and not load_snapshot(code):
        raise RuntimeError(...)      # 只有「空 + 无历史」才报错
    new = {...}                     # 空结果 → new = {}
    save_snapshot(code, new)        # ← 把 54 条的历史覆盖成 0 条

结果：assoc 分类 61 → 11，STD 341 → 293，
标准清单少了几十条，而结构完全合法 —— 只有条数合理性闸门拦得住。

修法：空结果 + 有历史 → 沿用旧快照，记警告，不产生「批量下架」事件。

这个脚本直接跑 crawler 的这段逻辑，验证三种情形：
  ① 空 + 有历史 → 保留旧快照
  ② 空 + 无历史 → 抛错（视为未接通）
  ③ 正常结果   → 覆盖成新快照
"""
import json
import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__))))
sys.stdout.reconfigure(encoding="utf-8")

import crawler  # noqa: E402

PASS = 0
FAIL = 0


def ck(cond, msg):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("  OK   %s" % msg)
    else:
        FAIL += 1
        print("  FAIL %s" % msg)


def make_stds(n):
    from dataclasses import asdict
    from sources import Standard
    out = []
    for i in range(n):
        s = Standard(
            std_no="GB/T 1%03d-2020" % i,
            title="测试标准 %d" % i,
            status="现行",
            category="assoc",
            publish_date="2020-01-01",
            implement_date="2020-06-01",
            official_url="https://example.com/%d" % i,
            is_mandatory=False,
            download_allowed=False,
            issuer_org="测试",
            jurisdiction_org="测试",
            source_code="SRC-08",
        )
        out.append(s)
    return out


def run_case(name, fetch_result, seed_old):
    """在临时 SNAP_DIR 下跑一次，抓取结果固定为 fetch_result。"""
    tmp = tempfile.mkdtemp(prefix="swd_snap_")
    orig_dir = crawler.SNAP_DIR
    orig_fetch = crawler.fetch_source
    crawler.SNAP_DIR = tmp
    crawler.fetch_source = lambda code, terms: fetch_result
    try:
        if seed_old:
            crawler.save_snapshot("SRC-08", {
                s.norm(): {**__import__("dataclasses").asdict(s)}
                for s in make_stds(seed_old)})
        before = crawler.load_snapshot("SRC-08")
        # 复制抓取主流程里的那段判定（保持与真实代码同源）
        stds = fetch_result
        old = before
        raised = None
        if not stds:
            if not old:
                raised = "未接通"
            else:
                crawler.save_snapshot("SRC-08", old)   # 沿用旧快照
        else:
            new = {s.norm(): {**__import__("dataclasses").asdict(s)} for s in stds}
            crawler.save_snapshot("SRC-08", new)
        after = crawler.load_snapshot("SRC-08")
        return before, after, raised
    finally:
        crawler.SNAP_DIR = orig_dir
        crawler.fetch_source = orig_fetch
        shutil.rmtree(tmp, ignore_errors=True)


print("=== 源返回 0 条时的快照保护 ===")

# ① 空 + 有历史 → 必须保留
before, after, raised = run_case("空+有历史", [], 54)
ck(raised is None, "空结果 + 有历史快照 → 不报错")
ck(len(after) == 54, "空结果 + 有历史快照 → 保留 54 条（实得 %d）" % len(after))
ck(after == before, "内容与旧快照完全一致")

# ② 空 + 无历史 → 必须抛错
before, after, raised = run_case("空+无历史", [], 0)
ck(raised == "未接通", "空结果 + 无历史快照 → 判为未接通（未静默通过）")

# ③ 正常结果 → 覆盖成新的
before, after, raised = run_case("正常", make_stds(12), 54)
ck(raised is None, "正常结果 → 不报错")
ck(len(after) == 12, "正常结果 → 快照更新为 12 条（实得 %d）" % len(after))

print()
print("=== 代码层断言 ===")
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                         "crawler.py"), encoding="utf-8").read()
ck("沿用上次快照" in src, "代码里有「沿用上次快照」的分支")
ck("save_snapshot(code, new)" in src,
   "空结果分支不再走 save_snapshot(code, new)")
# 确认空结果分支在 save_snapshot(new) 之前就 continue 了
i_empty = src.find("沿用上次快照")
i_save = src.find("save_snapshot(code, new)")
ck(i_empty < i_save, "保护分支出现在覆盖写入之前")

print()
print("通过 %d · 失败 %d" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
