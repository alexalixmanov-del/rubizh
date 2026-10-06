import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startPreview} from '../dev/preview.mjs';
let browser,server,base;
before(async()=>{server=await startPreview(0);base='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});});
after(async()=>{await browser?.close();await new Promise(r=>server?.close(r));});
async function centered(locator){
 const metrics=await locator.evaluate(e=>{const box=e.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(e);const content=range.getBoundingClientRect();return {height:box.height,dx:Math.abs(content.x+content.width/2-box.x-box.width/2),dy:Math.abs(content.y+content.height/2-box.y-box.height/2)};});
 assert.ok(metrics.height>=44,JSON.stringify(metrics));assert.ok(metrics.dx<2,JSON.stringify(metrics));assert.ok(metrics.dy<4,JSON.stringify(metrics));
}
test('Mobile category controls, product actions and checkout actions stay centered and usable',async()=>{
 for(const width of [320,390,430])for(const theme of ['dark','light']){
  const context=await browser.newContext({viewport:{width,height:900},isMobile:true,hasTouch:true});
  await context.addInitScript(t=>localStorage.setItem('rubizh.theme',t),theme);const page=await context.newPage();
  try{
   await page.goto(base+'/catalog');await page.locator('[data-catalog-section]').first().waitFor();
   for(const control of await page.locator('[data-mob-bar]>[role=button],.rz-sections-pager button').all())await centered(control);
   await page.locator('[data-mob-bar]>[role=button]').last().click();await page.getByRole('dialog',{name:/Сортування/}).waitFor();await page.keyboard.press('Escape');
   await page.goto(base+'/product/demo-uniform');await page.getByRole('button',{name:'L',exact:true}).click();
   const buy=page.getByRole('button',{name:/До кошика/}).first();await centered(buy);await buy.click();
   await centered(page.getByRole('button',{name:'Продовжити',exact:true}));await page.getByRole('button',{name:'Продовжити',exact:true}).click();
   await page.locator('header [aria-label="Кошик"]').click();await page.getByRole('heading',{name:'Оформлення замовлення'}).waitFor();
   await centered(page.getByRole('button',{name:'Ок',exact:true}));await centered(page.getByRole('button',{name:'Підтвердити замовлення',exact:true}));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${theme} ${width}`);
   await page.goto(base+'/kit');await page.getByRole('button',{name:'змінити',exact:true}).click();await page.locator('.rz-kit-parameters').waitFor();for(const control of await page.locator('.rz-kit-parameters [data-ui-button]').all())await centered(control);
  }finally{await context.close();}
 }
});
test('Account order tabs and catalog action remain centered on mobile',async()=>{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 try{await page.goto(base+'/auth/preview-account?tab=orders');await page.locator('.order-tabs').waitFor();for(const control of await page.locator('.order-tabs a,.empty-orders .inline-button').all())await centered(control);}finally{await page.close();}
});
