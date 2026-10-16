// Stage 5, 5-2 (OD-4.1, owner 2026-10-16): PIM sends the supplier payout per SKU in a separate PRIVATE contract
// (contracts/pim-private-costs/1) to POST /api/pim/costs — only with pim_key. SITE keeps it in rubizh_crm_sku_costs; it
// never appears in a public response; CRM «Валовий прибуток» (05-CRM_ANALYTICS_FORMULAS, unchanged) is visible to OWNER
// and ACCOUNTANT only and says «Немає даних собівартості від PIM» while any sold SKU has no cost. Fixtures only.
import {test} from 'node:test';import {createRequire} from 'node:module';const require=createRequire(import.meta.url);import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {startCrm,line,roles5} from './helpers/crm-fixture.mjs';import {root} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const fixture=JSON.parse(readFileSync(root+'/contracts/pim-private-costs/1/fixture.json','utf8'));
const schema=JSON.parse(readFileSync(root+'/contracts/pim-private-costs/1/schema.json','utf8'));

test('contract: the private costs fixture is the published shape (no supplier names, minor units, UAH)',()=>{
 assert.equal(fixture.private_contract,'rubizh-pim-private-costs');assert.equal(fixture.version,1);assert.equal(fixture.currency,'UAH');
 assert.deepEqual(Object.keys(schema.properties).sort(),['costs','currency','generated_at','private_contract','revision','version']);
 assert.deepEqual(Object.keys(schema.properties.costs.items.properties).sort(),['sku','supplier_payout_minor']);
 for(const c of fixture.costs){assert.ok(Number.isInteger(c.supplier_payout_minor)&&c.supplier_payout_minor>=0);assert.match(c.sku,/^[A-Za-z0-9._-]{1,64}$/);}
 assert.doesNotMatch(JSON.stringify(fixture),/supplier_name|supplier_code|fulfillment/);
 // The fixture is the exact output of the PIM exporter (pim.rubizh app/contracts/fixtures/pim-site-private-costs-v1.exact.json)
 // and the SITE parser accepts it as is.
 const {spawnSync}=require('node:child_process'),runtime=(process.env.RUBIZH_PHP_RUNTIME||'/workspace/php-runtime/root/usr');
 const r=spawnSync(runtime+'/bin/php8.4',['-n','-r',`require '${root}/api/pim-private.php';echo count(pimPrivateCostsParse(file_get_contents('${root}/contracts/pim-private-costs/1/fixture.json')));`],{encoding:'utf8',env:{...process.env,LD_LIBRARY_PATH:runtime+'/lib/x86_64-linux-gnu'}});
 assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(Number(r.stdout),fixture.costs.length);
});

test('POST /api/pim/costs: pim_key only, strict validation, upsert; costs never public; gross profit for OWNER and ACCOUNTANT only',{skip,timeout:300000},async()=>{
 const s=await startCrm();
 try{
  const auth=s.auth,send=(body,headers=auth)=>s.post('/api/pim/costs',body,headers);
  // A paid order with RUB-F0001 (qty 2): no cost yet → «Немає даних».
  const owner=await s.login('OWNER');const o=await s.checkout([{...line(),qty:2}]);const v=async()=>(await owner.get('/orders/'+o.id)).data.data.version;
  assert.equal((await owner.send('/orders/'+o.id+'/invoice',{version:await v()})).status,200);
  const inv=s.sql('SELECT * FROM rubizh_mono_invoices WHERE order_id='+o.id+' AND invoice_id IS NOT NULL')[0];assert.equal((await s.webhook(inv)).status,200);
  let gp=(await owner.get('/dashboard?period=30d')).data.data.kpi.gross_profit;
  assert.equal(gp.value_minor,null);assert.equal(gp.available,false);assert.equal(gp.note,'Немає даних собівартості від PIM');

  const body={...fixture,costs:[{sku:'RUB-F0001',supplier_payout_minor:123457},{sku:'RUB-F0002',supplier_payout_minor:98761}]};
  assert.equal((await send(body,{'Content-Type':'application/json'})).status,401,'no key');
  assert.equal((await send(body,{'Content-Type':'application/json',Authorization:'Bearer wrong-key-wrong-key-wrong-key'})).status,401,'wrong key');
  for(const bad of [
   {...body,private_contract:'other'},{...body,version:2},{...body,currency:'USD'},
   {...body,costs:[{sku:'RUB F0001',supplier_payout_minor:1}]},{...body,costs:[{sku:'RUB-F0001',supplier_payout_minor:-1}]},
   {...body,costs:[{sku:'RUB-F0001',supplier_payout_minor:12.5}]},{...body,costs:[{sku:'RUB-F0001',supplier_payout_minor:'100'}]},
   {...body,costs:[{sku:'RUB-F0001',supplier_payout_minor:1},{sku:'RUB-F0001',supplier_payout_minor:2}]},
   {...body,costs:[{sku:'RUB-F0001',supplier_payout_minor:1,supplier_name:'X'}]},{...body,extra:true},
  ]){const r=await send(bad);assert.equal(r.status,422,JSON.stringify(bad).slice(0,160)+' → '+r.status);}
  assert.equal(+s.sql('SELECT COUNT(*) n FROM rubizh_crm_sku_costs')[0].n,0,'nothing stored from refused requests');
  const ok=await send(body);assert.equal(ok.status,200,JSON.stringify(ok.data));assert.equal(ok.data.stored,2);
  assert.deepEqual(s.sql("SELECT sku,cost_minor,source FROM rubizh_crm_sku_costs ORDER BY sku").map(r=>[r.sku,+r.cost_minor,r.source]),[['RUB-F0001',123457,'pim'],['RUB-F0002',98761,'pim']]);
  // Upsert, never delete: a later batch without RUB-F0002 keeps it.
  assert.equal((await send({...body,costs:[{sku:'RUB-F0001',supplier_payout_minor:123458}]})).status,200);
  assert.deepEqual(s.sql("SELECT sku,cost_minor FROM rubizh_crm_sku_costs ORDER BY sku").map(r=>[r.sku,+r.cost_minor]),[['RUB-F0001',123458],['RUB-F0002',98761]]);
  // A delayed or replayed older batch never overwrites newer costs.
  const stale=await send({...body,generated_at:'2020-01-01T00:00:00.000Z',costs:[{sku:'RUB-F0001',supplier_payout_minor:1}]});assert.equal(stale.status,409);assert.equal(stale.data.error_code,'STALE_BATCH');
  assert.equal(+s.sql("SELECT cost_minor FROM rubizh_crm_sku_costs WHERE sku='RUB-F0001'")[0].cost_minor,123458);
  // Within one second a whole-second stamp is older than the same second with milliseconds.
  const keep=[{sku:'RUB-F0001',supplier_payout_minor:123458}];assert.equal((await send({...body,costs:keep,generated_at:'2030-01-01T00:00:05.500Z'})).status,200);assert.equal((await send({...body,costs:keep,generated_at:'2030-01-01T00:00:05Z'})).status,409);

  // Role × field: the gross profit with its cost only for OWNER and ACCOUNTANT.
  const table=[];
  for(const role of roles5){const a=await s.login(role);const d=(await a.get('/dashboard?period=30d')).data.data;const g=d?.kpi?.gross_profit;
   table.push({role,seen:g!=null&&g.value_minor!=null,raw:JSON.stringify(d??{}).includes('123458')});}
  assert.deepEqual(table.filter(x=>x.seen).map(x=>x.role).sort(),['ACCOUNTANT','OWNER']);
  assert.deepEqual(table.filter(x=>x.raw).map(x=>x.role).sort(),[],'no role gets the raw cost value in the dashboard');
  const dash=(await owner.get('/dashboard?period=30d')).data.data;gp=dash.kpi.gross_profit;
  assert.equal(gp.available,true);assert.equal(gp.value_minor,dash.kpi.revenue.value_minor-2*123458,'05 formula unchanged: revenue − refunds − Σ qty × cost');

  // Every public endpoint and page: no cost value, no cost key.
  const product=s.wire.products.find(m=>m.id==='m-jacket');
  const publicRoutes=['/api/catalog','/api/catalog?q=RUB-F0001','/api/categories','/api/storefront','/api/health','/api/product/'+product.slug,'/product/'+product.slug,'/','/sitemap.php','/feeds/feed.php','/shop/catalog.php','/shop/kit-data.php'];
  for(const route of publicRoutes){const r=await s.get(route);const text=r.text??JSON.stringify(r.data);
   assert.doesNotMatch(text,/123458|1234\.58|98761|987\.61/,route+' leaks a cost value');assert.doesNotMatch(text,/"(?:supplier_payout_minor|supplier_payout|payout|cost_minor|cost)"/,route+' has a cost key');}
 }finally{s.stop();}
});
