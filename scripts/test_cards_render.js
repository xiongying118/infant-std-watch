/* ==================================================================
   卡片页回归测试：真跑一遍 cards.js 的渲染
   ------------------------------------------------------------------
   为什么必须真跑（2026-10-06 踩坑）：
     语法检查（new Function(code)）**只能抓语法错，抓不到
     ReferenceError** —— 未定义变量在语法上完全合法。
     而 cards.js 里`newbieBody` 少了一行 `const k = c.knowledge`，
     渲染时抛 "k is not defined" → render() 中断 →
     **53 张卡片整片空白**，而页面上「已录经验 N 条」照常显示，
     看起来像"只有计数没有内容"这种玄学问题。
     靠用户 F12 看 Console 才定位到（用户提供了报错截图）。

   断言只认一条硬标准：**渲染出的卡片数 == 数据条数**。
   不匹配就说明 render 中途抛了异常。
   ================================================================== */
const fs = require("fs");
const path = require("path");

const P = path.join(__dirname, "..", "prototype");
const DATA = path.join(P, "cards-data.js");
const CODE = path.join(P, "cards.js");

// ---- 极简 DOM：只实现 cards.js 真正碰的那几个 ----
const mkEl = () => ({
  tagName: "DIV", innerHTML: "", textContent: "", hidden: false,
  title: "", value: "",
  style: new Proxy({}, { set: () => true, get: () => "" }),
  dataset: {},
  classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
  children: [],
  addEventListener() {}, removeEventListener() {},
  querySelector: () => null, querySelectorAll: () => [],
  getAttribute: () => null, setAttribute() {}, removeAttribute() {},
  appendChild: c => c, closest: () => null, contains: () => false,
});

const nodes = {};
["cards", "cnt", "types", "diag", "q"].forEach(id => { nodes[id] = mkEl(); });

// ---- 造一份经验：key 用**真实存在的**卡片号 ----
global.window = global;
require(DATA);
const ALL = window.STDWATCH_CARDS;
if (!ALL || !ALL.length) {
  console.log("[x] cards-data.js 没有数据");
  process.exit(1);
}
const SAMPLE = ALL[0].no;
const store = {
  "stdwatch-card-knowledge": JSON.stringify({
    [SAMPLE]: {
      principle: "石墨炉原子吸收，铅在高温下原子化测吸光度",
      instr: "石墨炉原子吸收分光光度计",
      interference: "钠共存时抑制吸收，需加释放剂",
      precautions: "消解必须彻底，否则偏高",
      mistakes: "消解不彻底会偏高，我第一次按 180℃ 消 30 分钟发现有残留",
      reagents: [{ name: "硝酸", role: "破坏有机基质", amount: "优级纯" }],
    },
  }),
};

global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};
global.document = {
  readyState: "complete",
  getElementById: id => nodes[id] || null,
  createElement: mkEl,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {},
};
global.location = { origin: "http://test.local", href: "" };
global.addEventListener = () => {};

console.log("卡片数据: %d 条", ALL.length);
console.log("经验样本: %s", SAMPLE);
console.log("");

// ---- 真跑 ----
let threw = null;
try {
  new Function(fs.readFileSync(CODE, "utf8"))();
} catch (e) {
  threw = e;
}

if (threw) {
  console.log("★ 执行抛错: %s - %s", threw.constructor.name, threw.message);
  console.log("");
  console.log("  若提示某个变量 is not defined → 该变量在其函数内没有 const/let 声明。");
  console.log("  这类错语法检查抓不到，只能真跑。");
  process.exit(1);
}

const html = nodes.cards.innerHTML;
const n = (html.match(/<article/g) || []).length;

console.log("渲染出的卡片数: %d", n);
console.log("计数行: %s", nodes.cnt.innerHTML.replace(/<[^>]+>/g, "").slice(0, 76));

if (n !== ALL.length) {
  console.log("");
  console.log("★ 渲染条数不符：期望 %d，实际 %d", ALL.length, n);
  process.exit(1);
}
console.log("");
console.log("✓ 卡片数与数据条数一致 —— 渲染未中断");

// 经验内容是否进到了 HTML 里
const know = JSON.parse(store["stdwatch-card-knowledge"])[SAMPLE];
const checks = [
  ["易错点(mistakes)", know.mistakes.slice(0, 8)],
  ["干扰因素", know.interference.slice(0, 6)],
  ["试剂作用表头", "在本方法中的作用"],
];
console.log("经验内容检查:");
let allOk = true;
for (const [label, marker] of checks) {
  const ok = html.indexOf(marker) >= 0;
  if (!ok) allOk = false;
  console.log("  %s %s", ok ? "✓" : "✗", label);
}
if (!allOk) {
  console.log("");
  console.log("★ 经验内容没进 HTML —— 检查 newbieBody/oldBody 里的 k 字段读取。");
  process.exit(1);
}

// ---- 排版回归：.stp 正文必须整体包在 <span> 里 ----
// .stp 是 grid（序号列 + 正文列）。正文若是「裸文本 + <b>」混排，
// 每个元素各占一个格子，字被拆散成「锡 ， 属 脂 | 类检测」。
// 2026-10-06 用户截图踩到：序号右边不是一句完整的话。
const stpRe = /<div class="stp">([\s\S]*?)<\/div>/g;
let stpCount = 0, bare = 0;
let m;
while ((m = stpRe.exec(html)) !== null) {
  stpCount++;
  if (!m[1].trimStart().startsWith("<span>")) bare++;
}
console.log("");
console.log("排版检查: 共 %d 个步骤", stpCount);
if (stpCount === 0) {
  console.log("  (本次渲染没有步骤，检查跳过)");
} else if (bare) {
  console.log("  ✗ 有 %d 个步骤正文没包进 <span> —— 字会���拆散", bare);
  process.exit(1);
} else {
  console.log("  ✓ 所有步骤正文都包在 <span> 内");
}
console.log("");
console.log("全部通过。");