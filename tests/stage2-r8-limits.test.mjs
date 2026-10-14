import {test} from 'node:test';
import assert from 'node:assert/strict';
import {php,root} from './helpers/site-fixture.mjs';
const run=code=>JSON.parse(php(`require '${root}/shop/runtime.php';${code}`).stdout);
test('R8: forwarding is accepted only from explicitly trusted proxies and IPv6 uses /64',()=>{
 const r=run(`$_SERVER=['REMOTE_ADDR'=>'192.0.2.9','HTTP_X_FORWARDED_FOR'=>'198.51.100.8'];$a=rubizhClientAddress([]);$b=rubizhClientAddress(['192.0.2.0/24']);$_SERVER['HTTP_X_FORWARDED_FOR']='spoofed';$c=rubizhClientAddress(['192.0.2.9']);echo json_encode([$a,$b,$c,rubizhNetworkIdentity('2001:db8:1:2::8'),rubizhNetworkIdentity('2001:db8:1:2::9')]);`);
 assert.deepEqual(r.slice(0,3),['192.0.2.9','198.51.100.8','192.0.2.9']);assert.equal(r[3],r[4]);
});
test('R8: full rate bucket evicts oldest identity and read-only checks do not consume quota',()=>{
 const r=run(`$GLOBALS['rubizh_runtime_dir']=sys_get_temp_dir().'/r8-'.bin2hex(random_bytes(8));$identity='owner';$hash=hash('sha256','login|'.$identity);$dir=rubizhRuntimeDir();$rows=[];for($i=0;$i<64;$i++)$rows['fixture-'.$i]=['until'=>1000+$i,'hits'=>1];file_put_contents($dir.'/rate-'.substr($hash,0,3).'.json',json_encode($rows));$a=rubizhRateAllow('login',$identity,1,60,100);$b=rubizhRateCheck('login',$identity,2,60,100);$c=rubizhRateCheck('login',$identity,2,60,100);$d=rubizhRateAllow('login',$identity,1,60,100);echo json_encode([$a,$b,$c,$d]);`);
 assert.deepEqual(r,[true,true,true,false]);
});
test('R8: device IDs are validated and retained as a separate identity',()=>{
 const r=run(`$_COOKIE['rz_dev']=str_repeat('a',64);$a=rubizhDeviceIdentity();$_COOKIE['rz_dev']='untrusted';$b=rubizhDeviceIdentity();echo json_encode([$a,$b,strlen($b)]);`);
 assert.equal(r[0],'a'.repeat(64));assert.match(r[1],/^[a-f0-9]{64}$/);assert.equal(r[2],64);
});
test('R8: proof is bound to its scope, consumes once, and cannot be reused',()=>{
 const r=run(`$_SESSION=[];$proof=rubizhProofIssue('checkout:a');for($n=0;;$n++){if(substr(hash('sha256',$proof['nonce'].':'.$n),0,4)==='0000')break;}$bad=rubizhProofValid('checkout:b',(string)$n);$good=rubizhProofValid('checkout:a',(string)$n);$replay=rubizhProofValid('checkout:a',(string)$n);echo json_encode([$bad,$good,$replay]);`);
 assert.deepEqual(r,[false,true,false]);
});
test('R8: verified-phone, device and session order limits count committed checks; rollback preserves quota',{skip:!process.env.RUBIZH_TEST_MYSQL_SOCKET,timeout:120000},async()=>{
 const {startSite}=await import('./helpers/site-fixture.mjs');const site=await startSite();
 try{
  const code=`define('RUBIZH_AUTH_NO_SESSION',true);require '${site.site}/auth/bootstrap.php';$db=shopStoreDatabase();$_SERVER['REMOTE_ADDR']='192.0.2.9';$keys=shopCheckoutRateKeys('+380671234567','scope-a','device-a');$db->beginTransaction();shopCheckoutLimit($db,$keys,true);$db->rollBack();$empty=(int)$db->query('SELECT COUNT(*) FROM rubizh_shop_limits')->fetchColumn();for($i=0;$i<5;$i++){$db->beginTransaction();shopCheckoutLimit($db,$keys,true);$db->commit();}try{shopCheckoutLimit($db,shopCheckoutRateKeys('+380671234567','scope-b','device-b'));$blocked=false;}catch(RubizhHttpException $e){$blocked=$e->status===429&&$e->retryAfter>0;}shopCheckoutLimit($db,shopCheckoutRateKeys('+380679999999','scope-c','device-c'));echo json_encode([$empty,$blocked]);`;
  assert.deepEqual(JSON.parse(php(code).stdout),[0,true]);
 }finally{site.stop();}
});
test('R8: staff failed attempts are isolated by account+network require bounded proof without consuming correct-password logins',{skip:!process.env.RUBIZH_TEST_MYSQL_SOCKET,timeout:120000},async()=>{
 const {startCrm,password}=await import('./helpers/crm-fixture.mjs');const site=await startCrm();
 try{
  const code=`define('RUBIZH_AUTH_NO_SESSION',true);require '${site.site}/auth/bootstrap.php';require_once '${site.site}/staff/auth.php';$db=shopStoreDatabase();$GLOBALS['rubizh_runtime_dir']='${site.dir}/staff-rate';$_SESSION=['staff_csrf'=>'fixture'];$_SERVER['REMOTE_ADDR']='192.0.2.41';$failed=[];for($i=0;$i<9;$i++){try{crmLogin($db,['csrf'=>'fixture','email'=>'owner@fixture.test','password'=>'wrong']);}catch(CrmError $e){$failed[]=$e->status;}}try{crmLogin($db,['csrf'=>'fixture','email'=>'owner@fixture.test','password'=>'${password}']);$challenge=false;}catch(CrmError $e){$challenge=$e->status===428;$proof=$e->details['challenge'];}if(!$challenge){echo json_encode([$failed,'OWNER',null,false]);exit;}for($n=0;;$n++){if(substr(hash('sha256',$proof['nonce'].':'.$n),0,4)==='0000')break;}$correct=crmLogin($db,['csrf'=>'fixture','email'=>'owner@fixture.test','password'=>'${password}','rate_proof'=>(string)$n]);try{crmLogin($db,['csrf'=>$_SESSION['staff_csrf'],'email'=>'owner@fixture.test','password'=>'${password}','rate_proof'=>(string)$n]);$replay=false;}catch(CrmError $e){$replay=$e->status===428;}$_SERVER['REMOTE_ADDR']='192.0.2.42';try{crmLogin($db,['csrf'=>$_SESSION['staff_csrf'],'email'=>'owner@fixture.test','password'=>'wrong']);}catch(CrmError $e){$other=$e->status;}echo json_encode([$failed,$correct['role'],$other,$challenge,$replay]);`;
  const r=JSON.parse(php(code).stdout);assert.deepEqual(r[0],[401,401,401,401,401,401,401,401,428]);assert.equal(r[1],'OWNER');assert.equal(r[2],401);assert.equal(r[3],true);assert.equal(r[4],true);
 }finally{site.stop();}
});
test('R8: account session soft ceiling issues a usable challenge; hard ceiling sends Retry-After',{skip:!process.env.RUBIZH_TEST_MYSQL_SOCKET,timeout:120000},async()=>{
 const {startSite}=await import('./helpers/site-fixture.mjs');const {createHash}=await import('node:crypto');const site=await startSite();
 try{
  const first=await site.get('/shop/customer.php');assert.equal(first.status,200);const Cookie=first.headers.get('set-cookie').split(';')[0];
  let result;for(let i=0;i<60;i++){result=await site.get('/shop/customer.php',{Cookie});if(result.status===428)break;assert.equal(result.status,200);}
  assert.equal(result.status,428);assert.match(result.data.error,/менеджера/);assert.equal(result.data.challenge.purpose,'account');
  const {nonce,bits}=result.data.challenge;let n=0;for(;;n++){const hash=createHash('sha256').update(nonce+':'+n).digest();let z=0;for(const byte of hash){if(byte===0){z+=8;continue;}z+=Math.clz32(byte)-24;break;}if(z>=bits)break;}
  const verified=await site.get('/shop/customer.php',{Cookie,'X-Rubizh-Rate-Proof':String(n)});assert.equal(verified.status,200,JSON.stringify(verified.data));
  for(let i=0;i<180;i++){result=await site.get('/shop/customer.php',{Cookie});if(result.status===429)break;assert.equal(result.status,200);}
  assert.equal(result.status,429);assert.ok(+result.headers.get('retry-after')>0);
 }finally{site.stop();}
});
test('R8: active storefront JavaScript sends GET proof header and refreshes production customer session',async()=>{
 const {readFileSync}=await import('node:fs');const {runInNewContext}=await import('node:vm');const {webcrypto}=await import('node:crypto');
 const source=readFileSync(root+'/assets/shop-client.2026101101.js','utf8');const field=name=>{const a=source.indexOf('        '+name+'=');assert.ok(a>=0);return source.slice(a,source.indexOf('\n        };',a)+11);};
 const requests=[];let challenged=false;const nonce='a'.repeat(32);
 const context={AbortController,setTimeout,clearTimeout,TextEncoder,window:{location:{hostname:'rubizh.shop'},crypto:webcrypto},crypto:webcrypto,fetch:async(url,options)=>{
  requests.push([url,options]);if(url==='/auth/session.php')return {ok:true,json:async()=>({ok:true,authed:true,email:'fixture@test.invalid'})};
  if(!challenged){challenged=true;return {ok:false,status:428,json:async()=>({ok:false,challenge:{nonce,bits:8,purpose:'account'}})};}
  assert.match(options.headers?.['X-Rubizh-Rate-Proof'],/^\d+$/);assert.equal(options.method,undefined);return {ok:true,status:200,json:async()=>({ok:true,ready:true})};
 }};
 runInNewContext(`class App{state={};setState(value){Object.assign(this.state,value);}${field('refreshCustomerSession')}${field('storeRequest')}}globalThis.app=new App();`,context);
 await context.app.refreshCustomerSession();assert.equal(context.app.state.authed,true);assert.equal(requests[0][0],'/auth/session.php');assert.deepEqual(await context.app.storeRequest('/shop/customer.php'),{ok:true,ready:true});assert.equal(requests.length,3);
});
test('R8: generic browser mutation budgets are separated across customers on one NAT',{skip:!process.env.RUBIZH_TEST_MYSQL_SOCKET,timeout:120000},async()=>{
 const {startSite}=await import('./helpers/site-fixture.mjs');const site=await startSite();
 try{
  const code=`define('RUBIZH_AUTH_NO_SESSION',true);require '${site.site}/auth/bootstrap.php';$db=shopStoreDatabase();$_SERVER['REMOTE_ADDR']='192.0.2.9';$_COOKIE['rz_dev']=str_repeat('a',64);$_SESSION['checkout_scope']='scope-a';shopLimit($db,'generic-regression',2,60);$_COOKIE['rz_dev']=str_repeat('b',64);$_SESSION['checkout_scope']='scope-b';shopLimit($db,'generic-regression',2,60);echo json_encode($db->query('SELECT COUNT(*) n FROM rubizh_shop_limits')->fetchColumn());`;
  assert.equal(JSON.parse(php(code).stdout),2);
 }finally{site.stop();}
});
test('R8: generic limit rejection returns Retry-After and leaves another NAT customer available',{skip:!process.env.RUBIZH_TEST_MYSQL_SOCKET,timeout:120000},async()=>{
 const {startSite}=await import('./helpers/site-fixture.mjs');const {writeFileSync}=await import('node:fs');const site=await startSite();
 try{
  writeFileSync(site.site+'/shop/rate-probe.php',"<?php require __DIR__.'/../auth/bootstrap.php';shopLimit(shopStoreDatabase(),'generic-probe',1,60);shopJson(['ok'=>true]);");
  const customer=await site.get('/shop/customer.php');const Cookie=customer.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
  assert.equal((await site.get('/shop/rate-probe.php',{Cookie})).status,200);
  const limited=await site.get('/shop/rate-probe.php',{Cookie});assert.equal(limited.status,429);assert.ok(+limited.headers.get('retry-after')>0);assert.match(limited.data.error,/менеджера/);
  const other=await site.get('/shop/customer.php');const otherCookie=other.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
  assert.equal((await site.get('/shop/rate-probe.php',{Cookie:otherCookie})).status,200);
 }finally{site.stop();}
});
test('R8: checkout price conflicts and successful idempotent repeats do not spend order quota',{skip:!process.env.RUBIZH_TEST_MYSQL_SOCKET,timeout:120000},async()=>{
 const {startCrm,line}=await import('./helpers/crm-fixture.mjs');const site=await startCrm();
 try{
  const session=await site.get('/shop/customer.php');const Cookie=session.headers.getSetCookie().map(s=>s.split(';')[0]).join('; '),csrf=session.data.csrf;
  const lines=[line()];const quote=await site.post('/shop/checkout-quote.php',{csrf,lines,payment:'card'},{Cookie});assert.equal(quote.status,200);
  const body={csrf,lines,payment:'card',request_id:'e'.repeat(32),expected_total:quote.data.quote.total,catalog_version:quote.data.quote.catalog_version,contact:{name:'Олена Петренко',recipient:'Олена Петренко',phone:'+380671234567',city:'Київ',address:'Відділення 1',delivery_type:'branch',np_delivery:{city_ref:site.ref(10),warehouse_ref:site.ref(20)}}};
  const before=site.sql('SELECT bucket,hits FROM rubizh_shop_limits ORDER BY bucket');
  const conflict=await site.post('/shop/order.php',{...body,expected_total:+body.expected_total+1},{Cookie});assert.equal(conflict.status,409,JSON.stringify(conflict.data));assert.equal(conflict.data.error_code,'PRICE_CHANGED');
  assert.deepEqual(site.sql('SELECT bucket,hits FROM rubizh_shop_limits ORDER BY bucket'),before);
  const saved=await site.post('/shop/order.php',body,{Cookie});assert.equal(saved.status,200,JSON.stringify(saved.data));const quotas=site.sql('SELECT bucket,hits FROM rubizh_shop_limits ORDER BY bucket');assert.equal(quotas.length,before.length+3);assert.ok(quotas.filter(q=>!before.some(b=>b.bucket===q.bucket)).every(q=>+q.hits===1));
  for(let i=0;i<11;i++){const repeat=await site.post('/shop/order.php',body,{Cookie});assert.equal(repeat.status,200);assert.equal(repeat.data.repeated,true);}
  assert.deepEqual(site.sql('SELECT bucket,hits FROM rubizh_shop_limits ORDER BY bucket'),quotas);
 }finally{site.stop();}
});
test('R8: SITE staff login adapter solves one server challenge, preserves CSRF and clears password after login',async()=>{
 const {readFileSync}=await import('node:fs');const {runInNewContext}=await import('node:vm');const {webcrypto}=await import('node:crypto');
 const source=readFileSync(root+'/auth/staff-login.js','utf8');let submit;const button={disabled:false},message={},ready={hidden:true},form={elements:{email:{value:'owner@fixture.test'},password:{value:'fixture-password'}},querySelector:()=>button,addEventListener:(name,handler)=>{assert.equal(name,'submit');submit=handler;}};
 const requests=[];const context={document:{getElementById:id=>({'staff-login':form,'staff-login-message':message,'staff-login-ready':ready})[id]},crypto:webcrypto,TextEncoder,Date,fetch:async(url,options)=>{
  requests.push([url,options]);if(url.endsWith('/session'))return {ok:true,json:async()=>({ok:true,meta:{csrf:'fixture-csrf'}})};
  const body=JSON.parse(options.body);assert.equal(body.csrf,'fixture-csrf');assert.equal(body.email,'owner@fixture.test');assert.equal(body.password,'fixture-password');
  if(requests.length===2)return {ok:false,status:428,json:async()=>({ok:false,error:{code:'CHECK_REQUIRED',details:{challenge:{nonce:'a'.repeat(32),bits:8,purpose:'staff-login'}}}})};
  assert.match(body.rate_proof,/^\d+$/);return {ok:true,status:200,json:async()=>({ok:true,data:{user:{role:'OWNER'}}})};
 }};
 runInNewContext(source,context);assert.equal(typeof submit,'function');await submit({preventDefault(){}});
 assert.equal(requests.length,3);assert.equal(form.elements.password.value,'');assert.equal(form.hidden,true);assert.equal(ready.hidden,true);assert.equal(button.disabled,false);assert.match(message.textContent,/Вхід підтверджено/);
});
test('R8: staff HTTP API exposes an accessible proof flow and audits only real failed verification',{skip:!process.env.RUBIZH_TEST_MYSQL_SOCKET,timeout:120000},async()=>{
 const {startCrm,password}=await import('./helpers/crm-fixture.mjs');const {createHash}=await import('node:crypto');const site=await startCrm();
 try{
  const page=await site.get('/auth/staff-login.php');assert.equal(page.status,200);assert.match(page.text,/staff-login.js/);assert.match(page.headers.get('cache-control'),/no-store/);assert.doesNotMatch(page.text,/href="\/crm\//);
  const initial=await site.get('/api/staff/auth/session');const Cookie=initial.headers.getSetCookie().map(s=>s.split(';')[0]).join('; '),csrf=initial.data.meta.csrf;
  for(let i=0;i<8;i++)assert.equal((await site.post('/api/staff/auth/login',{email:'owner@fixture.test',password:'wrong',csrf},{Cookie})).status,401);
  const gate=await site.post('/api/staff/auth/login',{email:'owner@fixture.test',password,csrf},{Cookie});assert.equal(gate.status,428);assert.equal(gate.headers.get('retry-after'),'1');assert.equal(gate.data.error.details.continue_url,'/auth/staff-login.php');
  assert.equal(+site.sql("SELECT COUNT(*) n FROM rubizh_staff_audit WHERE action='login.failed'")[0].n,8);
  const challenge=gate.data.error.details.challenge;let n=0;for(;;n++){if(createHash('sha256').update(challenge.nonce+':'+n).digest('hex').startsWith('0000'))break;}
  const success=await site.post('/api/staff/auth/login',{email:'owner@fixture.test',password,csrf,rate_proof:String(n)},{Cookie});assert.equal(success.status,200,JSON.stringify(success.data));assert.equal(success.data.data.user.role,'OWNER');
  assert.equal(+site.sql("SELECT COUNT(*) n FROM rubizh_staff_audit WHERE action='login.failed'")[0].n,8);
 }finally{site.stop();}
});
