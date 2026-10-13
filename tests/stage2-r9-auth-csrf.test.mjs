import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';
import {startCrm,line} from './helpers/crm-fixture.mjs';
import {php} from './helpers/site-fixture.mjs';
import {createServer,request as httpRequest} from 'node:http';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET,csrf='c'.repeat(64),A='a'.repeat(32);
function session(s,id=A){const sid='r9origin'+crypto.randomUUID().replaceAll('-','');writeFileSync(s.dir+'/sess_'+sid,`csrf|s:64:"${csrf}";customer_id|s:32:"${id}";login_time|i:${Math.floor(Date.now()/1000)};login_method|s:5:"email";`);return {sid,cookie:'rubizh_customer='+sid};}
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

test('R9 native account forms retain no-referrer privacy and reject opaque foreign navigation',{skip,timeout:120000},async()=>{
 const {chromium}=await import('playwright');const s=await startCrm();let browser,attacker;
 try{router(s);s.sql(`INSERT INTO rubizh_accounts(id,email,first_name,last_name,created_at,updated_at) VALUES('${A}','native-origin@fixture.test','До','Тест',UTC_TIMESTAMP(),UTC_TIMESTAMP())`);const ctx=session(s);
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium'});const context=await browser.newContext();await context.addCookies([{name:'rubizh_customer',value:ctx.sid,url:s.base,httpOnly:true,sameSite:'Lax',secure:false}]);const page=await context.newPage(),posts=[];
  page.on('request',r=>{if(r.method()==='POST'&&r.url().startsWith(s.base+'/auth/'))posts.push(r.allHeaders());});
  const initial=await page.goto(s.base+'/auth/?tab=profile');assert.equal(initial.headers()['referrer-policy'],'no-referrer');
  attacker=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html','Referrer-Policy':'no-referrer'});res.end(`<form method="post" action="${s.base}/auth/?tab=profile"><input name="csrf" value="${csrf}"><input name="action" value="save_profile"><input name="first_name" value="Чужий"><input name="last_name" value="Тест"><button>Submit</button></form>`);});await new Promise(r=>attacker.listen(0,'127.0.0.1',r));const before=s.sql(`SELECT * FROM rubizh_accounts WHERE id='${A}'`);
  await page.goto('http://127.0.0.1:'+attacker.address().port);await Promise.all([page.waitForNavigation(),page.getByRole('button',{name:'Submit'}).click()]);assert.match(await page.locator('body').innerText(),/Оновіть сторінку/);assert.deepEqual(s.sql(`SELECT * FROM rubizh_accounts WHERE id='${A}'`),before);const foreign=await posts[0];assert.equal(foreign.origin,'null');assert.notEqual(foreign['sec-fetch-site'],'same-origin');
  await page.goto(s.base+'/auth/?tab=profile');const form=page.locator('form:has(input[name="first_name"])');await form.locator('input[name="first_name"]').fill('Дозволено');await Promise.all([page.waitForNavigation(),form.getByRole('button',{name:/Зберегти/}).click()]);assert.equal(s.sql(`SELECT first_name FROM rubizh_accounts WHERE id='${A}'`)[0].first_name,'Дозволено');const native=await posts[1];assert.equal(native.origin,'null');assert.equal(native['sec-fetch-site'],'same-origin');assert.equal(native['sec-fetch-mode'],'navigate');assert.equal(native['sec-fetch-dest'],'document');
 }finally{await browser?.close();if(attacker)await new Promise(r=>attacker.close(r));s.stop();}
});

test('R9 opaque Origin requires native same-origin metadata and valid CSRF together',{skip,timeout:120000},async()=>{
 const s=await startCrm();try{router(s);s.sql(`INSERT INTO rubizh_accounts(id,email,first_name,last_name,created_at,updated_at) VALUES('${A}','metadata-origin@fixture.test','До','Тест',UTC_TIMESTAMP(),UTC_TIMESTAMP())`);const ctx=session(s),trusted={'Sec-Fetch-Site':'same-origin','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'};
 const post=(headers,body)=>new Promise((resolve,reject)=>{const q=httpRequest(s.base+'/auth/',{method:'POST',headers:{Cookie:ctx.cookie,Origin:'null','Content-Type':'application/x-www-form-urlencoded',...headers}},r=>{let text='';r.setEncoding('utf8');r.on('data',x=>text+=x);r.on('end',()=>resolve({status:r.statusCode,text:async()=>text}));});q.on('error',reject);q.end(new URLSearchParams(body).toString());});
 const denied=[{}, {...trusted,'Sec-Fetch-Site':'cross-site'}, {...trusted,'Sec-Fetch-Site':'same-site'}, {...trusted,'Sec-Fetch-Mode':'cors'}, {...trusted,'Sec-Fetch-Dest':'iframe'}, {...trusted,Origin:'https://attacker.invalid'}, {...trusted,invalidCsrf:true}];
 for(const variant of denied){const {invalidCsrf,...headers}=variant,before=s.sql(`SELECT * FROM rubizh_accounts WHERE id='${A}'`),r=await post(headers,{csrf:invalidCsrf?'wrong':csrf,action:'save_profile',first_name:'Відхилено',last_name:'Тест'});assert.equal(r.status,200);assert.match(await r.text(),/Оновіть сторінку/);assert.deepEqual(s.sql(`SELECT * FROM rubizh_accounts WHERE id='${A}'`),before);}
 const r=await post(trusted,{csrf,action:'save_profile',first_name:'Дозволено',last_name:'Тест'});assert.equal(r.status,303);assert.equal(s.sql(`SELECT first_name FROM rubizh_accounts WHERE id='${A}'`)[0].first_name,'Дозволено');
 }finally{s.stop();}
});

test('R9 native payment retry requires same-origin metadata, valid CSRF and order ownership',{skip,timeout:120000},async()=>{
 const s=await startCrm();try{s.sql(`INSERT INTO rubizh_accounts(id,email,first_name,last_name,created_at,updated_at) VALUES('${A}','retry-origin@fixture.test','До','Тест',UTC_TIMESTAMP(),UTC_TIMESTAMP())`);const order=await s.checkout([line()]);s.sql(`INSERT INTO rubizh_account_orders(order_id,customer_id) VALUES(${order.id},'${A}')`);const ctx=session(s),trusted={'Sec-Fetch-Site':'same-origin','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'};
 const snapshot=()=>JSON.stringify(Object.fromEntries(['rubizh_customer_orders','rubizh_mono_invoices','rubizh_stock_reservations'].map(t=>[t,s.sql('SELECT * FROM '+t)])));
 const post=(headers,body)=>new Promise((resolve,reject)=>{const q=httpRequest(s.base+'/shop/payment-return.php',{method:'POST',headers:{Cookie:ctx.cookie,Origin:'null','Content-Type':'application/x-www-form-urlencoded',...headers}},r=>{let text='';r.setEncoding('utf8');r.on('data',x=>text+=x);r.on('end',()=>resolve({status:r.statusCode,location:r.headers.location,text}));});q.on('error',reject);q.end(new URLSearchParams(body).toString());});
 for(const [headers,token] of [[{},csrf],[{...trusted,'Sec-Fetch-Site':'same-site'},csrf],[trusted,'wrong']]){const before=snapshot(),r=await post(headers,{csrf:token,order:order.id,action:'retry'});assert.equal(r.status,403);assert.equal(snapshot(),before);}
 const B='b'.repeat(32);s.sql(`INSERT INTO rubizh_accounts(id,email,first_name,last_name,created_at,updated_at) VALUES('${B}','foreign-retry@fixture.test','Інший','Тест',UTC_TIMESTAMP(),UTC_TIMESTAMP())`);const foreign=session(s,B),before=snapshot(),denied=await post({...trusted,Cookie:foreign.cookie},{csrf,order:order.id,action:'retry'});assert.equal(denied.status,200);assert.match(denied.text,/кабінет покупця/);assert.equal(snapshot(),before);assert.ok(!denied.text.includes(order.order_number||s.sql('SELECT order_number FROM rubizh_customer_orders WHERE id='+order.id)[0].order_number));
 const r=await post(trusted,{csrf,order:order.id,action:'retry'});assert.equal(r.status,303,r.text);assert.match(r.location,/^https:\/\/(?:pay\.mbnk\.biz|pay\.monobank\.ua)\//);assert.notEqual(s.sql('SELECT payment_status FROM rubizh_customer_orders WHERE id='+order.id)[0].payment_status,'paid');
 }finally{s.stop();}
});
