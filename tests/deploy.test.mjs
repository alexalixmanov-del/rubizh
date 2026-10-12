import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,symlinkSync,existsSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync,spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {startSite,runtime} from './helpers/site-fixture.mjs';
const root=path.resolve(import.meta.dirname,'..');
const installer=path.join(root,'dev/install-pim-v3.sh');
const installerCheck=(name,args)=>spawnSync('bash',['-c','set -euo pipefail; source "$1"; shift; "$@"','release-check',installer,name,...args],{encoding:'utf8',env:process.env,timeout:10000});
test('Release preflight rejects the shipped older archive and changed hardening bytes before deployment',()=>{
 const php=process.env.PHP_PATH||runtime+'/bin/php8.4';
 const old=installerCheck('rubizh_verify_release',[path.join(root,'downloads/Rubizh-pim-v3-20261009.zip'),php]);
 assert.notEqual(old.status,0);assert.match(old.stderr,/Reviewed release artifact mismatch/);
 const dir=mkdtempSync(path.join(tmpdir(),'rubizh-review-artifact-')),release=path.join(dir,'rubizh'),zip=path.join(dir,'release.zip');
 const files=['shop/mono-lib.php','shop/mono-webhook.php','shop/financial-permissions.php','shop/order-validation.php'];const manifest={commit:'51c83d808228a26328081b02211b4e3605353755',files:{}};
 mkdirSync(path.join(release,'shop'),{recursive:true});
 try{
  for(const f of files){copyFileSync(path.join(root,f),path.join(release,f));manifest.files[f]=createHash('sha256').update(readFileSync(path.join(release,f))).digest('hex');}
  writeFileSync(path.join(release,'RELEASE-MANIFEST.json'),JSON.stringify(manifest));
  assert.equal(spawnSync('zip',['-rq',zip,'rubizh'],{cwd:dir}).status,0);
  const good=installerCheck('rubizh_verify_release',[zip,php]);assert.equal(good.status,0,good.stderr);
  writeFileSync(path.join(release,files[0]),'<?php // unreviewed source');assert.equal(spawnSync('zip',['-rq',zip,'rubizh'],{cwd:dir}).status,0);
  const changed=installerCheck('rubizh_verify_release',[zip,php]);assert.notEqual(changed.status,0);assert.match(changed.stderr,/Reviewed release artifact mismatch/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('Installer prerequisite is read-only and rejects an incomplete P0 schema before source handoff',{skip:!process.env.RUBIZH_TEST_MYSQL_SOCKET},async()=>{
 const s=await startSite({enableV3:false});
 try{
  const quote=v=>"'"+v.replaceAll("'","'\\''")+"'";const fixturePhp=path.join(s.dir,'php-preflight');
  writeFileSync(fixturePhp,'#!/bin/sh\nexec '+quote(process.env.PHP_PATH||runtime+'/bin/php8.4')+' -d '+quote('pdo_mysql.default_socket='+process.env.RUBIZH_TEST_MYSQL_SOCKET)+' "$@"\n',{mode:0o755});
  const ready=installerCheck('rubizh_p0_ready',[s.site,fixturePhp]);assert.equal(ready.status,0,ready.stderr);
  const before=s.sql('SELECT * FROM meta ORDER BY k');s.sql('ALTER TABLE rubizh_stock_reservations DROP COLUMN status');
  const missing=installerCheck('rubizh_p0_ready',[s.site,fixturePhp]);assert.notEqual(missing.status,0);assert.match(missing.stderr,/P0 prerequisite/);
  const oldSource=readFileSync(path.join(s.site,'shop/reservations.php'));
  const blocked=spawnSync('bash',[installer,s.site,path.join(s.dir,'not-a-production-backup'),'0'.repeat(64)],{env:{...process.env,RUBIZH_PHP_BIN:fixturePhp},encoding:'utf8',timeout:10000});
  assert.notEqual(blocked.status,0);assert.match(blocked.stderr,/P0 prerequisite/);
  assert.deepEqual(readFileSync(path.join(s.site,'shop/reservations.php')),oldSource);
  assert.equal(existsSync(path.join(s.dir,'rubizh-private-backups')),false);
  assert.deepEqual(s.sql('SELECT * FROM meta ORDER BY k'),before);
  assert.equal(s.sql("SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='rubizh_stock_reservations' AND COLUMN_NAME='status'")[0].n,0);
  const source=readFileSync(installer,'utf8');const main=source.slice(source.indexOf('RUBIZH_ROOT=${1:'));
  assert.ok(main.indexOf('rubizh_p0_ready')<main.indexOf('curl -fsSL'));
  assert.ok(main.indexOf('rubizh_verify_release')<main.indexOf('RUBIZH_INVENTORY='));
 }finally{s.stop();}
});
test('Installer smoke rejects unavailable HTTP routes and accepts successful routes',async()=>{
 let status=503;const server=createServer((req,res)=>{res.writeHead(status);res.end('synthetic local smoke');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const run=()=>new Promise(resolve=>{const p=spawn('bash',['-c','set -euo pipefail; source "$1"; rubizh_smoke "$2"','release-smoke',installer,base],{stdio:['ignore','pipe','pipe']});let stdout='',stderr='';p.stdout.on('data',x=>stdout+=x);p.stderr.on('data',x=>stderr+=x);p.on('close',exit=>resolve({exit,stdout,stderr}));});
 try{const bad=await run();assert.notEqual(bad.exit,0);assert.match(bad.stderr,/Smoke check failed.*503/);status=200;const good=await run();assert.equal(good.exit,0,good.stderr);assert.equal((good.stdout.match(/200/g)||[]).length,3);}finally{await new Promise(resolve=>server.close(resolve));}
});
test('Deployment preserves private configs, media and legacy provider keys; invalid checksum changes nothing',{skip:process.platform!=='linux'?'Deployment helper targets Linux/GNU realpath, find and sha256sum; exercise on Linux CI':false},()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'rubizh-deploy-'));const site=path.join(dir,'www'),bin=path.join(dir,'bin'),release=path.join(dir,'release/rubizh');
 for(const p of ['api','auth','media'])mkdirSync(path.join(site,p),{recursive:true});mkdirSync(bin);mkdirSync(path.join(release,'api'),{recursive:true});
 const api="<?php return ['db_pass'=>'fixture-db','mono_token'=>''];";
 writeFileSync(path.join(site,'api/config.php'),api);writeFileSync(path.join(site,'api/mono-private.php'),"<?php return ['mono_token'=>'fixture-legacy-mono'];");writeFileSync(path.join(site,'auth/config.php'),'private-fixture-auth');writeFileSync(path.join(site,'media/photo.txt'),'existing-media');writeFileSync(path.join(site,'index.html'),'old-index');
 writeFileSync(path.join(release,'index.html'),'new-index');writeFileSync(path.join(release,'storefront.php'),'<?php echo "public shell";');writeFileSync(path.join(release,'api/mono-private.php'),'<?php return [];');
 const php=process.env.PHP_PATH||(existsSync((process.env.RUBIZH_PHP_RUNTIME||'/workspace/php-runtime/root/usr')+'/bin/php8.4')?(process.env.RUBIZH_PHP_RUNTIME||'/workspace/php-runtime/root/usr')+'/bin/php8.4':'php');const executable=path.isAbsolute(php)?php:spawnSync('which',[php],{encoding:'utf8'}).stdout.trim();symlinkSync(executable,path.join(bin,'php'));
 const archive=path.join(dir,'release.zip');assert.equal(spawnSync('zip',['-rq',archive,'rubizh'],{cwd:path.join(dir,'release')}).status,0);const sum=createHash('sha256').update(readFileSync(archive)).digest('hex');
 const env={...process.env,PATH:bin+':'+process.env.PATH,LD_LIBRARY_PATH:(process.env.RUBIZH_PHP_RUNTIME||'/workspace/php-runtime/root/usr')+'/lib/x86_64-linux-gnu'};
 const run=sha=>spawnSync('bash',[path.join(root,'dev/deploy-update.sh'),site,archive,sha],{env,encoding:'utf8',timeout:10000});
 try{
  assert.notEqual(run('0'.repeat(64)).status,0);assert.equal(readFileSync(path.join(site,'index.html'),'utf8'),'old-index');assert.equal(readFileSync(path.join(site,'api/config.php'),'utf8'),api);
  const result=run(sum);assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.includes('fixture-legacy-mono'),false);assert.equal(readFileSync(path.join(site,'index.html'),'utf8'),'new-index');assert.match(readFileSync(path.join(site,'api/config.php'),'utf8'),/fixture-legacy-mono/);assert.equal(readFileSync(path.join(site,'auth/config.php'),'utf8'),'private-fixture-auth');assert.equal(readFileSync(path.join(site,'media/photo.txt'),'utf8'),'existing-media');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('Small patch without api files still backs up private config and installs successfully',{skip:process.platform!=='linux'?'Deployment helper targets Linux/GNU realpath, find and sha256sum; exercise on Linux CI':false},()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'rubizh-small-patch-'));const site=path.join(dir,'www'),bin=path.join(dir,'bin'),release=path.join(dir,'release/rubizh');
 for(const p of ['api','shop'])mkdirSync(path.join(site,p),{recursive:true});mkdirSync(bin);mkdirSync(path.join(release,'shop'),{recursive:true});
 writeFileSync(path.join(site,'api/config.php'),"<?php return ['db_pass'=>'fixture-db','nova_poshta_api_key'=>'fixture-np'];");writeFileSync(path.join(site,'index.html'),'old-index');writeFileSync(path.join(site,'shop/np-lib.php'),'<?php // old library');
 writeFileSync(path.join(release,'index.html'),'new-index');writeFileSync(path.join(release,'storefront.php'),'<?php // public shell');writeFileSync(path.join(release,'shop/np-lib.php'),'<?php // new library');
 const php=process.env.PHP_PATH||(existsSync((process.env.RUBIZH_PHP_RUNTIME||'/workspace/php-runtime/root/usr')+'/bin/php8.4')?(process.env.RUBIZH_PHP_RUNTIME||'/workspace/php-runtime/root/usr')+'/bin/php8.4':'php');const executable=path.isAbsolute(php)?php:spawnSync('which',[php],{encoding:'utf8'}).stdout.trim();symlinkSync(executable,path.join(bin,'php'));
 const archive=path.join(dir,'release.zip');assert.equal(spawnSync('zip',['-rq',archive,'rubizh'],{cwd:path.join(dir,'release')}).status,0);const sum=createHash('sha256').update(readFileSync(archive)).digest('hex');
 try{
  const result=spawnSync('bash',[path.join(root,'dev/deploy-update.sh'),site,archive,sum],{env:{...process.env,PATH:bin+':'+process.env.PATH,LD_LIBRARY_PATH:(process.env.RUBIZH_PHP_RUNTIME||'/workspace/php-runtime/root/usr')+'/lib/x86_64-linux-gnu'},encoding:'utf8',timeout:10000});
  assert.equal(result.status,0,result.stderr);assert.equal(readFileSync(path.join(site,'shop/np-lib.php'),'utf8'),'<?php // new library');assert.match(readFileSync(path.join(site,'api/config.php'),'utf8'),/fixture-db/);assert.match(readFileSync(path.join(site,'api/config.php'),'utf8'),/fixture-np/);
  const backup=result.stdout.match(/Private rollback backup: (.+)/)[1];assert.ok(existsSync(path.join(backup,'api/config.php')));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
