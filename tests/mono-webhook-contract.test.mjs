// Q-7 MonoPay webhook contract tests with a fixture ECDSA key pair (the bank's public key is replaced in the isolated DB).
// No negative case may mark the order paid. Isolated MySQL fixture, MonoPay mock for invoice creation; no network.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createSign} from 'node:crypto';
import {startSite,wire,publish} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
import {php} from './helpers/site-fixture.mjs';
async function fixture({stock=null}={}){
 const site=await startSite({extraConfig:",'mono_mock'=>true,'environment'=>'staging'"});
 const payload=structuredClone(wire);
 if(stock!==null)for(const model of payload.products)for(const variant of model.variants)if(variant.sku==='RUB-F0001')Object.assign(variant,{stock,stock_quantity:stock,stock_status:'CONFIRMED',availability_source:'QUANTITY',inventory_mode:'QUANTITY'});
 assert.equal((await publish(site,payload)).status,200);
 const keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 site.sql(`INSERT INTO meta(k,v) VALUES('mono_public_key','${Buffer.from(keys.publicKey.export({type:'spki',format:'pem'})).toString('base64')}')`);
 const other=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 // The bank key was refreshed a moment ago (as after any first webhook), so a forged signature is judged against it.
 site.sql(`INSERT INTO meta(k,v) VALUES('mono_public_key_checked',UNIX_TIMESTAMP()) ON DUPLICATE KEY UPDATE v=VALUES(v)`);
 site.hook=(inv,{status='success',amount=+inv.amount,ccy=980,invoiceId=inv.invoice_id,key=keys.privateKey,at=new Date()}={})=>{const raw=JSON.stringify({invoiceId,status,amount,ccy,reference:inv.reference,modifiedDate:at.toISOString()});
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

test('stage-2 PAY-01: a failed card attempt keeps its payable invoice and reservation until the bank closes it',{skip,timeout:180000},async()=>{
 const site=await fixture({stock:3});try{
  const {id,inv}=await site.newInvoice(81);
  assert.equal((await site.hook(inv,{status:'failure'})).status,200);
  site.sql(`UPDATE rubizh_order_timing SET payment_due=UTC_TIMESTAMP()-INTERVAL 1 HOUR WHERE order_id=${id}`);
  php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${site.site}/auth/bootstrap.php';shopLifecycleTick(shopStoreDatabase());`);
  assert.equal(site.sql(`SELECT status FROM rubizh_customer_orders WHERE id=${id}`)[0].status,'confirmed','a failed attempt has not closed the bank invoice');
  assert.equal(site.sql(`SELECT status FROM rubizh_stock_reservations WHERE order_id=${id}`)[0].status,'ACTIVE','stock must remain held while the invoice can be paid');
  assert.equal((await site.hook(inv,{status:'success',at:new Date(Date.now()+1000)})).status,200);
  assert.equal(site.paid(id),'paid');
  assert.equal(site.sql(`SELECT status FROM rubizh_customer_orders WHERE id=${id}`)[0].status,'confirmed');
 }finally{site.stop();}
});



test('MonoPay webhook contract: valid signature pays once; duplicates change nothing',{skip,timeout:180000},async()=>{
 const site=await fixture();try{
  const {id,inv}=await site.newInvoice(1),at=new Date();// a bank retry resends the identical body
  assert.equal((await site.hook(inv,{at})).status,200);assert.equal(site.paid(id),'paid');
  for(let i=0;i<3;i++)assert.equal((await site.hook(inv,{at})).status,200,'the bank may retry');
  assert.equal(site.paid(id),'paid');assert.equal(+site.sql(`SELECT COUNT(*) n FROM rubizh_mono_events WHERE invoice_id='${inv.invoice_id}'`)[0].n,1,'one applied event');
 }finally{site.stop();}
});

test('MonoPay webhook contract: forged signature, wrong amount, wrong currency, foreign invoice and failure never mark paid',{skip,timeout:180000},async()=>{
 const site=await fixture();try{
  const {id,inv}=await site.newInvoice(2);
  const reads=site.reads();
  assert.equal((await site.forged(inv)).status,403,'forged signature');
  assert.equal((await site.hook(inv,{amount:+inv.amount-1})).status,200,'wrong amount is acknowledged and parked');
  assert.equal((await site.hook(inv,{ccy:840})).status,200,'wrong currency is acknowledged and parked');
  assert.equal((await site.hook(inv,{invoiceId:'someone-else-invoice'})).status,503,'unknown invoice stays retryable');
  assert.equal((await site.hook(inv,{status:'failure'})).status,200);
  assert.equal(site.paid(id),'failed');assert.equal(+site.sql(`SELECT COUNT(*) n FROM rubizh_np_audit WHERE order_id=${id} AND action='mono_event_rejected'`)[0].n,2);assert.equal(+site.sql(`SELECT COUNT(*) n FROM rubizh_np_audit WHERE order_id=${id} AND action='mono_parked_reconcile'`)[0].n,1,'parked events are reconciled by one status read; a replay within a minute adds no bank call');
  assert.equal(site.reads()-reads,1,'exactly one bank read for the parked events (the second one is skipped, not failed)');assert.match(site.sql(`SELECT note FROM rubizh_np_audit WHERE order_id=${id} AND action='mono_parked_reconcile'`)[0].note,/^bank status=created /,'and that read succeeded');
 }finally{site.stop();}
});

test('MonoPay webhook contract: a webhook that arrives before the invoice is saved is retried by the bank and then pays once',{skip,timeout:180000},async()=>{
 const site=await fixture();try{
  const {id,inv}=await site.newInvoice(3);
  site.sql(`UPDATE rubizh_mono_invoices SET invoice_id='pending-save' WHERE order_id=${id}`);
  assert.equal((await site.hook(inv)).status,503,'invoice not saved yet → bank retries');assert.equal(site.paid(id),'pending');
  site.sql(`UPDATE rubizh_mono_invoices SET invoice_id='${inv.invoice_id}' WHERE order_id=${id}`);
  assert.equal((await site.hook(inv)).status,200);assert.equal(site.paid(id),'paid');
 }finally{site.stop();}
});

test('MonoPay webhook contract: expiry or a stale non-final event on a closed invoice never marks paid',{skip,timeout:180000},async()=>{
 const site=await fixture();try{
  const {id,inv}=await site.newInvoice(4);
  assert.equal((await site.hook(inv,{status:'expired'})).status,200);
  assert.notEqual(site.paid(id),'paid');assert.equal(site.sql('SELECT status FROM rubizh_customer_orders WHERE id='+id)[0].status,'cancelled','an expired invoice releases the order');
  assert.equal((await site.hook(inv,{status:'processing',at:new Date(Date.now()-60000)})).status,200);assert.notEqual(site.paid(id),'paid');
 }finally{site.stop();}
});

test('MonoPay webhook contract: an unknown status is parked, then the site reads the invoice status from the bank and audits it',{skip,timeout:180000},async()=>{
 const site=await fixture();try{
  const {id,inv}=await site.newInvoice(5);
  assert.equal((await site.hook(inv,{status:'chargeback_new'})).status,200,'acknowledged and parked, no endless bank retries');
  assert.notEqual(site.paid(id),'paid');
  const audit=site.sql(`SELECT action,note FROM rubizh_np_audit WHERE order_id=${id} AND action IN ('mono_event_rejected','mono_parked_reconcile') ORDER BY id`);
  assert.deepEqual(audit.map(a=>a.action),['mono_event_rejected','mono_parked_reconcile'],'parked, then reconciled by a pull read');
  assert.match(audit[1].note,/^bank status=created .*local=created$/,'the bank answer (mock) and the local state are recorded');
  assert.equal(site.sql(`SELECT status FROM rubizh_mono_invoices WHERE order_id=${id}`)[0].status,'created','the pull read moves no money state');
 }finally{site.stop();}
});

test('MonoPay webhook contract: a failed bank status read during reconciliation still answers 200 (parked) and is audited',{skip,timeout:180000},async()=>{
 const site=await fixture();try{
  const {id,inv}=await site.newInvoice(6);const reads=site.reads();
  site.sql("INSERT INTO meta(k,v) VALUES('mono_mock_status_fail','1') ON DUPLICATE KEY UPDATE v='1'");
  assert.equal((await site.hook(inv,{status:'chargeback_new'})).status,200,'the bank outage does not turn the parked answer into a retryable error');
  assert.notEqual(site.paid(id),'paid');assert.equal(site.reads()-reads,1,'the read was attempted');
  assert.match(site.sql(`SELECT note FROM rubizh_np_audit WHERE order_id=${id} AND action='mono_parked_reconcile'`)[0].note,/^status read failed: RuntimeException local=created$/);
 }finally{site.stop();}
});

// Stage-2 SP1: validate the entire signed cancellation list before any refund-ledger transition.
test('stage-2 SP1: contradictory duplicate cancellation facts are parked and keep the successful and uncertain refund amounts held',{skip,timeout:180000},async()=>{
 const {startCrm,line}=await import('./helpers/crm-fixture.mjs'),{readFileSync,writeFileSync}=await import('node:fs');
 const site=await startCrm();try{
  const owner=await site.login('OWNER'),o=await site.checkout([line()]);let order=(await owner.get('/orders/'+o.id)).data.data;
  assert.equal((await owner.send('/orders/'+o.id+'/invoice',{version:order.version})).status,200);
  const inv=site.sql('SELECT * FROM rubizh_mono_invoices WHERE order_id='+o.id)[0];assert.equal((await site.webhook(inv)).status,200);
  const refund=async(amount,key)=>owner.send('/payments/'+inv.id+'/refund',{version:(await owner.get('/orders/'+o.id)).data.data.version,amount,request_id:key.repeat(32),reason:'Покупець погодив тестове часткове повернення'});
  assert.equal((await refund(1,'3')).status,201);
  const provider=readFileSync(site.dir+'/provider-fixture.php','utf8');writeFileSync(site.dir+'/provider-fixture.php',provider.replace("if($path==='invoice/cancel')return ['status'=>'success','amount'=>$body['amount'],'extRef'=>$body['extRef']];","if($path==='invoice/cancel')return ['status'=>'processing','amount'=>$body['amount'],'extRef'=>$body['extRef']];"));
  const pending=await refund(2,'4');assert.equal(pending.status,201);const op=pending.data.data;
  const before=site.sql('SELECT id,amount,status FROM rubizh_refund_operations ORDER BY id');
  const r=await site.webhook(inv,'reversed',{cancelList:[{extRef:op.ext_ref,amount:200,ccy:980,status:'success'},{extRef:op.ext_ref,amount:200,ccy:980,status:'failure'}]});
  assert.equal(r.status,200);assert.equal(r.data.parked,true,'contradictory facts must be parked before the first cancellation is applied');
  assert.deepEqual(site.sql('SELECT id,amount,status FROM rubizh_refund_operations ORDER BY id'),before,'preserve successful amount and processing hold');
  assert.equal(site.sql('SELECT status FROM rubizh_mono_invoices WHERE id='+inv.id)[0].status,'success');
  const next=await refund(Number(inv.amount)/100-1,'5');assert.equal(next.data.error.code,'REFUND_RECONCILIATION_REQUIRED','uncertain amount blocks an excessive follow-up request');
  assert.equal(site.sql('SELECT COUNT(*) n FROM rubizh_refund_operations')[0].n,2,'no new provider refund operation');
  assert.equal(site.sql(`SELECT COUNT(*) n FROM rubizh_np_audit WHERE order_id=${o.id} AND action='mono_event_rejected'`)[0].n,1);
 }finally{site.stop();}
});

test('stage-2 SP1: cancellation lists have a bounded list shape and unique, valid references before applying money states',{skip,timeout:180000},async()=>{
 const site=await fixture();try{
  const {id,inv}=await site.newInvoice(82);
  const cancellations=[null,{unexpected:[]},Array.from({length:101},(_,i)=>({extRef:'r'+i,amount:1,ccy:980,status:'success'})),[{extRef:'',amount:1,status:'success'}],[{extRef:'r',amount:0,status:'success'}],[{extRef:'r',amount:1,status:'success'},{extRef:'r',amount:1,status:'success'}]];
  for(const cancelList of cancellations){const out=php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${site.site}/auth/bootstrap.php';$db=shopStoreDatabase();$q=$db->prepare('SELECT * FROM rubizh_mono_invoices WHERE id=?');$q->execute([${inv.id}]);$i=$q->fetch(PDO::FETCH_ASSOC);$e=json_decode(${JSON.stringify(JSON.stringify({invoiceId:inv.invoice_id,status:'success',amount:+inv.amount,ccy:980,modifiedDate:new Date().toISOString(),cancelList}))},true);try{monoValidateEvent($e,$i);echo 'ACCEPTED';}catch(MonoEventRejected $e){echo 'REJECTED';}`);assert.equal(out.stdout,'REJECTED');}
  assert.equal(site.paid(id),'pending');
 }finally{site.stop();}
});

// Stage-2 SP3: an unsigned status read can observe success, but cannot roll signed terminal evidence back.
test('stage-2 PAY-01 worker: failure invoices remain in the polling queue until audited bank removal',{skip,timeout:180000},async()=>{
 const site=await fixture();try{
  const {id,inv}=await site.newInvoice(84);assert.equal((await site.hook(inv,{status:'failure'})).status,200);
  const poll=()=>JSON.parse(php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${site.site}/auth/bootstrap.php';$db=shopStoreDatabase();define('RUBIZH_MONO_TESTS',true);$GLOBALS['seen']=[];$GLOBALS['mono_test_transport']=function($p,$b){parse_str((string)parse_url($p,PHP_URL_QUERY),$q);$GLOBALS['seen'][]=$q['invoiceId']??'';throw new RuntimeException('Fixture offline');};monoWorkerRun($db);echo json_encode($GLOBALS['seen']);`).stdout);
  assert.deepEqual(poll(),[inv.invoice_id],'failure is a failed attempt, so the invoice must still be checked');
  site.sql(`INSERT INTO rubizh_np_audit(actor_id,action,order_id,shipment_id,note,created_at) VALUES('${'0'.repeat(32)}','mono_invoice_removed',${id},0,'${inv.invoice_id}',UTC_TIMESTAMP())`);
  assert.deepEqual(poll(),[],'audited bank removal lets the worker skip that failed invoice');
 }finally{site.stop();}
});
