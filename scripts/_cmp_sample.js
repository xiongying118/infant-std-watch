const fs=require('fs');
const path=require('path');
const ROOT=__dirname+'/..';
const norm=s=>{
  let n=String(s||'').replace(/\s+/g,'').toUpperCase();
  n=n.replace(/-\d{4}$/,'');
  n=n.replace('GB/T','GBT').replace('QB/T','QBT');
  if(!/^(GB|QB|JJF|JB)/.test(n)) n='GB'+n;
  return n;
};

// 表格里出现的标准号（从 openpyxl 提取的结果）
const xlsxStd = [
  ['GB 5009.3','水分','第一法'],
  ['GB 5009.4','灰分','第一法'],
  ['GB 5413.30','杂质度',''],
  ['GB 5009.5','蛋白质','第一法'],
  ['GB 5009.6','脂肪','第三法'],
  ['GB 5009.168','亚油酸/α-亚麻酸/月桂酸/肉豆蔻酸/芥酸/DHA/EPA/总脂肪酸','第二法'],
  ['GB 5413.36','反式脂肪酸',''],
  ['GB 5009.8','果糖/葡萄糖/蔗糖/麦芽糖/乳糖','第一法'],
  ['GB 5009.82','维生素A/维生素E','第一法'],
  ['GB 5009.296','维生素D','第一法'],
  ['GB 5009.158','维生素K1','第一法'],
  ['GB 5009.84','维生素B1','第一法(含第1号修改单)'],
  ['GB 5009.85','维生素B2','第一法'],
  ['GB 5009.154','维生素B6','第三法'],
  ['GB 5009.285','维生素B12','第三法'],
  ['GB 5009.89','烟酸（烟酰胺）','第一法'],
  ['GB 5009.211','叶酸',''],
  ['GB 5009.210','泛酸','第一法'],
  ['GB 5009.86','维生素C','第二法'],
  ['GB 5009.259','生物素','第二法'],
  ['GB 5413.20','胆碱','第三法'],
  ['GB 5009.248','叶黄素',''],
  ['GB 5413.40','核苷酸',''],
  ['GB 5009.91','钠/钾','第一法'],
  ['GB 5009.90','铁','第一法'],
  ['GB 5009.14','锌','第一法'],
  ['GB 5009.241','镁','第一法'],
  ['GB 5009.92','钙','第一法'],
  ['GB 5009.13','铜','第二法'],
  ['GB 5009.242','锰','第一法'],
  ['GB 5009.87','磷','第二法'],
  ['GB 5009.267','碘','第四法'],
  ['GB 5009.44','氯','第三法'],
  ['GB 5009.93','硒','第一法'],
  ['GB 5009.270','肌醇','第一法'],
  ['GB 5009.169','牛磺酸','第二法'],
  ['GB 5009.300','左旋肉碱','第一法'],
  ['GB 5009.289','低聚半乳糖',''],
  ['GB 5009.255','低聚果糖',''],
  ['GB 5009.299','乳铁蛋白',''],
  ['GB 5009.12','铅','第一法'],
  ['GB 5009.16','锡','第一法'],
  ['GB 5009.33','硝酸盐/亚硝酸盐',''],
  ['GB 5009.24','黄曲霉毒素M1','第三法'],
  ['GB/T 22388','三聚氰胺','第二法'],
  ['GB 5009.284','香兰素/乙基香兰素','第二法'],
  ['GB 4789.2','菌落总数',''],
  ['GB 4789.3','大肠菌群',''],
  ['GB 4789.4','沙门氏菌',''],
  ['GB 4789.10','金黄色葡萄球菌',''],
  ['GB 4789.40','克罗诺杆菌',''],
  ['GB 4789.14','蜡样芽孢杆菌',''],
  ['GB 4789.15','霉菌和酵母菌',''],
  ['GB 5009.290','维生素K2',''],
];

const scope=JSON.parse(fs.readFileSync(ROOT+'/data/refscope.json','utf8')).scope;
const scopeN=new Set(Object.keys(scope).map(norm));
const scopeWhy={};
Object.keys(scope).forEach(k=>{ scopeWhy[norm(k)]=scope[k]; });

const used=new Set(xlsxStd.map(x=>norm(x[0])));
console.log('=== 表格用到的标准：'+xlsxStd.length+' 个 ===');
const notInScope=xlsxStd.filter(x=>!scopeN.has(norm(x[0])));
console.log('\n表格里有、但不在通则范围内的：'+notInScope.length+' 个');
notInScope.forEach(x=>console.log('   ',x[0].padEnd(14),x[1],'  scope:',scopeN.has(norm(x[0]))?'YES':'★NO'));

console.log('\n=== 通则范围内、表格里没有的标准 ===');
const missing=Object.keys(scope).filter(k=>!used.has(norm(k)));
// 排除产品标准/通则本身/限量标准等非检验方法
const productStd=new Set(['GB10765','GB10767','GB13102','GB13432','GB14880','GB19301','GB19302','GB19644','GB19646','GB25192','GB29989','GB5420','GB2760','GB2761','GB2762','GB29921']);
const meth=missing.filter(k=>!productStd.has(norm(k)));
console.log('范围共 '+Object.keys(scope).length+'，其中非产品/限量标准（可能是检测方法）: '+meth.length);
meth.forEach(k=>{
  const stdNos=xlsxStd.filter(x=>norm(x[0])===norm(k));
  console.log('   ',k.padEnd(14),JSON.stringify(scopeWhy[k]));
});
console.log('\n（产品标准/限量标准本身也在范围里，但它们是判定依据不是检测方法）');
productStd.forEach(k=>{ if(missing.some(m=>norm(m)===norm(k))) console.log('    ',k); });
