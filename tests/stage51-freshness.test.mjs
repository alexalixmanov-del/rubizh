// Stage 5.1 (owner 2026-10-16): supplier data freshness instead of the single freshHours 36. The owner imports supplier
// files weekly; SITE applies the owner's thresholds (sent by PIM with the sync batch) to the data age on the server:
//   ≤ pay_fresh_hours (72 h) → direct payment as before; up to sell_max_days (8 d) → sold only through «Очікує
//   підтвердження менеджера» (no MonoPay before it), the buyer sees «Менеджер підтвердить наявність перед оплатою»;
//   older → not orderable, a model with no other orderable SKU is hidden from the storefront (not deleted) until fresh data.
// Boundaries 71/73 h and 7/9 days, the import time when the supplier gives no time of its own, a mixed cart, no bypass
// through the API, paid orders untouched, the same state in every reader (K6), the policy from PIM validated.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {startCrm,line} from './helpers/crm-fixture.mjs';import {chunksFor} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const H=3600000,D=24*H;
// Republish the catalog with the given data age per SKU (ms); the sync applies the rule before it answers.
async function aged(s,ages,{policy,imported=false}={}){
 const w=structuredClone(s.wire),now=Date.now();
 for(const m of w.products)for(const v of m.variants)if(ages[v.sku]!==undefined){
  if(imported){v.stock_observed_at=null;v.stock_imported_at=now-ages[v.sku];}else v.stock_observed_at=now-ages[v.sku];
 }
 const chunks=chunksFor(w);if(policy)chunks[0].freshness_policy=policy;
 let r;for(const body of chunks){r=await s.post('/api/pim/sync',body,s.auth);if(r.status!==200)return r;}
 return r;
}
const product=async s=>(await s.get('/shop/catalog.php?action=product&id=m-jacket')).data.product;
const sku=(p,id)=>p.variants.find(v=>v.sku===id);
const quote=async(s,lines)=>{const c=await s.get('/shop/customer.php'),cookie=c.headers.get('set-cookie').split(';')[0];return s.post('/shop/checkout-quote.php',{csrf:c.data.csrf,lines,payment:'card'},{Cookie:cookie});};
const order=(s,id)=>s.sql('SELECT status,payment_status,pim_order_state,pim_payment_state FROM rubizh_customer_orders WHERE id='+id)[0];

test('71 h: direct payment; 73 h and 7 days: sold only after the manager confirms, no MonoPay, buyer and CRM see it',{skip,timeout:300000},async()=>{
 const s=await startCrm();
 try{
  assert.equal((await aged(s,{'RUB-F0001':71*H})).status,200);
  let v=sku(await product(s),'RUB-F0001');assert.equal(v.payment_allowed,true);assert.equal(v.stock_freshness,'FRESH');assert.equal(v.availability_note,null);
  let q=await quote(s,[line()]);assert.equal(q.data.quote.order_mode,'PAY');
  const fresh=await s.checkout([line()]);assert.equal(order(s,fresh.id).pim_order_state,'CONFIRMED');

  for(const age of [73*H,7*D]){
   assert.equal((await aged(s,{'RUB-F0001':age})).status,200);
   v=sku(await product(s),'RUB-F0001');
   assert.equal(v.payment_allowed,false,age/H+' h');assert.equal(v.order_submission_allowed,true,'still sold');assert.equal(v.requires_order_confirmation,true);
   assert.equal(v.stock_freshness,'CONFIRM');assert.equal(v.availability_note,'Менеджер підтвердить наявність перед оплатою');assert.equal(v.availability,'order');
   q=await quote(s,[line()]);assert.equal(q.data.quote.order_mode,'REQUEST');assert.equal(q.data.quote.notice,'Менеджер підтвердить наявність перед оплатою.');
  }
  const o=await s.checkout([line()]);
  assert.equal(order(s,o.id).pim_order_state,'WAITING_CONFIRMATION');
  assert.match(s.sql('SELECT contact_json FROM rubizh_order_details WHERE order_id='+o.id)[0].contact_json,/STALE_SUPPLIER_DATA/);
  // No MonoPay before the manager: neither the buyer nor the CRM can open a bank invoice.
  const start=await s.post('/shop/payment-start.php',{csrf:o.csrf,order_id:o.id},{Cookie:o.cookie});
  assert.notEqual(start.status,200,JSON.stringify(start.data));assert.equal(start.data.ok,false);assert.match(start.data.error,/підтвердження наявності менеджером/);
  const owner=await s.login('OWNER');let card=(await owner.get('/orders/'+o.id)).data.data;
  assert.notEqual((await owner.send('/orders/'+o.id+'/invoice',{version:card.version})).status,200);
  assert.equal(+s.sql('SELECT COUNT(*) n FROM rubizh_mono_invoices WHERE order_id='+o.id+' AND invoice_id IS NOT NULL')[0].n,0);
  // CRM: the order is in «Очікують підтвердження».
  const list=(await owner.get('/orders?view=confirmation')).data.data;assert.ok((list.rows??list).some(r=>+r.id===+o.id),'in the confirmation queue');
  // The manager confirms availability → the buyer can pay.
  card=(await owner.get('/orders/'+o.id)).data.data;
  const c=await owner.send('/orders/'+o.id+'/confirm',{availability_confirmed:true,expected_version:card.version,version:card.version});assert.equal(c.status,200,JSON.stringify(c.data));
  assert.equal(order(s,o.id).pim_order_state,'CONFIRMED');
  card=(await owner.get('/orders/'+o.id)).data.data;assert.equal((await owner.send('/orders/'+o.id+'/invoice',{version:card.version})).status,200);
 }finally{s.stop();}
});

test('9 days: SKU not orderable; a model with no fresh SKU is hidden (not deleted) from product, listing and sitemap until fresh data',{skip,timeout:300000},async()=>{
 const s=await startCrm();
 try{
  const slug=s.sql("SELECT slug FROM products WHERE id='m-jacket'")[0].slug;
  // One SKU too old, the others fresh: the model stays, that SKU cannot be ordered.
  assert.equal((await aged(s,{'RUB-F0001':9*D,'RUB-F0002':H,'RUB-F0003':H,'RUB-F0004':H})).status,200);
  let p=await product(s);assert.equal(sku(p,'RUB-F0001').order_submission_allowed,false);assert.equal(sku(p,'RUB-F0001').stock_freshness,'HIDDEN');assert.equal(sku(p,'RUB-F0002').payment_allowed,true);
  let q=await quote(s,[line()]);assert.equal(q.status,409);assert.equal(q.data.error_code,'SKU_UNAVAILABLE');assert.match(q.data.error,/застаріли/);
  // 7 days 23 h → still sold after confirmation; 9 days on every SKU → the model is hidden.
  assert.equal((await aged(s,{'RUB-F0001':8*D-H})).status,200);assert.equal(sku(await product(s),'RUB-F0001').stock_freshness,'CONFIRM');
  assert.equal((await aged(s,{'RUB-F0001':9*D,'RUB-F0002':9*D,'RUB-F0003':10*D,'RUB-F0004':9*D})).status,200);
  assert.equal((await s.get('/shop/catalog.php?action=product&id=m-jacket')).status,404);
  assert.equal((await s.get('/product/'+slug)).status,404);
  const list=(await s.get('/shop/catalog.php?limit=100')).data;assert.ok(!list.items.some(i=>i.id==='m-jacket'),'not listed');
  assert.ok(!(await s.get('/sitemap.php')).text.includes('/product/'+slug+'<'),'not in the sitemap');
  const row=s.sql("SELECT visible,pim_publication_state,pim_publication_reason FROM products WHERE id='m-jacket'")[0];
  assert.deepEqual(row,{visible:0,pim_publication_state:'HIDDEN',pim_publication_reason:'STALE_SUPPLIER_DATA'},'hidden, not deleted');
  assert.equal(+s.sql("SELECT COUNT(*) n FROM variants WHERE product_id='m-jacket'")[0].n,4,'SKUs kept');
  q=await quote(s,[line()]);assert.equal(q.status,409);
  // PIM status counts the hidden models for the owner.
  assert.equal((await s.get('/api/pim/status',s.auth)).data.products.hidden_stale_supplier_data,1);
  // Fresh data → back on the storefront.
  assert.equal((await aged(s,{'RUB-F0001':H,'RUB-F0002':H,'RUB-F0003':H,'RUB-F0004':H})).status,200);
  assert.equal((await s.get('/product/'+slug)).status,200);assert.equal(sku(await product(s),'RUB-F0001').payment_allowed,true);
  assert.equal(s.sql("SELECT pim_publication_state FROM products WHERE id='m-jacket'")[0].pim_publication_state,'ACTIVE');
 }finally{s.stop();}
});

test('no supplier time of its own → the PIM import time is the data age; same state in product, listing, filters and checkout (K6)',{skip,timeout:300000},async()=>{
 const s=await startCrm();
 try{
  assert.equal((await aged(s,{'RUB-F0001':73*H,'RUB-F0002':73*H,'RUB-F0003':73*H},{imported:true})).status,200);
  const p=await product(s);for(const id of ['RUB-F0001','RUB-F0002','RUB-F0003'])assert.equal(sku(p,id).stock_freshness,'CONFIRM',id);
  const item=(await s.get('/shop/catalog.php?limit=100')).data.items.find(i=>i.id==='m-jacket');
  assert.ok(item,'still listed');assert.equal(item.availability,'order','listing shows what checkout does');
  assert.ok(!(await s.get('/shop/catalog.php?limit=100&availability=in')).data.items.some(i=>i.id==='m-jacket'),'«в наявності» filter excludes it');
  assert.equal((await quote(s,[line()])).data.quote.order_mode,'REQUEST');
  // The server-rendered card (no JS) says the same.
  const slug=s.sql("SELECT slug FROM products WHERE id='m-jacket'")[0].slug;
  assert.match((await s.get('/product/'+slug)).text,/Наявність: менеджер підтвердить наявність перед оплатою/);
 }finally{s.stop();}
});

test('mixed cart → one order waiting for confirmation; browser flags are ignored; a paid order is never touched by aging',{skip,timeout:300000},async()=>{
 const s=await startCrm();
 try{
  // Paid while fresh.
  const paid=await s.checkout([line()]);const owner=await s.login('OWNER');
  let card=(await owner.get('/orders/'+paid.id)).data.data;assert.equal((await owner.send('/orders/'+paid.id+'/invoice',{version:card.version})).status,200);
  const inv=s.sql('SELECT * FROM rubizh_mono_invoices WHERE order_id='+paid.id+' AND invoice_id IS NOT NULL ORDER BY id DESC LIMIT 1')[0];
  assert.equal((await s.webhook(inv)).status,200);const before=order(s,paid.id);assert.equal(before.pim_payment_state,'PAID');
  const items=s.sql('SELECT items_json,total FROM rubizh_customer_orders WHERE id='+paid.id)[0];
  // Mixed cart: a fresh SKU and one older than 72 h.
  assert.equal((await aged(s,{'RUB-F0001':H,'RUB-F0021':80*H})).status,200);
  const pouch=s.wire.products.find(m=>m.id==='m-pouch');
  const mixed=[line(),{product_id:'m-pouch',color_id:pouch.colors.find(c=>c.variant_skus.includes('RUB-F0021')).id,sku:'RUB-F0021',qty:1}];
  let q=await quote(s,mixed);assert.equal(q.data.quote.order_mode,'REQUEST');
  const o=await s.checkout(mixed);assert.equal(order(s,o.id).pim_order_state,'WAITING_CONFIRMATION','one order, no split');
  assert.equal(+s.sql('SELECT COUNT(*) n FROM rubizh_customer_orders WHERE id>'+paid.id)[0].n,1);
  // Browser-sent permissions and freshness are not trusted.
  const forged=mixed.map(l=>({...l,payment_allowed:true,requires_order_confirmation:false,stock_freshness:'FRESH',availability:'in',availability_v3:'IN_STOCK'}));
  q=await quote(s,forged);assert.equal(q.data.quote.order_mode,'REQUEST');
  const f=await s.checkout(forged);assert.equal(order(s,f.id).pim_order_state,'WAITING_CONFIRMATION');
  const start=await s.post('/shop/payment-start.php',{csrf:f.csrf,order_id:f.id},{Cookie:f.cookie});assert.equal(start.data.ok,false);assert.match(start.data.error,/підтвердження наявності менеджером/);
  assert.equal(+s.sql('SELECT COUNT(*) n FROM rubizh_mono_invoices WHERE order_id='+f.id+' AND invoice_id IS NOT NULL')[0].n,0);
  // Everything ages past 9 days: the paid order keeps its state, lines and amount; the CRM card still opens.
  assert.equal((await aged(s,{'RUB-F0001':9*D,'RUB-F0002':9*D,'RUB-F0003':9*D,'RUB-F0004':9*D,'RUB-F0020':9*D,'RUB-F0021':9*D})).status,200);
  assert.deepEqual(order(s,paid.id),before);assert.deepEqual(s.sql('SELECT items_json,total FROM rubizh_customer_orders WHERE id='+paid.id)[0],items);
  assert.equal((await owner.get('/orders/'+paid.id)).status,200);
 }finally{s.stop();}
});

test('freshness policy from PIM: applied by SITE, shown in /pim/status, invalid policy refuses the whole batch',{skip,timeout:300000},async()=>{
 const s=await startCrm();
 try{
  let st=(await s.get('/api/pim/status',s.auth)).data;
  assert.equal(st.capabilities.freshness_policy_version,1);assert.deepEqual(st.freshness_policy,{version:1,pay_fresh_hours:72,sell_max_days:8},'defaults');
  assert.equal((await aged(s,{'RUB-F0001':30*H},{policy:{version:1,pay_fresh_hours:24,sell_max_days:3}})).status,200);
  st=(await s.get('/api/pim/status',s.auth)).data;assert.deepEqual(st.freshness_policy,{version:1,pay_fresh_hours:24,sell_max_days:3});
  assert.equal(sku(await product(s),'RUB-F0001').stock_freshness,'CONFIRM','30 h > 24 h');
  assert.equal((await aged(s,{'RUB-F0001':4*D})).status,200);assert.equal(sku(await product(s),'RUB-F0001').stock_freshness,'HIDDEN','4 d > 3 d');
  for(const bad of [{version:1,pay_fresh_hours:72,sell_max_days:3},{version:1,pay_fresh_hours:0,sell_max_days:8},{version:1,pay_fresh_hours:72.5,sell_max_days:8},
   {version:1,pay_fresh_hours:'72',sell_max_days:8},{version:2,pay_fresh_hours:72,sell_max_days:8},{version:1,pay_fresh_hours:72,sell_max_days:61},{version:1,pay_fresh_hours:72,sell_max_days:8,extra:1},[72,8]]){
   const r=await aged(s,{'RUB-F0001':H},{policy:bad});assert.equal(r.status,400,JSON.stringify(bad));assert.match(JSON.stringify(r.data),/FRESHNESS_POLICY/);
  }
  assert.deepEqual((await s.get('/api/pim/status',s.auth)).data.freshness_policy,{version:1,pay_fresh_hours:24,sell_max_days:3},'unchanged after refusals');
  // Only chunk 0 carries the policy.
  const chunks=chunksFor(structuredClone(s.wire),{size:1});chunks[1].freshness_policy={version:1,pay_fresh_hours:72,sell_max_days:8};
  assert.equal((await s.post('/api/pim/sync',chunks[0],s.auth)).status,200);assert.equal((await s.post('/api/pim/sync',chunks[1],s.auth)).status,400);
  // Not readable without the PIM key.
  assert.equal((await s.get('/api/pim/status')).status,401);
 }finally{s.stop();}
});

test('storefront bundle: a new versioned file shows «Менеджер підтвердить наявність перед оплатою» for a manager-confirmed SKU; the stage 5 bundle is kept as it was',async()=>{
 const {readFileSync}=await import('node:fs'),path=await import('node:path'),vm=await import('node:vm');
 const root=path.resolve(import.meta.dirname,'..'),live=readFileSync(path.join(root,'index.html'),'utf8').match(/src="\/(assets\/shop-client\.[^"?]+\.js)/)[1];
 assert.equal(live,'assets/shop-client.2026101602.js');
 const src=readFileSync(path.join(root,live),'utf8'),ctx={};
 vm.runInNewContext(src.match(/const STORE_V3_LABEL=\{[^}]*\};/)[0].replace('const ','this.')+src.match(/function storeV3Status\(p\)\{[^\n]*\}/)[0]+';this.storeV3Status=storeV3Status;',ctx);
 const status=variants=>ctx.storeV3Status({variants});
 assert.equal(status([{availability_v3:'IN_STOCK',payment_allowed:true}]),'IN_STOCK');
 assert.equal(status([{availability_v3:'IN_STOCK',payment_allowed:false,order_submission_allowed:true,stock_freshness:'CONFIRM'}]),'STOCK_CONFIRM');
 assert.equal(ctx.STORE_V3_LABEL.STOCK_CONFIRM,'Менеджер підтвердить наявність перед оплатою');
 assert.equal(status([{availability_v3:'IN_STOCK',payment_allowed:false,order_submission_allowed:false,stock_freshness:'HIDDEN'}]),'OUT_OF_STOCK');
 assert.match(src,/o\.stock_freshness === "CONFIRM" \? STORE_V3_LABEL\.STOCK_CONFIRM/,'cart line note');
 // Q-9: the previous bundle file is not edited in place.
 const crypto=await import('node:crypto');
 assert.equal(crypto.createHash('sha256').update(readFileSync(path.join(root,'assets/shop-client.2026101601.js'))).digest('hex'),'dcd617364eefaaa1501544c13c655a68dd560888dd1c0b0501669fb52ecfc4d5','2026101601 as tagged rubizh-stage-5-verified');
});
