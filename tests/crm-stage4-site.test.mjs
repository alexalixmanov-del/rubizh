// Stage 4, block 4-SITE: storefront and payment fixes D-50…D-54 (regression-first).
import {test} from 'node:test';import assert from 'node:assert/strict';import {chromium} from 'playwright';
import {startCrm,line} from './helpers/crm-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;

test('D-50: payment return, settings and NP manager pages allow their own scripts; receipt reloads after the bank status changes',{skip,timeout:240000},async()=>{
 const s=await startCrm();const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  for(const page of ['/shop/payment-return.php?order=1','/shop/settings.php','/shop/np-manager.php']){
   const r=await fetch(s.base+page);const csp=r.headers.get('content-security-policy')||'';
   assert.match(csp,/script-src 'self'/,page+': same-origin scripts are allowed');assert.doesNotMatch(csp,/script-src[^;]*'unsafe-inline'/,page+': no inline scripts');assert.match(csp,/img-src 'self'/,page);assert.match(csp,/connect-src 'self'/,page);
  }
  const o=await s.checkout([line()]);const owner=await s.login('OWNER');let v=(await owner.get('/orders/'+o.id)).data.data;await owner.send('/orders/'+o.id+'/invoice',{version:v.version});
  const ctx=await browser.newContext();await ctx.addCookies([{name:o.cookie.split('=')[0],value:o.cookie.split('=').slice(1).join('='),url:s.base}]);const page=await ctx.newPage();
  await page.addInitScript(()=>{window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective+' '+e.blockedURI));});
  const step=m=>process.env.RUBIZH_TEST_TRACE&&console.error('D-50 step',m);step('goto');
  await page.goto(s.base+'/shop/payment-return.php?order='+o.id,{timeout:30000});step('loaded');
  assert.deepEqual(await page.evaluate(()=>window.__csp),[],'no CSP violations on the receipt page');
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme!==undefined||!!document.querySelector('script[src*="theme.js"]')),true);
  const inv=s.sql('SELECT * FROM rubizh_mono_invoices')[0];assert.equal((await s.webhook(inv)).status,200);
  step('webhook');const reload=page.waitForEvent('load',{timeout:20000});await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await reload;step('reloaded');
  assert.deepEqual(await page.evaluate(()=>window.__csp),[],'still no violations after reload');
  assert.match(await page.content(),/оплачено|Оплачено/,'receipt shows the paid state after the automatic reload');
  await ctx.close();
 }finally{await browser.close();s.stop();}
});

// ---- D-51: FOP-invoice orders get a reconciliation period after payment_due; OWNER/ACCOUNTANT accept the payment ----
import {php} from './helpers/site-fixture.mjs';import {readFileSync} from 'node:fs';import {root} from './helpers/site-fixture.mjs';
const asInvoice=(s,id)=>{s.sql(`UPDATE rubizh_order_details SET contact_json=JSON_SET(contact_json,'$.payment','invoice') WHERE order_id=${id}`);};
const tick=s=>php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${s.site}/auth/bootstrap.php';shopLifecycleTick(shopStoreDatabase());`);
const due=(s,id,sql)=>s.sql(`UPDATE rubizh_order_timing SET payment_due=${sql},remind_at=${sql} WHERE order_id=${id}`);
test('D-51: an overdue FOP invoice waits N working days for the bank statement; a card order is cancelled at the deadline as before',{skip,timeout:240000},async()=>{
 const s=await startCrm({stock:20});
 try{
  const inv=await s.checkout([line()]),card=await s.checkout([line()]);asInvoice(s,inv.id);
  due(s,inv.id,'UTC_TIMESTAMP()-INTERVAL 1 HOUR');due(s,card.id,'UTC_TIMESTAMP()-INTERVAL 1 HOUR');tick(s);
  assert.notEqual(s.sql('SELECT status FROM rubizh_customer_orders WHERE id='+inv.id)[0].status,'cancelled','invoice order waits for the statement');
  assert.equal(s.sql('SELECT status FROM rubizh_customer_orders WHERE id='+card.id)[0].status,'cancelled','card order unchanged: cancelled at the deadline');
  const owner=await s.login('OWNER');assert.equal((await owner.get('/orders/'+inv.id)).data.data.display.payment.label,'потребує звірки виписки');
  due(s,inv.id,'UTC_TIMESTAMP()-INTERVAL 10 DAY');tick(s);
  assert.equal(s.sql('SELECT status FROM rubizh_customer_orders WHERE id='+inv.id)[0].status,'cancelled','cancelled only after the reconciliation period');
 }finally{s.stop();}
});
test('D-51: accepting a FOP payment — in time, during reconciliation, after final cancellation, lapsed reserve with/without stock, roles, repeats',{skip,timeout:300000},async()=>{
 const s=await startCrm({stock:20});
 try{
  const owner=await s.login('OWNER'),acc=await s.login('ACCOUNTANT'),man=await s.login('MANAGER');const key=()=>crypto.randomUUID().replaceAll('-','');
  const accept=(who,id,extra={})=>who.get('/orders/'+id).then(r=>who.send('/orders/'+id+'/accept-invoice-payment',{expected_version:r.data.data.version,request_id:key(),amount_minor:r.data.data.total_minor,paid_on:new Date().toISOString().slice(0,10),document:'PP-1001',reason:'Оплата за випискою банку',...extra}));
  const a=await s.checkout([line()]);asInvoice(s,a.id);
  assert.equal((await accept(man,a.id)).status,403,'MANAGER cannot accept money');
  const ok1=await accept(acc,a.id);assert.equal(ok1.status,200,JSON.stringify(ok1.data));assert.equal(ok1.data.data.display.payment.code,'PAID');
  assert.equal(s.sql('SELECT status FROM rubizh_stock_reservations WHERE order_id='+a.id)[0].status,'COMMITTED');
  const again=await accept(acc,a.id);assert.equal(again.status,200,JSON.stringify(again.data));assert.equal((await accept(acc,a.id,{document:'PP-2002'})).data.error.code,'INVOICE_ALREADY_ACCEPTED','a different statement for a paid order is refused');
  assert.equal(+s.sql('SELECT COUNT(*) n FROM rubizh_invoice_payments')[0].n,1);
  const b=await s.checkout([line()]);asInvoice(s,b.id);due(s,b.id,'UTC_TIMESTAMP()-INTERVAL 1 HOUR');tick(s);
  s.sql("UPDATE rubizh_stock_reservations SET expires_at=UTC_TIMESTAMP()-INTERVAL 1 HOUR WHERE order_id="+b.id);
  const ok2=await accept(owner,b.id);assert.equal(ok2.status,200,'reconciliation period: '+JSON.stringify(ok2.data));assert.equal(s.sql('SELECT status FROM rubizh_stock_reservations WHERE order_id='+b.id)[0].status,'COMMITTED');
  const c=await s.checkout([line()]);asInvoice(s,c.id);s.sql("UPDATE rubizh_stock_reservations SET expires_at=UTC_TIMESTAMP()-INTERVAL 1 HOUR WHERE order_id="+c.id);
  s.sql("UPDATE variants SET pim_stock_quantity=0,pim_effective_availability='OUT_OF_STOCK',pim_order_submission_allowed=0,pim_payment_allowed=0 WHERE sku='RUB-F0001'");
  const gone=await accept(owner,c.id);assert.equal(gone.data.error.code,'STOCK_UNAVAILABLE');assert.equal(gone.data.error.details.suggest,'REFUND');assert.match(gone.data.error.message,/повернення коштів/);
  s.sql("UPDATE variants SET pim_stock_quantity=20,pim_effective_availability='IN_STOCK',pim_order_submission_allowed=1,pim_payment_allowed=1 WHERE sku='RUB-F0001'");
  const e=await s.checkout([line()]);asInvoice(s,e.id);due(s,e.id,'UTC_TIMESTAMP()-INTERVAL 10 DAY');tick(s);
  assert.equal((await accept(owner,e.id)).data.error.code,'ORDER_CANCELLED','after the final cancellation the payment is refused (refund the transfer)');
  assert.equal((await accept(owner,a.id,{amount_minor:1})).status,409);
 }finally{s.stop();}
});
test('D-51: reservation conflict message is Ukrainian',()=>{
 const src=readFileSync(root+'/shop/reservations.php','utf8');assert.doesNotMatch(src,/Reservation differs; explicit inventory review required/);assert.match(src,/Резерв для цього замовлення/);
});

// ---- D-52: with a status-only stock (no quantity) only up to direct_pay_max_qty pieces per SKU are paid directly ----
test('D-52: unknown stock quantity — ≤3 pcs per SKU pay now, more waits for the manager; known quantity unchanged; no API bypass',{skip,timeout:300000},async()=>{
 const s=await startCrm({stock:50});
 try{
  const statusOnly=()=>s.sql("UPDATE variants SET pim_stock_quantity=NULL,pim_stock_status='CONFIRMED_BY_STATUS',pim_effective_availability='IN_STOCK',pim_payment_allowed=1,pim_order_submission_allowed=1 WHERE sku='RUB-F0001'");
  statusOnly();
  const state=id=>s.sql('SELECT status,pim_order_state FROM rubizh_customer_orders WHERE id='+id)[0];
  const one=await s.checkout([{...line(),qty:1}]);assert.equal(state(one.id).pim_order_state,'CONFIRMED','1 pc pays now');
  const three=await s.checkout([{...line(),qty:3}]);assert.equal(state(three.id).pim_order_state,'CONFIRMED','3 pcs pay now');
  const four=await s.checkout([{...line(),qty:4}]);assert.equal(state(four.id).pim_order_state,'WAITING_CONFIRMATION','4 pcs wait for the manager');
  assert.match(four.receipt.title,/Для такої кількості менеджер підтвердить наявність перед оплатою/);
  const split=await s.checkout([{...line(),qty:2},{...line(),qty:2}]);assert.equal(state(split.id).pim_order_state,'WAITING_CONFIRMATION','same SKU in two lines is summed');
  const unit=await s.checkout([{...line(),qty:4,kit_units:4}]);assert.equal(state(unit.id).pim_order_state,'WAITING_CONFIRMATION','«Для підрозділу» N counts all pieces');
  const start=await s.post('/shop/payment-start.php',{csrf:four.csrf,order_id:four.id},{Cookie:four.cookie});assert.notEqual(start.status,200,'no MonoPay before the manager confirms');assert.equal(+s.sql('SELECT COUNT(*) n FROM rubizh_mono_invoices WHERE order_id='+four.id)[0].n,0);
  const m=await s.login('MANAGER');const tab=(await m.get('/orders?view=confirmation')).data.data.rows.map(o=>o.id);assert.ok(tab.includes(four.id)&&tab.includes(split.id),'CRM lists them under «Очікують підтвердження»');
  s.sql("UPDATE variants SET pim_stock_quantity=50 WHERE sku='RUB-F0001'");
  const known=await s.checkout([{...line(),qty:5}]);assert.equal(state(known.id).pim_order_state,'CONFIRMED','known quantity: reserve by number, unchanged');
 }finally{s.stop();}
});
