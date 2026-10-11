// Release hardening 2026-10-11: regression tests for the confirmed defects in docs/release-hardening/03-DEFECT_REGISTER.md.
// Isolated MySQL fixture only; MonoPay is the local mock, no network, no production data.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {generateKeyPairSync,createSign} from 'node:crypto';
import {startSite,wire,publish,php,root} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
// A stale private config may still say COD is contracted; the code must refuse it anyway.
const config=`,'mono_mock'=>true,'environment'=>'staging','np_cod_contract_confirmed'=>true,'np_cod_service'=>'afterpayment'`;
const model=id=>wire.products.find(p=>p.id===id);
const selection=(sku='RUB-F0001',qty=1)=>({product_id:'m-jacket',color_id:model('m-jacket').colors.find(c=>c.variant_skus.includes(sku)).id,sku,qty});
const contact={name:'Тест Покупець',recipient:'Тест Покупець',phone:'+380671234567',city:'Київ',address:'Відділення 1',delivery_type:'branch'};
let serial=0;
function call(site,code){return php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${site.site}/auth/bootstrap.php';$db=shopStoreDatabase();${code}`);}
async function fixture({extra=''}={}){
 const site=await startSite({extraConfig:config+extra});
 try{
  const w=structuredClone(wire);const v=w.products.find(m=>m.id==='m-jacket').variants.find(v=>v.sku==='RUB-F0001');
  Object.assign(v,{stock:3,stock_quantity:3,stock_status:'CONFIRMED',availability_source:'QUANTITY',inventory_mode:'QUANTITY'});
  const p=await publish(site,w);assert.equal(p.status,200,JSON.stringify(p.data));
  const {publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  site.sql(`INSERT INTO meta(k,v) VALUES('mono_public_key','${Buffer.from(publicKey.export({type:'spki',format:'pem'})).toString('base64')}')`);
  site.webhook=(inv,status='success',amount=+inv.amount)=>{const raw=JSON.stringify({invoiceId:inv.invoice_id,status,amount,ccy:980,modifiedDate:new Date().toISOString()});return site.post('/shop/mono-webhook.php',raw,{'X-Sign':createSign('SHA256').update(raw).sign(privateKey).toString('base64')});};
  return site;
 }catch(e){site.stop();throw e;}
}
async function shopper(site){const r=await fetch(site.base+'/shop/customer.php');return {headers:{Cookie:r.headers.get('set-cookie').split(';')[0]},csrf:(await r.json()).csrf};}
async function checkout(site,buyer,payment='card',lines=[selection()]){
 const q=await site.post('/shop/checkout-quote.php',{csrf:buyer.csrf,lines,payment:'card'},buyer.headers);assert.equal(q.status,200,JSON.stringify(q.data));
 const body={csrf:buyer.csrf,request_id:(++serial).toString(16).padStart(32,'0'),contact,lines,expected_total:q.data.quote.total,catalog_version:q.data.quote.catalog_version};
 if(payment!==null)body.payment=payment;// null = field omitted
 return site.post('/shop/order.php',body,buyer.headers);
}
const orders=site=>+site.sql('SELECT COUNT(*) n FROM rubizh_customer_orders')[0].n;
const reservations=site=>+site.sql('SELECT COUNT(*) n FROM rubizh_stock_reservations')[0].n;

// D-02: cash on delivery is forbidden in every path, even when a stale private config still enables it.
test('COD is refused by the server for every spelling and never creates an order or a reservation',{skip,timeout:120000},async()=>{
 const site=await fixture();try{
  for(const payment of ['cod','COD',' cod','cash_on_delivery','afterpayment','',null]){
   const buyer=await shopper(site),before=[orders(site),reservations(site)];
   const r=await checkout(site,buyer,payment);
   assert.ok(r.status>=400&&r.status<500,`payment=${JSON.stringify(payment)} must be refused, got ${r.status} ${JSON.stringify(r.data)}`);
   assert.deepEqual([orders(site),reservations(site)],before,`payment=${JSON.stringify(payment)} must not create rows`);
  }
  const ok=await checkout(site,await shopper(site),'card');assert.equal(ok.status,200,'card checkout still works: '+JSON.stringify(ok.data));
  const settings=await (await fetch(site.base+'/shop/customer.php')).json();
  assert.equal('np_cod_enabled' in settings,false,'storefront settings no longer advertise COD');
 }finally{site.stop();}
});

test('Nova Poshta never receives a cash-on-delivery amount and a historical COD order cannot get a TTN',{skip,timeout:120000},async()=>{
 const site=await fixture({extra:",'np_ttn_enabled'=>true"});try{
  const shipment="['package_json'=>json_encode(['places'=>[['weight'=>1,'length'=>30,'width'=>20,'height'=>10]]]),'declared_value'=>1000,'operation_key'=>'k1']";
  const props=JSON.parse(call(site,`echo json_encode(npSaveProperties(${shipment},['city_ref'=>'c','warehouse_ref'=>'w'],['ref'=>'s','contact_ref'=>'sc','phone'=>'380671234567'],['type'=>'branch','city_ref'=>'rc','warehouse_ref'=>'rw'],['payment'=>'cod','phone'=>'+380671234567'],'r','rc','rw'));`).stdout);
  assert.equal('AfterpaymentOnGoodsCost' in props,false,'no afterpayment amount is ever sent to NP');
  assert.equal('BackwardDeliveryData' in props,false,'no backward delivery (COD) is ever sent to NP');
  const refused=JSON.parse(call(site,`try{npAssertReady(['status'=>'confirmed','payment_status'=>'cod','contact'=>['payment'=>'cod','np_delivery'=>[],'recipient'=>'Тест Покупець']],['availability_confirmed'=>1],[],[],['supplier_code'=>'m_vin','status'=>'draft','package_json'=>'{}','declared_value'=>1]);echo json_encode(['ok'=>true]);}catch(Throwable $e){echo json_encode(['ok'=>false,'message'=>$e->getMessage()]);}`).stdout);
  assert.equal(refused.ok,false);assert.match(refused.message,/Післяплат/u);
 }finally{site.stop();}
});

// D-03: a lost signed webhook must not leave a paid order PENDING forever with its stock held.
async function startInvoice(site,buyer,id){const r=await site.post('/shop/payment-start.php',{csrf:buyer.csrf,order_id:id},buyer.headers);assert.equal(r.status,200,JSON.stringify(r.data));return site.sql('SELECT * FROM rubizh_mono_invoices WHERE order_id='+id)[0];}
// The bank status read is the server-to-server, token-authenticated monobank API; here a deterministic transport.
const bank=(inv,over={})=>`define('RUBIZH_MONO_TESTS',true);$GLOBALS['mono_test_transport']=fn($p,$b)=>json_decode(${JSON.stringify(JSON.stringify({invoiceId:inv.invoice_id,status:'success',amount:+inv.amount,ccy:980,reference:inv.reference,modifiedDate:'2026-10-11T10:00:00Z',...over}))},true);`;
const state=(site,id)=>({payment:site.sql('SELECT payment_status FROM rubizh_customer_orders WHERE id='+id)[0].payment_status,invoice:site.sql('SELECT status FROM rubizh_mono_invoices WHERE order_id='+id)[0].status,reservation:site.sql('SELECT status FROM rubizh_stock_reservations WHERE order_id='+id).map(r=>r.status).join(),confirmed:+site.sql(`SELECT COUNT(*) n FROM rubizh_np_audit WHERE order_id=${id} AND action='mono_status_confirmed'`)[0].n});
test('lost MonoPay webhook: awaiting_webhook resolves from an authenticated bank status read after the grace period, exactly once',{skip,timeout:180000},async()=>{
 const site=await fixture();try{
  const buyer=await shopper(site),o=await checkout(site,buyer);assert.equal(o.status,200,JSON.stringify(o.data));const id=o.data.order.id,inv=await startInvoice(site,buyer,id);
  const refresh=over=>call(site,bank(inv,over)+`$q=$db->prepare('SELECT * FROM rubizh_mono_invoices WHERE order_id=?');$q->execute([${id}]);monoRefresh($db,$q->fetch(PDO::FETCH_ASSOC));`);
  const worker=over=>call(site,bank(inv,over)+'monoWorkerRun($db);');
  refresh();assert.deepEqual(state(site,id),{payment:'pending',invoice:'awaiting_webhook',reservation:'ACTIVE',confirmed:0},'browser return alone never marks paid');
  worker();assert.equal(state(site,id).payment,'pending','within the grace period the signed webhook is still awaited');
  site.sql(`UPDATE rubizh_mono_invoices SET updated_at=UTC_TIMESTAMP()-INTERVAL 20 MINUTE WHERE order_id=${id}`);
  worker({amount:+inv.amount-100});assert.equal(state(site,id).payment,'pending','a status read with another amount is rejected');
  worker({reference:'another-order'});assert.equal(state(site,id).payment,'pending','a status read for another reference is rejected');
  worker({status:'processing'});assert.equal(state(site,id).payment,'pending','only a final success confirms');
  worker();assert.deepEqual(state(site,id),{payment:'paid',invoice:'success',reservation:'COMMITTED',confirmed:1});
  worker();worker();assert.deepEqual(state(site,id),{payment:'paid',invoice:'success',reservation:'COMMITTED',confirmed:1},'repeated polling is idempotent');
  assert.equal((await site.webhook(inv)).status,200,'the late signed webhook is accepted');
  assert.deepEqual(state(site,id),{payment:'paid',invoice:'success',reservation:'COMMITTED',confirmed:1},'and changes nothing');
  assert.equal(+site.sql('SELECT COUNT(*) n FROM rubizh_customer_orders')[0].n,1,'one payment, one order');
 }finally{site.stop();}
});

// D-04: the bank charges the invoice amount; the order total must not change while that invoice can still be paid.
const owner='a'.repeat(32);
test('an accepted price change is refused while a card invoice is open, and allowed once it is closed',{skip,timeout:180000},async()=>{
 const site=await fixture({extra:`,'staff_roles'=>['${owner}'=>'OWNER']`});try{
  const buyer=await shopper(site),o=await checkout(site,buyer);assert.equal(o.status,200,JSON.stringify(o.data));const id=o.data.order.id,inv=await startInvoice(site,buyer,id);
  const changed=structuredClone(wire),v=changed.products.find(p=>p.id==='m-jacket').variants.find(v=>v.sku==='RUB-F0001');v.price=v.site_price=2990;
  assert.equal((await publish(site,changed)).status,200);
  const confirm=hash=>JSON.parse(call(site,`try{npConfirm($db,${id},'${owner}',true,false,'',${hash?`['quote_hash'=>'${hash}','reason'=>'Покупець погодив нову ціну']`:'[]'});echo json_encode(['ok'=>true]);}catch(Throwable $e){echo json_encode(['ok'=>false,'code'=>$e instanceof ShopOrderConflict?$e->reason:null,'details'=>$e instanceof ShopOrderConflict?$e->details:null,'message'=>$e->getMessage()]);}`).stdout);
  const conflict=confirm();assert.equal(conflict.code,'PRICE_CHANGED');
  const open=confirm(conflict.details.quote_hash);assert.equal(open.ok,false,'re-quote with an open invoice is refused');assert.equal(open.code,'INVOICE_OPEN');
  assert.equal(+site.sql('SELECT total FROM rubizh_customer_orders WHERE id='+id)[0].total,2860,'order total still equals the open invoice');
  assert.equal(+site.sql('SELECT amount FROM rubizh_mono_invoices WHERE order_id='+id)[0].amount,286000);
  assert.equal((await site.webhook(inv,'expired')).status,200);
  site.sql(`UPDATE rubizh_customer_orders SET status='confirmed' WHERE id=${id}`);// owner reopens the expired order for the new price
  const closed=confirm(conflict.details.quote_hash);assert.equal(closed.ok,true,'after the invoice is closed the owner may accept: '+JSON.stringify(closed));
  assert.equal(+site.sql('SELECT total FROM rubizh_customer_orders WHERE id='+id)[0].total,2990);
 }finally{site.stop();}
});

// D-13: a retry must never leave two payable invoices for one order.
test('payment retry after a failed invoice first invalidates it at the bank; if that fails no second invoice is created',{skip,timeout:180000},async()=>{
 const site=await fixture({extra:`,'staff_roles'=>['${owner}'=>'OWNER']`});try{
  const buyer=await shopper(site),o=await checkout(site,buyer);assert.equal(o.status,200,JSON.stringify(o.data));const id=o.data.order.id,a=await startInvoice(site,buyer,id);
  assert.equal((await site.webhook(a,'failure')).status,200);
  const retry=removeFails=>JSON.parse(call(site,`define('RUBIZH_MONO_TESTS',true);$GLOBALS['calls']=[];$GLOBALS['mono_test_transport']=function($p,$b){$GLOBALS['calls'][]=[$p,$b];if($p==='invoice/remove'&&${removeFails?'true':'false'})throw new RuntimeException('bank refused');if($p==='invoice/create')return ['invoiceId'=>'retry'.bin2hex(random_bytes(4)),'pageUrl'=>'https://pay.mbnk.biz/retry'];return [];};try{monoCreate($db,${id},'${owner}');$ok=true;}catch(Throwable $e){$ok=false;}echo json_encode(['ok'=>$ok,'calls'=>$GLOBALS['calls']]);`).stdout);
  const refused=retry(true);
  assert.equal(refused.ok,false,'no new invoice while the old one may still be payable');
  assert.deepEqual(refused.calls.map(c=>c[0]),['invoice/remove']);assert.equal(refused.calls[0][1].invoiceId,a.invoice_id);
  assert.equal(+site.sql('SELECT COUNT(*) n FROM rubizh_mono_invoices WHERE order_id='+id)[0].n,1);
  const done=retry(false);
  assert.equal(done.ok,true,JSON.stringify(done));assert.deepEqual(done.calls.map(c=>c[0]),['invoice/remove','invoice/create'],'invalidate first, then create');
  assert.equal(+site.sql('SELECT COUNT(*) n FROM rubizh_mono_invoices WHERE order_id='+id)[0].n,2);
  const again=retry(false);assert.deepEqual(again.calls.map(c=>c[0]),[],'the open new invoice is reused; nothing else is created or removed');
 }finally{site.stop();}
});

test('storefront code offers no COD option, no COD default and no COD wording for new orders',()=>{
 const html=readFileSync(path.join(root,'index.html'),'utf8');
 const client=html.match(/src="\/assets\/(shop-client\.[^"?]+\.js)/)[1];
 const js=readFileSync(path.join(root,'assets',client),'utf8');
 assert.doesNotMatch(js,/pay:\s*["']cod["']/,'default payment is not COD');
 assert.doesNotMatch(js,/k:\s*["']cod["']/,'no COD payment option in any checkout variant');
 assert.doesNotMatch(js,/npCodEnabled|np_cod_enabled/,'no COD feature switch on the storefront');
 for(const file of ['shop/order.php','shop/customer.php','shop/np-fulfillment.php','shop/pim-v3-checkout.php','api/config.sample.php'])
  assert.doesNotMatch(readFileSync(path.join(root,file),'utf8'),/np_cod_|AfterpaymentOnGoodsCost|BackwardDeliveryData/,file+' has no COD integration');
});
