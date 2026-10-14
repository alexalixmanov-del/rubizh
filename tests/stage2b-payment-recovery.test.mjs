// Q-7 MonoPay webhook contract tests with a fixture ECDSA key pair (the bank's public key is replaced in the isolated DB).
// No negative case may mark the order paid. Isolated MySQL fixture, MonoPay mock for invoice creation; no network.
import {test} from 'node:test';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createSign} from 'node:crypto';
import {startSite,wire,publish} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
import {php} from './helpers/site-fixture.mjs';
async function fixture({stock=null}={}){
 const site=await startSite({extraConfig:",'mono_mock'=>true,'environment'=>'staging','staff_roles'=>['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'=>'OWNER']"});
 const payload=structuredClone(wire);
 if(stock!==null)for(const model of payload.products)for(const variant of model.variants)if(variant.sku==='RUB-F0001')Object.assign(variant,{stock,stock_quantity:stock,stock_status:'CONFIRMED',availability_source:'QUANTITY',inventory_mode:'QUANTITY'});
 assert.equal((await publish(site,payload)).status,200);
 const keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 site.sql(`INSERT INTO meta(k,v) VALUES('mono_public_key','${Buffer.from(keys.publicKey.export({type:'spki',format:'pem'})).toString('base64')}')`);
 const other=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 // The bank key was refreshed a moment ago (as after any first webhook), so a forged signature is judged against it.
 site.sql(`INSERT INTO meta(k,v) VALUES('mono_public_key_checked',UNIX_TIMESTAMP()) ON DUPLICATE KEY UPDATE v=VALUES(v)`);
 site.hook=(inv,{status='success',amount=+inv.amount,ccy=980,invoiceId=inv.invoice_id,key=keys.privateKey,at=new Date(),...extras}={})=>{const raw=JSON.stringify({invoiceId,status,amount,ccy,reference:inv.reference,modifiedDate:at.toISOString(),...extras});
  return site.post('/shop/mono-webhook.php',raw,{'X-Sign':createSign('SHA256').update(raw).sign(key).toString('base64')});};
 site.forged=inv=>site.hook(inv,{key:other.privateKey});
 const r=await fetch(site.base+'/shop/customer.php');const h={Cookie:r.headers.get('set-cookie').split(';')[0]},csrf=(await r.json()).csrf;
 const model=wire.products.find(p=>p.id==='m-jacket'),line={product_id:'m-jacket',color_id:model.colors.find(c=>c.variant_skus.includes('RUB-F0001')).id,sku:'RUB-F0001',qty:1};
 site.newInvoice=async(n)=>{const q=await site.post('/shop/checkout-quote.php',{csrf,lines:[line],payment:'card'},h);
  assert.equal(q.status,200,JSON.stringify(q.data));
  const o=await site.post('/shop/order.php',{csrf,request_id:String(n).padStart(32,'9'),contact:{name:'Тест Покупець',recipient:'Тест Покупець',phone:'+380671234567',city:'Київ',address:'Відділення 1',delivery_type:'branch'},payment:'card',lines:[line],expected_total:q.data.quote.total,catalog_version:q.data.quote.catalog_version},h);
  assert.equal(o.status,200,JSON.stringify(o.data));const id=o.data.order.id;assert.equal((await site.post('/shop/payment-start.php',{csrf,order_id:id},h)).status,200);
  return {id,inv:site.sql('SELECT * FROM rubizh_mono_invoices WHERE order_id='+id)[0]};};
 site.paid=id=>site.sql('SELECT payment_status FROM rubizh_customer_orders WHERE id='+id)[0].payment_status;
 site.reads=()=>+(site.sql("SELECT v FROM meta WHERE k='mono_mock_status_reads'")[0]?.v||0);// bank status reads seen by the mock
 return site;
}

test('R5: invoice expiry fails only the attempt and permits retry until the original deadline',{skip,timeout:180000},async()=>{
 const site=await fixture({stock:3});try{
  const {id,inv}=await site.newInvoice(91),due=site.sql(`SELECT payment_due FROM rubizh_order_timing WHERE order_id=${id}`)[0].payment_due;
  assert.equal((await site.hook(inv,{status:'expired'})).status,200);
  assert.equal(site.paid(id),'failed');
  assert.equal(site.sql(`SELECT status FROM rubizh_customer_orders WHERE id=${id}`)[0].status,'confirmed');
  assert.equal(site.sql(`SELECT status FROM rubizh_stock_reservations WHERE order_id=${id}`)[0].status,'ACTIVE');
  php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${site.site}/auth/bootstrap.php';monoCreate(shopStoreDatabase(),${id},str_repeat('a',32));`);
  assert.equal(site.sql(`SELECT COUNT(*) n FROM rubizh_mono_invoices WHERE order_id=${id}`)[0].n,2);
  assert.equal(site.sql(`SELECT payment_due FROM rubizh_order_timing WHERE order_id=${id}`)[0].payment_due,due);
  const second=site.sql(`SELECT * FROM rubizh_mono_invoices WHERE order_id=${id} ORDER BY id DESC`)[0];
  assert.equal((await site.hook(second,{status:'expired'})).status,200);
  site.sql(`UPDATE rubizh_order_timing SET payment_due=UTC_TIMESTAMP()-INTERVAL 1 MINUTE WHERE order_id=${id}`);
  const retry=php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${site.site}/auth/bootstrap.php';monoCreate(shopStoreDatabase(),${id},str_repeat('a',32));`,{allowFail:true});assert.notEqual(retry.status,0);
  php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${site.site}/auth/bootstrap.php';shopLifecycleTick(shopStoreDatabase());`);
  assert.equal(site.sql(`SELECT status FROM rubizh_customer_orders WHERE id=${id}`)[0].status,'cancelled');
  assert.equal(site.sql(`SELECT status FROM rubizh_stock_reservations WHERE order_id=${id}`)[0].status,'RELEASED');

 }finally{site.stop();}
});
test('R5: stale attempts without a bank id fail truthfully; young attempts remain pending',{skip,timeout:180000},async()=>{
 const site=await fixture({stock:3});try{
  const {id}=await site.newInvoice(92);
  site.sql(`UPDATE rubizh_mono_invoices SET invoice_id=NULL,page_url='',status='unknown',created_at=UTC_TIMESTAMP()-INTERVAL 16 MINUTE WHERE order_id=${id}`);
  php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${site.site}/auth/bootstrap.php';monoWorkerRun(shopStoreDatabase());`);
  assert.equal(site.paid(id),'failed');
  assert.equal(site.sql(`SELECT status FROM rubizh_mono_invoices WHERE order_id=${id}`)[0].status,'failure');
  assert.equal(site.sql(`SELECT status FROM rubizh_customer_orders WHERE id=${id}`)[0].status,'confirmed');
  assert.equal(site.sql(`SELECT COUNT(*) n FROM rubizh_np_audit WHERE order_id=${id} AND action='mono_reference_lookup_unsupported'`)[0].n,1);
 }finally{site.stop();}
});
test('R5: known-id creating and unknown attempts reconcile by authenticated status, never by local assumption',{skip,timeout:180000},async()=>{
 const site=await fixture();try{
  const {id,inv}=await site.newInvoice(93);
  const run=(status)=>php(`define('RUBIZH_AUTH_NO_SESSION',true);define('RUBIZH_MONO_TESTS',true);require '${site.site}/auth/bootstrap.php';$GLOBALS['mono_test_transport']=function($path,$body){if(!str_starts_with($path,'invoice/status?invoiceId='))throw new RuntimeException('unexpected endpoint');return ['invoiceId'=>'${inv.invoice_id}','reference'=>'${inv.reference}','amount'=>${inv.amount},'ccy'=>980,'status'=>'${status}','modifiedDate'=>'2026-10-13T00:00:00Z'];};monoWorkerRun(shopStoreDatabase());`);
  site.sql(`UPDATE rubizh_mono_invoices SET status='creating' WHERE order_id=${id}`);run('created');assert.equal(site.paid(id),'pending');
  assert.equal(site.sql(`SELECT status FROM rubizh_mono_invoices WHERE order_id=${id}`)[0].status,'created');
  site.sql(`UPDATE rubizh_mono_invoices SET status='unknown' WHERE order_id=${id}`);run('success');assert.equal(site.paid(id),'pending');
  assert.equal(site.sql(`SELECT status FROM rubizh_mono_invoices WHERE order_id=${id}`)[0].status,'awaiting_webhook');
  site.sql(`UPDATE rubizh_mono_invoices SET updated_at=UTC_TIMESTAMP()-INTERVAL 16 MINUTE WHERE order_id=${id}`);run('success');assert.equal(site.paid(id),'paid');
 }finally{site.stop();}
});
test('R5: young no-id attempt is protected; explicit owner reconciliation audits reason and permits normal cancellation',{skip,timeout:180000},async()=>{
 const site=await fixture();try{
  const {id}=await site.newInvoice(94);
  site.sql(`UPDATE rubizh_mono_invoices SET invoice_id=NULL,page_url='',status='creating' WHERE order_id=${id}`);
  php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${site.site}/auth/bootstrap.php';monoWorkerRun(shopStoreDatabase());`);assert.equal(site.paid(id),'pending');
  const attempt=actor=>php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${site.site}/auth/bootstrap.php';monoReconcileNotCreated(shopStoreDatabase(),${id},str_repeat('${actor}',32),'Банк не створив рахунок');`,{allowFail:true});
  assert.notEqual(attempt('b').status,0);
  const csrf='c'.repeat(64),sid='r5owner'.padEnd(32,'a'),owner='a'.repeat(32);
  const session=age=>writeFileSync(site.dir+'/sess_'+sid,`csrf|s:64:"${csrf}";customer_id|s:32:"${owner}";login_time|i:${Math.floor(Date.now()/1000)-age};login_method|s:5:"email";`);
  const body={csrf,action:'invoice_not_created',order_id:id,reason:'Банк не створив рахунок',expected_updated_at:site.sql(`SELECT updated_at FROM rubizh_customer_orders WHERE id=${id}`)[0].updated_at};
  const send=b=>site.post('/shop/financial-actions.php',b,{Cookie:'rubizh_customer='+sid});
  session(3600);assert.equal((await send(body)).status,403,'stale owner login is refused');
  session(0);assert.equal((await send({...body,expected_updated_at:'2000-01-01 00:00:00'})).status,409);
  assert.equal((await send({...body,reason:'x'})).status,400);
  assert.equal((await send(body)).status,200);

  assert.equal(site.paid(id),'failed');assert.equal(site.sql(`SELECT COUNT(*) n FROM rubizh_order_audit WHERE order_id=${id} AND reason='Банк не створив рахунок'`)[0].n,1);
  php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${site.site}/auth/bootstrap.php';shopCancelOrder(shopStoreDatabase(),${id});`);
  assert.equal(site.sql(`SELECT status FROM rubizh_customer_orders WHERE id=${id}`)[0].status,'cancelled');
 }finally{site.stop();}
});
