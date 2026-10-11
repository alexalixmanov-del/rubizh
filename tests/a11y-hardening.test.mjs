// Release hardening 2026-10-11: accessibility regressions found by axe-core WCAG 2.1 AA (docs/release-hardening/07-*.md, D-29…D-32).
// Demo preview for the storefront templates; the isolated PHP fixture for the server-rendered 404 page.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startPreview} from '../dev/preview.mjs';
import {startSite} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
let browser,server,base;
before(async()=>{server=await startPreview(0);base='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({executablePath:(process.env.CHROMIUM_PATH||'/usr/bin/chromium'),args:['--no-sandbox']});});
after(async()=>{await browser?.close();await new Promise(r=>server?.close(r));});
async function open(path){const page=await browser.newPage({viewport:{width:1280,height:900}});await page.goto(base+path);await page.locator('[data-store-surface]').waitFor();await page.waitForTimeout(300);return page;}
// WCAG relative luminance contrast of two #rrggbb colours.
const contrast=(a,b)=>{const L=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4);return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2];};const [x,y]=[L(a),L(b)].sort((p,q)=>q-p);return (x+0.05)/(y+0.05);};

test('D-29: the product photo track is a named, keyboard-focusable region (arrow keys scroll it)',async()=>{
 const page=await open('/product/demo-uniform');
 try{
  const track=page.locator('[data-gal-track]').first();await track.waitFor();
  assert.equal(await track.getAttribute('tabindex'),'0');assert.equal(await track.getAttribute('role'),'region');
  assert.match(await track.getAttribute('aria-label')||'',/Фото/);
 }finally{await page.close();}
});

test('D-30: guide cards expose one interactive control (the title link), no nameless nested button around the photo',async()=>{
 const page=await open('/porady');
 try{
  await page.locator('image-slot[id^="guide-"]').first().waitFor();
  const bad=await page.locator('image-slot[id^="guide-"]').evaluateAll(x=>x.map(s=>s.parentElement).filter(p=>p.getAttribute('role')==='button'||p.hasAttribute('tabindex')).length);
  assert.equal(bad,0);
 }finally{await page.close();}
});

test('D-31: kit slot recommendations carry aria-label only on an element with a role that allows it',async()=>{
 const page=await open('/kit');
 try{
  const roles=await page.locator('.rz-kit-recommendations[aria-label]').evaluateAll(x=>x.map(e=>e.getAttribute('role')));
  assert.ok(roles.length>0,'recommendation blocks rendered');
  for(const r of roles)assert.equal(r,'group');
 }finally{await page.close();}
});

test('D-32: the server 404 page links meet WCAG AA contrast on its dark background',{skip},async()=>{
 const site=await startSite({enableV3:false});
 try{
  const r=await fetch(site.base+'/product/no-such-product');assert.equal(r.status,404);
  const html=await r.text(),link=/a\{color:(#[0-9a-fA-F]{6})/.exec(html),bg=/background:(#[0-9a-fA-F]{6})/.exec(html);
  assert.ok(link,'link colour is set, not the browser default #0000EE');
  assert.ok(contrast(link[1],bg[1])>=4.5,'contrast '+contrast(link[1],bg[1]).toFixed(2));
 }finally{site.stop();}
});

test('D-33: «Перейти до вмісту» has a target on every storefront view',async()=>{
 for(const path of ['/','/catalog','/categories','/product/demo-uniform','/kit','/porady','/porady/iak-pidibraty-rozmir-formy']){
  const page=await open(path);
  try{assert.equal(await page.locator('#main-content').count(),1,'skip-link target on '+path);}finally{await page.close();}
 }
});
