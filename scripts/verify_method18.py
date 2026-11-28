# -*- coding: utf-8 -*-
"""只读核对：用用户提供的 18 份 docx 重新解析，与页面上现有 18 条逐条比对。

★ 不写任何数据文件（不调用 fetch_method_principles.main），只出报告。
"""
import glob
import importlib.util
import io
import json
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "scripts", "fetch_method_principles.py")
DIR = r"D:\食品标准\检测方法原理"

spec = importlib.util.spec_from_file_location("fmp", SRC)
fmp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fmp)


def norm(x):
    return "".join(str(x).split())


def main():
    files = sorted(glob.glob(os.path.join(DIR, "*.docx")))
    print("docx 文件：%d 份" % len(files))

    ref = {}
    for fp in files:
        raw = open(fp, "rb").read()
        paras = fmp.docx_paragraphs(raw)
        d = fmp.parse_doc(os.path.basename(fp), paras)
        if not d["stdNo"]:
            import re
            m = re.search(r"((?:GB|GB/T)[\d.]+-\d{4})", os.path.basename(fp))
            d["stdNo"] = m.group(1) if m else ""
        ref[d["stdNo"]] = d

    txt = io.open(os.path.join(ROOT, "data", "_methodjs.txt"), encoding="utf-8").read()
    # 用 node 解析（文件是 JS 字面量，混合双/单引号键）
    tmp = os.path.join(ROOT, "data", "_tmp_verify.js")
    io.open(tmp, "w", encoding="utf-8", newline="\n").write(
        "var A=" + txt + ";console.log(JSON.stringify(A));")
    cur = json.loads(os.popen('node "%s"' % tmp).read())
    os.remove(tmp)

    by = {o["stdNo"]: o for o in cur}
    print("页面条目：%d 条" % len(cur))
    print("docx 命中的标准号：%d 个\n" % len(ref))

    same = 0
    diffs = []
    for no, r in sorted(ref.items()):
        c = by.get(no)
        if not c:
            diffs.append((no, "页面缺失", ""))
            continue
        issues = []
        if norm(c["principle"]) != norm(r["principle"]):
            issues.append("principle")
        # 试剂：数量 + 名称 + 作用
        cr = [(norm(x["name"]), norm(x["role"])) for x in c["reagents"]]
        rr = [(norm(x["name"]), norm(x["role"])) for x in r["reagents"]]
        if cr != rr:
            issues.append("reagents(%d→%d)" % (len(rr), len(cr)))
        cs = [(norm(s["h"]), [norm(i) for i in s["items"]]) for s in c["sections"]]
        rs = [(norm(s["h"]), [norm(i) for i in s["items"]]) for s in r["sections"]]
        if cs != rs:
            issues.append("sections(%d→%d)" % (len(rs), len(cs)))
        if norm(c.get("method", "")) != norm(r.get("method", "")):
            issues.append("method[%s→%s]" % (r.get("method", ""), c.get("method", "")))
        if issues:
            diffs.append((no, "、".join(issues), r.get("title", "")))
        else:
            same += 1

    print("完全一致：%d / %d" % (same, len(ref)))
    if diffs:
        print("\n有差异的条目：")
        for no, why, ti in diffs:
            print("  · %s  %s  %s" % (no, why, ti))
    else:
        print("★ 18 条与 docx 逐字一致（忽略空白差异），页面上一个字没动。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
