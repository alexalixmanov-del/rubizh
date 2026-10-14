import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startSite} from './helpers/site-fixture.mjs';

test('R8: staff login loads its local fonts under the enforced CSP without browser errors',{timeout:120000},async()=>{
 const site=await startSite();let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium'});
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/favicon/.test(m.text()))errors.push(m.text());});
  const response=await page.goto(site.base+'/auth/staff-login.php',{waitUntil:'networkidle'});assert.equal(response.status(),200);
  const fonts=await page.evaluate(async()=>{try{await Promise.all(['500 24px Oswald','700 24px Oswald','500 16px "Google Sans"'].map(f=>document.fonts.load(f)));await document.fonts.ready;return {loaded:[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family)};}catch(e){return {error:e.message};}});
  assert.deepEqual(errors,[],'CSP must allow the page own font files');assert.equal(fonts.error,undefined);assert.ok(fonts.loaded.includes('Oswald'));assert.ok(fonts.loaded.includes('Google Sans'));
  const csp=response.headers()['content-security-policy'];assert.match(csp,/(?:^|;)\s*default-src 'none'(?:;|$)/);assert.match(csp,/(?:^|;)\s*font-src 'self'(?:;|$)/);assert.doesNotMatch(csp,/unsafe-inline|unsafe-eval|https:|\*/);
  await page.getByLabel('Email',{exact:true}).fill('owner@fixture.test');await page.getByLabel('Пароль',{exact:true}).fill('fixture-password');assert.equal(await page.getByRole('button',{name:'Увійти',exact:true}).isEnabled(),true);
 }finally{await browser?.close();site.stop();}
});
