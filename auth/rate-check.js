'use strict';
(() => {
 const meta=document.querySelector('meta[name="rubizh-rate-check"]'),button=document.getElementById('rubizh-rate-continue');
 if(!meta||!button||!crypto.subtle)return;
 const [nonce,rawBits]=meta.content.split(':'),bits=Number(rawBits);
 if(!/^[a-f0-9]{32}$/.test(nonce)||!Number.isInteger(bits)||bits<8||bits>20)return;
 button.addEventListener('click',async()=>{
  button.disabled=true;button.textContent='Перевіряємо…';const encoder=new TextEncoder();let n=0,z=0;
  do{const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(nonce+':'+n)));z=0;for(const byte of hash){if(byte===0){z+=8;continue;}z+=Math.clz32(byte)-24;break;}if(z<bits)n++;}while(z<bits);
  const url=new URL(location.href);url.searchParams.set('_rate_proof',String(n));location.replace(url.href);
 });
})();
