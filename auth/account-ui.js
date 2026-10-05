(()=>{
 const csrf=document.querySelector('meta[name="rubizh-csrf"]')?.content;
 let importing=false;
 const importFavorites=async()=>{
  if(!csrf||document.querySelector('meta[name="rubizh-authed"]')?.content!=='1')return;
  let ids=[];try{ids=JSON.parse(localStorage.getItem('rubizh.guestFavorites')||'[]');}catch(e){}
  if(!Array.isArray(ids)||!ids.length||importing)return;
  importing=true;
  try{const r=await fetch('/shop/customer.php',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({csrf,action:'import',ids:ids.filter(x=>typeof x==='string').slice(0,200)})}),j=await r.json();if(j.ok){localStorage.removeItem('rubizh.guestFavorites');if(location.search.includes('tab=favorites'))location.reload();}}catch(e){}finally{importing=false;}
 };
 importFavorites();window.addEventListener('online',importFavorites);
 const detail=document.querySelector('[data-account-order]');if(!detail)return;
 let checking=false,version=detail.dataset.accountVersion||'';
 const note=document.createElement('div');note.className='account-refresh-note';note.hidden=true;note.setAttribute('role','status');
 const label=document.createElement('span'),retry=document.createElement('button');retry.type='button';retry.textContent='Спробувати ще раз';note.append(label,document.createTextNode(' '),retry);detail.prepend(note);
 const refresh=async()=>{
  if(document.hidden||checking)return;
  checking=true;retry.disabled=true;
  try{
   const r=await fetch('/shop/order-status.php?number='+encodeURIComponent(detail.dataset.accountOrder),{credentials:'same-origin',cache:'no-store'}),j=await r.json();
   if(!r.ok||!j.ok||!j.order)throw new Error('refresh');
   if(detail.dataset.accountStatus!==j.order.status+'|'+j.order.payment_status||(version&&j.order.ui_version&&version!==j.order.ui_version)){location.reload();return;}
   if(j.order.ui_version)version=j.order.ui_version;
   note.hidden=true;
  }catch(e){label.textContent='Не вдалося оновити замовлення. Показуємо останні завантажені дані.';note.hidden=false;}finally{checking=false;retry.disabled=false;}
 };
 retry.addEventListener('click',refresh);window.addEventListener('focus',refresh);window.addEventListener('online',refresh);document.addEventListener('visibilitychange',refresh);setInterval(refresh,30000);
})();
