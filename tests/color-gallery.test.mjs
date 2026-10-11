// P0 colour gallery (docs/release-hardening/03-DEFECT_REGISTER.md D-01, D-05, D-17): MODEL → COLOR → SIZE → REAL SKU.
// A colour shows only photos it provably owns, otherwise an honest placeholder; the cart gets the SKU of the shown colour.
// Isolated PHP + MySQL fixture on the legacy catalog path (production runs PIM v3 off); images served by Playwright routes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';
import {startSite,php,root} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const img=n=>'https://img.test/'+n+'.png';
const gallery=['olive-1','olive-2','black-1','black-2','black-3'].map(img);
const variant=(sku,color,size,photos,extra={})=>({sku,color,size,size_display:size,price:1000,availability:'in',stock:3,photos,...extra});
const jacket={id:'leg-jacket',slug:'leg-jacket',name:'Куртка тестова',brand:'Тест',category:'Одяг та форма / Куртки',category_path:['Одяг та форма','Куртки'],description:'Тест',photos:gallery,variants:[
 variant('O-M','Олива','M',[img('olive-1'),img('olive-2')]),variant('O-L','Олива','L',[img('olive-1'),img('olive-2')]),
 variant('B-M','Чорний','M',[img('black-1'),img('black-2'),img('black-3')]),variant('B-XL','Чорний','XL',[img('black-1'),img('black-2'),img('black-3')]),
 // PIM fell back to the whole model gallery: ownership unknown → placeholder, never olive/black photos.
 variant('K-M','Койот','M',gallery)]};
const cap={id:'leg-cap',slug:'leg-cap',name:'Кепка тестова',brand:'Тест',category:'Одяг та форма / Головні убори',category_path:['Одяг та форма','Головні убори'],description:'Тест',photos:[img('cap-1')],variants:[variant('C-1','Мультикам','Один розмір',[img('cap-1')])]};

test('server colour ownership: strict subsets only; whole-gallery fallback, foreign or missing photos give an empty list',()=>{
 const r=php(`require '${root}/shop/catalog-lib.php';
  $g=array_map(fn($n)=>['url'=>"/m/$n.webp",'key'=>sha1("https://img.test/$n.png")],['o1','o2','b1']);$v=fn($c,$p)=>['color'=>$c,'data'=>json_encode(['photos'=>array_map(fn($n)=>"https://img.test/$n.png",$p)])];
  echo json_encode([
   'owned'=>shopColorPhotos([$v('Олива',['o1','o2']),$v('Чорний',['b1'])],$g),
   'fallback'=>shopColorPhotos([$v('Олива',['o1','o2']),$v('Койот',['o1','o2','b1'])],$g),
   'foreign'=>shopColorPhotos([$v('Олива',['o1']),$v('Чорний',['zz'])],$g),
   'none'=>shopColorPhotos([$v('Олива',[]),$v('Чорний',['b1'])],$g),
   'union'=>shopColorPhotos([$v('Олива',['o1']),$v('Олива',['o2']),$v('Чорний',['b1'])],$g),
   'single'=>shopColorPhotos([$v('Олива',['o1'])],$g)],JSON_UNESCAPED_UNICODE);`);
 const out=JSON.parse(r.stdout),urls=x=>x.map(p=>p.url);
 assert.deepEqual(urls(out.owned['Олива']),['/m/o1.webp','/m/o2.webp']);assert.deepEqual(urls(out.owned['Чорний']),['/m/b1.webp']);
 assert.deepEqual(out.fallback['Койот'],[],'whole gallery = unknown ownership');assert.deepEqual(urls(out.fallback['Олива']),['/m/o1.webp','/m/o2.webp']);
 assert.deepEqual(out.foreign['Чорний'],[],'a photo outside the gallery is not trusted');
 assert.deepEqual(out.none['Олива'],[]);assert.deepEqual(urls(out.union['Олива']),['/m/o1.webp','/m/o2.webp'],'sizes of one colour share its photos');
 assert.equal(out.single,null,'single-colour products keep the model gallery');
});

async function site(){
 const s=await startSite({enableV3:false});
 for(const p of [jacket,cap])php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${s.site}/auth/bootstrap.php';require_once '${s.site}/api/lib.php';save_product(db(),json_decode(${JSON.stringify(JSON.stringify(p))},true));`);
 return s;
}
async function open(browser,s,{mobile=false}={}){
 const context=await browser.newContext(mobile?{viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:2}:{viewport:{width:1280,height:900}});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Every photo is a distinct tiny PNG; a deliberate delay exposes stale-image and async races.
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=','base64');
 await page.route('https://img.test/**',async r=>{await new Promise(f=>setTimeout(f,r.request().url().includes('black-1')?250:30));r.fulfill({contentType:'image/png',body:png});});
 await page.goto(s.base+'/product/leg-jacket');await page.locator('[data-product-colors] button').first().waitFor();
 return {page,context,errors};
}
// Photos actually shown in the gallery track (image-slot placeholders render <img> without a src).
const slides=page=>page.locator('[data-gal-track] img').evaluateAll(x=>x.map(i=>i.getAttribute('src')).filter(Boolean));
const colour=(page,name)=>page.locator('[data-product-colors] button',{hasText:name});
const counter=page=>page.locator('[data-gal-track]').locator('xpath=..').innerText();

test('legacy product page: colour switch replaces the gallery, resets to the first photo, sizes and cart follow the colour',{skip,timeout:240000},async()=>{
 const s=await site(),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
 try{
  const {page,errors}=await open(browser,s);
  assert.equal(await colour(page,'Олива').getAttribute('aria-pressed'),'true');
  assert.deepEqual(await slides(page),[img('olive-1'),img('olive-2')],'default colour shows only its photos');
  await page.locator('[data-gal-track]').evaluate(t=>t.scrollTo({left:t.clientWidth,behavior:'instant'}));await page.waitForTimeout(200);
  await colour(page,'Чорний').click();
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-gal-track] img')].map(i=>i.getAttribute('src')).join()===['black-1','black-2','black-3'].map(n=>'https://img.test/'+n+'.png').join());
  assert.equal(await colour(page,'Чорний').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('[data-gal-track]').evaluate(t=>t.scrollLeft),0,'the new colour starts at its first photo');
  assert.match(await counter(page),/1 \/ 3/);
  const thumbs=await page.locator('img').evaluateAll(x=>x.map(i=>i.getAttribute('src')).filter(s=>s&&s.includes('img.test')));
  assert.ok(thumbs.every(u=>u.includes('black')),'no olive photo anywhere on the page after switching: '+thumbs.join());
  // Sizes follow the colour: XL exists only in black.
  await page.locator('[data-size-grid]').getByText('XL',{exact:true}).click();
  await page.getByRole('button',{name:/До кошика/}).first().click();
  const cart=await page.evaluate(()=>JSON.parse(localStorage.getItem('rubizh.cart')||'[]'));
  assert.deepEqual(cart.map(l=>l.sku),['B-XL'],'the cart gets the real SKU of the shown colour and size');
  // A colour without confirmed photos shows the honest placeholder, never another colour's photo.
  await page.goto(s.base+'/product/leg-jacket');await page.locator('[data-product-colors] button').first().waitFor();
  await colour(page,'Койот').click();
  await page.getByText('Фото кольору готується').first().waitFor();
  assert.deepEqual(await slides(page),[],'Койот has no confirmed photos');
  assert.equal(await page.locator('[data-size-grid]').getByText('XL',{exact:true}).count(),0,'XL is not offered for Койот');
  // Rapid switching ends on the last choice; the slow black-1 response must not win.
  for(const c of ['Олива','Чорний','Олива'])await colour(page,c).click();
  await page.waitForTimeout(600);
  assert.deepEqual(await slides(page),[img('olive-1'),img('olive-2')]);
  // The chosen colour of one product does not leak into the next product.
  await page.goto(s.base+'/product/leg-cap');await page.waitForFunction(()=>[...document.querySelectorAll('[data-gal-track] img')].some(i=>i.getAttribute('src')?.includes('cap-1')));
  assert.deepEqual(errors,[]);
 }finally{await browser.close();s.stop();}
});

test('mobile 390px touch: tapping a colour swaps photos and keeps the page free of horizontal overflow',{skip,timeout:240000},async()=>{
 const s=await site(),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
 try{
  const {page,errors}=await open(browser,s,{mobile:true});
  await colour(page,'Чорний').tap();
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-gal-track] img')].every(i=>i.getAttribute('src')?.includes('black')));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true,'no horizontal page scroll');
  await colour(page,'Олива').tap();
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-gal-track] img')].every(i=>i.getAttribute('src')?.includes('olive')));
  // The sticky "choose size" action really brings the size grid into view (was a dead selector).
  const inView=()=>page.evaluate(()=>{const r=document.querySelector('[data-size-grid]').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;});
  await page.evaluate(()=>{const g=document.querySelector('[data-size-grid]');window.scrollTo(0,g.getBoundingClientRect().top+scrollY+innerHeight*1.5);});
  await page.waitForTimeout(200);assert.equal(await inView(),false,'precondition: the size grid is off screen');
  await page.locator('[data-mob-buy] [role="button"]').tap();
  await page.waitForFunction(()=>{const r=document.querySelector('[data-size-grid]').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;},null,{timeout:3000});
  assert.deepEqual(errors,[]);
 }finally{await browser.close();s.stop();}
});

// D-21 (legacy, live path): the catalog card previews the colour the product page opens with, not gallery[0].
test('legacy catalog card shows the default colour photo when the first gallery photo belongs to an unavailable colour',{skip,timeout:240000},async()=>{
 const s=await startSite({enableV3:false});const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
 try{
  const coat={...structuredClone(jacket),id:'leg-coat',slug:'leg-coat',name:'Куртка обкладинка',canonical_category_id:'clothing_jackets'};
  for(const v of coat.variants)if(v.color==='Олива')Object.assign(v,{availability:'out',stock:0});
  php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${s.site}/auth/bootstrap.php';require_once '${s.site}/api/lib.php';save_product(db(),json_decode(${JSON.stringify(JSON.stringify(coat))},true));`);
  const {writeFileSync}=await import('node:fs');
  writeFileSync(s.site+'/router.php',`<?php $p=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);if(str_starts_with($p,'/api/')){require __DIR__.'/api/index.php';return;}if($p==='/'||preg_match('~^/(?:product|catalog)(?:/.*)?$~',$p)){require __DIR__.'/storefront.php';return;}return false;`);
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=','base64');
  await page.route('https://img.test/**',r=>r.fulfill({contentType:'image/png',body:png}));
  await page.goto(s.base+'/catalog');const card=page.locator('img[alt="Куртка обкладинка"]').first();await card.waitFor();
  await page.waitForLoadState('networkidle');await page.waitForTimeout(300);
  assert.equal(await card.getAttribute('src'),img('black-1'),'card = first photo of the default (buyable) colour');
  await page.goto(s.base+'/product/leg-coat');await page.locator('[data-product-colors] button').first().waitFor();
  assert.equal(await colour(page,'Чорний').getAttribute('aria-pressed'),'true','the product page opens on the same colour');
 }finally{await browser.close();s.stop();}
});
