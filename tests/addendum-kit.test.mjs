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
