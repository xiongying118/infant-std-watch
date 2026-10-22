const fs = require('fs'), vm = require('vm');

function extract(p) {
  const s = fs.readFileSync(p, 'utf8');
  const i = s.indexOf('window.STDWATCH_DATA');
  if (i < 0) throw new Error('no STDWATCH_DATA in ' + p);
  const start = s.indexOf('{', i);
  let depth = 0, end = -1, inStr = false, quote = '', esc = false;
  const BACKSLASH = String.fromCharCode(92);
  for (let k = start; k < s.length; k++) {
    const ch = s[k];
    if (esc) { esc = false; continue; }
    if (ch === BACKSLASH) { esc = true; continue; }
    if (inStr) { if (ch === quote) inStr = false; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = true; quote = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { end = k + 1; break; } }
  }
  const ctx = {};
  vm.createContext(ctx);
  return vm.runInContext('(' + s.slice(start, end) + ')', ctx, { timeout: 30000 });
}

const A = extract(process.argv[2]);
const B = extract(process.argv[3]);

const norm = o => JSON.parse(JSON.stringify(o, (k, v) =>
  typeof v === 'string'
    ? v.replace(/\d+ 天前/g, 'N 天前').replace(/还有 \d+ 天/g, '还有 N 天')
    : v));

const rowKey = x => x && (x.no || x.id || x.code || x.key || JSON.stringify(x).slice(0, 50));

for (const k of Object.keys(B)) {
  if (k === 'RUNSTATE') continue;
  const a = A[k], b = B[k];
  if (a === undefined && b === undefined) continue;
  const raw = JSON.stringify(a) === JSON.stringify(b);
  const same = JSON.stringify(norm(a)) === JSON.stringify(norm(b));
  let extra = '';
  if (!same && Array.isArray(a) && Array.isArray(b)) {
    const ma = new Map(a.map(x => [rowKey(x), x]));
    const mb = new Map(b.map(x => [rowKey(x), x]));
    const added = [...mb.keys()].filter(x => !ma.has(x));
    const removed = [...ma.keys()].filter(x => !mb.has(x));
    const modified = [...mb.keys()].filter(x =>
      ma.has(x) && JSON.stringify(norm(ma.get(x))) !== JSON.stringify(norm(mb.get(x))));
    extra = `  [len ${a.length}->${b.length}] added=${added.length} removed=${removed.length} modified=${modified.length}`;
    if (added.length) extra += `\n     +ADDED   : ${added.join(' | ')}`;
    if (removed.length) extra += `\n     -REMOVED : ${removed.join(' | ')}`;
    if (modified.length) {
      extra += '\n     ~MODIFIED:';
      for (const mk of modified) {
        const pa = ma.get(mk), pb = mb.get(mk);
        const fields = [];
        for (const f of new Set([...Object.keys(pa || {}), ...Object.keys(pb || {})])) {
          const va = norm(pa && pa[f]), vb = norm(pb && pb[f]);
          if (JSON.stringify(va) !== JSON.stringify(vb)) {
            fields.push(`${f}: ${JSON.stringify(va)} -> ${JSON.stringify(vb)}`);
          }
        }
        extra += `\n        ${mk}  {${fields.join('; ')}}`;
      }
    }
  }
  console.log(`${k.padEnd(12)} raw=${raw ? 'SAME ' : 'DIFF '} norm=${same ? 'SAME' : 'DIFF'}${extra}`);
}

console.log('\n=== RUNSTATE (after) ===');
const r = B.RUNSTATE || {};
console.log('lastRun      :', r.lastRun, '|', r.lastRunDetail);
console.log('nextRun      :', r.nextRun);
console.log('healthy      :', r.healthy);
console.log('\n--- logs ---');
(r.logs || []).forEach(l => console.log('  ' + l));
console.log('\n--- sources ---');
Object.entries(r.sources || {}).forEach(([k, v]) => console.log('  ' + k.padEnd(8), JSON.stringify(v)));
