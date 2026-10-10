import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createSign} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {startSite,wire,publish,php,phpArgs,phpEnv,runtime,root} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const owner='a'.repeat(32),manager='b'.repeat(32),logistics='c'.repeat(32),reader='d'.repeat(32);
const config=`,'mono_mock'=>true,'environment'=>'staging','staff_roles'=>['${owner}'=>'OWNER','${manager}'=>'MANAGER','${logistics}'=>'LOGISTICS','${reader}'=>'READ_ONLY']`;
const model=id=>wire.products.find(p=>p.id===id);
const selection=(sku='RUB-F0001',qty=1)=>({product_id:'m-jacket',color_id:model('m-jacket').colors.find(c=>c.variant_skus.includes(sku)).id,sku,qty});
const contact={name:'Тест Покупець',recipient:'Тест Покупець',phone:'+380671234567',city:'Київ',address:'Відділення 1',delivery_type:'branch'};
let serial=0;
function call(site,code){return php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${site.site}/auth/bootstrap.php';$db=shopStoreDatabase();${code}`);}
function outcome(site,code){return JSON.parse(call(site,`try{${code};echo json_encode(['ok'=>true]);}catch(Throwable $e){echo json_encode(['ok'=>false,'class'=>get_class($e),'code'=>$e instanceof ShopOrderConflict?$e->reason:null,'details'=>$e instanceof ShopOrderConflict?$e->details:null,'message'=>$e->getMessage()]);}`).stdout);}
async function fixture({quantity=1,custom}={}){
 const site=await startSite({extraConfig:config});
 try{
  const w=structuredClone(wire);const v=w.products.find(m=>m.id==='m-jacket').variants.find(v=>v.sku==='RUB-F0001');
  Object.assign(v,{stock:quantity,stock_quantity:quantity,stock_status:'CONFIRMED',availability_source:'QUANTITY',inventory_mode:'QUANTITY'});
  if(custom)custom(w);
  const p=await publish(site,w);assert.equal(p.status,200,JSON.stringify(p.data));
  const {publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  site.sql(`INSERT INTO meta(k,v) VALUES('mono_public_key','${Buffer.from(publicKey.export({type:'spki',format:'pem'})).toString('base64')}')`);
  site.webhook=async(inv,status='success',rawOverride)=>{
   const raw=rawOverride||JSON.stringify({invoiceId:inv.invoice_id,status,amount:+inv.amount,ccy:980,modifiedDate:new Date().toISOString()});
   const signature=createSign('SHA256').update(raw).sign(privateKey).toString('base64');
   return site.post('/shop/mono-webhook.php',raw,{'X-Sign':signature});
  };
  site.signed=(inv,status='success')=>{const raw=JSON.stringify({invoiceId:inv.invoice_id,status,amount:+inv.amount,ccy:980,modifiedDate:new Date().toISOString()});return {raw,signature:createSign('SHA256').update(raw).sign(privateKey).toString('base64')};};
  return site;
 }catch(e){site.stop();throw e;}
}
async function shopper(site){const r=await fetch(site.base+'/shop/customer.php');return {headers:{Cookie:r.headers.get('set-cookie').split(';')[0]},csrf:(await r.json()).csrf};}
async function checkout(site,buyer,lines=[selection()],key=(++serial).toString(16).padStart(32,'0')){
 const q=await site.post('/shop/checkout-quote.php',{csrf:buyer.csrf,lines,payment:'card'},buyer.headers);
 if(q.status!==200)return q;
 return site.post('/shop/order.php',{csrf:buyer.csrf,request_id:key,contact,payment:'card',lines,expected_total:q.data.quote.total,catalog_version:q.data.quote.catalog_version},buyer.headers);
}
async function invoice(site,buyer,id){const r=await site.post('/shop/payment-start.php',{csrf:buyer.csrf,order_id:id},buyer.headers);assert.equal(r.status,200,JSON.stringify(r.data));return site.sql('SELECT * FROM rubizh_mono_invoices WHERE order_id='+id)[0];}
const reservation=(site,id)=>site.sql('SELECT sku,qty,status FROM rubizh_stock_reservations WHERE order_id='+id);

test('PAID commits existing stock once; duplicate/semantic replay, repeat PAID processing, fulfillment and refund never free it',{skip},async()=>{
 const site=await fixture();try{
  const buyer=await shopper(site),o=await checkout(site,buyer);assert.equal(o.status,200,JSON.stringify(o.data));const id=o.data.order.id;
  assert.equal(reservation(site,id)[0].status,'ACTIVE');const inv=await invoice(site,buyer,id);
  const signed=site.signed(inv);for(let i=0;i<2;i++)assert.equal((await site.post('/shop/mono-webhook.php',signed.raw,{'X-Sign':signed.signature})).status,200);
  assert.equal((await site.webhook(inv)).status,200);
  assert.deepEqual(reservation(site,id),[{sku:'RUB-F0001',qty:'1.00',status:'COMMITTED'}]);
  assert.equal(site.sql(`SELECT COUNT(*) n FROM rubizh_order_audit WHERE order_id=${id} AND action='reservation.COMMITTED'`)[0].n,1);
  call(site,`shopRecordPaid($db,${id});shopRecordPaid($db,${id});$db->beginTransaction();shopReserveLines($db,${id},npOrder($db,${id})['items'],gmdate('Y-m-d H:i:s'));$db->commit();`);
  site.sql(`UPDATE rubizh_stock_reservations SET expires_at='2000-01-01' WHERE order_id=${id}`);
  site.sql(`UPDATE rubizh_customer_orders SET status='delivered' WHERE id=${id}`);
  assert.equal((await checkout(site,await shopper(site))).data.error_code,'SKU_UNAVAILABLE','paid commitment blocks the next sale');
  assert.equal((await site.webhook(inv,'reversed')).status,200);
  assert.equal(site.sql('SELECT payment_status,pim_payment_state FROM rubizh_customer_orders WHERE id='+id)[0].pim_payment_state,'REFUNDED');
  assert.equal(reservation(site,id)[0].status,'COMMITTED');
  assert.equal((await checkout(site,await shopper(site))).data.error_code,'SKU_UNAVAILABLE','refund is not an inventory return');
 }finally{site.stop();}
});

test('unpaid cancellation and expired invoice release exactly once; late signed payment retains commitment',{skip},async()=>{
 const site=await fixture();try{
  const b=await shopper(site),o=await checkout(site,b),id=o.data.order.id;
  call(site,`shopCancelOrder($db,${id});shopCancelOrder($db,${id});`);
  assert.equal(reservation(site,id)[0].status,'RELEASED');
  assert.equal(site.sql(`SELECT COUNT(*) n FROM rubizh_order_audit WHERE order_id=${id} AND action='reservation.RELEASED'`)[0].n,1);
  const b2=await shopper(site),next=await checkout(site,b2),id2=next.data.order.id;const inv=await invoice(site,b2,id2);
  assert.equal((await site.webhook(inv,'expired')).status,200);assert.equal(reservation(site,id2)[0].status,'EXPIRED');
  assert.equal(site.sql('SELECT status FROM rubizh_customer_orders WHERE id='+id2)[0].status,'cancelled');
  assert.equal((await site.webhook(inv,'success')).status,200,'late money remains accounted for');assert.equal(reservation(site,id2)[0].status,'COMMITTED');
  assert.ok(JSON.parse(call(site,`echo json_encode(shopCanonicalOrderDto($db,npOrder($db,${id2})));`).stdout).review_flags.includes('STATE_CONFLICT'));
 }finally{site.stop();}
});

test('expired unpaid deadline releases without invoice; unresolved bank operation holds stock past TTL',{skip},async()=>{
 const site=await fixture();try{
  const b=await shopper(site),o=await checkout(site,b),id=o.data.order.id;
  site.sql(`UPDATE rubizh_order_timing SET payment_due='2000-01-01',remind_at='2000-01-01' WHERE order_id=${id}`);
  site.sql(`UPDATE rubizh_stock_reservations SET expires_at='2000-01-01' WHERE order_id=${id}`);
  call(site,'shopLifecycleTick($db);');assert.equal(reservation(site,id)[0].status,'EXPIRED');
  const b2=await shopper(site),next=await checkout(site,b2),id2=next.data.order.id;await invoice(site,b2,id2);
  site.sql(`UPDATE rubizh_mono_invoices SET status='unknown' WHERE order_id=${id2}`);
  site.sql(`UPDATE rubizh_stock_reservations SET expires_at='2000-01-01' WHERE order_id=${id2}`);
  site.sql(`UPDATE rubizh_order_timing SET payment_due='2000-01-01',remind_at='2000-01-01' WHERE order_id=${id2}`);
  call(site,'shopLifecycleTick($db);');assert.equal(reservation(site,id2)[0].status,'ACTIVE');
  assert.equal((await checkout(site,await shopper(site))).data.error_code,'SKU_UNAVAILABLE');
 }finally{site.stop();}
});

test('backend financial gates deny manager/logistics/read-only corrections/refunds and immutable audit protects old/new',{skip},async()=>{
 const site=await fixture();try{
  const b=await shopper(site),o=await checkout(site,b),id=o.data.order.id;
  for(const actor of [manager,logistics,reader]){
   assert.equal(outcome(site,`monoRefund($db,${id},'${actor}','Повернення покупцю')`).class,'ShopPermissionException');
   assert.equal(outcome(site,`monoReconcile($db,${id},'invoice','${actor}','Звірено виписку')`).class,'ShopPermissionException');
   assert.equal(outcome(site,`npConfirm($db,${id},'${actor}',true,false,'bank proof',['reason'=>'Звірено виписку'])`).class,'ShopPermissionException');
   for(const p of ['order.price_override','order.total_override','financial.audit.view'])assert.equal(outcome(site,`shopRequirePermission('${actor}','${p}')`).class,'ShopPermissionException');
  }
  for(const actor of [logistics,reader])assert.equal(outcome(site,`monoCreate($db,${id},'${actor}')`).class,'ShopPermissionException');
  assert.equal(outcome(site,`monoReconcile($db,${id},'invoice','${owner}','')`).class,'InvalidArgumentException');
  call(site,`monoCreate($db,${id},'${manager}');`);assert.equal(site.sql('SELECT COUNT(*) n FROM rubizh_mono_invoices WHERE order_id='+id)[0].n,1);
  call(site,`$db->beginTransaction();shopOrderAudit($db,${id},'${owner}','test.correction',['total'=>1],['total'=>2],'Звірено власником');$db->commit();`);
  assert.equal(outcome(site,`$db->exec("UPDATE rubizh_order_audit SET reason='tamper' WHERE order_id=${id}")`).class,'PDOException');
  assert.equal(outcome(site,`$db->exec("DELETE FROM rubizh_order_audit WHERE order_id=${id}")`).class,'PDOException');
  const aud=JSON.parse(call(site,`echo json_encode(shopFinancialAudit($db,${id},'${owner}'));`).stdout);assert.ok(aud.some(a=>a.action==='test.correction'&&JSON.parse(a.before_json).total===1&&JSON.parse(a.after_json).total===2));
 }finally{site.stop();}
});

test('one validator blocks confirmation and invoice on availability, ownership, price, payment flags and explicit expiry',{skip},async()=>{
 const site=await fixture({quantity:10});try{
  const b=await shopper(site),o=await checkout(site,b),id=o.data.order.id;
  const run=()=>outcome(site,`npConfirm($db,${id},'${manager}',true,false,'')`);
  site.sql("UPDATE variants SET pim_effective_availability='PREORDER' WHERE sku='RUB-F0001'");assert.equal(run().code,'AVAILABILITY_CHANGED');
  assert.equal((await site.post('/shop/payment-start.php',{csrf:b.csrf,order_id:id},b.headers)).data.error_code,'AVAILABILITY_CHANGED');
  site.sql("UPDATE variants SET pim_effective_availability='IN_STOCK',pim_payment_allowed=0 WHERE sku='RUB-F0001'");assert.equal(run().code,'PAYMENT_NOT_ALLOWED');
  assert.equal((await site.post('/shop/payment-start.php',{csrf:b.csrf,order_id:id},b.headers)).data.error_code,'PAYMENT_NOT_ALLOWED');
  site.sql("UPDATE variants SET pim_payment_allowed=1,pim_expires_at=1 WHERE sku='RUB-F0001'");assert.equal(run().code,'SKU_UNAVAILABLE');
  site.sql("UPDATE variants SET pim_expires_at=NULL,pim_active=0 WHERE sku='RUB-F0001'");assert.equal(run().code,'SKU_UNAVAILABLE');
  site.sql("UPDATE variants SET pim_active=1 WHERE sku='RUB-F0001'");
  const changed=structuredClone(wire),v=changed.products.find(p=>p.id==='m-jacket').variants.find(v=>v.sku==='RUB-F0001');v.price=v.site_price=2990;
  assert.equal((await publish(site,changed)).status,200);const conflict=run();assert.equal(conflict.code,'PRICE_CHANGED');
  assert.equal(outcome(site,`npConfirm($db,${id},'${manager}',true,false,'',['quote_hash'=>'${conflict.details.quote_hash}','reason'=>'Нова ціна погоджена'])`).class,'ShopPermissionException');
  const pay=await site.post('/shop/payment-start.php',{csrf:b.csrf,order_id:id},b.headers);assert.equal(pay.data.error_code,'PRICE_CHANGED');
  assert.equal(+site.sql('SELECT total FROM rubizh_customer_orders WHERE id='+id)[0].total,2860);assert.equal(site.sql('SELECT COUNT(*) n FROM rubizh_mono_invoices WHERE order_id='+id)[0].n,0);
  assert.equal(outcome(site,`npConfirm($db,${id},'${owner}',true,false,'',['quote_hash'=>'${conflict.details.quote_hash}','reason'=>'Покупець погодив нову ціну'])`).ok,true);
  assert.equal(+site.sql('SELECT total FROM rubizh_customer_orders WHERE id='+id)[0].total,2990);await invoice(site,b,id);
 }finally{site.stop();}
});

test('resolution rejects invented/foreign/forbidden SKU, requires explicit quote acceptance, repairs routing and reserves real quantity',{skip},async()=>{
 const site=await fixture({custom:w=>{const m=w.products.find(m=>m.id==='m-pants'),v=m.variants[0];Object.assign(v,{size_status:'EXACT_SIZE',size_normalized:'50',size_display:'50',availability:'IN_STOCK',availability_status:'IN_STOCK',stock:2,stock_quantity:2,stock_status:'CONFIRMED',availability_source:'QUANTITY',availability_confirmation:'CONFIRMED',inventory_mode:'QUANTITY',payment_allowed:true,requires_order_confirmation:false,source_binding_status:'CONFIRMED',binding_confirmation_required:false,size_confirmation_required:false});}});try{
  // A request is placed while the SKU is not the requested available option.
  const b=await shopper(site);const option=model('m-pants').size_options.find(o=>o.size==='48');const color=model('m-pants').colors[0].id;
  const o=await checkout(site,b,[{product_id:'m-pants',color_id:color,option_id:option.option_id,size:'48',qty:1}]);assert.equal(o.status,200,JSON.stringify(o.data));const id=o.data.order.id;
  const confirm=sku=>outcome(site,`$GLOBALS['rubizh_request_resolution']=[0=>'${sku}'];npConfirm($db,${id},'${owner}',true,false,'')`);
  assert.equal(confirm('FAKE').code,'SKU_UNAVAILABLE');assert.equal(confirm('RUB-F0001').code,'SKU_UNAVAILABLE');
  const c=confirm('RUB-F0010');assert.equal(c.code,'PRICE_CHANGED');
  assert.equal(outcome(site,`$GLOBALS['rubizh_request_resolution']=[0=>'RUB-F0010'];npConfirm($db,${id},'${owner}',true,false,'',['quote_hash'=>'${c.details.quote_hash}','reason'=>'Розмір і суму погоджено'])`).ok,true);
  const l=site.sql('SELECT sku,supplier_code,line_amount FROM rubizh_order_fulfillment_lines WHERE order_id='+id)[0];assert.equal(l.sku,'RUB-F0010');assert.notEqual(l.supplier_code,'');
  assert.equal(reservation(site,id)[0].status,'ACTIVE');assert.equal(reservation(site,id)[0].qty,'1.00');
  await invoice(site,b,id);
 }finally{site.stop();}
});

test('read-only reconciliation plan reports safe/ambiguous/conflicts without changing rows or migrating schema',{skip},async()=>{
 const site=await fixture();try{
  const b=await shopper(site),o=await checkout(site,b),id=o.data.order.id;
  site.sql(`UPDATE rubizh_customer_orders SET payment_status='paid',pim_payment_state='UNPAID' WHERE id=${id}`);
  site.sql(`INSERT INTO rubizh_customer_orders(external_id,email,order_number,status,payment_status,total,items_json,created_at,updated_at) VALUES('legacy-safe','','safe','confirmed','pending',10,'[]',UTC_TIMESTAMP(),UTC_TIMESTAMP()),('legacy-ambiguous','','ambiguous','new','pending',10,'[]',UTC_TIMESTAMP(),UTC_TIMESTAMP())`);
  const before=site.sql('SELECT * FROM rubizh_customer_orders');
  const planned=spawnSync(runtime+'/bin/php8.4',[...phpArgs,root+'/dev/reconcile-order-states.php','--plan','--config='+site.site+'/api/config.php'],{env:phpEnv,encoding:'utf8'});
  assert.equal(planned.status,0,planned.stderr);const r=JSON.parse(planned.stdout);
  assert.deepEqual(r.counts,{total_records:3,total_legacy_records:2,safe_mappings:1,ambiguous_mappings:1,conflicts:1});assert.equal(r.writes,0);
  assert.deepEqual(site.sql('SELECT * FROM rubizh_customer_orders'),before);
  assert.equal(spawnSync(runtime+'/bin/php8.4',[...phpArgs,root+'/dev/reconcile-order-states.php','--apply','--config='+site.site+'/api/config.php'],{env:phpEnv}).status,1);
 }finally{site.stop();}
});

test('parallel last-unit checkouts serialize on the real SKU; replay never adds another reservation',{skip},async()=>{
 const site=await fixture();try{
  const race=()=>new Promise(resolve=>{
   const code=`define('RUBIZH_AUTH_NO_SESSION',true);require '${site.site}/auth/bootstrap.php';$db=shopStoreDatabase();try{$db->beginTransaction();$v=shopValidateOrder($db,[json_decode('${JSON.stringify(selection())}',true)]);usleep(150000);$key=bin2hex(random_bytes(12));$db->prepare("INSERT INTO rubizh_customer_orders(external_id,email,order_number,status,payment_status,total,items_json,created_at,updated_at) VALUES(?,'',?,'confirmed','pending',2860,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())")->execute([$key,$key,json_encode($v['quote']['lines'])]);$id=(int)$db->lastInsertId();shopReserveLines($db,$id,$v['raw'],'2099-01-01');shopReserveLines($db,$id,$v['raw'],'2099-01-01');$db->commit();echo 'OK';}catch(Throwable $e){if($db->inTransaction())$db->rollBack();echo $e instanceof ShopOrderConflict?$e->reason:get_class($e);}`;
   const child=spawn(runtime+'/bin/php8.4',[...phpArgs,'-r',code],{env:phpEnv});let out='';child.stdout.on('data',x=>out+=x);child.on('exit',status=>resolve({status,out}));
  });
  const results=await Promise.all([race(),race()]);assert.ok(results.every(r=>r.status===0),JSON.stringify(results));assert.deepEqual(results.map(r=>r.out).sort(),['OK','SKU_UNAVAILABLE']);assert.equal(site.sql('SELECT COUNT(*) n FROM rubizh_stock_reservations')[0].n,1);
 }finally{site.stop();}
});

test('OWNER bank reconciliation requires reason, commits once and writes immutable old/new; refund success keeps stock',{skip},async()=>{
 const site=await fixture({quantity:3});try{
  const b=await shopper(site),o=await checkout(site,b),id=o.data.order.id;
  call(site,`shopUseInvoice($db,${id});`);
  assert.equal(outcome(site,`npConfirm($db,${id},'${owner}',true,false,'statement 42')`).class,'InvalidArgumentException');
  assert.equal(outcome(site,`npConfirm($db,${id},'${owner}',true,false,'statement 42',['reason'=>'Оплату звірено з випискою'])`).ok,true);
  assert.equal(reservation(site,id)[0].status,'COMMITTED');
  assert.equal(outcome(site,`npConfirm($db,${id},'${owner}',true,false,'statement 42',['reason'=>'Оплату звірено з випискою'])`).ok,false);
  const audit=site.sql(`SELECT before_json,after_json FROM rubizh_order_audit WHERE order_id=${id} AND action='payment.manual_reconcile'`);assert.equal(audit.length,1);assert.equal(JSON.parse(audit[0].before_json).payment_status,'pending');assert.equal(JSON.parse(audit[0].after_json).payment_status,'paid');
  const b2=await shopper(site),o2=await checkout(site,b2),id2=o2.data.order.id,inv=await invoice(site,b2,id2);await site.webhook(inv);
  call(site,`define('RUBIZH_MONO_TESTS',true);$GLOBALS['mono_test_transport']=fn($path,$body)=>['status'=>'success'];monoRefund($db,${id2},'${owner}','Покупець погодив повернення коштів');`);
  assert.equal(site.sql(`SELECT payment_status,pim_payment_state FROM rubizh_customer_orders WHERE id=${id2}`)[0].pim_payment_state,'REFUNDED');assert.equal(reservation(site,id2)[0].status,'COMMITTED');
  assert.equal(site.sql(`SELECT refund_status FROM rubizh_mono_invoices WHERE order_id=${id2}`)[0].refund_status,'success');
  assert.equal(outcome(site,`monoRefund($db,${id2},'${owner}','Покупець погодив повернення коштів')`).ok,false);
 }finally{site.stop();}
});

test('audit failure rolls webhook money, inventory and replay key back together, then a retry succeeds',{skip},async()=>{
 const site=await fixture();try{
  const b=await shopper(site),o=await checkout(site,b),id=o.data.order.id,inv=await invoice(site,b,id),s=site.signed(inv);
  site.sql(`CREATE TRIGGER fixture_audit_failure BEFORE INSERT ON rubizh_order_audit FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture failure'`);
  assert.notEqual((await site.post('/shop/mono-webhook.php',s.raw,{'X-Sign':s.signature})).status,200);
  assert.equal(site.sql(`SELECT payment_status FROM rubizh_customer_orders WHERE id=${id}`)[0].payment_status,'pending');assert.equal(reservation(site,id)[0].status,'ACTIVE');assert.equal(site.sql('SELECT COUNT(*) n FROM rubizh_mono_events')[0].n,0);
  assert.equal(site.sql(`SELECT status FROM rubizh_mono_invoices WHERE order_id=${id}`)[0].status,'created');
  site.sql('DROP TRIGGER fixture_audit_failure');assert.equal((await site.post('/shop/mono-webhook.php',s.raw,{'X-Sign':s.signature})).status,200);assert.equal(reservation(site,id)[0].status,'COMMITTED');
 }finally{site.stop();}
});

test('HTTP financial endpoints enforce roles and CSRF even when requests bypass buttons',{skip},async()=>{
 const {writeFileSync}=await import('node:fs');const site=await fixture();try{
  const b=await shopper(site),o=await checkout(site,b),id=o.data.order.id;
  for(const actor of [manager,logistics,reader,owner]){
   const session='p0'+actor,csrf='e'.repeat(64);
   writeFileSync(site.dir+'/sess_'+session,`customer_id|s:32:"${actor}";login_time|i:${Math.floor(Date.now()/1000)};csrf|s:64:"${csrf}";`);
   const headers={Cookie:'rubizh_customer='+session};
   const forged=await site.post('/shop/financial-actions.php',{action:'invoice.create',order_id:id,csrf:'wrong'},headers);assert.notEqual(forged.status,200);
   if(actor!==owner){
    for(const action of ['refund.execute','manual_reconcile']){const r=await site.post('/shop/financial-actions.php',{action,order_id:id,csrf,reason:'Звірено власником',invoice_id:'fixture'},headers);assert.equal(r.status,403,JSON.stringify(r.data));}
    assert.equal((await site.get('/shop/financial-actions.php?action=audit&order_id='+id,headers)).status,403);
   }
   if([logistics,reader].includes(actor)){
    assert.equal((await site.post('/shop/financial-actions.php',{action:'invoice.create',order_id:id,csrf},headers)).status,403);
    assert.equal((await site.post('/shop/order-confirm.php',{order_id:id,csrf,availability_confirmed:true},headers)).status,403);
   }
   if(actor===manager)assert.equal((await site.post('/shop/financial-actions.php',{action:'invoice.create',order_id:id,csrf},headers)).status,200);
  }
  assert.equal(site.sql('SELECT COUNT(*) n FROM rubizh_mono_invoices')[0].n,1);
 }finally{site.stop();}
});

test('confirmation sees reservations committed after its earlier order snapshot under REPEATABLE READ',{skip},async()=>{
 const site=await fixture();try{
  const b=await shopper(site),o=await checkout(site,b),id=o.data.order.id;
  site.sql(`UPDATE rubizh_stock_reservations SET expires_at='2000-01-01' WHERE order_id=${id}`);
  const r=outcome(site,`$db->beginTransaction();$old=npOrder($db,${id});$other=new PDO('mysql:unix_socket='.getenv('RUBIZH_TEST_MYSQL_SOCKET').';dbname=${site.schema}','root','',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$other->beginTransaction();$v=shopValidateOrder($other,$old['items']);$other->prepare("INSERT INTO rubizh_customer_orders(external_id,email,order_number,status,payment_status,total,items_json,created_at,updated_at) VALUES('after-snapshot','','after-snapshot','confirmed','pending',2860,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())")->execute([json_encode($v['quote']['lines'])]);$next=(int)$other->lastInsertId();shopReserveLines($other,$next,$v['raw'],'2099-01-01');$other->commit();shopValidateOrder($db,$old['items'],'confirmation',$old)`);
  assert.equal(r.code,'SKU_UNAVAILABLE',JSON.stringify(r));assert.equal(site.sql('SELECT COUNT(*) n FROM rubizh_stock_reservations')[0].n,2);
 }finally{site.stop();}
});

test('refund callback arriving before success retains stock; expired unpaid order cannot create an invoice before the worker tick',{skip},async()=>{
 const site=await fixture();try{
  const b=await shopper(site),o=await checkout(site,b),id=o.data.order.id;
  site.sql(`UPDATE rubizh_order_timing SET payment_due='2000-01-01' WHERE order_id=${id}`);
  const blocked=await site.post('/shop/payment-start.php',{csrf:b.csrf,order_id:id},b.headers);assert.equal(blocked.data.error_code,'PAYMENT_NOT_ALLOWED');assert.equal(blocked.data.conflict.blocker,'ORDER_EXPIRED');assert.equal(site.sql('SELECT COUNT(*) n FROM rubizh_mono_invoices')[0].n,0);
  site.sql(`UPDATE rubizh_order_timing SET payment_due='2099-01-01' WHERE order_id=${id}`);
  const inv=await invoice(site,b,id);assert.equal((await site.webhook(inv,'reversed')).status,200);
  assert.equal(site.sql(`SELECT payment_status FROM rubizh_customer_orders WHERE id=${id}`)[0].payment_status,'refunded');assert.equal(reservation(site,id)[0].status,'COMMITTED');
  await site.webhook(inv,'success');assert.equal(site.sql(`SELECT payment_status FROM rubizh_customer_orders WHERE id=${id}`)[0].payment_status,'refunded');assert.equal((await checkout(site,await shopper(site))).data.error_code,'SKU_UNAVAILABLE');
 }finally{site.stop();}
});

test('schema plan is read-only; existing orders refuse unguarded runtime preparation and require explicit migration mode',{skip},async()=>{
 const site=await fixture();try{
  const b=await shopper(site);await checkout(site,b);const before=site.sql('SELECT * FROM rubizh_customer_orders');
  const args=['--config='+site.site+'/api/config.php'];
  const run=(file,more)=>spawnSync(runtime+'/bin/php8.4',[...phpArgs,root+'/dev/'+file,...more,...args],{env:phpEnv,encoding:'utf8'});
  const plan=run('migrate-order-p0.php',['--plan']);assert.equal(plan.status,0,plan.stderr);assert.ok(JSON.parse(plan.stdout).steps.every(s=>s.exists));assert.deepEqual(site.sql('SELECT * FROM rubizh_customer_orders'),before);
  assert.equal(run('migrate-order-p0.php',['--apply','--database='+site.schema]).status,1,'backup required');
  site.sql("DELETE FROM meta WHERE k='order_p0_schema'");
  const prepare=spawnSync(runtime+'/bin/php8.4',[...phpArgs,site.site+'/dev/prepare-runtime.php'],{env:phpEnv,encoding:'utf8'});assert.equal(prepare.status,1);assert.match(prepare.stderr,/guarded migrate-order-p0/);assert.deepEqual(site.sql('SELECT * FROM rubizh_customer_orders'),before);
  const apply=run('migrate-order-p0.php',['--apply','--database='+site.schema,'--isolated']);assert.equal(apply.status,0,apply.stderr);assert.deepEqual(site.sql('SELECT * FROM rubizh_customer_orders'),before);
 }finally{site.stop();}
});
