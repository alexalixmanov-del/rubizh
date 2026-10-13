import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';
import {startCrm} from './helpers/crm-fixture.mjs';
import {php} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET,csrf='c'.repeat(64),A='a'.repeat(32);
function session(s){const sid='r9origin'+crypto.randomUUID().replaceAll('-','');writeFileSync(s.dir+'/sess_'+sid,`csrf|s:64:"${csrf}";customer_id|s:32:"${A}";login_time|i:${Math.floor(Date.now()/1000)};login_method|s:5:"email";`);return {sid,cookie:'rubizh_customer='+sid};}
function router(s){const file=s.site+'/router.php';writeFileSync(file,readFileSync(file,'utf8').replace('<?php',"<?php if(parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH)==='/auth/'){require __DIR__.'/auth/index.php';return;}"));}
test('R9 customer authentication rejects foreign Origin before profile mutation and logout, even with valid CSRF',{skip,timeout:120000},async()=>{
 const s=await startCrm();try{router(s);s.sql(`INSERT INTO rubizh_accounts(id,email,first_name,last_name,created_at,updated_at) VALUES('${A}','origin@fixture.test','До','Тест',UTC_TIMESTAMP(),UTC_TIMESTAMP())`);
 for(const action of ['save_profile','logout']){const ctx=session(s),before=s.sql(`SELECT * FROM rubizh_accounts WHERE id='${A}'`),r=await fetch(s.base+'/auth/',{method:'POST',redirect:'manual',headers:{Cookie:ctx.cookie,Origin:'https://attacker.invalid','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf,action,first_name:'Після',last_name:'Тест'})});
 assert.equal(r.status,200);assert.match(await r.text(),/Оновіть сторінку/);assert.deepEqual(s.sql(`SELECT * FROM rubizh_accounts WHERE id='${A}'`),before);
 assert.equal(JSON.parse(php(`session_save_path('${s.dir}');session_id('${ctx.sid}');session_start();echo json_encode($_SESSION['customer_id']??null);`).stdout),A);
 }
 const ctx=session(s),r=await fetch(s.base+'/auth/',{method:'POST',redirect:'manual',headers:{Cookie:ctx.cookie,Origin:'https://rubizh.shop','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf,action:'save_profile',first_name:'Дозволено',last_name:'Тест'})});assert.equal(r.status,303);assert.equal(s.sql(`SELECT first_name FROM rubizh_accounts WHERE id='${A}'`)[0].first_name,'Дозволено');
 }finally{s.stop();}
});
test('R9 Google authorization rejects foreign Origin without creating OAuth session state',{skip,timeout:120000},async()=>{
 const s=await startCrm();try{const routing=s.site+'/router.php';writeFileSync(routing,readFileSync(routing,'utf8').replace('<?php',"<?php if(parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH)==='/auth/google.php')$_SERVER['HTTP_HOST']='rubizh.shop';"));const file=s.site+'/auth/config.php';writeFileSync(file,"<?php return ['sms_enabled'=>true,'turbosms_token'=>'fixture-token','turbosms_sender'=>'FIXTURE','google_enabled'=>true,'google_client_id'=>'123456-fixture.apps.googleusercontent.com','google_client_secret'=>'synthetic','auth_secret'=>'r9-origin-fixture-secret-at-least-forty-characters'];");s.sql(`INSERT INTO rubizh_accounts(id,email,first_name,last_name,created_at,updated_at) VALUES('${A}','google-origin@fixture.test','До','Тест',UTC_TIMESTAMP(),UTC_TIMESTAMP())`);const ctx=session(s);
 const r=await fetch(s.base+'/auth/google.php',{method:'POST',redirect:'manual',headers:{Cookie:ctx.cookie,Host:'rubizh.shop',Origin:'https://attacker.invalid','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf,mode:'link'})});assert.equal(r.status,303);assert.ok(r.headers.get('location').startsWith('/auth/'));
 const state=JSON.parse(php(`session_save_path('${s.dir}');session_id('${ctx.sid}');session_start();echo json_encode($_SESSION);`).stdout);assert.equal(state.google_oauth,undefined);assert.match(state.auth_error,/Оновіть сторінку/);
 const allowed=await fetch(s.base+'/auth/google.php',{method:'POST',redirect:'manual',headers:{Cookie:ctx.cookie,Origin:'https://rubizh.shop','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf,mode:'link'})});assert.equal(allowed.status,303);assert.equal(new URL(allowed.headers.get('location')).origin,'https://accounts.google.com');
 }finally{s.stop();}
});
