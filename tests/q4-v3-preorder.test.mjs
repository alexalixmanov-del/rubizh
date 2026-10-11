// Q-4 (owner decision 2026-10-11): a PIM v3 preorder (PREORDER: order_submission_allowed, requires_order_confirmation,
// payment_allowed=false) is paid only after the manager confirms it and the server re-checks SKU and price; a stale
// confirmation never bills old data. PIM contract read-only (fixture wire). Isolated MySQL fixture, MonoPay mock.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startSite,wire,publish,php} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const OWNER='0'.repeat(31)+'1';
async function fixture(){
 const site=await startSite({extraConfig:`,'mono_mock'=>true,'environment'=>'staging','staff_roles'=>['${OWNER}'=>'OWNER']`});
 assert.equal((await publish(site,structuredClone(wire))).status,200);
 const r=await fetch(site.base+'/shop/customer.php');site.b={h:{Cookie:r.headers.get('set-cookie').split(';')[0]},csrf:(await r.json()).csrf};
 const pouch=wire.products.find(p=>p.id==='m-pouch');site.line={product_id:'m-pouch',color_id:pouch.colors.find(c=>c.variant_skus.includes('RUB-F0020')).id,sku:'RUB-F0020',qty:1};
 const q=await site.post('/shop/checkout-quote.php',{csrf:site.b.csrf,lines:[site.line],payment:'card'},site.b.h);assert.equal(q.status,200,JSON.stringify(q.data));
 const o=await site.post('/shop/order.php',{csrf:site.b.csrf,request_id:'4'.repeat(32),contact:{name:'Тест Покупець',recipient:'Тест Покупець',phone:'+380671234567',city:'Київ',address:'Відділення 1',delivery_type:'branch'},payment:'card',lines:[site.line],expected_total:q.data.quote.total,catalog_version:q.data.quote.catalog_version},site.b.h);
 assert.equal(o.status,200,JSON.stringify(o.data));site.id=o.data.order.id;
 site.pay=()=>site.post('/shop/payment-start.php',{csrf:site.b.csrf,order_id:site.id},site.b.h);
 site.confirm=()=>JSON.parse(php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${site.site}/auth/bootstrap.php';$db=shopStoreDatabase();try{npConfirm($db,${site.id},'${OWNER}',true,false,'');echo json_encode(['ok'=>true]);}catch(Throwable $e){echo json_encode(['ok'=>false,'code'=>$e instanceof ShopOrderConflict?$e->reason:get_class($e),'message'=>$e->getMessage()]);}`).stdout);
 site.invoices=()=>+site.sql('SELECT COUNT(*) n FROM rubizh_mono_invoices WHERE order_id='+site.id)[0].n;
 return site;
}

test('Q-4: a v3 preorder waits for the manager; neither the UI path nor a direct API call can pay it before confirmation',{skip,timeout:180000},async()=>{
 const site=await fixture();try{
  assert.deepEqual(site.sql('SELECT status,pim_order_state FROM rubizh_customer_orders WHERE id='+site.id)[0],{status:'new',pim_order_state:'WAITING_CONFIRMATION'});
  assert.notEqual((await site.pay()).status,200);assert.equal(site.invoices(),0);
  const receipt=JSON.parse(php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${site.site}/auth/bootstrap.php';require_once '${site.site}/shop/customer-states.php';$db=shopStoreDatabase();$o=$db->query('SELECT * FROM rubizh_customer_orders WHERE id=${site.id}')->fetch(PDO::FETCH_ASSOC);echo json_encode(['chip'=>shopCustomerStatus($o)['label'],'payment'=>shopCustomerStates($o,shopOrderReceipt($db,${site.id}))['payment']]);`).stdout);
  assert.equal(receipt.chip,'Очікує підтвердження менеджера');assert.equal(receipt.payment,'Оплата після підтвердження');
 }finally{site.stop();}
});

test('Q-4: manager confirmation re-checks the PIM data and unlocks one invoice at the server price',{skip,timeout:180000},async()=>{
 const site=await fixture();try{
  const c=site.confirm();assert.equal(c.ok,true,'confirmation of a v3 preorder: '+JSON.stringify(c));
  assert.equal(site.sql('SELECT status FROM rubizh_customer_orders WHERE id='+site.id)[0].status,'confirmed');
  const p=await site.pay();assert.equal(p.status,200,JSON.stringify(p.data));assert.equal(site.invoices(),1);
  assert.equal(+site.sql('SELECT amount FROM rubizh_mono_invoices WHERE order_id='+site.id)[0].amount,Math.round(+site.sql('SELECT total FROM rubizh_customer_orders WHERE id='+site.id)[0].total*100));
 }finally{site.stop();}
});

test('Q-4: a stale confirmation (PIM price changed after it) cannot bill the old price',{skip,timeout:180000},async()=>{
 const site=await fixture();try{
  assert.equal(site.confirm().ok,true);
  const w=structuredClone(wire);const v=w.products.find(p=>p.id==='m-pouch').variants.find(x=>x.sku==='RUB-F0020');
  for(const k of ['price','site_price'])if(typeof v[k]==='number')v[k]=v[k]+100;
  assert.equal((await publish(site,w)).status,200);
  const p=await site.pay();assert.notEqual(p.status,200,'no invoice on stale data: '+JSON.stringify(p.data));assert.equal(site.invoices(),0);
  assert.match(p.data.error||'',/[А-Яа-яІіЇїЄєҐґ]/,'Ukrainian explanation');
 }finally{site.stop();}
});
