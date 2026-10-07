import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startPreview} from '../dev/preview.mjs';
import {products,catalog} from '../dev/fixtures.mjs';
let server,browser,base;
before(async()=>{server=await startPreview(0);base='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});});
after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve));});
const bodyButton=page=>page.locator('.rz-kit-slot').filter({has:page.locator('.rz-kit-slot-head', {hasText:'Тіло'})}).locator('.rz-slot-select');
test('Picker immediately shows preloaded products, exposes API failure and retries; reopening reuses the response',async()=>{
 const page=await browser.newPage({viewport:{width:390,height:844}});let fail=true,calls=0;
 try{
  await page.route('**/shop/catalog.php*',async route=>{const url=new URL(route.request().url());if(!url.searchParams.has('slot'))return route.continue();calls++;
   await new Promise(resolve=>setTimeout(resolve,700));return route.fulfill({status:fail?503:200,contentType:'application/json',body:JSON.stringify(fail?{ok:false,error:'Каталог тимчасово недоступний.'}:catalog(url.searchParams))});});
  await page.goto(base+'/kit');await page.locator('.rz-kit-rec').first().waitFor();await bodyButton(page).click();
  const dialog=page.getByRole('dialog',{name:'Вибір товару в комплект'});
  await dialog.locator('.rz-kit-modal-card').first().waitFor({timeout:500});await dialog.getByRole('status').waitFor();
  await dialog.getByRole('alert').waitFor();assert.equal(await dialog.getByText('За цими параметрами спорядження не знайдено.').count(),0);
  fail=false;await dialog.getByRole('button',{name:'Спробувати ще раз'}).click();await dialog.getByRole('status').waitFor();await dialog.getByRole('status').waitFor({state:'hidden'});
  assert.equal(await dialog.getByRole('alert').count(),0);assert.equal(await dialog.locator('.rz-kit-modal-card').count(),1);
  await dialog.locator('[role=button]').filter({hasText:'✕'}).click();await bodyButton(page).click();await dialog.locator('.rz-kit-modal-card').first().waitFor({timeout:500});
  await dialog.getByRole('status').waitFor({state:'hidden'});assert.equal(calls,2);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }finally{await page.close();}
});
test('Search displays loading before a real empty result, reset restores products, and confirmed sizes can add to a slot',async()=>{
 const page=await browser.newPage();try{
  await page.route('**/shop/catalog.php*',async route=>{const url=new URL(route.request().url());if(!url.searchParams.has('slot'))return route.continue();await new Promise(resolve=>setTimeout(resolve,400));return route.fulfill({contentType:'application/json',body:JSON.stringify(catalog(url.searchParams))});});
  await page.goto(base+'/kit');await page.locator('.rz-kit-rec').first().waitFor();await bodyButton(page).click();const dialog=page.getByRole('dialog',{name:'Вибір товару в комплект'});
  await dialog.getByRole('status').waitFor({state:'hidden'});await dialog.getByRole('searchbox').fill('неіснуючий');await dialog.getByRole('status').waitFor();
  assert.equal(await dialog.getByText('За цими параметрами спорядження не знайдено.').count(),0);
  await dialog.getByRole('button',{name:'Скинути фільтри'}).waitFor();assert.equal(await dialog.locator('.rz-kit-modal-card').count(),0);
  await dialog.getByRole('button',{name:'Скинути фільтри'}).click();await dialog.locator('.rz-kit-modal-card').first().waitFor();
  await dialog.locator('.rz-kit-modal-card [data-ui-button]').filter({hasText:/^L$/}).click();await dialog.waitFor({state:'hidden'});
  assert.match(await page.locator('.rz-kit-slot').filter({has:page.locator('.rz-kit-slot-head',{hasText:'Тіло'})}).innerText(),/Тактичний костюм/);
 }finally{await page.close();}
});
test('Instructions and selection buttons are highlighted in both themes without mobile overflow',async()=>{
 const page=await browser.newPage({viewport:{width:360,height:800}});try{
  await page.goto(base+'/kit');await bodyButton(page).waitFor();
  for(const theme of ['dark','light']){
   await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   const style=await bodyButton(page).evaluate(e=>{const s=getComputedStyle(e);return {bg:s.backgroundColor,height:e.getBoundingClientRect().height,align:s.justifyContent};});
   assert.equal(style.bg,'rgb(255, 173, 51)');assert.ok(style.height>=48);assert.equal(style.align,'center');
   assert.equal(await page.locator('.rz-kit-instructions').evaluate(e=>getComputedStyle(e).borderLeftWidth),'4px');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
 }finally{await page.close();}
});
