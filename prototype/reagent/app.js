/* =========================================
 * 分析检测中心 · 试剂有效期管理系统
 * ========================================= */

const LS_DATA = 'reagentManager.data.v1';
const LS_SET  = 'reagentManager.settings.v1';

const TYPE_LIST = ['标准溶液', '配制试剂', '开封试剂', '开封标准品'];

/** 全局状态 */
let items = [];            // 试剂数据
let settings = {           // 系统设置
  reminderDays: 30,
  sortBy: 'importOrder',
  enableExpiredAlert: true,
  enableExpiringAlert: true,
  autoCheckOnStartup: true,
  browserNotifyEnabled: false
};
let activeTypes = null;    // null = 全部显示；或数组 = 当前选中的类型
let selectedId = null;     // 当前行选中（高亮，给「编辑 / 单条删除」用）
let selectedIds = new Set(); // 多选集合（用于批量删除）
let lastCheckedIndex = -1;  // 表格中上一次被勾选的可见行 index（用于 Shift 连选）
let pendingDeleteId = null;
let pendingDeleteIds = null;
let pendingDeleteMode = 'single'; // 'single' | 'batch'
let excelBuffer = [];      // 待导入的 Excel 数据

/* ===== 点击列头自动分组 ===== */
const COLUMN_LABELS = {
  name: '试剂名称', type: '类型', concentration: '浓度',
  preparedDate: '配制日期', expireDate: '有效期至',
  status: '状态', operator: '配制人', location: '存放位置', note: '备注'
};
let groupColumn = null;            // 当前分组的列 key（null = 不分组）
let groupDesc = false;             // 分组排列方向：false = 正序（第1次点击），true = 反序（第2次点击）
let collapsedGroups = new Set();   // 已折叠的分组（列::组值）

function getGroupVal(it, col) {
  if (col === 'status') {
    const st = computeStatus(it.expireDate, it.preparedDate);
    return st.key === 'expired' ? '已过期' : st.key === 'expiring' ? '即将过期' : '有效';
  }
  const v = it[col];
  return (v == null || String(v).trim() === '') ? '（空）' : String(v).trim();
}

/**
 * 点击列头三态循环：
 *   第 1 次点击 → 按该列分组（正序）
 *   第 2 次点击 → 按该列分组（反序）
 *   第 3 次点击 → 恢复默认顺序（取消按该列分组）
 */
function toggleGroupColumn(col) {
  if (groupColumn !== col) {
    groupColumn = col;
    groupDesc = false;
  } else if (!groupDesc) {
    groupDesc = true;
  } else {
    groupColumn = null;
    groupDesc = false;
  }
  collapsedGroups.clear();
  renderTable();
}

/* ===== 同步状态（后端服务器版） ===== */
let baseVersion = 0;       // 服务器上最后一次成功同步的版本号
let localVersion = 0;      // 本地最新版本号（每次变更刷新）
let syncMode = 'offline';  // 'online' | 'offline' | 'syncing'

/* ===== 后端 API ===== */
const API_BASE = ''; // 同源部署，留空即可

async function apiGet(path) {
  const res = await fetch(API_BASE + path);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}
async function apiPut(path, body) {
  const res = await fetch(API_BASE + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (res.status === 409) return { conflict: true, state: await res.json() };
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return { conflict: false, state: await res.json() };
}

/* ===== 工具函数 ===== */
const $ = (id) => document.getElementById(id);
const today = () => {
  const d = new Date();
  d.setHours(0,0,0,0);
  return d;
};
const fmtDate = (d) => {
  const dd = (d instanceof Date) ? d : new Date(d);
  const y = dd.getFullYear();
  const m = String(dd.getMonth() + 1).padStart(2, '0');
  const day = String(dd.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const isoToDate = (s) => {
  if (!s) return null;
  if (s instanceof Date) return isNaN(s.getTime()) ? null : s;
  // Excel 序列号 -> 日期（1900 系统）
  if (typeof s === 'number') {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(epoch.getTime() + s * 86400000);
  }
  const str = String(s).trim();
  if (!str) return null;
  // 纯 8 位：20260810
  let m = str.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  // 中文：2026年8月10日
  m = str.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  // 四位年在最前：2026-8-10 / 2026/8/10 / 2026.8.10
  m = str.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  // 美式短日期：8/10/26 → 2026-08-10；8/10/2026 → 2026-08-10（Excel 常见）
  m = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let y = +m[3];
    if (m[3].length === 2) y = y < 50 ? 2000 + y : 1900 + y;
    return new Date(y, +m[1] - 1, +m[2]);
  }
  // 兜底（ISO 等）；不要把 / 替换成 -，否则会破坏美式解析
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
};
/** 统一存储为 ISO YYYY-MM-DD（杜绝 8/10/26 这种两位年份） */
const normDate = (s) => {
  if (s == null || s === '') return '';
  const d = isoToDate(s);
  return d ? fmtDate(d) : String(s);
};
/** 系统显示格式：YYYY/MM/DD（如 2026/11/20，四位年份） */
const dispDate = (s) => {
  const n = normDate(s);
  return n ? n.replace(/-/g, '/') : '';
};
/** Excel 单元格写入格式：YYYYMMDD 纯数字（如 20261120） */
const excelDate = (s) => {
  const n = normDate(s);
  return n ? n.replace(/-/g, '') : '';
};
const uid = () => 'r-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);

/** 计算距配制日期已过的"满月数"。8/3 配制 → 9/4 已算 2 个月（9 月跨月 +1）。 */
function monthsSincePrepared(prepStr) {
  const prep = isoToDate(prepStr);
  if (!prep) return 0;
  const t = today();
  let m = (t.getFullYear() - prep.getFullYear()) * 12 + (t.getMonth() - prep.getMonth());
  if (t.getDate() >= prep.getDate()) m += 1;        // 当日已过配制日 → 多算 1 个月
  return Math.max(0, m);
}

function daysBetween(a, b) {
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / 86400000);
}

/** 有效期至自动计算：配制日期 + 有效期(N) + 单位(月/天) - 1天，带月末钳制。
    与原始记录 labbench.js 的 date8Add 完全一致。
    例：2026-11-20 + 3月 → 2027-02-20 → 减1天 = 2027-02-19 */
function calcExpiry(prepStr, dur, unit) {
  const prep = isoToDate(prepStr);
  const n = parseInt(dur, 10);
  if (!prep || !(n > 0)) return '';
  let dt;
  if (unit === '月' || unit === 'm' || unit === 'month') {
    const t = new Date(prep.getFullYear(), prep.getMonth() + n, 1);
    const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    dt = new Date(t.getFullYear(), t.getMonth(), Math.min(prep.getDate(), last));
  } else {
    dt = new Date(prep.getFullYear(), prep.getMonth(), prep.getDate());
    dt.setDate(dt.getDate() + n);
  }
  dt.setDate(dt.getDate() - 1);
  return fmtDate(dt);
}
/** 该类型是否自动算有效期至：标准溶液 / 配制试剂 才算；开封试剂/开封标准品用厂商标注 */
function autoExpiryType(type) {
  return type === '标准溶液' || type === '配制试剂';
}
/** 单位归一化：月/M/月(s) → 月；天/d/日 → 天 */
function normUnit(u) {
  const s = String(u || '').trim().toLowerCase();
  if (/^(月|m|mo|month|个月)$/.test(s)) return '月';
  if (/^(天|日|d|day)$/.test(s)) return '天';
  return '';
}

function toast(msg, kind) {
  const t = document.createElement('div');
  t.className = 'toast' + (kind ? ' ' + kind : '');
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 2200);
}

/* ===== 存储（本地缓存 + 服务器同步） ===== */
function saveCache() {
  try {
    localStorage.setItem(LS_DATA, JSON.stringify(items));
    localStorage.setItem(LS_SET, JSON.stringify(settings));
  } catch (e) { /* 存储满等情况忽略 */ }
}
/** 字段归一化：兼容两代数据。老数据用 prep/exp/conc/op/loc，新数据用 preparedDate/expireDate/...；
    统一补齐新字段并把日期转成完整 YYYY-MM-DD（杜绝 8/10/26），在加载时一次性迁移。 */
function normalizeItems(arr) {
  if (!Array.isArray(arr)) return arr;
  arr.forEach(it => {
    if (!it || typeof it !== 'object') return;
    if (!it.preparedDate && it.prep) it.preparedDate = it.prep;
    if (!it.expireDate && it.exp) it.expireDate = it.exp;
    if (!it.concentration && it.conc) it.concentration = it.conc;
    if (!it.operator && it.op) it.operator = it.op;
    if (!it.location && it.loc) it.location = it.loc;
    // 日期统一转完整格式（8/10/26 → 2026-08-10；20261120 保持）
    if (it.preparedDate) it.preparedDate = normDate(it.preparedDate);
    if (it.expireDate) it.expireDate = normDate(it.expireDate);
  });
  return arr;
}
function loadCache() {
  try { items = JSON.parse(localStorage.getItem(LS_DATA) || '[]'); } catch { items = []; }
  normalizeItems(items);
  try {
    const s = JSON.parse(localStorage.getItem(LS_SET) || '{}');
    settings = Object.assign({
      reminderDays: 30, sortBy: 'importOrder',
      enableExpiredAlert: true, enableExpiringAlert: true,
      autoCheckOnStartup: true, browserNotifyEnabled: false
    }, s);
  } catch {
    settings = {
      reminderDays: 30, sortBy: 'importOrder',
      enableExpiredAlert: true, enableExpiringAlert: true,
      autoCheckOnStartup: true, browserNotifyEnabled: false
    };
  }
}

/** 用服务器数据覆盖本地 */
function applyRemote(s) {
  items = normalizeItems(Array.isArray(s.data.items) ? s.data.items : []);
  settings = Object.assign({
    reminderDays: 30, sortBy: 'importOrder',
    enableExpiredAlert: true, enableExpiringAlert: true,
    autoCheckOnStartup: true, browserNotifyEnabled: false
  }, s.data.settings || {});
  baseVersion = s.updatedAt || 0;
  saveCache();
  setSyncStatus('online');
}

/** 把本地数据推送到服务器（乐观锁） */
async function pushToServer() {
  setSyncStatus('syncing');
  try {
    const result = await apiPut('/api/state', {
      data: { items, settings },
      baseVersion,
      clientVersion: localVersion
    });
    if (result.conflict) {
      // 服务器上有更新的数据（其他电脑改过）→ 以服务器为准并提示
      applyRemote(result.state);
      setSyncStatus('online');
      toast('检测到其他电脑有更新，已自动同步最新数据', 'warn');
    } else {
      baseVersion = result.state.updatedAt;
      setSyncStatus('online');
    }
  } catch (e) {
    setSyncStatus('offline');
  }
}

/** 本地变更统一入口：写缓存 + 推送服务器 */
function saveAll() {
  localVersion = Date.now();
  saveCache();
  pushToServer(); // 后台推送，不阻塞界面
}

/** 同步状态指示 */
function setSyncStatus(mode) {
  syncMode = mode;
  const badge = $('syncBadge');
  if (!badge) return;
  if (mode === 'online') {
    badge.textContent = '● 已同步';
    badge.className = 'sync-badge online';
  } else if (mode === 'syncing') {
    badge.textContent = '⟳ 同步中';
    badge.className = 'sync-badge syncing';
  } else {
    badge.textContent = '○ 离线（本地）';
    badge.className = 'sync-badge offline';
  }
}

/* ===== 种子数据 ===== */
function seedSample() {
  // 基于今天的真实日期生成一些示例，让"看起来就像截图"
  const t = today();
  const offset = (days) => {
    const d = new Date(t);
    d.setDate(d.getDate() + days);
    return fmtDate(d);
  };
  const sample = [
    { name: 'VB1标准储备液', type: '标准溶液', conc: '512.8ug/ml',   prep: offset(-68), exp: offset(36),  op: '范丽颖', loc: '冰柜1', note: '' },
    { name: 'VB1标准储备液', type: '标准溶液', conc: '523.3ug/ml',   prep: offset(-26), exp: offset(77),  op: '范丽颖', loc: '冰柜1', note: '' },
    { name: 'VB2标准储备液', type: '标准溶液', conc: '113.4ug/ml',   prep: offset(-46), exp: offset(46),  op: '范丽颖', loc: '冰柜1', note: '' },
    { name: 'VD2标准溶液',   type: '标准溶液', conc: '1.19mg/ml',    prep: offset(-175), exp: offset(175), op: '范丽颖', loc: '冰柜3', note: '' },
    { name: 'VD3标准溶液',   type: '标准溶液', conc: '1.014mg/ml',   prep: offset(-175), exp: offset(175), op: '范丽颖', loc: '冰柜3', note: '' },
    { name: '生物素标准储备液', type: '标准溶液', conc: '100.5ug/ml', prep: offset(-96), exp: offset(8),   op: '范丽颖', loc: '冰柜3', note: '' },
    { name: '生物素d4标准储备液', type: '标准溶液', conc: '96ug/ml',  prep: offset(-126), exp: offset(8),  op: '范丽颖', loc: '冰柜3', note: '同位素标记' },
    { name: '生物素d4标准储备液', type: '标准溶液', conc: '960ug/ml', prep: offset(-65), exp: offset(70),  op: '范丽颖', loc: '冰柜3', note: '' },
    { name: '牛磺酸标准储备液', type: '标准溶液', conc: '1.077mg/ml',prep: offset(-85), exp: offset(85),  op: '毛颖芝', loc: '冰柜3', note: '' },
    { name: '乳铁蛋白标准储备液', type: '标准溶液', conc: '4.929mg/ml',prep: offset(-65), exp: offset(70), op: '毛颖芝', loc: '冰柜1', note: '' },
    { name: 'VB6标准储备液', type: '标准溶液', conc: '1mg/ml',       prep: offset(-79), exp: offset(79),  op: '毛颖芝', loc: '冰柜1', note: '' },
    { name: '亚铁氰化钾溶液', type: '配制试剂', conc: '0.15g/mL',    prep: offset(-30), exp: offset(30),  op: '毛颖芝', loc: '试剂柜2', note: '' },
    { name: '乙酸锌溶液',   type: '配制试剂', conc: '0.3g/mL',      prep: offset(-30), exp: offset(30),  op: '毛颖芝', loc: '试剂柜3', note: '' },
    { name: '无水碳酸钠溶液', type: '配制试剂', conc: '80mmol/L',    prep: offset(-30), exp: offset(30),  op: '毛颖芝', loc: '试剂柜3', note: '' },
    { name: '盐酸甲胺溶液', type: '配制试剂', conc: '20g/L',        prep: offset(-78), exp: offset(78),  op: '毛颖芝', loc: '冰柜1', note: '' },
    { name: '牛磺酸流动相', type: '配制试剂', conc: '10mmol/L',     prep: offset(-17), exp: offset(17),  op: '毛颖芝', loc: '通风橱',  note: '' },
    { name: '乳铁蛋白流动相', type: '配制试剂', conc: '/',          prep: offset(-19), exp: offset(19),  op: '毛颖芝', loc: '通风橱',  note: '' },
    { name: '醋酸溶液',     type: '配制试剂', conc: '100mL/L',      prep: offset(-50), exp: offset(50),  op: '毛颖芝', loc: '试剂柜3', note: '' },
    { name: '核苷酸流动相', type: '配制试剂', conc: '/',            prep: offset(-9),  exp: offset(2),   op: '毛颖芝', loc: '通风橱',  note: '即将过期，请尽快使用' },
    { name: '盐酸溶液',     type: '配制试剂', conc: '0.1mol/L',     prep: offset(-66), exp: offset(66),  op: '毛颖芝', loc: '试剂柜3', note: '' },
    { name: '盐酸溶液',     type: '配制试剂', conc: '5mol/L',       prep: offset(-63), exp: offset(63),  op: '毛颖芝', loc: '试剂柜3', note: '' },
    { name: '甲醇（开封）', type: '开封试剂', conc: 'HPLC',          prep: offset(-12), exp: offset(180), op: '毛颖芝', loc: '试剂柜1', note: '' },
    { name: '乙腈（开封）', type: '开封试剂', conc: 'HPLC',          prep: offset(-15), exp: offset(180), op: '毛颖芝', loc: '试剂柜1', note: '' },
    { name: 'VC 标准品（开封）', type: '开封标准品', conc: '99.5%',  prep: offset(-200), exp: offset(160), op: '范丽颖', loc: '干燥器', note: '' },
  ];

  items = normalizeItems(sample.map(s => ({
    id: uid(),
    ...s,
  })));
}

/* ===== 状态计算 ===== */
function computeStatus(expireStr, prepStr) {
  const exp = isoToDate(expireStr);
  const prep = isoToDate(prepStr);
  if (!exp) return { label: '日期无效', key: 'invalid' };
  // 处理配制日期早于有效期是必须的；如果到期日早于今天则过期
  const remain = daysBetween(today(), exp);
  const validDay = (prep && daysBetween(prep, exp)) || 1;
  if (remain < 0) {
    return { label: '已过期', key: 'expired', days: remain };
  }
  if (remain <= settings.reminderDays) {
    return { label: `即将过期`, key: 'expiring', days: remain };
  }
  if (remain < validDay / 2) {
    return { label: `有效(${remain}天)`, key: 'mid', days: remain };
  }
  return { label: `有效(${remain}天)`, key: 'ok', days: remain };
}

/* ===== 渲染 ===== */
function filteredSorted() {
  const keyword = ($('searchBox').value || '').trim().toLowerCase();
  let list = items.slice();
  if (activeTypes && activeTypes.length) list = list.filter(i => activeTypes.includes(i.type));
  if (keyword) list = list.filter(i =>
    (i.name || '').toLowerCase().includes(keyword) ||
    (i.operator || '').toLowerCase().includes(keyword) ||
    (i.location || '').toLowerCase().includes(keyword)
  );
  // 排序
  switch (settings.sortBy) {
    case 'importOrder':
      // 按 Excel 导入 / 录入的原始顺序（数组顺序即录入顺序，不排序）
      break;
    case 'expireAsc':
      list.sort((a, b) => (isoToDate(a.expireDate) - isoToDate(b.expireDate)));
      break;
    case 'expireDesc':
      list.sort((a, b) => (isoToDate(b.expireDate) - isoToDate(a.expireDate)));
      break;
    case 'nameAsc':
      list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh'));
      break;
  }
  return list;
}

function renderRow(it, idx) {
  const st = computeStatus(it.expireDate, it.preparedDate);
  const trCls =
    st.key === 'expired' ? 'expired' :
    st.key === 'expiring' ? 'expiring-soon' : 'valid-far';
  const isChecked = selectedIds.has(it.id);
  const isSelected = selectedId === it.id;
  const rowCls = `${trCls}${isSelected ? ' selected' : ''}${isChecked ? ' checked' : ''}`;
  const tdTypeCls = 't-' + it.type;
  // 开封标准品：开封满 6 个月（含当月）就在括号里追加提示
  const openedMonths = it.type === '开封标准品' ? monthsSincePrepared(it.preparedDate) : 0;
  const openedTag = openedMonths >= 6 ? `，开封超${openedMonths}个月` : '';
  let showStatus;
  if (st.key === 'expired') {
    showStatus = st.days < 0
      ? `<span style="color:#c0392b;">已过期（${Math.abs(st.days)}天${openedTag}）</span>`
      : `<span style="color:#c0392b;">已过期</span>`;
  } else if (st.key === 'expiring') {
    showStatus = `<span style="color:#e67e22;">即将过期(${st.days}天${openedTag})</span>`;
  } else {
    showStatus = `<span style="color:#27a86b;">有效(${st.days}天${openedTag})</span>`;
  }
  return `
    <tr class="${rowCls}" data-id="${it.id}" data-idx="${idx}" onclick="rowClick(event, '${it.id}', ${idx})" ondblclick="openEdit()">
      <td class="col-check" onclick="cellCheckClick(event)">
        <input type="checkbox" ${isChecked ? 'checked' : ''} onclick="toggleCheck(event, '${it.id}', ${idx})">
      </td>
      <td>${idx + 1}</td>
      <td>${escapeHtml(it.name)}</td>
      <td class="${tdTypeCls}">${it.type}</td>
      <td>${escapeHtml(it.concentration || '/')}</td>
      <td>${escapeHtml(dispDate(it.preparedDate))}</td>
      <td>${escapeHtml(dispDate(it.expireDate))}</td>
      <td class="col-status">${showStatus}</td>
      <td>${escapeHtml(it.operator)}</td>
      <td>${escapeHtml(it.location)}</td>
      <td>${escapeHtml(it.note)}</td>
    </tr>
  `;
}

function renderTable() {
  const tb = $('tableBody');
  const list = filteredSorted();

  // 表头高亮当前分组列
  document.querySelectorAll('#reagentTable thead th.groupable').forEach(th => {
    th.classList.toggle('grouped', th.dataset.col === groupColumn);
  });

  if (list.length === 0) {
    tb.innerHTML = `<tr class="empty-row"><td colspan="11">暂无数据，请点击「新增」或「Excel 导入」添加</td></tr>`;
    updateSelectedCount();
    return;
  }

  const allChecked = list.every(it => selectedIds.has(it.id));
  $('checkAll').checked = allChecked;

  if (groupColumn) {
    // ===== 分组模式：按该列值聚合，插入分组行（可折叠） =====
    const idxMap = new Map();           // 行 -> filteredSorted 中的真实索引（Shift 连选依赖）
    list.forEach((it, i) => idxMap.set(it, i));
    const grouped = new Map();          // 组值 -> 该组行
    const firstIdx = new Map();         // 组值 -> 该组首条在 list 中的索引（非日期列保持原排序）
    list.forEach((it, i) => {
      const v = getGroupVal(it, groupColumn);
      if (!grouped.has(v)) { grouped.set(v, []); firstIdx.set(v, i); }
      grouped.get(v).push(it);
    });

    // 组顺序规则（各列统一梳理）：
    //   配制日期 / 有效期至 → 按日期升序（近→远）
    //   状态   → 已过期 → 即将过期 → 有效（紧急优先）
    //   类型   → 按 TYPE_LIST 固定顺序
    //   试剂名称 / 存放位置 → 按拼音（字典）序
    //   浓度   → 数值升序
    //   配制人 / 备注 → 保持原排序中首次出现位置
    //   「（空）」一律放最后
    const zhCollator = new Intl.Collator('zh-Hans-CN', { numeric: true });
    const statusOrder = { '已过期': 0, '即将过期': 1, '有效': 2 };
    const typeOrder = (v) => { const i = TYPE_LIST.indexOf(v); return i >= 0 ? i : TYPE_LIST.length; };
    const numPrefix = (v) => { const m = String(v).match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };
    const entries = Array.from(grouped.entries());
    entries.sort((a, b) => {
      const va = a[0], vb = b[0];
      const aEmpty = va === '（空）', bEmpty = vb === '（空）';
      if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;            // 「（空）」放最后
      if (aEmpty) return 0;
      switch (groupColumn) {
        case 'preparedDate': case 'expireDate': {               // 日期近→远
          const da = isoToDate(va), db = isoToDate(vb);
          return (da ? da.getTime() : Infinity) - (db ? db.getTime() : Infinity);
        }
        case 'status':                                           // 紧急优先
          return (statusOrder[va] != null ? statusOrder[va] : 9) - (statusOrder[vb] != null ? statusOrder[vb] : 9);
        case 'type': {                                           // 类型固定顺序
          const ta = typeOrder(va), tb = typeOrder(vb);
          return ta !== tb ? ta - tb : zhCollator.compare(va, vb);
        }
        case 'concentration': {                                  // 数值升序
          const na = numPrefix(va), nb = numPrefix(vb);
          if (na != null && nb != null) return na - nb;
          if (na != null) return -1;                             // 有数值的排在前
          if (nb != null) return 1;
          return zhCollator.compare(va, vb);
        }
        case 'name': case 'location':                            // 拼音序
          return zhCollator.compare(va, vb);
        default:                                                 // 配制人 / 备注：保持原顺序
          return firstIdx.get(va) - firstIdx.get(vb);
      }
    });
    if (groupDesc) entries.reverse();   // 第 2 次点击：组顺序整体反转

    let html = '';
    entries.forEach(([gname, rows]) => {
      const gKey = groupColumn + '::' + gname;
      const collapsed = collapsedGroups.has(gKey);
      html += `
        <tr class="group-row" data-gkey="${escapeHtml(gKey)}" title="点击折叠 / 展开">
          <td colspan="11"><span class="g-arrow">${collapsed ? '▸' : '▾'}</span>${escapeHtml(COLUMN_LABELS[groupColumn] || groupColumn)}：${escapeHtml(gname)}（${rows.length} 条）</td>
        </tr>`;
      rows.forEach(it => {
        if (!collapsed) html += renderRow(it, idxMap.get(it));
      });
    });
    tb.innerHTML = html;
  } else {
    // ===== 普通模式 =====
    tb.innerHTML = list.map((it, idx) => renderRow(it, idx)).join('');
  }
  updateSelectedCount();
}

/* 分组行折叠 / 展开（事件委托） */
$('tableBody').addEventListener('click', (e) => {
  const tr = e.target.closest('tr.group-row');
  if (!tr) return;
  const key = tr.dataset.gkey;
  if (collapsedGroups.has(key)) collapsedGroups.delete(key);
  else collapsedGroups.add(key);
  renderTable();
});

function updateSelectedCount() {
  const el = $('selectedCount');
  if (el) el.textContent = selectedIds.size;
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

/* ===== 行选择 / 多选 ===== */
function rowClick(e, id, idx) {
  // 如果点击的是 checkbox 列，由 checkbox 自己的事件处理
  if (e.target.tagName === 'INPUT' && e.target.type === 'checkbox') return;

  if (e.shiftKey) {
    // Shift 连选：从 lastCheckedIndex 到当前 index 全部勾选
    if (lastCheckedIndex >= 0) {
      const list = filteredSorted();
      const start = Math.min(lastCheckedIndex, idx);
      const end = Math.max(lastCheckedIndex, idx);
      for (let i = start; i <= end; i++) {
        selectedIds.add(list[i].id);
      }
      lastCheckedIndex = idx;
      renderTable();
    } else {
      toggleCheckById(id, idx);
    }
    return;
  }

  if (e.ctrlKey || e.metaKey) {
    // Ctrl / Cmd：切换当前行的勾选
    toggleCheckById(id, idx);
    return;
  }

  // 普通点击：仅单选高亮（不清空多选，方便查看）
  selectedId = id;
  lastCheckedIndex = idx;
  selectRow(id);
}

// 阻止 checkbox 单元格的事件冒泡到行点击
function cellCheckClick(e) {
  e.stopPropagation();
}

function selectRow(id) {
  selectedId = id;
  document.querySelectorAll('#tableBody tr').forEach(tr => {
    tr.classList.toggle('selected', tr.dataset.id === id);
  });
}

function toggleCheck(e, id, idx) {
  e.stopPropagation();
  toggleCheckById(id, idx);
}

function toggleCheckById(id, idx) {
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
    lastCheckedIndex = -1;
  } else {
    selectedIds.add(id);
    lastCheckedIndex = idx;
  }
  renderTable();
}

function toggleCheckAll(checked) {
  const list = filteredSorted();
  if (checked) {
    list.forEach(it => selectedIds.add(it.id));
  } else {
    list.forEach(it => selectedIds.delete(it.id));
  }
  lastCheckedIndex = -1;
  renderTable();
}

function clearSelection() {
  selectedIds.clear();
  selectedId = null;
  lastCheckedIndex = -1;
  renderTable();
}

/** 一键全选：勾选当前可见（含搜索 / 类型过滤后）的全部行 */
function selectAllVisible() {
  const list = filteredSorted();
  if (list.length === 0) { toast('当前没有可选择的记录', 'warn'); return; }
  list.forEach(it => selectedIds.add(it.id));
  lastCheckedIndex = -1;
  renderTable();
  toast(`已全选 ${list.length} 条`);
}

/* ===== CRUD ===== */
function getCurrent() {
  if (!selectedId) return null;
  return items.find(i => i.id === selectedId) || null;
}

/** 类型切换：开封类不自动算（用厂商标注），隐藏「有效期」输入 */
function onTypeChange() {
  const t = $('f-type').value;
  const wrap = $('f-durWrap');
  if (wrap) wrap.style.display = autoExpiryType(t) ? '' : 'none';
  recalcExpiry();
}
/** 配制日期 / 有效期 / 单位 变化 → 自动算「有效期至」（仅标准溶液/配制试剂） */
function recalcExpiry() {
  const t = $('f-type').value;
  if (!autoExpiryType(t)) return; // 开封类不自动算
  const prep = $('f-prepared').value;
  const dur = $('f-dur').value;
  const unit = $('f-unit').value;
  const calc = calcExpiry(prep, dur, unit);
  if (calc) $('f-expire').value = calc;
}

function openAdd() {
  // 清除单选状态：否则 saveItem 会误把「新增」当作对当前选中行的「编辑」
  selectedId = null;
  $('editTitle').textContent = '新增试剂';
  $('f-name').value = '';
  $('f-type').value = '标准溶液';
  $('f-conc').value = '';
  $('f-prepared').value = fmtDate(today());
  $('f-dur').value = '3';
  $('f-unit').value = '月';
  $('f-expire').value = calcExpiry($('f-prepared').value, '3', '月');
  $('f-operator').value = '';
  $('f-location').value = '';
  $('f-note').value = '';
  onTypeChange();
  $('editModal').classList.add('show');
  setTimeout(() => $('f-name').focus(), 50);
}

function openEdit() {
  const cur = getCurrent();
  if (!cur) { toast('请先选择一行', 'warn'); return; }
  $('editTitle').textContent = '编辑试剂';
  $('f-name').value = cur.name || '';
  $('f-type').value = cur.type || '标准溶液';
  $('f-conc').value = cur.concentration || '';
  $('f-prepared').value = normDate(cur.preparedDate);
  $('f-dur').value = cur.dur || '';
  $('f-unit').value = normUnit(cur.unit) || '月';
  $('f-expire').value = normDate(cur.expireDate);
  $('f-operator').value = cur.operator || '';
  $('f-location').value = cur.location || '';
  $('f-note').value = cur.note || '';
  onTypeChange();
  $('editModal').classList.add('show');
}

function saveItem() {
  const name = ($('f-name').value || '').trim();
  const type = $('f-type').value;
  const conc = ($('f-conc').value || '').trim();
  const prep = $('f-prepared').value;
  const dur  = ($('f-dur').value || '').trim();
  const unit = normUnit($('f-unit').value);
  let   exp  = $('f-expire').value;
  const op   = ($('f-operator').value || '').trim();
  const loc  = ($('f-location').value || '').trim();
  const note = ($('f-note').value || '').trim();

  if (!name)  { toast('请填写试剂名称', 'error'); $('f-name').focus(); return; }
  if (!prep)  { toast('请选择配制日期', 'error'); $('f-prepared').focus(); return; }
  // 标准溶液/配制试剂：只要填了有效期就自动算，覆盖手动填的「有效期至」
  if (autoExpiryType(type) && dur && unit) {
    const calc = calcExpiry(prep, dur, unit);
    if (calc) exp = calc;
  }
  if (!exp)   { toast('请填有效期（或有效期至）', 'error'); return; }
  if (isoToDate(prep) >= isoToDate(exp)) { toast('有效期需晚于配制日期', 'error'); $('f-expire').focus(); return; }
  if (!op)    { toast('请填写配制人', 'error'); $('f-operator').focus(); return; }

  const cur = getCurrent();
  if (cur) {
    Object.assign(cur, {
      name, type, concentration: conc, preparedDate: prep,
      expireDate: exp, dur, unit, operator: op, location: loc, note
    });
    toast('已更新');
  } else {
    const newId = uid();
    const newItem = {
      id: newId,
      name, type, concentration: conc,
      preparedDate: prep, expireDate: exp, dur, unit,
      operator: op, location: loc, note
    };
    // 与 Excel 导入一致：优先插到「相同试剂名称 + 相同配制人」最后一条之后，
    // 其次插到「相同配制人」最后一条之后，都没有才追加到末尾
    const pos = findInsertIndexByOperator(newItem.name, newItem.operator);
    if (pos >= 0) {
      items.splice(pos + 1, 0, newItem);
    } else {
      items.push(newItem);
    }
    selectedId = newId;
    toast('已新增');
  }
  saveAll();
  closeModal('editModal');
  renderTable();
  selectRow(selectedId);
  // 编辑/新增后如果涉及过期，更新提醒弹窗内容
  if ($('alertModal').classList.contains('show')) renderAlertModal();
}

function doDelete() {
  const cur = getCurrent();
  if (!cur) { toast('请先选择一行', 'warn'); return; }
  pendingDeleteMode = 'single';
  pendingDeleteId = cur.id;
  pendingDeleteIds = null;
  $('confirmText').textContent = `确认删除「${cur.name}」这条记录吗？删除后无法恢复。`;
  $('confirmModal').classList.add('show');
}

function doBatchDelete() {
  if (selectedIds.size === 0) { toast('请先勾选要删除的记录', 'warn'); return; }
  pendingDeleteMode = 'batch';
  pendingDeleteIds = Array.from(selectedIds);
  pendingDeleteId = null;
  $('confirmText').textContent = `确认删除选中的 ${selectedIds.size} 条记录吗？删除后无法恢复。`;
  $('confirmModal').classList.add('show');
}

function deleteItemsByIds(ids) {
  const count = ids.length;
  items = items.filter(i => !ids.includes(i.id));
  ids.forEach(id => selectedIds.delete(id));
  if (selectedId && ids.includes(selectedId)) selectedId = null;
  saveAll();
  renderTable();
  return count;
}

function doConfirmDelete() {
  if (pendingDeleteMode === 'batch' && pendingDeleteIds) {
    const count = deleteItemsByIds(pendingDeleteIds);
    pendingDeleteIds = null;
    toast(`已删除 ${count} 条`);
  } else if (pendingDeleteId) {
    deleteItemsByIds([pendingDeleteId]);
    pendingDeleteId = null;
    toast('已删除');
  }
  pendingDeleteMode = 'single';
  closeModal('confirmModal');
}

async function refreshData() {
  // 从服务器拉取最新数据（含其他电脑的修改）
  try {
    const remote = await apiGet('/api/state');
    applyRemote(remote);
    selectedIds.clear();
    lastCheckedIndex = -1;
    renderTable();
    toast('已从服务器同步最新数据');
  } catch (e) {
    renderTable();
    toast('无法连接服务器，当前为本地数据', 'warn');
  }
}

/* ===== 类型图例过滤 ===== */
function toggleLegend(chipEl) {
  chipEl.classList.toggle('active');
  activeTypes = Array.from(document.querySelectorAll('.legend .chip.active')).map(c => c.dataset.type);
  if (activeTypes.length === 0 || activeTypes.length === TYPE_LIST.length) {
    activeTypes = null;
  }
  selectedIds.clear();
  lastCheckedIndex = -1;
  renderTable();
}

/* ===== 过期提醒弹窗 ===== */
function openAlertModal() {
  renderAlertModal();
  $('alertModal').classList.add('show');
}

function getAlertItems() {
  return items.map(it => ({
    ...it,
    status: computeStatus(it.expireDate, it.preparedDate)
  })).filter(it => {
    if (it.status.key === 'expired' && settings.enableExpiredAlert) return true;
    if (it.status.key === 'expiring' && settings.enableExpiringAlert) return true;
    return false;
  });
}

function renderAlertModal() {
  const body = $('alertBody');
  const alerts = getAlertItems();

  if (alerts.length === 0) {
    body.innerHTML = `<div class="alert-empty">暂无需要提醒的试剂</div>`;
    return;
  }

  const expired = alerts.filter(it => it.status.key === 'expired').sort((a, b) => a.status.days - b.status.days);
  const expiring = alerts.filter(it => it.status.key === 'expiring').sort((a, b) => a.status.days - b.status.days);

  const renderSection = (list, label) => {
    if (list.length === 0) return '';
    return `
      <div class="alert-section">
        <div class="alert-section-title">[${label} ${list.length} 条]</div>
        ${list.map(it => {
          const daysText = it.status.key === 'expired'
            ? (it.status.days < 0 ? `过期${Math.abs(it.status.days)}天` : '已过期')
            : `剩余${it.status.days}天`;
          return `
            <div class="alert-item">
              <span class="alert-bullet"></span>
              <span>${escapeHtml(it.name)} — ${daysText}<span class="loc">| 配制人: ${escapeHtml(it.operator || '未填写')} | 位置: ${escapeHtml(it.location || '未填写')}</span></span>
            </div>`;
        }).join('')}
      </div>
    `;
  };

  body.innerHTML = renderSection(expired, '已过期') + renderSection(expiring, '即将过期');
}

/** 稍后提醒：30 分钟后再次自动弹出 */
function snoozeAlert() {
  const snoozeUntil = Date.now() + 30 * 60 * 1000;
  try { localStorage.setItem('reagentManager.snoozeUntil', String(snoozeUntil)); } catch {}
  closeModal('alertModal');
  toast('已设置为 30 分钟后再次提醒');
}

function shouldAutoShowAlert() {
  if (!settings.autoCheckOnStartup) return false;
  const snooze = Number(localStorage.getItem('reagentManager.snoozeUntil') || '0');
  if (snooze && Date.now() < snooze) return false;
  return true;
}

/* ===== 提醒设置 ===== */
function openReminder() {
  $('reminder-enable-expired').checked = settings.enableExpiredAlert !== false;
  $('reminder-enable-expiring').checked = settings.enableExpiringAlert !== false;
  $('reminder-auto-check').checked = settings.autoCheckOnStartup !== false;
  $('reminder-days').value = settings.reminderDays;
  const sortSel = $('reminder-sort');
  if (sortSel) sortSel.value = settings.sortBy || 'importOrder';
  updateBrowserNotifyStatus();
  $('reminderModal').classList.add('show');
}
function saveReminder() {
  const d = parseInt($('reminder-days').value, 10);
  if (!d || d < 1) { toast('请输入合法的天数', 'warn'); return; }
  settings.reminderDays = d;
  const sortSel = $('reminder-sort');
  if (sortSel) settings.sortBy = sortSel.value;
  settings.enableExpiredAlert = $('reminder-enable-expired').checked;
  settings.enableExpiringAlert = $('reminder-enable-expiring').checked;
  settings.autoCheckOnStartup = $('reminder-auto-check').checked;
  saveAll();
  closeModal('reminderModal');
  renderTable();
  renderAlertModal(); // 如果弹窗开着，同步刷新
  toast('设置已保存');
}

/** 立即检查：弹出警告弹窗 */
function checkAlertsNow() {
  const alerts = getAlertItems();
  if (alerts.length === 0) {
    toast('当前没有需要提醒的试剂', 'warn');
    return;
  }
  openAlertModal();
  // 如果开启了浏览器通知，同时推送一条
  if (settings.browserNotifyEnabled && 'Notification' in window && Notification.permission === 'granted') {
    new Notification('试剂有效期警告', {
      body: `发现 ${alerts.length} 条试剂需要关注`,
      icon: ''
    });
  }
}

/** 浏览器通知开关 */
function updateBrowserNotifyStatus() {
  const el = $('system-reminder-status');
  const btn = $('btn-browser-notify');
  if (!('Notification' in window)) {
    el.textContent = '当前浏览器不支持系统通知。';
    btn.style.display = 'none';
    return;
  }
  if (Notification.permission === 'granted' && settings.browserNotifyEnabled) {
    el.textContent = '浏览器通知已开启；页面打开时会推送过期提醒。';
    btn.textContent = '关闭浏览器通知';
  } else if (Notification.permission === 'denied') {
    el.textContent = '浏览器通知权限已被拒绝，请在浏览器设置中手动开启。';
    btn.textContent = '重新请求通知权限';
  } else {
    el.textContent = '网页版无法在您关闭浏览器后弹窗；开启浏览器通知可作为替代。';
    btn.textContent = '启用浏览器通知';
  }
}
async function requestBrowserNotify() {
  if (!('Notification' in window)) { toast('当前浏览器不支持通知', 'warn'); return; }
  if (Notification.permission === 'granted' && settings.browserNotifyEnabled) {
    // 当前已开启 → 视为关闭
    settings.browserNotifyEnabled = false;
    saveAll();
    updateBrowserNotifyStatus();
    toast('已关闭浏览器通知');
    return;
  }
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    settings.browserNotifyEnabled = true;
    saveAll();
    updateBrowserNotifyStatus();
    new Notification('试剂有效期管理系统', { body: '浏览器通知已开启' });
    toast('浏览器通知已开启');
  } else if (perm === 'denied') {
    settings.browserNotifyEnabled = false;
    saveAll();
    updateBrowserNotifyStatus();
    toast('通知权限被拒绝', 'warn');
  }
}

/* ===== Modal ===== */
function closeModal(id) { $(id).classList.remove('show'); }
window.addEventListener('click', (e) => {
  document.querySelectorAll('.modal-mask').forEach(m => {
    if (e.target === m) m.classList.remove('show');
  });
});

/* ===== CSV 导出 ===== */
function exportCSV() {
  const headers = ['试剂名称', '类型', '浓度', '配制日期', '有效期', '有效期单位', '有效期至', '配制人', '存放位置', '备注'];
  const rows = filteredSorted().map(it =>
    [it.name, it.type, it.concentration || '', excelDate(it.preparedDate), it.dur || '', it.unit || '', excelDate(it.expireDate),
     it.operator, it.location || '', it.note || ''].map(s => csvEscape(s))
  );
  const csv = '\ufeff' + [headers, ...rows].map(r => r.join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = `试剂台账_${fmtDate(today())}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('CSV 已导出');
}
function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/* ===== Excel 导入 ===== */

/** 去重判据：试剂名称 + 类型 + 浓度 + 配制日期 + 有效期至 完全一致视为重复 */
function dedupKey(name, type, conc, prep, exp) {
  return [name, type, conc, prep, exp]
    .map(s => String(s == null ? '' : s).trim().toLowerCase())
    .join('|');
}

function openExcelImport() {
  $('fileInput').value = '';
  $('fileInput').click();
}
$('fileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const data = new Uint8Array(evt.target.result);
      const wb = XLSX.read(data, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
      // 统一字段
      excelBuffer = rows.map(r => {
        const norm = {};
        Object.keys(r).forEach(k => {
          const key = String(k).replace(/\s+/g, '');
          norm[key] = r[k];
        });
        const get = (...keys) => {
          for (const k of keys) if (norm[k] != null && norm[k] !== '') return norm[k];
          return '';
        };
        let preparedDate = get('配制日期', '配置日期', '配置时间'); // 兼容旧表头「配置日期」
        let expireDate = get('有效期至', '到期日期');
        // ★ 新增两列「有效期」(数字) +「有效期单位」(月/天)。
        //   「有效期」旧表头也用作"有效期至"的别名，这里按值区分：
        //   纯数字(如 3) → 当成有效期时长；能解析成日期 → 当成有效期至。
        let dur = get('有效期', '有效期限');
        let unit = normUnit(get('有效期单位', '单位'));
        const durRaw = String(dur == null ? '' : dur).trim();
        const durIsNumber = /^\d+(\.\d+)?$/.test(durRaw) ||
          (typeof dur === 'number' && isFinite(dur));
        if (!expireDate && get('有效期') && !durIsNumber) {
          // 旧表：「有效期」是日期
          expireDate = get('有效期');
        }
        if (durIsNumber) dur = durRaw;
        else dur = '';
        // 统一日期：Excel 填 20261120 / 2026/11/20 / 8/10/26 都认，内部存 ISO YYYY-MM-DD
        preparedDate = normDate(preparedDate);
        expireDate = normDate(expireDate);
        return {
          name: get('试剂名称', '品名', '名称'), // 兼容旧表头「品名」
          type: get('类型', '类别'),
          concentration: get('浓度'),
          preparedDate: String(preparedDate || ''),
          expireDate: String(expireDate || ''),
          dur: String(dur || ''),
          unit: unit,
          operator: get('配制人', '配置人', '操作人'), // 兼容旧表头「配置人」
          location: get('存放位置', '位置'),
          note: get('备注')
        };
      }).filter(r => r.name);
      if (excelBuffer.length === 0) {
        toast('未能识别到有效数据，请确认表头', 'error');
        return;
      }
      // ★ 先按「有效期+单位」把有效期至算出来（标准溶液/配制试剂），
      //   让预览、去重、过期过滤都看到算好的日期，和真正导入保持一致。
      excelBuffer.forEach(r => {
        const type = TYPE_LIST.includes(r.type) ? r.type : '配制试剂';
        r._type = type;
        if (autoExpiryType(type) && r.dur && r.unit && r.preparedDate) {
          const calc = calcExpiry(r.preparedDate, r.dur, r.unit);
          if (calc) r.expireDate = calc;
        }
      });
      // 重复检测：与现有台账比对 + 文件内部自身比对
      const seen = new Set(items.map(i =>
        dedupKey(i.name, i.type, i.concentration, i.preparedDate, i.expireDate)
      ));
      let dupCount = 0, expiredFiltered = 0, cleanedFiltered = 0;
      excelBuffer.forEach(r => {
        const type = r._type || (TYPE_LIST.includes(r.type) ? r.type : '配制试剂');
        const key = dedupKey(r.name, type, r.concentration, r.preparedDate, r.expireDate);
        r._type = type;
        r._dup = false;
        r._skipReason = '';

        // 规则 1：过期超过 15 天的记录不再上传系统
        const expDate = isoToDate(r.expireDate);
        if (expDate) {
          const remain = daysBetween(today(), expDate);
          if (remain < -15) {
            r._skipReason = `已过期${Math.abs(remain)}天·不导入`;
            r._filtered = true;
            expiredFiltered++;
            return;
          }
        }
        // 规则 2：备注含「已清理」的记录不再上传系统
        if (String(r.note || '').replace(/\s+/g, '').includes('已清理')) {
          r._skipReason = '已清理·不导入';
          r._filtered = true;
          cleanedFiltered++;
          return;
        }

        if (seen.has(key)) {
          r._dup = true;
          dupCount++;
        } else {
          seen.add(key); // 文件内部后续重复也会被标记
        }
      });
      const willImport = excelBuffer.length - dupCount - expiredFiltered - cleanedFiltered;
      $('excelRowCount').textContent =
        `${excelBuffer.length} 条（新增 ${willImport}，重复 ${dupCount}，过期超15天 ${expiredFiltered}，已清理 ${cleanedFiltered}）`;
      $('excelPreview').innerHTML = excelBuffer.map(r => {
        let tag = '<span style="color:#27a86b;">新增</span>';
        if (r._filtered) tag = `<span style="color:#95a5a6;">${escapeHtml(r._skipReason)}</span>`;
        else if (r._dup) tag = '<span style="color:#e67e22;">重复·将跳过</span>';
        const rowStyle = r._filtered ? ' style="opacity:.55;"' : '';
        return `
        <tr${rowStyle}>
          <td>${escapeHtml(r.name)}</td>
          <td>${escapeHtml(r.type || '')}</td>
          <td>${escapeHtml(r.concentration || '/')}</td>
          <td>${escapeHtml(dispDate(r.preparedDate))}</td>
          <td>${escapeHtml(r.dur || '')}</td>
          <td>${escapeHtml(r.unit || '')}</td>
          <td>${escapeHtml(dispDate(r.expireDate))}</td>
          <td>${escapeHtml(r.operator)}</td>
          <td>${escapeHtml(r.location)}</td>
          <td>${escapeHtml(r.note)}</td>
          <td style="font-weight:600;white-space:nowrap;">${tag}</td>
        </tr>`;
      }).join('');
      $('excelModal').classList.add('show');
    } catch (err) {
      console.error(err);
      toast('文件解析失败：' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
});

/**
 * 定位导入记录的插入位置（两级匹配）：
 * 1) 台账中已有「试剂名称 + 配制人」都相同的记录 → 插到最后一条之后（同试剂名称同人聚在一起）；
 * 2) 只有配制人相同 → 插到该配制人最后一条记录之后（保持同配制人记录相邻）；
 * 3) 都没有 → 返回 -1，由调用方追加到末尾。
 */
function findInsertIndexByOperator(name, operator) {
  const nm = String(name || '').trim().toLowerCase();
  const op = String(operator || '').trim();

  let idx = -1;
  // 第一级：试剂名称 + 配制人都相同
  for (let i = 0; i < items.length; i++) {
    if (String(items[i].operator || '').trim() !== op) continue;
    if (String(items[i].name || '').trim().toLowerCase() === nm) idx = i;
  }
  if (idx >= 0) return idx;

  // 第二级：仅配制人相同
  for (let i = 0; i < items.length; i++) {
    if (String(items[i].operator || '').trim() === op) idx = i;
  }
  return idx;
}

function importExcel() {
  let added = 0, skippedDup = 0, skippedInvalid = 0, skippedExpired = 0, skippedCleaned = 0;
  excelBuffer.forEach(r => {
    // 过期超过 15 天 / 备注含「已清理」→ 直接过滤，不上传系统
    if (r._filtered) {
      if (r._skipReason && r._skipReason.indexOf('已清理') === 0) skippedCleaned++;
      else skippedExpired++;
      return;
    }
    if (!r.name || !r.operator) { skippedInvalid++; return; }
    const type = r._type || (TYPE_LIST.includes(r.type) ? r.type : '配制试剂');
    // ★ 有效期至：标准溶液/配制试剂按「配制日期 + 有效期 + 单位 - 1天」自动算；
    //   开封试剂/开封标准品用表里原有的（厂商标注）有效期至。
    let expireDate = r.expireDate || '';
    let dur = r.dur || '', unit = r.unit || '';
    if (autoExpiryType(type) && dur && unit && r.preparedDate) {
      const calc = calcExpiry(r.preparedDate, dur, unit);
      if (calc) expireDate = calc;
    }
    if (!expireDate) { skippedInvalid++; return; }
    const newItem = {
      id: uid(),
      name: r.name,
      type: type,
      concentration: r.concentration || '',
      preparedDate: r.preparedDate,
      expireDate: expireDate,
      dur: dur,
      unit: unit,
      operator: r.operator,
      location: r.location || '',
      note: r.note || ''
    };
    const pos = findInsertIndexByOperator(newItem.name, newItem.operator);
    if (pos >= 0) {
      // 已找到归属位置：插到同试剂名称同配制人（或同配制人）最后一条之后
      items.splice(pos + 1, 0, newItem);
    } else {
      items.push(newItem);
    }
    added++;
  });
  selectedIds.clear();
  lastCheckedIndex = -1;
  saveAll();
  renderTable();
  closeModal('excelModal');
  let msg = `成功导入 ${added} 条`;
  if (skippedDup > 0) msg += `，跳过 ${skippedDup} 条重复`;
  if (skippedExpired > 0) msg += `、${skippedExpired} 条过期超15天`;
  if (skippedCleaned > 0) msg += `、${skippedCleaned} 条已清理`;
  if (skippedInvalid > 0) msg += `、${skippedInvalid} 条字段缺失`;
  toast(msg, (skippedDup + skippedExpired + skippedCleaned) > 0 ? 'warn' : undefined);
  // 导入后检查是否需要弹窗提醒
  setTimeout(() => {
    const hasAlert = items.some(i => {
      const st = computeStatus(i.expireDate, i.preparedDate);
      return st.key === 'expiring' || st.key === 'expired';
    });
    if (hasAlert) renderAlertModal();
  }, 0);
}

/* ===== 一次性迁移：默认排序切换为 Excel 导入顺序 ===== */
function migrateSortDefault() {
  if (settings.sortMigratedImport) return;       // 只执行一次
  settings.sortMigratedImport = true;
  if (settings.sortBy === 'expireAsc') {         // 旧默认值 → 新默认值（用户自选的其他排序不动）
    settings.sortBy = 'importOrder';
  }
  saveAll(); // 本地缓存 + 推送服务器，全组生效
}

/* ===== 启动 ===== */
async function init() {
  setSyncStatus('syncing');
  loadCache(); // 先用本地缓存快速渲染（离线也能用）
  renderTable();

  // 从服务器拉取最新数据
  try {
    const remote = await apiGet('/api/state');
    const serverEmpty = !remote.data.items || remote.data.items.length === 0;
    const firstDeploy = !remote.updatedAt; // 服务器从未写入过 → 首次部署
    if (serverEmpty && items.length > 0) {
      // 服务器数据为空但本地缓存有数据（如数据被意外清空）→ 推送本地缓存恢复
      baseVersion = remote.updatedAt || 0;
      localVersion = Date.now();
      await pushToServer();
      renderTable();
      toast('已用本地缓存恢复服务器数据', 'warn');
    } else if (serverEmpty && firstDeploy) {
      // 首次部署：生成示例数据并推送，作为全组的初始台账
      seedSample();
      baseVersion = remote.updatedAt || 0;
      localVersion = Date.now();
      await pushToServer();
      renderTable();
    } else {
      applyRemote(remote);
      renderTable();
    }
    migrateSortDefault();
    renderTable();
    setSyncStatus('online');
    const alerts = getAlertItems();
    if (alerts.length > 0 && shouldAutoShowAlert()) {
      // 首次进入时自动弹出过期提醒（同一天只弹一次，避免打扰；可被稍后提醒推迟）
      const todayKey = 'alertShown_' + fmtDate(today());
      if (!sessionStorage.getItem(todayKey)) {
        sessionStorage.setItem(todayKey, '1');
        openAlertModal();
      }
      console.info(`[试剂管理] 当前有 ${alerts.length} 条需要提醒，请及时关注。`);
    }
  } catch (e) {
    // 服务器不可达 → 保持本地缓存模式（离线可用）
    if (items.length === 0) seedSample();
    migrateSortDefault();
    renderTable();
    setSyncStatus('offline');
    const alerts = getAlertItems();
    if (alerts.length > 0 && shouldAutoShowAlert()) {
      const todayKey = 'alertShown_' + fmtDate(today());
      if (!sessionStorage.getItem(todayKey)) {
        sessionStorage.setItem(todayKey, '1');
        openAlertModal();
      }
    }
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-mask').forEach(m => m.classList.remove('show'));
  }
  // F2 编辑
  if (e.key === 'F2') { e.preventDefault(); openEdit(); }
  // Delete 删除（优先批量删除；未勾选则删除当前选中行）
  if (e.key === 'Delete' && !$('editModal').classList.contains('show')) {
    e.preventDefault();
    if (selectedIds.size > 0) doBatchDelete();
    else doDelete();
  }
});

window.addEventListener('DOMContentLoaded', init);
