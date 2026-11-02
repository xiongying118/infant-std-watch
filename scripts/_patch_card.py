# -*- coding: utf-8 -*-
"""设备台账列太多（16 列挤在 1260px 里全被压扁），改成紧凑卡片式。

一行一台设备卡片：
  左：编号 + 名称 + 品牌型号 + 用途
  中：校准信息（上次 / 下次 / 剩余 / 证书）
  右：状态 + 责任人 + 操作

字段全部可编辑 —— 用 contenteditable 的 input 覆盖在上面。
"""
import io

P = "prototype/labbench.js"
t = io.open(P, encoding="utf-8").read()

# ------------------------------------------------------------------
# 1) 在 ledger 框架加「卡片式」渲染模式
# ------------------------------------------------------------------
LP = "prototype/ledger.js"
lt = io.open(LP, encoding="utf-8").read()

old = '''    h.push('<div class="card" style="padding:0;overflow:hidden"><div class="twrap">');
    h.push('<table class="ledger-tbl" data-ledger="'+key+'"><thead><tr>');'''
new = '''    /* ★ 卡片式渲染（列多时用，避免每列都被压扁）★ */
    if(d.cardMode){
      h.push('<div class="card" style="padding:0;overflow:hidden" data-ledger="'+key+'">');
      h.push('<div class="ledger-cards">');
      vw.forEach(function(o){
        var r = o.r, i = o.i;
        var cls = (d.rowClass ? d.rowClass(r, i) : "") || "";
        h.push('<div class="lcard '+cls+'">');
        if(d.cardHead) h.push(d.cardHead(r, i));
        if(d.cardFields) h.push(d.cardFields(r, i));
        h.push('<div class="lcard-act">'
          +'<button class="x" title="复制" onclick="Ledger.dupRow(\\''+key+'\\','+i+')">⧉</button>'
          +'<button class="x" title="删除" onclick="Ledger.delRow(\\''+key+'\\','+i+')">×</button>'
          +'</div></div>');
      });
      h.push('</div></div>');
      HOST.innerHTML = h.join("");
      return;
    }

    h.push('<div class="card" style="padding:0;overflow:hidden"><div class="twrap">');
    h.push('<table class="ledger-tbl" data-ledger="'+key+'"><thead><tr>');'''
assert lt.count(old) == 1, "ledger 表格渲染点没找到"
lt = lt.replace(old, new)
io.open(LP, "w", encoding="utf-8").write(lt)
print("ledger.js 已支持卡片式渲染")

# ------------------------------------------------------------------
# 2) 设备台账改卡片式
# ------------------------------------------------------------------
old_eq = '''    columns:[
      {k:"id",   label:"编号",   w:76,  ro:true, ph:"如 EQ-049"},
      {k:"name", label:"设备名称", w:170, ph:"如 气相色谱仪"},
      {k:"brand",label:"品牌",   w:110, ph:"如 安捷伦"},
      {k:"model",label:"型号",   w:110, ph:"如 8890A"},
      {k:"sn",   label:"出厂序列号", w:120, ph:"如 GC-8890A-0271"},
      {k:"type", label:"类型",   w:96, type:"select", opts:["强制检定","内部校准","非计量设备"]},
      {k:"verify",label:"校准/检定方式", w:96, type:"select", opts:["检定","校准","自校"]},
      {k:"cycle",label:"周期(月)", w:80, type:"number"},
      {k:"lastCal",label:"上次校准", w:104, type:"date"},
      {k:"nextCal",label:"下次校准", w:104, type:"date"},
      {k:"cert", label:"溯源证书号", w:130, ph:"如 JN2026-0420-118"},
      {k:"status",label:"状态",  w:82, type:"select", opts:["在用","维修中","停用","报废"]},
      {k:"location",label:"安装位置", w:130, ph:"如 天平室 A"},
      {k:"inCharge",label:"责任人", w:80, ph:"如 周敏"},
      {k:"use",  label:"用途",   w:200, ph:"用于什么检测"},
      {k:"critical",label:"关键设备", w:78, type:"check", def:false}
    ],'''
new_eq = '''    cardMode:true,
    columns:[
      {k:"id",   label:"编号",   ro:true, ph:"如 EQ-049"},
      {k:"name", label:"设备名称", ph:"如 气相色谱仪"},
      {k:"brand",label:"品牌",   ph:"如 安捷伦"},
      {k:"model",label:"型号",   ph:"如 8890A"},
      {k:"sn",   label:"出厂序列号", ph:"如 GC-8890A-0271"},
      {k:"type", label:"类型",   type:"select", opts:["强制检定","内部校准","非计量设备"]},
      {k:"verify",label:"校准/检定方式", type:"select", opts:["检定","校准","自校"]},
      {k:"cycle",label:"周期(月)", type:"number"},
      {k:"lastCal",label:"上次校准", type:"date"},
      {k:"nextCal",label:"下次校准", type:"date"},
      {k:"cert", label:"溯源证书号", ph:"如 JN2026-0420-118"},
      {k:"status",label:"状态",  type:"select", opts:["在用","维修中","停用","报废"]},
      {k:"location",label:"安装位置", ph:"如 天平室 A"},
      {k:"inCharge",label:"责任人", ph:"如 周敏"},
      {k:"use",  label:"用途",   ph:"用于什么检测"},
      {k:"critical",label:"关键设备", type:"check", def:false}
    ],
    /* 卡片式：左侧身份 + 右侧校准信息 + 操作 */
    cardHead:function(r, i){
      var d = daysTo(r.nextCal);
      var cls = d===null?"":(d<0?"t-high":(d<=60?"t-mid":"t-low"));
      return '<div class="lcard-h">'
        +'<input type="text" class="lc-id" value="'+esc(r.id)+'" readonly>'
        +'<input type="text" class="lc-nm" value="'+esc(r.name)+'"'
        +' oninput="Ledger.setCell(\\'equip\\','+i+',\\'name\\',this.value)">'
        +'<input type="checkbox" '+(r.critical?"checked":"")+' title="关键设备（需期间核查）"'
        +' onchange="Ledger.setCell(\\'equip\\','+i+',\\'critical\\',this.checked)">'
        +'<span class="muted lc-sub">'
        +'<input type="text" class="lc-in" value="'+esc(r.brand)+'" placeholder="品牌"'
        +' oninput="Ledger.setCell(\\'equip\\','+i+',\\'brand\\',this.value)">'
        +'<input type="text" class="lc-in" value="'+esc(r.model)+'" placeholder="型号"'
        +' oninput="Ledger.setCell(\\'equip\\','+i+',\\'model\\',this.value)">'
        +'<input type="text" class="lc-in" value="'+esc(r.sn)+'" placeholder="SN"'
        +' oninput="Ledger.setCell(\\'equip\\','+i+',\\'sn\\',this.value)">'
        +'</span></div>'
        +'<div class="lcard-use">'
        +'<input type="text" class="lc-full" value="'+esc(r.use||"")+'" placeholder="用途（用于什么检测）"'
        +' oninput="Ledger.setCell(\\'equip\\','+i+',\\'use\\',this.value)">'
        +'<span class="muted">'
        +'<input type="text" class="lc-in" value="'+esc(r.location)+'" placeholder="位置"'
        +' oninput="Ledger.setCell(\\'equip\\','+i+',\\'location\\',this.value)">'
        +' · <input type="text" class="lc-in" value="'+esc(r.inCharge)+'" placeholder="责任人"'
        +' oninput="Ledger.setCell(\\'equip\\','+i+',\\'inCharge\\',this.value)">'
        +'</span></div>';
    },
    cardFields:function(r, i){
      var d = daysTo(r.nextCal);
      var cls = d===null?"":(d<0?"t-high":(d<=60?"t-mid":"t-low"));
      return '<div class="lcard-f">'
        +'<label>上次校准<input type="date" value="'+esc(r.lastCal||"")+'"'
        +' oninput="Ledger.setCell(\\'equip\\','+i+',\\'lastCal\\',this.value)"></label>'
        +'<label>下次校准<input type="date" value="'+esc(r.nextCal||"")+'"'
        +' oninput="Ledger.setCell(\\'equip\\','+i+',\\'nextCal\\',this.value)"></label>'
        +'<label>剩余<span class="tag '+cls+'">'+(d===null?"—":(d<0?Math.abs(d)+" 天前":d+" 天"))+'</span></label>'
        +'<label>周期<input type="number" value="'+esc(r.cycle)+'"'
        +' oninput="Ledger.setCell(\\'equip\\','+i+',\\'cycle\\',this.value)"></label>'
        +'<label>类型<select onchange="Ledger.setCell(\\'equip\\','+i+',\\'type\\',this.value)">'
        +["强制检定","内部校准","非计量设备"].map(function(o){
            return '<option'+(r.type===o?" selected":"")+'>'+o+'</option>'; }).join("")
        +'</select></label>'
        +'<label>状态<select onchange="Ledger.setCell(\\'equip\\','+i+',\\'status\\',this.value)">'
        +["在用","维修中","停用","报废"].map(function(o){
            return '<option'+(r.status===o?" selected":"")+'>'+o+'</option>'; }).join("")
        +'</select></label>'
        +'<label class="wide">溯源证书号<input type="text" value="'+esc(r.cert||"")+'"'
        +' oninput="Ledger.setCell(\\'equip\\','+i+',\\'cert\\',this.value)"></label>'
        +'</div>';
    },'''
assert t.count(old_eq) == 1, "设备台账 columns 没找到"
t = t.replace(old_eq, new_eq)

io.open(P, "w", encoding="utf-8").write(t)
print("设备台账已改卡片式")

# ------------------------------------------------------------------
# 3) CSS
# ------------------------------------------------------------------
IP = "prototype/index.html"
it = io.open(IP, encoding="utf-8").read()
old_css = '''.ledger-tbl tr.bad td:first-child{box-shadow:inset 3px 0 0 var(--high)}
.ledger-tbl tr.warn td:first-child{box-shadow:inset 3px 0 0 var(--mid)}'''
new_css = '''.ledger-tbl tr.bad td:first-child{box-shadow:inset 3px 0 0 var(--high)}
.ledger-tbl tr.warn td:first-child{box-shadow:inset 3px 0 0 var(--mid)}

/* 卡片式台账（列多时用：一行一条记录，字段横排，不再被压扁） */
.ledger-cards{display:flex;flex-direction:column}
.lcard{
  display:grid;grid-template-columns:minmax(240px,1.1fr) minmax(340px,1.5fr) 44px;
  gap:14px;align-items:start;padding:12px 14px;border-bottom:1px solid var(--line2);
}
.lcard:last-child{border-bottom:none}
.lcard:hover{background:rgba(0,0,0,.015)}
.lcard.bad{background:rgba(220,38,38,.045);box-shadow:inset 3px 0 0 var(--high)}
.lcard.warn{background:rgba(245,158,11,.055);box-shadow:inset 3px 0 0 var(--mid)}
.lcard-h{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.lcard-h .lc-id{
  font-family:ui-monospace,Consolas,monospace;font-size:11.5px;color:var(--ink3);
  border:1px solid var(--line);border-radius:5px;padding:2px 6px;background:rgba(0,0,0,.02);
  width:auto;min-width:66px;text-align:center;
}
.lcard-h .lc-nm{font-weight:600;font-size:14px;border-color:transparent;width:auto;flex:1;min-width:110px}
.lcard-h input[type=checkbox]{width:15px;height:15px;accent-color:var(--brand);flex-shrink:0}
.lcard-sub{display:flex;gap:6px;flex-wrap:wrap;width:100%;font-size:11.5px}
.lcard-sub .lc-in{width:auto;min-width:70px;padding:2px 5px;font-size:11.5px;background:rgba(0,0,0,.02)}
.lcard-use{margin-top:6px;display:flex;flex-direction:column;gap:4px;font-size:11.5px}
.lcard-use .lc-full{width:100%;font-size:12px}
.lcard-use .lc-in{width:auto;min-width:80px;padding:2px 5px;font-size:11.5px}
.lcard-f{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:8px 10px;align-items:end}
.lcard-f label{display:flex;flex-direction:column;gap:3px;font-size:11px;color:var(--ink3)}
.lcard-f label.wide{grid-column:1/-1}
.lcard-f input,.lcard-f select{
  font-size:12px;padding:4px 7px;border:1px solid var(--line);border-radius:5px;
  font-family:inherit;background:var(--panel);color:var(--ink);width:100%;
}
.lcard-f input:focus,.lcard-f select:focus{
  outline:none;border-color:var(--brand);box-shadow:0 0 0 2px color-mix(in srgb,var(--brand) 14%,transparent);
}
.lcard-f .tag{align-self:flex-start;margin-top:2px}
.lcard-act{display:flex;gap:3px;align-items:center;padding-top:4px}
.lcard-act .x{border:0;background:transparent;color:var(--ink3);cursor:pointer;padding:0 4px;font-size:15px}
.lcard-act .x:hover{color:var(--high)}
@media(max-width:1000px){
  .lcard{grid-template-columns:1fr;gap:9px}
}'''
assert it.count(old_css) == 1, "ledger CSS 锚点没找到"
it = it.replace(old_css, new_css)
io.open(IP, "w", encoding="utf-8").write(it)
print("卡片式 CSS 已加")
