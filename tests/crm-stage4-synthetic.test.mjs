// Stage 4 (ТЗ §9): synthetic stand data in every state through SITE/CRM business functions; Staff API list
// performance on 50 000 orders (≤500 ms per list request on the stand).
import {test} from 'node:test';import assert from 'node:assert/strict';import {writeFileSync,mkdirSync} from 'node:fs';
import {startCrm} from './helpers/crm-fixture.mjs';import {php} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;const reports=(process.env.RUBIZH_TEST_REPORTS||'/workspace/reports')+'/crm-synthetic';mkdirSync(reports,{recursive:true});
const run=(s,opts,allowFail=false)=>php(`require '${s.site}/dev/crm-synthetic.php';try{echo json_encode(synRun(json_decode('${JSON.stringify(opts)}',true)),JSON_UNESCAPED_UNICODE);}catch(RuntimeException $e){echo json_encode(['refused'=>$e->getMessage()],JSON_UNESCAPED_UNICODE);}`,{allowFail,timeout:3000000});
const json=r=>{try{return JSON.parse(r.stdout);}catch{throw new Error('generator output: '+r.stdout.slice(0,2000)+r.stderr.slice(0,2000));}};

test('synthetic generator refuses to run without the staging mocks',{skip,timeout:240000},async()=>{
 const s=await startCrm();
 try{assert.match(json(run(s,{orders:5})).refused,/staging stand/);assert.equal(+s.sql('SELECT COUNT(*) n FROM rubizh_customer_orders')[0].n,0);}finally{s.stop();}
});

test('synthetic generator: ≥500 orders in every state via business functions; every screen answers on this data',{skip,timeout:1800000},async()=>{
 const s=await startCrm({stock:100000,extraConfig:",'np_mock'=>true"});
 try{
  const r=json(run(s,{orders:520,seed:7}));writeFileSync(reports+'/generate.json',JSON.stringify(r,null,1));
  assert.deepEqual(r.errors,[],'every scenario completes');assert.ok(r.created>=500,'≥500 orders: '+r.created);
  for(const k of ['awaiting_confirmation','awaiting_payment','invoice_waiting','invoice_review','paid','packing','in_transit','delivered','completed','multi_parcel','cancelled','refunded','partial_refund','problem','returned','payment_review','disputed_event','ttn_unknown'])assert.ok(r.by_scenario[k]>0,k);
  // ТЗ §9: partial refunds, several parcels, disputed MonoPay events, TTN with an unknown result, buyers A/B, staff of all roles.
  const n=q=>+s.sql(q)[0].n;
  assert.ok(n("SELECT COUNT(*) n FROM (SELECT r.order_id,SUM(r.amount) a,MAX(i.amount) p FROM rubizh_refund_operations r JOIN rubizh_mono_invoices i ON i.id=r.invoice_id WHERE r.status='success' GROUP BY r.order_id HAVING a<p) x")>0,'partial refunds');
  assert.ok(n("SELECT COUNT(*) n FROM (SELECT order_id FROM rubizh_order_shipments WHERE tracking_number<>'' GROUP BY order_id HAVING COUNT(*)>1) x")>0,'orders with several parcels');
  assert.ok(n("SELECT COUNT(*) n FROM rubizh_np_audit WHERE action='mono_event_rejected'")>0,'disputed MonoPay events');
  assert.ok(n("SELECT COUNT(*) n FROM rubizh_order_shipments WHERE status IN ('unknown','creating')")>0,'TTN with an unknown result');
  assert.equal(n("SELECT COUNT(DISTINCT customer_id) n FROM rubizh_account_orders"),2,'buyers A and B own orders');
  assert.deepEqual(r.staff_roles_missing,[],'staff of all roles');
  const owner=await s.login('OWNER');const codes=new Set();
  for(let page=1;;page++){const l=(await owner.get('/orders?limit=100&page='+page)).data.data;for(const o of l.rows)for(const [k,v] of Object.entries(o.display||{}))codes.add(k+':'+v.code);if(page>=l.pagination.pages)break;}
  writeFileSync(reports+'/display-codes.json',JSON.stringify([...codes].sort(),null,1));
  assert.ok(codes.size>=12,'many distinct display states: '+[...codes].join(','));
  // S4-05: the customer segment filter is applied before pagination — totals and pages match the unfiltered list.
  const all=[];for(let page=1;;page++){const l=(await owner.get('/customers?limit=100&page='+page)).data.data;all.push(...l.rows);if(page>=l.pagination.pages)break;}
  for(const seg of ['VIP','REPEAT','NEW','SLEEPING']){const l=(await owner.get('/customers?limit=5&segment='+seg)).data.data;const want=all.filter(c=>c.segment===seg).length;
   assert.equal(l.pagination.total,want,seg+' total');assert.ok(l.rows.every(c=>c.segment===seg),seg+' rows');assert.equal(l.rows.length,Math.min(5,want));}
  // PERF-4.2: search answers through the narrow tables — phone (any format, partial), name, SKU, TTN.
  const one=s.sql("SELECT o.id,o.order_number,e.normalized_phone p,JSON_UNQUOTE(JSON_EXTRACT(d.contact_json,'$.name')) n,(SELECT sku FROM rubizh_order_fulfillment_lines WHERE order_id=o.id LIMIT 1) sku FROM rubizh_customer_orders o JOIN rubizh_order_details d ON d.order_id=o.id JOIN rubizh_order_contact_evidence e ON e.order_id=o.id LEFT JOIN rubizh_account_orders ao ON ao.order_id=o.id WHERE ao.order_id IS NULL ORDER BY o.id DESC LIMIT 1")[0];
  const ttn=s.sql("SELECT order_id,tracking_number t FROM rubizh_order_shipments WHERE tracking_number<>'' LIMIT 1")[0];
  for(const [q,id] of [[one.p,one.id],['0'+one.p.slice(4),one.id],[one.p.slice(-7),one.id],[one.n,one.id],[one.order_number,one.id],[ttn.t,ttn.order_id]]){
   const r=(await owner.get('/orders?limit=100&q='+encodeURIComponent(q))).data.data;assert.ok(r.rows.some(o=>o.id===+id),'search '+q);}
  assert.ok((await owner.get('/orders?limit=5&q='+encodeURIComponent(one.sku))).data.data.pagination.total>0,'SKU search');
  for(const p of ['/dashboard?period=30d','/orders/counters','/customers','/payments','/payments/review','/shipments','/returns','/tasks','/analytics?period=30d','/audit','/notifications'])assert.equal((await owner.get(p)).status,200,p);
 }finally{s.stop();}
});

test('Staff API list performance on 50 000 orders: every list request ≤500 ms on the stand',{skip,timeout:3600000},async()=>{
 const s=await startCrm({stock:100000,extraConfig:",'np_mock'=>true"});
 try{
  const g=json(run(s,{orders:300,seed:11}));assert.deepEqual(g.errors,[]);
  const b=json(run(s,{orders:0,bulk:50000}));assert.ok(b.bulk?.orders>=50000,'50 000 orders: '+JSON.stringify(b.bulk));
  const owner=await s.login('OWNER'),manager=await s.login('MANAGER');const timings=[];
  const paths=['/orders','/orders?view=new','/orders?view=processing','/orders?view=delivery','/orders?view=problem','/orders?attention=confirmation','/orders?view=cancelled','/orders?sort=total&direction=asc','/orders?page=200','/orders?q=Коваленко','/orders?q=0671000037','/orders/counters','/payments','/shipments','/customers','/dashboard?period=30d',
   // PERF-4.1 + review: customer search and segment; broad substrings that match almost every order (e-mail «@», one letter).
   '/customers?q=Коваленко','/customers?segment=VIP','/customers?q=%40','/orders?q=%40','/orders?q=a','/customers?q=a'];
  for(const [who,c] of [['OWNER',owner],['MANAGER',manager]])for(const p of paths){
   await c.get(p);const runs=[];for(let i=0;i<3;i++){const t=performance.now();const r=await c.get(p);runs.push(performance.now()-t);assert.equal(r.status,200,who+' '+p+' '+JSON.stringify(r.data).slice(0,200));}
   runs.sort((a,b)=>a-b);timings.push({who,path:p,median_ms:Math.round(runs[1]),max_ms:Math.round(runs[2])});
  }
  writeFileSync(reports+'/perf-50k.json',JSON.stringify({orders:b.bulk.orders,timings},null,1));
  // ТЗ §9: «API ≤ 500 мс локально (замер)» — the budget is asserted on the local stand (conditions in the final report).
  // A shared CI runner (MariaDB in Docker) is 4–8× slower: there the timings are kept in the report and only a 10×
  // guard catches a pathological regression (such as the 1.9 s lists before PERF-4.2, which would be ~15 s there).
  const limit=process.env.CI?5000:500;
  const slow=timings.filter(t=>t.median_ms>limit);assert.deepEqual(slow,[],`list API ≤${limit} ms (median of 3) on 50 000 orders${process.env.CI?' (CI guard; the 500 ms budget is measured locally)':''}`);
 }finally{s.stop();}
});
