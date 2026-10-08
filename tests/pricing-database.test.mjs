import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,copyFileSync,writeFileSync,readdirSync,rmSync} from 'node:fs';import {spawnSync,spawn} from 'node:child_process';import {tmpdir} from 'node:os';import path from 'node:path';import {createServer} from 'node:net';
const root=path.resolve(import.meta.dirname,'..'),runtime='/workspace/php-runtime/root/usr',ext=runtime+'/lib/php/20240924/';
const args=['-n','-d','error_reporting=24575','-d','pdo_mysql.default_socket='+process.env.RUBIZH_TEST_MYSQL_SOCKET,...['pdo','mysqlnd','pdo_mysql','mbstring','curl'].flatMap(x=>['-d','extension='+ext+x+'.so'])],env={...process.env,LD_LIBRARY_PATH:runtime+'/lib/x86_64-linux-gnu'};
function php(code){const r=spawnSync(runtime+'/bin/php8.4',[...args,'-r',code],{env,encoding:'utf8',timeout:20000});assert.equal(r.status,0,r.stdout+'\n'+r.stderr);return r.stdout;}
const port=()=>new Promise(r=>{const s=createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
test('HTTP PIM pricing sync, private projection, atomic failure, checkout replay, stale quote and reservations',{skip:!process.env.RUBIZH_TEST_MYSQL_SOCKET,timeout:60000},async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'rubizh-pricing-')),site=path.join(dir,'www'),schema='fixture_pricing_'+Math.random().toString(16).slice(2,12);mkdirSync(site);
 let server;const admin=`$db=new PDO('mysql:unix_socket='.getenv('RUBIZH_TEST_MYSQL_SOCKET'), 'root','',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);`;
 try{
  for(const folder of ['api','auth','shop','assets','dev']){mkdirSync(path.join(site,folder));for(const f of readdirSync(path.join(root,folder)))if(!['config.php','np-private.php','mono-private.php','site-settings.json','site-settings.lock'].includes(f)&&!f.startsWith('.')&&['.php','.json','.js','.css','.svg'].includes(path.extname(f))){try{copyFileSync(path.join(root,folder,f),path.join(site,folder,f));}catch(e){if(e.code!=='EISDIR')throw e;}}}
  writeFileSync(path.join(site,'api/config.php'),`<?php return ['db_host'=>'localhost','db_name'=>'${schema}','db_user'=>'root','db_pass'=>'','pim_key'=>'pricing-fixture-key-at-least-24-characters','cache_dir'=>'${dir}/cache','media_dir'=>'${dir}/media','shop_promo_codes'=>['SAFE'=>5,'UNSAFE'=>30]];`);
  writeFileSync(path.join(site,'auth/config.php'),"<?php return ['sms_enabled'=>false,'google_enabled'=>false,'noreply_password'=>'','auth_secret'=>'pricing-fixture-secret-at-least-forty-characters'];");
  php(`${admin}$db->exec('CREATE DATABASE ${schema} CHARACTER SET utf8mb4');require '${site}/dev/prepare-runtime.php';`);
  writeFileSync(path.join(site,'router.php'),"<?php if(str_starts_with($_SERVER['REQUEST_URI'],'/api/')){require __DIR__.'/api/index.php';return;}return false;");
  const base='http://127.0.0.1:'+await port();server=spawn(runtime+'/bin/php8.4',[...args,'-d','session.save_path='+dir,'-S',base.slice(7),'-t',site,path.join(site,'router.php')],{env,stdio:['ignore','ignore','pipe']});let errors='';server.stderr.on('data',x=>errors+=x);
  const auth={'Authorization':'Bearer pricing-fixture-key-at-least-24-characters','Content-Type':'application/json'};
  async function send(route,body,headers={}){const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
  for(let i=0;i<50;i++){try{const r=await fetch(base+'/api/pim/status',{headers:auth});if(r.ok){assert.equal((await r.json()).capabilities.pricing_policy_version,1);break;}}catch{}await new Promise(r=>setTimeout(r,40));}
  function variant(sku,price=1590,kit=1370,extra={}){return {sku,price,site_price:price,minimum_sale_price:1340,pricing_policy_version:1,discount_margin_floor_pct:15,kit_price:kit,wholesale:[{price:1400,requested_discount:12},{price:1340,requested_discount:18,capped:true}],size:'L',color:'Чорний',stock:20,availability:'in',...extra};}
  const product={id:'jacket',name:'Куртка тестова',pricing_policy_version:1,category:'Одяг та форма / Куртки',variants:[variant('jacket-L'),variant('jacket-M',1710.25,1490.25,{size:'M'})],photos:[]};
  const requestProduct={id:'request',name:'Підсумок',pricing_policy_version:1,variants:[variant('request-one',1590,1370,{stock:0,availability:'ORDER_ON_REQUEST',lead_time:''})],photos:[]};
  const payload={settings:{pricing_policy_version:1,discount_margin_floor_pct:15},products:[product,requestProduct]};
  let response=await send('/api/pim/sync',payload,auth);assert.equal(response.status,200,JSON.stringify(response));assert.ok(response.data.results.every(r=>r.pricing_policy_version===1));
  response=await send('/api/pim/sync',payload,auth);assert.equal(response.status,200);assert.ok(response.data.results.every(r=>r.status==='unchanged'));
  const publicData=await (await fetch(base+'/api/product/kurtka-testova')).json();assert.equal(publicData.product.variants[1].price,1710.25);assert.equal(publicData.product.variants[0].wholesale[1].discount,15.7);assert.doesNotMatch(JSON.stringify(publicData),/minimum_sale_price|discount_margin_floor_pct|minimum_cents/);
  const catalog=await (await fetch(base+'/api/catalog?q=jacket-L')).json();assert.equal(catalog.items[0].price_max,1710.25);assert.equal((await (await fetch(base+'/api/catalog?q=jacket-L&price_from=1590.01')).json()).total,0);
  const changed=structuredClone(product);changed.variants[0]=variant('jacket-L',1800,1600);const bad=structuredClone(requestProduct);bad.variants[0].kit_price=1;
  response=await send('/api/pim/sync',{...payload,products:[changed,bad]},auth);assert.equal(response.status,400);assert.ok(response.data.results.every(r=>r.status==='error'));assert.equal((await (await fetch(base+'/api/product/kurtka-testova')).json()).product.variants[0].price,1590);
  // A checkout holding the catalog version prevents a PIM batch from changing prices midway.
  const releaseFile=path.join(dir,'release-lock');
  const holder=spawn(runtime+'/bin/php8.4',[...args,'-r',`require '${site}/shop/store-lib.php';$db=db();$db->beginTransaction();shopPricingCatalogVersion($db,true);echo "LOCKED\\n";flush();$end=microtime(true)+5;while(!is_file('${releaseFile}')&&microtime(true)<$end)usleep(10000);$db->rollBack();`],{env,stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{holder.stdout.once('data',resolve);holder.once('exit',code=>{if(code)reject(new Error('Catalog lock holder failed'));});});
  let finished=false;const pendingSync=send('/api/pim/sync',payload,auth).then(r=>{finished=true;return r;});
  await new Promise(r=>setTimeout(r,100));assert.equal(finished,false,'PIM bypassed checkout catalog lock');writeFileSync(releaseFile,'release');assert.equal((await pendingSync).status,200);
  const who=await fetch(base+'/shop/customer.php'),cookie=who.headers.get('set-cookie').split(';')[0],csrf=(await who.json()).csrf;
  const h={Cookie:cookie},lines=[{product_id:'jacket',sku:'jacket-L',qty:2,price_mode:'kit',kit_group:'custom',price:1,minimum_sale_price:1}];
  const quote=await send('/shop/checkout-quote.php',{csrf,lines},h);assert.equal(quote.status,200,JSON.stringify(quote));assert.equal(quote.data.quote.total,2740);assert.doesNotMatch(JSON.stringify(quote),/minimum_cents|_pricing/);
  const other=await send('/shop/checkout-quote.php',{csrf,lines:[{product_id:'jacket',sku:'jacket-M',qty:2,price_mode:'kit',kit_group:'custom'}]},h);assert.equal(other.data.quote.total,2980.5);
  assert.equal((await send('/shop/checkout-quote.php',{csrf,lines,promo:'SAFE'},h)).data.error_code,'DISCOUNT_NOT_ALLOWED');
  assert.equal((await send('/shop/checkout-quote.php',{csrf,lines:[{...lines[0],color:'Олива'}]},h)).data.error_code,'INVALID_VARIANT');
  const order={csrf,request_id:'a'.repeat(32),contact:{name:'Тест Покупець',recipient:'Тест Покупець',phone:'+380671234567',city:'Київ',address:'Відділення 1',delivery_type:'branch'},payment:'invoice',lines,expected_total:2740,catalog_version:quote.data.quote.catalog_version};
  const saved=await send('/shop/order.php',order,h);assert.equal(saved.status,200,JSON.stringify(saved));const replay=await send('/shop/order.php',order,h);assert.equal(replay.status,200);assert.equal(replay.data.order.id,saved.data.order.id);assert.equal(replay.data.repeated,true);
  assert.equal((await send('/api/pim/sync',{...payload,products:[changed]},auth)).status,200);
  const stale=await send('/shop/order.php',{...order,request_id:'b'.repeat(32)},h);assert.equal(stale.status,409);assert.equal(stale.data.error_code,'PRICE_CHANGED');assert.equal(stale.data.quote.total,3200);
  const requestOrder=await send('/shop/order.php',{...order,request_id:'c'.repeat(32),catalog_version:stale.data.quote.catalog_version,expected_total:1590,lines:[{product_id:'request',sku:'request-one',qty:1,price_mode:'retail'}]},h);assert.equal(requestOrder.status,200,JSON.stringify(requestOrder));
  const sql=JSON.parse(php(`${admin}$db->exec('USE ${schema}');echo json_encode(['orders'=>(int)$db->query('SELECT COUNT(*) FROM rubizh_customer_orders')->fetchColumn(),'request_reserves'=>(int)$db->query("SELECT COUNT(*) FROM rubizh_stock_reservations WHERE sku='request-one'")->fetchColumn(),'stock_qty'=>(float)$db->query("SELECT SUM(qty) FROM rubizh_stock_reservations WHERE sku='jacket-L'")->fetchColumn(),'private'=>$db->query("SELECT policy_json FROM rubizh_catalog_pricing WHERE sku='jacket-L'")->fetchColumn()]);`));
  assert.equal(sql.orders,2);assert.equal(sql.request_reserves,0);assert.equal(sql.stock_qty,2);assert.equal(JSON.parse(sql.private).minimum_cents,134000);
 }finally{server?.kill();try{php(`${admin}$db->exec('DROP DATABASE IF EXISTS ${schema}');`);}finally{rmSync(dir,{recursive:true,force:true});}}
});
