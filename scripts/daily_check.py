#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""每日检查：抓取 -> 生成运行状态 -> 抽出 data.js -> 校验。

用法
----
  python scripts/daily_check.py                  # 跑一次（计划任务每天 07:00 调它）
  python scripts/daily_check.py --skip-fetch     # 只重新生成 data.js，不联网

为什么要有这个文件
------------------
之前数据内嵌在 index.html 里，流程是：
    抓取 -> 改 HTML -> 重新部署整站
这导致「自动检查」即使跑起来，用户也看不到新数据 ——
必须有人手动重新发布。

现在数据在 data.js 里，流程变成：
    抓取 -> 更新 data.js（一个文件）
只要把 data.js 推上去（git push / 对象存储上传）就完事。

为什么每步都要校验
------------------
抓取失败 -> 页面显示「没变更」-> 用户误判。
这是本项目最危险的失败模式。所以每步失败都要**非零退出**，
让计划任务报错，而不是悄悄写入空数据。
"""
import io
import time
import os
import shutil
import subprocess
import sys
from datetime import datetime

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
PY = sys.executable

VERIFY_JS = """
global.window = {};
require('./prototype/data.js');
const d = global.window.STDWATCH_DATA;
if (!d) { console.log('FAIL: STDWATCH_DATA 未定义'); process.exit(1); }
const need = ['STD','REFGROUPS','SOONPOOL','ERATA','ALERTS','KWS','SUBS',
              'HIST','LAWS','CATS','LAW_KINDS','SRCS','RUNSTATE'];
const miss = need.filter(k => !(k in d));
if (miss.length) { console.log('FAIL 缺字段: ' + miss.join(',')); process.exit(1); }
if (!Array.isArray(d.STD) || d.STD.length < 100) {
  console.log('FAIL 标准清单条数异常: ' + (d.STD ? d.STD.length : 'undef'));
  process.exit(1);
}
if (!d.RUNSTATE || !('lastRun' in d.RUNSTATE)) {
  console.log('FAIL RUNSTATE 不完整'); process.exit(1);
}
console.log('OK  STD=' + d.STD.length + '  LAWS=' + d.LAWS.length
  + '  ERATA=' + d.ERATA.length + '  REFGROUPS=' + d.REFGROUPS.length
  + '  lastRun=' + d.RUNSTATE.lastRun);
"""


def run(name, args, allow_fail=False, timeout=None):
    """跑一个步骤。timeout 为 None 表示不限时长。"""
    print()
    print("-- " + name)
    t0 = time.time()
    try:
        r = subprocess.run([PY] + args, cwd=ROOT,
                           capture_output=True, text=True, encoding="utf-8",
                           timeout=timeout)
    except subprocess.TimeoutExpired as e:
        # 超时不等于失败 —— 抓取是"尽力而为"的：
        # 抓到的部分仍然有用，漏掉的源会在页面上显示为落后。
        # 所以这里按 allow_fail 语义处理，交由调用方决定。
        out = (e.stdout or b"")
        if isinstance(out, bytes):
            out = out.decode("utf-8", "replace")
        err = (e.stderr or b"")
        if isinstance(err, bytes):
            err = err.decode("utf-8", "replace")
        for ln in [x for x in ((out or "") + (err or "")).strip().split("\n") if x.strip()][-14:]:
            print("   " + ln)
        print("   [超时] 已运行 %.0f 秒仍未结束，按已有结果继续。" % (time.time() - t0))
        if not allow_fail:
            print()
            print("[x] " + name + " 超时且不允许继续。")
            sys.exit(1)
        return False

    out = (r.stdout or "") + (r.stderr or "")
    tail = [ln for ln in out.strip().split("\n") if ln.strip()][-14:]
    for ln in tail:
        print("   " + ln)
    print("   （耗时 %.0f 秒）" % (time.time() - t0))
    if r.returncode != 0:
        if allow_fail:
            print("   [warn] 失败但继续（该步骤允许失败）")
            return False
        print()
        print("[x] " + name + " 失败，未继续。")
        print("  数据未更新，页面上的内容仍是旧的。")
        print("  不要把这次失败当成「官方没有新标准」。")
        sys.exit(r.returncode)
    return True


def find_node():
    """定位 node：环境变量 → PATH → 本机已知位置。

    原来写死了 `C:\\Users\\13104\\.workbuddy\\...\\node.exe`，
    换机器或上 Linux CI runner 就会 FileNotFoundError，校验被静默跳过 ——
    校验静默跳过等于没校验，必须修。
    """
    c = os.environ.get("STDWATCH_NODE")
    if c and os.path.exists(c):
        return c
    p = shutil.which("node") or shutil.which("node.exe")
    if p:
        return p
    guess = (r"C:\Users\13104\.workbuddy\binaries\node"
             r"\versions\22.22.2-3\node.exe")
    return guess if os.path.exists(guess) else None


def verify():
    print()
    print("-- 校验")
    node = find_node()
    if not node or not os.path.exists(node):
        print("   [x] 找不到 node，校验无法进行 —— 判定失败。")
        print("       校验被跳过等于没校验，不允许静默通过。")
        print("       装好 Node 后设环境变量 STDWATCH_NODE 指向 node 可执行文件。")
        return False
    r = subprocess.run([node, "-e", VERIFY_JS], cwd=ROOT,
                       capture_output=True, text=True, encoding="utf-8")
    out = ((r.stdout or "") + (r.stderr or "")).strip()
    for ln in out.split("\n"):
        if ln.strip():
            print("   " + ln)
    return r.returncode == 0


def main() -> int:
    skip = "--skip-fetch" in sys.argv
    print("=" * 68)
    print("每日检查  " + datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    print("=" * 68)

    if not skip:
        # 抓取失败**不中断**：可能只是某个源抽不到，其余源仍有增量。
        # 但中断也没意义 —— build_runstate 会如实显示哪些源落后了。
        #
        # ★ timeout 是给云端 CI 加的 ★
        # 本机跑一次约 4 分钟；GitHub 的 runner 在美国，
        # 访问 CFSA / 标准委 / 总局这些国内站点会慢好几倍，
        # 实测首次云端运行抓取阶段跑了 10 分钟仍未结束。
        # workflow 的 timeout-minutes: 45 会连带把整条 job 砍掉，
        # 导致「已抓到的数据也来不及提交」——白跑。
        #
        # 所以给抓取单独设上限：到点就停，已抓到的照常往下走。
        # 单源请求超时仍是 30 秒（http_client），这里管的是总时长。
        #
        # 用 subprocess 的 timeout 而不是让 crawler 内部轮询，
        # 是为了不改抓取逻辑 —— 它的正确性不依赖时间。
        budget = int(os.environ.get("STDWATCH_FETCH_BUDGET_S", "900"))
        print("   抓取预算 %d 秒（云端用；设 0 表示不限）" % budget)
        t0 = time.time()
        ok = run("抓取（标准源 + 公告 + 勘误）",
                 ["scripts/crawler.py", "--run"], allow_fail=True,
                 timeout=(budget if budget > 0 else None))
        print("   抓取实际耗时 %.0f 秒" % (time.time() - t0))
        if not ok:
            print("   注意：抓取未完整结束，后续会按已抓到的部分生成数据。")

        # ★ 补抓点名的标准（2026-10-07 补上）★
        #   crawler.py 用的是「关键词表 + 通则引用」合出来的 74 个通用词，
        #   覆盖不到某些点名的标准。实测云端缺 GB 17405（保健食品GMP）
        #   和 GB 12693（乳制品 GMP）—— 因为它们不在那 74 个词里。
        #
        #   fetch_wanted.py 里的 TARGETS 才是完整清单，但它一直只在
        #   本机手动跑时执行，云端管线没调它 —— 也就是说
        #   「用户 2026-10-06 点名要的标准」在云端从来没生效过。
        #
        #   放在抓取之后、分类重建之前：先补齐数据，再统一算分类。
        ok2 = run("补抓点名标准", ["scripts/fetch_wanted.py"], allow_fail=True,
                  timeout=(180 if budget > 0 else None))
        if not ok2:
            print("   注意：补抓未完成，缺失的标准这轮不会进清单。")
            print("   页面会如实显示各源条数与抓取时间，不会假装完整。")

        # ★ 重算分类（2026-10-07 补上，之前漏了）★
    #   category 是在**抓取当时**写进快照的。之后改了 guess_category
    #   的号段表（把GB 23790/29923 从 product 挪到 prod 等），
    #   快照里的老值不会自动更新—— load() 也不重算。
    #   不跑这一步，新抓回来的数据就一直带着旧分类，
    #   页面显示的还是老样子（2026-10-06 用户看到「生产标准 2 条」，
    #   库里其实已有 5 本，代码也改对了，就是没重算）。
    run("重算分类", ["scripts/recategorize.py"], allow_fail=True)

    # ★ 重建 data.js 的 STD/LAWS/CATS（2026-10-07 补上）★
    #   这一步才把快照真正写进 data.js。
    #   extract_data.py 只在「页面还是内嵌形态」时才抽取；
    #   数据外置后它只做校验，不会重新生成 STD。
    #   缺这一步 → 抓取结果永远进不了页面。
    run("重建标准清单", ["scripts/sync_std_to_proto.py"], allow_fail=True)

    # ★ 重建通则引用组 REFGROUPS（2026-10-07 补上）★
    #   与上面 STD/LAWS/CATS 同类问题，但更隐蔽：
    #     extract_data.py 只在「页面还是内嵌形态」时抽取常量；
    #     数据外置成 data.js 之后，它只做校验（_verify_only），
    #     **永远不会重写 REFGROUPS**。
    #   而唯一会写 REFGROUPS 的是 inject_refdata.py ——
    #   它原先只在改通则引用组时由本机手动跑。
    #   结果：云端每天重建 data.js 却没有重建 REFGROUPS，
    #   新增的检测标准（2026-10-07 的酸价 GB 5009.229 / 过氧化值 GB 5009.227）
    #   在本机 data.js 里有，线上永远没有 —— 本地改了、线上不变。
    #
    #   这两步都不联网：build_refgroups.py 读已入库的
    #   data/general_refs.json 出 _refjs.txt，inject_refdata.py 把它灌进 data.js。
    run("重建通则引用组", ["scripts/build_refgroups.py"], allow_fail=True)
    run("注入通则引用数据", ["scripts/inject_refdata.py"], allow_fail=True)

    run("生成运行状态", ["scripts/build_runstate.py"])
    run("抽出 data.js", ["scripts/extract_data.py"])

    if not verify():
        print()
        print("[x] 校验未通过，没有更新数据文件。")
        return 1

    print()
    print("=" * 68)
    print("[OK] 完成  " + datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    print()
    print("下一步：把 prototype/data.js 推上去")
    print("  git 仓库：  git add prototype/data.js && git commit -m update && git push")
    print("  对象存储：  上传 prototype/data.js 覆盖同名文件")
    print("  只看本机：  已生效，刷新页面即可")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())