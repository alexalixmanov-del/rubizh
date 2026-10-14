'use strict';
(() => {
 const form=document.getElementById('staff-login'),message=document.getElementById('staff-login-message');
 if(!form||!message)return;
 const solve=async challenge=>{
  if(!crypto.subtle||!challenge||!/^[a-f0-9]{32}$/.test(challenge.nonce)||!Number.isInteger(challenge.bits)||challenge.bits<8||challenge.bits>20)throw new Error('Перевірка недоступна. Спробуйте інший браузер або зверніться до власника.');
  const deadline=Date.now()+30000,encoder=new TextEncoder();let n=0,z=0;
  do{const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(challenge.nonce+':'+n)));z=0;for(const byte of hash){if(byte===0){z+=8;continue;}z+=Math.clz32(byte)-24;break;}if(z<challenge.bits)n++;if(Date.now()>deadline)throw new Error('Перевірка триває довше. Повторіть вхід або зверніться до власника.');}while(z<challenge.bits);return String(n);
 };
 form.addEventListener('submit',async event=>{
  event.preventDefault();const button=form.querySelector('button');button.disabled=true;
  try{
   const session=await fetch('/api/staff/auth/session',{credentials:'same-origin',cache:'no-store'});const state=await session.json();if(!session.ok||!state.meta?.csrf)throw new Error(state.error?.message||'Сеанс входу недоступний. Спробуйте пізніше.');
   const body={email:form.elements.email.value,password:form.elements.password.value,csrf:state.meta.csrf};
   let result;
   for(let attempt=0;attempt<2;attempt++){
    const response=await fetch('/api/staff/auth/login',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});result=await response.json();
    if(response.ok&&result.ok)break;
    if(attempt===0&&response.status===428&&result.error?.code==='CHECK_REQUIRED'){message.textContent='Перевіряємо запит. Зачекайте кілька секунд…';body.rate_proof=await solve(result.error.details?.challenge);continue;}
    throw new Error(result.error?.message||'Не вдалося увійти.');
   }
   if(!result?.ok)throw new Error('Повторіть вхід або зверніться до власника.');
   form.elements.password.value='';form.hidden=true;message.textContent='Вхід підтверджено. Поверніться до робочого простору, який ви відкривали.';
  }catch(error){message.textContent=error.message||'Спробуйте пізніше.';}finally{button.disabled=false;}
 });
})();
