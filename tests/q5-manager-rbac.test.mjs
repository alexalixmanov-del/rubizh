// Q-5 (owner decision 2026-10-11): money actions of staff stay in SITE with server-side RBAC, a fresh-login check for
// high-risk actions, a current-state check and an audit trail. Real HTTP sessions on the isolated fixture; MonoPay mock.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {startSite,wire,publish} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const OWNER='0'.repeat(31)+'1',MANAGER='0'.repeat(31)+'2',CUSTOMER='0'.repeat(31)+'3';
async function fixture(){
 const site=await startSite({extraConfig:`,'mono_mock'=>true,'environment'=>'staging','staff_roles'=>['${OWNER}'=>'OWNER','${MANAGER}'=>'MANAGER']`});
 assert.equal((await publish(site,structuredClone(wire))).status,200);
 const csrf='c'.repeat(64);
 site.as=(who,{age=0}={})=>{const sid=('s'+who).slice(0,32);writeFileSync(path.join(site.dir,'sess_'+sid),`csrf|s:64:"${csrf}";customer_id|s:32:"${who}";login_time|i:${Math.floor(Date.now()/1000)-age};login_method|s:5:"email";`);
  return (body,{token=csrf}={})=>site.post('/shop/financial-actions.php',{csrf:token,...body},{Cookie:'rubizh_customer='+sid});};
 const r=await fetch(site.base+'/shop/customer.php');const h={Cookie:r.headers.get('set-cookie').split(';')[0]},buyerCsrf=(await r.json()).csrf;
 const model=wire.products.find(p=>p.id==='m-jacket'),line={product_id:'m-jacket',color_id:model.colors.find(c=>c.variant_skus.includes('RUB-F0001')).id,sku:'RUB-F0001',qty:1};
 const q=await site.post('/shop/checkout-quote.php',{csrf:buyerCsrf,lines:[line],payment:'card'},h);
 const o=await site.post('/shop/order.php',{csrf:buyerCsrf,request_id:'5'.repeat(32),contact:{name:'Тест Покупець',recipient:'Тест Покупець',phone:'+380671234567',city:'Київ',address:'Відділення 1',delivery_type:'branch'},payment:'card',lines:[line],expected_total:q.data.quote.total,catalog_version:q.data.quote.catalog_version},h);
 assert.equal(o.status,200,JSON.stringify(o.data));site.orderId=o.data.order.id;
 return site;
}

test('Q-5: a customer and a manager without the right get 403; nothing changes',{skip,timeout:180000},async()=>{
 const site=await fixture();try{
  const id=site.orderId;
  for(const action of ['invoice.create','refund.execute','manual_reconcile'])assert.equal((await site.as(CUSTOMER)({action,order_id:id,reason:'тест причини дії'})).status,403,'customer: '+action);
  for(const action of ['refund.execute','manual_reconcile'])assert.equal((await site.as(MANAGER)({action,order_id:id,reason:'тест причини дії',invoice_id:'x'})).status,403,'manager: '+action);
  assert.equal(+site.sql('SELECT COUNT(*) n FROM rubizh_mono_invoices WHERE order_id='+id)[0].n,0);
 }finally{site.stop();}
});

test('Q-5: high-risk actions need a fresh login; low-risk ones do not',{skip,timeout:180000},async()=>{
 const site=await fixture();try{
  const id=site.orderId,stale=site.as(OWNER,{age:3600});
  const r=await stale({action:'refund.execute',order_id:id,reason:'повернення коштів покупцю'});
  assert.equal(r.status,403);assert.match(r.data.error,/увійдіть ще раз|підтвердьте вхід/i);
  const blind=await site.as(OWNER)({action:'refund.execute',order_id:id,reason:'повернення коштів покупцю'});
  assert.equal(blind.status,409,'a refund must name the order version it was prepared on');assert.equal(blind.data.error_code,'STATE_REQUIRED');
  const blindReconcile=await site.as(OWNER)({action:'manual_reconcile',order_id:id,reason:'звірка з банком',invoice_id:'x'});
  assert.equal(blindReconcile.status,409);assert.equal(blindReconcile.data.error_code,'STATE_REQUIRED','manual reconcile also needs the order version');
  const version=site.sql('SELECT updated_at FROM rubizh_customer_orders WHERE id='+id)[0].updated_at;
  const fresh=await site.as(OWNER)({action:'refund.execute',order_id:id,reason:'повернення коштів покупцю',expected_updated_at:version});
  assert.notEqual(fresh.status,403,'a fresh owner passes the identity check (the unpaid order is then refused by state)');assert.match(fresh.data.error||'',/не оплачене/i);
  const old=site.as(OWNER,{age:3600});// rewrites the owner session with an hour-old login
  assert.equal((await old({action:'invoice.create',order_id:id})).status,200,'invoice creation is not high-risk');
  // Owner settings hold the seller IBAN/bank details, supplier contacts and the donation share: step-up applies, and the
  // page says why instead of a generic refusal.
  const cookie={Cookie:'rubizh_customer='+('s'+OWNER).slice(0,32)};
  const locked=await site.get('/shop/settings.php',cookie);
  assert.equal(locked.status,403,'an hour-old login cannot open money/delivery settings');assert.match(locked.text,/підтвердьте вхід/);
  site.as(OWNER);const settings=await site.get('/shop/settings.php',cookie);
  assert.equal(settings.status,200,'a fresh owner login opens settings: '+settings.text.slice(0,120));assert.match(settings.text,/IBAN|iban/);
 }finally{site.stop();}
});

test('Q-5: a repeated action does not duplicate its effect, a changed order is refused, and every action is audited',{skip,timeout:180000},async()=>{
 const site=await fixture();try{
  const id=site.orderId,mgr=site.as(MANAGER);
  const before=site.sql('SELECT updated_at FROM rubizh_customer_orders WHERE id='+id)[0].updated_at;
  site.sql(`UPDATE rubizh_customer_orders SET updated_at=UTC_TIMESTAMP()+INTERVAL 1 MINUTE WHERE id=${id}`);
  const stale=await mgr({action:'invoice.create',order_id:id,expected_updated_at:before});
  assert.equal(stale.status,409,JSON.stringify(stale.data));assert.match(stale.data.error,/змінилося/i);
  const now=site.sql('SELECT updated_at FROM rubizh_customer_orders WHERE id='+id)[0].updated_at;
  assert.equal((await mgr({action:'invoice.create',order_id:id,expected_updated_at:now})).status,200);
  assert.equal((await mgr({action:'invoice.create',order_id:id})).status,200,'repeat');
  assert.equal(+site.sql('SELECT COUNT(*) n FROM rubizh_mono_invoices WHERE order_id='+id)[0].n,1,'one invoice');
  const audit=site.sql(`SELECT actor_id,action FROM rubizh_order_audit WHERE order_id=${id} AND action='payment.invoice.create'`);
  assert.ok(audit.length>=1&&audit.every(a=>a.actor_id===MANAGER),'who and what is recorded');
  assert.notEqual((await mgr({action:'invoice.create',order_id:id},{token:'f'.repeat(64)})).status,200,'no CSRF, no action');
 }finally{site.stop();}
});

// Stage-2 SP2: every SITE money-out entry point checks its prepared version after taking the order lock.
test('stage-2 SP2: legacy refund and reconciliation forms require a current order version',{skip,timeout:180000},async()=>{
 const site=await fixture();try{
  const id=site.orderId,owner=site.as(OWNER);assert.equal((await owner({action:'invoice.create',order_id:id})).status,200);
  const inv=site.sql('SELECT * FROM rubizh_mono_invoices WHERE order_id='+id)[0];
  const {readFileSync}=await import('node:fs');
  const event={invoiceId:inv.invoice_id,status:'created',amount:+inv.amount,ccy:980,reference:inv.reference,modifiedDate:new Date().toISOString()};
  writeFileSync(site.site+'/router.php',`<?php define('RUBIZH_MONO_TESTS',true);$GLOBALS['mono_test_transport']=function($p,$b){$db=shopStoreDatabase();$db->exec("INSERT INTO meta(k,v) VALUES('sp2_provider_calls','1') ON DUPLICATE KEY UPDATE v=v+1");if($p==='invoice/cancel')return ['status'=>'success'];return json_decode('${JSON.stringify(event)}',true);};`+readFileSync(site.site+'/router.php','utf8').replace(/^<\?php/,''));
  const cookie={Cookie:'rubizh_customer='+('s'+OWNER).slice(0,32)};
  const form=body=>fetch(site.base+'/shop/np-manager.php',{method:'POST',redirect:'manual',headers:{...cookie,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:'c'.repeat(64),order_id:id,financial_reason:'Звірка фінансової операції покупця',...body})});
  for(const action of ['mono_refund','mono_reconcile']){
   if(action==='mono_refund'){site.sql(`UPDATE rubizh_customer_orders SET payment_status='paid' WHERE id=${id}`);site.sql(`UPDATE rubizh_mono_invoices SET status='success' WHERE id=${inv.id}`);}
   else site.sql(`UPDATE rubizh_mono_invoices SET status='unknown',invoice_id=NULL WHERE id=${inv.id}`);
   const version=site.sql('SELECT updated_at FROM rubizh_customer_orders WHERE id='+id)[0].updated_at;
   site.sql(`UPDATE rubizh_customer_orders SET updated_at=updated_at+INTERVAL 1 MINUTE WHERE id=${id}`);
   const params={action,confirm_refund:'yes',mono_invoice_id:inv.invoice_id};
   for(const extra of [{},{expected_updated_at:version}]){
    const r=await form({...params,...extra});assert.notEqual(r.status,303,'missing or stale version refuses '+action);assert.match(await r.text(),/актуальну картку|змінилося після перегляду/);
    assert.equal(site.sql("SELECT v FROM meta WHERE k='sp2_provider_calls'").length,0,'refused action makes no provider request');
   }
   const page=await site.get('/shop/np-manager.php?order='+id,cookie),now=site.sql('SELECT updated_at FROM rubizh_customer_orders WHERE id='+id)[0].updated_at;
   assert.match(page.text,new RegExp('name="expected_updated_at" value="'+now+'"'),'rendered money form carries the viewed version');
   assert.equal((await form({...params,expected_updated_at:now})).status,303,'current version allows '+action);
   site.sql("DELETE FROM meta WHERE k='sp2_provider_calls'");
  }
 }finally{site.stop();}
});

test('stage-2 SP2: money-action versions are rechecked after an independent process releases the order lock',{skip,timeout:180000},async()=>{
 const site=await fixture();try{
  const {spawn}=await import('node:child_process'),{phpArgs,phpEnv,runtime}=await import('./helpers/site-fixture.mjs');
  const id=site.orderId,owner=site.as(OWNER);assert.equal((await owner({action:'invoice.create',order_id:id})).status,200);
  site.sql(`UPDATE rubizh_customer_orders SET payment_status='paid' WHERE id=${id}`);site.sql(`UPDATE rubizh_mono_invoices SET status='success' WHERE order_id=${id}`);
  for(const action of ['refund.execute','manual_reconcile'])for(const route of ['json','form']){
   const version=site.sql('SELECT updated_at FROM rubizh_customer_orders WHERE id='+id)[0].updated_at;
   const locker=spawn(runtime+'/bin/php8.4',[...phpArgs,'-r',`$db=new PDO('mysql:unix_socket='.getenv('RUBIZH_TEST_MYSQL_SOCKET').';dbname=${site.schema}','root','');$db->query("SELECT GET_LOCK('rubizh_np_order_${id}',2)");echo "READY\\n";fflush(STDOUT);fgets(STDIN);$db->query("SELECT RELEASE_LOCK('rubizh_np_order_${id}')");`],{env:phpEnv,stdio:['pipe','pipe','pipe']});
   try{
    await new Promise((resolve,reject)=>{locker.stdout.once('data',resolve);locker.once('error',reject);});
    const request=route==='json'?owner({action,order_id:id,invoice_id:'mock-reconcile',reason:'Повернення коштів покупцю',expected_updated_at:version}):fetch(site.base+'/shop/np-manager.php',{method:'POST',redirect:'manual',headers:{Cookie:'rubizh_customer='+('s'+OWNER).slice(0,32),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:'c'.repeat(64),order_id:id,action:action==='refund.execute'?'mono_refund':'mono_reconcile',mono_invoice_id:'mock-reconcile',confirm_refund:'yes',financial_reason:'Повернення коштів покупцю',expected_updated_at:version})});
    await new Promise(r=>setTimeout(r,150));site.sql(`UPDATE rubizh_customer_orders SET updated_at=updated_at+INTERVAL 1 MINUTE WHERE id=${id}`);locker.stdin.end('\n');
    const r=await request;if(route==='json'){assert.equal(r.status,409);assert.equal(r.data.error_code,'STATE_CHANGED');}else{assert.notEqual(r.status,303);assert.match(await r.text(),/змінилося після перегляду/);}
    assert.equal(site.sql('SELECT refund_status FROM rubizh_mono_invoices WHERE order_id='+id)[0].refund_status,'','no refund intent before locked version check');
   }finally{locker.kill();}
  }
 }finally{site.stop();}
});
