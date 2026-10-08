import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,readdirSync,writeFileSync,utimesSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync,spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..'),runtime='/workspace/php-runtime/root/usr';
const php=runtime+'/bin/php8.4',options=['-n','-d','error_reporting=24575',...['pdo','mysqlnd','pdo_mysql','mbstring'].flatMap(x=>['-d','extension='+runtime+'/lib/php/20240924/'+x+'.so'])];
const env={...process.env,LD_LIBRARY_PATH:runtime+'/lib/x86_64-linux-gnu'};
function run(source){const p=spawnSync(php,[...options,'-r',source],{env,encoding:'utf8'});assert.equal(p.status,0,p.stderr+p.stdout);return p.stdout;}
function asyncRun(source){return new Promise((resolve,reject)=>{const p=spawn(php,[...options,'-r',source],{env});let out='',err='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.on('close',code=>code?reject(Error(err+out)):resolve(out));});}
test('Catalogue rejects malformed and excessive filters before SQL, while normalizing pagination',()=>{
 const value=JSON.parse(run(`require '${root}/shop/runtime.php';$n=0;foreach([['q'=>str_repeat('x',161)],['page'=>'1 OR 1=1'],['q'=>['array']],['attrs'=>'{"bad":[]}'],['attrs'=>json_encode(array_fill(0,25,'x'))],['q'=>"\\xff"]] as $v){try{rubizhCatalogInput($v);}catch(RubizhHttpException $e){if($e->status===400)$n++;}}echo json_encode([$n,rubizhCatalogInput(['page'=>'999999','limit'=>'9999','q'=>' куртка '])]);`));
 assert.equal(value[0],6);assert.deepEqual(value[1],{page:'1000',limit:'100',q:'куртка'});
});
test('Supplier image downloader blocks private IPv4/IPv6, credentials, unusual ports and unsafe redirect destinations',()=>{
 const value=JSON.parse(run(`require '${root}/api/http-download.php';$out=[];foreach(['127.0.0.1','10.1.2.3','172.16.0.1','192.168.0.1','169.254.169.254','100.64.0.1','::1','fc00::1','fe80::1','::ffff:127.0.0.1','0.0.0.0','224.0.0.1'] as $ip)$out[$ip]=rubizhPublicIp($ip);$n=0;foreach(['file:///etc/passwd','http://user:password@8.8.8.8/','https://8.8.8.8:8443/','http://127.0.0.1/a','http://[::1]/','http://169.254.169.254/latest/'] as $url){try{rubizhDownloadTarget($url);}catch(RuntimeException $e){$n++;}}$target=rubizhRedirectUrl('https://example.com/a/photo','//169.254.169.254/latest');try{rubizhDownloadTarget($target);}catch(RuntimeException $e){$n++;}echo json_encode([$out,$n,rubizhPublicIp('8.8.8.8'),rubizhRedirectUrl('https://example.com/a/photo','../b.webp?size=2')]);`));
 assert.ok(Object.values(value[0]).every(x=>x===false));assert.equal(value[1],7);assert.equal(value[2],true);assert.equal(value[3],'https://example.com/b.webp?size=2');
});
test('Rate quota counts, expires, isolates identities and has a fixed number of disk shards',()=>{
 const d=mkdtempSync(path.join(tmpdir(),'rubizh-rate-'));
 try{const value=JSON.parse(run(`require '${root}/shop/runtime.php';$GLOBALS['rubizh_runtime_dir']='${d}';$out=[];for($i=0;$i<4;$i++)$out[]=rubizhRateAllow('search','client',3,60,100);$out[]=rubizhRateAllow('search','client',3,60,161);$out[]=rubizhRateAllow('search','other',3,60,100);for($i=0;$i<5000;$i++)rubizhRateAllow('search','random-'.$i,3,60,100);echo json_encode($out);`));assert.deepEqual(value,[true,true,true,false,true,true]);assert.ok(readdirSync(d).length<=4096);}finally{rmSync(d,{recursive:true,force:true});}
});
test('Independent processes cannot exceed the work pool; completion releases all slots',async()=>{
 const d=mkdtempSync(path.join(tmpdir(),'rubizh-work-'));
 const code=`require '${root}/shop/runtime.php';$GLOBALS['rubizh_runtime_dir']='${d}';try{$h=rubizhWorkAcquire('fixture',4);echo 'accepted';flush();usleep(600000);rubizhWorkRelease($h);}catch(RubizhHttpException $e){echo $e->status;}`;
 try{const out=await Promise.all(Array.from({length:20},()=>asyncRun(code)));assert.equal(out.filter(x=>x==='accepted').length,4);assert.ok(out.filter(x=>x!=='accepted').every(x=>x==='503'));assert.equal(run(code),'accepted');}finally{rmSync(d,{recursive:true,force:true});}
});
test('Same-version cache growth is pruned and nested stripe collisions do not deadlock',()=>{
 const d=mkdtempSync(path.join(tmpdir(),'rubizh-bounded-cache-'));
 const prefix=`function cfg($k){return $k==='cache_dir'?'${d}':false;}function db(){return new class{function query($s){return new class{function fetchColumn(){return 'fixture';}};}};}require '${root}/api/perf.php';$GLOBALS['rubizh_runtime_dir']='${d}/runtime';`;
 try{
  const version=run(prefix+`echo shopCatalogVersion();`);
  for(let i=0;i<540;i++){const f=path.join(d,`q${i}-${version}.json`);writeFileSync(f,'{}');utimesSync(f,new Date(Date.now()-i*1000),new Date(Date.now()-i*1000));}
  run(prefix+`shopCacheGc(shopCatalogVersion());`);assert.equal(readdirSync(d).filter(x=>x.endsWith('.json')).length,512);
  const bins=new Map();let pair;for(let i=0;!pair;i++){const key='nested'+i,stripe=createHash('sha256').update(key+'|').digest('hex').slice(0,2);if(bins.has(stripe))pair=[bins.get(stripe),key];else bins.set(stripe,key);}
  assert.equal(run(prefix+`echo shopCached('${pair[0]}',fn()=>shopCached('${pair[1]}',fn()=>42));`),'42');
 }finally{rmSync(d,{recursive:true,force:true});}
});
test('Every numbered banner has an existing image, exact category ID and the corrected 7/8 assignment',()=>{
 const list=JSON.parse(readFileSync(path.join(root,'docs/category-banners-numbered-20261008.json')));assert.equal(list.length,96);assert.equal(new Set(list.map(x=>x.category_id)).size,96);
 assert.equal(list.find(x=>x.category_id==='clothing_shorts').source_number,8);assert.equal(list.find(x=>x.category_id==='clothing_headwear').source_number,7);
 assert.equal(list.find(x=>x.number===29).category_id,'helmets_mounts');assert.equal(list.find(x=>x.number===75).category_id,'electronics_mounts');
 for(const b of list){const data=readFileSync(root+b.asset);assert.equal(data.length,b.bytes);assert.equal(data.subarray(0,4).toString(),'RIFF');assert.equal(data.subarray(8,12).toString(),'WEBP');assert.ok(data.length<40000);}
});
test('External database configuration requires certificate verification and rejects DSN injection',()=>{
 const d=mkdtempSync(path.join(tmpdir(),'rubizh-db-config-'));
 try{
  writeFileSync(path.join(d,'ca.crt'),'test CA: configuration test only');
  writeFileSync(path.join(d,'bad.php'),"<?php return ['db_host'=>'remote.example','db_tls_required'=>false];");
  writeFileSync(path.join(d,'good.php'),"<?php return ['db_host'=>'remote.example','db_port'=>25060,'db_tls_required'=>true,'db_tls_ca'=>'"+d+"/ca.crt'];");
  const value=JSON.parse(run(`require '${root}/api/database.php';$base=['db_host'=>'localhost','db_name'=>'rubizh','db_user'=>'fixture','db_pass'=>'secret'];$n=0;foreach([['db_host'=>'host;dbname=other'],['db_name'=>'rubizh;port=123'],['db_port'=>'3306;'],['db_port'=>65536],['db_tls_required'=>true,'db_tls_ca'=>'/missing-ca']] as $bad){try{rubizhDatabaseParameters(array_replace($base,$bad));}catch(RuntimeException $e){$n++;}}try{rubizhDatabaseSettings($base,'${d}/bad.php');}catch(RuntimeException $e){$n++;}$c=rubizhDatabaseSettings($base,'${d}/good.php');[$dsn,$options]=rubizhDatabaseParameters($c);echo json_encode([$n,$dsn,$options[PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT],$options[PDO::MYSQL_ATTR_SSL_CA],rubizhDatabaseSettings($base,'${d}/absent.php')===$base]);`));
  assert.deepEqual(value,[6,'mysql:host=remote.example;port=25060;dbname=rubizh;charset=utf8mb4',true,d+'/ca.crt',true]);
 }finally{rmSync(d,{recursive:true,force:true});}
});
test('A missing, failed or stale cache worker heartbeat fails readiness without revealing customer information',()=>{
 const d=mkdtempSync(path.join(tmpdir(),'rubizh-heartbeat-'));
 try{
  const prefix=`require '${root}/shop/runtime.php';$GLOBALS['rubizh_runtime_dir']='${d}';`;
  assert.equal(run(prefix+`echo json_encode(rubizhCacheHealthy());`),'false');
  assert.equal(run(prefix+`rubizhCacheHeartbeat(true);echo json_encode(rubizhCacheHealthy());`),'true');
  const data=JSON.parse(readFileSync(path.join(d,'cache-heartbeat.json')));assert.deepEqual(Object.keys(data),['at','healthy']);
  assert.equal(run(prefix+`echo json_encode(rubizhCacheHealthy(time()+181));`),'false');
  assert.equal(run(prefix+`rubizhCacheHeartbeat(false);echo json_encode(rubizhCacheHealthy());`),'false');
 }finally{rmSync(d,{recursive:true,force:true});}
});
