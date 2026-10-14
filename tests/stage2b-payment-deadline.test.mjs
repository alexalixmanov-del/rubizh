import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {startSite,wire,publish} from './helpers/site-fixture.mjs';

for(const expired of [false,true])test(`R5: unpaid confirmation preserves the original ${expired?'elapsed':'future'} payment deadline and reserve`,{timeout:180000},async()=>{
 const manager='b'.repeat(32),csrf='c'.repeat(64),sid='immutablepaymentdue'.padEnd(32,'b');
 const site=await startSite({extraConfig:",'mono_mock'=>true,'environment'=>'staging','staff_roles'=>['"+manager+"'=>'MANAGER']"});
 try{
  const payload=structuredClone(wire);Object.assign(payload.products.find(p=>p.id==='m-jacket').variants.find(v=>v.sku==='RUB-F0001'),{stock:3,stock_quantity:3,stock_status:'CONFIRMED',availability_source:'QUANTITY',inventory_mode:'QUANTITY'});
  assert.equal((await publish(site,payload)).status,200);
  const response=await fetch(site.base+'/shop/customer.php'),buyer={Cookie:response.headers.get('set-cookie').split(';')[0]},buyerCsrf=(await response.json()).csrf;
  const model=wire.products.find(p=>p.id==='m-jacket'),lines=[{product_id:model.id,color_id:model.colors.find(c=>c.variant_skus.includes('RUB-F0001')).id,sku:'RUB-F0001',qty:1}];
  const quote=await site.post('/shop/checkout-quote.php',{csrf:buyerCsrf,lines,payment:'card'},buyer);assert.equal(quote.status,200,JSON.stringify(quote.data));
  const order=await site.post('/shop/order.php',{csrf:buyerCsrf,request_id:(expired?'2':'1').repeat(32),contact:{name:'Тест Покупець',recipient:'Тест Покупець',phone:'+380671234567',city:'Київ',address:'Відділення 1',delivery_type:'branch'},payment:'card',lines,expected_total:quote.data.quote.total,catalog_version:quote.data.quote.catalog_version},buyer);
  assert.equal(order.status,200,JSON.stringify(order.data));const id=order.data.order.id;
  writeFileSync(site.dir+'/sess_'+sid,`csrf|s:64:"${csrf}";customer_id|s:32:"${manager}";login_time|i:${Math.floor(Date.now()/1000)};login_method|s:5:"email";`);
  site.sql(`UPDATE rubizh_order_timing SET payment_due=UTC_TIMESTAMP()+INTERVAL ${expired?'-1':'7'} DAY,remind_at=UTC_TIMESTAMP()+INTERVAL ${expired?'-2':'6'} DAY WHERE order_id=${id}`);
  site.sql(`UPDATE rubizh_stock_reservations r JOIN rubizh_order_timing t ON t.order_id=r.order_id SET r.expires_at=t.payment_due WHERE r.order_id=${id}`);
  const timing=()=>site.sql(`SELECT * FROM rubizh_order_timing WHERE order_id=${id}`),reserves=()=>site.sql(`SELECT * FROM rubizh_stock_reservations WHERE order_id=${id}`),before={timing:timing(),reserves:reserves()};
  assert.equal(before.reserves.length,1,'a real quantity-confirmed reserve must exist');assert.equal(+before.reserves[0].qty,1);assert.equal(before.reserves[0].status,'ACTIVE');
  for(let n=0;n<2;n++){
   const updated=site.sql(`SELECT updated_at FROM rubizh_customer_orders WHERE id=${id}`)[0].updated_at;
   const confirmed=await site.post('/shop/order-confirm.php',{csrf,order_id:id,availability_confirmed:true,extra_delivery_agreed:false,expected_updated_at:updated},{Cookie:'rubizh_customer='+sid});
   assert.equal(confirmed.status,200,JSON.stringify(confirmed.data));
   assert.deepEqual(timing(),before.timing,'confirmation cannot replace payment_due or reminder');
   assert.deepEqual(reserves(),before.reserves,'confirmation cannot extend or recommit the reserve');
   assert.equal(site.sql(`SELECT payment_status FROM rubizh_customer_orders WHERE id=${id}`)[0].payment_status,'pending');
  }
  const pay=await site.post('/shop/payment-start.php',{csrf:buyerCsrf,order_id:id},buyer);
  assert.equal(pay.status,expired?409:200,JSON.stringify(pay.data));
  if(expired){assert.equal(pay.data.error_code,'PAYMENT_NOT_ALLOWED');assert.equal(site.sql(`SELECT COUNT(*) n FROM rubizh_mono_invoices WHERE order_id=${id}`)[0].n,0);}
  assert.deepEqual(timing(),before.timing,'payment attempt leaves the original deadline intact');
 }finally{site.stop();}
});
