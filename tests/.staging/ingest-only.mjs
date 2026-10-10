// Real PIM wire (from the private PIM backup) → staging SITE (migrated production copy, MySQL 8) → SQL profile.
// Staging only; writes a private JSON report. Usage: node tests/.staging/real-ingest.mjs /private/wire-real.json
import {spawn,spawnSync} from 'node:child_process';import {writeFileSync,readFileSync} from 'node:fs';import {createServer} from 'node:net';
import {chunksFor} from '../helpers/site-fixture.mjs';
const S='/tmp/claude-0/staging',M='/tmp/claude-0/rt/mysql8',MY=M+'/root/usr/bin/mysql',PHP=['-d','pdo_mysql.default_socket='+M+'/mysql.sock'];
const wire=JSON.parse(readFileSync(process.argv[2],'utf8'));
const sql=q=>{const r=spawnSync(MY,['--socket='+M+'/mysql.sock','-uroot','-N','-B','prodcopy','-e',q],{encoding:'utf8'});if(r.status)throw Error(r.stderr);return r.stdout.trim();};
const php=(args)=>{const r=spawnSync('php',[...PHP,...args],{cwd:S+'/www',encoding:'utf8',maxBuffer:1<<28,timeout:3600000});if(r.status)throw Error(r.stderr||r.stdout);return r.stdout;};
const port=await new Promise(r=>{const s=createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});const base='http://127.0.0.1:'+port;
writeFileSync(S+'/www/router.php',"<?php $p=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);if(str_starts_with($p,'/api/')){require __DIR__.'/api/index.php';return;}if(preg_match('~^/product/~',$p)||$p==='/'){require __DIR__.'/storefront.php';return;}return false;");
const server=spawn('php',[...PHP,'-d','session.save_path='+S+'/cache','-d','memory_limit=2G','-d','max_execution_time=0','-S',base.slice(7),'-t',S+'/www',S+'/www/router.php'],{stdio:['ignore','ignore','pipe'],env:{...process.env,PHP_CLI_SERVER_WORKERS:'4'}});let errlog='';server.stderr.on('data',x=>errlog+=x);
const auth={'Authorization':'Bearer staging-pim-key-at-least-24-characters-long','Content-Type':'application/json'};
const report={base_db:'prodcopy = production SITE dump 2026-10-09 migrated with the additive v3 schema',wire:{models:wire.products.length,variants:wire.products.reduce((n,p)=>n+p.variants.length,0),categories:wire.categories.length,catalog_revision:wire.catalog_revision}};
const counts=()=>({visible_products:+sql('SELECT COUNT(*) FROM products WHERE visible=1'),v3_models:+sql('SELECT COUNT(*) FROM products WHERE pim_contract_version=3'),visible_v3:+sql('SELECT COUNT(*) FROM products WHERE visible=1 AND pim_contract_version=3'),visible_legacy:+sql('SELECT COUNT(*) FROM products WHERE visible=1 AND pim_contract_version IS NULL'),products:+sql('SELECT COUNT(*) FROM products'),variants:+sql('SELECT COUNT(*) FROM variants'),active_v3_variants:+sql('SELECT COUNT(*) FROM variants WHERE pim_active=1'),colors:+sql('SELECT COUNT(*) FROM rubizh_product_colors'),size_options:+sql('SELECT COUNT(*) FROM rubizh_size_options'),pim_categories:+sql('SELECT COUNT(*) FROM rubizh_pim_categories')});
try{
 for(let i=0;i<200;i++){try{const r=await fetch(base+'/api/pim/status',{headers:auth});if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 report.before=counts();
 // Same chunking as the PIM publisher (FINAL_SYNC_CHUNK=100 models).
 const chunks=chunksFor(wire,{size:100});let ack,t0=performance.now(),chunkMs=[];
 for(const body of chunks){const t=performance.now();
  if(process.env.ABORT_FINAL&&body.chunk_index===chunks.length-1){
   let aborted=false;try{await fetch(base+'/api/pim/sync',{method:'POST',headers:auth,body:JSON.stringify(body),signal:AbortSignal.timeout(5000)});}catch{aborted=true;}
   report.timeout_recovery={client_aborted_at_ms:5000,aborted};let tries=[];
   for(let k=0;k<30;k++){await new Promise(r=>setTimeout(r,5000));const rr=await fetch(base+'/api/pim/sync',{method:'POST',headers:auth,body:JSON.stringify(body)});const jj=await rr.json().catch(()=>null);tries.push(rr.status+':'+(jj?.status||jj?.error_code||''));if(rr.status===200&&jj?.status==='COMMITTED'){report.timeout_recovery.resend_status=jj.status;report.timeout_recovery.replayed=jj.replayed===true;report.timeout_recovery.results=jj.results?.length;break;}}
   report.timeout_recovery.attempts=tries;}
  const r=await fetch(base+'/api/pim/sync',{method:'POST',headers:auth,body:JSON.stringify(body)});ack={status:r.status,data:await r.json().catch(()=>null)};chunkMs.push(Math.round(performance.now()-t));if(r.status!==200)break;}
 report.ingest={chunks:chunks.length,total_ms:Math.round(performance.now()-t0),max_chunk_ms:Math.max(...chunkMs),last_chunk_ms:chunkMs.at(-1),final_status:ack.status,ack_status:ack.data?.status,results:ack.data?.results?.length,result_kinds:(ack.data?.results||[]).reduce((m,x)=>(m[x.status]=(m[x.status]||0)+1,m),{}),hidden_ids:ack.data?.hidden_ids?.length,error:ack.status===200?null:JSON.stringify(ack.data).slice(0,2000)};
 report.after=counts();;if(process.env.STOP_AFTER_INGEST){throw Error("STOP")}
 // Replay of the identical last chunk must return the stored ACK and write nothing.
 const replay=await fetch(base+'/api/pim/sync',{method:'POST',headers:auth,body:JSON.stringify(chunks.at(-1))});report.replay={status:replay.status,replayed:(await replay.json()).replayed===true,unchanged:JSON.stringify(counts())===JSON.stringify(report.after)};
 const get=async u=>{const t=performance.now();const r=await fetch(base+u);const d=await r.json().catch(()=>null);return {status:r.status,ms:Math.round(performance.now()-t),total:d?.total,items:d?.items?.length};};
 const sample=wire.products[0],dto=await fetch(base+'/api/product/'+encodeURIComponent(sample.slug)).then(r=>r.json());
 report.product_dto={slug:sample.slug,contract:dto?.pim_contract_version??dto?.product?.pim_contract_version??null,colors:(dto?.colors||dto?.product?.colors||[]).length,variants:(dto?.variants||dto?.product?.variants||[]).length,private_leak:/minimum_sale_price|fulfillment_supplier|discount_margin_floor|stock_quantity/.test(JSON.stringify(dto))};
 report.http_mixed={catalog:await get('/shop/catalog.php'),catalog_in:await get('/shop/catalog.php?availability=in'),search:await get('/shop/catalog.php?q='+encodeURIComponent('куртка'))};
 report.sql_profile_mixed=JSON.parse(php(['dev/catalog-sql-profile.php']));
 // Simulated end state «only v3 visible» — staging copy only.
 sql('UPDATE products SET visible=0 WHERE visible=1 AND pim_contract_version IS NULL');spawnSync('rm',['-rf',S+'/cache/catalog']);php(['-r','require "api/lib.php";require_once "api/perf.php";shopCacheClear();']);
 report.pure_state=counts();
 report.sql_profile_pure_v3=JSON.parse(php(['dev/catalog-sql-profile.php']));
 report.http_pure={catalog:await get('/shop/catalog.php'),catalog_in:await get('/shop/catalog.php?availability=in'),search:await get('/shop/catalog.php?q='+encodeURIComponent('куртка'))};
}catch(e){report.error=String(e.stack||e).slice(0,3000);}
finally{server.kill();report.server_errors=errlog.split('\n').filter(l=>/Fatal|Warning|Exception/.test(l)).slice(0,10);writeFileSync(S+'/private/real-ingest.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,1).slice(0,6000));}
