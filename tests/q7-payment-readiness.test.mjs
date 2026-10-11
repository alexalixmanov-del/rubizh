// Q-7 (owner decision 2026-10-11): legacy goods with a confirmed (numeric) stock go straight to MonoPay after the server
// re-checks SKU, publication, price and stock and reserves it; unknown stock or a FOP invoice keeps the manager step.
// Isolated MySQL fixture, MonoPay mock, synthetic products; no real payment.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startSite,php} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const product=(id,variants)=>({id,slug:id,name:'Товар '+id,brand:'QA',canonical_category_id:'clothing_headwear',category:'Одяг та форма / Головні убори',category_path:['Одяг та форма','Головні убори'],description:'Тест.',photos:['https://img.test/'+id+'.png'],variants});
const v=(sku,size,extra={})=>({sku,color:'Олива',size,size_display:size,price:1000,availability:'in',stock:3,photos:['https://img.test/x.png'],...extra});
async function legacySite(){
 const site=await startSite({enableV3:false,extraConfig:",'mono_mock'=>true,'environment'=>'staging'"});
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
