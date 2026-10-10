import {test} from 'node:test';import assert from 'node:assert/strict';
import {startSite,wire,publish} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const PRIVATE=/minimum_sale_price|minimum_cents|discount_margin_floor|fulfillment|supplier|stock_quantity|"stock":\s*\d|inventory_policy|availability_source|cost|payout|binding|provenance|_pricing/;

test('public MODEL DTO: colors own galleries, real SKU only, request options without SKU, whitelist only',{skip,timeout:120000},async()=>{
 const site=await startSite();
 try{
  assert.equal((await publish(site,wire)).status,200);
  const r=await site.get('/api/product/'+wire.products.find(p=>p.id==='m-jacket').slug);assert.equal(r.status,200,r.text);
  const p=r.data.product;assert.equal(p.contract_version,3);assert.equal(p.id,'m-jacket');
  assert.equal(p.colors.length,2);const black=p.colors.find(c=>c.color==='Чорний'),olive=p.colors.find(c=>c.color==='Олива');
  assert.deepEqual(black.photos.map(x=>x.url).sort(),wire.products.find(m=>m.id==='m-jacket').colors.find(c=>c.color==='Чорний').photos.slice().sort());
  assert.ok(!olive.photos.some(x=>black.photos.some(y=>y.url===x.url)),'gallery is per color');
  assert.deepEqual(black.skus.sort(),['RUB-F0001','RUB-F0002']);assert.deepEqual(olive.skus.sort(),['RUB-F0003','RUB-F0004']);
  const xl=p.variants.find(v=>v.sku==='RUB-F0004');assert.equal(xl.availability_v3,'OUT_OF_STOCK');assert.equal(xl.payment_allowed,false);assert.equal(xl.order_submission_allowed,false);
  const m=p.variants.find(v=>v.sku==='RUB-F0001');assert.equal(m.payment_allowed,true);assert.equal(m.price,2860);assert.equal(m.kit_price,2470);assert.equal(m.wholesale.length,2);
  assert.doesNotMatch(JSON.stringify(r.data),PRIVATE);
  const pants=(await site.get('/api/product/'+wire.products.find(p=>p.id==='m-pants').slug)).data.product;
  assert.equal(pants.size_options.length,10);assert.ok(pants.size_options.every(o=>o.payment_allowed===false&&o.order_submission_allowed===true&&!('sku' in o)));
  assert.equal(pants.variants.length,1,'no SKU fabricated for allowed sizes');
  const pouch=(await site.get('/api/product/'+wire.products.find(p=>p.id==='m-pouch').slug)).data.product;
  const pre=pouch.variants.find(v=>v.sku==='RUB-F0020');assert.equal(pre.availability_v3,'PREORDER');assert.equal(pre.delivery_lead_time_days,3);assert.equal(pre.payment_allowed,false);assert.equal(pre.requires_order_confirmation,true);
  assert.equal(pouch.variants.find(v=>v.sku==='RUB-F0021').ready_to_dispatch,true);
  const belt=(await site.get('/shop/catalog.php?action=product&slug='+wire.products.find(p=>p.id==='m-belt').slug)).data.product;
  assert.equal(belt.variants[0].availability_v3,'UNKNOWN');assert.equal(belt.variants[0].payment_allowed,false);assert.equal(belt.variants[0].size_display,'','NO_SIZE_REQUIRED has no fake One Size');
  assert.doesNotMatch(JSON.stringify(belt),PRIVATE);
 }finally{site.stop();}
});

test('catalog lists one card per MODEL, search by SKU finds the MODEL once, category from PIM ID without text inference',{skip,timeout:120000},async()=>{
 const site=await startSite();
 try{
  assert.equal((await publish(site,wire)).status,200);
  const all=await site.get('/shop/catalog.php');assert.equal(all.status,200,all.text);assert.equal(all.data.total,wire.products.length);
  assert.equal(new Set(all.data.items.map(i=>i.id)).size,all.data.items.length);
  const jacketUrl=site.sql("SELECT url_path FROM rubizh_pim_categories WHERE category_id='clothing_jackets'")[0].url_path;
  const cat=await site.get('/shop/catalog.php?category='+encodeURIComponent(jacketUrl));assert.equal(cat.status,200,cat.text);assert.deepEqual(cat.data.items.map(i=>i.id),['m-jacket'],'four SKU / two colors = one card');
  for(const q of ['RUB-F0003','RUB-F0001','Куртка']){const s=await site.get('/shop/catalog.php?q='+encodeURIComponent(q));assert.deepEqual(s.data.items.map(i=>i.id),['m-jacket'],q);}
  const cats=(await site.get('/shop/catalog.php?action=categories')).data.categories;const jackets=cats.find(c=>c.category_id==='clothing_jackets');assert.equal(jackets.product_count,1);
  // Out-of-stock and UNKNOWN models stay listed (inventory = buyability, not presence).
  assert.ok(all.data.items.some(i=>i.id==='m-belt'));
 }finally{site.stop();}
});

test('zero usable photos: excluded from catalog, product, search, sitemap and feeds by one predicate, without hiding',{skip,timeout:120000},async()=>{
 const site=await startSite();
 try{
  assert.equal((await publish(site,wire)).status,200);
  site.sql("UPDATE photos SET status='error' WHERE product_id='m-belt'");site.sql("UPDATE meta SET v=CONCAT(v,'-x') WHERE k='catalog_updated'");
  const slug=wire.products.find(p=>p.id==='m-belt').slug;
  assert.ok(!(await site.get('/shop/catalog.php')).data.items.some(i=>i.id==='m-belt'));
  assert.equal((await site.get('/shop/catalog.php?q=RUB-F0030')).data.total,0);
  assert.equal((await site.get('/api/product/'+slug)).status,404);
  assert.equal((await site.get('/shop/catalog.php?action=product&slug='+slug)).status,404);
  assert.doesNotMatch((await site.get('/sitemap.php')).text,new RegExp(slug));
  assert.equal(+site.sql("SELECT visible FROM products WHERE id='m-belt'")[0].visible,1,'photo readiness never changes publication');
 }finally{site.stop();}
});
