const fs=require('fs');
const ROOT=__dirname+'/..';
global.window={};
require(ROOT+'/prototype/data.js');
const E=window.STDWATCH_DATA.ERATA;
const norm=s=>String(s||'').replace(/\s+/g,'').replace(/-\d{4}$/,'').toUpperCase();

const g=JSON.parse(fs.readFileSync(ROOT+'/data/general_refs.json','utf8'));
const linked=new Set(Object.keys(g.linked||{}).map(norm));
const scope=JSON.parse(fs.readFileSync(ROOT+'/data/refscope.json','utf8')).scope;
const scopeN=new Set(Object.keys(scope).map(norm));
const txt=fs.readFileSync(ROOT+'/data/_refjs.txt','utf8');
const rgN=new Set();
{ const re=new RegExp('no:"([^"]+)"','g'); let m; while((m=re.exec(txt))) rgN.add(norm(m[1])); }

const by={}; E.forEach(e=>{const k=norm(e.no);(by[k]=by[k]||[]).push(e);});
const ks=Object.keys(by);
console.log('linked(通则正文直接引用):',linked.size,'| refscope.scope:',scopeN.size,'| REFGROUPS(页面展示):',rgN.size,'| ERATA标准数:',ks.length);

const inL=ks.filter(k=>linked.has(k));
console.log('\nERATA ∩ linked =',inL.length,'个标准');
inL.forEach(k=>console.log('   ',k.padEnd(14),by[k].length,'条'));

console.log('\nERATA 里 linked 之外但在 refscope 的:',ks.filter(k=>!linked.has(k)&&scopeN.has(k)).length,
            ks.filter(k=>!linked.has(k)&&scopeN.has(k)).join(', '));
console.log('ERATA 里 linked 和 refscope 都没有的:',ks.filter(k=>!linked.has(k)&&!scopeN.has(k)).length);

console.log('\n--- 关键抽查 ---');
['GB5009.235','GB5009.257','GB4806.7','GB5009.111','GB4789.28','GB5009.225','GB4789.20','GB5009.139','GB31604.32'].forEach(k=>{
  console.log('  ',k.padEnd(12),'linked:',(linked.has(k)?'YES':'no ').padEnd(4),'| scope:',(scopeN.has(k)?'YES':'no ').padEnd(4),'| rg:',(rgN.has(k)?'YES':'no').padEnd(4),'| ERATA:',(by[k]||[]).length);
});

console.log('\n--- linked 里但页面 REFGROUPS 没有的 ---');
console.log('  ',[...linked].filter(k=>!rgN.has(k)).join(', '));

console.log('\n--- linked ∪ scope 里，但完全没勘误的标准（可能漏抓）---');
const miss=[...new Set([...linked,...scopeN])].filter(k=>!by[k]);
console.log('  数量',miss.length);
console.log('  ',miss.join(', '));
