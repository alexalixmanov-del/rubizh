// Stage 5.5 (owner D-79): without the owner's VAT status (invoice_vat_note) the site sells by card only — payment by invoice
// is hidden by a setting (code kept) and refused by the API. Default: invoice on when the VAT status is filled, else off; the
// owner can also switch it off (invoice_payment=off) while the status is filled.
import {test} from 'node:test';import assert from 'node:assert/strict';import {writeFileSync,readFileSync} from 'node:fs';import path from 'node:path';import vm from 'node:vm';
import {startCrm,line} from './helpers/crm-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const root=path.resolve(import.meta.dirname,'..');

async function placeInvoice(s){
 const who=await s.get('/shop/customer.php'),cookie=who.headers.get('set-cookie').split(';')[0],csrf=who.data.csrf;const lines=[line()];
 const q=await s.post('/shop/checkout-quote.php',{csrf,lines,payment:'invoice'},{Cookie:cookie});
 const contact={name:'Олена Петренко',recipient:'Олена Петренко',email:'buyer@fixture.test',phone:'+380671234567',city:'Київ',address:'Відділення 1',delivery_type:'branch',np_delivery:{city_ref:s.ref(10),warehouse_ref:s.ref(20)}};
 const placed=await s.post('/shop/order.php',{csrf,request_id:crypto.randomUUID().replaceAll('-',''),contact,payment:'invoice',lines,expected_total:q.data.quote?.total,catalog_version:q.data.quote?.catalog_version},{Cookie:cookie});
 return {enabled:who.data.invoice_enabled,placed};
}

test('D-79: invoice payment only with the VAT status filled; hidden and refused by the API otherwise; the owner can switch it off',{skip,timeout:300000},async()=>{
 const s=await startCrm();
 try{
  const settings=v=>writeFileSync(s.site+'/api/site-settings.json',JSON.stringify(v));
  settings({invoice_vat_note:''});
  let r=await placeInvoice(s);assert.equal(r.enabled,false,'no VAT status: invoice not offered');assert.notEqual(r.placed.status,200,'the API refuses an invoice order');
  assert.match(JSON.stringify(r.placed.data),/Оплата на рахунок ФОП зараз недоступна/);
  settings({invoice_vat_note:'ТЕСТОВИЙ СТАТУС ПДВ'});
  r=await placeInvoice(s);assert.equal(r.enabled,true,'VAT status filled: invoice offered');assert.equal(r.placed.status,200,JSON.stringify(r.placed.data));
  settings({invoice_vat_note:'ТЕСТОВИЙ СТАТУС ПДВ',invoice_payment:'off'});
  r=await placeInvoice(s);assert.equal(r.enabled,false,'switched off by the owner');assert.notEqual(r.placed.status,200);
  settings({invoice_vat_note:'ТЕСТОВИЙ СТАТУС ПДВ',invoice_payment:'anything-else'});
  r=await placeInvoice(s);assert.equal(r.enabled,true,'an unknown value means the default (auto)');
 }finally{s.stop();}
});

test('D-79: the storefront offers only card payment when invoice is off; the settings page has the switch',()=>{
 const html=readFileSync(path.join(root,'index.html'),'utf8'),live=html.match(/src="\/(assets\/shop-client\.[^"?]+\.js)/)[1],src=readFileSync(path.join(root,live),'utf8');
 const ctx={};vm.runInNewContext(src.match(/function storeCheckoutPay\(e\)\{[^\n]*?\}(?=\n|function )/)[0]+';this.pay=storeCheckoutPay;',ctx);
 assert.equal(ctx.pay({pay:'invoice',monoEnabled:true,invoiceEnabled:false}),'card','a remembered invoice choice falls back to card');
 assert.equal(ctx.pay({pay:'invoice',monoEnabled:true,invoiceEnabled:true}),'invoice');
 assert.equal(ctx.pay({pay:'card',monoEnabled:false,invoiceEnabled:true}),'invoice');
 assert.match(src,/\(e\.invoiceEnabled\?\[\{k:'invoice'/,'the invoice option only when enabled');
 assert.match(src,/invoiceEnabled:t\.invoice_enabled===true/,'the flag comes from the server');
 const settingsPage=readFileSync(path.join(root,'shop/settings.php'),'utf8');assert.match(settingsPage,/name="invoice_payment"/);assert.match(settingsPage,/Оплата на рахунок ФОП/);
});
