// Stage 4.1 (owner OD-4.6): the full wholesale request — storefront form (real submit button, honeypot, thank-you screen
// with the number, limits) and the CRM side (statuses нова / в роботі / КП надіслано / закрита, assignment, comments,
// audit, an order created from the request through the SITE order service, masked phone).
import {test} from 'node:test';import assert from 'node:assert/strict';import {chromium} from 'playwright';
import {startCrm,line,staffEmail} from './helpers/crm-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const rid=()=>crypto.randomUUID().replaceAll('-','');
const valid={name:'Ігор',phone:'067 123 45 67',buyer_type:'MILITARY',tax_id:'',email:'',kits:'2',composition:'Куртка Softshell M ×2',priority:'DONATION',consent:true};

test('OD-4.6 storefront: honeypot, thank-you message with the number, per-address limit',{skip,timeout:240000},async()=>{
 const s=await startCrm();
 try{
  const c=await s.get('/shop/customer.php'),cookie=c.headers.get('set-cookie').split(';')[0],csrf=c.data.csrf;const send=b=>s.post('/shop/wholesale-request.php',{csrf,...b},{Cookie:cookie});
  const trap=await send({...valid,request_id:rid(),rz_check:'http://spam.example'});assert.equal(trap.status,400,'a filled honeypot is refused');
  assert.equal(+s.sql('SELECT COUNT(*) n FROM rubizh_wholesale_requests')[0].n,0,'nothing stored from the honeypot');
  const ok=await send({...valid,request_id:rid(),rz_check:''});assert.equal(ok.status,200,JSON.stringify(ok.data));
  assert.match(ok.data.message,/^Дякуємо, заявка № WS-\d{6}-[0-9A-F]{6} прийнята\. Менеджер зв’яжеться з вами протягом робочого дня\.$/);
  let limited=0;for(let i=0;i<12&&!limited;i++){const r=await send({...valid,request_id:rid()});if(r.status===429)limited=i;}
  assert.ok(limited>0,'the per-address limit answers 429');
 }finally{s.stop();}
});

test('OD-4.6 CRM: four statuses, assignment, comments, audit; order from the request via the SITE order service; masked phone',{skip,timeout:300000},async()=>{
 const s=await startCrm();
 try{
  const c=await s.get('/shop/customer.php'),cookie=c.headers.get('set-cookie').split(';')[0],csrf=c.data.csrf;
  const sent=await s.post('/shop/wholesale-request.php',{csrf,...valid,request_id:rid()},{Cookie:cookie});assert.equal(sent.status,200);
  const ws=s.sql("SELECT * FROM rubizh_wholesale_requests WHERE number='"+sent.data.number+"'")[0];
  const manager=await s.login('MANAGER'),owner=await s.login('OWNER');
  const idOf=role=>s.sql("SELECT id FROM rubizh_staff_users WHERE email='"+staffEmail(role)+"'")[0].id;const managerId=idOf('MANAGER');
  // Statuses: exactly нова / в роботі / КП надіслано / закрита.
  for(const old of ['QUOTED','WON','LOST'])assert.equal((await manager.send('/wholesale/'+ws.id,{state:old})).status,400,old+' is not a status any more');
  let r=await manager.send('/wholesale/'+ws.id,{state:'IN_PROGRESS',assignee:managerId});assert.equal(r.status,200,JSON.stringify(r.data));
  assert.equal(r.data.data.state,'IN_PROGRESS');assert.equal(r.data.data.assignee?.id,managerId);
  assert.equal((await manager.send('/wholesale/'+ws.id,{state:'IN_PROGRESS',assignee:idOf('WAREHOUSE')})).status,400,'only OWNER/MANAGER can be assigned');
  r=await manager.send('/wholesale/'+ws.id,{state:'QUOTE_SENT'});assert.equal(r.status,200);assert.equal(r.data.data.assignee?.id,managerId,'assignment kept when not sent');
  // Comments.
  const note=await manager.send('/wholesale/'+ws.id+'/note',{body:'Надіслав КП на пошту',request_id:rid()});assert.equal(note.status,201,JSON.stringify(note.data));
  const detail=await manager.get('/wholesale/'+ws.id);assert.equal(detail.status,200,JSON.stringify(detail.data));
  assert.equal(detail.data.data.notes[0].body,'Надіслав КП на пошту');assert.ok(detail.data.data.history.some(h=>h.action==='wholesale.update'));
  assert.ok(!('phone' in detail.data.data.request)&&/\*/.test(detail.data.data.request.phone_masked),'masked phone in the card');
  // List: masked phone, status, assignee.
  const list=(await manager.get('/wholesale')).data.data.rows;const row=list.find(x=>x.id===+ws.id);
  assert.ok(row&&!('phone' in row)&&/\*/.test(row.phone_masked));assert.equal(row.state,'QUOTE_SENT');assert.equal(row.assignee?.id,managerId);
  // Order from the request: customer from the request, lines validated by the SITE order service.
  const delivery={type:'branch',city_ref:s.ref(10),warehouse_ref:s.ref(20)};
  const bad=await manager.send('/wholesale/'+ws.id+'/order',{lines:[{...line(),sku:'NO-SUCH-SKU'}],delivery,payment:'invoice',recipient:'Ігор Петренко',request_id:rid()});assert.ok(bad.status>=400&&bad.status<500,'invalid line refused: '+bad.status);
  // The total is confirmed from the server's quote first (as for a telephone order: the price only from the server).
  const body={lines:[{...line(),qty:2}],delivery,payment:'invoice',recipient:'Ігор Петренко'};
  const quote=await manager.send('/wholesale/'+ws.id+'/order',{...body,request_id:rid()});assert.equal(quote.data.error?.code,'PRICE_CHANGED',JSON.stringify(quote.data).slice(0,300));
  assert.equal(+s.sql('SELECT COUNT(*) n FROM rubizh_wholesale_requests WHERE id='+ws.id+' AND order_id IS NOT NULL')[0].n,0,'no order before the total is confirmed');
  const okey=rid();const ord=await manager.send('/wholesale/'+ws.id+'/order',{...body,expected_total_minor:Math.round(quote.data.error.details.quote.total*100),request_id:okey});assert.equal(ord.status,201,JSON.stringify(ord.data).slice(0,400));
  const orderId=ord.data.data.id;const o=s.sql('SELECT * FROM rubizh_customer_orders WHERE id='+orderId)[0];const d=JSON.parse(s.sql('SELECT contact_json FROM rubizh_order_details WHERE order_id='+orderId)[0].contact_json);
  assert.equal(d.name,'Ігор');assert.equal(d.phone,'+380671234567','the request phone, not typed by the manager');assert.ok(+o.total>0);
  assert.equal(+s.sql('SELECT order_id FROM rubizh_wholesale_requests WHERE id='+ws.id)[0].order_id,orderId,'the request is linked to its order');
  assert.equal((await manager.send('/wholesale/'+ws.id+'/order',{...body,expected_total_minor:Math.round(quote.data.error.details.quote.total*100),request_id:okey})).data.data.id,orderId,'a repeated attempt returns the same order');
  assert.equal((await manager.send('/wholesale/'+ws.id+'/order',{lines:[line()],delivery,payment:'invoice',recipient:'Ігор Петренко',request_id:rid()})).status,409,'one order per request');
  assert.equal((await manager.send('/wholesale/'+ws.id+'/order',{lines:[line()],delivery,payment:'invoice'})).status,400,'an order needs the per-attempt key');
  const audit=s.sql("SELECT action FROM rubizh_staff_audit WHERE entity='wholesale' AND entity_id='"+ws.id+"' ORDER BY id").map(x=>x.action);
  for(const a of ['wholesale.update','note.append','wholesale.order'])assert.ok(audit.includes(a),'audit '+a+': '+audit.join(','));
  // Review of stage 4.1: an order created but not linked (a failed attempt) is found again by a retry with another key.
  s.sql('UPDATE rubizh_wholesale_requests SET order_id=NULL WHERE id='+ws.id);
  const relinked=await manager.send('/wholesale/'+ws.id+'/order',{...body,expected_total_minor:Math.round(quote.data.error.details.quote.total*100),request_id:rid()});
  assert.equal(relinked.data.data?.id,orderId,'no second order: '+JSON.stringify(relinked.data).slice(0,200));assert.equal(+s.sql('SELECT order_id FROM rubizh_wholesale_requests WHERE id='+ws.id)[0].order_id,orderId);
  // Old states from schema v2/v3 move to the four statuses on migration.
  s.sql("UPDATE rubizh_wholesale_requests SET state='WON' WHERE id="+ws.id);
  const {php}=await import('./helpers/site-fixture.mjs');php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${s.site}/auth/bootstrap.php';require_once '${s.site}/staff/auth.php';crmMigrate(shopStoreDatabase());`);
  assert.equal(s.sql('SELECT state FROM rubizh_wholesale_requests WHERE id='+ws.id)[0].state,'CLOSED','WON → CLOSED');
  r=await owner.send('/wholesale/'+ws.id,{state:'CLOSED'});assert.equal(r.status,200);assert.equal(r.data.data.state,'CLOSED');
  for(const role of ['WAREHOUSE','SUPPORT','ACCOUNTANT']){const a=await s.login(role);assert.equal((await a.get('/wholesale/'+ws.id)).status,403,role);assert.equal((await a.send('/wholesale/'+ws.id+'/note',{body:'x',request_id:rid()})).status,403,role);}
 }finally{s.stop();}
});

test('OD-4.6 storefront form: a real form with a submit button «Надіслати запит», a hidden honeypot and a thank-you screen',{skip,timeout:240000},async()=>{
 // A plain-http stand: session cookies without Secure, as a browser needs them here.
 const s=await startCrm({extraConfig:",'staging_allow_loopback'=>true"});const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto(s.base+'/');await page.locator('#b2b-form').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('#b2b-form').evaluate(e=>e.tagName),'FORM');
  const submit=page.locator('#b2b-form button[type="submit"]');assert.equal(await submit.count(),1);assert.equal((await submit.innerText()).trim().toLowerCase(),'надіслати запит');
  const hp=page.locator('#b2b-form input[name="rz_check"]');assert.equal(await hp.count(),1);assert.equal(await hp.getAttribute('tabindex'),'-1');const box=await hp.boundingBox();assert.ok(!box||box.x+box.width<=0,'honeypot is off screen for people: '+JSON.stringify(box));assert.equal(await hp.evaluate(e=>e.closest('[aria-hidden="true"]')),null,'not focusable inside aria-hidden');assert.match(await hp.evaluate(e=>e.closest('label').textContent),/Залиште це поле порожнім/,'a person who reaches it is told to leave it empty');
  // An error is shown at the form and focused (not only in the page-level alert).
  await submit.click();const err=page.locator('#b2b-form [data-b2b-error]');await err.waitFor();assert.match(await err.innerText(),/ім’я/i);
  await page.waitForFunction(()=>document.activeElement?.matches('[data-b2b-error]'));
  await page.getByRole('button',{name:'Військова частина'}).click();await page.getByLabel('Ім’я',{exact:true}).fill('Ігор');await page.getByLabel('Телефон',{exact:true}).fill('+380671234567');
  await page.getByLabel('Склад замовлення').fill('Куртка Softshell M ×2');await page.getByLabel('Згода на обробку персональних даних').check();
  await submit.click();
  const thanks=page.getByRole('status').filter({hasText:/Дякуємо, заявка № WS-\d{6}-[0-9A-F]{6} прийнята/});await thanks.waitFor({timeout:15000});
  await page.waitForFunction(()=>document.activeElement?.matches('[data-b2b-thanks]'),null,{timeout:5000});
  assert.equal(await page.getByLabel('Ім’я',{exact:true}).count(),0,'the form is replaced by the thank-you screen');
  assert.equal(s.sql('SELECT buyer_type FROM rubizh_wholesale_requests ORDER BY id DESC LIMIT 1')[0].buyer_type,'MILITARY');
 }finally{await browser.close();s.stop();}
});

test('OD-4.6 CRM screen: status and assignee, a comment, then an order from the request through «Нове замовлення»',{skip,timeout:400000},async()=>{
 const {password}=await import('./helpers/crm-fixture.mjs');
 const s=await startCrm({frontend:true,npMock:true,stock:50,extraConfig:",'staging_allow_loopback'=>true"});const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const c=await s.get('/shop/customer.php'),cookie=c.headers.get('set-cookie').split(';')[0],csrf=c.data.csrf;
  const sent=await s.post('/shop/wholesale-request.php',{csrf,...valid,request_id:rid()},{Cookie:cookie});assert.equal(sent.status,200);const number=sent.data.number;
  const ws=s.sql("SELECT id FROM rubizh_wholesale_requests WHERE number='"+number+"'")[0];
  const p=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(s.base+'/crm/');await p.getByLabel('Email').fill(staffEmail('MANAGER'));await p.getByLabel('Пароль',{exact:true}).fill(password);await p.getByRole('button',{name:'Увійти'}).click();await p.getByRole('navigation',{name:'Основне'}).first().waitFor();
  await p.goto(s.base+'/crm/customers?segment=WHOLESALE');const row=p.getByRole('row').filter({hasText:number});await row.waitFor();
  assert.match(await row.innerText(),/\*/,'masked phone in the list');assert.match(await row.innerText(),/Нова/);
  await row.getByRole('button',{name:'Відкрити'}).click();const dlg=p.getByRole('dialog');
  await dlg.getByLabel('Статус').selectOption('IN_PROGRESS');await dlg.getByLabel('Відповідальний').selectOption({label:'MANAGER'});await dlg.getByRole('button',{name:'Зберегти'}).click();
  await p.getByRole('row').filter({hasText:number}).getByText('В роботі').waitFor();
  await p.getByRole('row').filter({hasText:number}).getByRole('button',{name:'Відкрити'}).click();
  await dlg.getByLabel('Новий коментар').fill('Уточнив розміри телефоном');await dlg.getByRole('button',{name:'Додати коментар'}).click();await dlg.getByText('Уточнив розміри телефоном').waitFor();
  await dlg.getByRole('link',{name:'Створити замовлення'}).click();await p.getByRole('heading',{name:'Замовлення із заявки '+number}).waitFor();
  await p.getByLabel('Модель або SKU').fill('RUB-F0001');await p.locator('.cmdk-item').first().click();
  const color=p.getByLabel('Колір');if(await color.count()){await p.waitForTimeout(500);const opts=await color.locator('option').evaluateAll(os=>os.map(o=>o.value).filter(Boolean));if(opts.length)await color.selectOption(opts[0]);}
  await p.getByLabel('Розмір').waitFor({timeout:10000});{const opts=await p.getByLabel('Розмір').locator('option').evaluateAll(os=>os.map(o=>o.value).filter(Boolean));await p.getByLabel('Розмір').selectOption(opts.includes('RUB-F0001')?'RUB-F0001':opts[0]);}
  await p.getByRole('button',{name:'Додати'}).click();
  await p.getByLabel('Місто').fill('Київ');await p.locator('.cmdk-item').filter({hasText:'Київ'}).first().click();
  await p.getByLabel('Відділення').locator('option').nth(1).waitFor({state:'attached',timeout:15000});const wh=await p.getByLabel('Відділення').locator('option').evaluateAll(os=>os.map(o=>o.value).filter(Boolean));await p.getByLabel('Відділення').selectOption(wh[0]);
  assert.equal(await p.getByLabel('Телефон (+380…)').count(),0,'the phone comes from the request');
  await p.getByLabel('Ім’я та прізвище одержувача').fill('Ігор Петренко');
  await p.getByRole('button',{name:'Перевірити суму'}).click();await p.getByRole('button',{name:'Створити замовлення'}).click();
  await p.getByRole('heading',{level:1}).filter({hasText:/^RB-/}).waitFor({timeout:20000});const orderId=+p.url().split('/').pop();
  assert.equal(+s.sql('SELECT order_id FROM rubizh_wholesale_requests WHERE id='+ws.id)[0].order_id,orderId);
  assert.equal(JSON.parse(s.sql('SELECT contact_json FROM rubizh_order_details WHERE order_id='+orderId)[0].contact_json).phone,'+380671234567');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();s.stop();}
});
