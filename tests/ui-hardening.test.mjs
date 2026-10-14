// Release hardening UI (docs/release-hardening/03-DEFECT_REGISTER.md D-06, D-07, D-08) on the demo preview:
// recently viewed persists, is newest-first without duplicates, uses compact 4:5 contain cards; categories swipe on phones.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startPreview} from '../dev/preview.mjs';
let browser,server,base;
before(async()=>{server=await startPreview(0);base='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({executablePath:(process.env.CHROMIUM_PATH||'/usr/bin/chromium'),args:['--no-sandbox']});});
after(async()=>{await browser?.close();await new Promise(r=>server?.close(r));});
const names={uniform:'Демо · Тактичний костюм ММ14',pants:'Демо · Тактичні штани Ripstop',boots:'Демо · Берці демісезонні',armor:'Демо · Плитоноска',backpack:'Демо · Тактичний рюкзак 35 л',camo:'Демо · Маскувальна сітка',med:'Демо · Аптечка IFAK'};
async function visit(page,id){await page.goto(base+'/product/demo-'+id);await page.locator('[data-store-surface]').waitFor();await page.getByRole('heading',{name:names[id]}).first().waitFor();await page.waitForTimeout(150);}
const seen=page=>page.locator('[data-seen-card] .rz-seen-name').allTextContents();// names are uppercased by CSS only
const noPageOverflow=page=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1);

test('recently viewed: survives reloads, newest first, one card per model, compact 4:5 contain cards that never stretch',async()=>{
 const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();
 try{
  await visit(page,'uniform');assert.equal(await page.locator('[data-seen-card]').count(),0,'0 other products → no block');
  await visit(page,'pants');assert.deepEqual(await seen(page),[names.uniform]);
  const one=await page.locator('[data-seen-card]').first().boundingBox();assert.ok(one.width<=200,'a single card is not stretched: '+one.width);
  await visit(page,'boots');await visit(page,'armor');
  assert.deepEqual(await seen(page),[names.boots,names.pants,names.uniform],'newest first, every visit was a full page load (localStorage)');
  await visit(page,'pants');await visit(page,'med');
  assert.deepEqual(await seen(page),[names.pants,names.armor,names.boots,names.uniform],'a revisit moves the model to the front without a duplicate');
  const cards=await page.locator('[data-seen-card]').evaluateAll(x=>x.map(c=>{const p=c.querySelector('[data-seen-photo]').getBoundingClientRect(),img=c.querySelector('img');return {w:c.getBoundingClientRect().width,ratio:p.height/p.width,fit:img?getComputedStyle(img).objectFit:'none'};}));
  for(const c of cards){assert.ok(c.w>=140&&c.w<=200,'compact width '+c.w);assert.ok(Math.abs(c.ratio-1.25)<0.03,'4:5 photo box '+c.ratio);assert.equal(c.fit,'contain');}
  for(const id of ['backpack','camo','uniform'])await visit(page,id);
  const many=await seen(page);assert.equal(many.length,6,'6 other products are all listed');assert.equal(new Set(many).size,many.length);
  assert.equal(many[0],names.camo);
  assert.deepEqual(JSON.parse(await page.evaluate(()=>localStorage.getItem('rubizh.seen'))).slice(0,3),['demo-uniform','demo-camo','demo-backpack']);
  await page.locator('[data-seen-card] [data-seen-photo]').first().click();await page.getByRole('heading',{name:names.camo}).first().waitFor();
  assert.equal(new URL(page.url()).pathname,'/product/demo-camo','a card opens its product');
  assert.equal(await noPageOverflow(page),true);
 }finally{await context.close();}
});

test('recently viewed on a 390px phone is a touch carousel with snap and no page overflow; broken storage is tolerated',async()=>{
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),page=await context.newPage();
 try{
  await page.addInitScript(()=>{try{if(!sessionStorage.getItem('seeded')){localStorage.setItem('rubizh.seen','{not json');sessionStorage.setItem('seeded','1');}}catch{}});
  await visit(page,'uniform');
  for(const id of ['pants','boots','armor','backpack'])await visit(page,id);
  const grid=page.locator('[data-seen-grid]');
  const css=await grid.evaluate(g=>({display:getComputedStyle(g).display,overflow:getComputedStyle(g).overflowX,snap:getComputedStyle(g).scrollSnapType,scrollable:g.scrollWidth>g.clientWidth}));
  assert.equal(css.display,'flex');assert.equal(css.overflow,'auto');assert.match(css.snap,/x/);assert.equal(css.scrollable,true);
  const w=(await page.locator('[data-seen-card]').first().boundingBox()).width;assert.ok(w>=125&&w<=175,'phone card width '+w);
  assert.equal(await noPageOverflow(page),true);
 }finally{await context.close();}
});

for(const width of [360,390,430])test(`categories at ${width}px: horizontal swipe carousel with snap and a peeking next card, no page overflow`,async()=>{
 const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:true}),page=await context.newPage();
 try{
  await page.goto(base+'/');await page.locator('.rz-category-grid .rz-category').first().waitFor();
  const m=await page.locator('.rz-category-grid').evaluate(g=>{const r=g.getBoundingClientRect(),cards=[...g.children].map(c=>c.getBoundingClientRect());return {display:getComputedStyle(g).display,snap:getComputedStyle(g).scrollSnapType,scrollable:g.scrollWidth>g.clientWidth,right:r.right,cards:cards.map(c=>({left:c.left,right:c.right,width:c.width,height:c.height}))};});
  assert.equal(m.display,'flex');assert.match(m.snap,/x\s+mandatory/);assert.equal(m.scrollable,true);
  assert.ok(m.cards[0].width<width*0.5,'two cards per screen, not one stretched card');
  const peek=m.cards.find(c=>c.left<m.right&&c.right>m.right);assert.ok(peek,'the next card is partly visible');
  assert.ok(Math.abs(m.cards[0].height/m.cards[0].width-1.25)<0.05,'cards keep 4:5');
  const moved=await page.locator('.rz-category-grid').evaluate(async g=>{g.scrollBy({left:g.clientWidth*0.6,behavior:'instant'});await new Promise(r=>setTimeout(r,400));return g.scrollLeft;});
  assert.ok(moved>0,'it scrolls horizontally');
  assert.equal(await noPageOverflow(page),true,'no horizontal page overflow');
  await page.goto(base+'/catalog');const sections=page.locator('[data-catalog-sections]');
  if(await sections.count()){await sections.locator('[data-catalog-section]').first().waitFor();
   const s=await sections.evaluate(g=>({display:getComputedStyle(g).display,snap:getComputedStyle(g).scrollSnapType,tiles:g.children.length}));
   assert.equal(s.display,'flex');assert.match(s.snap,/x/);
   assert.equal(await page.locator('.rz-sections-pager').filter({visible:true}).count(),0,'phones swipe instead of paging');
   assert.equal(await noPageOverflow(page),true);}
 }finally{await context.close();}
});

test('desktop keeps its category grid and catalogue section grid',async()=>{
 const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();
 try{
  await page.goto(base+'/');await page.locator('.rz-category-grid .rz-category').first().waitFor();
  assert.equal(await page.locator('.rz-category-grid').evaluate(g=>getComputedStyle(g).display),'grid');
  await page.goto(base+'/catalog');const sections=page.locator('[data-catalog-sections]');
  if(await sections.count())assert.equal(await sections.evaluate(g=>getComputedStyle(g).display),'grid');
 }finally{await context.close();}
});
