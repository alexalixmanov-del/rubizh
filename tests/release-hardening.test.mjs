// Release hardening 2026-10-11: regression tests for the confirmed defects in docs/release-hardening/03-DEFECT_REGISTER.md.
// Isolated MySQL fixture only; MonoPay is the local mock, no network, no production data.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
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
  // After a refused removal the bank status is read; only a final non-payable status would let a new invoice through.
  assert.deepEqual(refused.calls.map(c=>c[0].split('?')[0]),['invoice/remove','invoice/status']);assert.equal(refused.calls[0][1].invoiceId,a.invoice_id);
  assert.equal(+site.sql('SELECT COUNT(*) n FROM rubizh_mono_invoices WHERE order_id='+id)[0].n,1);
  const done=retry(false);
  assert.equal(done.ok,true,JSON.stringify(done));assert.deepEqual(done.calls.map(c=>c[0]),['invoice/remove','invoice/create'],'invalidate first, then create');
  assert.equal(+site.sql('SELECT COUNT(*) n FROM rubizh_mono_invoices WHERE order_id='+id)[0].n,2);
  const again=retry(false);assert.deepEqual(again.calls.map(c=>c[0]),[],'the open new invoice is reused; nothing else is created or removed');
 }finally{site.stop();}
});

// Owner rule (2026-10-11): in stock → online MonoPay; under order → manager confirmation → invoice → online MonoPay.
// Production runs the legacy catalog path (PIM v3 off), so the rule is checked on a legacy product.
test('legacy preorder: order waits for the manager, confirmation unlocks the MonoPay invoice; nothing is payable before',{skip,timeout:180000},async()=>{
 const site=await startSite({enableV3:false,extraConfig:`,'mono_mock'=>true,'environment'=>'staging','staff_roles'=>['${owner}'=>'OWNER']`});try{
  const product={id:'leg-pouch',slug:'leg-pouch',name:'Підсумок тестовий',brand:'Тест',category:'Підсумки',category_path:['Підсумки'],description:'Тест',photos:['https://example.com/a.jpg'],
   variants:[{sku:'L-ORD',size:'Один розмір',size_display:'Один розмір',color:'Олива',price:500,availability:'order',lead_time:'7 днів',preorder_confirmed:true},{sku:'L-IN',size:'Один розмір',size_display:'Один розмір',color:'Чорний',price:450,availability:'in',stock:5}]};
  call(site,`require_once '${site.site}/api/lib.php';save_product($db,json_decode(${JSON.stringify(JSON.stringify(product))},true));`);
  const buyer=await shopper(site),lines=[{product_id:'leg-pouch',sku:'L-ORD',qty:1,price_mode:'retail'}];
  const q=await site.post('/shop/checkout-quote.php',{csrf:buyer.csrf,lines,payment:'card'},buyer.headers);assert.equal(q.status,200,JSON.stringify(q.data));
  const o=await site.post('/shop/order.php',{csrf:buyer.csrf,request_id:'f'.repeat(32),contact,payment:'card',lines,expected_total:q.data.quote.total,catalog_version:q.data.quote.catalog_version},buyer.headers);
  assert.equal(o.status,200,JSON.stringify(o.data));const id=o.data.order.id;
  assert.equal(site.sql('SELECT status FROM rubizh_customer_orders WHERE id='+id)[0].status,'new','a preorder waits for the manager');
  const early=await site.post('/shop/payment-start.php',{csrf:buyer.csrf,order_id:id},buyer.headers);assert.notEqual(early.status,200,'no invoice before confirmation');
  const confirmed=JSON.parse(call(site,`try{npConfirm($db,${id},'${owner}',true,false,'');echo json_encode(['ok'=>true]);}catch(Throwable $e){echo json_encode(['ok'=>false,'code'=>$e instanceof ShopOrderConflict?$e->reason:null,'message'=>$e->getMessage()]);}`).stdout);
  assert.equal(confirmed.ok,true,'manager confirmation of a preorder must succeed: '+JSON.stringify(confirmed));
  const inv=await site.post('/shop/payment-start.php',{csrf:buyer.csrf,order_id:id},buyer.headers);assert.equal(inv.status,200,'invoice after confirmation: '+JSON.stringify(inv.data));
  assert.equal(+site.sql('SELECT amount FROM rubizh_mono_invoices WHERE order_id='+id)[0].amount,50000);
 }finally{site.stop();}
});

// D-10: the customer cabinet shows a TTN only when a real one exists for a live shipment.
test('customer cabinet shows only valid TTNs of live shipments; cancelled, returned or malformed numbers stay hidden',{skip,timeout:180000},async()=>{
 const site=await fixture();try{
  const o=await checkout(site,await shopper(site));assert.equal(o.status,200,JSON.stringify(o.data));const id=o.data.order.id,customer='c'.repeat(32);
  site.sql(`INSERT INTO rubizh_accounts(id,email,first_name,last_name,created_at,updated_at) VALUES('${customer}','buyer@fixture.test','Тест','Покупець',UTC_TIMESTAMP(),UTC_TIMESTAMP())`);
  site.sql(`INSERT INTO rubizh_account_orders(order_id,customer_id) VALUES(${id},'${customer}')`);
  for(const [ttn,status] of [['20450000000001','created'],['20450000000002','cancelled'],['20450000000004','returned'],['TEMP-1','created'],['2045','sent']])
   site.sql(`INSERT INTO rubizh_order_shipments(order_id,supplier_code,tracking_number,status,created_at,updated_at) VALUES(${id},'m_vin','${ttn}','${status}',UTC_TIMESTAMP(),UTC_TIMESTAMP())`);
  const order=JSON.parse(call(site,`echo json_encode(customerOrder('${customer}',${id}));`).stdout);
  // auth/order-detail.php renders exactly $order['shipments'].
  assert.deepEqual(order.shipments.map(s=>s.tracking_number),['20450000000001']);
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

// D-20: a signed callback that can never become valid (amount/currency/status) is acknowledged once and parked for
// a manager, instead of 503 that makes the bank retry it forever. An invoice not yet recorded stays retryable.
test('signed MonoPay callback with a permanent mismatch is acknowledged, audited and changes no money state',{skip,timeout:180000},async()=>{
 const site=await fixture();try{
  const buyer=await shopper(site),o=await checkout(site,buyer);assert.equal(o.status,200,JSON.stringify(o.data));const id=o.data.order.id,inv=await startInvoice(site,buyer,id);
  const bad=await site.webhook(inv,'success',+inv.amount-100);assert.equal(bad.status,200,'no endless bank retries for a permanent mismatch');
  assert.deepEqual(state(site,id),{payment:'pending',invoice:'created',reservation:'ACTIVE',confirmed:0},'a mismatched amount never marks paid');
  assert.equal(+site.sql(`SELECT COUNT(*) n FROM rubizh_np_audit WHERE order_id=${id} AND action='mono_event_rejected'`)[0].n,1,'parked for the manager');
  assert.equal((await site.webhook({...inv,invoice_id:'not-recorded-yet'})).status,503,'unknown invoice stays retryable');
  assert.equal((await site.webhook(inv)).status,200);assert.equal(state(site,id).payment,'paid','the valid callback still pays');
 }finally{site.stop();}
});

// D-18: the same cart submitted from a second tab must not create a second order.
test('two tabs submitting the same checkout create one order and both show its receipt',{skip,timeout:180000},async()=>{
 const {chromium}=await import('playwright');
 const site=await startSite({enableV3:false,extraConfig:",'mono_mock'=>true,'environment'=>'staging','staging_allow_loopback'=>true"});let browser;
 try{
  const p={id:'tab-cap',slug:'tab-cap',canonical_category_id:'clothing_headwear',name:'Кепка Вкладки',brand:'QA',category:'Одяг та форма / Головні убори',category_path:['Одяг та форма','Головні убори'],description:'Тест.',photos:['https://img.test/cap.png'],
   variants:['M','L'].map(size=>({sku:'TAB-'+size,color:'Олива',size,size_display:size,price:900,availability:'in',stock:5,photos:['https://img.test/cap.png']}))};
  php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${site.site}/auth/bootstrap.php';require_once '${site.site}/api/lib.php';save_product(db(),json_decode(${JSON.stringify(JSON.stringify(p))},true));`);
  writeFileSync(site.site+'/router.php',`<?php $p=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);if(str_starts_with($p,'/api/')){require __DIR__.'/api/index.php';return;}if($p==='/'||preg_match('~^/(?:product|catalog)(?:/.*)?$~',$p)){require __DIR__.'/storefront.php';return;}return false;`);
  browser=await chromium.launch({executablePath:(process.env.CHROMIUM_PATH||'/usr/bin/chromium'),args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1280,height:900}});await context.route(/^https:\/\/pay\.(?:mbnk\.biz|monobank\.ua)\//,r=>r.fulfill({contentType:'text/html',body:'<title>MonoPay stub</title>'}));// never leave the machine
  await context.route('https://img.test/**',r=>r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64')}));
  const a=await context.newPage();await a.goto(site.base+'/product/tab-cap');
  await a.locator('[data-size-grid]').getByText('M',{exact:true}).click();await a.getByRole('button',{name:/До кошика/}).first().click();
  await a.waitForFunction(()=>JSON.parse(localStorage.getItem('rubizh.cart')||'[]').length===1);
  const b=await context.newPage();
  const fill=async page=>{await page.goto(site.base+'/#cart');const c=page.getByRole('button',{name:/Оформити/}).first();if(await c.count())await c.click();
   await page.locator('input[name="name"]').fill('Тест Покупець');await page.locator('input[name="phone"]').fill('+380671234567');
   await page.locator('input[name="city"]').fill('Київ');await page.locator('input[name="address"]').fill('Відділення 1');};
  await fill(a);await fill(b);// tab B has the cart loaded before tab A submits
  // Q-7: a confirmed-stock card order hands off to MonoPay (stub) on its own; wait for it before the next navigation.
  const submit=async page=>{const r=page.waitForResponse(x=>x.url().endsWith('/shop/order.php'));await page.getByRole('button',{name:/Підтвердити замовлення/}).first().click();const j=await (await r).json();if(j.ok)await page.waitForURL(/^https:\/\/pay\.mbnk\.biz\//,{timeout:15000});return j;};
  const first=await submit(a),second=await submit(b);
  assert.equal(first.ok,true,JSON.stringify(first));assert.equal(second.ok,true,JSON.stringify(second));
  assert.equal(+site.sql('SELECT COUNT(*) n FROM rubizh_customer_orders')[0].n,1,'one order for one checkout');
  assert.equal(second.order.number,first.order.number,'the second tab shows the same order');
 }finally{await browser?.close();site.stop();}
});

// Review finding (open point on D-13): a refused invoice/remove must not block payment forever, nor allow paying twice.
test('a refused invoice/remove is settled by the bank status: an expired invoice allows the retry; a still-failed one stays blocked and is flagged',{skip,timeout:180000},async()=>{
 const site=await fixture({extra:`,'staff_roles'=>['${owner}'=>'OWNER']`});try{
  const buyer=await shopper(site),o=await checkout(site,buyer);assert.equal(o.status,200,JSON.stringify(o.data));const id=o.data.order.id,a=await startInvoice(site,buyer,id);
  assert.equal((await site.webhook(a,'failure')).status,200);
  const retry=status=>JSON.parse(call(site,`define('RUBIZH_MONO_TESTS',true);$GLOBALS['calls']=[];$GLOBALS['mono_test_transport']=function($p,$b){$GLOBALS['calls'][]=$p;if($p==='invoice/remove')throw new RuntimeException('bank refused');if(str_starts_with($p,'invoice/status'))return ['invoiceId'=>'${a.invoice_id}','status'=>'${status}','amount'=>${+a.amount},'ccy'=>980,'reference'=>'${a.reference}','modifiedDate'=>'2026-10-11T10:00:00Z'];if($p==='invoice/create')return ['invoiceId'=>'retry'.bin2hex(random_bytes(4)),'pageUrl'=>'https://pay.mbnk.biz/retry'];return [];};try{monoCreate($db,${id},'${owner}');$ok=true;$err='';}catch(Throwable $e){$ok=false;$err=$e->getMessage();}echo json_encode(['ok'=>$ok,'calls'=>$GLOBALS['calls'],'error'=>$err]);`).stdout);
  const audit=action=>+site.sql(`SELECT COUNT(*) n FROM rubizh_np_audit WHERE order_id=${id} AND action='${action}'`)[0].n;
  const blocked=retry('failure');
  assert.equal(blocked.ok,false,'a failed invoice the bank would not close may still be payable: no second invoice');
  assert.equal(audit('mono_invoice_remove_refused'),1,'the manager sees why the customer cannot pay');
  assert.doesNotMatch(blocked.error,/кілька хвилин/,'no false promise that waiting helps');
  assert.equal(+site.sql('SELECT COUNT(*) n FROM rubizh_mono_invoices WHERE order_id='+id)[0].n,1);
  const expired=retry('expired');
  assert.equal(expired.ok,true,JSON.stringify(expired));assert.deepEqual(expired.calls.map(c=>c.split('?')[0]),['invoice/remove','invoice/status','invoice/create']);
  assert.equal(audit('mono_invoice_final_not_removed'),1);
 }finally{site.stop();}
});

// Review finding: invoices stuck in awaiting_webhook (frozen updated_at) must not starve newer invoices in the worker.
test('the MonoPay worker still refreshes new invoices when many old ones wait for a webhook',{skip,timeout:180000},async()=>{
 const site=await fixture();try{
  const buyer=await shopper(site),o=await checkout(site,buyer);assert.equal(o.status,200,JSON.stringify(o.data));const id=o.data.order.id,fresh=await startInvoice(site,buyer,id);
  for(let i=0;i<30;i++)site.sql(`INSERT INTO rubizh_mono_invoices(order_id,invoice_id,reference,amount,status,modified_at,created_at,updated_at) VALUES(${id},'stuck${i}','ref-stuck-${i}',100,'awaiting_webhook','',UTC_TIMESTAMP()-INTERVAL 2 DAY,UTC_TIMESTAMP()-INTERVAL 2 DAY)`);
  const read=JSON.parse(call(site,`define('RUBIZH_MONO_TESTS',true);$GLOBALS['seen']=[];$GLOBALS['mono_test_transport']=function($p,$b){parse_str((string)parse_url($p,PHP_URL_QUERY),$q);$GLOBALS['seen'][]=$q['invoiceId']??'';throw new RuntimeException('offline');};monoWorkerRun($db);echo json_encode($GLOBALS['seen']);`).stdout);
  assert.ok(read.includes(fresh.invoice_id),'the new invoice is polled: '+read.length+' reads');
 }finally{site.stop();}
});

// Review finding P2: the cross-tab key must not swallow a deliberate identical purchase made after the first one succeeded.
test('buying the same item again after a successful order creates a new order, while a stale second tab still gets the first one',{skip,timeout:240000},async()=>{
 const {chromium}=await import('playwright');
 const site=await startSite({enableV3:false,extraConfig:",'mono_mock'=>true,'environment'=>'staging','staging_allow_loopback'=>true"});let browser;
 try{
  const p={id:'tab-cap',slug:'tab-cap',canonical_category_id:'clothing_headwear',name:'Кепка Вкладки',brand:'QA',category:'Одяг та форма / Головні убори',category_path:['Одяг та форма','Головні убори'],description:'Тест.',photos:['https://img.test/cap.png'],
   variants:['M','L'].map(size=>({sku:'TAB-'+size,color:'Олива',size,size_display:size,price:900,availability:'in',stock:5,photos:['https://img.test/cap.png']}))};
  php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${site.site}/auth/bootstrap.php';require_once '${site.site}/api/lib.php';save_product(db(),json_decode(${JSON.stringify(JSON.stringify(p))},true));`);
  writeFileSync(site.site+'/router.php',`<?php $p=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);if(str_starts_with($p,'/api/')){require __DIR__.'/api/index.php';return;}if($p==='/'||preg_match('~^/(?:product|catalog)(?:/.*)?$~',$p)){require __DIR__.'/storefront.php';return;}return false;`);
  browser=await chromium.launch({executablePath:(process.env.CHROMIUM_PATH||'/usr/bin/chromium'),args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1280,height:900}});await context.route(/^https:\/\/pay\.(?:mbnk\.biz|monobank\.ua)\//,r=>r.fulfill({contentType:'text/html',body:'<title>MonoPay stub</title>'}));// never leave the machine
  await context.route('https://img.test/**',r=>r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64')}));
  const a=await context.newPage();
  const add=async page=>{await page.goto(site.base+'/product/tab-cap');await page.locator('[data-size-grid]').getByText('M',{exact:true}).click();await page.getByRole('button',{name:/До кошика/}).first().click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('rubizh.cart')||'[]').length===1);};
  const fill=async page=>{await page.goto(site.base+'/#cart');const c=page.getByRole('button',{name:/Оформити/}).first();if(await c.count())await c.click();
   await page.locator('input[name="name"]').fill('Тест Покупець');await page.locator('input[name="phone"]').fill('+380671234567');
   await page.locator('input[name="city"]').fill('Київ');await page.locator('input[name="address"]').fill('Відділення 1');};
  // Q-7: a confirmed-stock card order hands off to MonoPay (stub) on its own; wait for it before the next navigation.
  const submit=async page=>{const r=page.waitForResponse(x=>x.url().endsWith('/shop/order.php'));await page.getByRole('button',{name:/Підтвердити замовлення/}).first().click();const j=await (await r).json();if(j.ok)await page.waitForURL(/^https:\/\/pay\.mbnk\.biz\//,{timeout:15000});return j;};
  await add(a);const b=await context.newPage();await fill(a);await fill(b);
  const first=await submit(a);assert.equal(first.ok,true,JSON.stringify(first));
  const stale=await submit(b);assert.equal(stale.order.number,first.order.number,'the stale tab still gets the same order');
  await add(a);await fill(a);const second=await submit(a);
  assert.equal(second.ok,true,JSON.stringify(second));assert.notEqual(second.order.number,first.order.number,'a new purchase is a new order');
  assert.equal(+site.sql('SELECT COUNT(*) n FROM rubizh_customer_orders')[0].n,2);
 }finally{await browser?.close();site.stop();}
});

// Integration safety: sandbox invoices must not point monobank at the production webhook.
test('MonoPay callback and return URLs come from public_base_url; production stays the default',{skip,timeout:180000},async()=>{
 for(const [extra,base] of [['','https://rubizh.shop'],[",'public_base_url'=>'https://sandbox.rubizh.test'",'https://sandbox.rubizh.test'],[",'public_base_url'=>'https://sandbox.rubizh.test','environment'=>'production','mono_activation_confirmed'=>true,'mono_token'=>'fixture-token-not-sent'",'https://rubizh.shop']]){// outside staging the override is ignored
  const site=await fixture({extra:`,'staff_roles'=>['${owner}'=>'OWNER']`+extra});try{
   const buyer=await shopper(site),o=await checkout(site,buyer);assert.equal(o.status,200,JSON.stringify(o.data));
   const body=JSON.parse(call(site,`define('RUBIZH_MONO_TESTS',true);$GLOBALS['mono_test_transport']=function($p,$b){if($p==='invoice/create'){$GLOBALS['body']=$b;return ['invoiceId'=>'urlcheck','pageUrl'=>'https://pay.mbnk.biz/urlcheck'];}return [];};try{monoCreate($db,${o.data.order.id},'${owner}');}catch(Throwable $e){echo json_encode(['error'=>get_class($e).': '.$e->getMessage()]);exit;}echo json_encode($GLOBALS['body']);`).stdout);
   assert.equal(body.error,undefined,body.error);assert.equal(body.webHookUrl,base+'/shop/mono-webhook.php');assert.match(body.redirectUrl,new RegExp('^'+base.replace(/[.]/g,'\\.')+'/shop/payment-return\\.php\\?invoice=\\d+$'));
  }finally{site.stop();}
 }
});

// D-40: invalid Nova Poshta directory input is the customer's mistake (400 + reason), not a provider outage (503).
test('Nova Poshta directory reports invalid input as 400 with its reason, without calling the provider',{skip,timeout:120000},async()=>{
 const site=await startSite({enableV3:false,extraConfig:",'nova_poshta_api_key'=>'fixture-key-not-used'"});
 try{
  for(const [qs,reason] of [['kind=cities&q='+encodeURIComponent('а'.repeat(81)),/надто довгий/],['kind=warehouses&type=drone&city_ref=00000000-0000-0000-0000-000000000000&q=1',/спосіб доставки/],['kind=unknown',/Невідомий довідник/]]){
   const r=await fetch(site.base+'/shop/np-directory.php?'+qs),j=await r.json();
   assert.equal(r.status,400,qs+' → '+JSON.stringify(j));assert.match(j.error,reason);
  }
 }finally{site.stop();}
});

// Review finding on D-40: a well-formed but unknown city is the customer's choice problem (400), not an outage (503).
test('Nova Poshta directory: an unknown city reference is a 400 with a reason',{skip,timeout:120000},async()=>{
 const site=await startSite({enableV3:false,extraConfig:",'nova_poshta_api_key'=>'fixture-key-not-used'"});
 try{
  const out=php(`define('RUBIZH_NP_TESTS',true);$GLOBALS['np_test_transport']=fn($m,$c,$p)=>[];$_GET=['kind'=>'warehouses','type'=>'branch','city_ref'=>'00000000-0000-0000-0000-000000000000','q'=>'1'];$_SERVER['REQUEST_METHOD']='GET';require '${site.site}/shop/np-directory.php';`,{allowFail:true}).stdout;
  const j=JSON.parse(out.slice(out.indexOf('{')));assert.equal(j.ok,false);assert.match(j.error,/не знайдено/i);
 }finally{site.stop();}
});
