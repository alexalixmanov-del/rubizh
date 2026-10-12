// Q-8 / D-11 (owner decision 2026-10-11): the kit builder shows the same K1/K2 result the server charges. Two models of one
// main section → hint «Додайте річ ще з одного розділу…» and no discount; two main sections + «Дрібниці» → kit price on all.
// The checkout quote (server) equals the builder total. Isolated MySQL fixture, legacy PIM pricing, synthetic products.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {startSite,php,wire,publish} from './helpers/site-fixture.mjs';
import {startCrm,line as crmLine} from './helpers/crm-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64');
const v=(sku,size)=>({sku,price:1000,site_price:1000,minimum_sale_price:700,pricing_policy_version:1,discount_margin_floor_pct:15,kit_price:800,size,color:'Олива',stock:20,availability:'in'});
const p=(id,name,category,size)=>({id,name,pricing_policy_version:1,category,description:'Тест.',variants:[v(id+'-'+size,size)],photos:['https://img.test/'+id+'.png']});
const products=[p('q8-jacket','Куртка Q8','Одяг та форма / Куртки','L'),p('q8-shirt','Сорочка Q8','Одяг та форма / Сорочки','L'),p('q8-boots','Берці Q8','Взуття / Берці','43'),p('q8-gloves','Рукавички Q8','Аксесуари одягу / Рукавички','L')];
const kitLines=items=>items.map(([slot,id,size],i)=>({uid:'k'+(i+1),slot,id,size,qty:1}));
const SAME=kitLines([['body','q8-jacket','L'],['body','q8-shirt','L']]);
const QUAL=kitLines([['body','q8-jacket','L'],['boots','q8-boots','43'],['small','q8-gloves','L']]);
const EXTRA=QUAL.map((l,i)=>({...l,qty:i===0?3:1}));
const money=s=>Number(String(s).replace(/[^\d,.-]/g,'').replace(',','.'));
let site,browser;
before(async()=>{if(skip)return;
 site=await startSite({enableV3:false,extraConfig:",'mono_mock'=>true,'environment'=>'staging','staging_allow_loopback'=>true,'shop_promo_codes'=>['SAFE'=>5]"});
 const r=await site.post('/api/pim/sync',{settings:{pricing_policy_version:1,discount_margin_floor_pct:15},products},site.auth);assert.equal(r.status,200,JSON.stringify(r.data).slice(0,300));
 writeFileSync(site.site+'/router.php',`<?php $p=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);if(str_starts_with($p,'/api/')){require __DIR__.'/api/index.php';return;}if($p==='/'||preg_match('~^/(?:product|catalog|kit)(?:/.*)?$~',$p)){require __DIR__.'/storefront.php';return;}return false;`);
 const {chromium}=await import('playwright');browser=await chromium.launch({executablePath:(process.env.CHROMIUM_PATH||'/usr/bin/chromium'),args:['--no-sandbox']});});
after(async()=>{await browser?.close();site?.stop();});
async function builder(width,kit){
 const mobile=width<768,context=await browser.newContext({viewport:{width,height:mobile?780:900},...(mobile?{isMobile:true,hasTouch:true}:{})});
 await context.route('https://img.test/**',r=>r.fulfill({contentType:'image/png',body:png}));
 await context.route(/^https:\/\/pay\.(?:mbnk\.biz|monobank\.ua)\//,r=>r.fulfill({contentType:'text/html',body:'<title>MonoPay stub</title>'}));
 await context.addInitScript(k=>{try{localStorage.setItem('rubizh.kitIntro','1');localStorage.setItem('rubizh.kit',JSON.stringify(k));}catch{}},kit);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(site.base+'/kit');await page.locator('[data-kit-goods]').waitFor();await page.waitForFunction(()=>/\d/.test(document.querySelector('[data-kit-goods]')?.innerText||''));await page.waitForLoadState('networkidle');await page.waitForTimeout(400);
 return {page,context,errors};
}
const summary=async page=>({goods:money(await page.locator('[data-kit-goods]').innerText()),total:money(await page.locator('[data-kit-total]').innerText()),
 discount:await page.locator('[data-kit-discount]').count()?money(await page.locator('[data-kit-discount]').innerText()):0,hint:await page.locator('[data-kit-price-hint]').count()?await page.locator('[data-kit-price-hint]').innerText():''});

for(const width of [360,390,430,768,1024,1280,1440]){
 test(`Q-8 builder @${width}: two models of one section show the hint and no discount; two sections + «Дрібниці» get the kit price on all; extra units stay retail in builder/cart`,{skip,timeout:120000},async()=>{
  let b=await builder(width,SAME);
  try{const s=await summary(b.page);assert.deepEqual([s.goods,s.discount,s.total],[2000,0,2000]);assert.match(s.hint,/Додайте річ ще з одного розділу, щоб отримати ціну комплекту/);
   assert.equal(await b.page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),true,'no horizontal scroll');assert.deepEqual(b.errors,[]);}finally{await b.context.close();}
  b=await builder(width,QUAL);
  try{const s=await summary(b.page);assert.deepEqual([s.goods,s.discount,s.total],[3000,600,2400]);assert.equal(s.hint,'','no hint once the kit qualifies');assert.deepEqual(b.errors,[]);}finally{await b.context.close();}
  b=await builder(width,EXTRA);
  try{const s=await summary(b.page);assert.deepEqual([s.goods,s.discount,s.total],[5000,600,4400]);assert.match(s.hint,/одну одиницю кожної речі/);
   await b.page.getByRole('button',{name:/Додати комплект до кошика/i}).first().click();await b.page.getByText('До сплати',{exact:true}).waitFor();
   assert.equal(money(await b.page.getByText('До сплати',{exact:true}).locator('..').innerText()),4400,'cart total includes retail extra units');
   assert.equal(await b.page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),true,'cart has no horizontal scroll');assert.deepEqual(b.errors,[]);
  }finally{await b.context.close();}
 });
}

test('Q-8: placing the builder kit succeeds with the server total equal to the builder total (no PRICE_CHANGED)',{skip,timeout:180000},async()=>{
 for(const [kit,expected] of [[QUAL,2400],[SAME,2000]]){
  const b=await builder(1280,kit);
  try{
   await b.page.getByRole('button',{name:/Додати комплект до кошика/i}).first().click();
   await b.page.waitForFunction(n=>JSON.parse(localStorage.getItem('rubizh.cart')||'[]').length===n,kit.length);
   await b.page.goto(site.base+'/#cart');const c=b.page.getByRole('button',{name:/Оформити/}).first();if(await c.count())await c.click();
   await b.page.locator('input[name="name"]').fill('Тест Покупець');await b.page.locator('input[name="phone"]').fill('+380671234567');
   await b.page.locator('input[name="city"]').fill('Київ');await b.page.locator('input[name="address"]').fill('Відділення 1');
   const sent=b.page.waitForResponse(r=>r.url().endsWith('/shop/order.php'),{timeout:20000});
   await b.page.getByRole('button',{name:/Підтвердити замовлення/}).first().click();
   const o=await (await sent).json();assert.equal(o.ok,true,'the client total matched the server: '+JSON.stringify(o).slice(0,300));
   assert.equal(Number(o.order.total),expected,'server total = builder total');
  }finally{await b.context.close();}
 }
});

test('Q-8 unit builder: N kits grant N units per model and keep remaining units retail in cart and server quote',{skip,timeout:60000},async()=>{
 const b=await builder(390,EXTRA);
 try{
  await b.page.getByText('Для підрозділу',{exact:true}).click();await b.page.getByText('Кількість комплектів',{exact:true}).locator('input').fill('3');
  await b.page.getByRole('button',{name:/Додати комплект до кошика/i}).first().click();await b.page.getByText('До сплати',{exact:true}).waitFor();
  assert.equal(money(await b.page.getByText('До сплати',{exact:true}).locator('..').innerText()),13200);
  const cart=await b.page.evaluate(()=>JSON.parse(localStorage.getItem('rubizh.cart')||'[]'));assert.deepEqual(cart.map(l=>[l.qty,l.kitQty,l.kitUnits]),[[9,3,3],[3,3,3],[3,3,3]]);
  const q=await b.page.evaluate(async lines=>{const c=await (await fetch('/shop/customer.php')).json();return await (await fetch('/shop/checkout-quote.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({csrf:c.csrf,lines})})).json();},cart.map(l=>({product_id:l.id,sku:l.sku,qty:l.qty,price_mode:'kit',kit_group:l.kitId,kit_units:l.kitUnits})));
  assert.equal(q.ok,true,JSON.stringify(q));assert.equal(q.quote.total,13200);
 }finally{await b.context.close();}
});

// Old saved drafts and shared links contain quantities, not authoritative prices. Recalculate them and explain K2.
test('Q-8 restored draft and shared link: extra units recalculate with a buyer explanation before checkout',{skip,timeout:120000},async()=>{
 const b=await builder(390,EXTRA);
 try{
  const s=await summary(b.page);assert.deepEqual([s.goods,s.discount,s.total],[5000,600,4400]);
  assert.match(s.hint,/одну одиницю кожної речі/,'explain why extra units lost their old kit price');
  const lines=EXTRA.map(l=>({product_id:l.id,sku:l.id+'-'+l.size,qty:l.qty,slot:l.slot}));
  const shared=await b.page.evaluate(async lines=>{const c=await (await fetch('/shop/customer.php')).json();return await (await fetch('/shop/kits.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({csrf:c.csrf,lines})})).json();},lines);
  assert.equal(shared.ok,true,JSON.stringify(shared));await b.page.goto(shared.url.replace('https://rubizh.shop',site.base));
  await b.page.waitForFunction(()=>document.querySelector('[data-kit-total]')?.innerText.replace(/[^0-9]/g,'')==='4400');
  assert.match((await summary(b.page)).hint,/одну одиницю кожної речі/,'shared link gets the same explanation');
 }finally{await b.context.close();}
});

test('Q-8 restored repeated model: a whole extra line is retail and explains the lost kit price',{skip,timeout:60000},async()=>{
 const b=await builder(390,[...QUAL,{...QUAL[0],uid:'extra-jacket'}]);
 try{const s=await summary(b.page);assert.deepEqual([s.goods,s.discount,s.total],[4000,600,3400]);assert.match(s.hint,/одну одиницю кожної речі/);}finally{await b.context.close();}
});

test('Q-8 HTTP boundary: catalog slots and PIM prices override forged flags; extra units, unit counts and stale quotes are authoritative',{skip,timeout:120000},async()=>{
 const who=await site.get('/shop/customer.php'),headers={Cookie:who.headers.get('set-cookie').split(';')[0]},csrf=who.data.csrf;
 const line=(id,qty=1,extra={})=>({product_id:id,sku:id+'-'+(id==='q8-boots'?'43':'L'),qty,price_mode:'kit',kit_group:'q8-http',...extra});
 const quote=lines=>site.post('/shop/checkout-quote.php',{csrf,lines},headers);
 // Neither forged slot/legacy markers nor forged PIM prices can turn one model or body+small into a kit.
 for(const lines of [[line('q8-jacket',2,{kit_slot:'head',kit_legacy:true,price:1,kit_price:1})],[line('q8-jacket'),line('q8-gloves',1,{kit_slot:'boots',kit_legacy:true})],[line('q8-jacket'),line('q8-shirt',1,{kit_slot:'head'})]]){
  const r=await quote(lines);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.quote.total,2000);assert.ok(r.data.quote.lines.every(l=>l.price_mode==='retail'));
 }
 let r=await quote([line('q8-jacket'),line('q8-shirt'),line('q8-boots')]);assert.equal(r.data.quote.total,2400,'every model from one slot receives one kit unit when another main slot exists');
 r=await site.post('/shop/checkout-quote.php',{csrf,lines:[line('q8-jacket'),line('q8-boots')],promo:'SAFE'},headers);assert.equal(r.data.error_code,'DISCOUNT_NOT_ALLOWED');assert.match(r.data.error,/не сумується/,'active promo cannot stack with a qualified kit');
 r=await quote([line('q8-jacket',1,{price_mode:'wholesale',_approved_wholesale_tier:0}),line('q8-boots')]);assert.equal(r.data.error_code,'DISCOUNT_NOT_ALLOWED');assert.match(r.data.error,/менеджер/,'buyer cannot approve a wholesale tier');
 r=await quote([line('q8-jacket',3),line('q8-boots'),line('q8-gloves')]);assert.equal(r.data.quote.total,4400);assert.deepEqual(r.data.quote.lines.map(l=>[l.price_mode,l.qty,l.input_index]),[['kit',1,0],['retail',2,0],['kit',1,1],['kit',1,2]]);
 r=await quote([line('q8-jacket',4,{kit_units:3}),line('q8-boots',3,{kit_units:3})]);assert.equal(r.data.quote.total,5800);
 r=await quote([line('q8-jacket',2,{kit_units:2}),line('q8-boots',3,{kit_units:3})]);assert.equal(r.data.error_code,'INVALID_KIT');assert.match(r.data.error,/однаковою/);
 const order={csrf,request_id:crypto.randomUUID().replaceAll('-',''),contact:{name:'Тест Покупець',recipient:'Тест Покупець',phone:'+380671234567',city:'Київ',address:'Відділення 1',delivery_type:'branch'},payment:'invoice',lines:[line('q8-jacket',3),line('q8-boots')],expected_total:3200};
 const count=()=>+site.sql('SELECT COUNT(*) n FROM rubizh_customer_orders')[0].n,before=count();
 r=await site.post('/shop/order.php',order,headers);assert.equal(r.status,409);assert.equal(r.data.error_code,'PRICE_CHANGED');assert.equal(r.data.quote.total,3600);assert.match(r.data.error,/решта — за звичайною ціною/);assert.equal(count(),before,'stale total must not place an order');
 r=await site.post('/shop/order.php',{...order,expected_total:3600},headers);assert.equal(r.status,200,JSON.stringify(r.data));
 const id=+site.sql(`SELECT id FROM rubizh_customer_orders WHERE order_number='${r.data.order.number}'`)[0].id;
 // Validate the exact persisted split order using the same transaction service used by CRM confirmation/invoice.
 const validate=id=>JSON.parse(php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${site.site}/auth/bootstrap.php';require_once '${site.site}/shop/store-lib.php';$db=shopStoreDatabase();$o=npOrder($db,${id});$db->beginTransaction();$v=shopValidateOrder($db,$o['items'],'confirmation',$o);$db->rollBack();echo json_encode(['changed'=>$v['price_changed'],'total'=>$v['quote']['total'],'modes'=>array_column($v['quote']['lines'],'price_mode')]);`).stdout);
 const saved=site.sql(`SELECT items_json,total FROM rubizh_customer_orders WHERE id=${id}`);assert.deepEqual(validate(id),{changed:false,total:3600,modes:['kit','retail','kit']});assert.deepEqual(site.sql(`SELECT items_json,total FROM rubizh_customer_orders WHERE id=${id}`),saved,'validation does not mutate stored monetary data');
 // Synthetic pre-Q8 placed order, where three jacket units were all kit-priced. This is isolated fixture data.
 const legacy=php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${site.site}/auth/bootstrap.php';require_once '${site.site}/shop/store-lib.php';$db=shopStoreDatabase();$db->beginTransaction();$v=shopValidateOrder($db,[['product_id'=>'q8-jacket','sku'=>'q8-jacket-L','qty'=>3,'kit_group'=>'old-kit','price_mode'=>'kit']]);$db->rollBack();$items=$v['quote']['lines'];unset($items[0]['kit_status']);$items[0]['price_mode']='kit';$items[0]['price']=800;$items[0]['amount']=2400;$q=$db->prepare("INSERT INTO rubizh_customer_orders(external_id,email,order_number,status,payment_status,total,currency,items_json,delivery_label,created_at,updated_at) VALUES('fixture-q8-old','','RB-Q8-OLD','new','pending',2400,'UAH',?,'fixture',UTC_TIMESTAMP(),UTC_TIMESTAMP())");$q->execute([json_encode($items)]);echo $db->lastInsertId();`).stdout;
 const old=site.sql(`SELECT items_json,total FROM rubizh_customer_orders WHERE id=${Number(legacy)}`);assert.deepEqual(validate(Number(legacy)),{changed:false,total:2400,modes:['kit']});assert.deepEqual(site.sql(`SELECT items_json,total FROM rubizh_customer_orders WHERE id=${Number(legacy)}`),old);
});

// PIM v3 structured kit_component is authoritative even when name heuristics put a filled IFAK pouch into gear.
test('Q-8 v3: builder and server use the same authoritative main slots instead of product-name heuristics',{skip,timeout:120000},async()=>{
 const v3=await startSite({extraConfig:",'environment'=>'staging','staging_allow_loopback'=>true"}),w=structuredClone(wire),gear=w.products.find(p=>p.id==='m-pouch'),med=structuredClone(gear);
 med.id=med.product_id=med.model_id='q8-ifak';med.slug='q8-ifak';med.name=med.marketing_name_uk=med.model_name='Підсумок Q8 IFAK з наповненням';med.kit_component='ifak';med.source_product_ids=['q8-ifak'];
 for(const v of med.variants)v.sku='Q8-'+v.sku;for(const c of med.colors)c.variant_skus=c.variant_skus.map(s=>'Q8-'+s);
 w.products=[gear,med];let context;
 try{
  assert.equal((await publish(v3,w)).status,200);
  writeFileSync(v3.site+'/router.php',`<?php $p=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);if(str_starts_with($p,'/api/')){require __DIR__.'/api/index.php';return;}if($p==='/kit'){require __DIR__.'/storefront.php';return;}return false;`);
  context=await browser.newContext({viewport:{width:390,height:844}});await context.route('https://rubizh.shop/**',r=>r.fulfill({contentType:'image/png',body:png}));
  const kit=[{uid:'gear',id:gear.id,slot:'gear',size:'RUB-F0021',qty:1},{uid:'med',id:med.id,slot:'med',size:'Q8-RUB-F0021',qty:1}];
  await context.addInitScript(k=>{localStorage.setItem('rubizh.kitIntro','1');localStorage.setItem('rubizh.kit',JSON.stringify(k));},kit);
  const page=await context.newPage();await page.goto(v3.base+'/kit');await page.locator('[data-kit-goods]').waitFor();await page.waitForLoadState('networkidle');await page.waitForTimeout(400);
  const q=await page.evaluate(async lines=>{const c=await (await fetch('/shop/customer.php')).json();return await (await fetch('/shop/checkout-quote.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({csrf:c.csrf,lines})})).json();},kit.map(l=>({product_id:l.id,sku:l.size,color_id:gear.variants.find(v=>v.sku==='RUB-F0021').color_id,qty:1,price_mode:'kit',kit_group:'v3-kit'})));
  assert.equal(q.ok,true,JSON.stringify(q));assert.equal(q.quote.total,2480);assert.deepEqual(q.quote.lines.map(l=>l.kit_slot),['gear','med']);
  assert.equal((await summary(page)).total,q.quote.total,'client eligibility must match canonical server slots');
 }finally{await context?.close();v3.stop();}
});

test('Q-8 CRM HTTP: manager confirmation and invoice preserve the stored split kit amounts',{skip,timeout:120000},async()=>{
 const crm=await startCrm();
 try{
  const group={kit_group:'q8-crm',price_mode:'kit'},p=crm.wire.products.find(p=>p.id==='m-pouch'),v=p.variants.find(v=>v.sku==='RUB-F0020');
  const o=await crm.checkout([{...crmLine(),...group,qty:3},{product_id:p.id,sku:v.sku,color_id:v.color_id,qty:1,...group}]);
  const snapshot=()=>{const r=crm.sql(`SELECT items_json,total FROM rubizh_customer_orders WHERE id=${o.id}`)[0];return {total:r.total,lines:JSON.parse(r.items_json).map(l=>[l.sku,l.qty,l.price,l.amount,l.price_mode])};};
  const saved=snapshot();assert.equal(saved.total,'9430.00');assert.deepEqual(saved.lines,[['RUB-F0001',1,2470,2470,'kit'],['RUB-F0001',2,2860,5720,'retail'],['RUB-F0020',1,1240,1240,'kit']]);
  const manager=await crm.login('MANAGER');let current=(await manager.get('/orders/'+o.id)).data.data;
  const confirmed=await manager.send('/orders/'+o.id+'/confirm',{version:current.version,availability_confirmed:true,extra_delivery_agreed:false});assert.equal(confirmed.status,200,JSON.stringify(confirmed.data));assert.deepEqual(snapshot(),saved,'confirmation must preserve monetary snapshot');
  current=confirmed.data.data;const invoice=await manager.send('/orders/'+o.id+'/invoice',{version:current.version});assert.equal(invoice.status,200,JSON.stringify(invoice.data));assert.deepEqual(snapshot(),saved,'invoice must preserve monetary snapshot');
  assert.equal(Number(crm.sql(`SELECT amount FROM rubizh_mono_invoices WHERE order_id=${o.id}`)[0].amount),943000,'mock bank receives exact stored amount');
 }finally{crm.stop();}
});
