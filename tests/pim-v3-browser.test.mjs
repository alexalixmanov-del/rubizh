import {test} from 'node:test';import assert from 'node:assert/strict';import {chromium} from 'playwright';
import {startSite,wire,publish} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
const jacket=wire.products.find(p=>p.id==='m-jacket'),black=jacket.colors.find(c=>c.color==='Чорний'),olive=jacket.colors.find(c=>c.color==='Олива');
async function open(site,browser,url,viewport){
 const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.route('https://rubizh.shop/**',r=>r.fulfill({contentType:'image/png',body:png}));await page.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
 await page.goto(site.base+url);await page.getByRole('button',{name:'Олива',exact:true}).first().waitFor();return {page,errors};
}
const gallery=page=>page.evaluate(()=>[...new Set([...document.querySelectorAll('img')].map(i=>i.getAttribute('src')).filter(s=>/fixture\/jacket/.test(s||'')))].sort());
const sizeButtons=page=>page.evaluate(()=>[...document.querySelectorAll('button,[role=button]')].map(b=>b.innerText.trim().split('\n')[0]).filter(t=>/^(S|M|L|XL|XXL)$/.test(t)));

test('storefront: one MODEL, color switch changes gallery and real sizes, size selects the real SKU, cart line is exact',{skip,timeout:240000},async()=>{
 const site=await startSite({extraConfig:",'mono_mock'=>true,'environment'=>'staging','staging_allow_loopback'=>true"});
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  assert.equal((await publish(site,wire)).status,200);
  for(const viewport of [{width:390,height:844},{width:1440,height:900}]){
   const {page,errors}=await open(site,browser,'/product/'+jacket.slug,viewport);
   assert.deepEqual(await gallery(page),[...black.photos].sort(),'default color gallery');
   assert.deepEqual((await sizeButtons(page)).sort(),['L','M']);
   await page.getByRole('button',{name:'Олива',exact:true}).first().click();
   await page.waitForFunction(()=>[...document.querySelectorAll('img')].some(i=>/jacket-olive/.test(i.getAttribute('src')||'')));
   assert.deepEqual(await gallery(page),[...olive.photos].sort(),'olive shows only its own photos');
   assert.deepEqual((await sizeButtons(page)).sort(),['L','XL'],'olive has its own real sizes');
   assert.match(page.url(),new RegExp('color='+olive.id));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow');
   assert.deepEqual(errors,[]);await page.close();
  }
  // Deep link with ?color= opens that color; picking L resolves the real olive SKU.
  const {page}=await open(site,browser,'/product/'+jacket.slug+'?color='+olive.id,{width:390,height:844});
  assert.deepEqual(await gallery(page),[...olive.photos].sort());
  await page.getByRole('button',{name:/^L/}).first().click();
  await page.getByText(/До кошика/).first().click();
  const cart=await page.evaluate(()=>JSON.parse(localStorage.getItem('rubizh.cart')||'[]'));
  assert.equal(cart.length,1);assert.equal(cart[0].sku,'RUB-F0003');assert.equal(cart[0].colorId,olive.id);
  // The browser-built selection is accepted by the server resolver and becomes a payable order.
  const result=await page.evaluate(async line=>{const who=await (await fetch('/shop/customer.php')).json();const lines=[{product_id:line.id,color_id:line.colorId,sku:line.sku,qty:line.qty}];
   const q=await (await fetch('/shop/checkout-quote.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({csrf:who.csrf,lines})})).json();
   if(!q.ok)return {q,o:null};
   const o=await (await fetch('/shop/order.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({csrf:who.csrf,request_id:'e2e'.padEnd(32,'0'),payment:'card',contact:{name:'Тест Покупець',recipient:'Тест Покупець',phone:'+380671234567',city:'Київ',address:'Відділення 1',delivery_type:'branch'},lines,expected_total:q.quote.total,catalog_version:q.quote.catalog_version})})).json();return {q,o};},cart[0]);
  assert.ok(result.q.ok,JSON.stringify(result.q));assert.equal(result.q.quote.total,2860);assert.equal(result.q.quote.order_mode,'PAY');assert.equal(result.o.ok,true,JSON.stringify(result.o));assert.equal(result.o.order.order_state,'CONFIRMED');
  await page.close();
  // Size request without SKU shows a request CTA and never a price promise.
  const pants=wire.products.find(p=>p.id==='m-pants');const req=await browser.newPage({viewport:{width:390,height:844}});
  await req.route('https://rubizh.shop/**',r=>r.fulfill({contentType:'image/png',body:png}));await req.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
  await req.goto(site.base+'/product/'+pants.slug);await req.getByRole('button',{name:/^50/}).first().click();
  await req.getByText(/Надіслати заявку/).first().waitFor();await req.getByText(/Ціну підтвердить менеджер/).first().waitFor();
  await req.close();
 }finally{await browser.close();site.stop();}
});
