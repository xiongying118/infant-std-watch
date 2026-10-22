"""对齐样例配方：让 23 项营养素全部落在真实市售值附近。

★ 做法 ★
  样例配方已经手工配得八九不离十（蛋白/碳水/亚油酸/亚麻酸/比值都对）。
  剩下 3 项（钙磷钠、DHA、VE）超限，是因为：
    ① 矿物质预混料浓度是我拍的
    ② DHA 藻油用量太小给不出 3.6mg/100kJ
  → 逐项按「目标浓度 × 当前用量」反解该原料的浓度，一步到位。

★ 单位（这次写死，别再错）★
  原料值 P（每 100g 原料）× 用量 kg/1000kg ÷ 1000 = 每 100g 成品
  → × (100 / 能量kJ每100g) = 每 100kJ
  例：矿物质预混料 ca=70705 mg/100g，用 6.5 kg/1000kg
     → 每 100g 成品 = 70705 × 6.5/1000 = 459.6 mg
     → 能量 2063 时每 100kJ = 459.6 × 100/2063 = 22.3 mg/100kJ
"""
import io
import json
import sys

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, "scripts")

# 每 100kJ 目标：真实市售 3 段婴配粉（美素佳儿，国家市场监管总局公示标签）
TGT = {
    "p": 0.83, "f": 1.12, "c": 2.55,
    "la": 0.11, "ala": 15.2,
    "va": 23.0, "vd": 0.60, "ve": 0.42, "vc": 8.2, "niacin": 164.0,
    "folate": 5.7, "biotin": 1.10, "choline": 7.2, "inositol": 3.7,
    "ca": 28.0, "phos": 16.7, "na": 12.9,
    "dha": 3.63, "ara": 0.85, "taurine": 1.49,
}
# 原料表里这些键的单位
SRC = {
    "p": "g", "f": "g", "c": "g", "la": "mg", "ala": "mg",
    "ca": "mg", "phos": "mg", "na": "mg", "ve": "mg", "vc": "mg",
    "choline": "mg", "inositol": "mg", "taurine": "mg",
    "dha": "mg", "ara": "mg",
    "va": "ug", "vd": "ug", "niacin": "ug", "folate": "ug", "biotin": "ug",
}


def main():
    """在浏览器里跑（用页面自己的换算，保证与页面一致）。"""
    import subprocess
    import tempfile
    js = r"""
const {chromium}=require('playwright-core');
const B='file:///D:/workbuddy%E5%AD%98%E5%82%A8%E6%95%B0%E6%8D%AE/2026-10-03-11-07-27/std-watch/prototype';
(async()=>{
 const b=await chromium.launch({executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
 const p=await (await b.newContext()).newPage();
 await p.goto(B+'/index.html#rdtools',{waitUntil:'networkidle'});
 await p.waitForTimeout(1500);
 const r = await p.evaluate(()=>{
   gbInit();
   const mats={}; GB.materials.forEach(m=>mats[m.key]=m);
   const E = gbCompute().energy100g;
   // 每 100kJ 贡献：P(每100g原料) × kg/1000 ÷ 1000 × 100/E
   function per100kj(P, kg, srcUnit, tgtUnit){
     let v = P*kg/1000*(100/E);          // 每 100kJ，原料单位
     // → 目标单位
     if(srcUnit==='ug' && tgtUnit==='ug') return v;
     if(srcUnit==='mg' && tgtUnit==='mg') return v;
     if(srcUnit==='mg' && tgtUnit==='ug') return v*1000;
     if(srcUnit==='ug' && tgtUnit==='mg') return v/1000;
     if(srcUnit==='g'  && tgtUnit==='g')  return v;
     if(srcUnit==='g'  && tgtUnit==='mg') return v*1000;
     if(srcUnit==='g'  && tgtUnit==='ug') return v*1e6;
     return v;
   }
   const TGT = __TGT__;
   const SRC = __SRC__;
   // 找出「当前值偏离目标、且只由单一原料提供」的项 → 反解该原料浓度
   const PLAN = [
     ['min_premix','ca'], ['min_premix','phos'], ['min_premix','na'],
     ['dha_oil','dha'], ['ara_oil','ara'], ['antioxidant','ve'],
   ];
   const out = {energy:E, fixes:{}, cur:{}, tgt:TGT};
   // 逐项：只改浓度，其他不变 → 算新能量
   const recipe = gbState.recipe.map(x=>({key:x.key, amount:x.amount}));
   function recompute(recipe2, overrides){
     const ov = overrides||{};
     let sum=0; const tot={};
     recipe2.forEach(r=>{
       const m=mats[r.key]; if(!m||!r.amount) return;
       sum+=r.amount;
       Object.keys(m).forEach(n=>{
         if(n==='key'||n==='name'||n==='kind') return;
         const P = (ov[r.key]&&ov[r.key][n]!=null)?ov[r.key][n]:m[n];
         if(P==null) return;
         tot[n]=(tot[n]||0)+P*r.amount/1000;
       });
     });
     const e=(tot.p||0)*17+(tot.c||0)*17+(tot.f||0)*37;
     return {tot,e,sum};
   }
   // 迭代：反复调这些浓度，直到各项都接近目标
   const ov={};
   for(let round=0; round<40; round++){
     const base = recompute(recipe, ov);
     const E2 = base.e;
     let maxDev=0;
     for(const [mk,n] of PLAN){
       const tgt=TGT[n];
       if(tgt==null) continue;
       const tu = SRC[n];
       const m=mats[mk];
       const P = (ov[mk]&&ov[mk][n]!=null)?ov[mk][n]:m[n];
       const kg = (recipe.find(x=>x.key===mk)||{amount:0}).amount;
       if(!kg) continue;
       // 需要 P' 使 per100kj(P',kg,src,tgtUnit) == tgt
       // per100kj = P'×kg/1000×100/E2 × conv
       const conv = (SRC[n]==='ug' && tu==='ug')?1
                    :(SRC[n]==='mg' && tu==='mg')?1
                    :(SRC[n]==='mg' && tu==='ug')?1000
                    :(SRC[n]==='ug' && tu==='mg')?0.001
                    :(SRC[n]==='g' && tu==='g')?1
                    :(SRC[n]==='g' && tu==='mg')?1000:1e6;
       const needP = tgt * E2/100*1000/kg / conv;
       const curV = per100kj(P, kg, SRC[n], tu);
       maxDev = Math.max(maxDev, Math.abs(curV-tgt)/tgt);
       if(!ov[mk]) ov[mk]={};
       ov[mk][n] = needP;
     }
     if(maxDev<0.02) break;
   }
   // 汇总
   const fin = recompute(recipe, ov);
   const f=100/fin.e;
   Object.keys(TGT).forEach(n=>{
     let v=fin.tot[n]||0;
     if(SRC[n]==='ug') { /* ug/100g → ug/100kJ */ }
     else if(SRC[n]==='mg'){ v=v/1000*1000; }  // mg/100g → mg/100kJ
     else { v=v*f; }                          // g/100g → g/100kJ
     if(SRC[n]==='mg') v = (fin.tot[n]||0)*f;
     out.cur[n]=v;
   });
   PLAN.forEach(([mk,n])=>{ out.fixes[mk+'.'+n]=Math.round(ov[mk][n]); });
   // 新的配方：油/藻油用量按需调整（若浓度算出来离谱就改用量）
   return out;
 });
 console.log(JSON.stringify(r));
 await b.close();
})();
"""
    tgt = json.dumps(TGT)
    src = json.dumps(SRC)
    js = js.replace("__TGT__", tgt).replace("__SRC__", src)
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False,
                                     encoding="utf-8") as f:
        f.write(js)
        path = f.name
    env = dict(__import__("os").environ)
    pw = ("C:/Users/13104/.workbuddy/binaries/node/versions/22.22.2-6/"
          "node_modules/@playwright/cli/node_modules")
    env["NODE_PATH"] = pw
    r = subprocess.run(
        ["C:/Users/13104/.workbuddy/binaries/node/versions/22.22.2-6/node.exe",
         path], capture_output=True, text=True, encoding="utf-8", env=env)
    print(r.stdout[-3000:])
    if r.returncode != 0:
        print(r.stderr[-1500:])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
