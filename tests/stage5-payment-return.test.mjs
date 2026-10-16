// Stage 5, 5-7 (LOW): GET /shop/payment-return.php asks the bank for the invoice status — opening or reloading the page
// must not turn into an unlimited stream of bank requests (per order and per visitor, the page still renders with
// «Очікуємо підтвердження банку»); the «Зателефонувати менеджеру» number comes from the seller settings, not the code.
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {startCrm,line} from './helpers/crm-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;

test('payment-return: bank status requests are rate-limited, the page still answers',{skip,timeout:300000},async()=>{
 const s=await startCrm({extraConfig:",'seller'=>['phone'=>'+380501112233','phone_label'=>'+380 50 111 22 33']"});
 try{
  // Count every bank status call made by the page (fixture transport only).
  const counter=s.dir+'/bank-status-calls';
  writeFileSync(s.dir+'/provider-fixture.php',readFileSync(s.dir+'/provider-fixture.php','utf8')+`\n$inner=$GLOBALS['mono_test_transport'];$GLOBALS['mono_test_transport']=function($path,$body)use($inner){if(str_starts_with($path,'invoice/status'))file_put_contents('${counter}','x',FILE_APPEND|LOCK_EX);return $inner($path,$body);};`);
  const o=await s.checkout([line()]);
  const owner=await s.login('OWNER');const v=(await owner.get('/orders/'+o.id)).data.data.version;
  assert.equal((await owner.send('/orders/'+o.id+'/invoice',{version:v})).status,200);
  const page=()=>s.get('/shop/payment-return.php?order='+o.id,{Cookie:o.cookie});
  const statuses=[];for(let i=0;i<40;i++)statuses.push((await page()).status);
  assert.ok(statuses.every(x=>x===200),'page always renders: '+statuses.join(','));
  const calls=existsSync(counter)?readFileSync(counter,'utf8').length:0;
  assert.ok(calls>=1,'the bank is still asked');assert.ok(calls<=12,'at most 6 bank requests per order per minute window (a run may span two windows), got '+calls);
  const html=(await page()).text;
  assert.match(html,/Очікуємо підтвердження банку/);
  assert.match(html,/href="tel:\+380501112233"/,'manager phone from the seller settings');assert.doesNotMatch(html,/380976867892/);
 }finally{s.stop();}
});
