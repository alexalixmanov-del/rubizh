import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {startPreview} from '../dev/preview.mjs';
import {slug} from '../dev/fixtures.mjs';
let browser,server,base;
const roots=['Одяг та форма','Взуття','Бронезахист','Шоломи та захист голови',"Тактичний зв'язок та слух",'Рюкзаки, сумки та баули','Підсумки','РПС та розвантаження','Захист колін та ліктів','Тактична медицина','Маскування','Туризм та польове спорядження','Електроніка та спостереження','Освітлення','Автономне живлення','Збройові аксесуари','Захист очей та обличчя','Інструменти та ножі'];
// A long clothing branch catches the previous giant-card layout, unlike the small demo catalog.
const categories=roots.flatMap((name,index)=>[
 {name,path:name,url_path:slug(name),product_count:index===0?60:1},
 ...(index===0?Array.from({length:60},(_,i)=>'Підкатегорія '+i):['Спорядження']).map(sub=>({name:sub,path:name+' / '+sub,url_path:slug(name)+'/'+slug(sub),product_count:1}))
]);
before(async()=>{
 server=await startPreview(0);base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({executablePath:existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined,headless:true,args:['--no-sandbox']});
});
after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve));});
async function pageRun(fn,viewport={width:1440,height:1000}){
 const context=await browser.newContext({viewport});const page=await context.newPage();page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(categories=>{let boot;Object.defineProperty(window,'RUBIZH_BOOT',{get:()=>boot,set:value=>{boot={...value,categories}},configurable:true});},categories);
 try{await fn(page);assert.deepEqual(errors,[]);}finally{await context.close();}
}
async function load(page,path='/categories'){await page.goto(base+path);await page.locator('.rz-directory-card, [data-catalog-section]').first().waitFor();}
test('Long branches keep equal compact cards; native dialog scrolls and closes with keyboard',()=>pageRun(async page=>{
 await load(page);assert.equal(await page.locator('.rz-directory-card').count(),18);
 const banners=await page.locator('.rz-directory-card>a img').evaluateAll(images=>images.map(image=>image.getAttribute('src')));assert.equal(banners.length,18);assert.equal(new Set(banners).size,18);
 await page.locator('.rz-directory-card').last().scrollIntoViewIfNeeded();await page.waitForFunction(()=>[...document.querySelectorAll('.rz-directory-card>a img')].every(image=>image.complete&&image.naturalWidth>0));
 const heights=await page.locator('.rz-directory-card').evaluateAll(cards=>cards.map(card=>card.getBoundingClientRect().height));assert.ok(Math.max(...heights)-Math.min(...heights)<1);assert.ok(Math.max(...heights)<150);
 const clothing=page.locator('.rz-directory-card').filter({has:page.locator('.rz-directory-name',{hasText:'Одяг та форма'})});
 const open=clothing.locator('.rz-directory-expand');await open.click();const dialog=page.locator('dialog[open]');await dialog.waitFor();assert.equal(await dialog.locator('.rz-directory-subcategory').count(),60);
 assert.equal(await page.locator('.rz-directory-card').first().evaluate(card=>card.getBoundingClientRect().height),heights[0]);
 assert.ok(await dialog.evaluate(d=>d.scrollHeight>d.clientHeight));await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
 assert.equal(await open.evaluate(button=>button===document.activeElement),true);await page.waitForFunction(()=>document.documentElement.style.overflow==='');
 await page.getByRole('searchbox',{name:'Знайти категорію'}).fill('Підкатегорія 59');assert.equal(await page.locator('.rz-directory-card').count(),1);
 await page.getByRole('searchbox',{name:'Знайти категорію'}).fill('Немає777');await page.getByRole('button',{name:'Показати всі категорії'}).click();assert.equal(await page.locator('.rz-directory-card').count(),18);
 await open.click();await page.locator('dialog[open] .rz-directory-subcategory').last().click();assert.match(new URL(page.url()).pathname,/pidkatehoriia-59$/);await page.waitForFunction(()=>document.documentElement.style.overflow==='');
}));
test('Catalog category pages have two short rows, correct arrows, and no generic glove fallback',()=>pageRun(async page=>{
 await load(page,'/catalog');assert.equal(await page.locator('[data-catalog-section]').count(),10);assert.equal(await page.getByRole('button',{name:'Попередні категорії'}).isDisabled(),true);
 assert.equal(await page.locator('[data-catalog-section]').filter({hasText:'Одяг та форма'}).locator('img').count(),1);
 assert.equal(await page.locator('[data-catalog-section]').filter({hasText:'Шоломи та захист голови'}).locator('img').count(),1);
 assert.equal(await page.locator('[data-catalog-section] img[src*=category-accessories]').count(),0);
 await page.getByRole('button',{name:'Наступні категорії'}).click();assert.equal(await page.locator('[data-catalog-section]').count(),8);assert.equal(await page.getByRole('button',{name:'Наступні категорії'}).isDisabled(),true);
 await page.getByRole('button',{name:'Попередні категорії'}).click();assert.equal(await page.locator('[data-catalog-section]').count(),10);
 await page.getByRole('combobox',{name:'Сортування товарів'}).selectOption('exp');await page.waitForFunction(()=>new URL(location.href).searchParams.get('sort')==='exp');
 await page.waitForFunction(()=>document.querySelector('[data-card-name]')?.textContent.includes('Плитоноска'));
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.querySelectorAll('[data-catalog-section]').length===4);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.locator('[data-catalog-section]').filter({hasText:'Взуття'}).click();await page.locator('[data-card-name]').filter({hasText:'Берці'}).waitFor();
}));
test('Directory and product grid fit narrow and wide screens in both themes',()=>pageRun(async page=>{
 for(const theme of ['dark','light'])for(const width of [320,390,768,1024,1440]){
  await page.addInitScript(theme=>localStorage.setItem('rubizh.theme',theme),theme);await page.setViewportSize({width,height:900});
  for(const path of ['/categories','/catalog']){await load(page,path);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,theme+' '+width+' '+path);
   if(path==='/categories'){await page.locator('.rz-directory-expand').first().click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.keyboard.press('Escape');}
   else{if(width===1440){const sort=await page.locator('[data-desk-sort]').evaluate(e=>({background:getComputedStyle(e).backgroundColor,display:getComputedStyle(e).display}));assert.equal(sort.background,'rgba(0, 0, 0, 0)');assert.equal(sort.display,'flex');}if(width<700){const photo=await page.locator('[data-catalog-section]').first().evaluate(e=>{const frame=e.querySelector('img').getBoundingClientRect(),card=e.getBoundingClientRect();return {width:frame.width,height:frame.height,cardWidth:card.width}});assert.ok(Math.abs(photo.width-photo.height)<1);assert.ok(photo.width/photo.cardWidth>.97);assert.equal(await page.locator('[data-catalog-section] img').first().evaluate(e=>getComputedStyle(e).objectFit),'cover');}const info=await page.locator('[data-card-info]').first().evaluate(e=>({bg:getComputedStyle(e).backgroundColor,text:getComputedStyle(e.querySelector('[data-card-name]')).color}));assert.equal(info.bg,'rgb(23, 32, 21)');assert.equal(info.text,'rgb(245, 246, 239)');}
  }
 }
}));

test('All supplied banners have optimized assets and exact category assignments',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../docs/category-banners.json',import.meta.url)));assert.equal(manifest.length,117);assert.equal(new Set(manifest.map(row=>row.asset)).size,117);
 for(const row of manifest){assert.ok(existsSync(new URL('..'+row.asset,import.meta.url)));assert.ok(row.bytes<150000);}
 for(const name of roots)assert.equal(manifest.filter(row=>row.category===name).length,1);
});
