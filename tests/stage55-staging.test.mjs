// Stage 5.5 (owner D-80): the closed mode on rubizh.shop before opening day. environment=staging + staging_gate: every
// page and API needs HTTP Basic Auth, noindex everywhere, no sitemap, bank/Nova Poshta/SMS stubs, no e-mail. environment
// =staging on rubizh.shop without a gate answers 503 and relaxes nothing; any other environment never relaxes anything,
// even with the stub flags set by mistake.
import {test} from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {writeFileSync} from 'node:fs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const USER='rubizh-test',PASSWORD='stage55-closed-mode-password';
function request(base,path,{host='rubizh.shop',auth=null,bearer=null}={}){
 const u=new URL(base);const headers={Host:host};if(auth)headers.Authorization='Basic '+Buffer.from(auth.join(':')).toString('base64');if(bearer)headers.Authorization='Bearer '+bearer;
 return new Promise((resolve,reject)=>{const r=http.request({host:u.hostname,port:u.port,path,headers},res=>{let b='';res.on('data',d=>b+=d);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:b}));});r.on('error',reject);r.end();});
}
const router=`<?php $p=(string)strtok($_SERVER['REQUEST_URI'],'?');if(str_starts_with($p,'/api/')){require __DIR__.'/api/index.php';return;}if($p==='/sitemap.xml'){require __DIR__.'/sitemap.php';return;}if($p==='/'||preg_match('~^/(?:product|catalog|categories|kit)(?:/.*)?$~',$p)){require __DIR__.'/storefront.php';return;}return false;`;
const relaxed=(site,php,host)=>php(`$_SERVER['HTTP_HOST']=${JSON.stringify(host)};require '${site.site}/api/lib.php';require_once '${site.site}/shop/mono-lib.php';require_once '${site.site}/shop/np-lib.php';echo json_encode([rubizhStagingRelaxed(),monoMockEnabled(),npMockEnabled()]);`).stdout.trim();

test('D-80: closed mode — password everywhere, noindex, no sitemap, stubs behind the gate; production never relaxes',{skip,timeout:240000},async()=>{
 const {startSite,php,PIM_KEY}=await import('./helpers/site-fixture.mjs');
 const hash=php(`echo password_hash(${JSON.stringify(PASSWORD)},PASSWORD_DEFAULT);`).stdout.trim();
 const site=await startSite({enableV3:false,extraConfig:`,'environment'=>'staging','mono_mock'=>true,'np_mock'=>true,'staging_gate'=>['user'=>'${USER}','password_hash'=>'${hash}']`});
 try{
  writeFileSync(site.site+'/router.php',router);
  for(const p of ['/','/catalog','/auth/','/api/staff/session','/shop/catalog.php?action=categories','/sitemap.xml']){
   const r=await request(site.base,p);assert.equal(r.status,401,p+': no password, no page');assert.match(r.headers['www-authenticate']||'',/^Basic realm="RUBIZH"/,p);
   assert.equal(r.headers['x-robots-tag'],'noindex, nofollow',p);assert.doesNotMatch(r.body,/<html|РУБІЖ —/,p+': nothing of the site');
  }
  assert.equal((await request(site.base,'/',{auth:[USER,'wrong-password']})).status,401,'wrong password');
  assert.equal((await request(site.base,'/',{auth:['someone',PASSWORD]})).status,401,'wrong user');
  const home=await request(site.base,'/',{auth:[USER,PASSWORD]});assert.equal(home.status,200);assert.equal(home.headers['x-robots-tag'],'noindex, nofollow');
  assert.equal((await request(site.base,'/sitemap.xml',{auth:[USER,PASSWORD]})).status,404,'no sitemap in staging');
  // PIM uses its own key; the API checks it (a wrong key is the API's 401 JSON, not the gate).
  const pim=await request(site.base,'/api/pim/status',{bearer:PIM_KEY});assert.equal(pim.status,200,'PIM with its key');
  const bad=await request(site.base,'/api/pim/status',{bearer:'wrong-key-of-enough-length-000000'});assert.notEqual(bad.headers['www-authenticate']?.startsWith('Basic'),true);
  assert.equal((await request(site.base,'/api/staff/session',{bearer:PIM_KEY})).status,401,'the CRM API is behind the gate even with a bearer');
  assert.equal(relaxed(site,php,'rubizh.shop'),'[true,true,true]','behind the gate the stubs work on rubizh.shop');
 }finally{site.stop();}
 // environment=staging on rubizh.shop without a gate: a misconfiguration — 503, nothing relaxed.
 const open=await startSite({enableV3:false,extraConfig:",'environment'=>'staging','mono_mock'=>true,'np_mock'=>true"});
 try{
  writeFileSync(open.site+'/router.php',router);
  const r=await request(open.base,'/');assert.equal(r.status,503);assert.equal(r.headers['x-robots-tag'],'noindex, nofollow');assert.doesNotMatch(r.body,/<html/);
  assert.equal(relaxed(open,php,'rubizh.shop'),'[false,false,false]','no stubs on rubizh.shop without the gate');
  assert.equal((await request(open.base,'/',{host:'127.0.0.1'})).status,200,'a local stand keeps the earlier staging behaviour');
 }finally{open.stop();}
 // Production with the stub flags (and even a gate) set by mistake: nothing is relaxed, no password asked, indexable.
 const prod=await startSite({enableV3:false,extraConfig:`,'environment'=>'production','mono_mock'=>true,'np_mock'=>true,'staging_gate'=>['user'=>'${USER}','password_hash'=>'${hash}']`});
 try{
  writeFileSync(prod.site+'/router.php',router);
  const r=await request(prod.base,'/');assert.equal(r.status,200);assert.equal(r.headers['x-robots-tag'],undefined);
  for(const host of ['rubizh.shop','127.0.0.1','staging.example'])assert.equal(relaxed(prod,php,host),'[false,false,false]','production, host '+host);
 }finally{prod.stop();}
});

test('D-80: in the closed mode the SMS code and the login link are shown on screen, no provider and no e-mail is used',{skip,timeout:120000},async()=>{
 const {startSite,php}=await import('./helpers/site-fixture.mjs');
 const hash=php(`echo password_hash(${JSON.stringify(PASSWORD)},PASSWORD_DEFAULT);`).stdout.trim();
 const site=await startSite({enableV3:false,extraConfig:`,'environment'=>'staging','staging_gate'=>['user'=>'${USER}','password_hash'=>'${hash}']`});
 try{
  writeFileSync(site.site+'/auth/config.php',"<?php return ['sms_enabled'=>true,'google_enabled'=>false,'noreply_password'=>'','turbosms_token'=>'','turbosms_sender'=>'','auth_secret'=>'stage55-fixture-secret-at-least-forty-characters'];");
  // No provider token and no SMTP password: a real send would fail; in the closed mode nothing is sent.
  const out=php(`$_SERVER['HTTP_HOST']='rubizh.shop';define('RUBIZH_AUTH_NO_SESSION',true);require '${site.site}/auth/bootstrap.php';require_once '${site.site}/auth/identities.php';require_once '${site.site}/auth/phone.php';require_once '${site.site}/auth/mailer.php';
   $_SESSION=[];sendPhoneCode('+380501112233','123456','seq-1');rubizhSendEmail('owner@example.com','',['subject'=>'x','plain'=>'y','html'=>'<p>y</p>']);
   echo json_encode([smsEnabled(),$_SESSION['staging_sms_code']??null]);`,{allowFail:true});
  assert.equal(out.status,0,out.stdout+out.stderr);assert.equal(out.stdout.trim().split('\n').pop(),'[true,"123456"]');
 }finally{site.stop();}
});
