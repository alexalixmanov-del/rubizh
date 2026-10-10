// Isolated SITE copy on a fixture MySQL schema with the PIM v3 additive schema applied.
// No production configuration, credentials, network services or payments are used.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,copyFileSync,writeFileSync,readdirSync,readFileSync,statSync} from 'node:fs';
import {spawnSync,spawn} from 'node:child_process';import {tmpdir} from 'node:os';import path from 'node:path';import {createServer} from 'node:net';
export const root=path.resolve(import.meta.dirname,'../..');
export const runtime='/workspace/php-runtime/root/usr';
const ext=runtime+'/lib/php/20240924/';
export const phpArgs=['-n','-d','error_reporting=24575','-d','pdo_mysql.default_socket='+process.env.RUBIZH_TEST_MYSQL_SOCKET,...['pdo','mysqlnd','pdo_mysql','mbstring','curl'].flatMap(x=>['-d','extension='+ext+x+'.so'])];
export const phpEnv={...process.env,LD_LIBRARY_PATH:runtime+'/lib/x86_64-linux-gnu'};
export const PIM_KEY='pim-v3-fixture-key-at-least-24-characters';
export const wire=JSON.parse(readFileSync(path.join(root,'contracts/pim-v3/2/wire.exact.json'),'utf8'));
const port=()=>new Promise(r=>{const s=createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
export function php(code,{allowFail=false}={}){const r=spawnSync(runtime+'/bin/php8.4',[...phpArgs,'-r',code],{env:phpEnv,encoding:'utf8',timeout:60000});if(!allowFail)assert.equal(r.status,0,r.stdout+'\n'+r.stderr);return r;}
function copyTree(from,to){mkdirSync(to,{recursive:true});for(const f of readdirSync(from)){const src=path.join(from,f),dst=path.join(to,f);if(statSync(src).isDirectory()){if(['downloads','preview','node_modules','.git','tests','docs'].includes(f))continue;copyTree(src,dst);}else if(!['config.php','np-private.php','mono-private.php','site-settings.json','site-settings.lock'].includes(f))copyFileSync(src,dst);}}
export async function startSite({enableV3=true,extraConfig=''}={}){
 const dir=mkdtempSync(path.join(tmpdir(),'rubizh-v3-')),site=path.join(dir,'www'),schema='fixture_pim_v3_'+[...crypto.getRandomValues(new Uint8Array(6))].map(b=>b.toString(16).padStart(2,'0')).join('');
 copyTree(root,site);
 writeFileSync(path.join(site,'api/config.php'),`<?php return ['db_host'=>'localhost','db_name'=>'${schema}','db_user'=>'root','db_pass'=>'','pim_key'=>'${PIM_KEY}','cache_dir'=>'${dir}/cache','media_dir'=>'${dir}/media','media_url'=>'/media','pim_v3_sync'=>${enableV3?'true':'false'}${extraConfig}];`);
 writeFileSync(path.join(site,'auth/config.php'),"<?php return ['sms_enabled'=>false,'google_enabled'=>false,'noreply_password'=>'','auth_secret'=>'pim-v3-fixture-secret-at-least-forty-characters'];");
 const admin=`$db=new PDO('mysql:unix_socket='.getenv('RUBIZH_TEST_MYSQL_SOCKET'),'root','',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);`;
 php(`${admin}$db->exec('CREATE DATABASE ${schema} CHARACTER SET utf8mb4');require '${site}/dev/prepare-runtime.php';`);
 // Production already runs the canonical taxonomy (meta canonical_taxonomy); reproduce that state.
 php(`require '${site}/api/lib.php';$db=db();shopTaxonomySchema($db);shopTaxonomySeed($db);$db->prepare("INSERT INTO meta(k,v) VALUES('canonical_taxonomy',?) ON DUPLICATE KEY UPDATE v=VALUES(v)")->execute([shopTaxonomySpec()['version']]);`);
 // Same operator CLI as staging/production, in its isolated mode.
 const mig=spawnSync(runtime+'/bin/php8.4',[...phpArgs,path.join(site,'dev/migrate-pim-v3.php'),'--isolated','--database='+schema,'--socket='+process.env.RUBIZH_TEST_MYSQL_SOCKET,'--apply'],{env:phpEnv,encoding:'utf8'});
 assert.equal(mig.status,0,mig.stdout+mig.stderr);
 writeFileSync(path.join(site,'router.php'),"<?php $p=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);if(str_starts_with($p,'/api/')){require __DIR__.'/api/index.php';return;}if(preg_match('~^/product/~',$p)||$p==='/'){require __DIR__.'/storefront.php';return;}return false;");
 const base='http://127.0.0.1:'+await port();
 const server=spawn(runtime+'/bin/php8.4',[...phpArgs,'-d','session.save_path='+dir,'-S',base.slice(7),'-t',site,path.join(site,'router.php')],{env:phpEnv,stdio:['ignore','ignore','pipe']});
 let errors='';server.stderr.on('data',x=>errors+=x);
 const auth={'Authorization':'Bearer '+PIM_KEY,'Content-Type':'application/json'};
 for(let i=0;i<100;i++){try{const r=await fetch(base+'/api/pim/status',{headers:auth});if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,40));}
 const sql=(query)=>{const r=php(`$db=new PDO('mysql:unix_socket='.getenv('RUBIZH_TEST_MYSQL_SOCKET').';dbname=${schema};charset=utf8mb4','root','',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);echo json_encode($db->query(${JSON.stringify(query).replace(/\$/g,'\\$')})->fetchAll(PDO::FETCH_ASSOC),JSON_UNESCAPED_UNICODE);`);return JSON.parse(r.stdout);};
 async function post(route,body,headers={}){const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});const text=await r.text();let data;try{data=JSON.parse(text);}catch{data={raw:text};}return {status:r.status,data,headers:r.headers};}
 async function get(route,headers={}){const r=await fetch(base+route,{headers});const text=await r.text();let data;try{data=JSON.parse(text);}catch{data={raw:text};}return {status:r.status,data,text,headers:r.headers};}
 return {dir,site,schema,base,auth,sql,post,get,errors:()=>errors,stop:()=>server.kill()};
}
// Same chunk composition as PIM finalPublish(): header versions, batch id, categories in chunk 0, hide_ids in the last chunk.
export function chunksFor(w,{size=2,hide=[],batch}={}){
 const head=Object.fromEntries(['contract_version','version','pricing_policy_version','category_catalog_version','size_catalog_version','inventory_policy_version','order_policy_version','model_colors_version'].map(k=>[k,w[k]]));
 const parts=[];for(let i=0;i<w.products.length;i+=size)parts.push(w.products.slice(i,i+size));if(!parts.length)parts.push([]);
 const id=batch||('PB-'+(w.catalog_revision+'0000000000000000').slice(0,16)+'-'+Math.random().toString(16).slice(2).padEnd(16,'0').slice(0,16));
 return parts.map((products,i)=>({...head,pim_version:w.pim_version,currency:w.currency,generated_at:w.generated_at,catalog_revision:w.catalog_revision,batch_id:id,chunk_index:i,chunk_count:parts.length,products,hide_ids:i===parts.length-1?hide:[],...(i===0?{categories:w.categories,category_catalog_hash:w.category_catalog_hash}:{})}));
}
export async function publish(site,w,opts={}){let last;for(const body of chunksFor(w,opts)){last=await site.post('/api/pim/sync',body,site.auth);if(last.status!==200)return last;}return last;}
