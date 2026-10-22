#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""CI 闸门：数据合理性检查（条数断崖检测）。

================================================================
为什么必须有这个脚本
================================================================
daily_check.py 校验的是「结构对不对」—— 字段齐不齐、条数是不是 0、
RUNSTATE 完不完整。它**不校验数量是否合理**。

真实踩过的坑：某个源改版后分页参数失效，返回第一页 20 条，
结构完全合法，条数从 1800 掉到 20。daily_check.py 会判定「OK」，
然后把这份数据推上线。用户看到的是一份只剩 20 条的"完整清单"，
而且页面上没有任何异常提示 —— 这比直接报错危险得多。

所以这里补第二道闸门：**条数断崖 = 直接失败，不推上线**。

================================================================
★ 阈值是怎么定的（这里踩过一次坑，别再拍脑袋）
================================================================
第一版我按「感觉这个字段应该有 40 条」给 ALERTS 和 REFGROUPS 设了绝对下限，
结果第一次跑就误报：
    REFGROUPS = 12  -> 被判「低于下限 40」
    ALERTS    = 2   -> 被判「低于下限 5」

查了实际数据才发现，这两个字段**天生就小**，根本不是"抓少了"：

  REFGROUPS = 通则引用的**分组数**，不是标准数。
             12 组是对的，每组内部才装几十条标准。
             用「标准数」的量级去卡它，必然误报。
  ALERTS    = **近期要办的事**，按时间窗过滤后的结果。
             现在只有 2 条，说明近半年没什么大事，**这恰恰是好消息**。
             给它设下限是彻底的方向性错误 —— 官方越久没动静，它越少。

结论：**阈值必须按字段性质定，不能按量级猜**。分三类：

  A 类·单调累积型（STD / LAWS）
    只会缓慢增长，突然下跌一定是坏了 → 严格下限 + 严跌幅
  B 类·结构型（REFGROUPS）
    分组数，天然小且基本不变 → 只卡跌幅，不卡绝对下限
  C 类·事件型（ALERTS / ERATA）
    数量取决于"最近发生了多少事"，少是正常的 → **只卡跌幅**，
    且跌幅阈值放宽到 60%/50%。涨要多少都不管。

硬性规则：**ALERTS 和 ERATA 永远不设绝对下限。**
它们归零往往正是"官方没动静"的正常表现。
"""
import argparse
import json
import os
import subprocess
import sys

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")

# key -> (绝对下限 or None, 最大跌幅比例)
#   绝对下限 None = 不卡绝对值（理由见上方分类）
#   只拦下跌，不拦上涨：新增标准本来就是好事
LIMITS = {
    "STD":       (250, 0.10),   # A 累积型：主体清单，最不该大幅下跌
    "LAWS":      (25,  0.15),   # A 累积型：法规会持续增加
    "REFGROUPS": (None, 0.25),  # B 结构型：分组数，只卡跌幅
    "ERATA":     (None, 0.50),  # C 事件型：**绝不设下限**
    "ALERTS":    (None, 0.60),  # C 事件型：**绝不设下限**
}

VERIFY_JS = """
global.window = {};
require(process.argv[1]);
const d = global.window.STDWATCH_DATA || {};
const out = {};
for (const k of ['STD','REFGROUPS','LAWS','ALERTS','ERATA']) {
  out[k] = Array.isArray(d[k]) ? d[k].length : 0;
}
console.log(JSON.stringify(out));
"""


def counts_of(js_path):
    """读某个 data.js 里各集合的条数。"""
    node = os.environ.get("STDWATCH_NODE") or "node"
    r = subprocess.run([node, "-e", VERIFY_JS, js_path],
                       capture_output=True, text=True, encoding="utf-8")
    if r.returncode != 0:
        print("   node 读取 %s 失败：%s"
              % (js_path, (r.stderr or "").strip()[:300]))
        return None
    line = (r.stdout or "").strip().split("\n")[-1]
    try:
        return json.loads(line)
    except Exception as e:
        print("   解析失败：%s / %s" % (line[:200], e))
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--before-file", default=None)
    args = ap.parse_args()

    before_file = args.before_file
    if before_file and not os.path.exists(before_file):
        before_file = None

    after_path = os.path.join(ROOT, "prototype", "data.js")
    if not os.path.exists(after_path):
        print("[x] prototype/data.js 不存在")
        return 1

    after = counts_of(after_path)
    if after is None:
        print("[x] 无法读取当前 data.js")
        return 1

    before = counts_of(before_file) if before_file else None
    print("-- 条数检查")
    if before:
        print("   基线来自：%s" % before_file)
    else:
        print("   无基线可比（首次运行），只对累积型字段做绝对下限检查")

    bad = []
    for k, (floor, max_drop) in LIMITS.items():
        a = after.get(k, 0)
        b = before.get(k, 0) if before else None
        mark = " "
        why = None
        if floor is not None and a < floor:
            mark = "!"
            why = "%s = %d，低于绝对下限 %d" % (k, a, floor)
        elif b:
            # b 为 0 时不做比例判断（除以 0），且"从 0 涨到 N"本就不该拦
            drop = (b - a) / b if b > 0 else 0.0
            if drop > max_drop:
                mark = "!"
                why = ("%s 从 %d 掉到 %d（-%.0f%%，超过允许的 -%.0f%%）"
                       % (k, b, a, drop * 100, max_drop * 100))
        if why:
            bad.append(why)
        print("   %s %-10s %6s -> %6s" % (mark, k,
                                          b if b is not None else "-", a))

    if bad:
        print()
        print("[x] 检测到数据异常，**拒绝推送**。逐项说明：")
        for x in bad:
            print("    - " + x)
        print()
        print("    这几乎一定是某个源的接口改版或分页失效，不是官方真的撤回了标准。")
        print("    请人工核查后再决定怎么处理，不要为了让它通过而放宽阈值。")
        return 1

    print("   所有条目在合理范围内。")
    print("   注：ALERTS / ERATA 条数少是正常的，不作为异常依据。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())