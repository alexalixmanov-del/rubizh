// Stage 4.1 (owner, block 4-SITE D-55…D-64): storefront fixes, regression-first, on the preview storefront.
import {test,before,after} from 'node:test';import assert from 'node:assert/strict';import {existsSync} from 'node:fs';
import {chromium} from 'playwright';import {startPreview} from '../dev/preview.mjs';import {kitGuideSeen} from './helpers/visitor.mjs';
let browser,server,base;
before(async()=>{server=await startPreview(0);base='http://127.0.0.1:'+server.address().port;const exe=process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);browser=await chromium.launch({executablePath:exe,headless:true,args:['--no-sandbox']});});
after(async()=>{await browser?.close();await new Promise(r=>server?.close(r));});
async function withPage(run,{width=390,height=844,theme='light'}={}){
 const ctx=await browser.newContext({viewport:{width,height},colorScheme:theme});await ctx.addInitScript(kitGuideSeen);await ctx.addInitScript(t=>{try{localStorage.setItem('rubizh.theme',t);}catch{}},theme);
 const page=await ctx.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{await run(page);assert.deepEqual(errors,[],'no uncaught browser errors');}finally{await ctx.close();}
}
async function open(page,path){await page.goto(base+path);await page.locator('[data-store-surface]').first().waitFor();await page.waitForTimeout(300);}

// D-56: one wording for the size call to action (sticky and main button); the model code is shown once, with «Копіювати».
test('D-56: product page — sticky and main size buttons say «Оберіть розмір»; model code shown once with a copy button',()=>withPage(async page=>{
 await open(page,'/product/demo-uniform');
 const labels=await page.evaluate(()=>[...document.querySelectorAll('[role="button"],button')].filter(e=>e.offsetParent!==null).map(e=>e.textContent.replace(/\s+/g,' ').trim()).filter(t=>/розмір$/i.test(t)));
 assert.ok(labels.length>=2,'sticky and main size buttons are visible: '+JSON.stringify(labels));
 assert.deepEqual([...new Set(labels.map(t=>t.toLowerCase()))],['оберіть розмір'],'one wording: '+JSON.stringify(labels));
 const sku=(await page.locator('[data-product-sku]').first().innerText()).trim();
 const shown=await page.evaluate(sku=>[...document.querySelectorAll('body *')].filter(e=>e.offsetParent!==null&&e.children.length===0&&e.textContent.includes(sku)).length,sku);
 assert.equal(shown,1,'model code '+sku+' is shown once');
 assert.equal(await page.getByRole('button',{name:/Копіювати/}).count(),1,'one copy button');
}));

// D-57: headings with an accent word keep a space after the sentence end — visually (a hidden <br> on phones) and in the
// text read by search engines and screen readers.
for(const width of [360,1440])test(`D-57: home headings at ${width} px have a space after «.», «?», «!»`,()=>withPage(async page=>{
 await open(page,'/');
 const bad=await page.evaluate(()=>[...document.querySelectorAll('h1,h2,h3')].flatMap(h=>[h.innerText,h.textContent].map(t=>t.replace(/\s+/g,' ').trim()).filter(t=>/[.?!][^\s\d.?!»"')]/.test(t))));
 assert.deepEqual(bad,[],'joined after a sentence end: '+JSON.stringify(bad));
},{width}));

// D-58: one sequential numbering of the home sections («NN / …»): no number twice, in order.
test('D-58: home section numbers are sequential and unique',()=>withPage(async page=>{
 await open(page,'/');
 const nums=await page.evaluate(()=>[...document.querySelectorAll('main a, main div, main span, main p')].filter(e=>e.children.length===0||e.childElementCount===1).map(e=>e.textContent.replace(/\s+/g,' ').trim()).map(t=>(t.match(/^(\d{2}) \/ /)||[])[1]).filter(Boolean).map(Number));
 assert.ok(nums.length>=3,'numbered sections: '+nums);
 assert.deepEqual(nums,nums.map((_,i)=>i+1),'numbers 1..N in order, no repeats: '+nums.join(','));
}));

// D-59: «Свій комплект» on a phone — up to 480 px the title and the note stack instead of squeezing the note into a narrow
// column of two or three words per line.
for(const width of [360,390,430,480])test(`D-59: «Свій комплект» block stacks at ${width} px`,()=>withPage(async page=>{
 await open(page,'/');await page.locator('.rz-discount').scrollIntoViewIfNeeded();
 const m=await page.evaluate(()=>{const d=document.querySelector('.rz-discount'),sp=d.querySelector('span'),s=d.querySelector('strong').getBoundingClientRect(),t=sp.getBoundingClientRect();return {strongBottom:s.bottom,spanTop:t.top,lines:Math.round(t.height/parseFloat(getComputedStyle(sp).lineHeight))};});
 assert.ok(m.spanTop>=m.strongBottom-1,'note below the title: '+JSON.stringify(m));
 assert.ok(m.lines<=2,'the note keeps its two lines (not two or three words per line): '+JSON.stringify(m));
},{width}));
test('D-59: on a desktop the block stays in one row',()=>withPage(async page=>{
 await open(page,'/');const m=await page.evaluate(()=>{const d=document.querySelector('.rz-discount'),s=d.querySelector('strong').getBoundingClientRect(),t=d.querySelector('span').getBoundingClientRect();return {sameRow:t.left>=s.right-1};});
 assert.equal(m.sameRow,true);
},{width:1440,height:900}));

// D-60: in the dark theme the background under product photos is the theme's card token, not the light #F0EFE9 plate
// (catalog, category, product, kit constructor); the photos themselves are unchanged; the light theme keeps its plate.
const lightPlates=['rgb(240, 239, 233)','rgb(239, 238, 233)'];// --photo-bg #F0EFE9 and the catalog tile rule #EFEEE9
const plates=page=>page.evaluate(c=>[...document.querySelectorAll('body *')].filter(e=>e.offsetParent!==null&&c.includes(getComputedStyle(e).backgroundColor)).length,lightPlates);
for(const path of ['/catalog','/catalog/odiah-ta-forma','/product/demo-uniform','/kit'])test(`D-60: dark theme ${path} has no light photo plate`,()=>withPage(async page=>{
 await open(page,path);await page.waitForTimeout(400);
 assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');
 assert.equal(await plates(page),0,'light plates under photos in the dark theme');
},{theme:'dark'}));
test('D-60: the light theme keeps the light plate under catalog photos',()=>withPage(async page=>{
 await open(page,'/catalog');assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'light');assert.ok(await plates(page)>0);
},{theme:'light'}));

// D-63: no console warnings on the storefront pages of the matrix (template expressions such as {{ areaQty }} are not
// left in the value attribute of the source markup, where a number field cannot parse them).
for(const path of ['/','/catalog','/catalog/odiah-ta-forma','/product/demo-uniform','/kit'])test(`D-63: ${path} logs no console warnings or errors`,()=>withPage(async page=>{
 const logs=[];page.on('console',m=>{if(['warning','error'].includes(m.type()))logs.push(m.type()+': '+m.text().slice(0,160));});
 await open(page,path);await page.waitForTimeout(500);
 assert.deepEqual(logs,[]);
}));
test('D-63: no template expression in a value attribute of the source markup',async()=>{
 const {readFileSync}=await import('node:fs');const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.deepEqual(html.match(/<input[^>]*type="number"[^>]*\svalue="\{\{[^>]*>/g)||[],[]);
});

// D-64: the kit page promises what Q-8 K1/K3 actually do — no percentage «by the number of positions».
test('D-64: «кількості позицій» appears nowhere in the storefront, templates, offer or e-mails; /kit says the Q-8 rule',async()=>{
 const {readFileSync,readdirSync}=await import('node:fs');const root=new URL('../',import.meta.url);
 const html=readFileSync(new URL('index.html',root),'utf8');
 const live=[...html.matchAll(/(?:src|href)="\/(assets\/[^"?]+\.(?:js|css))/g)].map(m=>m[1]);
 const files=['index.html','storefront.php','offer.html','privacy.html',...live,...readdirSync(new URL('auth/',root)).filter(f=>f.endsWith('.php')).map(f=>'auth/'+f),...readdirSync(new URL('shop/',root)).filter(f=>f.endsWith('.php')).map(f=>'shop/'+f)];
 const hits=files.filter(f=>{try{return /кількост[іи] (?:окремих |різних )?позиці/i.test(readFileSync(new URL(f,root),'utf8'));}catch{return false;}});
 assert.deepEqual(hits,[],'old «by the number of positions» wording');
 const sf=readFileSync(new URL('storefront.php',root),'utf8');
 const kit=sf.slice(sf.indexOf("['/kit','/kit/']"),sf.indexOf("['/kit','/kit/']")+900);
 assert.match(kit,/<meta name="description" content="[^"]*Оберіть речі щонайменше з двох різних розділів — отримаєте ціну комплекту/);
 assert.match(kit,/<p>[^<]*Оберіть речі щонайменше з двох різних розділів — отримаєте ціну комплекту/);
});

