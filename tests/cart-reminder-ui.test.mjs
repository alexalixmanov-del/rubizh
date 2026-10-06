import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startPreview} from '../dev/preview.mjs';
import {products} from '../dev/fixtures.mjs';
let browser,server,base;
before(async()=>{server=await startPreview(0);base='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});});
after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve));});
async function scenario(run,{restore=false}={}){
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.setDefaultTimeout(8000);const errors=[],requests=[];let active=false,email='',restorePending=restore;
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/shop/customer.php',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,csrf:'preview-only',authed:false,customer_id:null,profile:null,favorites:[],items:[],mono_enabled:false,np_enabled:false,np_cod_enabled:false,cart_reminders_enabled:true,cart_reminder:{active,email},cart_restore_pending:restorePending})}));
 await page.route('**/shop/cart-reminder.php',async route=>{
  const body=route.request().postDataJSON();requests.push(body);
  if(body.action==='restore'){restorePending=false;return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,items:[{product_id:'demo-uniform',sku:'DEMO-UNIFORM-L',qty:2,kit_group:'kit-fixture'}],products:[products.find(p=>p.id==='demo-uniform')],omitted:0})});}
  active=body.action==='save';email=body.email||email;
  return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,active,email})});
 });
 try{await run(page,requests);assert.deepEqual(errors,[]);}finally{await context.close();}
}
async function checkout(page){
 await page.goto(base+'/product/demo-uniform');await page.getByRole('button',{name:'L',exact:true}).click();await page.getByRole('button',{name:/До кошика/}).first().click();await page.getByRole('button',{name:'Продовжити',exact:true}).click();await page.locator('header [aria-label="Кошик"]').click();await page.getByRole('heading',{name:'Оформлення замовлення'}).waitFor();
}
test('Cart reminders require a valid email and explicit opt-in; quantity updates, reload and opt-out remain consistent',()=>scenario(async(page,requests)=>{
 await checkout(page);const checkbox=page.locator('[data-cart-reminder] input');await checkbox.waitFor();assert.equal(await checkbox.isChecked(),false);
 await checkbox.click();await page.getByText('Спочатку вкажіть коректний email.',{exact:true}).waitFor();assert.equal(await checkbox.isChecked(),false);assert.equal(requests.length,0);
 await page.locator('input[name="email"]').fill('buyer@example.com');await page.waitForTimeout(700);assert.equal(requests.length,0,'Email alone must not opt in');
 await checkbox.check();await page.getByText(/Нагадування збережено/).waitFor();assert.equal(requests[0].consent,true);assert.equal(requests[0].csrf,'preview-only');assert.deepEqual(requests[0].lines,[{product_id:'demo-uniform',sku:'DEMO-UNIFORM-L',qty:1,kit_group:''}]);
 await page.getByRole('button',{name:'+',exact:true}).click();await page.waitForTimeout(900);assert.equal(requests.at(-1).lines[0].qty,2);
 await page.reload();await checkbox.waitFor();assert.equal(await checkbox.isChecked(),true);assert.equal(await page.locator('input[name="email"]').inputValue(),'buyer@example.com');
 await checkbox.uncheck();await page.getByText('Нагадування вимкнено.',{exact:true}).waitFor();assert.equal(requests.at(-1).action,'cancel');
 for(const width of [1440,768,390,320]){await page.setViewportSize({width,height:1000});for(const theme of ['dark','light']){await page.evaluate(theme=>window.rubizhTheme.save(theme),theme);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}}
}));
test('Returning from a reminder restores a real available variant and keeps its kit group without creating an order',()=>scenario(async(page,requests)=>{
 await page.goto(base+'/#cart');await page.getByRole('heading',{name:'Оформлення замовлення'}).waitFor();await page.getByText('Кошик відновлено. Перевірте товари перед оформленням.',{exact:true}).waitFor();assert.deepEqual(requests.map(r=>r.action),['restore']);await page.getByText('DEMO-UNIFORM-L',{exact:true}).waitFor();assert.match(await page.locator('body').innerText(),/L/);
 const stored=await page.evaluate(()=>Object.entries(localStorage).map(([key,value])=>({key,value})));assert.ok(stored.some(({value})=>value.includes('kit-fixture')&&value.includes('DEMO-UNIFORM-L')));
 await page.reload();await page.getByRole('heading',{name:'Оформлення замовлення'}).waitFor();assert.equal(requests.filter(r=>r.action==='restore').length,1);
},{restore:true}));
