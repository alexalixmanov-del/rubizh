// Quality gate (stage 1): one buyer can never read, pay, cancel or repeat another buyer's order (IDOR A↔B), whether the
// other buyer is a guest browser or a signed-in customer; the owner still can. Isolated MySQL fixture, MonoPay mock.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {startSite,wire,publish} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const A='a'.repeat(32),B='b'.repeat(32);
const guest=async site=>{const r=await fetch(site.base+'/shop/customer.php');return {h:{Cookie:r.headers.get('set-cookie').split(';')[0]},csrf:(await r.json()).csrf};};

test('IDOR A↔B: another guest or signed-in customer gets no order data and no effect; the owner does',{skip,timeout:180000},async()=>{
 const site=await startSite({extraConfig:",'mono_mock'=>true,'environment'=>'staging'"});try{
  assert.equal((await publish(site,structuredClone(wire))).status,200);
  const a=await guest(site),model=wire.products.find(p=>p.id==='m-jacket');
  const line={product_id:'m-jacket',color_id:model.colors.find(c=>c.variant_skus.includes('RUB-F0001')).id,sku:'RUB-F0001',qty:1};
  const q=await site.post('/shop/checkout-quote.php',{csrf:a.csrf,lines:[line],payment:'card'},a.h);
  const o=await site.post('/shop/order.php',{csrf:a.csrf,request_id:'1d'.repeat(16),contact:{name:'Тест Покупець',recipient:'Тест Покупець',phone:'+380671234567',city:'Київ',address:'Відділення 1',delivery_type:'branch'},payment:'card',lines:[line],expected_total:q.data.quote.total,catalog_version:q.data.quote.catalog_version},a.h);
  assert.equal(o.status,200,JSON.stringify(o.data));const id=o.data.order.id,number=site.sql('SELECT order_number FROM rubizh_customer_orders WHERE id='+id)[0].order_number;
  const before=site.sql('SELECT status,payment_status FROM rubizh_customer_orders WHERE id='+id)[0];
  for(const [c,mail] of [[A,'a@fixture.test'],[B,'b@fixture.test']])site.sql(`INSERT INTO rubizh_accounts(id,email,first_name,last_name,created_at,updated_at) VALUES('${c}','${mail}','Тест','Покупець',UTC_TIMESTAMP(),UTC_TIMESTAMP())`);
  site.sql(`INSERT INTO rubizh_account_orders(order_id,customer_id) VALUES(${id},'${A}')`);
  const signed=who=>{const sid=('i'+who).slice(0,32);writeFileSync(path.join(site.dir,'sess_'+sid),`csrf|s:64:"${'c'.repeat(64)}";customer_id|s:32:"${who}";login_time|i:${Math.floor(Date.now()/1000)};login_method|s:5:"email";`);return {h:{Cookie:'rubizh_customer='+sid},csrf:'c'.repeat(64)};};
  // The owner: the guest browser that placed it and the signed-in account it belongs to.
  assert.equal((await site.get('/shop/order-status.php?number='+encodeURIComponent(number),a.h)).status,200,'owner guest reads its order');
  const own=await site.get('/auth/?tab=orders&order='+id,signed(A).h);assert.equal(own.status,200);assert.ok(own.text.includes(number),'owner account sees its order');
  for(const [who,b] of [['guest B',await guest(site)],['customer B',signed(B)]]){
   const st=await site.get('/shop/order-status.php?number='+encodeURIComponent(number),b.h);assert.notEqual(st.status,200,who+': status');assert.ok(!st.text.includes('RUB-F0001'),who+': no lines leak');
   assert.notEqual((await site.get('/shop/repeat-order.php?order='+id,b.h)).status,200,who+': repeat');
   assert.notEqual((await site.post('/shop/payment-start.php',{csrf:b.csrf,order_id:id},b.h)).status,200,who+': payment-start');
   const ret=await site.get('/shop/payment-return.php?order='+id,b.h);assert.ok(!ret.text.includes(number),who+': payment page shows nothing');
   const cancel=await fetch(site.base+'/shop/payment-return.php',{method:'POST',headers:{...b.h,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({order:String(id),action:'cancel',csrf:b.csrf})});await cancel.text();
   assert.equal((await site.get('/shop/donation-proof.php?order='+id,b.h)).status,404,who+': donation proof');
   if(who==='customer B'){const acc=await site.get('/auth/?tab=orders&order='+id,b.h);assert.equal(acc.status,404,who+': account order');assert.ok(!acc.text.includes(number));}
  }
  assert.deepEqual(site.sql('SELECT status,payment_status FROM rubizh_customer_orders WHERE id='+id)[0],before,'nothing changed');
  assert.equal(+site.sql('SELECT COUNT(*) n FROM rubizh_mono_invoices WHERE order_id='+id)[0].n,0,'no invoice made by another buyer');
 }finally{site.stop();}
});
