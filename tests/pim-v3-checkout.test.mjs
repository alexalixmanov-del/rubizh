import {test} from 'node:test';import assert from 'node:assert/strict';import {generateKeyPairSync,createSign} from 'node:crypto';
import {startSite,wire,publish,php} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const model=id=>wire.products.find(p=>p.id===id),colorOf=(id,sku)=>model(id).colors.find(c=>c.variant_skus.includes(sku)).id;
const contact={name:'Тест Покупець',recipient:'Тест Покупець',phone:'+380671234567',city:'Київ',address:'Відділення 1',delivery_type:'branch'};
let n=0;const rid=()=>(++n).toString(16).padStart(32,'0');
async function shopper(site){const who=await fetch(site.base+'/shop/customer.php');return {h:{Cookie:who.headers.get('set-cookie').split(';')[0]},csrf:(await who.json()).csrf};}
async function order(site,s,lines,payment='card'){
 const q=await site.post('/shop/checkout-quote.php',{csrf:s.csrf,lines,payment},s.h);if(q.status!==200)return {quote:q};
 const o=await site.post('/shop/order.php',{csrf:s.csrf,request_id:rid(),contact,payment,lines,expected_total:q.data.quote.total,catalog_version:q.data.quote.catalog_version},s.h);return {quote:q,order:o};
}
const sku=(id,s,qty=1)=>({product_id:id,color_id:colorOf(id,s),sku:s,qty});
async function setup(){
 const site=await startSite({extraConfig:",'mono_mock'=>true,'environment'=>'staging'"});
 assert.equal((await publish(site,wire)).status,200);
 const {publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 site.sql(`INSERT INTO meta(k,v) VALUES('mono_public_key','${Buffer.from(publicKey.export({type:'spki',format:'pem'})).toString('base64')}') ON DUPLICATE KEY UPDATE v=VALUES(v)`);
 site.webhook=async(invoice,status='success')=>{const raw=JSON.stringify({invoiceId:invoice.invoice_id,status,amount:+invoice.amount,ccy:980,reference:invoice.reference,modifiedDate:new Date().toISOString()});const sig=createSign('SHA256').update(raw).sign(privateKey).toString('base64');return site.post('/shop/mono-webhook.php',raw,{'X-Sign':sig});};
 return site;
}

test('IN_STOCK real SKU: immediate CONFIRMED order, one invoice, browser return is not PAID, signed webhook is',{skip,timeout:180000},async()=>{
 const site=await setup();
 try{const s=await shopper(site);
  const {quote,order:o}=await order(site,s,[sku('m-jacket','RUB-F0001')]);
  assert.equal(quote.data.quote.order_mode,'PAY');assert.equal(quote.data.quote.total,2860);
  assert.equal(o.status,200,JSON.stringify(o.data));assert.equal(o.data.order.order_state,'CONFIRMED');assert.equal(o.data.order.payment_state,'UNPAID');assert.equal(o.data.order.payment_ready,true);assert.equal(o.data.order.title,'Замовлення створено — очікує оплати');
  const id=o.data.order.id;
  const pay=await site.post('/shop/payment-start.php',{csrf:s.csrf,order_id:id},s.h);assert.equal(pay.status,200,JSON.stringify(pay.data));assert.match(pay.data.url,/^https:\/\/pay\.mbnk\.biz\//);
  const inv=site.sql('SELECT * FROM rubizh_mono_invoices WHERE order_id='+id);assert.equal(inv.length,1);assert.equal(+inv[0].amount,286000,'server-authoritative amount');
  assert.equal(site.sql('SELECT pim_payment_state FROM rubizh_customer_orders WHERE id='+id)[0].pim_payment_state,'PAYMENT_PENDING');
  await site.get('/shop/payment-return.php?invoice='+inv[0].id,s.h);
  assert.equal(site.sql('SELECT payment_status FROM rubizh_customer_orders WHERE id='+id)[0].payment_status,'pending','redirect is not payment');
  const bad=await site.post('/shop/mono-webhook.php',JSON.stringify({invoiceId:inv[0].invoice_id,status:'success',amount:286000,ccy:980,modifiedDate:new Date().toISOString()}),{'X-Sign':Buffer.from('forged').toString('base64')});assert.notEqual(bad.status,200);assert.equal(site.sql('SELECT payment_status FROM rubizh_customer_orders WHERE id='+id)[0].payment_status,'pending','forged callback never pays');
  const hook=await site.webhook(inv[0]);assert.equal(hook.status,200,JSON.stringify(hook.data));
  const row=site.sql('SELECT payment_status,pim_payment_state,pim_order_state FROM rubizh_customer_orders WHERE id='+id)[0];assert.equal(row.payment_status,'paid');assert.equal(row.pim_payment_state,'PAID');assert.equal(row.pim_order_state,'CONFIRMED');
  const again=await site.post('/shop/payment-start.php',{csrf:s.csrf,order_id:id},s.h);assert.notEqual(again.status,200,'no second payment');
  assert.equal(site.sql('SELECT COUNT(*) n FROM rubizh_mono_invoices WHERE order_id='+id)[0].n,1);
 }finally{site.stop();}
});

test('negative paths: UNKNOWN and OUT_OF_STOCK refused; PREORDER and size option need confirmation; no fake SKU; forged data rejected',{skip,timeout:180000},async()=>{
 const site=await setup();
 try{const s=await shopper(site);const orders=()=>site.sql('SELECT COUNT(*) n FROM rubizh_customer_orders')[0].n;
  for(const [name,line,code] of [['UNKNOWN',{...sku('m-belt','RUB-F0030'),payment_allowed:true,price:1},'UNAVAILABLE'],['OUT_OF_STOCK',sku('m-jacket','RUB-F0004'),'UNAVAILABLE'],['wrong color for SKU',{...sku('m-jacket','RUB-F0001'),color_id:colorOf('m-jacket','RUB-F0003')},'INVALID_VARIANT'],['no color on a multi-color model',{product_id:'m-jacket',sku:'RUB-F0001',qty:1},'INVALID_VARIANT'],['option with invented SKU',{product_id:'m-pants',color_id:colorOf('m-pants','RUB-F0010'),option_id:model('m-pants').size_options[3].option_id,sku:'FAKE-48',qty:1},'INVALID_VARIANT'],['SKU of another model',{product_id:'m-belt',sku:'RUB-F0001',qty:1},'INVALID_VARIANT']]){
   const before=orders();const r=await order(site,s,[line]);assert.equal(r.quote.status,400,name);assert.equal(r.quote.data.error_code,code,name+' '+JSON.stringify(r.quote.data));assert.equal(orders(),before,name);
  }
  const option=model('m-pants').size_options.find(o=>o.size==='48');
  const req=await order(site,s,[{product_id:'m-pants',color_id:colorOf('m-pants','RUB-F0010'),option_id:option.option_id,size:'48',qty:1}]);
  assert.equal(req.quote.data.quote.order_mode,'REQUEST');assert.equal(req.quote.data.quote.price_pending,true);
  assert.equal(req.order.status,200,JSON.stringify(req.order.data));assert.equal(req.order.data.order.order_state,'WAITING_CONFIRMATION');assert.equal(req.order.data.order.payment_ready,false);assert.equal(req.order.data.order.title,'Заявку отримано — очікуйте підтвердження');
  const reqId=req.order.data.order.id;
  assert.equal((await site.post('/shop/payment-start.php',{csrf:s.csrf,order_id:reqId},s.h)).status,400,'no payment before confirmation');
  assert.equal(site.sql('SELECT COUNT(*) n FROM rubizh_stock_reservations WHERE order_id='+reqId)[0].n,0,'request is not a stock reservation');
  const sel=site.sql('SELECT option_id,resolved_sku FROM rubizh_order_request_selections WHERE order_id='+reqId);assert.equal(sel.length,1);assert.equal(sel[0].resolved_sku,null);
  assert.equal(site.sql("SELECT COUNT(*) n FROM variants WHERE product_id='m-pants'")[0].n,1,'no SKU created for the requested size');
  const pre=await order(site,s,[sku('m-pouch','RUB-F0020')]);assert.equal(pre.order.data.order.order_state,'WAITING_CONFIRMATION');
  // Data age is only a warning; explicit expiry blocks.
  site.sql("UPDATE variants SET pim_stock_data_age_hours=500,pim_stale_source=1 WHERE sku='RUB-F0002'");
  assert.equal((await order(site,s,[sku('m-jacket','RUB-F0002')])).order.data.order.order_state,'CONFIRMED');
  site.sql("UPDATE variants SET pim_expires_at=1000 WHERE sku='RUB-F0002'");
  assert.equal((await order(site,s,[sku('m-jacket','RUB-F0002')])).quote.data.error_code,'UNAVAILABLE');
 }finally{site.stop();}
});

test('mixed cart: whole order WAITING_CONFIRMATION, manager resolves the size request to a real SKU, then one total payment',{skip,timeout:180000},async()=>{
 const site=await setup();
 try{const s=await shopper(site);const option=model('m-pants').size_options.find(o=>o.size==='50');
  const r=await order(site,s,[sku('m-jacket','RUB-F0001'),{product_id:'m-pants',color_id:colorOf('m-pants','RUB-F0010'),option_id:option.option_id,size:'50',qty:1}]);
  assert.equal(r.quote.data.quote.order_mode,'REQUEST');assert.equal(r.order.status,200,JSON.stringify(r.order.data));
  const id=r.order.data.order.id;assert.equal(r.order.data.order.order_state,'WAITING_CONFIRMATION');
  assert.equal((await site.post('/shop/payment-start.php',{csrf:s.csrf,order_id:id},s.h)).status,400);
  const confirm=php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${site.site}/auth/bootstrap.php';$db=shopStoreDatabase();$GLOBALS['rubizh_request_resolution']=[1=>'RUB-F0010'];npConfirm($db,${id},str_repeat('a',32),true,false,'');echo 'ok';`);
  assert.match(confirm.stdout,/ok/);
  const row=site.sql('SELECT total,status,pim_order_state,items_json FROM rubizh_customer_orders WHERE id='+id)[0];
  assert.equal(row.pim_order_state,'CONFIRMED');assert.equal(row.status,'confirmed');assert.equal(+row.total,2860+1910);
  const items=JSON.parse(row.items_json);assert.equal(items[1].sku,'RUB-F0010');assert.equal(items[1].resolved_from_option,option.option_id);
  const pay=await site.post('/shop/payment-start.php',{csrf:s.csrf,order_id:id},s.h);assert.equal(pay.status,200,JSON.stringify(pay.data));
  const inv=site.sql('SELECT * FROM rubizh_mono_invoices WHERE order_id='+id);assert.equal(inv.length,1);assert.equal(+inv[0].amount,477000,'one payment for the whole order');
  assert.equal((await site.webhook(inv[0])).status,200);assert.equal(site.sql('SELECT pim_payment_state FROM rubizh_customer_orders WHERE id='+id)[0].pim_payment_state,'PAID');
 }finally{site.stop();}
});

test('price change after order: payment refused until a new agreed total; saved amount never rewritten silently',{skip,timeout:180000},async()=>{
 const site=await setup();
 try{const s=await shopper(site);
  const {order:o}=await order(site,s,[sku('m-jacket','RUB-F0003')]);const id=o.data.order.id;
  const changed=structuredClone(wire);const v=changed.products.find(p=>p.id==='m-jacket').variants.find(v=>v.sku==='RUB-F0003');v.price=v.site_price=2990;
  assert.equal((await publish(site,changed)).status,200);
  const pay=await site.post('/shop/payment-start.php',{csrf:s.csrf,order_id:id},s.h);assert.equal(pay.status,400);assert.match(pay.data.error,/Ціна змінилася/);
  assert.equal(+site.sql('SELECT total FROM rubizh_customer_orders WHERE id='+id)[0].total,2860);assert.equal(site.sql('SELECT COUNT(*) n FROM rubizh_mono_invoices WHERE order_id='+id)[0].n,0);
 }finally{site.stop();}
});
