import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';
import {startPreview} from '../dev/preview.mjs';
let browser,server,base;
before(async()=>{
  server=await startPreview(0);base='http://127.0.0.1:'+server.address().port;
  const executable=process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
  browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox']});
});
after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve));});
async function withPage(run,viewport={width:1440,height:1000}) {
  const context=await browser.newContext({viewport});const page=await context.newPage();
  page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{await run(page);assert.deepEqual(errors,[],'No uncaught browser errors');}finally{await context.close();}
}
async function loaded(page,path='/'){await page.goto(base+path);await page.locator('[data-store-surface]').waitFor();}
async function addUniform(page){
  await loaded(page,'/product/demo-uniform');await page.getByRole('button',{name:'L',exact:true}).click();
  await page.getByRole('button',{name:/До кошика/}).first().click();
  await page.getByRole('button',{name:'Продовжити',exact:true}).click();
  await page.locator('header [aria-label="Кошик"]').click();
  await page.getByRole('heading',{name:'Оформлення замовлення'}).waitFor();
}
test('Home images load, categories navigate, and layout fits desktop',()=>withPage(async page=>{
  await loaded(page);await page.getByRole('heading',{name:/Твій рубіж/i}).waitFor();
  assert.equal(await page.locator('.rz-category').count(),6);
  for(let y=0;y<5200;y+=650){await page.evaluate(y=>scrollTo(0,y),y);await page.waitForTimeout(80);}
  await page.waitForFunction(()=>[...document.querySelectorAll('.rz-home img')].every(i=>i.complete&&i.naturalWidth>0));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('.rz-category').filter({hasText:'Взуття'}).click();
  await page.locator('[data-card-name]').filter({hasText:'Берці'}).waitFor();
  assert.equal(await page.locator('[data-cat-grid][data-hide="0"] [data-tile]').count(),1);
}));
test('Direct product links load correct product and preserve its URL',()=>withPage(async page=>{
  await loaded(page,'/product/demo-uniform');
  await page.getByRole('heading',{name:'Демо · Тактичний костюм ММ14'}).waitFor();
  assert.equal(new URL(page.url()).pathname,'/product/demo-uniform');
  assert.equal(await page.locator('[data-prod-section] img').count()>0,true);
}));
test('Selected size and cart survive reload, with accurate totals',()=>withPage(async page=>{
  await addUniform(page);
  assert.match(await page.locator('body').innerText(),/Розмір L · Піксель/);
  await page.reload();await page.getByRole('heading',{name:'Оформлення замовлення'}).waitFor();
  await page.getByText('DEMO-UNIFORM-L',{exact:true}).waitFor();
  assert.match(await page.locator('body').innerText(),/3\s*200\s*₴/);

}));
test('Disabled payment methods and donation claims are absent at checkout',()=>withPage(async page=>{
  await addUniform(page);
  await page.getByText('Оплата на рахунок ФОП',{exact:true}).waitFor();
  assert.equal(await page.getByText('Оплата карткою',{exact:true}).count(),0);
  assert.equal(await page.getByText('Післяплата',{exact:true}).count(),0);
  assert.equal(await page.getByText('Куди надіслати скрін донату',{exact:true}).count(),0);
  assert.equal(await page.locator('input[name="name"][aria-label]').count(),1);
}));
test('Card and COD options appear when the server enables them',()=>withPage(async page=>{
  await page.route('**/shop/customer.php',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,csrf:'preview-only',authed:false,customer_id:null,profile:null,favorites:[],items:[],mono_enabled:true,np_enabled:false,np_cod_enabled:true})}));
  await addUniform(page);
  await page.getByText('Оплата карткою',{exact:true}).waitFor();
  await page.getByText('Післяплата',{exact:true}).waitFor();
}));
test('Cart quantity cannot exceed the known stock',()=>withPage(async page=>{
  await addUniform(page);
  const plus=page.getByRole('button',{name:'+',exact:true});
  for(let i=0;i<6;i++)await plus.click();
  assert.equal((await page.locator('[data-header-count]').innerText()).trim(),'5');
  assert.match(await page.locator('body').innerText(),/16\s*000\s*₴/);
}));
test('Keyboard favourite activation happens once and persists',()=>withPage(async page=>{
  await loaded(page,'/catalog');const fav=page.locator('[data-fav]').first();
  await fav.focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelector('[data-fav]')?.getAttribute('aria-pressed')==='true');
  await page.reload();await page.waitForFunction(()=>document.querySelector('[data-fav]')?.getAttribute('aria-pressed')==='true');
  const control=page.locator('[data-fav]').first();await control.focus();await page.keyboard.press('Space');
  await page.waitForFunction(()=>document.querySelector('[data-fav]')?.getAttribute('aria-pressed')==='false');
}));
test('Search returns matching product and zero-result recovery',()=>withPage(async page=>{
  await loaded(page);const input=page.getByRole('searchbox',{name:'Пошук',exact:true});
  await input.fill('Берці');await input.press('Enter');
  await page.locator('[data-card-name]').filter({hasText:'Берці'}).waitFor();
  assert.equal(await page.locator('[data-cat-grid][data-hide="0"] [data-tile]').count(),1);
  await input.fill('Невідомийтовар777');await input.press('Enter');
  await page.getByText(/нічого не (знайдено|знайшли)/i).first().waitFor();
  assert.equal(await page.locator('[data-cat-grid][data-hide="0"] [data-tile]').count(),0);
}));
test('Mobile menu closes with Escape and home fits small screens',()=>withPage(async page=>{
  await loaded(page);const menu=page.getByRole('button',{name:'Меню і каталог'});
  await menu.click();await page.locator('#catalog-menu-mobile').waitFor();
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.getElementById('catalog-menu-mobile'));
  for(const width of [320,390,768]){
    await page.setViewportSize({width,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`No horizontal overflow at ${width}px`);
  }
  const question=page.locator('.rz-faq-question').nth(1);await question.click();assert.equal(await question.getAttribute('aria-expanded'),'true');
},{width:390,height:844}));
test('Theme preference persists and reduced motion is supported',()=>withPage(async page=>{
  await loaded(page);await page.locator('header [data-theme-toggle]').click();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
  await page.reload();assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('.rz-category').first().evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
}));
test('Mobile catalog, product and checkout fit the viewport',()=>withPage(async page=>{
  for(const width of [320,390,768]){
    await page.setViewportSize({width,height:844});
    await loaded(page,'/catalog');await page.locator('[data-card-name]').first().waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Catalog at ${width}px`);
    await loaded(page,'/product/demo-uniform');await page.getByRole('heading',{name:'Демо · Тактичний костюм ММ14'}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Product at ${width}px`);
  }
  await page.setViewportSize({width:390,height:844});await addUniform(page);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Mobile checkout');
},{width:390,height:844}));
test('Catalog server errors surface without pretending to succeed',()=>withPage(async page=>{
  await page.route('**/shop/catalog.php?*',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,error:'Тест: каталог тимчасово недоступний.'})}));
  await loaded(page,'/catalog');await page.getByRole('alert').filter({hasText:'Тест: каталог'}).waitFor();
  assert.equal(await page.locator('[data-cat-grid][data-hide="0"] [data-tile]').count(),0);
}));
test('Preview rejects real order/payment writes and private file requests',async()=>{
  for(const endpoint of ['/shop/order.php','/shop/payment-start.php','/shop/customer.php']){
    const response=await fetch(base+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    assert.equal(response.status,403);assert.equal((await response.json()).ok,false);
  }
  for(const file of ['/api/np-private.php','/api/config.php','/dev/fixtures.mjs'])assert.ok((await fetch(base+file)).status>=400);
});
