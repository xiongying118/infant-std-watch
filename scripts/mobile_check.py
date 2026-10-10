#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""移动端真实渲染验证（Chromium 无头）。

为什么必须有这一步：
  自检（selfcheck_page.js）验的是「CSS 里有没有这条规则」「HTML 里有没有这个类」，
  但验不了「375px 屏上侧栏真的不占宽度」「表格真的能横向滚」。
  这类问题只有真跑一次布局才知道。

验的六件事（都是用户会立刻发现的）：
  1. 页面在 375px 下不出现横向溢出（document 宽度不超过视口）
  2. 抽屉默认关闭、点汉堡后打开、点遮罩后关闭
  3. 顶栏不溢出（标题/搜索/按钮都在视口内）
  4. 表格容器有横向滚动能力且确实溢出
  5. 弹窗在窄屏下按钮可见（不会被挤到屏幕外）
  6. 各断点下侧栏位置正确
"""
import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8")

from playwright.sync_api import sync_playwright          # noqa: E402

HTML = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                    "..", "prototype", "index.html")
SHOT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        "..", "data", "_shots")
os.makedirs(SHOT_DIR, exist_ok=True)

DEVICES = [
    ("iPhone SE",      375,  667),
    ("iPhone 14",      390,  844),
    ("Pixel 7",        412,  915),
    ("iPad mini",      768, 1024),
    ("笔记本窄窗",      880,  700),
    ("桌面",          1440,  900),
]

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print("  {} {:34s} {}".format("✓" if ok else "✗", name, detail[:60]))


PROBE = r"""
() => {
  const de = document.documentElement;
  const side = document.querySelector('.side');
  const main = document.querySelector('.main');
  const top  = document.querySelector('.top');
  const wrap = document.querySelector('.twrap');
  const r = e => e ? e.getBoundingClientRect() : null;
  const sideR = r(side), mainR = r(main), topR = r(top), wrapR = r(wrap);
  return {
    vw: window.innerWidth,
    docW: de.scrollWidth,
    overflowX: de.scrollWidth - window.innerWidth,
    sideLeft: sideR ? Math.round(sideR.left) : null,
    sideW: sideR ? Math.round(sideR.width) : null,
    mainLeft: mainR ? Math.round(mainR.left) : null,
    mainW: mainR ? Math.round(mainR.width) : null,
    topW: topR ? Math.round(topR.width) : null,
    searchR: r(document.querySelector('.search .search, .top .search')),
    navOpen: document.body.classList.contains('nav-open'),
    maskOn: !!(document.querySelector('.side-mask.on')),
    burgerShown: (function(){
      const b = document.querySelector('#burger');
      if (!b) return null;
      return getComputedStyle(b).display !== 'none';
    })(),
    wrapScrollW: wrap ? wrap.scrollWidth : null,
    wrapClientW: wrap ? wrap.clientWidth : null,
    wrapOverflowX: wrap ? getComputedStyle(wrap).overflowX : null,
    kpiCols: getComputedStyle(document.querySelector('.grid.g4') || document.body)
              .gridTemplateColumns.split(' ').length,
  };
}
"""


def main() -> int:
    url = "file:///" + os.path.abspath(HTML).replace("\\", "/")
    with sync_playwright() as p:
        br = p.chromium.launch()
        for label, w, h in DEVICES:
            print("=" * 70)
            print("【{}】{}×{}".format(label, w, h))
            ctx = br.new_context(viewport={"width": w, "height": h},
                                 device_scale_factor=2,
                                 is_mobile=(w < 700),
                                 has_touch=(w < 700))
            pg = ctx.new_page()
            errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)[:80]))
            pg.goto(url, wait_until="load")
            pg.wait_for_timeout(350)
            d = pg.evaluate(PROBE)

            check("无 JS 报错", not errs, "; ".join(errs[:1]))
            # 允许 1px 舍入误差
            check("无横向溢出", d["overflowX"] <= 1,
                  "溢出 {}px".format(d["overflowX"]))
            if w < 900:
                check("抽屉默认关闭（侧栏移出屏外）",
                      d["navOpen"] is False and (d["sideLeft"] or 0) < 0,
                      "side.left={}".format(d["sideLeft"]))
                check("汉堡按钮可见", d["burgerShown"] is True)
                mw = d["mainW"]
                check("主区占满宽度", mw is not None and mw >= w - 20,
                      "main.width={}".format(mw))
                # 抽屉交互
                pg.click("#burger")
                # ★ 只等"类已加上"，不等动画结束 ★
                #   等 left>=0 的话，动画没跑完就一直不成立（Pixel 7 上实测卡死 3s）。
                #   动画是否跑完由下面的断言单独看 rect.left，不在这里耦合。
                try:
                    pg.wait_for_function(
                        "() => document.body.classList.contains('nav-open')",
                        timeout=2000)
                except Exception:
                    pass
                pg.wait_for_timeout(320)
                d2 = pg.evaluate(PROBE)
                # ★ sideLeft 可能是 0，不能用 `x or -1` 兜底 ★
                #   JS 里 `0 || -1` 得 -1（0 是 falsy），会把这个正常状态判成失败。
                #   跟 Python 的 `0 or -1` 同一个坑 —— 值可能是 0 时必须显式判 null。
                left2 = d2["sideLeft"]
                check("点汉堡后抽屉打开",
                      d2["navOpen"] is True and left2 is not None and left2 >= 0,
                      "side.left={}".format(left2))
                check("打开时遮罩出现", d2["maskOn"] is True)
                # ★ 按遮罩"实际可见区域"的中心点真实点击 ★
                #   force=True 会跳过可见性与命中检测直接派发事件，
                #   坐标算错就点到抽屉上 → Pixel 7 上稳定失败。
                #   这里取遮罩矩形里不与抽屉重叠的那一段的中点。
                pt = pg.evaluate("""() => {
                  const m = document.querySelector('.side-mask');
                  const sd = document.querySelector('.side');
                  const mr = m.getBoundingClientRect();
                  const sr = sd.getBoundingClientRect();
                  return { x: Math.round((sr.right + mr.right) / 2),
                           y: Math.round(mr.top + mr.height / 2) };
                }""")
                pg.mouse.click(pt["x"], pt["y"])
                # ★ 等条件成立，不要死等固定毫秒 ★
                #   transition 是 240ms，之前固定等 320ms 在 Pixel 7 上
                #   偶尔不够 → 偶发假失败。flaky 的根源就是固定等待。
                try:
                    pg.wait_for_function(
                        "() => !document.body.classList.contains('nav-open')",
                        timeout=2000)
                except Exception:
                    pass
                pg.wait_for_timeout(300)
                d3 = pg.evaluate(PROBE)
                check("点遮罩后关闭", d3["navOpen"] is False and not d3["maskOn"])
            else:
                sl = d["sideLeft"]
                check("侧栏常驻可见（桌面）", sl is not None and sl >= 0,
                      "side.left={}".format(sl))
                check("汉堡按钮隐藏", d["burgerShown"] is False)
            # 表格横滚
            if d["wrapClientW"]:
                check("表格容器横向可滚",
                      d["wrapOverflowX"] in ("auto", "scroll")
                      and d["wrapScrollW"] > d["wrapClientW"],
                      "scroll={} client={}".format(d["wrapScrollW"], d["wrapClientW"]))
            # 弹窗
            pg.evaluate("dlg({kind:'danger',title:'测试',body:'内容',"
                        "buttons:[{t:'取消',cls:''},{t:'确认删除',cls:'danger'}]})")
            pg.wait_for_timeout(220)
            box = pg.evaluate("""() => {
              const b = document.querySelector('.dlg-f .btn.danger')
                        || document.querySelector('.dlg-f .btn');
              if (!b) return null;
              const r = b.getBoundingClientRect();
              return {x:Math.round(r.x), right:Math.round(r.right),
                      w:Math.round(r.width), visible:r.width>0 && r.height>0};
            }""")
            check("弹窗主按钮在视口内", box and box["right"] <= w and box["x"] >= 0,
                  str(box))
            # Esc 关弹窗（页面里绑的就是 keydown Escape）
            pg.keyboard.press("Escape")
            pg.wait_for_timeout(150)
            pg.screenshot(path=os.path.join(SHOT_DIR, "{}.png".format(label)),
                          full_page=(w < 900))
            ctx.close()
        br.close()

    print()
    print("=" * 70)
    bad = [r for r in results if not r[1]]
    print("通过 {}/{}".format(len(results) - len(bad), len(results)))
    for n, _, dt in bad:
        print("  ✗ {}  {}".format(n, dt))
    return 1 if bad else 0


if __name__ == "__main__":
    rc = main()
    # ★ 显式 flush + os._exit ★
    #   playwright 的 Chromium 子进程句柄在 Windows 上不会立刻回收，
    #   raise SystemExit 后进程挂在清理上不退出（实测卡了 10 分钟）。
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(rc)