import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,symlinkSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
test('Deployment preserves private configs, media and legacy provider keys; invalid checksum changes nothing',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'rubizh-deploy-'));const site=path.join(dir,'www'),bin=path.join(dir,'bin'),release=path.join(dir,'release/rubizh');
 for(const p of ['api','auth','media'])mkdirSync(path.join(site,p),{recursive:true});mkdirSync(bin);mkdirSync(path.join(release,'api'),{recursive:true});
 const api="<?php return ['db_pass'=>'fixture-db','mono_token'=>''];";
 writeFileSync(path.join(site,'api/config.php'),api);writeFileSync(path.join(site,'api/mono-private.php'),"<?php return ['mono_token'=>'fixture-legacy-mono'];");writeFileSync(path.join(site,'auth/config.php'),'private-fixture-auth');writeFileSync(path.join(site,'media/photo.txt'),'existing-media');writeFileSync(path.join(site,'index.html'),'old-index');
 writeFileSync(path.join(release,'index.html'),'new-index');writeFileSync(path.join(release,'storefront.php'),'<?php echo "public shell";');writeFileSync(path.join(release,'api/mono-private.php'),'<?php return [];');
 const php=process.env.PHP_PATH||(existsSync('/workspace/php-runtime/root/usr/bin/php8.4')?'/workspace/php-runtime/root/usr/bin/php8.4':'php');const executable=path.isAbsolute(php)?php:spawnSync('which',[php],{encoding:'utf8'}).stdout.trim();symlinkSync(executable,path.join(bin,'php'));
 const archive=path.join(dir,'release.zip');assert.equal(spawnSync('zip',['-rq',archive,'rubizh'],{cwd:path.join(dir,'release')}).status,0);const sum=createHash('sha256').update(readFileSync(archive)).digest('hex');
 const env={...process.env,PATH:bin+':'+process.env.PATH,LD_LIBRARY_PATH:'/workspace/php-runtime/root/usr/lib/x86_64-linux-gnu'};
 const run=sha=>spawnSync('bash',[path.join(root,'dev/deploy-update.sh'),site,archive,sha],{env,encoding:'utf8',timeout:10000});
 try{
  assert.notEqual(run('0'.repeat(64)).status,0);assert.equal(readFileSync(path.join(site,'index.html'),'utf8'),'old-index');assert.equal(readFileSync(path.join(site,'api/config.php'),'utf8'),api);
  const result=run(sum);assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.includes('fixture-legacy-mono'),false);assert.equal(readFileSync(path.join(site,'index.html'),'utf8'),'new-index');assert.match(readFileSync(path.join(site,'api/config.php'),'utf8'),/fixture-legacy-mono/);assert.equal(readFileSync(path.join(site,'auth/config.php'),'utf8'),'private-fixture-auth');assert.equal(readFileSync(path.join(site,'media/photo.txt'),'utf8'),'existing-media');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('Small patch without api files still backs up private config and installs successfully',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'rubizh-small-patch-'));const site=path.join(dir,'www'),bin=path.join(dir,'bin'),release=path.join(dir,'release/rubizh');
 for(const p of ['api','shop'])mkdirSync(path.join(site,p),{recursive:true});mkdirSync(bin);mkdirSync(path.join(release,'shop'),{recursive:true});
 writeFileSync(path.join(site,'api/config.php'),"<?php return ['db_pass'=>'fixture-db','nova_poshta_api_key'=>'fixture-np'];");writeFileSync(path.join(site,'index.html'),'old-index');writeFileSync(path.join(site,'shop/np-lib.php'),'<?php // old library');
 writeFileSync(path.join(release,'index.html'),'new-index');writeFileSync(path.join(release,'storefront.php'),'<?php // public shell');writeFileSync(path.join(release,'shop/np-lib.php'),'<?php // new library');
 const php=process.env.PHP_PATH||(existsSync('/workspace/php-runtime/root/usr/bin/php8.4')?'/workspace/php-runtime/root/usr/bin/php8.4':'php');const executable=path.isAbsolute(php)?php:spawnSync('which',[php],{encoding:'utf8'}).stdout.trim();symlinkSync(executable,path.join(bin,'php'));
 const archive=path.join(dir,'release.zip');assert.equal(spawnSync('zip',['-rq',archive,'rubizh'],{cwd:path.join(dir,'release')}).status,0);const sum=createHash('sha256').update(readFileSync(archive)).digest('hex');
 try{
  const result=spawnSync('bash',[path.join(root,'dev/deploy-update.sh'),site,archive,sum],{env:{...process.env,PATH:bin+':'+process.env.PATH,LD_LIBRARY_PATH:'/workspace/php-runtime/root/usr/lib/x86_64-linux-gnu'},encoding:'utf8',timeout:10000});
  assert.equal(result.status,0,result.stderr);assert.equal(readFileSync(path.join(site,'shop/np-lib.php'),'utf8'),'<?php // new library');assert.match(readFileSync(path.join(site,'api/config.php'),'utf8'),/fixture-db/);assert.match(readFileSync(path.join(site,'api/config.php'),'utf8'),/fixture-np/);
  const backup=result.stdout.match(/Private rollback backup: (.+)/)[1];assert.ok(existsSync(path.join(backup,'api/config.php')));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
