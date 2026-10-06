import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';
import {startPreview} from '../dev/preview.mjs';
let browser,server,base;
before(async()=>{server=await startPreview(0);base='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({executablePath:existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined,headless:true,args:['--no-sandbox']});});
after(async()=>{await browser?.close();await new Promise(resolve=>server.close(resolve));});
async function run(fn){const context=await browser.newContext();const page=await context.newPage();try{await fn(page); }finally{await context.close();}}
test('Production account view fits both themes, all main tabs, and phone/tablet/desktop widths',()=>run(async page=>{
 for(const theme of ['dark','light'])for(const width of [320,390,768,1024,1440]){
  await page.addInitScript(theme=>localStorage.setItem('rubizh.theme',theme),theme);await page.setViewportSize({width,height:900});
  for(const tab of ['orders','favorites','profile','delivery']){
   await page.goto(base+'/auth/preview-account?tab='+tab);await page.locator('.account-content').waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${theme} ${width} ${tab}`);
   if(width<=760){assert.equal(await page.locator('.account-bottom a').count(),4);assert.equal(await page.locator('.account-bottom [aria-current]').getAttribute('href'),'/auth/?tab='+tab);assert.equal(await page.locator('.account-sidebar').isVisible(),false);}
   else{assert.equal(await page.locator('.account-sidebar [aria-current]').getAttribute('href'),'/auth/?tab='+tab);}
   if(tab==='orders'){await page.waitForFunction(()=>document.querySelector('.account-empty-art')?.naturalWidth>0);assert.equal(await page.locator('.order-detail-pane').isVisible(),false);assert.equal(await page.locator('.account-support').isVisible(),width>=1000);}
  }
 }
}));
test('Phone badge reflects verification and profile/delivery keep their POST fields and CSRF token',()=>run(async page=>{
 await page.goto(base+'/auth/preview-account?mode=unverified');assert.equal(await page.locator('.account-verification,.account-mobile-verified').count(),0);
 await page.goto(base+'/auth/preview-account?tab=profile');assert.equal(await page.locator('input[name=phone]').getAttribute('readonly')!==null,true);
 assert.equal(await page.locator('form input[name=action][value=save_profile]').count(),1);assert.ok(await page.locator('form input[name=csrf]').count()>0);
 await page.goto(base+'/auth/preview-account?tab=profile&mode=unverified');assert.equal(await page.locator('input[name=phone]').getAttribute('readonly'),null);
 await page.goto(base+'/auth/preview-account?tab=delivery');assert.equal(await page.locator('input[name=action]').getAttribute('value'),'save_delivery');assert.equal(await page.locator('select[name=delivery_type] option').count(),3);
 const response=await page.request.post(base+'/auth/?tab=delivery',{form:{action:'save_delivery',csrf:'design-preview-only',city:'Fixture'}});assert.equal(response.status(),403);
}));
test('Existing orders retain links and do not show the empty-order illustration',()=>run(async page=>{
 for(const width of [390,1440]){await page.setViewportSize({width,height:900});await page.goto(base+'/auth/preview-account?mode=populated');assert.equal(await page.locator('.order-card').count(),1);assert.equal(await page.locator('.account-empty-art').count(),0);assert.match(await page.locator('.order-card-link').getAttribute('href'),/order=1/);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
}));
