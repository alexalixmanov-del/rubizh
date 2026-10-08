import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readdirSync,copyFileSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {spawnSync,spawn} from 'node:child_process';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
import {chromium} from 'playwright';
import {products} from '../dev/fixtures.mjs';
const root=path.resolve(import.meta.dirname,'..'),runtime='/workspace/php-runtime/root/usr';
const args=['-n','-d','error_reporting=24575','-d','pdo_mysql.default_socket='+process.env.RUBIZH_TEST_MYSQL_SOCKET,...['pdo','mysqlnd','pdo_mysql','mbstring','curl','gd'].flatMap(x=>['-d','extension='+runtime+'/lib/php/20240924/'+x+'.so'])];
const env={...process.env,LD_LIBRARY_PATH:runtime+'/lib/x86_64-linux-gnu'};
function php(code){const p=spawnSync(runtime+'/bin/php8.4',[...args,'-r',code],{env,encoding:'utf8',timeout:180000});assert.equal(p.status,0,p.stderr+p.stdout);return p.stdout;}
async function port(){const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
test('Real HTTP: nonce CSP, banner loading, bounded reads, duplicate checkout and concurrent stock reservation',{skip:!process.env.RUBIZH_TEST_MYSQL_SOCKET,timeout:240000},async()=>{
 const d=mkdtempSync(path.join(tmpdir(),'rubizh-runtime-http-')),site=path.join(d,'www'),schema='fixture_runtime_'+Math.random().toString(16).slice(2);mkdirSync(site);
 let server,browser;const report={environment:'isolated PHP CLI server and MariaDB, not production hosting'};
 const admin=`$a=new PDO('mysql:unix_socket='.getenv('RUBIZH_TEST_MYSQL_SOCKET'),'root','');`;
 try{
  for(const folder of ['api','auth','shop','assets','dev']){mkdirSync(path.join(site,folder));for(const f of readdirSync(path.join(root,folder)))if(!['config.php','mono-private.php','np-private.php','site-settings.json','site-settings.lock'].includes(f)&&!f.startsWith('.')&&['.php','.json','.js','.css','.woff2','.webp','.sh','.svg'].includes(path.extname(f))){try{copyFileSync(path.join(root,folder,f),path.join(site,folder,f));}catch(e){if(e.code!=='EISDIR')throw e;}}}
  for(const f of ['index.html','storefront.php','health.php','offer.html','privacy.html'])copyFileSync(path.join(root,f),path.join(site,f));
  writeFileSync(path.join(site,'api/config.php'),`<?php return ['db_host'=>'localhost','db_name'=>'${schema}','db_user'=>'root','db_pass'=>'','cache_dir'=>'${site}/cache','media_dir'=>'${site}/media','nova_poshta_api_key'=>'','mono_token'=>''];`);
  writeFileSync(path.join(site,'auth/config.php'),"<?php return ['sms_enabled'=>false,'google_enabled'=>false,'noreply_password'=>'','auth_secret'=>'test-fixture-secret-at-least-forty-characters'];");
  let catalog=process.env.RUBIZH_CAPACITY_CATALOG?JSON.parse(readFileSync(process.env.RUBIZH_CAPACITY_CATALOG)):structuredClone(products);
  for(const id of ['race-stock','repeat-order','reverse-a','reverse-b']){const p=structuredClone(products.find(x=>x.slot==='body'));p.id=id;p.slug=id;p.name='Куртка '+id;p.variants=[{...p.variants[0],sku:id+'-L',price:1000,kit_price:1000,stock:id==='race-stock'?1:20,availability:'in',size_display:'L',size_native:'L'}];catalog.push(p);}
  for(const p of catalog)p.photos=(p.photos||[]).map(x=>(typeof x==='string'?x:x.url).replace(/^\//,'https://rubizh.shop/'));
  writeFileSync(path.join(site,'seed.json'),JSON.stringify(catalog));
  const seed=`${admin}$a->exec('CREATE DATABASE ${schema} CHARACTER SET utf8mb4');require '${site}/shop/taxonomy-migration.php';$db=db();foreach(json_decode(file_get_contents('${site}/seed.json'),true) as $p){$r=save_product($db,$p);if($r['status']==='error')throw new Exception('Seed failed');}shopTaxonomyApply($db,'${d}/private');echo count(json_decode(file_get_contents('${site}/seed.json'),true));`;
  report.products=Number(php(seed));
  php(`require '${site}/dev/prepare-runtime.php';`);
  // Use a real PDO connection that rejects DDL: ordinary requests must work
  // after the installer has prepared the schema, without issuing CREATE/ALTER.
  const schemaCheck=php(`require '${site}/shop/runtime.php';class NoDdl extends PDO {public function exec(string $s): int|false {if(preg_match('/^(CREATE|ALTER|DROP)/i',$s))throw new Exception('Unexpected request-time DDL');return parent::exec($s);}}$db=new NoDdl('mysql:unix_socket='.getenv('RUBIZH_TEST_MYSQL_SOCKET').';dbname=${schema}','root','',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);if(!rubizhSchemaPrepared($db))throw new Exception('Schema flag absent');require '${site}/api/lib.php';migrate($db);require '${site}/shop/customer-ui.php';shopUiMigrate($db);`);assert.equal(schemaCheck,'');
  writeFileSync(path.join(site,'router.php'),"<?php $p=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);if(str_starts_with($p,'/api/')){require __DIR__.'/api/index.php';return;}if(is_file(__DIR__.$p))return false;require __DIR__.'/storefront.php';");
  const p=await port(),base='http://127.0.0.1:'+p;
  server=spawn(runtime+'/bin/php8.4',[...args,'-d','session.save_path='+d,'-S','127.0.0.1:'+p,'-t',site,path.join(site,'router.php')],{env:{...env,PHP_CLI_SERVER_WORKERS:'12'},detached:true,stdio:['ignore','ignore','pipe']});let errors='';server.stderr.on('data',x=>errors+=x);
  for(let i=0;i<80;i++){try{const r=await fetch(base+'/shop/catalog.php?action=categories');if(r.ok){await r.arrayBuffer();break;}await r.arrayBuffer();}catch{}await new Promise(r=>setTimeout(r,50));}
  const htmlResponse=await fetch(base+'/kit'),html=await htmlResponse.text(),csp=htmlResponse.headers.get('content-security-policy');
  assert.equal(htmlResponse.status,200);assert.match(csp,/script-src 'self' 'nonce-/);assert.match(csp,/frame-ancestors 'none'/);assert.ok([...html.matchAll(/<script\b[^>]*>/g)].every(x=>x[0].includes('nonce="')));
  const malformed=await fetch(base+'/shop/catalog.php?q%5B%5D=a');assert.equal(malformed.status,400);assert.equal(malformed.headers.get('cache-control'),'no-store');await malformed.arrayBuffer();
  const callback=await fetch(base+'/shop/mono-webhook.php',{method:'POST',body:'{}'});assert.equal(callback.status,403);assert.equal(callback.headers.get('set-cookie'),null);await callback.arrayBuffer();
  const notReady=await fetch(base+'/health.php');assert.equal(notReady.status,503);assert.deepEqual(await notReady.json(),{ready:false});
  php(`require '${site}/shop/cache-worker.php';`);
  const ready=await fetch(base+'/health.php');assert.equal(ready.status,200);assert.equal(ready.headers.get('cache-control'),'no-store, private');assert.equal(ready.headers.get('set-cookie'),null);assert.deepEqual(await ready.json(),{ready:true});
  writeFileSync(path.join(d,'rubizh-runtime','cache-heartbeat.json'),JSON.stringify({at:Math.floor(Date.now()/1000)-181,healthy:true}));
  const stale=await fetch(base+'/health.php');assert.equal(stale.status,503);assert.deepEqual(await stale.json(),{ready:false});php(`require '${site}/shop/cache-worker.php';`);
  const initial=await (await fetch(base+'/shop/catalog.php?action=storefront')).json();assert.equal(initial.ok,true);assert.ok(initial.products.length<=96);
  report.initial_recommendations={products:initial.products.length,json_bytes:Buffer.byteLength(JSON.stringify(initial))};
  browser=await chromium.launch({executablePath:existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined,headless:true,args:['--no-sandbox']});
  for(const theme of ['light','dark']){
   const page=await browser.newPage({viewport:{width:390,height:844}}),violations=[],jsErrors=[];page.on('pageerror',e=>jsErrors.push(e.message));
   await page.addInitScript(t=>{localStorage.setItem('rubizh.theme',t);window.cspViolations=[];document.addEventListener('securitypolicyviolation',e=>window.cspViolations.push(e.violatedDirective+' '+e.blockedURI));},theme);
   await page.goto(base+'/catalog/odiah-ta-forma');await page.locator('[data-catalog-section]').first().waitFor();
   const images=JSON.parse(readFileSync(path.join(root,'docs/category-banners-numbered-20261008.json'))).map(x=>x.asset);
   assert.equal(await page.evaluate(async images=>(await Promise.all(images.map(src=>new Promise(resolve=>{const i=new Image();i.onload=()=>resolve(i.naturalWidth>0);i.onerror=()=>resolve(false);i.src=src;})))).every(Boolean),images),true);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   violations.push(...await page.evaluate(()=>window.cspViolations));assert.deepEqual(violations,[]);assert.deepEqual(jsErrors,[]);
   if(process.env.RUBIZH_CAPACITY_REPORT){const out=path.dirname(process.env.RUBIZH_CAPACITY_REPORT);mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'banners-mobile-'+theme+'.png')});}
   await page.goto(base+'/kit');await page.locator('.rz-slot-select').first().waitFor();await page.close();
  }
  await browser.close();browser=null;
  for(const slot of ['head','body','legs','boots','armor','gear','med','small']){const r=await fetch(base+'/shop/catalog.php?slot='+slot);assert.equal(r.status,200);await r.arrayBuffer();}
  report.reads=[];
  for(const [clients,requests] of [[8,96],[32,160]]){
   const durations=[],statuses=[],start=performance.now();let next=0;
   await Promise.all(Array.from({length:clients},async()=>{while(next<requests){const i=next++,t=performance.now();const r=await fetch(base+'/shop/catalog.php?slot='+['head','body','legs','boots','armor','gear','med','small'][i%8]);const data=await r.json();statuses.push(r.status);if(r.ok){assert.ok(Number.isInteger(data.total)&&data.total>=0);assert.ok(Array.isArray(data.items));}durations.push(performance.now()-t);}}));
   durations.sort((a,b)=>a-b);report.reads.push({clients,requests,elapsed_ms:Math.round(performance.now()-start),p50_ms:Math.round(durations[Math.floor(durations.length*.5)]),p95_ms:Math.round(durations[Math.floor(durations.length*.95)]),statuses:statuses.reduce((m,s)=>(m[s]=(m[s]||0)+1,m),{})});assert.ok(statuses.every(s=>s===200||s===503));if(clients===8)assert.ok(statuses.every(s=>s===200));
  }
  async function buyer(){const r=await fetch(base+'/shop/customer.php');assert.equal(r.status,200);return {cookie:r.headers.get('set-cookie').split(';')[0],csrf:(await r.json()).csrf};}
  function order(b,id,sku,qty=1){return {csrf:b.csrf,request_id:id,contact:{name:'Тест Покупець',recipient:'Тест Покупець',phone:'+380976867892',city:'Київ',address:'Відділення 1',delivery_type:'branch'},payment:'invoice',expected_total:1000*qty,lines:[{product_id:sku,sku:sku+'-L',qty}]};}
  async function post(b,body){const r=await fetch(base+'/shop/order.php',{method:'POST',headers:{'Content-Type':'application/json','Cookie':b.cookie},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
  const b=await buyer(),same=order(b,'a'.repeat(32),'repeat-order');let repeats=await Promise.all(Array.from({length:8},()=>post(b,same)));
  for(let i=0;i<repeats.length;i++)if(repeats[i].status===503)repeats[i]=await post(b,same);
  assert.ok(repeats.every(r=>r.status===200),JSON.stringify(repeats));assert.equal(new Set(repeats.map(r=>r.data.order.id)).size,1);report.duplicate_checkout={requests:8,orders:1};
  assert.equal((await post(b,{...same,expected_total:1,lines:[{product_id:'repeat-order',sku:'repeat-order-L',qty:2}]})).status,409);
  const buyers=[];for(let i=0;i<8;i++)buyers.push(await buyer());const stock=await Promise.all(buyers.map((b,i)=>post(b,order(b,(i+1).toString(16).padStart(32,'0'),'race-stock'))));
  assert.equal(stock.filter(x=>x.status===200).length,1,JSON.stringify(stock));assert.ok(stock.every(x=>[200,400,503].includes(x.status)));report.stock_race={buyers:8,available:1,saved_orders:1};
  const reverseBuyers=[await buyer(),await buyer()];const reverseResults=await Promise.all(reverseBuyers.map((b,i)=>{const lines=['reverse-a','reverse-b'].map(s=>({product_id:s,sku:s+'-L',qty:1}));if(i)lines.reverse();return post(b,{...order(b,String(i+9).padStart(32,'0'),'reverse-a'),lines,expected_total:2000});}));assert.ok(reverseResults.every(x=>x.status===200),JSON.stringify(reverseResults));report.opposite_cart_order={buyers:2,orders:2,deadlocks:0};
  report.order_rows=Number(php(`${admin}echo $a->query('SELECT COUNT(*) FROM ${schema}.rubizh_customer_orders')->fetchColumn();`));assert.equal(report.order_rows,4);
  const reservations=Number(php(`${admin}echo $a->query("SELECT SUM(qty) FROM ${schema}.rubizh_stock_reservations WHERE sku='race-stock-L'")->fetchColumn();`));assert.equal(reservations,1);
  report.csp_violations=0;report.loaded_banners=96;assert.doesNotMatch(errors,/Fatal error|Uncaught|deadlock found/i);
  if(process.env.RUBIZH_CAPACITY_REPORT)writeFileSync(process.env.RUBIZH_CAPACITY_REPORT,JSON.stringify(report,null,2));
 }finally{await browser?.close();if(server){try{process.kill(-server.pid,'SIGTERM');}catch{}}php(`${admin}$a->exec('DROP DATABASE IF EXISTS ${schema}');`);rmSync(d,{recursive:true,force:true});}
});
