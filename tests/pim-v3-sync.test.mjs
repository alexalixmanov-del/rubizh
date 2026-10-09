import {test} from 'node:test';import assert from 'node:assert/strict';
import {startSite,wire,chunksFor,publish} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const clone=x=>structuredClone(x);

test('status advertises contract 3 only when enabled and schema applied',{skip,timeout:120000},async()=>{
 const off=await startSite({enableV3:false});
 try{const s=await off.get('/api/pim/status',off.auth);assert.deepEqual(s.data.capabilities,{pricing_policy_version:1});
  const r=await publish(off,wire);assert.equal(r.status,409);assert.equal(r.data.error_code,'CONTRACT_V3_NOT_ENABLED');}
 finally{off.stop();}
 const on=await startSite();
 try{const s=await on.get('/api/pim/status',on.auth);for(const [k,v] of Object.entries({contract_version:3,pricing_policy_version:1,category_catalog_version:2,size_catalog_version:1,inventory_policy_version:1,order_policy_version:1,model_colors_version:1,envelope:'products'}))assert.equal(s.data.capabilities[k],v,k);}
 finally{on.stop();}
});

test('exact PIM wire ingests atomically into MODEL / COLOR / real SKU / size options with pricing v1',{skip,timeout:120000},async()=>{
 const site=await startSite();
 try{
  const chunks=chunksFor(wire,{size:2});assert.ok(chunks.length>1);
  const first=await site.post('/api/pim/sync',chunks[0],site.auth);assert.equal(first.status,200,JSON.stringify(first.data));assert.equal(first.data.status,'STAGED');
  assert.equal(site.sql('SELECT COUNT(*) n FROM products')[0].n,0,'staged chunk is not public');
  const ack=await site.post('/api/pim/sync',chunks[1],site.auth);assert.equal(ack.status,200,JSON.stringify(ack.data));
  assert.equal(ack.data.status,'COMMITTED');assert.equal(ack.data.contract_version,3);assert.deepEqual(ack.data.hidden_ids,[]);
  assert.deepEqual(ack.data.results.map(r=>r.id).sort(),wire.products.map(p=>p.id).sort());assert.ok(ack.data.results.every(r=>r.status==='created'));
  const models=site.sql("SELECT id,pim_contract_version,pim_publication_state,visible,variants_count FROM products ORDER BY id");
  assert.equal(models.length,wire.products.length,'one row per MODEL');assert.ok(models.every(m=>+m.pim_contract_version===3&&m.pim_publication_state==='ACTIVE'&&+m.visible===1));
  const skus=site.sql('SELECT sku,product_id,pim_color_id,pim_effective_availability,pim_payment_allowed,pim_order_submission_allowed,pim_requires_order_confirmation,pim_stock_quantity,pim_delivery_lead_time_days FROM variants ORDER BY sku');
  assert.equal(skus.length,wire.products.reduce((n,p)=>n+p.variants.length,0),'only real SKU rows; no color x size product');
  const bySku=Object.fromEntries(skus.map(s=>[s.sku,s]));
  assert.equal(bySku['RUB-F0020'].pim_effective_availability,'PREORDER');assert.equal(+bySku['RUB-F0020'].pim_delivery_lead_time_days,3);assert.equal(+bySku['RUB-F0020'].pim_payment_allowed,0);
  assert.equal(bySku['RUB-F0030'].pim_effective_availability,'UNKNOWN');assert.equal(+bySku['RUB-F0030'].pim_order_submission_allowed,0);assert.equal(bySku['RUB-F0030'].pim_stock_quantity,null,'unconfirmed Tactical Belt number is not stock');
  assert.equal(+bySku['RUB-F0001'].pim_payment_allowed,1);assert.equal(bySku['RUB-F0001'].pim_stock_quantity,null,'STATUS has no invented quantity');
  assert.equal(bySku['RUB-F0004'].pim_effective_availability,'OUT_OF_STOCK');
  const options=site.sql("SELECT option_id,size,variant_sku,stock_quantity,payment_allowed,order_submission_allowed FROM rubizh_size_options WHERE product_id='m-pants' AND active=1");
  assert.equal(options.length,10);assert.ok(options.every(o=>o.variant_sku===null&&o.stock_quantity===null&&+o.payment_allowed===0&&+o.order_submission_allowed===1));
  const colors=site.sql("SELECT color_id,color FROM rubizh_product_colors WHERE product_id='m-jacket' AND active=1");assert.equal(colors.length,2);
  const owned=site.sql("SELECT cp.color_id,ph.src_url FROM rubizh_color_photos cp JOIN photos ph ON ph.id=cp.photo_id WHERE cp.product_id='m-jacket'");
  const black=wire.products.find(p=>p.id==='m-jacket').colors.find(c=>c.color==='Чорний');
  assert.deepEqual(owned.filter(r=>r.color_id===black.id).map(r=>r.src_url).sort(),[...black.photos].sort());
  assert.ok(!owned.some(r=>r.color_id!==black.id&&black.photos.includes(r.src_url)),'black photos are not copied to olive');
  const pricing=site.sql("SELECT sku,policy_json FROM rubizh_catalog_pricing WHERE product_id='m-jacket' ORDER BY sku");assert.equal(pricing.length,4);
  const p1=JSON.parse(pricing[0].policy_json);assert.equal(p1.price_cents,286000);assert.equal(p1.minimum_cents,241000);assert.equal(p1.kit_cents,247000);assert.equal(p1.wholesale.length,2);
  assert.equal(site.sql("SELECT category_id FROM rubizh_product_categories WHERE product_id='m-belt'")[0].category_id,'clothing_belts');
  const route=site.sql("SELECT f.supplier_name,a.supplier_sku FROM rubizh_catalog_fulfillment f JOIN rubizh_catalog_supplier_articles a ON a.sku=f.sku WHERE f.sku='RUB-F0001'")[0];assert.deepEqual(route,{supplier_name:'M-WIN',supplier_sku:'MW-J-BK-M'},'private routing stored server-side');
  assert.equal(site.sql('SELECT COUNT(*) n FROM rubizh_pim_categories')[0].n,143);
  // Replay of the same final chunk returns the stored ACK, no second write.
  const replay=await site.post('/api/pim/sync',chunks[1],site.auth);assert.equal(replay.status,200);assert.equal(replay.data.replayed,true);assert.equal(site.sql("SELECT COUNT(*) n FROM rubizh_pim_history WHERE operation='CREATE'")[0].n,wire.products.length);
  // Same batch id with a different payload is a conflict.
  const changed=clone(chunks[1]);changed.products[0].description+='!';const conflict=await site.post('/api/pim/sync',changed,site.auth);assert.equal(conflict.status,409);assert.equal(conflict.data.error_code,'BATCH_HASH_CONFLICT');
  // Same content in a new batch: unchanged, idempotent.
  const again=await publish(site,wire);assert.equal(again.status,200);assert.ok(again.data.results.every(r=>r.status==='unchanged'));
  assert.equal(site.sql('SELECT COUNT(*) n FROM variants')[0].n,skus.length,'no duplicate SKU on reimport');
  assert.equal(site.sql('SELECT COUNT(*) n FROM rubizh_size_options')[0].n,10,'no duplicate size options on reimport');
 }finally{site.stop();}
});

test('absence is not hide; only explicit hide_ids hide; removed SKU is kept inactive, never deleted',{skip,timeout:120000},async()=>{
 const site=await startSite();
 try{
  assert.equal((await publish(site,wire)).status,200);
  const partial=clone(wire);partial.products=partial.products.filter(p=>p.id!=='m-belt');
  const jacket=partial.products.find(p=>p.id==='m-jacket');jacket.variants=jacket.variants.filter(v=>v.sku!=='RUB-F0004');for(const c of jacket.colors)c.variant_skus=c.variant_skus.filter(s=>s!=='RUB-F0004');
  const r=await publish(site,partial);assert.equal(r.status,200,JSON.stringify(r.data));
  assert.equal(+site.sql("SELECT visible FROM products WHERE id='m-belt'")[0].visible,1,'absent model stays visible');
  const removed=site.sql("SELECT pim_active,pim_payment_allowed FROM variants WHERE sku='RUB-F0004'");assert.equal(removed.length,1);assert.equal(+removed[0].pim_active,0);
  const hide=await publish(site,{...partial,products:[]},{hide:['m-belt']});assert.equal(hide.status,200,JSON.stringify(hide.data));assert.deepEqual(hide.data.hidden_ids,['m-belt']);
  const belt=site.sql("SELECT visible,pim_publication_state FROM products WHERE id='m-belt'")[0];assert.equal(+belt.visible,0);assert.equal(belt.pim_publication_state,'HIDDEN');
  assert.equal(site.sql("SELECT COUNT(*) n FROM variants WHERE product_id='m-belt'")[0].n,1,'hidden model keeps its SKU');
 }finally{site.stop();}
});

test('invalid model rejects the whole batch with no catalog writes',{skip,timeout:120000},async()=>{
 const site=await startSite();
 try{
  for(const [name,mutate,code] of [
   ['G02 variant without pricing',w=>{delete w.products[0].variants[0].pricing_policy_version;},'PRICING_V1_FIELDS'],
   ['request option with invented SKU',w=>{const p=w.products.find(p=>p.size_options.length);p.size_options[0].variant_sku='FAKE-42';},null],
   ['payable SKU while size needs confirmation',w=>{const v=w.products.find(p=>p.id==='m-pants').variants[0];v.payment_allowed=true;},null],
   ['legacy checkout_allowed flag',w=>{w.products[0].variants[0].checkout_allowed=true;},'LEGACY_CHECKOUT_ALLOWED'],
   ['unknown category',w=>{w.products[0].canonical_category_id='footwear_loafers';},null],
   ['color photo not owned',w=>{const p=w.products.find(p=>p.id==='m-jacket');p.variants[0].photos=['https://rubizh.shop/media/fixture/other.webp'];},'PHOTO_COLOR_OWNERSHIP']]){
   const w=clone(wire);mutate(w);const r=await publish(site,w);
   assert.notEqual(r.status,200,name);assert.equal(r.data.ok,false,name);
   if(code)assert.ok(JSON.stringify(r.data).includes(code),name+': '+JSON.stringify(r.data).slice(0,400));
   assert.equal(site.sql('SELECT COUNT(*) n FROM products')[0].n,0,name+' wrote products');assert.equal(site.sql('SELECT COUNT(*) n FROM variants')[0].n,0,name+' wrote variants');
  }
  // Another model may not take over an existing SKU without a confirmed mapping.
  assert.equal((await publish(site,wire)).status,200);
  const steal=clone(wire);const thief=clone(steal.products.find(p=>p.id==='m-belt'));thief.id=thief.model_id='m-thief';thief.slug='thief';thief.variants[0].sku='RUB-F0001';thief.colors[0].variant_skus=['RUB-F0001'];steal.products=[thief];
  const r=await publish(site,steal);assert.notEqual(r.status,200);assert.ok(JSON.stringify(r.data).includes('SKU_OWNED_BY_OTHER_MODEL'));
  assert.equal(site.sql("SELECT product_id FROM variants WHERE sku='RUB-F0001'")[0].product_id,'m-jacket');
  // Legacy envelope after activation is refused, so the old absence-hide path cannot run.
  const legacy=await site.post('/api/pim/sync',{mode:'full',finalize:true,all_ids:['x'],products:[]},site.auth);assert.equal(legacy.status,409);
 }finally{site.stop();}
});

test('owner legacy hide: plan → apply (exact plan + verified off-webroot backup) → restore; v3 models untouched',{skip,timeout:180000},async()=>{
 const {spawnSync}=await import('node:child_process'),{writeFileSync}=await import('node:fs'),path=(await import('node:path')).default,crypto=await import('node:crypto');
 const {runtime,phpArgs,phpEnv}=await import('./helpers/site-fixture.mjs');
 const site=await startSite();
 try{
  site.sql("INSERT INTO products(id,slug,name,visible,created_at,updated_at,synced_at) VALUES('old-a','old-a','Стара картка A',1,UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP()),('old-b','old-b','Стара картка B',1,UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP())");
  const cli=(...args)=>spawnSync(runtime+'/bin/php8.4',[...phpArgs,path.join(site.site,'dev/pim-v3-legacy-hide.php'),...args],{env:phpEnv,encoding:'utf8',cwd:site.site});
  assert.match(cli('--plan').stderr,/publish contract 3 first/);
  assert.equal((await publish(site,wire,{size:2})).data.status,'COMMITTED');
  const planFile=path.join(site.dir,'legacy-plan.json'),backup=path.join(site.dir,'db.sql.gz');writeFileSync(backup,crypto.randomBytes(4096));
  const backupSha=crypto.createHash('sha256').update((await import('node:fs')).readFileSync(backup)).digest('hex');
  const plan=JSON.parse(cli('--plan','--out='+planFile).stdout);assert.equal(plan.legacy_visible,2);
  assert.match(cli('--plan','--out='+path.join(site.site,'x.json')).stderr,/outside the web root/);
  assert.match(cli('--apply','--plan-file='+planFile,'--plan-sha256='+'0'.repeat(64),'--backup-file='+backup,'--backup-sha256='+backupSha).stderr,/do not match/);
  assert.match(cli('--apply','--plan-file='+planFile,'--plan-sha256='+plan.plan_sha256).stderr,/backup required/);
  const v3Before=site.sql('SELECT COUNT(*) n FROM products WHERE visible=1 AND pim_contract_version=3')[0].n;
  assert.equal(JSON.parse(cli('--apply','--plan-file='+planFile,'--plan-sha256='+plan.plan_sha256,'--backup-file='+backup,'--backup-sha256='+backupSha).stdout).hidden,2);
  assert.equal(site.sql('SELECT COUNT(*) n FROM products WHERE visible=1 AND pim_contract_version IS NULL')[0].n,0);
  assert.equal(site.sql('SELECT COUNT(*) n FROM products WHERE visible=1 AND pim_contract_version=3')[0].n,v3Before);
  assert.equal(site.sql("SELECT COUNT(*) n FROM rubizh_pim_history WHERE operation='OWNER_LEGACY_HIDE'")[0].n,2);
  assert.match(cli('--apply','--plan-file='+planFile,'--plan-sha256='+plan.plan_sha256,'--backup-file='+backup,'--backup-sha256='+backupSha).stderr,/STALE_PLAN/);
  assert.equal(JSON.parse(cli('--restore='+planFile,'--plan-sha256='+plan.plan_sha256).stdout).restored,2);
  assert.equal(site.sql('SELECT COUNT(*) n FROM products WHERE visible=1 AND pim_contract_version IS NULL')[0].n,2);
 }finally{site.stop();}
});
