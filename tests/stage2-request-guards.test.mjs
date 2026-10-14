import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startSite,php,root} from './helpers/site-fixture.mjs';

test('public and staff mutation endpoints reject missing/wrong CSRF and foreign Origin without creating money or orders',{skip:!process.env.RUBIZH_TEST_MYSQL_SOCKET,timeout:180000},async()=>{
 const site=await startSite();
 try{
  const session=await fetch(site.base+'/shop/customer.php');
  const csrf=(await session.json()).csrf,Cookie=session.headers.get('set-cookie').split(';')[0];
  for(const endpoint of ['order','checkout-quote','payment-start','cart-reminder','order-confirm','financial-actions','kits','preferences']){
   for(const [body,headers] of [[{},{}],[{csrf:'f'.repeat(64)},{}],[{csrf},{Origin:'https://untrusted.test'}]]){
    const r=await site.post('/shop/'+endpoint+'.php',body,{Cookie,...headers});
    assert.equal(r.status,403,`${endpoint}: ${JSON.stringify(headers)} ${JSON.stringify(r.data)}`);
   }
  }
  assert.equal(+site.sql('SELECT COUNT(*) n FROM rubizh_customer_orders')[0].n,0);
  assert.equal(+site.sql('SELECT COUNT(*) n FROM rubizh_mono_invoices')[0].n,0);
 }finally{site.stop();}
});

for(const [name,utc,holidays,expected] of [
 ['spring DST Friday','2026-03-27 21:30:00',[],'2026-03-30 20:30:00'],
 ['autumn DST Friday','2026-10-23 20:30:00',[],'2026-10-26 21:30:00'],
 ['Monday holiday','2026-03-27 21:30:00',['2026-03-30'],'2026-03-31 20:30:00'],
 ['Kyiv day differs from UTC','2026-03-27 22:30:00',[],'2026-03-29 21:30:00'],
])test('workday payment deadline: '+name,()=>{
 const r=php(`function cfg($k){return $k==='bank_holidays'?json_decode('${JSON.stringify(holidays)}',true):null;}require '${root}/shop/order-lifecycle.php';echo shopWorkdayDeadline('${utc}',1);`);
 assert.equal(r.status,0,r.stderr);assert.equal(r.stdout,expected);
});
