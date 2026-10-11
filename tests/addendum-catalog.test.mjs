// ECC ADDENDUM №2, Phase 5 (C-1…C-4): catalog search, empty results, filters with sorting and history, mobile filter panel.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startPreview} from '../dev/preview.mjs';
let browser,server,base;
before(async()=>{server=await startPreview(0);base='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({executablePath:(process.env.CHROMIUM_PATH||'/usr/bin/chromium'),args:['--no-sandbox']});});
after(async()=>{await browser?.close();await new Promise(r=>server?.close(r));});
async function catalog(path,width=1280){
 const context=await browser.newContext({viewport:{width,height:900},...(width<768?{isMobile:true,hasTouch:true}:{})});
 const page=await context.newPage();await page.goto(base+path);await page.locator('[data-store-surface]').waitFor();await page.waitForTimeout(700);return {page,context};
}
const cards=page=>page.locator('[data-card-name]').count();

test('C-4: spaces around a query do not change the result; letter case does not matter',async()=>{
 const counts=[];
 for(const q of ['костюм','  костюм  ','КОСТЮМ']){const {page,context}=await catalog('/catalog?q='+encodeURIComponent(q));try{counts.push(await cards(page));}finally{await context.close();}}
 assert.ok(counts[0]>0);assert.deepEqual(counts,[counts[0],counts[0],counts[0]]);
});

test('C-4: a search without results explains it once and offers the whole catalog',async()=>{
 const {page,context}=await catalog('/catalog?q='+encodeURIComponent('zzzнемаєтакого'));
 try{
  const body=await page.locator('body').innerText();
  assert.match(body,/Нічого не знайшли за запитом «zzzнемаєтакого»/i,'search-specific explanation');
  assert.match(body,/Перевірте написання/);
  assert.doesNotMatch(body,/За такими фільтрами нічого немає/,'no contradictory filter message for a search');
  await page.getByRole('button',{name:/Увесь каталог/i}).click();await page.waitForTimeout(600);
  assert.ok(await cards(page)>0,'the whole catalog is shown again');
 }finally{await context.close();}
});

test('C-3: a filter survives sorting and the browser back button restores the previous page',async()=>{
 const {page,context}=await catalog('/catalog');
 try{
  const all=await cards(page);
  await page.locator('[data-desk-filters], aside').first().getByText('Взуття',{exact:true}).click();await page.waitForTimeout(600);
  const filtered=await cards(page);assert.ok(filtered>0&&filtered<all,'filter applied: '+filtered+'/'+all);
  const url=page.url();
  await page.locator('select').filter({has:page.locator('option',{hasText:'Дешевші спочатку'})}).first().selectOption({label:'Дешевші спочатку'});await page.waitForTimeout(600);
  assert.equal(await cards(page),filtered,'sorting keeps the filter');
  assert.match(page.url(),new RegExp(url.split('?')[0].replace(/[.*+?^${}()|[\]\\]/g,'\\$&')),'the category stays in the URL');
  // Sorting refines the same page; Back returns to the page before the filter with its full list.
  await page.goBack();await page.waitForTimeout(600);
  assert.equal(await cards(page),all,'back restores the unfiltered list');
 }finally{await context.close();}
});

test('C-3: on a phone the filter panel shows «Показати N товарів» and «Скинути», and the page scrolls after it closes',async()=>{
 const {page,context}=await catalog('/catalog',390);
 try{
  await page.getByRole('button',{name:/^Фільтри/}).first().click();
  const show=page.getByRole('button',{name:/Показати \d+ товар/});await show.waitFor();
  assert.ok(await page.getByRole('button',{name:/^Скинути$/}).count()>0);
  await show.click();await page.waitForTimeout(400);
  assert.equal(await page.evaluate(()=>getComputedStyle(document.body).position!=='fixed'&&getComputedStyle(document.documentElement).overflow!=='hidden'),true,'no scroll lock left');
  const y=await page.evaluate(()=>scrollY);await page.mouse.wheel(0,500);await page.waitForTimeout(300);assert.ok(await page.evaluate(()=>scrollY)>y);
 }finally{await context.close();}
});
