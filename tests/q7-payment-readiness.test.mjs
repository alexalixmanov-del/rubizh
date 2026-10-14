// Q-7 (owner decision 2026-10-11): legacy goods with a confirmed (numeric) stock go straight to MonoPay after the server
// re-checks SKU, publication, price and stock and reserves it; unknown stock or a FOP invoice keeps the manager step.
// Isolated MySQL fixture, MonoPay mock, synthetic products; no real payment.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createSign} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {startSite,php} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const product=(id,variants)=>({id,slug:id,name:'Товар '+id,brand:'QA',canonical_category_id:'clothing_headwear',category:'Одяг та форма / Головні убори',category_path:['Одяг та форма','Головні убори'],description:'Тест.',photos:['https://img.test/'+id+'.png'],variants});
const v=(sku,size,extra={})=>({sku,color:'Олива',size,size_display:size,price:1000,availability:'in',stock:3,photos:['https://img.test/x.png'],...extra});
async function legacySite({extraConfig=''}={}){
 const site=await startSite({enableV3:false,extraConfig:",'mono_mock'=>true,'environment'=>'staging'"+extraConfig});
 site.save=p=>php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${site.site}/auth/bootstrap.php';require_once '${site.site}/api/lib.php';save_product(db(),json_decode(${JSON.stringify(JSON.stringify(p))},true));`);
 site.buyer=async()=>{const r=await fetch(site.base+'/shop/customer.php');return {h:{Cookie:r.headers.get('set-cookie').split(';')[0]},csrf:(await r.json()).csrf};};
 let n=0;
 site.order=async(b,lines,{payment='card',expected=null}={})=>{const q=await site.post('/shop/checkout-quote.php',{csrf:b.csrf,lines,payment},b.h);if(q.status!==200)return q;
  return site.post('/shop/order.php',{csrf:b.csrf,request_id:(++n).toString(16).padStart(32,'7'),contact:{name:'Тест Покупець',recipient:'Тест Покупець',phone:'+380671234567',city:'Київ',address:'Відділення 1',delivery_type:'branch'},payment,lines,expected_total:expected??q.data.quote.total,catalog_version:q.data.quote.catalog_version},b.h);};
 site.pay=(b,id)=>site.post('/shop/payment-start.php',{csrf:b.csrf,order_id:id},b.h);
 site.row=id=>site.sql('SELECT status,payment_status,total FROM rubizh_customer_orders WHERE id='+id)[0];
 site.invoices=id=>+site.sql('SELECT COUNT(*) n FROM rubizh_mono_invoices WHERE order_id='+id)[0].n;
 return site;
}
const line=(id,sku,size,qty=1)=>({product_id:id,sku,size,color:'Олива',qty});

test('ARCH01: paid Q-7 orders can confirm fulfillment without changing money, timing, reserves or payment mail',{skip,timeout:180000},async()=>{
 const owner='a'.repeat(32),manager='b'.repeat(32),reader='d'.repeat(32);
 const site=await legacySite({extraConfig:`, 'np_ttn_enabled'=>true,'np_supplier_by_sku'=>['Q7-PAID'=>'m_vin'],'staff_roles'=>['${owner}'=>'OWNER','${manager}'=>'MANAGER','${reader}'=>'READ_ONLY']`});
 const call=code=>JSON.parse(php(`define('RUBIZH_AUTH_NO_SESSION',true);define('RUBIZH_NP_TESTS',true);$GLOBALS['np_test_transport']=fn()=>throw new LogicException('No provider operation permitted');require '${site.site}/auth/bootstrap.php';$db=shopStoreDatabase();try{${code};echo json_encode(['ok'=>true]);}catch(Throwable $e){echo json_encode(['ok'=>false,'class'=>get_class($e),'message'=>$e->getMessage()]);}`).stdout);
 try{
  site.save(product('q7-paid',[v('Q7-PAID','M')]));const b=await site.buyer();
  const o=await site.order(b,[line('q7-paid','Q7-PAID','M',2)]);assert.equal(o.status,200,JSON.stringify(o.data));const id=o.data.order.id;
  assert.equal(site.row(id).status,'confirmed');assert.equal((await site.pay(b,id)).status,200);
  const inv=site.sql('SELECT * FROM rubizh_mono_invoices WHERE order_id='+id)[0];
  const {publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  site.sql(`INSERT INTO meta(k,v) VALUES('mono_public_key','${Buffer.from(publicKey.export({type:'spki',format:'pem'})).toString('base64')}') ON DUPLICATE KEY UPDATE v=VALUES(v)`);
  const raw=JSON.stringify({invoiceId:inv.invoice_id,status:'success',amount:+inv.amount,ccy:980,reference:inv.reference,modifiedDate:new Date().toISOString()});
  assert.equal((await site.post('/shop/mono-webhook.php',raw,{'X-Sign':createSign('SHA256').update(raw).sign(privateKey).toString('base64')})).status,200);
  assert.equal(site.row(id).payment_status,'paid');
  assert.equal(site.sql('SELECT * FROM rubizh_np_order_confirmations WHERE order_id='+id).length,0,'Q-7 payment does not imply fulfillment confirmation');
  const detail=site.sql('SELECT contact_json FROM rubizh_order_details WHERE order_id='+id)[0];const contact=JSON.parse(detail.contact_json);contact.np_delivery={city_ref:'00000000-0000-0000-0000-000000000010',warehouse_ref:'00000000-0000-0000-0000-000000000020'};
  site.sql(`UPDATE rubizh_order_details SET contact_json='${JSON.stringify(contact).replaceAll("'","''")}' WHERE order_id=${id}`);
  const packageJson=JSON.stringify({weight:1,seats:1,places:[{weight:1,length:10,width:10,height:10}]});
  for(let n=1;n<=2;n++)assert.equal(call(`npDraft($db,${id},'${owner}','${String(n).padStart(32,'0')}','m_vin',[['line_no'=>0,'qty'=>1]],json_decode('${packageJson}',true))`).ok,true);
  const ready=()=>call(`$o=npOrder($db,${id});$q=$db->query('SELECT * FROM rubizh_np_order_confirmations WHERE order_id=${id}');$confirmation=$q->fetch(PDO::FETCH_ASSOC)?:[];$shipments=npShipments($db,${id});npAssertReady($o,$confirmation,npLines($db,${id}),$shipments,$shipments[0])`);
  const beforeReady=ready();assert.equal(beforeReady.ok,false);assert.match(beforeReady.message,/підтвердьте наявність/);
  site.sql(`UPDATE rubizh_order_timing SET payment_due='2030-01-07 10:00:00',remind_at='2030-01-06 10:00:00' WHERE order_id=${id}`);
  const snapshot=()=>Object.fromEntries(['rubizh_customer_orders','rubizh_order_details','rubizh_order_fulfillment_lines','rubizh_order_timing','rubizh_stock_reservations','rubizh_mono_invoices','rubizh_buyer_mail','rubizh_notifications'].map(table=>[table,site.sql('SELECT * FROM '+table+' WHERE '+(table==='rubizh_customer_orders'?'id':'order_id')+'='+id)]));
  const before=snapshot();assert.equal(before.rubizh_stock_reservations[0].status,'COMMITTED');
  const sid='q7manager'.padEnd(32,'b'),csrf='c'.repeat(64);writeFileSync(site.dir+'/sess_'+sid,`csrf|s:64:"${csrf}";customer_id|s:32:"${manager}";login_time|i:${Math.floor(Date.now()/1000)};login_method|s:5:"email";`);
  const confirmHttp=extra=>site.post('/shop/order-confirm.php',{csrf,order_id:id,availability_confirmed:true,expected_updated_at:site.sql('SELECT updated_at FROM rubizh_customer_orders WHERE id='+id)[0].updated_at,...extra},{Cookie:'rubizh_customer='+sid});
  // A later catalog change must not cause fulfillment confirmation to reprice the paid snapshot.
  site.save(product('q7-paid',[v('Q7-PAID','M',{price:1500,stock:0})]));
  const confirm=await confirmHttp({extra_delivery_agreed:false});assert.equal(confirm.status,200,JSON.stringify(confirm));
  assert.deepEqual(snapshot(),before);
  const noExtra=ready();assert.equal(noExtra.ok,false);assert.match(noExtra.message,/кожної окремої посилки/,'split parcels still require explicit agreement');
  const missingAvailability=call(`npConfirm($db,${id},'${manager}',false,true,'')`);assert.equal(missingAvailability.ok,false);
  const denied=call(`npConfirm($db,${id},'${reader}',true,true,'')`);assert.equal(denied.class,'ShopPermissionException');
  const proof=call(`npConfirm($db,${id},'${owner}',true,true,'bank statement',['reason'=>'Звірено виписку'])`);assert.equal(proof.ok,false,'a paid fulfillment confirmation cannot reconcile money');
  assert.equal(+site.sql('SELECT extra_delivery_agreed FROM rubizh_np_order_confirmations WHERE order_id='+id)[0].extra_delivery_agreed,0);
  assert.equal((await confirmHttp({extra_delivery_agreed:true})).status,200);assert.equal(ready().ok,true);assert.deepEqual(snapshot(),before);
  assert.equal(+site.sql(`SELECT availability_confirmed FROM rubizh_np_order_confirmations WHERE order_id=${id}`)[0].availability_confirmed,1);
  assert.equal(+site.sql(`SELECT COUNT(*) n FROM rubizh_np_audit WHERE order_id=${id} AND action='paid_fulfillment_confirmed'`)[0].n,2);
  for(const status of ['cancelled','returned','completed']){site.sql(`UPDATE rubizh_customer_orders SET status='${status}' WHERE id=${id}`);assert.equal(call(`npConfirm($db,${id},'${manager}',true,true,'')`).ok,false);}
  site.sql(`UPDATE rubizh_customer_orders SET status='confirmed',payment_status='refunded' WHERE id=${id}`);assert.equal(call(`npConfirm($db,${id},'${manager}',true,true,'')`).ok,false);
 }finally{site.stop();}
});

test('Q-7: confirmed legacy stock pays by card right away; the invoice amount is the server total and the stock is reserved',{skip,timeout:180000},async()=>{
 const site=await legacySite();try{
  site.save(product('q7-cap',[v('Q7-M','M'),v('Q7-L','L')]));const b=await site.buyer();
  const o=await site.order(b,[line('q7-cap','Q7-M','M',2)]);assert.equal(o.status,200,JSON.stringify(o.data));const id=o.data.order.id;
  assert.equal(site.row(id).status,'confirmed','no manager step for confirmed stock');
  assert.equal(o.data.order.payment_ready,true);
  const p=await site.pay(b,id);assert.equal(p.status,200,JSON.stringify(p.data));
  assert.equal(+site.sql('SELECT amount FROM rubizh_mono_invoices WHERE order_id='+id)[0].amount,Math.round(+site.row(id).total*100));
  assert.deepEqual(site.sql(`SELECT sku,qty,status FROM rubizh_stock_reservations WHERE order_id=${id}`).map(r=>[r.sku,+r.qty,r.status]),[['Q7-M',2,'ACTIVE']]);
 }finally{site.stop();}
});

test('Q-7: unknown stock or a FOP invoice keeps the manager step, and a direct payment-start cannot skip it',{skip,timeout:180000},async()=>{
 const site=await legacySite();try{
  site.save(product('q7-unknown',[v('Q7U-M','M',{stock:null})]));site.save(product('q7-fop',[v('Q7F-M','M')]));const b=await site.buyer();
  const unknown=await site.order(b,[line('q7-unknown','Q7U-M','M')]);assert.equal(unknown.status,200,JSON.stringify(unknown.data));
  assert.equal(site.row(unknown.data.order.id).status,'new');
  assert.equal(unknown.data.payment,null,'no payment link while the manager has to confirm');
  const direct=await site.pay(b,unknown.data.order.id);assert.notEqual(direct.status,200,'no invoice before the manager confirms');assert.equal(site.invoices(unknown.data.order.id),0);
  const fop=await site.order(b,[line('q7-fop','Q7F-M','M')],{payment:'invoice'});assert.equal(site.row(fop.data.order.id).status,'new','a FOP invoice is prepared by the manager');
  const mixed=await site.order(b,[line('q7-fop','Q7F-M','M'),line('q7-unknown','Q7U-M','M')]);assert.equal(site.row(mixed.data.order.id).status,'new','one unconfirmed line keeps the whole order with the manager');
 }finally{site.stop();}
});

test('Q-7: a changed price, an unpublished product or a sold-out size stop the order with a Ukrainian message and no payment',{skip,timeout:180000},async()=>{
 const site=await legacySite();try{
  site.save(product('q7-a',[v('Q7A-M','M',{stock:1})]));const b=await site.buyer();
  const cheap=await site.order(b,[line('q7-a','Q7A-M','M')],{expected:1});
  assert.equal(cheap.status,409);assert.equal(cheap.data.error_code,'PRICE_CHANGED');assert.match(cheap.data.error,/Ціна/);
  const first=await site.order(b,[line('q7-a','Q7A-M','M')]);assert.equal(first.status,200,JSON.stringify(first.data));
  const sold=await site.order(await site.buyer(),[line('q7-a','Q7A-M','M')]);
  assert.notEqual(sold.status,200,'the last unit is already reserved');assert.match(sold.data.error,/[А-Яа-яІіЇїЄєҐґ]/,'message in Ukrainian: '+sold.data.error);
  site.sql("UPDATE products SET visible=0 WHERE id='q7-a'");
  const gone=await site.order(await site.buyer(),[line('q7-a','Q7A-M','M')]);
  assert.notEqual(gone.status,200);assert.match(gone.data.error,/[А-Яа-яІіЇїЄєҐґ]/,'message in Ukrainian: '+gone.data.error);
  assert.equal(+site.sql('SELECT COUNT(*) n FROM rubizh_customer_orders')[0].n,1,'only the valid order exists');
 }finally{site.stop();}
});
