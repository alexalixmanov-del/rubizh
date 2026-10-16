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
 const at=sf.indexOf("elseif($uri==='/kit/')");assert.ok(at>0,'the /kit/ route');const kit=sf.slice(at,at+900);
 assert.match(kit,/<meta name="description" content="[^"]*Оберіть речі щонайменше з двох різних розділів — отримаєте ціну комплекту/);
 assert.match(kit,/<p>[^<]*Оберіть речі щонайменше з двох різних розділів — отримаєте ціну комплекту/);
});


// D-62 (SEO): home category cards use clean addresses — a single root opens /catalog/<category>, a group of several roots
// («Бронезахист», «Спорядження») opens its section on /categories (#ac-<slug>); no /catalog?roots=[…] links.
test('D-62: home category cards link to clean addresses; a group opens its section on /categories',()=>withPage(async page=>{
 await open(page,'/');
 const cards=await page.locator('a.rz-category').evaluateAll(a=>a.map(x=>({t:x.getAttribute('aria-label')||x.textContent.trim(),h:x.getAttribute('href')})));
 assert.ok(cards.length>=5,JSON.stringify(cards));
 assert.deepEqual(cards.filter(c=>/[?&]roots=|^\/catalog\?/.test(c.h)),[],'no ?roots= links: '+JSON.stringify(cards));
 assert.equal(cards.find(c=>c.t==='Бронезахист')?.h,'/categories#ac-bronezakhyst');
 assert.equal(cards.find(c=>c.t==='Спорядження')?.h,'/categories#ac-riukzaky-sumky-ta-bauly');
 await page.locator('a.rz-category[aria-label="Бронезахист"]').click();
 await page.waitForURL(u=>new URL(u).pathname==='/categories');await page.locator('#ac-bronezakhyst').waitFor();await page.waitForTimeout(600);
 const top=await page.locator('#ac-bronezakhyst').evaluate(e=>e.getBoundingClientRect().top);
 assert.ok(top>=0&&top<500,'the section is scrolled into view: '+top);
},{width:1440,height:900}));
test('D-62: a direct /categories#ac-… address scrolls to its section',()=>withPage(async page=>{
 await page.goto(base+'/categories#ac-bronezakhyst');await page.locator('#ac-bronezakhyst').waitFor();await page.waitForTimeout(800);
 const top=await page.locator('#ac-bronezakhyst').evaluate(e=>e.getBoundingClientRect().top);
 assert.ok(top>=0&&top<500,'scrolled: '+top);
},{width:390,height:844}));
test('D-62: old /catalog?roots=[…] addresses answer 301 to the clean address (group → /categories#ac-…, one root → /catalog/<url>)',async()=>{
 const {php}=await import('./helpers/site-fixture.mjs');const root=new URL('../',import.meta.url).pathname;
 const code=`require '${root}shop/catalog-lib.php';$c=[['name'=>'Бронезахист','path'=>'Бронезахист','url_path'=>'bronezakhyst'],['name'=>'Шоломи та захист голови','path'=>'Шоломи та захист голови','url_path'=>'shlomy'],['name'=>'Взуття','path'=>'Взуття','url_path'=>'vzuttia']];
  foreach(['["Бронезахист","Шоломи та захист голови"]','["Рюкзаки, сумки та баули","Підсумки","РПС та розвантаження"]','["Взуття"]','["Невідоме"]','not json','[1,2]'] as $r)echo json_encode(shopRootsRedirect($c,$r),JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),"\\n";`;
 const r=php(code);
 assert.deepEqual(r.stdout.trim().split('\n').map(JSON.parse),['/categories#ac-bronezakhyst','/categories#ac-riukzaky-sumky-ta-bauly','/catalog/vzuttia','/categories','/categories','/categories']);
 const {readFileSync}=await import('node:fs');const sf=readFileSync(root+'storefront.php','utf8');
 const hook=sf.slice(sf.indexOf("isset($_GET['roots'])"),sf.indexOf("isset($_GET['roots'])")+400);assert.match(hook,/shopRootsRedirect\(/);assert.match(hook,/header\('Location: '\.\$to,true,301\)/,'storefront.php redirects ?roots= with 301');
 assert.doesNotMatch(readFileSync(root+'sitemap.php','utf8'),/roots=/);
});
test('D-62: over HTTP the old ?roots= addresses answer 301 and the clean category stays indexable',{skip:!process.env.RUBIZH_TEST_MYSQL_SOCKET,timeout:240000},async()=>{
 const {startSite,php}=await import('./helpers/site-fixture.mjs');const {writeFileSync}=await import('node:fs');
 const site=await startSite({enableV3:false});
 try{
  const p={id:'d62-jacket',slug:'d62-jacket',canonical_category_id:'clothing_jackets',name:'Куртка D-62',brand:'QA',category:'Одяг та форма / Куртки',category_path:['Одяг та форма','Куртки'],description:'Тест.',photos:['https://img.test/a.png'],variants:[{sku:'D62-1',color:'Олива',size:'M',size_display:'M',price:1500,availability:'in',stock:2,photos:['https://img.test/a.png']}]};
  php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${site.site}/auth/bootstrap.php';require_once '${site.site}/api/lib.php';save_product(db(),json_decode(${JSON.stringify(JSON.stringify(p))},true));`);
  writeFileSync(site.site+'/router.php',`<?php $p=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);if($p==='/'||preg_match('~^/(?:product|catalog|categories|kit)(?:/.*)?$~',$p)){require __DIR__.'/storefront.php';return;}return false;`);
  const get=q=>fetch(site.base+'/catalog?'+new URLSearchParams(q),{redirect:'manual'});
  let r=await get({roots:JSON.stringify(['Бронезахист','Шоломи та захист голови']),title:'Бронезахист',sort:'stock'});
  assert.equal(r.status,301);assert.equal(r.headers.get('location'),'/categories#ac-bronezakhyst');
  r=await get({roots:JSON.stringify(['Одяг та форма'])});assert.equal(r.status,301);assert.equal(r.headers.get('location'),'/catalog/odiah-ta-forma');
  const clean=await (await fetch(site.base+'/catalog/odiah-ta-forma')).text();
  assert.match(clean,/<link rel="canonical" href="https:\/\/rubizh\.shop\/catalog\/odiah-ta-forma">/);assert.doesNotMatch(clean,/noindex/);
  const cats=await (await fetch(site.base+'/categories')).text();assert.match(cats,/<link rel="canonical" href="https:\/\/rubizh\.shop\/categories">/);
  // One address per page; a single root keeps its other filters; an array-valued roots does not break the redirect.
  r=await fetch(site.base+'/kit',{redirect:'manual'});assert.equal(r.status,301);assert.equal(r.headers.get('location'),'/kit/');
  const kit=await (await fetch(site.base+'/kit/')).text();const kd=(kit.match(/<meta name="description" content="([^"]*)"/)||[])[1]||'';assert.ok(kd.length<=160,'kit description ≤160: '+kd.length);assert.match(kd,/Оберіть речі щонайменше з двох різних розділів — отримаєте ціну комплекту/);
  r=await fetch(site.base+'/categories/',{redirect:'manual'});assert.equal(r.status,301);assert.equal(r.headers.get('location'),'/categories');
  r=await get({roots:JSON.stringify(['Одяг та форма']),sizes:'["M"]',title:'x'});assert.equal(r.status,301);assert.equal(r.headers.get('location'),'/catalog/odiah-ta-forma?sizes=%5B%22M%22%5D');
  r=await fetch(site.base+'/catalog?roots[]=x',{redirect:'manual'});assert.equal(r.status,301);assert.equal(r.headers.get('location'),'/categories');assert.doesNotMatch(await r.text(),/Warning|Notice/);
 }finally{site.stop();}
});

// D-55: touch targets on phones (360–430 px) — every visible interactive element is at least 44 px on its smaller side
// (by padding, the visual stays as it was) and link text is at least 14 px. Exceptions, each with its reason:
const TAP_EXCEPTIONS=[
 // The footer logo link: its zone is 205×50; the small line inside is the logo's tagline, not link text.
 {match:e=>e.cls.includes('rz-footer-brand'),why:'logo link, zone ≥44; tagline is part of the logo'},
];
const tapPages=['/','/catalog','/catalog/odiah-ta-forma','/product/demo-uniform','/kit','/categories'];
for(const width of [360,390,430])test(`D-55: touch targets ≥44 px and link text ≥14 px at ${width} px`,()=>withPage(async page=>{
 const found=[];
 for(const path of tapPages){
  await open(page,path);for(let y=0;y<14000;y+=700){await page.evaluate(y=>scrollTo(0,y),y);await page.waitForTimeout(30);}
  const bad=await page.evaluate(()=>{const out=[];const sel='a[href],button,[role="button"],input:not([type="hidden"]),select,textarea,summary,[tabindex]:not([tabindex="-1"])';
   for(const e of document.querySelectorAll(sel)){const st=getComputedStyle(e);if((e.offsetParent===null&&st.position!=='fixed')||st.visibility==='hidden')continue;
    // A check box or radio is operated through its label: the label is the target.
    const target=(e.matches('input[type="checkbox"],input[type="radio"]')&&e.closest('label'))||e;const r=target.getBoundingClientRect();if(r.width<1||r.height<1)continue;
    const txt=(e.innerText||e.getAttribute('aria-label')||e.value||'').replace(/\s+/g,' ').trim().slice(0,40);const fs=parseFloat(st.fontSize);
    const tooSmall=Math.min(r.width,r.height)<44,tinyText=e.tagName==='A'&&!!(e.innerText||'').trim()&&fs<14;
    if(tooSmall||tinyText)out.push({tag:e.tagName.toLowerCase(),cls:String(e.className?.baseVal??e.className??''),txt,w:Math.round(r.width),h:Math.round(r.height),fs});}
   return out;});
  // Size chips of catalog cards (owner: ~22 px) are inside a tap zone of at least 44 px.
  for(const z of await page.evaluate(()=>[...document.querySelectorAll('[data-card-size]')].filter(e=>e.offsetParent!==null).map(e=>{const t=e.closest('a[href],button,[role="button"]');const r=(t||e).getBoundingClientRect();return {in:!!t,h:Math.round(r.height),txt:e.textContent.trim()};})))if(!z.in||z.h<44)found.push(path+' size chip «'+z.txt+'» zone '+z.h+'px');
  for(const b of bad)if(!TAP_EXCEPTIONS.some(x=>x.match(b)))found.push(path+' '+b.tag+(b.cls?'.'+b.cls.split(' ')[0]:'')+' «'+b.txt+'» '+b.w+'×'+b.h+' '+b.fs+'px');
 }
 assert.deepEqual([...new Set(found)],[],'targets below 44 px or link text below 14 px');
},{width}));
