// RC1 (stage 3, item 4.4): upgrade over the production-era SITE and roll back, on an isolated fixture database.
// The exact production revision is not recorded (owner question in docs/release/PRE_LAUNCH_BLOCKERS.md), so every
// pinned source archive that matches the production dump of 2026-10-09 (canonical taxonomy, legacy catalogue, no v3)
// is rehearsed: b442eb7 (catalogue architecture, 10-07), b1662de (banners/security, 10-08) and 9788a9e (last source
// installer, 10-08); override with RUBIZH_PRODUCTION_BASELINES=sha[,sha]. its own prepare-runtime builds the schema and synthetic
// orders cover every state. The upgrade uses the real release tools in operator order: mysqldump backup ->
// guarded P0 migration from the release package -> dev/deploy-update.sh -> prepare-runtime -> PIM v3 / CRM /
// NP recovery migrations -> reservation reconcile (R4) -> safe CRM state backfill. Rollback is the deploy
// backup (dev/rollback-update.sh) plus the database dump. No production data, network or provider is used.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,readdirSync,statSync,symlinkSync,realpathSync,existsSync} from 'node:fs';
import {spawnSync,spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {createServer} from 'node:net';
import {root,runtime,phpArgs,phpEnv} from './helpers/site-fixture.mjs';
import {password as staffPassword} from './helpers/crm-fixture.mjs';

const socket=process.env.RUBIZH_TEST_MYSQL_SOCKET;
// Three production-era candidates, RC1 itself (rubizh-stage-3-verified, stage 4 §12) and the closed-staging version
// (rubizh-stage-5.3-verified, D-80) — RC2 is rehearsed from each of them (stage 5.5, D-78).
const baselines=(process.env.RUBIZH_PRODUCTION_BASELINES||'953d086606a022275973b30cac892483faa1d1ea,6c0b15ce05eecae4feafe6b7c75f10a1cd655363,b442eb7bf96823843d2522a223cd8c6506f9e84a,b1662debc5f21a0d464019ee86dd945fcf899bcb,9788a9eddd607f1738832ce2b4f657de6f887b6c').split(',').filter(Boolean);
const has=cmd=>spawnSync('bash',['-c',cmd],{stdio:'ignore'}).status===0;
const dumpTool=['mariadb-dump','mysqldump'].find(t=>has('command -v '+t));
const clientTool=['mariadb','mysql'].find(t=>has('command -v '+t));
const skip=!socket?'fixture MySQL socket required'
 :!has('realpath -m / >/dev/null && find / -maxdepth 0 -printf "" && command -v sha256sum >/dev/null && command -v unzip >/dev/null')?'deploy helpers need GNU realpath/find, sha256sum and unzip (Linux CI)'
 :!dumpTool||!clientTool?'mysqldump/mysql client required for the backup and restore rehearsal':false;
const A='a1'.repeat(16),B='b2'.repeat(16);
const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const ok=(r,what)=>{assert.equal(r.status,0,what+'\n'+r.stdout+'\n'+r.stderr);return r.stdout;};
const cli=(file,args=[],input)=>spawnSync(runtime+'/bin/php8.4',[...phpArgs,file,...args],{env:phpEnv,encoding:'utf8',input,timeout:180000});
const sqlClient=(db,args=[],input)=>spawnSync(clientTool,['--no-defaults','-S',socket,'-uroot',...args,...(db?[db]:[])],{encoding:'utf8',input,timeout:120000,maxBuffer:1<<28});
const port=()=>new Promise(r=>{const s=createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});

// Digest of every table: row count + sha256 over rows in a stable order; `only` limits each table to given columns.
function digest(db,dir,only=null){
 const spec=path.join(dir,'digest-spec.json');writeFileSync(spec,JSON.stringify(only));
 const code=`$db=new PDO('mysql:unix_socket='.getenv('RUBIZH_TEST_MYSQL_SOCKET').';dbname=${db};charset=utf8mb4','root','',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
 $only=json_decode(file_get_contents('${spec}'),true);$out=['tables'=>[],'columns'=>[],'triggers'=>[]];
 $tables=$only?array_keys($only):$db->query('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME')->fetchAll(PDO::FETCH_COLUMN);
 foreach($tables as $t){$q=$db->prepare('SELECT COLUMN_NAME,DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION');$q->execute([$t]);$types=$q->fetchAll(PDO::FETCH_KEY_PAIR);$all=array_keys($types);
  if(!$all){$out['tables'][$t]=null;continue;}$cols=$only?$only[$t]:$all;if(array_diff($cols,$all)){$out['tables'][$t]='MISSING_COLUMNS';continue;}
  $list='\`'.implode('\`,\`',$cols).'\`';$rows=$db->query("SELECT $list FROM \`$t\` ORDER BY ".implode(',',range(1,count($cols))))->fetchAll(PDO::FETCH_NUM);
  // Values, not storage types: schema 4 widens integer prices to DECIMAL(14,2) (2400 -> 2400.00).
  $numeric=array_map(fn($c)=>in_array($types[$c],['tinyint','smallint','mediumint','int','bigint','decimal'],true),$cols);
  $rows=array_map(fn($r)=>array_map(fn($v,$n)=>$v===null?null:($n&&preg_match('/^-?[0-9]+[.][0-9]+$/D',(string)$v)?rtrim(rtrim((string)$v,'0'),'.'):(string)$v),$r,$numeric),$rows);
  $out['tables'][$t]=['count'=>count($rows),'sha256'=>hash('sha256',json_encode($rows,JSON_THROW_ON_ERROR|JSON_INVALID_UTF8_SUBSTITUTE))];$out['columns'][$t]=$all;$out['rows'][$t]=$rows;}
 $out['triggers']=$db->query('SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() ORDER BY 1')->fetchAll(PDO::FETCH_COLUMN);
 echo json_encode($out);`;
 const out=JSON.parse(ok(spawnSync(runtime+'/bin/php8.4',[...phpArgs,'-r',code],{env:phpEnv,encoding:'utf8',timeout:60000,maxBuffer:1<<26}),'digest'));Object.defineProperty(out,'rows',{enumerable:false,value:out.rows||{}});return out;
}
// Tree as {relative path: sha256}.
function tree(dir,base=dir,out={}){for(const f of readdirSync(dir)){const p=path.join(dir,f);if(statSync(p).isDirectory())tree(p,base,out);else out[path.relative(base,p)]=sha(p);}return out;}
const privateFiles=['api/config.php','auth/config.php'];

async function serve(dir,www){
 const router=path.join(dir,'router.php');
 writeFileSync(router,`<?php $p=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);if(str_starts_with($p,'/api/')){require '${www}/api/index.php';return;}if(preg_match('~^/(product|catalog|kit|categories)/~',$p)||$p==='/'){require '${www}/storefront.php';return;}if(is_dir('${www}'.$p)&&is_file('${www}'.rtrim($p,'/').'/index.php')){chdir('${www}'.rtrim($p,'/'));require '${www}'.rtrim($p,'/').'/index.php';return;}return false;`);
 const base='http://127.0.0.1:'+await port();
 const server=spawn(runtime+'/bin/php8.4',[...phpArgs,'-d','session.save_path='+dir,'-S',base.slice(7),'-t',www,router],{env:phpEnv,detached:true,stdio:['ignore','ignore','pipe']});
 let errors='';server.stderr.on('data',x=>{errors+=x;});
 for(let i=0;i<100;i++){try{await fetch(base+'/robots.txt');break;}catch{await new Promise(r=>setTimeout(r,100));}}
 const req=async(p,{method='GET',headers={},body}={})=>{const r=await fetch(base+p,{method,headers:body?{'Content-Type':'application/json',...headers}:headers,body:body?JSON.stringify(body):undefined,redirect:'manual'});const text=await r.text();let data=null;try{data=JSON.parse(text);}catch{}return {status:r.status,text,data,headers:r.headers};};
 return {base,req,stop:()=>{try{process.kill(-server.pid);}catch{}},errors:()=>errors};
}
// The cabinet session format is shared by the production-era code and RC1.
const signed=(dir,who)=>{const sid=('u'+who).slice(0,32);writeFileSync(path.join(dir,'sess_'+sid),`csrf|s:64:"${'c'.repeat(64)}";customer_id|s:32:"${who}";login_time|i:${Math.floor(Date.now()/1000)};login_method|s:5:"email";`);return {Cookie:'rubizh_customer='+sid};};

// Production-era synthetic data: catalogue, customers, managers, every order/payment/shipment/reservation state.
const orders=[
 // id, status, payment_status, owner, reservation, invoice [status, invoice_id, age_minutes, refund_status], shipment [status, tracking]
 [1001,'new','pending',A,true],
 [1002,'confirmed','pending',A,true,null,['creating',null]],
 [1003,'processing','paid',A,true,['success','inv-1003',600],['unknown',null]],
 [1004,'shipped','paid',B,true,['success','inv-1004',900],['sent','20450000001004']],
 [1005,'delivered','paid',null,true,['success','inv-1005',900],['delivered','20450000001005']],
 [1006,'completed','paid',null,false,['success','inv-1006',900],['delivered','20450000001006']],
 [1007,'cancelled','pending',null,true,null,['cancelled',null]],
 [1008,'cancelled','refunded',null,true,['success','inv-1008',900,'success']],
 [1009,'returned','refunded',null,true,['success','inv-1009',900,'success'],['delivered','20450000001009']],
 [1010,'confirmed','failed',null,false,['failure','inv-1010',600]],
 [1011,'new','cod',null,true],
 [1012,'partially_shipped','paid',null,true,['success','inv-1012',900],['created','20450000001012']],
 [1013,'confirmed','pending',null,true,['creating',null,30]],
 [1014,'confirmed','pending',null,true,['created','inv-1014',30]],
 [1015,'confirmed','pending',null,true,['unknown','inv-1015',30]],
 [1016,'confirmed','pending',null,false,null,['error',null]],
 [1017,'processing','paid',null,false,['success','inv-1017',900],['draft',null]],
];
function seedSql(){
 const q=s=>s===null?'NULL':"'"+String(s).replaceAll("'","''")+"'";const at=m=>`UTC_TIMESTAMP()-INTERVAL ${m} MINUTE`;const out=[];
 out.push("INSERT INTO categories(id,path,name,slug,url_path,parent_id,depth,sort,product_count,updated_at) VALUES('"+'c'.repeat(40)+"','Одяг','Одяг','odiah','odiah',NULL,0,1,2,UTC_TIMESTAMP())");
 for(const [id,name,price] of [['p-jacket','Куртка синтетична',1200],['p-boots','Черевики синтетичні',2400]]){
  out.push(`INSERT INTO products(id,slug,name,category_id,category_path,description,price_min,price_max,availability,variants_count,visible,hash,data,created_at,updated_at,synced_at) VALUES(${q(id)},${q(id)},${q(name)},'${'c'.repeat(40)}','Одяг','Синтетичний товар',${price},${price},'in',2,1,'${'0'.repeat(40)}','{}',UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP())`);
  for(const size of ['M','L'])out.push(`INSERT INTO variants(sku,product_id,size,color,price,kit_price,availability,sort,data) VALUES(${q('OLD-'+id+'-'+size)},${q(id)},${q(size)},'Олива',${price},${price-100},'in',0,'{}')`);
  out.push(`INSERT INTO photos(product_id,pos,src_url,src_hash,status,updated_at) VALUES(${q(id)},0,'https://example.invalid/${id}.jpg','${'1'.repeat(40)}','pending',UTC_TIMESTAMP())`);
  out.push(`INSERT INTO rubizh_catalog_fulfillment(sku,product_id,supplier_name,updated_at) VALUES(${q('OLD-'+id+'-M')},${q(id)},'M-WIN',UTC_TIMESTAMP())`);
 }
 for(const [id,mail] of [[A,'buyer-a@fixture.test'],[B,'buyer-b@fixture.test']]){
  out.push(`INSERT INTO rubizh_accounts(id,email,first_name,last_name,phone,created_at,updated_at) VALUES('${id}','${mail}','Синтетичний','Покупець','+380670000001',UTC_TIMESTAMP(),UTC_TIMESTAMP())`);
  out.push(`INSERT INTO rubizh_customer_identities(provider,subject,customer_id,contact_email,created_at) VALUES('email','${mail}','${id}','${mail}',UTC_TIMESTAMP())`);
 }
 out.push("INSERT INTO rubizh_customers(email,first_name,last_name,phone,created_at,updated_at) VALUES('legacy-guest@fixture.test','Гість','Історичний','+380670000002',UTC_TIMESTAMP(),UTC_TIMESTAMP())");
 for(const [id,status,pay,owner,reserve,inv,ship] of orders){
  const total=1200,items=JSON.stringify([{product_id:'p-jacket',sku:'OLD-p-jacket-M',name:'Куртка синтетична',size:'M',color:'Олива',price:total,qty:1}]);
  out.push(`INSERT INTO rubizh_customer_orders(id,external_id,email,order_number,status,payment_status,total,currency,items_json,delivery_label,tracking_number,created_at,updated_at) VALUES(${id},'web:${id.toString(16).padStart(32,'0')}',${q(owner===B?'buyer-b@fixture.test':'buyer-a@fixture.test')},'RZ-OLD-${id}','${status}','${pay}',${total},'UAH',${q(items)},'Нова пошта · відділення · Київ · Відділення 1',${q(ship?.[1]&&['sent','delivered'].includes(ship[0])?ship[1]:'')},${at(120)},${at(60)})`);
  out.push(`INSERT INTO rubizh_order_details(order_id,contact_json,subtotal,discount_amount,shipping_amount) VALUES(${id},${q(JSON.stringify({name:'Синтетичний Покупець',recipient:'Синтетичний Покупець',phone:'+380670000001',city:'Київ',address:'Відділення 1',delivery_type:'branch'}))},${total},0,0)`);
  out.push(`INSERT INTO rubizh_order_fulfillment_lines(order_id,line_no,product_id,sku,qty,supplier_code,line_amount,created_at,sale_unit) VALUES(${id},1,'p-jacket','OLD-p-jacket-M',1,'m_vin',${total},${at(120)},'piece')`);
  out.push(`INSERT INTO rubizh_order_timeline(order_id,event,event_key,occurred_at,detail_json) VALUES(${id},'created','created:${id}',${at(120)},'{}')`);
  if(pay==='pending')out.push(`INSERT INTO rubizh_order_timing(order_id,payment_due,remind_at,paid_at) VALUES(${id},UTC_TIMESTAMP()+INTERVAL 1 DAY,UTC_TIMESTAMP()+INTERVAL 12 HOUR,NULL)`);
  if(owner)out.push(`INSERT INTO rubizh_account_orders(order_id,customer_id) VALUES(${id},'${owner}')`);
  if(reserve)out.push(`INSERT INTO rubizh_stock_reservations(order_id,sku,qty,expires_at) VALUES(${id},'OLD-p-jacket-M',1,UTC_TIMESTAMP()+INTERVAL 1 DAY)`);
  if(inv){const [s,iid,age=60,refund='']=inv;out.push(`INSERT INTO rubizh_mono_invoices(order_id,invoice_id,reference,amount,status,page_url,modified_at,refund_ref,refund_status,created_at,updated_at) VALUES(${id},${q(iid)},'rz-old-${id}',${total*100},'${s}',${q(iid?'https://pay.mbnk.biz/'+iid:'')},'',${q(refund?'rf-'+id:'')},${q(refund)},${at(age)},${at(age)})`);
   if(s==='success')out.push(`INSERT INTO rubizh_mono_events(event_hash,invoice_id,status,created_at) VALUES('${createHash('sha256').update('ev'+id).digest('hex')}','${iid}','success',${at(age)})`);}
  if(ship)out.push(`INSERT INTO rubizh_order_shipments(order_id,supplier_code,tracking_number,np_document_ref,origin_label,status,created_at,updated_at,operation_key,lines_json,error) VALUES(${id},'m_vin',${q(ship[1])},${q(ship[1]?'00000000-0000-0000-0000-'+String(id).padStart(12,'0'):'')},'M-WIN · Нова пошта №1','${ship[0]}',${at(90)},${at(90)},${q(['creating','unknown','error'].includes(ship[0])?createHash('md5').update('op'+id).digest('hex'):null)},'[{"line_no":1,"qty":1}]',${q(ship[0]==='error'?'synthetic provider error':'')})`);
 }
 out.push(`INSERT INTO rubizh_checkout_requests(request_id,scope_hash,payload_hash,order_id,created_at) VALUES('${'d'.repeat(32)}','${'e'.repeat(64)}','${'f'.repeat(64)}',1001,UTC_TIMESTAMP())`);
 out.push("INSERT INTO rubizh_np_order_confirmations(order_id,availability_confirmed,extra_delivery_agreed,confirmed_at,confirmed_by,updated_at) VALUES(1002,1,0,UTC_TIMESTAMP(),NULL,UTC_TIMESTAMP())");
 return out.join(';\n')+';\n';
}

for(const baseline of baselines)test(`RC1 upgrade over production-era SITE ${baseline.slice(0,7)}: no data loss, old orders in cabinet and CRM, R4/R5, idempotent rerun, rollback`,{skip,timeout:900000},async()=>{
 assert.equal(spawnSync('git',['cat-file','-e',baseline+'^{commit}'],{cwd:root}).status,0,'baseline commit must be in the clone (CI uses fetch-depth 0)');
 const dir=realpathSync(mkdtempSync(path.join(tmpdir(),'rubizh-rc1-upgrade-'))),www=path.join(dir,'www'),bin=path.join(dir,'bin'),db='fixture_rc1_'+randomBytes(6).toString('hex');
 const evidence={baseline,database:db,steps:[]};const step=(name,detail={})=>evidence.steps.push({name,...detail});
 let server=null;
 try{
  mkdirSync(www,{recursive:true});mkdirSync(bin);mkdirSync(path.join(dir,'cache'));mkdirSync(path.join(dir,'media'));
  ok(spawnSync('bash',['-c','git -C "$1" archive "$2" | tar -x -C "$3"','x',root,baseline,www]),'old source');
  const php=runtime+'/bin/php8.4';symlinkSync(php,path.join(bin,'php'));
  writeFileSync(path.join(www,'api/config.php'),`<?php return ['db_host'=>'localhost','db_name'=>'${db}','db_user'=>'root','db_pass'=>'','pim_key'=>'rc1-upgrade-fixture-key-at-least-24-chars','cache_dir'=>'${dir}/cache','media_dir'=>'${dir}/media','media_url'=>'/media','np_manager_emails'=>['manager@fixture.test'],'environment'=>'staging','mono_mock'=>true];`);
  writeFileSync(path.join(www,'auth/config.php'),"<?php return ['sms_enabled'=>false,'google_enabled'=>false,'noreply_password'=>'','auth_secret'=>'rc1-upgrade-fixture-secret-at-least-forty-chars'];");
  const oldTree=tree(www);
  ok(sqlClient(null,['-e',`CREATE DATABASE ${db} CHARACTER SET utf8mb4`]),'create db');
  // Production-era schema by its own code, plus the canonical taxonomy production already runs.
  // Older revisions create the same schema lazily; prepare-runtime.php only wraps these two calls.
  if(existsSync(path.join(www,'dev/prepare-runtime.php')))ok(cli(path.join(www,'dev/prepare-runtime.php')),'old prepare-runtime');
  else ok(spawnSync(php,[...phpArgs,'-r',`require '${www}/auth/bootstrap.php';shopStoreDatabase();phoneDatabase();`],{env:phpEnv,encoding:'utf8'}),'old lazy schema');
  ok(spawnSync(php,[...phpArgs,'-r',`require '${www}/api/lib.php';$db=db();shopTaxonomySchema($db);shopTaxonomySeed($db);$db->prepare("INSERT INTO meta(k,v) VALUES('canonical_taxonomy',?) ON DUPLICATE KEY UPDATE v=VALUES(v)")->execute([shopTaxonomySpec()['version']]);`],{env:phpEnv,encoding:'utf8'}),'old taxonomy');
  ok(sqlClient(db,[],seedSql()),'seed');
  // Old code serves the shop and the cabinet before the upgrade.
  server=await serve(dir,www);
  for(const p of ['/','/shop/catalog.php','/sitemap.php'])assert.equal((await server.req(p)).status,200,'old '+p+server.errors());
  const oldCabinet=await server.req('/auth/?tab=orders',{headers:signed(dir,A)});assert.equal(oldCabinet.status,200);assert.ok(oldCabinet.text.includes('RZ-OLD-1001'),'old cabinet lists own order');
  server.stop();server=null;
  // Reference state = what the backup will contain (after the old code has served real requests).
  const before=digest(db,dir),oldColumns=before.columns;
  const volatile=new Set(['rubizh_shop_limits']);// rate-limiter windows, rewritten by every request
  step('production-era schema',{tables:Object.keys(before.tables).length,rows:Object.fromEntries(Object.entries(before.tables).map(([t,v])=>[t,v.count]))});

  // 1. Consistent backup outside the web root (production runbook STEP 3–4).
  const backup=path.join(dir,'site-before-rc1.sql');const dumpArgs=['--no-defaults','-S',socket,'-uroot','--single-transaction','--routines','--triggers',...(spawnSync(dumpTool,['--help'],{encoding:'utf8'}).stdout.includes('column-statistics')?['--column-statistics=0']:[]),db];
  const dump=spawnSync(dumpTool,dumpArgs,{encoding:'utf8',maxBuffer:1<<28});ok(dump,'dump');writeFileSync(backup,dump.stdout);assert.match(dump.stdout.trimEnd().split('\n').pop(),/Dump completed/);
  const backupSha=sha(backup);step('backup',{bytes:statSync(backup).size,sha256:backupSha});

  // 2. Reproducible release package of the checked-out RC1 source.
  const pkg=path.join(dir,'rc1.zip');const built=JSON.parse(ok(spawnSync('python3',[path.join(root,'dev/package-release.py'),pkg],{cwd:root,encoding:'utf8'}),'package'));
  assert.equal(built.sha256,sha(pkg));step('package',{sha256:built.sha256,files:built.files});
  const unpacked=path.join(dir,'pkg');ok(spawnSync('unzip',['-q',pkg,'-d',unpacked]),'unzip');

  // 3. Guarded P0 order migration first, from the package and outside the web root (installer precondition).
  const p0plan=JSON.parse(ok(cli(path.join(unpacked,'rubizh/dev/migrate-order-p0.php'),['--plan','--config='+path.join(www,'api/config.php')]),'p0 plan'));assert.equal(p0plan.database,db);
  const p0=base=>ok(cli(path.join(base,'dev/migrate-order-p0.php'),['--apply','--config='+path.join(www,'api/config.php'),'--database='+db,'--backup-file='+backup,'--backup-sha256='+backupSha]),'p0 apply');
  p0(path.join(unpacked,'rubizh'));step('order P0 migration');
  // 4. Source update with its private backup and rollback command.
  const env={...process.env,PATH:bin+':'+process.env.PATH,LD_LIBRARY_PATH:runtime+'/lib/x86_64-linux-gnu'};
  const deployed=spawnSync('bash',[path.join(unpacked,'rubizh/dev/deploy-update.sh'),www,pkg,built.sha256],{env,encoding:'utf8',timeout:300000});
  ok(deployed,'deploy-update');const deployBackup=/Private rollback backup: (.+)/.exec(deployed.stdout)[1].trim();
  assert.ok(!deployBackup.startsWith(www+'/'),'source backup lives outside the web root');
  assert.ok(readFileSync(path.join(www,'api/config.php'),'utf8').includes("'np_manager_emails'"),'private config with manager list preserved');
  for(const [rel,hash] of Object.entries(JSON.parse(readFileSync(path.join(unpacked,'rubizh/RELEASE-MANIFEST.json'),'utf8')).files))if(!privateFiles.includes(rel))assert.equal(sha(path.join(www,rel)),hash,'installed '+rel);
  step('deploy-update',{installed_files:built.files});
  // The live window between the code swap and the remaining migrations: RC1 code on the P0-only schema keeps the
  // shop and the cabinet serving; the staff API refuses until its own migration instead of failing half-way.
  server=await serve(dir,www);
  for(const p of ['/','/shop/catalog.php','/sitemap.php'])assert.equal((await server.req(p)).status,200,'window '+p+server.errors());
  const windowCabinet=await server.req('/auth/?tab=orders&order=1001',{headers:signed(dir,A)});assert.equal(windowCabinet.status,200);assert.ok(windowCabinet.text.includes('RZ-OLD-1001'),'cabinet during the migration window');
  assert.equal((await server.req('/api/staff/auth/session')).status,503,'staff API waits for the CRM migration');
  server.stop();server=null;step('code-swap window',{storefront:200,cabinet:200,staff_api:503});
  // 5. Remaining guarded migrations in operator order.
  const migrate=()=>{
   ok(cli(path.join(www,'dev/prepare-runtime.php')),'prepare-runtime');
   ok(cli(path.join(www,'dev/migrate-pim-v3.php'),['--site-config','--apply','--database='+db,'--backup-file='+backup,'--backup-sha256='+backupSha]),'pim v3');
   ok(cli(path.join(www,'dev/migrate-crm.php'),['--apply','--database='+db,'--backup-file='+backup,'--backup-sha256='+backupSha]),'crm');
   ok(cli(path.join(www,'dev/migrate-np-recovery.php'),['--apply','--database='+db,'--backup-file='+backup,'--backup-sha256='+backupSha]),'np recovery');
   const reconcile=JSON.parse(ok(cli(path.join(www,'dev/reconcile-reservations.php'),['--site-config','--apply','--database='+db,'--backup-file='+backup,'--backup-sha256='+backupSha]),'reservations'));
   const plan=JSON.parse(ok(cli(path.join(www,'dev/backfill-crm-order-states.php'),['--plan']),'backfill plan'));
   if(plan.counts.safe_mappings>0)ok(cli(path.join(www,'dev/backfill-crm-order-states.php'),['--apply','--database='+db,'--plan-sha256='+plan.plan_sha256,'--backup-file='+backup,'--backup-sha256='+backupSha]),'backfill apply');
   return {reconcile,backfill:plan.counts};
  };
  const first=migrate();step('migrations',first);
  const after=digest(db,dir);
  // No data loss: every production-era table keeps its rows and the values of its original columns.
  // R4 reservation transitions (status/committed_at/released_at, present from RC1 on) are asserted separately below.
  const r4=new Set(['status','committed_at','released_at']);const keep=Object.fromEntries(Object.entries(oldColumns).filter(([t])=>!volatile.has(t)).map(([t,c])=>[t,t==='rubizh_stock_reservations'&&Array.isArray(c)?c.filter(x=>!r4.has(x)):c]));
  const oldOnly=digest(db,dir,keep);
  // Live requests in the code-swap window may append rows (e.g. the cabinet records a legacy order's creation event),
  // so the check is: every production-era row survives with identical original columns (multiset); additions are reported.
  const lost=[],added={};for(const [t,v] of Object.entries(oldOnly.tables)){if(t==='meta')continue;if(!v||v==='MISSING_COLUMNS'){lost.push(t);continue;}
   const left=new Map();for(const r of oldOnly.rows[t]){const k=JSON.stringify(r);left.set(k,(left.get(k)||0)+1);}
   const cols=before.columns[t],pick=Array.isArray(cols)&&Array.isArray(keep[t])?cols.map((c,i)=>keep[t].includes(c)?i:-1).filter(i=>i>=0):null;
   let missing=0;for(const r0 of before.rows[t]){const r=pick&&Array.isArray(r0)?pick.map(i=>r0[i]):r0;const k=JSON.stringify(r);if(left.get(k))left.set(k,left.get(k)-1);else missing++;}
   if(missing)lost.push(t);if(v.count>before.tables[t].count)added[t]=v.count-before.tables[t].count;}
  // meta: every production-era key survives with its value; only schema-version markers may advance.
  const metaNow=Object.fromEntries(oldOnly.rows.meta),metaChanged=before.rows.meta.filter(([k,v])=>metaNow[k]!==v).map(([k,v])=>[k,v,metaNow[k]??null]);
  assert.deepEqual(metaChanged.filter(([k,,now])=>now===null||!/schema$/.test(k)),[],'production-era meta keys lost or changed');
  assert.ok(Object.keys(added).every(t=>t==='rubizh_order_timeline')&&(added.rubizh_order_timeline??0)<=1,'only the cabinet window may add one legacy creation event: '+JSON.stringify(added));
  assert.deepEqual(lost,[],'production-era rows/columns changed or lost: '+JSON.stringify(lost.map(t=>[t,before.columns[t],before.rows[t],oldOnly.rows?.[t]])));
  step('data retained',{tables_compared:Object.keys(oldOnly.tables).length,lost:lost.length,rows_added_by_live_requests:added,meta_schema_markers_advanced:metaChanged,new_tables:Object.keys(after.tables).filter(t=>!(t in before.tables)).length,triggers:after.triggers});
  // R4: terminal orders release stock, paid ones stay committed, open orders stay reserved.
  const res=Object.fromEntries(JSON.parse(ok(sqlClient(db,['-N','-e','SELECT JSON_ARRAYAGG(JSON_ARRAY(order_id,status)) FROM rubizh_stock_reservations']),'reservations').trim()));
  assert.deepEqual(res,{1001:'ACTIVE',1002:'ACTIVE',1003:'COMMITTED',1004:'COMMITTED',1005:'COMMITTED',1007:'RELEASED',1008:'RELEASED',1009:'RELEASED',1011:'ACTIVE',1012:'COMMITTED',1013:'ACTIVE',1014:'ACTIVE',1015:'ACTIVE'});
  step('R4 reservations',{statuses:res});

  // 6. Idempotent rerun: the same migrations again change nothing.
  p0(www);const second=migrate();assert.equal(second.reconcile.terminal_released??0,0);
  const again=digest(db,dir);for(const t of volatile){delete again.tables[t];delete after.tables[t];}
  assert.deepEqual(again.tables,after.tables,'rerun changed data');assert.deepEqual(again.triggers,after.triggers);
  step('idempotent rerun',{tables:Object.keys(again.tables).length,changed:0});

  // 7. Old orders are readable in the cabinet and in CRM; the shop serves.
  // CRM go-live steps C5/C7 (docs/crm/16): secret key and crm_enabled; TOTP enrolment is covered by the CRM auth tests.
  {const f=path.join(www,'api/config.php'),c=readFileSync(f,'utf8'),i=Math.max(c.lastIndexOf('];'),c.lastIndexOf(');'));writeFileSync(f,c.slice(0,i).replace(/,?\s*$/,'')+",'crm_enabled'=>true,'crm_secret_key'=>'"+Buffer.alloc(32,9).toString('base64')+"','crm_totp_required'=>false"+c.slice(i));}
  assert.match(readFileSync(path.join(www,'api/config.php'),'utf8'),/'crm_enabled'=>true/,'CRM enabled in the private config');assert.equal(spawnSync(runtime+'/bin/php8.4',['-l',path.join(www,'api/config.php')],{encoding:'utf8'}).status,0,readFileSync(path.join(www,'api/config.php'),'utf8').slice(-400));
  ok(cli(path.join(www,'dev/staff-user.php'),['--email=owner@fixture.test','--name=Owner Fixture','--role=OWNER','--reason=RC1 upgrade rehearsal initial owner'],staffPassword+'\n'),'staff owner');
  server=await serve(dir,www);
  for(const p of ['/','/shop/catalog.php','/sitemap.php'])assert.equal((await server.req(p)).status,200,'rc1 '+p+server.errors());
  for(const id of [1001,1002,1003]){const d=await server.req('/auth/?tab=orders&order='+id,{headers:signed(dir,A)});assert.equal(d.status,200);assert.ok(d.text.includes('RZ-OLD-'+id),'cabinet detail '+id);}
  const foreign=await server.req('/auth/?tab=orders&order=1004',{headers:signed(dir,A)});assert.ok([200,404].includes(foreign.status),'foreign order request answered '+foreign.status);assert.ok(!foreign.text.includes('RZ-OLD-1004'),'cabinet never shows another customer order');
  const session=await server.req('/api/staff/auth/session');assert.ok(session.headers.get('set-cookie'),'staff session '+session.status+' '+JSON.stringify(session.data));let cookie=session.headers.get('set-cookie').split(';')[0];
  const login=await server.req('/api/staff/auth/login',{method:'POST',headers:{Cookie:cookie},body:{email:'owner@fixture.test',password:staffPassword,csrf:session.data.meta.csrf}});
  assert.equal(login.status,200,JSON.stringify(login.data));cookie=login.headers.get('set-cookie').split(';')[0];
  for(const [id] of orders){const r=await server.req('/api/staff/orders/'+id,{headers:{Cookie:cookie}});assert.equal(r.status,200,id+' '+JSON.stringify(r.data));assert.ok(JSON.stringify(r.data).includes('RZ-OLD-'+id),'crm order number '+id);}
  assert.equal((await server.req('/api/staff/orders',{headers:{Cookie:cookie}})).status,200);
  step('cabinet and CRM',{cabinet_orders_opened:3,foreign_hidden:true,crm_orders_opened:orders.length});

  // 8. R5: unknown/creating invoices are resolved only by an authenticated bank status read.
  const transport=`define('RUBIZH_AUTH_NO_SESSION',true);define('RUBIZH_MONO_TESTS',true);chdir('${www}');require '${www}/auth/bootstrap.php';$GLOBALS['mono_test_transport']=function($path,$body){if(!preg_match('~^invoice/status\\?invoiceId=(.+)$~',$path,$m))throw new RuntimeException('unexpected endpoint '.$path);$db=shopStoreDatabase();$q=$db->prepare('SELECT * FROM rubizh_mono_invoices WHERE invoice_id=?');$q->execute([urldecode($m[1])]);$i=$q->fetch(PDO::FETCH_ASSOC);return ['invoiceId'=>$i['invoice_id'],'reference'=>$i['reference'],'amount'=>(int)$i['amount'],'ccy'=>980,'status'=>$i['invoice_id']==='inv-1015'?'success':'created','modifiedDate'=>'2026-10-14T00:00:00Z'];};monoWorkerRun(shopStoreDatabase());`;
  ok(spawnSync(php,[...phpArgs,'-r',transport],{env:phpEnv,encoding:'utf8',timeout:60000}),'mono worker');
  const inv=Object.fromEntries(JSON.parse(ok(sqlClient(db,['-N','-e','SELECT JSON_ARRAYAGG(JSON_ARRAY(i.order_id,i.status,o.payment_status)) FROM rubizh_mono_invoices i JOIN rubizh_customer_orders o ON o.id=i.order_id WHERE i.order_id IN (1013,1014,1015)']),'invoices').trim()).map(([o,s,p])=>[o,[s,p]]));
  assert.deepEqual(inv[1013],['failure','failed'],'stale attempt without bank id fails truthfully');
  assert.deepEqual(inv[1014],['created','pending'],'known invoice confirmed as still open');
  assert.deepEqual(inv[1015],['awaiting_webhook','pending'],'bank success is never assumed paid locally');
  step('R5 invoices',{invoices:inv});
  server.stop();server=null;

  // 9. Rollback: previous source from the deploy backup, then the old code on the migrated schema, then the dump.
  ok(spawnSync('bash',[path.join(www,'dev/rollback-update.sh'),deployBackup,www],{env,encoding:'utf8',timeout:300000}),'rollback-update');
  const restored=tree(www);for(const f of privateFiles){delete restored[f];delete oldTree[f];}
  assert.deepEqual(restored,oldTree,'source tree after rollback equals the production-era tree');
  server=await serve(dir,www);
  for(const p of ['/','/shop/catalog.php','/sitemap.php'])assert.equal((await server.req(p)).status,200,'old code on migrated schema '+p+server.errors());
  assert.ok((await server.req('/auth/?tab=orders',{headers:signed(dir,A)})).text.includes('RZ-OLD-1001'),'old cabinet on migrated schema');
  server.stop();server=null;
  ok(sqlClient(null,['-e',`DROP DATABASE ${db}; CREATE DATABASE ${db} CHARACTER SET utf8mb4`]),'recreate db');
  ok(sqlClient(db,[],readFileSync(backup,'utf8')),'restore');
  const back=digest(db,dir);assert.deepEqual(back.tables,before.tables,'restored database equals the pre-upgrade database');assert.deepEqual(back.triggers,before.triggers);
  server=await serve(dir,www);
  for(const p of ['/','/shop/catalog.php','/sitemap.php'])assert.equal((await server.req(p)).status,200,'old code after restore '+p);
  assert.ok((await server.req('/auth/?tab=orders',{headers:signed(dir,A)})).text.includes('RZ-OLD-1001'),'old cabinet after restore');
  step('rollback',{tree_files:Object.keys(restored).length,tables_equal:Object.keys(back.tables).length});
  evidence.result='PASS';
 }finally{
  server?.stop();
  if(process.env.RUBIZH_TEST_REPORTS){mkdirSync(process.env.RUBIZH_TEST_REPORTS,{recursive:true});writeFileSync(path.join(process.env.RUBIZH_TEST_REPORTS,`rc1-upgrade-${baseline.slice(0,7)}.json`),JSON.stringify(evidence,null,1));}
  sqlClient(null,['-e',`DROP DATABASE IF EXISTS ${db}`]);rmSync(dir,{recursive:true,force:true});
 }
});
