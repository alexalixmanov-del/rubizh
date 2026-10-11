// ECC ADDENDUM №2, Phase 2 (A-1…A-4): home hero has one prominent CTA, the kit promo CTA leads clearly,
// the search button never silently ignores an empty query. Demo preview, both themes, phone and desktop.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startPreview} from '../dev/preview.mjs';
let browser,server,base;
before(async()=>{server=await startPreview(0);base='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({executablePath:(process.env.CHROMIUM_PATH||'/usr/bin/chromium'),args:['--no-sandbox']});});
after(async()=>{await browser?.close();await new Promise(r=>server?.close(r));});
async function home(width,theme){
 const context=await browser.newContext({viewport:{width,height:width<768?800:900},...(width<768?{isMobile:true,hasTouch:true}:{})});
 await context.addInitScript(t=>{try{localStorage.setItem('rubizh.theme',t);}catch{}},theme);
 const page=await context.newPage();await page.goto(base+'/');await page.locator('.rz-hero .rz-actions').waitFor();await page.waitForTimeout(200);return {page,context};
}
const box=l=>l.evaluate(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {x:r.left,y:r.top,w:r.width,h:r.height,right:r.right,bottom:r.bottom,fs:parseFloat(s.fontSize),fw:+s.fontWeight,bg:s.backgroundColor};});

for(const theme of ['dark','light'])for(const width of [360,390,1280])test(`A-1/A-2: one strong hero CTA and a leading kit CTA (${theme}, ${width}px)`,async()=>{
 const {page,context}=await home(width,theme);
 try{
  const actions=page.locator('.rz-hero .rz-actions');
  assert.equal(await actions.locator('a,button').count(),1,'hero keeps exactly one action');
  assert.equal(await page.locator('.rz-hero').getByText('Підібрати комплект').count(),0,'the second hero button is gone');
  const cta=actions.locator('a');assert.equal(await cta.getAttribute('href'),'/catalog');assert.match(await cta.innerText(),/Обрати спорядження/i);
  const b=await box(cta);
  assert.ok(b.fw>=700,'bold CTA: '+b.fw);assert.ok(b.fs>=16,'CTA text ≥16px: '+b.fs);
  assert.ok(b.h>=(width<768?48:56),'CTA height '+b.h);assert.ok(b.right<=width,'CTA inside the viewport');
  assert.ok(b.w<width*(width<768?1.01:0.6),'desktop CTA does not span the hero: '+b.w);
  const p=await box(page.locator('.rz-hero-content>p'));assert.ok(b.y>=p.bottom,'CTA does not overlap the hero text');
  const kit=page.locator('.rz-kit-copy .rz-btn-primary'),help=page.locator('.rz-kit-copy .rz-text-link');
  const k=await box(kit),hl=await box(help);
  assert.ok(k.fw>=700&&k.fs>=16&&k.h>=(width<768?48:56),'kit CTA prominent: '+JSON.stringify(k));
  assert.ok(hl.fs<=k.fs&&hl.bg!==k.bg,'«Допомогти з вибором» stays secondary');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'no horizontal overflow');
 }finally{await context.close();}
});

test('A-1: the hero CTA opens the catalog',async()=>{
 const {page,context}=await home(1280,'dark');
 try{await page.locator('.rz-hero .rz-actions a').click();await page.waitForURL(/\/catalog$/);}finally{await context.close();}
});

test('A-4 (D-34): «Шукати» with an empty query puts the cursor into the search field',async()=>{
 const {page,context}=await home(1280,'dark');
 try{
  await page.getByRole('button',{name:'Шукати'}).first().click();
  assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('type')==='search'||/Знайти/.test(document.activeElement?.getAttribute('placeholder')||'')),true);
 }finally{await context.close();}
});
