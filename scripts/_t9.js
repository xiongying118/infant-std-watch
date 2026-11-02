const {chromium}=require('playwright-core');
const B='file:///D:/workbuddy%E5%AD%98%E5%82%A8%E6%95%B0%E6%8D%AE/2026-10-03-11-07-27/std-watch/prototype';
(async()=>{
 const b=await chromium.launch({executablePath:'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
 const p=await (await b.newContext()).newPage();
 await p.goto(B+'/index.html',{waitUntil:'networkidle'});
 await p.waitForTimeout(1800);
 await p.evaluate(()=>{location.hash='#home';}); await p.waitForTimeout(1300);
 console.log(await p.evaluate(()=>{
   const out=[];
   const cb=document.querySelector('#todoList input[type=checkbox]');
   out.push('找到 checkbox: '+!!cb);
   if(cb){
     out.push('onclick 属性: '+(cb.getAttribute('onclick')||'(无)'));
     out.push('id: '+cb.id);
   }
   out.push('toggleTodo 类型: '+typeof toggleTodo);
   // 直接调
   try{
     const r = collectTodos();
     out.push('collectTodos 首项 id: '+r.items[0].id);
     toggleTodo(r.items[0].id);
     out.push('调用后 todo.done: '+JSON.stringify(Store.todo.get()));
     const r2 = collectTodos();
     out.push('再 collect: 已完成 '+Object.keys(r2.done).length+' 条');
   }catch(e){ out.push('异常: '+e.message); }
   return out.join(String.fromCharCode(10));
 }));
 await b.close();
})();
