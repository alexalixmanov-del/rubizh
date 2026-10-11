// Q-8 / D-11 (owner decision 2026-10-11): the kit builder shows the same K1/K2 result the server charges. Two models of one
// main section → hint «Додайте річ ще з одного розділу…» and no discount; two main sections + «Дрібниці» → kit price on all.
// The checkout quote (server) equals the builder total. Isolated MySQL fixture, legacy PIM pricing, synthetic products.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {startSite} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64');
const v=(sku,size)=>({sku,price:1000,site_price:1000,minimum_sale_price:700,pricing_policy_version:1,discount_margin_floor_pct:15,kit_price:800,size,color:'Олива',stock:20,availability:'in'});
const p=(id,name,category,size)=>({id,name,pricing_policy_version:1,category,description:'Тест.',variants:[v(id+'-'+size,size)],photos:['https://img.test/'+id+'.png']});
const products=[p('q8-jacket','Куртка Q8','Одяг та форма / Куртки','L'),p('q8-shirt','Сорочка Q8','Одяг та форма / Сорочки','L'),p('q8-boots','Берці Q8','Взуття / Берці','43'),p('q8-gloves','Рукавички Q8','Аксесуари одягу / Рукавички','L')];
const kitLines=items=>items.map(([slot,id,size],i)=>({uid:'k'+(i+1),slot,id,size,qty:1}));
const SAME=kitLines([['body','q8-jacket','L'],['body','q8-shirt','L']]);
const QUAL=kitLines([['body','q8-jacket','L'],['boots','q8-boots','43'],['small','q8-gloves','L']]);
const money=s=>Number(String(s).replace(/[^\d,.-]/g,'').replace(',','.'));
let site,browser;
before(async()=>{if(skip)return;
 site=await startSite({enableV3:false,extraConfig:",'mono_mock'=>true,'environment'=>'staging','staging_allow_loopback'=>true"});
 const r=await site.post('/api/pim/sync',{settings:{pricing_policy_version:1,discount_margin_floor_pct:15},products},site.auth);assert.equal(r.status,200,JSON.stringify(r.data).slice(0,300));
 writeFileSync(site.site+'/router.php',`<?php $p=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);if(str_starts_with($p,'/api/')){require __DIR__.'/api/index.php';return;}if($p==='/'||preg_match('~^/(?:product|catalog|kit)(?:/.*)?$~',$p)){require __DIR__.'/storefront.php';return;}return false;`);
 const {chromium}=await import('playwright');browser=await chromium.launch({executablePath:(process.env.CHROMIUM_PATH||'/usr/bin/chromium'),args:['--no-sandbox']});});
after(async()=>{await browser?.close();site?.stop();});
async function builder(width,kit){
 const mobile=width<768,context=await browser.newContext({viewport:{width,height:mobile?780:900},...(mobile?{isMobile:true,hasTouch:true}:{})});
 await context.route('https://img.test/**',r=>r.fulfill({contentType:'image/png',body:png}));
 await context.route(/^https:\/\/pay\.(?:mbnk\.biz|monobank\.ua)\//,r=>r.fulfill({contentType:'text/html',body:'<title>MonoPay stub</title>'}));
 await context.addInitScript(k=>{try{localStorage.setItem('rubizh.kitIntro','1');localStorage.setItem('rubizh.kit',JSON.stringify(k));}catch{}},kit);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(site.base+'/kit');await page.locator('[data-kit-goods]').waitFor();await page.waitForFunction(()=>/\d/.test(document.querySelector('[data-kit-goods]')?.innerText||''));await page.waitForLoadState('networkidle');await page.waitForTimeout(400);
 return {page,context,errors};
}
const summary=async page=>({goods:money(await page.locator('[data-kit-goods]').innerText()),total:money(await page.locator('[data-kit-total]').innerText()),
 discount:await page.locator('[data-kit-discount]').count()?money(await page.locator('[data-kit-discount]').innerText()):0,hint:await page.locator('[data-kit-price-hint]').count()?await page.locator('[data-kit-price-hint]').innerText():''});

for(const width of [360,390,430,768,1024,1280,1440]){
 test(`Q-8 builder @${width}: two models of one section show the hint and no discount; two sections + «Дрібниці» get the kit price on all`,{skip,timeout:120000},async()=>{
  let b=await builder(width,SAME);
  try{const s=await summary(b.page);assert.deepEqual([s.goods,s.discount,s.total],[2000,0,2000]);assert.match(s.hint,/Додайте річ ще з одного розділу, щоб отримати ціну комплекту/);
   assert.equal(await b.page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),true,'no horizontal scroll');assert.deepEqual(b.errors,[]);}finally{await b.context.close();}
  b=await builder(width,QUAL);
  try{const s=await summary(b.page);assert.deepEqual([s.goods,s.discount,s.total],[3000,600,2400]);assert.equal(s.hint,'','no hint once the kit qualifies');assert.deepEqual(b.errors,[]);}finally{await b.context.close();}
 });
}

test('Q-8: placing the builder kit succeeds with the server total equal to the builder total (no PRICE_CHANGED)',{skip,timeout:180000},async()=>{
 for(const [kit,expected] of [[QUAL,2400],[SAME,2000]]){
  const b=await builder(1280,kit);
  try{
   await b.page.getByRole('button',{name:/Додати комплект до кошика/i}).first().click();
   await b.page.waitForFunction(n=>JSON.parse(localStorage.getItem('rubizh.cart')||'[]').length===n,kit.length);
   await b.page.goto(site.base+'/#cart');const c=b.page.getByRole('button',{name:/Оформити/}).first();if(await c.count())await c.click();
   await b.page.locator('input[name="name"]').fill('Тест Покупець');await b.page.locator('input[name="phone"]').fill('+380671234567');
   await b.page.locator('input[name="city"]').fill('Київ');await b.page.locator('input[name="address"]').fill('Відділення 1');
   const sent=b.page.waitForResponse(r=>r.url().endsWith('/shop/order.php'),{timeout:20000});
   await b.page.getByRole('button',{name:/Підтвердити замовлення/}).first().click();
   const o=await (await sent).json();assert.equal(o.ok,true,'the client total matched the server: '+JSON.stringify(o).slice(0,300));
   assert.equal(Number(o.order.total),expected,'server total = builder total');
  }finally{await b.context.close();}
 }
});
