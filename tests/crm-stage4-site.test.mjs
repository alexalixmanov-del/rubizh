// Stage 4, block 4-SITE: storefront and payment fixes D-50…D-54 (regression-first).
import {test} from 'node:test';import assert from 'node:assert/strict';import {chromium} from 'playwright';
import {startCrm,line} from './helpers/crm-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;

test('D-50: payment return, settings and NP manager pages allow their own scripts; receipt reloads after the bank status changes',{skip,timeout:240000},async()=>{
 const s=await startCrm();const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  for(const page of ['/shop/payment-return.php?order=1','/shop/settings.php','/shop/np-manager.php']){
   const r=await fetch(s.base+page);const csp=r.headers.get('content-security-policy')||'';
   assert.match(csp,/script-src 'self'/,page+': same-origin scripts are allowed');assert.doesNotMatch(csp,/script-src[^;]*'unsafe-inline'/,page+': no inline scripts');assert.match(csp,/img-src 'self'/,page);assert.match(csp,/connect-src 'self'/,page);
  }
  const o=await s.checkout([line()]);const owner=await s.login('OWNER');let v=(await owner.get('/orders/'+o.id)).data.data;await owner.send('/orders/'+o.id+'/invoice',{version:v.version});
  const ctx=await browser.newContext();await ctx.addCookies([{name:o.cookie.split('=')[0],value:o.cookie.split('=').slice(1).join('='),url:s.base}]);const page=await ctx.newPage();
  await page.addInitScript(()=>{window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective+' '+e.blockedURI));});
  const step=m=>process.env.RUBIZH_TEST_TRACE&&console.error('D-50 step',m);step('goto');
  await page.goto(s.base+'/shop/payment-return.php?order='+o.id,{timeout:30000});step('loaded');
  assert.deepEqual(await page.evaluate(()=>window.__csp),[],'no CSP violations on the receipt page');
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme!==undefined||!!document.querySelector('script[src*="theme.js"]')),true);
  const inv=s.sql('SELECT * FROM rubizh_mono_invoices')[0];assert.equal((await s.webhook(inv)).status,200);
  step('webhook');const reload=page.waitForEvent('load',{timeout:20000});await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await reload;step('reloaded');
  assert.deepEqual(await page.evaluate(()=>window.__csp),[],'still no violations after reload');
  assert.match(await page.content(),/оплачено|Оплачено/,'receipt shows the paid state after the automatic reload');
  await ctx.close();
 }finally{await browser.close();s.stop();}
});
