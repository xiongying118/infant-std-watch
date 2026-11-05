const fs=require('fs');
global.window={};
require('../prototype/data.js');
const D=window.STDWATCH_DATA;
const ROOT=__dirname+'/..';
const norm=s=>String(s||'').replace(/\s+/g,'').replace(/-\d{4}$/,'').toUpperCase();

const scope=JSON.parse(fs.readFileSync(ROOT+'/data/refscope.json','utf8')).scope;
const scopeN=new Set(Object.keys(scope).map(norm));
const txt=fs.readFileSync(ROOT+'/data/_refjs.txt','utf8');
const rgN=new Set();
{
  const re=new RegExp('no:"([^"]+)"','g');
  let m; while((m=re.exec(txt))) rgN.add(norm(m[1]));
}
const E=D.ERATA;
const by={}; E.forEach(e=>{const k=norm(e.no);(by[k]=by[k]||[]).push(e);});
console.log('REFGROUPS(页面展示)标准数',rgN.size,'| refscope.scope',scopeN.size,'| ERATA 标准数',Object.keys(by).length,'条数',E.length);
let A=0,B=[],C=[];
Object.keys(by).forEach(k=>{ if(rgN.has(k))A++; else if(scopeN.has(k))B.push([k,by[k].length]); else C.push([k,by[k].length]); });
console.log('A 页面范围内:',A);
console.log('B refscope里有但页面没展示:',B.length);
B.forEach(x=>console.log('   ',x[0].padEnd(14),x[1],'条 |',(by[x[0]][0].stdName||'').slice(0,44)));
console.log('C 纯靠"检测方法号段兜底"混进来的:',C.length);
C.forEach(x=>console.log('   ',x[0].padEnd(14),x[1],'条 |',(by[x[0]][0].stdName||'').slice(0,44)));
const miss=[...rgN].filter(k=>!by[k]);
console.log('\nREFGROUPS 里没有任何勘误/修改单的标准:',miss.length);
console.log('  ',miss.join(', '));
