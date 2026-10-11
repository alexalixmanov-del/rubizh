// Q-6 (owner decision 2026-10-11): SMS login protection — limits, cooldown, failed-code budget, a reserve of the daily
// budget for existing customers (D-15), and a proof-of-work check only when activity looks automated, with email as the
// accessible fallback. Isolated MySQL fixture; SMS sending is replaced by a test outbox, nothing leaves the machine.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {startSite,runtime,phpArgs,phpEnv} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const sha=s=>createHash('sha256').update(s).digest('hex');

async function smsSite(extra=''){
 const site=await startSite({enableV3:false});
 writeFileSync(path.join(site.site,'auth/config.php'),`<?php return ['sms_enabled'=>true,'turbosms_token'=>'fixture-token','turbosms_sender'=>'RUBIZH','google_enabled'=>false,'noreply_password'=>'','auth_secret'=>str_repeat('s',48),'sms_daily_limit'=>10,'sms_check_bits'=>8${extra}];`);
 // One CLI request = one browser session; returns the outcome and what the session holds afterwards.
 site.req=(phone,{ip='203.0.113.7',session={},pow=null}={})=>new Promise(res=>{
  const code=`define('RUBIZH_AUTH_NO_SESSION',true);define('RUBIZH_SMS_TESTS',true);require '${site.site}/auth/bootstrap.php';require_once '${site.site}/auth/identities.php';require_once '${site.site}/auth/phone.php';
   $_SERVER['REMOTE_ADDR']=${JSON.stringify(ip)};$_SESSION=json_decode(${JSON.stringify(JSON.stringify(session))},true)?:[];if(!authPending())authPendingSet(['kind'=>'phone']);
   $GLOBALS['sms_test_transport']=function($phone,$text){$GLOBALS['sent'][]=$phone;};
   ${pow?`$_POST['sms_check']=${JSON.stringify(pow)};`:''}
   try{phoneRequest(${JSON.stringify(phone)});$r=['ok'=>true];}catch(PhoneCheckRequired $e){$r=['ok'=>false,'check'=>true,'error'=>$e->getMessage()];}catch(Throwable $e){$r=['ok'=>false,'error'=>$e->getMessage()];}
   echo json_encode($r+['sent'=>$GLOBALS['sent']??[],'session'=>$_SESSION]);`;
  const p=spawn(runtime+'/bin/php8.4',[...phpArgs,'-r',code],{env:phpEnv});let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);
  p.on('close',()=>{try{res(JSON.parse(out));}catch{res({ok:false,error:'php: '+(out+err).slice(0,300)});}});});
 site.ipHash=ip=>sha(ip);
 return site;
}
const solve=(nonce,bits)=>{for(let n=0;;n++){const h=createHash('sha256').update(nonce+':'+n).digest();let z=0;for(const b of h){if(b===0){z+=8;continue;}z+=Math.clz32(b)-24;break;}if(z>=bits)return String(n);}};

test('Q-6: parallel requests for one number send exactly one SMS; the cooldown and per-number limits hold',{skip,timeout:120000},async()=>{
 const site=await smsSite();
 try{
  const results=await Promise.all(Array.from({length:6},(_,i)=>site.req('+380671110001',{ip:'203.0.113.'+(10+i)})));
  assert.equal(results.filter(r=>r.ok).length,1,JSON.stringify(results.map(r=>r.error||'ok')));
  assert.equal(+site.sql("SELECT COUNT(*) n FROM rubizh_phone_challenges WHERE phone='+380671110001'")[0].n,1);
  const again=await site.req('+380671110001');assert.equal(again.ok,false);assert.match(again.error,/через хвилину/);
 }finally{site.stop();}
});

test('Q-6: one address cannot spray numbers — a short burst needs the check, a longer burst is refused',{skip,timeout:120000},async()=>{
 const site=await smsSite();
 try{
  const ip='198.51.100.9',out=[];
  for(let i=0;i<3;i++)out.push(await site.req('+38067222000'+i,{ip}));
  assert.deepEqual(out.map(r=>r.ok),[true,true,true],JSON.stringify(out.map(r=>r.error)));
  const fourth=await site.req('+380672220003',{ip});
  assert.equal(fourth.check,true,'suspicious burst asks for the check: '+fourth.error);assert.match(fourth.error,/email/i,'email login is offered as the fallback');
  const challenge=fourth.session.sms_check;assert.ok(challenge&&challenge.nonce,'challenge kept in the session');
  const passed=await site.req('+380672220003',{ip,session:fourth.session,pow:solve(challenge.nonce,challenge.bits)});
  assert.equal(passed.ok,true,'a solved check lets a real person through: '+passed.error);
  // Sessions live on the server: after use the challenge is gone, so the same answer cannot be replayed.
  assert.equal(passed.session.sms_check,undefined,'the challenge is consumed');
  const replay=await site.req('+380672220004',{ip,session:passed.session,pow:solve(challenge.nonce,challenge.bits)});
  assert.equal(replay.ok,false,'a solved check is single-use');
  site.sql(`INSERT INTO rubizh_phone_challenges(id,phone,code_hash,flow_hash,ip_hash,sent_at,expires_at,state) VALUES('${'f'.repeat(32)}','+380672220099','${'0'.repeat(64)}','${'0'.repeat(64)}','${site.ipHash(ip)}',UNIX_TIMESTAMP(),UNIX_TIMESTAMP()+300,'sent')`);
  const hard=await site.req('+380672220005',{ip,session:passed.session,pow:'0'});
  assert.equal(hard.ok,false);assert.notEqual(hard.check,true,'over the hard limit no check helps');
 }finally{site.stop();}
});

test('Q-6/D-15: strangers cannot exhaust the daily budget — 30% stays reserved for numbers of existing customers',{skip,timeout:120000},async()=>{
 const site=await smsSite();
 try{
  for(let i=0;i<7;i++)site.sql(`INSERT INTO rubizh_phone_challenges(id,phone,code_hash,flow_hash,ip_hash,sent_at,expires_at,state) VALUES('${String(i).padStart(32,'a')}','+38067333000${i}','${'0'.repeat(64)}','${'0'.repeat(64)}','${sha('x'+i)}',UNIX_TIMESTAMP()-7200,UNIX_TIMESTAMP(),'sent')`);
  const stranger=await site.req('+380673339999',{ip:'192.0.2.50'});
  assert.equal(stranger.ok,false);assert.match(stranger.error,/email/i,'a stranger is pointed to email login');
  site.sql(`INSERT INTO rubizh_accounts(id,email,first_name,last_name,created_at,updated_at) VALUES('${'b'.repeat(32)}','c@fixture.test','Тест','Покупець',UTC_TIMESTAMP(),UTC_TIMESTAMP())`);
  site.sql(`INSERT INTO rubizh_customer_identities(provider,subject,customer_id,created_at) VALUES('phone','+380673338888','${'b'.repeat(32)}',UTC_TIMESTAMP())`);
  // Above 60% everybody gets the same check (no customer/stranger difference there); a customer then still gets the code.
  const first=await site.req('+380673338888',{ip:'192.0.2.51'});assert.equal(first.check,true,'same check for customers: '+first.error);
  const customer=await site.req('+380673338888',{ip:'192.0.2.51',session:first.session,pow:solve(first.session.sms_check.nonce,first.session.sms_check.bits)});
  assert.equal(customer.ok,true,'an existing customer still gets the code: '+customer.error);
 }finally{site.stop();}
});

test('Q-6: too many wrong codes for one number stop new codes for that number for the day',{skip,timeout:120000},async()=>{
 const site=await smsSite();
 try{
  for(let i=0;i<3;i++)site.sql(`INSERT INTO rubizh_phone_challenges(id,phone,code_hash,flow_hash,ip_hash,sent_at,expires_at,attempts,state) VALUES('${String(i).padStart(32,'c')}','+380674440000','${'0'.repeat(64)}','${'0'.repeat(64)}','${sha('192.0.2.60')}',UNIX_TIMESTAMP()-4000-${i}*60,UNIX_TIMESTAMP()-3000,5,'sent')`);
  const r=await site.req('+380674440000',{ip:'192.0.2.60'});
  assert.equal(r.ok,false);assert.match(r.error,/забагато невдалих спроб/i);
  // Review finding: wrong codes typed from someone else's address must not lock the owner of the number out.
  const owner=await site.req('+380674440000',{ip:'192.0.2.61'});
  assert.equal(owner.check===true||owner.ok===true,true,'the number owner can still request a code: '+owner.error);
 }finally{site.stop();}
});

test('Q-6: in the browser the check is solved invisibly after the second press and the code page opens; no real SMS',{skip,timeout:180000},async()=>{
 const {chromium}=await import('playwright');
 const site=await smsSite(",'sms_test_outbox'=>__DIR__.'/../sms-outbox.jsonl'");let browser;
 try{
  // Two recent requests from this browser's address make the next ones suspicious (but under the hard limit).
  for(let i=0;i<3;i++)site.sql(`INSERT INTO rubizh_phone_challenges(id,phone,code_hash,flow_hash,ip_hash,sent_at,expires_at,state) VALUES('${String(i).padStart(32,'d')}','+38067555000${i}','${'0'.repeat(64)}','${'0'.repeat(64)}','${sha('127.0.0.1')}',UNIX_TIMESTAMP()-60,UNIX_TIMESTAMP()+240,'sent')`);
  browser=await chromium.launch({executablePath:(process.env.CHROMIUM_PATH||'/usr/bin/chromium'),args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.goto(site.base+'/auth/');await page.locator('#entry-phone').fill('0675550009');
  await page.getByRole('button',{name:/Отримати код/}).first().click();await page.waitForLoadState('load');
  assert.match(await page.locator('body').innerText(),/Підтверджуємо, що запит робить людина[\s\S]*email/);
  await page.locator('input[name="phone"]').first().fill('0675550009');
  await page.getByRole('button',{name:/Отримати код/}).first().click();
  await page.getByLabel(/Код підтвердження/).waitFor({timeout:30000});
  const {readFileSync}=await import('node:fs');
  assert.match(readFileSync(path.join(site.site,'sms-outbox.jsonl'),'utf8'),/\+380675550009/,'the code went to the local outbox, not to a provider');
 }finally{await browser?.close();site.stop();}
});

test('Q-6: repeated requests for one number within an hour ask for the check',{skip,timeout:120000},async()=>{
 const site=await smsSite();
 try{
  for(const [i,ago] of [[0,1800],[1,600]])site.sql(`INSERT INTO rubizh_phone_challenges(id,phone,code_hash,flow_hash,ip_hash,sent_at,expires_at,state) VALUES('${String(i).padStart(32,'e')}','+380676660000','${'0'.repeat(64)}','${'0'.repeat(64)}','${sha('z'+i)}',UNIX_TIMESTAMP()-${ago},UNIX_TIMESTAMP()-${ago}+300,'sent')`);
  const r=await site.req('+380676660000',{ip:'192.0.2.70'});assert.equal(r.check,true,r.error);
 }finally{site.stop();}
});
