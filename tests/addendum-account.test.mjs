// ECC ADDENDUM №2, Phase 6 (P-1…P-7): customer account on the real order domain — empty state, order cards,
// separate order/payment/delivery statuses, several parcels, repeat order without duplicated cart lines.
// Isolated MySQL fixture, synthetic account and orders through the real checkout API; no production data.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {startSite,wire,publish} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const A='a'.repeat(32),SID='acct'+'0'.repeat(28);
async function cabinet({orders=0,qty=2}={}){
 const site=await startSite({extraConfig:",'mono_mock'=>true,'environment'=>'staging','staging_allow_loopback'=>true"});
 try{
  assert.equal((await publish(site,structuredClone(wire))).status,200);
  site.sql(`INSERT INTO rubizh_accounts(id,email,first_name,last_name,created_at,updated_at) VALUES('${A}','a@fixture.test','Тест','Покупець',UTC_TIMESTAMP(),UTC_TIMESTAMP())`);
  const model=wire.products.find(p=>p.id==='m-jacket'),line={product_id:'m-jacket',color_id:model.colors.find(c=>c.variant_skus.includes('RUB-F0001')).id,sku:'RUB-F0001',qty};
  const ids=[];
  for(let i=0;i<orders;i++){const r=await fetch(site.base+'/shop/customer.php');const h={Cookie:r.headers.get('set-cookie').split(';')[0]},csrf=(await r.json()).csrf;
   const q=await site.post('/shop/checkout-quote.php',{csrf,lines:[line],payment:'card'},h);
   const o=await site.post('/shop/order.php',{csrf,request_id:String(i+1).padStart(32,'0'),contact:{name:'Тест Покупець',recipient:'Тест Покупець',phone:'+38067123456'+i,city:'Київ',address:'Відділення 1',delivery_type:'branch'},payment:'card',lines:[line],expected_total:q.data.quote.total,catalog_version:q.data.quote.catalog_version},h);
   assert.equal(o.status,200,JSON.stringify(o.data));ids.push(o.data.order.id);site.sql(`INSERT INTO rubizh_account_orders(order_id,customer_id) VALUES(${o.data.order.id},'${A}')`);}
  writeFileSync(path.join(site.dir,'sess_'+SID),`csrf|s:64:"${'c'.repeat(64)}";customer_id|s:32:"${A}";login_time|i:${Math.floor(Date.now()/1000)};login_method|s:5:"email";`);
  site.page=async url=>{const r=await fetch(site.base+url,{headers:{Cookie:'rubizh_customer='+SID}});return (await r.text()).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');};
  return {site,ids};
 }catch(e){site.stop();throw e;}
}

test('P-1: a customer without orders sees a plain empty state with the way to the catalog',{skip,timeout:180000},async()=>{
 const {site}=await cabinet();
 try{
  const html=await (await fetch(site.base+'/auth/?tab=orders',{headers:{Cookie:'rubizh_customer='+SID}})).text();
  assert.match(html.replace(/<[^>]+>/g,' '),/Ви ще не робили замовлень\./);
  assert.match(html,/<a[^>]+href="\/catalog"[^>]*>[^<]*Переглянути каталог/);
 }finally{site.stop();}
});

test('P-2/P-3/P-4: order cards count goods and show payment and delivery; the order page separates statuses and numbers parcels',{skip,timeout:180000},async()=>{
 const {site,ids}=await cabinet({orders:1,qty:2});
 try{
  const list=await site.page('/auth/?tab=orders&view=active');
  assert.match(list,/2 товари/);assert.match(list,/Оплата: Очікує оплати/);assert.match(list,/Доставка: Ще не відправлено/);
  for(const [ttn] of [['20450000000021'],['20450000000022']])site.sql(`INSERT INTO rubizh_order_shipments(order_id,supplier_code,tracking_number,status,created_at,updated_at) VALUES(${ids[0]},'m_vin','${ttn}','created',UTC_TIMESTAMP(),UTC_TIMESTAMP())`);
  site.sql(`UPDATE rubizh_customer_orders SET status='partially_shipped',payment_status='paid' WHERE id=${ids[0]}`);
  const detail=await site.page('/auth/?tab=orders&order='+ids[0]);
  assert.match(detail,/Статус замовлення Частково відправлено/);assert.match(detail,/Оплата Оплачено/);assert.match(detail,/Доставка Частково відправлено/);
  assert.match(detail,/Посилка 1 із 2.*20450000000021/);assert.match(detail,/Посилка 2 із 2.*20450000000022/);
  assert.doesNotMatch(detail,/\b(pending|awaiting_webhook|partially_shipped|processing|pending_provider_reconcile)\b/,'no technical status codes');
 }finally{site.stop();}
});

test('P-6: repeat order adds current variants once — an SKU already in the cart gets its quantity raised, not a second line',{skip,timeout:240000},async()=>{
 const {site,ids}=await cabinet({orders:1,qty:1});let browser;
 try{
  site.sql(`UPDATE rubizh_customer_orders SET status='delivered',payment_status='paid' WHERE id=${ids[0]}`);
  browser=await chromium.launch({executablePath:(process.env.CHROMIUM_PATH||'/usr/bin/chromium'),args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  await context.addCookies([{name:'rubizh_customer',value:SID,url:site.base,secure:true,httpOnly:true,sameSite:'Lax'}]);
  await context.route(/^https:\/\/rubizh\.shop\/media\//,r=>r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64')}));
  const page=await context.newPage();
  const cart=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('rubizh.cart')||'[]').map(l=>[l.sku,l.qty||1]));
  await page.goto(site.base+'/#cart?repeat='+ids[0]);await page.waitForFunction(()=>JSON.parse(localStorage.getItem('rubizh.cart')||'[]').length>0,null,{timeout:20000});
  assert.deepEqual(await cart(),[['RUB-F0001',1]]);
  await page.goto(site.base+'/');await page.goto(site.base+'/#cart?repeat='+ids[0]);await page.waitForTimeout(1500);
  assert.deepEqual(await cart(),[['RUB-F0001',2]],'the same SKU is merged');
 }finally{await browser?.close();site.stop();}
});
