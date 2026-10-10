// 离线渲染自检：把 index.html 里的 <script> 抽出来在 Node 里跑，
// 用 Proxy 顶替 DOM，验证数据与渲染函数不报错、关键内容确实出现在 HTML 里。
// 目的：改完页面不用开浏览器就能确认没写坏。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HTML = path.join(ROOT, 'prototype', 'index.html');
const html = fs.readFileSync(HTML, 'utf8');

const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (!blocks.length) { console.error('✗ 没找到 <script> 块'); process.exit(1); }
let src = blocks.join('\n');

// 截掉路由注册那段（它会立刻操作真实 DOM / location）
const cut = src.lastIndexOf('/* 路由 */');
if (cut > 0) src = src.slice(0, cut);

// 把 DOM 取值函数换成桩
// 注意脚本里有**两个**同名 $：一个按 id（getElementById）、一个按 selector（querySelector），
// 两个都要替，否则只替一个会在渲染时炸。
src = src.replace(/document\.getElementById\(/g, '__el(');
src = src.replace(/document\.querySelectorAll\(/g, '__qsa(');
src = src.replace(/document\.querySelector\(/g, '__qs(');

const store = {};
// 节点 target 注册表（见 mkNode 里的说明）
const NODES = {};
const nodeCls = id => (NODES[id] && NODES[id].__cls) || new Set();
const nodeStyle = id => (NODES[id] && NODES[id].style) || {};
const nodeAttr = id => (NODES[id] && NODES[id].__attrs) || {};
const btnState = { kwAdd: null, runNow: null };
function mkNode(id) {
  // target 存进 NODES：抽屉断言要读 body.classList 的真实结果，
  // 而 mkNode 每次返回新 Proxy，不注册就拿不到内部状态。
  const t0 = { __id: id };
  NODES[id] = t0;
  return new Proxy(t0, {
    get(t, k) {
      // ★ 先看 target 上有没有显式赋过值 ★
      //   Proxy 的 get 陷阱若一律返回子节点，dlg 里 b.onclick = fn
      //   存进去后再 b.onclick() 取到的是子节点而非函数 → 报 not a function。
      //   所以已赋值的键一律原样返回。
      if (typeof k === 'string' && Object.prototype.hasOwnProperty.call(t, k)
          && k !== '__id') return t[k];
      if (k === 'innerHTML' || k === 'textContent' || k === 'value')
        return t[k] !== undefined ? t[k] : '';
      if (k === 'style') return t.style || (t.style = {});
      // classList 要**真的**记录状态：抽屉开关就是靠 body.nav-open 判定的，
      // 空实现会让 toggleNav 断言恒真/恒假 —— 假绿灯比没断言更危险。
      if (k === 'classList') {
        t.__cls = t.__cls || new Set();
        const self = t;
        return {
          add: c => self.__cls.add(c),
          remove: c => self.__cls.delete(c),
          contains: c => self.__cls.has(c),
          toggle: (c, force) => {
            const on = (force === undefined) ? !self.__cls.has(c) : !!force;
            if (on) self.__cls.add(c); else self.__cls.delete(c);
            return on;
          }
        };
      }
      if (k === 'dataset') return {};
      // querySelectorAll 要返回**可迭代**的数组（脚本里用了展开运算符）
      // 弹窗场景要能拿到真实的按钮：innerHTML 里 data-i="N" 的都造一个可点节点
      if (k === 'querySelectorAll' || k === 'getElementsByClassName'
          || k === 'getElementsByTagName') {
        const html = store[id] || '';
        const idx = [...html.matchAll(/data-i="(\d+)"/g)].map(m => +m[1]);
        return () => idx.map(i => {
          const n = mkNode(id + '.btn' + i);
          n.onclick = null;                 // 占位，真实赋值由 dlg 完成
          return n;
        });
      }
      if (k === 'querySelector') {
        const html = store[id] || '';
        const m0 = html.match(/data-i="(\d+)"/);
        return () => (m0 ? mkNode(id + '.btn' + m0[1]) : mkNode(id + '?'));
      }
      // 这些是"方法"，脚本会直接调用 —— 必须返回函数，不能返回子节点
      if (k === 'focus' || k === 'blur' || k === 'click' || k === 'scrollIntoView')
        return () => {};
      // setAttribute 也要真的记录：抽屉开关要验 aria-expanded 同步
      if (k === 'setAttribute' || k === 'setAttributeNS')
        return (n, v) => { t.__attrs = t.__attrs || {}; t.__attrs[n] = String(v); };
      if (k === 'getAttribute') return n => (t.__attrs || {})[n] ?? null;
      if (k === 'removeAttribute') return n => { if (t.__attrs) delete t.__attrs[n]; };
      if (k === 'then') return undefined;
      if (k === 'length') return 0;
      if (typeof k === 'symbol') return undefined;
      return mkNode(id + '.' + String(k));
    },
    set(t, k, v) {
      t[k] = v;
      if (k === 'innerHTML') store[id] = v;
      if (k === 'disabled') btnState[id] = v;
      // 弹窗渲染后，把按钮回调挂到 __dlgButtons 上，供自检模拟点击。
      // 桩的 querySelectorAll 返回空数组，所以从 innerHTML 解析 data-i。
      if (k === 'innerHTML' && id === 'dlgHost' && v) {
        __dlgParsed = [...v.matchAll(/data-i="(\d+)"[^>]*>([^<]*)</g)]
          .map(m => ({ i: +m[1], label: m[2].trim() }));
      }
      return true;
    }
  });
}
const $ = id => mkNode(id);
const $$ = () => [];
// 渲染函数用的是 selector 版 $（document.querySelector('#erataBox')），
// 所以 innerHTML 要按 id 落到 store 里 —— mkNode 的 key 是传入的字符串，
// 这里对 '#xxx' 形式的 id 去掉 # 再存。
const byId = sel => mkNode(String(sel).replace(/^[#.]/, ''));

const sandbox = {
  __sb: null,          // 指针，runInContext 后回填，便于断言读桩状态
  __el: $,
  __qsa: $$,
  __qs: byId,
  console,
  // 抽屉状态断言辅助（读 NODES 里存的 target 状态）
  __bodyCls(){ return nodeCls('body'); },
  __bodyStyle(){ return nodeStyle('body'); },
  __attr(id, n){ return nodeAttr(id)[n]; },
  matchMedia(q) {
    // 桩：默认按桌面（不匹配）处理，这样 route() 里的
    // closeNavOnMobile() 不会误触发抽屉逻辑
    return { matches: false, media: q,
      addListener() {}, removeListener() {},
      addEventListener() {}, removeEventListener() {} };
  },
  document: {
    getElementById: $, querySelectorAll: $$, querySelector: byId,
    getElementsByClassName: $$,
    getElementsByTagName: $$,
    createElement: () => mkNode('new'),
    addEventListener() {},
    removeEventListener() {},
    body: mkNode('body')
  },
  window: { addEventListener() {}, location: { hash: '' }, open() {}, scrollTo() {} },
  location: { hash: '#home' },
  // ---- localStorage 简易实现（权限持久化要验）----
  localStorage: (function () {
    const box = {};
    return {
      __box: box,
      getItem(k) { return Object.prototype.hasOwnProperty.call(box, k) ? box[k] : null; },
      setItem(k, v) { box[k] = String(v); },
      removeItem(k) { delete box[k]; }
    };
  })(),
  alert() {},
  confirm: () => false,
  __BTN: btnState,
  setTimeout, clearTimeout, Date, Math, JSON
};

const vm = require('vm');
const ctx = vm.createContext(sandbox);
// 回填：__api.__sb 指向沙箱里的桩状态对象（nodeCls/nodeStyle/nodeAttr）
sandbox.__sb = { nodeCls, nodeStyle, nodeAttr, NODES, store };
// const/let 声明不会挂到 context 上，末尾追加一段显式导出
const EXPORT = `
;globalThis.__api = { STD, REFGROUPS, LAWS, ERATA, ALERTS, SOONPOOL, PERM, ROLES,
  renderErata, renderRefDigest, renderHome, renderList, renderLaw, openDetail,
  hasPerm, guard, savePerm, clearPerm, loadPerm, renderAdmin, renderKw, renderGate,
  delKw, dlg, toast, escHtml, askDelete, askAddKw, escClose, sourceCaveat,
  toggleNav, closeNavOnMobile, RUNSTATE, SRCS, LOGS,
  renderRunState, runInfo,
  get __sb(){ return __sb; },   // 抽屉断言用的桩状态
  __dlgClick(i){ if(__dlgBtnCb && __dlgBtnCb[i]) __dlgBtnCb[i](); },
  get KWS(){ return KWS; },
  get dlgOpen(){ return !!($('#dlgHost') && $('#dlgHost').innerHTML); },
  get __btnState(){ return __BTN; },
  get PERM_STATE(){ return PERM_STATE; },
  set PERM_STATE(v){ PERM_STATE = v; },
  localStorage
};
`;
try {
  vm.runInContext(src + EXPORT, ctx, { filename: 'app.js' });
} catch (e) {
  console.error('✗ 脚本执行失败：' + e.message);
  console.error((e.stack || '').split('\n').slice(0, 5).join('\n'));
  process.exit(1);
}

const g = sandbox.__api;
if (!g) { console.error('✗ 导出失败'); process.exit(1); }
const results = [];
const ok = (n, v) => results.push([n, !!v]);

console.log('✓ 脚本执行通过');
console.log('  STD       ', g.STD.length);
console.log('  REFGROUPS ', g.REFGROUPS.length);
console.log('  LAWS      ', g.LAWS.length);
console.log('  ERATA     ', g.ERATA.length,
  '（修改单 ' + g.ERATA.filter(x => x.kind === 'MOD').length +
  ' / 勘误 ' + g.ERATA.filter(x => x.kind !== 'MOD').length + '）');

// ---- 首页渲染 ----
g.renderErata();
const eb = store['erataBox'] || '';
g.renderRefDigest();
const rd = store['refDigest'] || '';
g.renderHome();

ok('杂质度修改单上页', eb.includes('GB 5413.30-2016'));
ok('修改单徽标', eb.includes('号修改单'));
ok('官方变更说明区', eb.includes('官方变更说明'));
ok('标注自批准之日起实施', eb.includes('自批准之日起实施'));
ok('勘误保留改前/改后对照', eb.includes('改前（错误）') && eb.includes('改后（正确）'));
ok('修改单带官方详情页链接', eb.includes('staticPages'));
ok('标准名称非空', g.ERATA.every(x => x.stdName && x.stdName.length > 2));
ok('勘误/修改单时间非空', g.ERATA.every(x => x.erataDate && /^\d{4}-\d{2}-\d{2}$/.test(x.erataDate)));
ok('修改单有实施日期', g.ERATA.filter(x => x.kind === 'MOD').every(x => !!x.impDate));
ok('无「undefined」外泄', !eb.includes('undefined') && !rd.includes('undefined'));
ok('无「null」外泄', !eb.includes('>null<'));

// ---- 换版清单去重（用户 2026-10-03 截图指出有重复行）----
ok('SOONPOOL 存在', Array.isArray(g.SOONPOOL));
if (Array.isArray(g.SOONPOOL)) {
  const nos = g.SOONPOOL.map(x => x.no);
  const dupNos = nos.filter((n, i) => nos.indexOf(n) !== i);
  ok('换版清单无重复标准号', dupNos.length === 0);
  if (dupNos.length) console.log('    重复：', [...new Set(dupNos)].join('、'));
  ok('换版清单条目都带实施日期', g.SOONPOOL.every(x => /^\d{4}-\d{2}-\d{2}$/.test(x.imp)));
  ok('换版清单按天数升序', g.SOONPOOL.every((x, i, a) => i === 0 || a[i - 1].d <= x.d));
  ok('合并来源用 ｜ 分隔', g.SOONPOOL.every(x => !String(x.so).includes('、')));
}
g.renderRefDigest();
const dg = store['refDigest'] || '';
const shown = (dg.match(/还有 \d+ 天/g) || []).length;
ok('摘要里的换版行数 = SOONPOOL 条数', shown === g.SOONPOOL.length);
console.log('  换版清单：', g.SOONPOOL.map(x => `${x.no}(${x.d}天)`).join(' '));

// ---- 通则引用页内容断言（2026-10-03 用户截图点名 + 磷的更正）----
{
  const nos = [];
  g.REFGROUPS.forEach(gr => gr.items.forEach(x => nos.push(x.no)));
  ok('引用页有 GB 5009.87（通则引用的磷方法）', nos.includes('GB 5009.87-2016'));
  ok('引用页没有 GB 5009.256（通用磷酸盐方法）',
     !nos.some(n => n.startsWith('GB 5009.256')));
  ok('引用页有 GB 5009.12（铅）', nos.some(n => n.startsWith('GB 5009.12')));
  ok('引用页有 GB 5009.16（锡）', nos.some(n => n.startsWith('GB 5009.16')));
  ok('引用页有 GB 4789.40（克罗诺杆菌）', nos.some(n => n.startsWith('GB 4789.40')));
  ok('引用页有 GB 4789.4（沙门氏菌）', nos.some(n => n.startsWith('GB 4789.4')));
  ok('引用页有 GB 4789.14（蜡样芽孢杆菌）', nos.some(n => n.startsWith('GB 4789.14')));
  const grpNames = g.REFGROUPS.map(x => x.g);
  ok('有「污染物元素检测」组', grpNames.includes('污染物元素检测'));
  ok('有「致病菌限量检测」组', grpNames.includes('致病菌限量检测'));
  // 阪崎肠杆菌 = 克罗诺杆菌属旧称，不该作为独立组残留
  ok('阪崎肠杆菌未作为独立检测对象出现',
     !g.REFGROUPS.some(gr => gr.items.some(x => (x.subject || '').includes('阪崎'))));
  // 已失效的婴配专用方法不应出现在引用页
  ok('已失效的 GB 5413.22 不在引用页', !nos.some(n => n.startsWith('GB 5413.22')));
  // ★ 计量技术规范（2026-10-03 用户截图点名 JJF 1070）★
  const grp = g.REFGROUPS.find(x => x.g === '计量与包装');
  ok('有「计量与包装」组', !!grp);
  if (grp) {
    ok('计量组取的是通用版 JJF 1070-2023', grp.items[0].no === 'JJF 1070-2023');
    ok('计量组没把分产品子规范当主标准',
       !grp.items[0].alts.includes('JJF 1070.1') && grp.items[0].no !== 'JJF 1070.3-2021');
  }
  // GB 19644《乳粉和调制乳粉》标题带"乳粉"，最容易被"分产品子规范"规则误伤。
  // 它是产品标准（不是计量规范的子规范），必须在清单里、且归 product 类。
  const m19644 = g.STD.find(x => x.no === 'GB 19644-2024');
  ok('GB 19644-2024 在清单里（未被子规范规则降级）', !!m19644);
  ok('GB 19644-2024 仍是产品类', m19644 && m19644.cat === 'product');
}

// ---- 标准清单：失效的不能出现 ----
{
  const stdNos = g.STD.map(s => s.no);
  // ★ GB 5009.256 是现行有效的通用方法，只是不该出现在**通则引用页**
  //   （用户 2026-10-03 原话："不是就从通则中删除"）。
  //   它在标准清单里仍应存在 —— 实验室做非婴配产品时可能要用。
  ok('清单仍含 GB 5009.256（通用方法，非通则范围）',
     stdNos.some(n => n.startsWith('GB 5009.256')));
  ok('清单里没有已失效的 GB 5413.22-2010',
     !stdNos.some(n => n.startsWith('GB 5413.22-2010')));
  ok('清单里没有 GB 4789.40-2016（已被 2024 版替代）',
     !stdNos.some(n => n.startsWith('GB 4789.40-2016')));
  ok('清单含 GB 5009.87-2016（现行磷方法）', stdNos.includes('GB 5009.87-2016'));
  // 计量规范：现行版进清单，已废止的 2000/2005 版不进
  ok('清单含现行 JJF 1070-2023', stdNos.includes('JJF 1070-2023'));
  ok('清单不含已作废的 JJF 1070-2005', !stdNos.includes('JJF 1070-2005'));
  ok('清单不含已作废的 JJF 1070-2000', !stdNos.includes('JJF 1070-2000'));
}

(async () => {
  // ---- 后台权限（2026-10-03 用户要求：新增/删除需要权限）----
  {
    ok('权限模块存在', typeof g.hasPerm === 'function' && typeof g.guard === 'function');
    const ops = ['add', 'del', 'cfg', 'run'];
    ok('四种写操作都已受控', ops.every(o => typeof g.hasPerm === 'function'));
    // 登出状态下必须全部拒绝
    g.PERM_STATE = null;
    ok('未授权时 hasPerm 全为 false', ops.every(o => g.hasPerm(o) === false));
    g.renderAdmin();
    const gate = store['adminGate'] || '';
    ok('未授权时门禁显示锁定态', gate.includes('需要权限才能修改') && gate.includes('🔒'));
    ok('未授权时提供口令输入框', gate.includes('permInput'));
    // renderGate 会写 add.disabled / run.disabled，用 Proxy 桩能读到
    g.renderGate();
    ok('未授权时新增按钮被禁用', g.__btnState && g.__btnState.kwAddBtn === true);
    ok('未授权时「立即检查」按钮被禁用', g.__btnState && g.__btnState.runNowBtn === true);
    // 授权后再渲染一次，应解除禁用
    g.savePerm('editor');
    g.renderGate();
    ok('授权后新增按钮解除禁用', g.__btnState && g.__btnState.kwAddBtn === false);
    ok('授权后「立即检查」解除禁用', g.__btnState && g.__btnState.runNowBtn === false);
    // 正确口令 → 授权
    g.savePerm('editor');
    ok('授权后 add/del/cfg/run 全部放行', ops.every(o => g.hasPerm(o) === true));
    g.renderAdmin();
    const gate2 = store['adminGate'] || '';
    ok('授权后门禁显示已授权态', gate2.includes('已授权：管理员'));
    ok('授权后提供退出按钮', gate2.includes('clearPerm'));
    // 错误口令 → 拒绝
    const before = g.PERM_STATE;
    g.PERM_STATE = null;
    const hashOk = g.PERM.hash(g.PERM.salt + '|' + g.PERM.pass) === g.PERM.want();
    const hashBad = g.PERM.hash(g.PERM.salt + '|wrong') === g.PERM.want();
    ok('口令散列自洽（正确口令通过）', hashOk);
    ok('错误口令被拒', hashBad === false);
    // 恢复只读态，避免影响后续断言
    g.PERM_STATE = before;
    // localStorage 里不应有明文口令
    const raw = g.localStorage.getItem(g.PERM.key) || '';
    ok('localStorage 不存明文口令', raw.indexOf(g.PERM.pass) < 0);
    // 8 小时过期：伪造一个 9 小时前的时间戳，应被判定失效
    g.PERM_STATE = { role: 'editor', hash: g.PERM.want(), at: Date.now() - 9 * 3600 * 1000 };
    g.localStorage.setItem(g.PERM.key, JSON.stringify(g.PERM_STATE));
    ok('超过 8 小时的授权被拒绝', g.loadPerm() === null);
    g.clearPerm();
    ok('退出后回到未授权', g.hasPerm('add') === false);
  }

  // ---- 删除二次确认（用户 2026-10-03 要求）----
  {
    g.savePerm('editor');
    const before = g.KWS.length;
    g.KWS.push({ w: 'GB 9999.99', cat: '检测', p: '高' });
    g.renderKw();
    g.delKw('GB 9999.99');   // async，但弹窗同步渲染
    const host = store['dlgHost'] || '';
    ok('删除弹出二次确认', host.includes('确认删除监控关键词'));
    ok('删除弹窗用 danger 语义色（红）', host.includes('dlg danger'));
    ok('删除弹窗含关键词原文', host.includes('GB 9999.99'));
    ok('删除弹窗说明影响', host.includes('不再监控'));
    ok('删除弹窗给出替代做法（订阅）', host.includes('我的订阅'));
    ok('删除弹窗主按钮为 danger', host.includes('btn danger'));
    ok('未确认时不删除（弹窗仍开着）', g.KWS.length === before + 1);
    // 点"确认删除"（最后一个按钮）
    const btns = [...host.matchAll(/<button class="btn [^"]*" data-i="(\d+)">([^<]+)<\/button>/g)];
    ok('删除弹窗有取消/确认两个按钮', btns.length === 2);
    // 模拟点击最后一个（确认删除）
    ok('确认按钮文案是"确认删除"', /data-i="\d+">确认删除</.test(host));
    if (btns.length === 2) g.__dlgClick(1);   // 点『确认删除』
    ok('点确认后弹窗已关闭', !(store['dlgHost'] || '').includes('确认删除监控关键词'));
    // delKw 是 async：await askDelete 拿到结果后才 splice。
    // 这里等两轮微任务让 Promise 落地，再验"确实删掉了"。
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    ok('点确认后确实删除', g.KWS.length === before);
    ok('删的是被确认的那一条', !g.KWS.some(k => k.w === 'GB 9999.99'));
  }

  // ---- 自绘弹窗：语义配色与统一外观 ----
  {
    ok('存在自绘弹窗组件', typeof g.dlg === 'function');
    ok('存在 dlgHost 容器', html.includes('id="dlgHost"'));
    ok('弹窗样式已定义', html.includes('.dlg.danger') && html.includes('.dlg.warn') && html.includes('.dlg.info'));
    // 页面里不应再有原生 confirm/prompt/alert 调用
    // ★ 先剥掉注释与字符串 ★
    //   注释里写着"把散落的 alert(/prompt( 收口"这种说明文字，
    //   不剥掉会误判成还有原生调用 —— 假失败比不检查更误导。
    const codeOnly = html
      .replace(/\/\*[\s\S]*?\*\//g, ' ')      // 块注释
      .replace(/<!--[\s\S]*?-->/g, ' ')          // HTML 注释
      .replace(/^\s*\/\/.*$/gm, ' ');             // 行注释
    const native = (codeOnly.match(/[^.\w](confirm|prompt)\(/g) || []).length;
    ok('已无原生 confirm/prompt 调用', native === 0);
    const alertNative = (codeOnly.match(/[^.\w]alert\(/g) || []).length;
    ok('已无原生 alert 调用', alertNative === 0);
    // 三种语义都能渲染
    ['danger', 'warn', 'info'].forEach(k => {
      g.dlg({ kind: k, title: 'T', body: 'B', buttons: [{ t: '好', cls: 'pri' }] });
      ok('语义色 ' + k + ' 渲染正常', (store['dlgHost'] || '').includes('dlg ' + k));
    });
    // Esc 关闭
    g.dlg({ kind: 'danger', title: 'T', body: 'B', buttons: [{ t: '取消', val: 'cancel' }] });
    g.escClose({ key: 'Escape' });
    ok('Esc 可关闭弹窗', !(store['dlgHost'] || '').includes('dlg-h'));
  }

  // ---- 自动检查状态真实化（2026-10-04 用户问"今天怎么没看到自动检查"）----
{
  // ★ 这批断言的意义：页面曾经**假装**检查过 ★
  //   侧栏写死「上次检查：今天 07:00 / 下次检查：明天 07:00」，
  //   LOGS 写死 10-03 的历史记录，SRCS 的 cnt 从建立起没变过。
  //   实际调度器从未常驻运行 → 用户以为"查过了确实没变更"，实际是根本没查。
  //   这比功能缺失危险：它在错误的前提下让人做判定。
  //   所以下面几条断言的作用是：**任何人再写死这些值，自检立刻红。**
  ok('存在 RUNSTATE 常量（真实抓取状态）', html.includes('const RUNSTATE = {'));
  ok('RUNSTATE 由构建脚本生成', html.includes('build_runstate.py'));
  ok('RUNSTATE 含上次检查时间', /lastRun\s*:\s*"/.test(html));
  ok('RUNSTATE 含是否跑过', /everRan\s*:\s*(true|false)/.test(html));
  ok('RUNSTATE 含健康状态', /healthy\s*:\s*(true|false)/.test(html));
  ok('RUNSTATE 含每源条数与抓取时间',
     /sources\s*:\s*\[/.test(html) && /mtime\s*:\s*"/.test(html));
  ok('RUNSTATE 含由快照 mtime 生成的日志', /logs\s*:\s*\[/.test(html));

  // ★ 剥掉注释再查 ★
  //   注释里正好引用了「上次检查：今天 07:00」这些老字符串来说明问题，
  //   不剥掉会把"注释里提到"当成"代码里还在用" —— 假失败。
  //   这个坑本项目已经踩过两次（原生弹窗断言、弹窗类名断言）。
  const code = html
    .replace(/<script>([\s\S]*?)<\/script>/g, (m, js) =>
      js.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' '))
    .replace(/<!--[\s\S]*?-->/g, ' ');

  // 侧栏不再是硬编码字符串
  ok('侧栏检查时间不写死', !code.includes('上次检查：今天 07:00'));
  ok('侧栏下次检查不写死', !code.includes('下次检查：明天 07:00'));
  ok('侧栏有 sideFoot 容器供动态渲染', html.includes('id="sideFoot"'));

  // 抓取日志读 RUNSTATE
  ok('LOGS 读 RUNSTATE.logs', /const LOGS\s*=\s*RUNSTATE\.logs/.test(code));
  // ★ 判据是「LOGS 由 RUNSTATE 派生」而不是「页面里没有某条历史」★
  //   那条"首次基线"记录在 HIST（变更历史留痕）里，本来就该一直保留 ——
  //   它记的是"10-03 那天做了什么"，是真实历史，不该删。
  ok('LOGS 是 RUNSTATE.logs 的引用（无字面量数组）',
     !/const LOGS\s*=\s*\[/.test(code));

  // 源健康列表不再写死条数
  const srcSeg = html.slice(html.indexOf('const SRCS = ['),
                             html.indexOf('];', html.indexOf('const SRCS = [')));
  ok('SRCS 不再写死 cnt', !/cnt\s*:\s*"/.test(srcSeg));
  ok('SRCS 每行有 code 供 RUNSTATE 匹配', /code\s*:\s*"/.test(srcSeg));

  // 渲染逻辑
  ok('有 renderRunState 函数', typeof g.renderRunState === 'function');
  ok('首页有 runAlert 提示容器', html.includes('id="runAlert"'));
  g.renderRunState();
  const foot = store['sideFoot'] || '';
  ok('侧栏渲染出真实的上次检查时间', foot.includes('上次检查'));
  ok('侧栏渲染出真实的下次检查时间', foot.includes('原定') || foot.includes('下次'));
  const alertHtml = store['runAlert'] || '';
  // 当前数据：最近一次是昨天 21:24，已逾期 → 必须出警示
  ok('逾期时首页出醒目警示', alertHtml.includes('自动检查已逾期') || alertHtml.includes('从未运行'));
  ok('警示里说明可能漏了变更',
     alertHtml.includes('可能漏了') || alertHtml.includes('没有抓取任务在跑'));
  ok('警示给出可执行的补救命令',
     alertHtml.includes('crawler.py --run')
     || alertHtml.includes('crawler.py --serve')
     || alertHtml.includes('crawler.py'));

  // 源健康列表渲染
  g.renderAdmin();
  const health = store['srcHealth'] || '';
  ok('源健康列表渲染出内容', health.length > 100);
  ok('源健康显示"最近抓取"时间', health.includes('最近抓取'));
  ok('已停用的源标为已停用', health.includes('已停用'));
  ok('无快照的源显式标出', health.includes('无快照') || health.includes('无抓取记录'));

  // ★ 条数不错位：SRCS 里「勘误」在前、RUNSTATE.extras 里「公告」在前。
  //   原来两个 EX 行靠 exIdx++ 顺序取 → 勘误行显示 56 条、公告行显示 176 条，
  //   **数字串位且不报错**。现在按 run 字段的名字取，必须对得上。
  const exEr = (g.RUNSTATE.extras || []).find(x => x.label === '勘误与修改单');
  const exNt = (g.RUNSTATE.extras || []).find(x => x.label === '公告');
  const rowEr = g.SRCS.find(x => x.run === '勘误与修改单');
  const rowNt = g.SRCS.find(x => x.run === '公告');
  ok('勘误行绑定到勘误数据（非公告）',
     !rowEr || !exEr || exEr.label === '勘误与修改单');
  ok('公告行绑定到公告数据（非勘误）',
     !rowNt || !exNt || exNt.label === '公告');
  ok('SRCS 每行都有 run 字段（按名匹配的前提）',
     g.SRCS.filter(x => x.real !== false).every(x => typeof x.run === 'string'));
  // 真实条数必须出现在渲染结果里
  if (exEr) ok('勘误真实条数出现在页面上', health.includes(exEr.count + ' 条'));
  if (exNt) ok('公告真实条数出现在页面上', health.includes(exNt.count + ' 条'));
  // 反向：不能让另一行的条数串过来
  if (exEr && exNt) {
    ok('勘误行没串成公告条数', !rowEr || health.includes('勘误')) ;
  }

  // 日志：每条都带真实日期（只有时间没法排序，跨天会错）
  ok('抓取日志带完整日期', (g.RUNSTATE.logs || []).every(
     r => /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(r[0])));
  ok('日志条数与快照文件数一致（8 个）', (g.RUNSTATE.logs || []).length === 8);
}

// ---- 移动端适配（2026-10-03 用户反馈：手机打开没自适应）----
{
  const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));

  // 1) viewport 必须有，且不能锁死缩放（用户要能自己放大看标准号）
  ok('有 viewport meta', /name="viewport"[^>]*width=device-width/.test(html));
  ok('viewport 未禁止用户缩放',
     !/user-scalable\s*=\s*no|maximum-scale\s*=\s*1\b/.test(html));

  // 2) 侧栏必须有抽屉形态（这是最关键的一条）
  ok('有汉堡按钮', html.includes('id="burger"'));
  ok('汉堡按钮有 aria 标注', /id="burger"[^>]*aria-label/.test(html));
  ok('有抽屉遮罩', html.includes('id="sideMask"') && html.includes('.side-mask'));
  ok('抽屉用 translateX 移出屏外', /\.side\{[^}]*transform:translateX\(-1?0?2?%?\)/.test(css)
     || css.includes('transform:translateX(-1'));

  // 3) 断点齐备
  const bps = [...css.matchAll(/@media\s*\(\s*max-width\s*:\s*(\d+)px\s*\)/g)]
    .map(m => Number(m[1]));
  ok('有 ≤1200px 断点', bps.includes(1200));
  ok('有 ≤900px 断点（抽屉生效点）', bps.includes(900));
  ok('有 ≤640px 断点（手机）', bps.includes(640));
  ok('有 ≤430px 断点（小屏）', bps.includes(430));
  ok('尊重 prefers-reduced-motion', css.includes('prefers-reduced-motion'));

  // 4) 所有表格都在横向滚动容器里
  const tables = (html.match(/<table[\s>]/g) || []).length;
  const twraps = (html.match(/<div class="twrap">/g) || []).length;
  ok('每个表格都有横滚容器（' + tables + ' 表 / ' + twraps + ' 容器）',
     tables === twraps && tables > 0);
  ok('横滚容器有 touch 惯性滚动', css.includes('-webkit-overflow-scrolling:touch'));
  ok('横滚表格有最小宽度（不被压扁）', css.includes('.twrap table{min-width'));

  // 5) 触摸目标不小于 36px（44px 是 iOS 建议值，低了容易误触旁边的"删除"）
  ok('移动端按钮有最小高度', /@media\(max-width:640px\)[\s\S]{0,900}?\.btn\{[^}]*min-height/.test(css));
  ok('抽屉导航项加大点击区', /\.side \.nav a\{[^}]*min-height/.test(css));

  // 6) 弹窗在窄屏改底部抽屉（类名必须是 .mask/.dlg-f，不是猜的）
  ok('窄屏弹窗改底部抽屉', /@media\(max-width:640px\)[\s\S]{0,1200}?\.mask\{[^}]*align-items:flex-end/.test(css));
  ok('弹窗按钮竖排占满宽度', /\.dlg-f\{[^}]*flex-direction:column-reverse/.test(css));
  // ★ 先剥注释 ★ 注释里写着"不是 .dlg-mask / .dlg-box / .dlg-foot"这种说明，
  //   不剥掉会把这三个名字当成"还在用"—— 与之前"原生弹窗"那条断言同一个坑。
  const cssCode = css
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
  ok('未使用不存在的弹窗类名',
     !cssCode.includes('.dlg-mask') && !cssCode.includes('.dlg-box')
     && !cssCode.includes('.dlg-foot'));

  // 7) JS 逻辑
  ok('有 toggleNav 函数', typeof g.toggleNav === 'function');
  ok('打开抽屉会加 nav-open 类',
     (g.toggleNav(true), g.__sb.nodeCls('body').has('nav-open')));
  // 遮罩靠 classList 切 .on，不是改 innerHTML —— 读错地方会得到"没同步"的假象
  ok('遮罩打开时加 .on 类',
     (g.toggleNav(true), g.__sb.nodeCls('sideMask').has('on')));
  ok('aria-expanded 同步为 true',
     (g.toggleNav(true), g.__sb.nodeAttr('burger')['aria-expanded'] === 'true'));
  ok('再次调用关闭抽屉',
     (g.toggleNav(true), g.toggleNav(false), !g.__sb.nodeCls('body').has('nav-open')));
  ok('关闭时移除遮罩 .on 类',
     (g.toggleNav(true), g.toggleNav(false), !g.__sb.nodeCls('sideMask').has('on')));
  ok('关闭时背景滚动恢复', (g.toggleNav(true), g.toggleNav(false),
     (g.__sb.nodeStyle('body') || {}).overflow !== 'hidden'));
  ok('route() 会调 closeNavOnMobile', html.includes('closeNavOnMobile();'));

  // 8) 基础样式的固定宽度（踩过的坑，逐条钉住）
  //    .search 原来 width:280px → 375px 屏宽放不下，撑破顶栏
  const baseCss = css.slice(0, css.indexOf('移动端适配'));
  const baseCode = baseCss.replace(/\/\*[\s\S]*?\*\//g, ' ');
  ok('搜索框用 max-width 而非固定宽（窄屏会撑破顶栏）',
     /\.search\{[\s\S]{0,400}?max-width:280px/.test(baseCss)
     && !/\.search\{[\s\S]{0,400}?;width:280px/.test(baseCode));
  // .content 这个类在 HTML 里根本不存在（用了 0 次），
  // 我第一版媒体查询写的是 .content,.view{padding...} → 整条规则空转。
  // 钉死"媒体查询里不许出现不存在的类"。
  ok('媒体查询里不引用不存在的 .content 类',
     !css.includes('.content,.view') && !css.includes('.content {'));
  ok('.view 是真实内容容器', /\.view\{[^}]*padding/.test(baseCss));
  ok('跨越断点时复位抽屉', html.includes('addEventListener("resize"'));
}

// ---- 新接入的三个数据源（SRC-06 总局公告 / SRC-07 工信部 / SRC-08 团标）----
{
  const srcSeg = html.slice(html.indexOf('const SRCS = ['), html.indexOf('];', html.indexOf('const SRCS = [')));
  ok('SRC-06 市场监管总局 已接入', srcSeg.includes('市场监管总局 公告'));
  ok('SRC-07 工信部 已接入', srcSeg.includes('工信部 行业公告'));
  ok('SRC-08 团体标准 已接入', srcSeg.includes('全国团体标准信息平台'));
  ok('三个新源不再是「待接」状态', !srcSeg.includes('ok:"待接"'));

  // 公告与团标确实进库了
  const ttbz = g.STD.filter(x => x.no.startsWith('T/'));
  ok('团标已进清单（>20 条）', ttbz.length > 20);
  ok('团标有独立二级分类', ttbz.every(x => /团体标准/.test(x.sub || '')));
  const notice = g.STD.filter(x => /总局公告/.test(x.no));
  ok('总局公告已进清单', notice.length >= 3);
  ok('总局公告有独立二级分类', notice.every(x => /官方公告/.test(x.sub || '')));

  // ★ 合规提示：团标不能当判定依据 ★
  //   这条最容易出事 —— 检测员拿团标出报告，监管不认。
  ok('有来源性质提示函数', typeof g.sourceCaveat === 'function');
  const ttbzSample = ttbz[0];
  if (ttbzSample) {
    const c1 = g.sourceCaveat(ttbzSample);
    ok('团标详情页提示「不能作为判定依据」',
       c1.includes('团体标准不能作为判定依据'));
    ok('团标提示说明对外仍以国标为准', c1.includes('GB/GB/T'));
    ok('团标提示用 warn 语义色', c1.includes('notice warn'));
  }
  if (notice.length) {
    const c2 = g.sourceCaveat(notice[0]);
    ok('公告详情页说明 BJS 可用于检测', c2.includes('BJS'));
    ok('公告提示指向官方详情页', c2.includes('官方详情页'));
  }
  const normal = g.STD.find(x => /^GB/.test(x.no));
  ok('国标不显示来源性质提示', normal ? g.sourceCaveat(normal) === '' : true);
}

// ---- 侧边栏菜单顺序：通则引用标准必须是第二项（紧跟今日待办） ----
  const navSeg = html.slice(html.indexOf('<nav class="nav">'), html.indexOf('</nav>'));
  const navs = [...navSeg.matchAll(/data-v="(\w+)"[^>]*>(?:<span class="ic">[^<]*<\/span>)?([^<]+)/g)]
    .map(m => [m[1], m[2].trim()]);
  console.log('  侧边栏：', navs.map(x => x[1]).join(' → '));
  ok('侧边栏第二项是通则引用标准', navs[1] && navs[1][0] === 'refs');
  ok('侧边栏第一项是今日待办', navs[0] && navs[0][0] === 'home');

  // ---- 首页卡片顺序：通则引用标准紧随高优提醒 ----
  const ha = html.indexOf('<div class="view" id="v-home">');
  const hb = html.indexOf('<!-- ===== 标准清单 ===== -->');
  const homeSeg = html.slice(ha, hb);
  const heads = [...homeSeg.matchAll(/<h3>([^<]+)<\/h3>/g)].map(m => m[1]);
  ok('首页第二块是通则引用标准', heads[1] === '通则引用标准');
  ok('勘误块在通则引用之后', heads.indexOf('标准勘误与修改单') > heads.indexOf('通则引用标准'));

  // ---- 范围限定：ERATA 里的标准必须都在通则引用范围内 ----
  const scope = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'data', 'refscope.json'), 'utf8')).scope;
  const key = no => (no || '').replace(/\s+/g, '').replace(/—/g, '-')
    .replace(/-\d{4}$/, '').toUpperCase().replace('GB/T', 'GBT').replace('QB/T', 'QBT');
  const outOfScope = g.ERATA.filter(x => !scope[key(x.no)]);
  ok('勘误/修改单全部在通则引用范围内', outOfScope.length === 0);
  if (outOfScope.length) console.log('    越界：', outOfScope.map(x => x.no).join('、'));

  // ---- 已知必查项 ----
  const modNos = g.ERATA.filter(x => x.kind === 'MOD').map(x => x.no + ' 第' + x.modNo + '号');
  ok('含 GB 5413.30-2016 第1号修改单', modNos.some(s => s.includes('GB 5413.30-2016')));
  ok('含 GB 5009.84-2016 第1号修改单（维生素B1）', modNos.some(s => s.includes('GB 5009.84-2016')));
  ok('含 GB 2762 污染物限量修改单', modNos.some(s => s.includes('GB 2762')));


let bad = 0;
results.forEach(([n, v]) => { console.log((v ? '  ✓ ' : '  ✗ ') + n); if (!v) bad++; });
console.log('\n通过 ' + (results.length - bad) + '/' + results.length);
process.exit(bad ? 1 : 0);
})();
