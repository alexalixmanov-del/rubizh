// Q-7 order idempotency (owner rule 2026-10-11): one key per checkout attempt. A double click and a network retry (the
// server made the order but the answer was lost; retried in place or after a reload of the tab) give ONE order; a
// deliberate repeat purchase after success gives a NEW order. Real browser, isolated MySQL fixture, MonoPay mock.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {startSite,php} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64');

test('order idempotency: double click and lost-response retries (in place and after reload) give one order; a repeat purchase gives a new one',{skip,timeout:240000},async()=>{
 const {chromium}=await import('playwright');
 const site=await startSite({enableV3:false,extraConfig:",'mono_mock'=>true,'environment'=>'staging','staging_allow_loopback'=>true"});let browser;
 try{
  const p={id:'idem-cap',slug:'idem-cap',canonical_category_id:'clothing_headwear',name:'Кепка Повтор',brand:'QA',category:'Одяг та форма / Головні убори',category_path:['Одяг та форма','Головні убори'],description:'Тест.',photos:['https://img.test/cap.png'],
   variants:['M','L'].map(size=>({sku:'IDEM-'+size,color:'Олива',size,size_display:size,price:900,availability:'in',stock:20,photos:['https://img.test/cap.png']}))};
  php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${site.site}/auth/bootstrap.php';require_once '${site.site}/api/lib.php';save_product(db(),json_decode(${JSON.stringify(JSON.stringify(p))},true));`);
  writeFileSync(site.site+'/router.php',`<?php $p=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);if(str_starts_with($p,'/api/')){require __DIR__.'/api/index.php';return;}if($p==='/'||preg_match('~^/(?:product|catalog)(?:/.*)?$~',$p)){require __DIR__.'/storefront.php';return;}return false;`);
  browser=await chromium.launch({executablePath:(process.env.CHROMIUM_PATH||'/usr/bin/chromium'),args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1280,height:900}});await context.route(/^https:\/\/pay\.(?:mbnk\.biz|monobank\.ua)\//,r=>r.fulfill({contentType:'text/html',body:'<title>MonoPay stub</title>'}));// never leave the machine
  await context.route('https://img.test/**',r=>r.fulfill({contentType:'image/png',body:png}));
  const page=await context.newPage();
  const orders=()=>+site.sql('SELECT COUNT(*) n FROM rubizh_customer_orders')[0].n;
  const add=async()=>{await page.goto(site.base+'/product/idem-cap');await page.locator('[data-size-grid]').getByText('M',{exact:true}).click();await page.getByRole('button',{name:/До кошика/}).first().click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('rubizh.cart')||'[]').length===1);};
  const fill=async()=>{await page.goto(site.base+'/#cart');const c=page.getByRole('button',{name:/Оформити/}).first();if(await c.count())await c.click();
   await page.locator('input[name="name"]').fill('Тест Покупець');await page.locator('input[name="phone"]').fill('+380671234567');
   await page.locator('input[name="city"]').fill('Київ');await page.locator('input[name="address"]').fill('Відділення 1');};
  const place=()=>page.getByRole('button',{name:/Підтвердити замовлення/}).first();
  const submit=async()=>{const r=page.waitForResponse(x=>x.url().endsWith('/shop/order.php'));await place().click();return (await (await r).json());};

  // 1. Double click: one order; every request of the attempt carries the same key.
  await add();await fill();const sent=[];page.on('request',r=>{if(r.url().endsWith('/shop/order.php'))sent.push(r);});
  const done=page.waitForResponse(x=>x.url().endsWith('/shop/order.php'));await place().dblclick();const first=await (await done).json();
  await page.waitForTimeout(800);assert.equal(first.ok,true,JSON.stringify(first));assert.equal(orders(),1,'double click → one order');
  assert.equal(new Set(sent.map(r=>JSON.parse(r.postData()).request_id)).size,1,'one key per attempt');

  // 2. Lost response: the server makes the order, the browser sees a network error, the buyer retries in place.
  await add();await fill();let lose=true;
  await page.route('**/shop/order.php',async r=>{if(lose){lose=false;await r.fetch();return r.abort('failed');}return r.continue();});
  await place().click();await page.waitForTimeout(1500);assert.equal(orders(),2,'the lost attempt did create its order');
  const retry=await submit();assert.equal(retry.ok,true,JSON.stringify(retry));assert.equal(orders(),2,'retry in place → the same order');
  assert.equal(retry.order.number,site.sql('SELECT order_number FROM rubizh_customer_orders ORDER BY id DESC LIMIT 1')[0].order_number);

  // 3. Lost response, then the buyer reloads the tab and submits again: still the same order.
  await add();await fill();lose=true;await place().click();await page.waitForTimeout(1500);assert.equal(orders(),3);
  await page.reload();await fill();const again=await submit();assert.equal(again.ok,true,JSON.stringify(again));assert.equal(orders(),3,'retry after reload → the same order');
  await page.unroute('**/shop/order.php');

  // 3b. Stale second tabs, both loaded with the cart BEFORE the first tab orders and never reloaded afterwards:
  // unchanged → resends the ordered cart's key (the same order, D-18); edited in place → a new purchase (not a 409 replay).
  const inPage=async p=>{const c=p.getByRole('button',{name:/Оформити/}).first();if(await c.count())await c.click();
   await p.locator('input[name="name"]').fill('Тест Покупець');await p.locator('input[name="phone"]').fill('+380671234567');await p.locator('input[name="city"]').fill('Київ');await p.locator('input[name="address"]').fill('Відділення 1');
   const r=p.waitForResponse(x=>x.url().endsWith('/shop/order.php'));await p.getByRole('button',{name:/Підтвердити замовлення/}).first().click();return (await (await r).json());};
  await add();const unchanged=await context.newPage(),edited=await context.newPage();
  for(const p of [unchanged,edited]){await p.goto(site.base+'/#cart');await p.locator('input[name="name"]').waitFor();}
  await fill();const ordered=await submit();assert.equal(ordered.ok,true,JSON.stringify(ordered));const before=orders();
  const same=await inPage(unchanged);assert.equal(same.ok,true,JSON.stringify(same));assert.equal(same.order.number,ordered.order.number,'an unchanged stale tab gets the same order');assert.equal(orders(),before);
  // Edit in place: in-app navigation (no reload) to the product, add size L, back to checkout; the tab's memory survives.
  await edited.evaluate(()=>{window.__sameDocument=1;history.pushState({},'','/product/idem-cap');dispatchEvent(new PopStateEvent('popstate'));});
  await edited.locator('[data-size-grid]').getByText('L',{exact:true}).click();await edited.getByRole('button',{name:/До кошика/}).first().click();
  await edited.waitForFunction(()=>JSON.parse(localStorage.getItem('rubizh.cart')||'[]').length===2);await edited.goBack();await edited.locator('input[name="name"]').waitFor();
  assert.equal(await edited.evaluate(()=>window.__sameDocument),1,'the stale tab was never reloaded');
  const fresh=await inPage(edited);
  assert.equal(fresh.ok,true,'an edited stale cart is a new purchase, not a refused replay: '+JSON.stringify(fresh));assert.equal(orders(),before+1);assert.notEqual(fresh.order.number,ordered.order.number);
  await unchanged.close();await edited.close();

  // 4. Deliberate repeat purchase of the identical item after success: a new order.
  await add();await fill();const repeat=await submit();assert.equal(repeat.ok,true,JSON.stringify(repeat));
  assert.equal(orders(),6,'a deliberate repeat purchase is a new order');assert.notEqual(repeat.order.number,again.order.number);
  // Q-7: confirmed stock paid by card goes straight to MonoPay (stub page; never leaves the machine), with one invoice.
  await page.waitForURL(/^https:\/\/pay\.mbnk\.biz\//,{timeout:10000});
  assert.equal(+site.sql(`SELECT COUNT(*) n FROM rubizh_mono_invoices i JOIN rubizh_customer_orders o ON o.id=i.order_id WHERE o.order_number='${repeat.order.number}'`)[0].n,1);
 }finally{await browser?.close();site.stop();}
});
