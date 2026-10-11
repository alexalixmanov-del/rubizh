// ECC ADDENDUM №2, Phases 3–4 (K-1…K-10): kit builder onboarding and usability on the demo preview.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startPreview} from '../dev/preview.mjs';
let browser,server,base;
before(async()=>{server=await startPreview(0);base='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({executablePath:(process.env.CHROMIUM_PATH||'/usr/bin/chromium'),args:['--no-sandbox']});});
after(async()=>{await browser?.close();await new Promise(r=>server?.close(r));});
async function kit(width=1280){
 const context=await browser.newContext({viewport:{width,height:width<768?780:900},...(width<768?{isMobile:true,hasTouch:true}:{})});
 const page=await context.newPage();await page.goto(base+'/kit');await page.locator('.rz-kit-builder').waitFor();await page.waitForTimeout(300);return {page,context};
}
const dialog=page=>page.getByRole('dialog',{name:/Збери свій комплект за 4 кроки/i});

test('K-1: first visit shows the 4-step guide with focus on «Почати збір»; Escape closes it and it is remembered',async()=>{
 const {page,context}=await kit();
 try{
  const d=dialog(page);await d.waitFor();
  const text=await d.innerText();
  for(const s of ['Обирай потрібні речі в одному місці','Вкажи свої параметри','Додай спорядження','Перевір комплект','Перейди до кошика','Необов’язкові розділи можна пропустити'])assert.match(text,new RegExp(s,'i'),s);
  assert.equal(await d.locator('ol li').count(),4);
  assert.match(await page.evaluate(()=>document.activeElement?.innerText||''),/Почати збір/i,'focus starts on the main action');
  for(let i=0;i<6;i++)await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>!!document.activeElement?.closest('[role="dialog"]')),true,'Tab stays inside the guide');
  await page.keyboard.press('Escape');await d.waitFor({state:'detached'});
  assert.equal(await page.evaluate(()=>localStorage.getItem('rubizh.kitIntro')),'1');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.body).overflow!=='hidden'&&getComputedStyle(document.documentElement).overflow!=='hidden'),true,'no scroll lock left');
  await page.reload();await page.locator('.rz-kit-builder').waitFor();await page.waitForTimeout(400);
  assert.equal(await dialog(page).count(),0,'not shown again after a reload');
 }finally{await context.close();}
});

test('K-1: «Як це працює?» reopens the guide; «Пропустити» closes it and returns focus; «Почати збір» leads to step 1',async()=>{
 const {page,context}=await kit();
 try{
  await dialog(page).getByRole('button',{name:/Пропустити/i}).click();await dialog(page).waitFor({state:'detached'});
  const how=page.getByRole('button',{name:/Як це працює\?/i});await how.click();await dialog(page).waitFor();
  await page.keyboard.press('Escape');await dialog(page).waitFor({state:'detached'});
  assert.equal(await page.evaluate(()=>/Як це працює/.test(document.activeElement?.innerText||'')),true,'focus returns to the link');
  await how.click();await dialog(page).getByRole('button',{name:/Почати збір/i}).click();await dialog(page).waitFor({state:'detached'});
  assert.equal(await page.evaluate(()=>!!document.activeElement?.closest('.rz-kit-parameters')),true,'focus moves to «Мої параметри»');
 }finally{await context.close();}
});

test('K-1: on a 360px phone the guide fits, its main button is reachable without covering text, and the page scrolls after closing',async()=>{
 const {page,context}=await kit(360);
 try{
  const d=dialog(page);await d.waitFor();
  const start=d.getByRole('button',{name:/Почати збір/i});await start.scrollIntoViewIfNeeded();
  const b=await start.boundingBox();assert.ok(b.x>=0&&b.x+b.width<=360&&b.height>=48,'button inside the screen '+JSON.stringify(b));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'no horizontal overflow');
  await start.click();await d.waitFor({state:'detached'});
  const y0=await page.evaluate(()=>scrollY);await page.mouse.wheel(0,600);await page.waitForTimeout(300);
  assert.ok(await page.evaluate(()=>scrollY)>y0||await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight),'page scrolls');
 }finally{await context.close();}
});

// Phase 4: a returning visitor (guide already seen) works with the builder itself.
async function builder(width=1280){
 const context=await browser.newContext({viewport:{width,height:900}});await context.addInitScript(()=>localStorage.setItem('rubizh.kitIntro','1'));
 const page=await context.newPage();await page.goto(base+'/kit');await page.locator('.rz-kit-slot').first().waitFor();await page.waitForTimeout(500);return {page,context};
}
const aside=page=>page.locator('[data-kit-aside]');
const money=t=>Number(String(t).replace(/[^\d]/g,''));

test('K-3/K-5/K-6: empty kit says what to do, shows no zero «savings», slots read «Не обрано» and «Необов’язково»',async()=>{
 const {page,context}=await builder();
 try{
  const heads=await page.locator('.rz-kit-slot-head').allInnerTexts();
  for(const h of heads){assert.match(h,/Не обрано/,h);assert.match(h,/Необов’язково/i,h);}
  const a=await aside(page).innerText();
  assert.match(a,/Спочатку додайте хоча б один товар/i);
  assert.doesNotMatch(a,/вигода|Знижка на комплект/i,'no savings line for an empty kit');
  assert.equal(await aside(page).evaluate(e=>[...e.querySelectorAll('*')].some(x=>getComputedStyle(x).textDecorationLine.includes('line-through'))),false,'no struck-through price');
  assert.deepEqual((await page.locator('select[aria-label="Розмір взуття"] option').allInnerTexts())[0],'Оберіть розмір');
 }finally{await context.close();}
});

test('K-3/K-5: chosen items are counted per slot; the summary is «Вартість товарів» → «Знижка на комплект» (only if real) → «Разом»',async()=>{
 const {page,context}=await builder();
 try{
  await page.locator('.rz-kit-rec button').first().click();await page.waitForTimeout(400);
  const body=page.locator('.rz-kit-slot').filter({has:page.locator('.rz-kit-slot-head',{hasText:'Тіло'})});
  assert.match(await body.locator('.rz-kit-slot-head').innerText(),/Обрано: 1 товар(?![а-яіїєґ])/i);
  await page.locator('.rz-kit-rec button').first().click();await page.waitForTimeout(600);
  const a=await aside(page).innerText();
  assert.match(a,/Вартість товарів/);assert.match(a,/Разом/);
  const goods=money(await page.locator('[data-kit-goods]').innerText()),total=money(await page.locator('[data-kit-total]').innerText());
  const discount=await page.locator('[data-kit-discount]').count()?money(await page.locator('[data-kit-discount]').innerText()):0;
  assert.equal(total,goods-discount,'Разом = Вартість товарів − Знижка');
  if(!discount)assert.doesNotMatch(a,/Знижка на комплект|вигода/i,'no zero discount is advertised');
  assert.match(a,/Додати комплект до кошика/i);
 }finally{await context.close();}
});

test('K-2: changing «Мої параметри» never changes an added SKU silently — the item keeps its size and is flagged',async()=>{
 const {page,context}=await builder();
 try{
  await page.locator('.rz-kit-rec button').first().click();await page.waitForTimeout(400);
  const item=page.locator('.rz-kit-item').first(),before=await item.innerText();const size=/Розмір (\S+)/.exec(before)[1];
  const other=['XS','S','M','L','XL'].find(s=>s!==size);
  const params=page.locator('.rz-kit-parameters');if(!await params.count())await page.getByRole('button',{name:/змінити/i}).click();
  await page.locator('.rz-kit-parameters [role="button"]',{hasText:new RegExp('^'+other+'$')}).first().click();await page.waitForTimeout(400);
  const after=await page.locator('.rz-kit-item').first().innerText();
  assert.match(after,new RegExp('Розмір '+size+'(?![\\w])'),'the chosen SKU stays');
  assert.match(after,new RegExp('Розмір відрізняється від ваших параметрів \\('+other+'\\)'));
 }finally{await context.close();}
});

test('K-10: «Потрібна допомога з вибором?» opens the existing picker',async()=>{
 const {page,context}=await builder();
 try{
  await page.getByRole('button',{name:/Потрібна допомога з вибором\?/i}).click();
  await page.getByRole('heading',{name:/Підібрати комплект/i}).waitFor();
 }finally{await context.close();}
});
