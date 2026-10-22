#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""统计 GitHub Actions 额度消耗（分钟）。

额度按**总时长**算，不是次数 —— GitHub Free 私有仓库 2000 分钟/月。
一次完整抓取 20~24 分钟；deploy_only 快通道 1 分钟。

用法：python scripts/quota.py
"""
import json, urllib.request, os, sys, datetime
from collections import defaultdict
sys.stdout.reconfigure(encoding='utf-8')

TOKEN = os.environ.get("GITHUB_TOKEN", "")
REPO = 'xiongying118/infant-std-watch'


def api(path):
    import time
    # 全量 runs 响应有 500KB+，网络容易中断 → 必须带重试
    for k in range(5):
        try:
            req = urllib.request.Request('https://api.github.com/repos/%s%s' % (REPO, path),
                headers={'Authorization': 'Bearer ' + TOKEN,
                         'Accept': 'application/vnd.github+json',
                         'User-Agent': 'Mozilla/5.0'})
            raw = urllib.request.urlopen(req, timeout=90).read()
            return json.loads(raw.decode())
        except Exception as e:
            if k == 4:
                raise
            time.sleep(2*(k+1))


runs = []
for page in (1, 2, 3, 4):
    r = api('/actions/workflows/daily-check.yml/runs?per_page=100&page=%d' % page)
    got = r.get('workflow_runs', [])
    runs += got
    if len(got) < 100:
        break

print('=== 全量运行记录 ===')
print('总次数：%d' % len(runs))


def parse(s):
    return datetime.datetime.strptime(s, '%Y-%m-%dT%H:%M:%SZ')


rows = []
for x in runs:
    st = parse(x['run_started_at'])
    en = parse(x['updated_at'])
    mins = (en - st).total_seconds() / 60.0
    rows.append((x['created_at'][:10], x['created_at'][11:16], mins,
                 x['conclusion'], x['event']))

rows.sort()
oct_rows = [r for r in rows if r[0] >= '2026-10-01']
total = sum(r[2] for r in oct_rows)

print()
print('=== 2026-10 消耗 ===')
print('运行 %d 次 · 合计 %.0f 分钟（约 %.1f 小时）' % (len(oct_rows), total, total / 60))
print()
print('%-12s %-6s %8s  %-10s %s' % ('日期', '时刻', '耗时', '结果', '触发方式'))
for d, t, m, c, e in oct_rows:
    print('%-12s %-6s %7.0f分  %-10s %s' % (d, t, m, c, e))

# 按月汇总所有月份
print()
print('=== 按月 ===')
by = defaultdict(lambda: [0, 0.0])
for d, t, m, c, e in rows:
    by[d[:7]][0] += 1
    by[d[:7]][1] += m
for k in sorted(by):
    n, m = by[k]
    print('  %s  %2d 次  %5.0f 分钟' % (k, n, m))

# 定时 vs 手动
print()
print('=== 触发方式 ===')
byev = defaultdict(lambda: [0, 0.0])
for d, t, m, c, e in oct_rows:
    byev[e][0] += 1
    byev[e][1] += m
for k, (n, m) in byev.items():
    print('  %-12s %2d 次  %5.0f 分钟' % (k, n, m))

# 额度评估
print()
print('=== 额度评估（Free 私有仓库 2000 分钟/月）===')
today = datetime.date.today()
days_used = (today - datetime.date(2026, 10, 1)).days + 1
schedule_days = sum(1 for r in oct_rows if r[4] == 'schedule')
manual = [r for r in oct_rows if r[4] != 'schedule']
print('本月已过 %d 天' % days_used)
print('  定时触发 %d 次（每天一次）· %.0f 分钟' % (schedule_days,
      sum(r[2] for r in oct_rows if r[4] == 'schedule')))
print('  手动触发 %d 次 · %.0f 分钟' % (len(manual), sum(r[2] for r in manual)))
print()
per_day = total / days_used
print('当前日均 %.0f 分钟' % per_day)
print('按日均跑完整月：%.0f 分钟  →  %s'
      % (per_day * 30, '够用' if per_day * 30 <= 2000 else '会超'))
print()
fast_days = sum(1 for r in oct_rows if r[2] < 5)
print('耗时 <5 分钟的运行：%d 次（这些是 deploy_only 快通道）' % fast_days)
print('耗时 >15 分钟的运行：%d 次（这些是完整抓取）'
      % sum(1 for r in oct_rows if r[2] > 15))