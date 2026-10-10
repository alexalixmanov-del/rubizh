// Browser QA of the staging storefront (tests/.staging/serve.sh): home, catalog, search, product (colour/size/SKU),
// cart modal, cart, checkout at the QA viewports. Collects console/page errors, broken images, horizontal overflow,
// clipped controls, availability wording and SKU consistency; screenshots go to a private directory.
// Usage: node tests/.staging/site-qa.mjs [BASE=http://127.0.0.1:8090] [OUT=/tmp/claude-0/private/site-qa]
import {chromium} from 'playwright';import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.argv[2]||'http://127.0.0.1:8090',out=process.argv[3]||'/tmp/claude-0/private/site-qa';mkdirSync(out,{recursive:true});
const widths=(process.env.WIDTHS||'360,390,430,768,820,900,904,1024,1280,1440').split(',').map(Number);
const product=process.env.PRODUCT||'',query=process.env.Q||'штани';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM||'/usr/bin/chromium'});
const result={base,widths,pages:[]};
// Supplier image hosts are not reachable from the sandbox: serve a real local image instead, so loading states are real.
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAGElEQVR4nGNkYPjPQAxgGlU4qnBU4ahCAOsUAhDDMbNjAAAAAElFTkSuQmCC','base64');
async function audit(page,name,w){
 await page.waitForTimeout(600);
 const info=await page.evaluate(()=>{
  const vw=document.documentElement.clientWidth,over=[];
  for(const el of document.querySelectorAll('body *')){const r=el.getBoundingClientRect();if(!r.width||getComputedStyle(el).position==='fixed')continue;if(r.right>vw+1&&getComputedStyle(el).overflowX!=='hidden'&&!el.closest('[style*="overflow"],[data-scroller],[class*="carousel"],[class*="scroll"]'))over.push((el.tagName+'.'+(el.className&&el.className.baseVal===undefined?el.className:'')).slice(0,60)+' '+Math.round(r.right-vw));if(over.length>8)break;}
  const imgs=[...document.images].filter(i=>i.complete&&i.currentSrc&&i.naturalWidth===0&&i.getBoundingClientRect().width>0).map(i=>i.currentSrc.slice(0,120));
  const noAlt=[...document.images].filter(i=>!i.hasAttribute('alt')&&i.getBoundingClientRect().width>0).map(i=>(i.currentSrc||i.src).slice(0,80));
  const txt=document.body.innerText;
  return {scrollW:document.documentElement.scrollWidth,vw,overflow:document.documentElement.scrollWidth>vw+1,over,broken:imgs,noAlt,
   supplierWording:/За даними постачальника/.test(txt),badApostrophe:/[А-Яа-яІіЇїЄєҐґ]\s+[‘ʼ`]\s*[А-Яа-яІіЇїЄєҐґ]/.test(txt),
   ph:[...document.querySelectorAll('*')].filter(e=>e.childElementCount===0&&/Фото готується/.test(e.textContent)&&e.getBoundingClientRect().width>0&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).opacity!=='0').length};
 });
 await page.screenshot({path:`${out}/${name}-${w}.png`,fullPage:false});
 result.pages.push({name,w,...info});return info;
}
for(const w of widths){
 const ctx=await browser.newContext({viewport:{width:w,height:w<700?820:900},deviceScaleFactor:1});await ctx.route(u=>!u.hostname.startsWith('127.0.0.1')&&/\.(jpe?g|png|webp|gif)(\?|$)/i.test(u.pathname),r=>r.fulfill({status:200,contentType:'image/png',body:png}));const page=await ctx.newPage();const errors=[];
 page.on('pageerror',e=>errors.push('pageerror '+e.message.slice(0,200)));page.on('console',m=>{if(m.type()==='error'&&!/ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED/.test(m.text()))errors.push('console '+m.text().slice(0,200));});
 await page.goto(base+'/',{waitUntil:'networkidle'});await audit(page,'home',w);
 await page.goto(base+'/catalog',{waitUntil:'networkidle'});await audit(page,'catalog',w);
 await page.goto(base+'/catalog?q='+encodeURIComponent(query),{waitUntil:'networkidle'});await audit(page,'search',w);
 if(product){await page.goto(base+'/product/'+product,{waitUntil:'networkidle'});await audit(page,'product',w);
  const size=page.locator('[data-size-grid] [role=button]').first();if(await size.count())await size.click().catch(()=>{});
  const sku=await page.locator('[data-product-sku]').first().innerText().catch(()=>'');
  const cta=page.locator('text=/^До кошика/i >> visible=true').first();if(await cta.count()){await cta.click();await page.waitForTimeout(500);await audit(page,'modal',w);}
  const cart=await page.evaluate(()=>{try{return JSON.parse(localStorage.getItem('rubizh.cart')||'[]')}catch{return []}});
  const go=page.locator('[data-mobile-dialog="mini"] >> text=/Оформити/i').first();if(await go.count()){await go.click();await page.waitForTimeout(900);await audit(page,'checkout',w);}
  result.pages.push({name:'sku',w,product_sku:sku,cart_sku:cart[0]?.sku||null});
 }
 result.pages.push({name:'errors',w,errors});await ctx.close();
}
await browser.close();writeFileSync(out+'/report.json',JSON.stringify(result,null,1));
const bad=result.pages.filter(p=>p.overflow||p.broken?.length||p.supplierWording||p.badApostrophe||p.ph||(p.errors||[]).length||p.name==='sku'&&p.product_sku!==p.cart_sku);
for(const p of result.pages)console.log(p.name,p.w,JSON.stringify(Object.fromEntries(Object.entries(p).filter(([k,v])=>!['name','w','vw','scrollW'].includes(k)&&(Array.isArray(v)?v.length:v)))).slice(0,300));
console.log('ISSUES',bad.length);
