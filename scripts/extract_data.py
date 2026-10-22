#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把页面里会变的数据抽成外部 data.js，页面从它读取。

================================================================
为什么必须做这一步
================================================================
2026-10-04 用户问「今天怎么没看到自动检查」。查下来：即使配了定时任务，
抓到新数据了，页面还是得有人重新生成 + 部署一次才能看到 ——
**静态 HTML 内嵌数据 = 每次变更都要重新发布整个页面**。

所以真正的修法不是配个定时器，而是把数据与代码分离：
    数据（会变）→ prototype/data.js
    代码（不变）→ 留在 index.html
这样云端每天只更新 data.js 一个文件，不用重新构建整站。

================================================================
拆分口径
================================================================
抽成 data.js（会变）：
    STD / REFGROUPS / SOONPOOL / ERATA / ALERTS / KWS / SUBS
    HIST / LAWS / CATS / LAW_KINDS / SRCS / RUNSTATE

留在 index.html（不变）：
    TITLES（页面标题映射）、ROLES（权限角色）、PERM（口令散列）、各类函数
    LOGS 也不抽 —— 它现在是 `const LOGS = RUNSTATE.logs`，是派生值不是字面量。

为什么 CATS 也抽出去：它由 sync_std_to_proto.py 生成，不是人手写的。
留在页面里等于两处真相。
"""
import io
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
PROTO = os.path.join(ROOT, "prototype", "index.html")
OUTJS = os.path.join(ROOT, "prototype", "data.js")
# ---------------------------------------------------------------- node 定位
# 原来这里写死了本机的 node 绝对路径（…/.workbuddy/binaries/node/versions/…），
# 换台机器 / 放到 Linux CI runner 上就直接 FileNotFoundError。
# 现在按「环境变量 → PATH → 本机已知位置」三级回退。
NODE_ENV = "STDWATCH_NODE"


def find_node():
    c = os.environ.get(NODE_ENV)
    if c and os.path.exists(c):
        return c
    p = shutil.which("node") or shutil.which("node.exe")
    if p:
        return p
    guess = (r"C:\Users\13104\.workbuddy\binaries\node"
             r"\versions\22.22.2-3\node.exe")
    return guess if os.path.exists(guess) else "node"


NODE = find_node()

EXPORT = ["STD", "REFGROUPS", "SOONPOOL", "ERATA", "ALERTS", "KWS", "SUBS",
          "HIST", "LAWS", "CATS", "LAW_KINDS", "SRCS", "RUNSTATE",
          # CNAS 认可规范（2026-10-07 新增，页面上是独立一页）
          "CNASDOCS", "CNASKINDS"]


def cut_literal(s, name):
    """切出 const <name> = <字面量> 的区间，返回 (start, end)。

    ★ 必须先排除「引用形态」 ★
      `const STD = (window.STDWATCH_DATA && …) || [];` 里的 `|| []`
      会被当成数组字面量的开头，切出一大段垃圾 —— 于是幂等判定永远
      认为页面"还有字面量"，反复尝试抽取。实测踩过。
    """
    m = re.search(r"^const " + name + r"\s*=\s*", s, re.M)
    if not m:
        return None
    if re.match(r"\(\s*window\.STDWATCH_DATA", s[m.end():]):
        return None                       # 已是引用形态，不算字面量
    i = m.end()
    if name == "RUNSTATE":
        a = s.index("{", i)
        depth = 0
        for k in range(a, len(s)):
            if s[k] == "{":
                depth += 1
            elif s[k] == "}":
                depth -= 1
                if depth == 0:
                    return m.start(), k + 1
        return None
    if i >= len(s) or s[i] not in "[{":
        return None
    open_c = s[i]
    close_c = "]" if open_c == "[" else "}"
    depth = 0
    for k in range(i, len(s)):
        if s[k] == open_c:
            depth += 1
        elif s[k] == close_c:
            depth -= 1
            if depth == 0:
                return m.start(), k + 1
    return None


HDR = """/* ==========================================================================
   标准雷达 · 数据文件（自动生成，勿手改）
   ==========================================================================
   生成命令： python scripts/extract_data.py
   生成时间： {stamp}

   为什么把数据抽出来
     原来数据内嵌在 index.html 里（约 270 KB），导致：
       每天抓到新数据 → 要重新生成整页 → 要重新部署整站
     现在数据在这个文件里，页面读它：
       每天抓到新数据 → 只更新这一个文件
     这是让「云端定时检查」真正能落地的前提。

   加载失败会怎样
     页面不白屏 —— index.html 里有兜底提示，明确告诉用户
     「数据加载失败」而不是「没有变更」。这两者混淆会让人误判。
   ========================================================================== */
window.STDWATCH_DATA = {{
"""


def _verify_only() -> int:
    """只校验 data.js 能解析且条数合理（幂等路径用）。"""
    if not os.path.exists(NODE):
        return 0
    js = ("global.window={};require('./prototype/data.js');"
          "const d=global.window.STDWATCH_DATA;"
          "console.log(Object.keys(d).map(k=>k+':'+(Array.isArray(d[k])?d[k].length"
          ":(typeof d[k]==='object'?'obj':'?'))).join(' '));")
    r = subprocess.run([NODE, "-e", js], cwd=ROOT,
                       capture_output=True, text=True, encoding="utf-8")
    if r.returncode != 0:
        print("[x] data.js 解析失败：")
        print("    " + ((r.stdout or "") + (r.stderr or "")).strip()[:500])
        return 1
    print("    data.js 解析: " + (r.stdout or "").strip())
    return 0


def main() -> int:
    s = io.open(PROTO, encoding="utf-8").read()
    orig_len = len(s)

    spans = {}
    for name in EXPORT:
        r = cut_literal(s, name)
        if r:
            spans[name] = r
    missing = [n for n in EXPORT if n not in spans]

    # ★ 幂等判定 ★
    #   cut_literal 能切出字面量 → 页面处于「未抽取」状态 → 该抽。
    #   一个都切不出来（全是 `const X = (window.STDWATCH_DATA && …)`）
    #   → 页面已外置 → 只校验 data.js 就行。
    #
    #   ★ 这里判断反过一次 ★
    #     原来写成 `if still_literal:` 就走"已抽完"分支 ——
    #     而 still_literal 非空恰恰说明**还没抽**。
    #     结果恢复备份后（干净的字面量版）反而报"已引用 data.js，跳过抽取"，
    #     页面停在未抽取形态，data.js 却是旧的。
    still_literal = [n for n in EXPORT if n in spans]

    if not still_literal:
        if os.path.exists(OUTJS):
            print("    页面已引用 data.js（跳过抽取），校验现有 data.js")
            return _verify_only()
        print("[x] 页面是引用形态但 data.js 不存在，请从 data/index.html.bak 恢复")
        return 1
    if missing:
        # 页面处于"未抽取"状态，但有常量找不到 → 名字对不上，
        #   硬抽会漏数据（页面少一个数组却不报错）。必须停下。
        print("[x] 页面里找不到这些常量: " + " / ".join(missing))
        print("    可能是常量被改名了，或页面被手工改过")
        return 1
    # 直接搬运原文而不重新序列化：保证与页面运行结果完全一致。
    # 重新序列化会丢注释、丢格式，还可能改字符串转义 —— 风险不必要。
    parts = [HDR.format(stamp=datetime.now().strftime("%Y-%m-%d %H:%M:%S"))]
    for name in EXPORT:
        body = s[spans[name][0]:spans[name][1]]
        lit = body[body.index("=") + 1:].strip().rstrip(";")
        parts.append("  /* ---- %s ---- */\n  %s: %s,\n" % (name, name, lit))
    parts.append("};\n")
    io.open(OUTJS, "w", encoding="utf-8").write("".join(parts))

    # ---- 改页面：常量换成从 window 读 ----
    for name, (st, en) in sorted(spans.items(), key=lambda kv: -kv[1][0]):
        # ★ 兜底值要按类型给 ★
        #   RUNSTATE 是对象，用 [] 会让 renderRunState 里 RUNSTATE.logs 报 undefined
        #   —— 不报错但日志整块空掉，正是本项目最危险的"静默失败"。
        fb = "{}" if name == "RUNSTATE" else "[]"
        repl = ("const %s = (window.STDWATCH_DATA && window.STDWATCH_DATA.%s) || %s;"
                % (name, name, fb))
        s = s[:st] + repl + s[en:]

    # ---- 插入 data.js 引用 ----
    if 'src="data.js"' not in s:
        anchor = "<script>"
        i = s.index(anchor)
        inject = (
            '<script src="data.js"></script>\n'
            '<!-- data.js 缺失时给出明确提示，不能静默空白 -->\n'
            '<script>\n'
            'if(!window.STDWATCH_DATA){\n'
            '  document.addEventListener("DOMContentLoaded",function(){\n'
            '    var b=document.getElementById("dataLoadFail");\n'
            '    if(b) b.style.display="block";\n'
            '  });\n'
            '}\n'
            '</script>\n')
        s = s[:i] + inject + s[i:]

    io.open(PROTO, "w", encoding="utf-8").write(s)

    # ---- 校验 data.js 能被解析 ----
    if not os.path.exists(NODE):
        print("    (跳过 Node 校验)")
        return 0
    js = ("global.window={};require('./prototype/data.js');"
          "const d=global.window.STDWATCH_DATA;"
          "console.log(Object.keys(d).map(k=>k+':'+(Array.isArray(d[k])?d[k].length"
          ":(typeof d[k]==='object'?'obj':'?'))).join(' '));")
    r = subprocess.run([NODE, "-e", js], cwd=ROOT,
                       capture_output=True, text=True, encoding="utf-8")
    if r.returncode != 0:
        print("[x] data.js 解析失败：")
        print("    " + ((r.stdout or "") + (r.stderr or "")).strip()[:500])
        return 1
    print("    data.js 解析: " + (r.stdout or "").strip())

    print()
    print("index.html  %d KB -> %d KB" % (orig_len // 1024, len(s) // 1024))
    print("data.js     %d KB" % (os.path.getsize(OUTJS) // 1024))
    print("抽出 %d 个常量" % len(EXPORT))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())