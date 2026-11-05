const fs=require('fs');
const BEFORE='C:/Users/13104/AppData/Local/Temp/data_js_before.js';
const AFTER ='C:/Users/13104/AppData/Local/Temp/data_js_after.js';

function load(p){ global.window={}; delete require.cache[require.resolve(p)]; require(p); return window.STDWATCH_DATA; }
const A=load(BEFORE), B=load(AFTER);
const ka=Object.keys(A), kb=Object.keys(B);
console.log('顶层键 改前',ka.length,'改后',kb.length);
if(ka.join()!==kb.join()) console.log('  键差异:',ka.filter(x=>!kb.includes(x)),'→',kb.filter(x=>!ka.includes(x)));
let changed=[];
for(const k of kb){
  const a=A[k], b=B[k];
  const sa=JSON.stringify(a), sb=JSON.stringify(b);
  if(sa!==sb){
    const la=Array.isArray(a)?a.length:'-', lb=Array.isArray(b)?b.length:'-';
    changed.push(k+' ('+la+'→'+lb+')');
  }
}
console.log('\n内容有变化的段:');
changed.length?changed.forEach(c=>console.log('  ',c)):console.log('   （无）');
console.log('\nERATA 明细:');
console.log('  改前',A.ERATA.length,'条 → 改后',B.ERATA.length,'条');
