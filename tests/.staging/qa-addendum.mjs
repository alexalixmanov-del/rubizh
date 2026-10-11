// ADDENDUM №2 browser QA (scratch tool, not shipped): changed screens at 360–1440 px in Chromium and WebKit.
// Storefront views on the demo preview (dev/preview.mjs); the account and order page on the isolated QA fixture with a
// synthetic customer session. Records JS errors, horizontal overflow and screenshots; synthetic data only.
// Usage: node tests/.staging/qa-addendum.mjs OUT_DIR
import {chromium,webkit} from '/Users/l/Projects/rubizh/node_modules/playwright/index.mjs';
import {startPreview} from '/Users/l/Projects/rubizh/dev/preview.mjs';
import {startQaSite,png} from './qa-fixture.mjs';
import {writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
const out=process.argv[2];mkdirSync(out+'/shots',{recursive:true});
const widths=[360,390,430,768,1024,1280,1440],shotAt=new Set([360,390,768,1280,1440]);
const server=await startPreview(0),preview='http://127.0.0.1:'+server.address().port;
const {site}=await startQaSite();
const results=[];
const social={instagram:'https://www.instagram.com/rubizh.test',tiktok:'https://www.tiktok.com/@rubizh.test'};
try{
 // A synthetic order for the account views (real checkout API, then owned by the session customer).
 const A='d'.repeat(32),SID='qaad'+'0'.repeat(28);// customer ids are 32 hex characters
 site.sql(`INSERT INTO rubizh_accounts(id,email,first_name,last_name,created_at,updated_at) VALUES('${A}','qa@fixture.test','Тест','Покупець',UTC_TIMESTAMP(),UTC_TIMESTAMP())`);
 const r=await fetch(site.base+'/shop/customer.php');const h={Cookie:r.headers.get('set-cookie').split(';')[0]},csrf=(await r.json()).csrf;
 const line={product_id:'qa-jacket',sku:'J-B-XL',size:'XL',color:'Чорний',qty:2};// legacy line: variant size key + colour
 const q=await site.post('/shop/checkout-quote.php',{csrf,lines:[line],payment:'card'},h);
 const o=await site.post('/shop/order.php',{csrf,request_id:'e'.repeat(32),contact:{name:'Тест Покупець',recipient:'Тест Покупець',phone:'+380671234567',city:'Київ',address:'Відділення 1',delivery_type:'branch'},payment:'card',lines:[line],expected_total:q.data?.quote?.total,catalog_version:q.data?.quote?.catalog_version},h);
 const orderId=o.data?.order?.id;
 if(orderId){site.sql(`INSERT INTO rubizh_account_orders(order_id,customer_id) VALUES(${orderId},'${A}')`);
  for(const t of ['20450000000031','20450000000032'])site.sql(`INSERT INTO rubizh_order_shipments(order_id,supplier_code,tracking_number,status,created_at,updated_at) VALUES(${orderId},'m_vin','${t}','created',UTC_TIMESTAMP(),UTC_TIMESTAMP())`);}
 writeFileSync(path.join(site.dir,'sess_'+SID),`csrf|s:64:"${'c'.repeat(64)}";customer_id|s:32:"${A}";login_time|i:${Math.floor(Date.now()/1000)};login_method|s:5:"email";`);
 results.push({setup:{order:!!orderId,status:o.status,error:o.data?.error||null}});
 const views=[
  ['home-hero',preview+'/',async p=>{}],
  ['home-kit',preview+'/',async p=>{await p.locator('.rz-kit-feature').scrollIntoViewIfNeeded();}],
  ['footer-social',preview+'/',async p=>{await p.locator('footer').scrollIntoViewIfNeeded();},{social}],
  ['kit-guide',preview+'/kit',async p=>{await p.getByRole('dialog').waitFor();},{guide:true}],
  ['kit-selection',preview+'/kit',async p=>{await p.locator('.rz-kit-rec button').first().click();await p.waitForTimeout(300);await p.locator('.rz-kit-rec button').first().click();await p.waitForTimeout(400);}],
  ['kit-summary',preview+'/kit',async p=>{await p.locator('.rz-kit-rec button').first().click();await p.waitForTimeout(300);await p.locator('[data-kit-aside],[data-kit-bar]').first().scrollIntoViewIfNeeded();}],
  ['catalog-filters',preview+'/catalog',async (p,w)=>{if(w<768){await p.getByRole('button',{name:/^Фільтри/}).first().click();await p.waitForTimeout(300);}}],
  ['catalog-search-empty',preview+'/catalog?q='+encodeURIComponent('zzzнемає'),async p=>{}],
  ['account',site.base+'/auth/?tab=orders&view=active',async p=>{},{cookie:SID}],
  ['order-detail',site.base+'/auth/?tab=orders&order='+orderId,async p=>{},{cookie:SID}]];
 for(const [bname,engine] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await engine.launch(bname==='chromium'?{executablePath:process.env.CHROMIUM_PATH}:{});
  for(const w of widths)for(const [name,url,act,opt={}] of views){
   const mobile=w<768;const context=await browser.newContext({viewport:{width:w,height:mobile?844:900},...(mobile?{isMobile:true,hasTouch:true}:{})});
   await context.route('https://img.test/**',x=>x.fulfill({contentType:'image/png',body:png}));
   if(!opt.guide)await context.addInitScript(()=>{try{localStorage.setItem('rubizh.kitIntro','1');}catch{}});
   if(opt.social)await context.addInitScript(s=>{let b;Object.defineProperty(window,'RUBIZH_BOOT',{configurable:true,get:()=>b,set:v=>{b=v;if(v&&v.settings)v.settings.social=s;}});},opt.social);
   if(opt.cookie)await context.addCookies([{name:'rubizh_customer',value:opt.cookie,url:site.base,secure:false,httpOnly:true,sameSite:'Lax'}]);
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message.slice(0,160)));
   let status=0;try{const resp=await page.goto(url,{waitUntil:'load',timeout:30000});status=resp?.status()||0;await page.waitForTimeout(600);await act(page,w);await page.waitForTimeout(300);}catch(e){errors.push('flow: '+e.message.split('\n')[0].slice(0,160));}
   const info=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,scrollW:document.documentElement.scrollWidth,text:document.body.innerText.length,
    // A 200 page can still be an error state; these screens must show their real content.
    errorState:/Кабінет тимчасово недоступний|Не вдалося завантажити|Сервер магазину ще не налаштований|каталог тимчасово недоступний/i.test(document.body.innerText)})).catch(e=>({evalError:e.message.slice(0,80)}));
   if(shotAt.has(w))await page.screenshot({path:`${out}/shots/${bname}-${w}-${name}.png`}).catch(()=>{});
   results.push({browser:bname,width:w,view:name,status,errors,...info});
   await Promise.race([context.close(),new Promise(r=>setTimeout(r,5000))]);
  }
  await browser.close();
 }
}finally{site.stop();server.close();writeFileSync(out+'/addendum.json',JSON.stringify(results,null,1));}
