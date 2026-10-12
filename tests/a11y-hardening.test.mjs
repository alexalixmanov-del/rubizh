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

// Stage 2: reproduce buyer-visible failures against synthetic loopback responses.
test('Stage 2: desktop quick view moves, traps and restores keyboard focus',async()=>{
 const page=await open('/catalog');
 try{
  const opener=page.locator('[data-qv]').first();await opener.focus();await page.keyboard.press('Enter');
  const dialog=page.locator('[data-mobile-dialog="qv"]');await dialog.waitFor();
  assert.equal(await dialog.evaluate(d=>d.contains(document.activeElement)),true);
  assert.equal(await page.locator('header').evaluate(e=>e.inert),true,'background is inert');
  const controls=dialog.locator('button,a[href],[tabindex="0"]');
  await controls.last().focus();await page.keyboard.press('Tab');
  assert.equal(await dialog.evaluate(d=>d.contains(document.activeElement)),true);
  await controls.first().focus();await page.keyboard.press('Shift+Tab');
  assert.equal(await dialog.evaluate(d=>d.contains(document.activeElement)),true);
  await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
  assert.equal(await opener.evaluate(e=>e===document.activeElement),true);
  assert.equal(await page.locator('header').evaluate(e=>e.inert),false);
 }finally{await page.close();}
});

test('Stage 2: desktop mini cart and size chart use the same modal focus boundary',async()=>{
 const page=await open('/product/demo-uniform');
 try{
  await page.getByRole('button',{name:'L',exact:true}).click();
  const add=page.getByRole('button',{name:/До кошика/}).first();await add.focus();await page.keyboard.press('Enter');
  const mini=page.locator('[data-mobile-dialog="mini"]');await mini.waitFor();
  assert.equal(await mini.evaluate(d=>d.contains(document.activeElement)),true);
  await page.keyboard.press('Escape');await mini.waitFor({state:'detached'});
  assert.equal(await add.evaluate(e=>e===document.activeElement),true);
  const chart=page.getByRole('button',{name:'Розмірна сітка',exact:true});await chart.focus();await page.keyboard.press('Enter');
  const size=page.locator('[data-mobile-dialog="size"]');await size.waitFor();
  assert.equal(await size.evaluate(d=>d.contains(document.activeElement)),true);
  await page.keyboard.press('Escape');await size.waitFor({state:'detached'});
  assert.equal(await chart.evaluate(e=>e===document.activeElement),true);
 }finally{await page.close();}
});

test('Stage 2: quick view to mini cart restores the catalog opener after both dialogs close',async()=>{
 const page=await open('/catalog');
 try{
  const opener=page.locator('[data-qv]').first();await opener.focus();await page.keyboard.press('Enter');
  const quick=page.locator('[data-mobile-dialog="qv"]');await quick.waitFor();
  await quick.getByRole('button',{name:'L',exact:true}).click();
  await quick.getByRole('button',{name:/В кошик · розмір/}).focus();await page.keyboard.press('Enter');
  const mini=page.locator('[data-mobile-dialog="mini"]');await mini.waitFor();await quick.waitFor({state:'detached'});
  assert.equal(await mini.evaluate(d=>d.contains(document.activeElement)),true);
  await page.keyboard.press('Escape');await mini.waitFor({state:'detached'});
  assert.equal(await opener.evaluate(e=>e===document.activeElement),true);
 }finally{await page.close();}
});

test('Stage 2: mobile filters expose modal semantics and restore focus after Escape',async()=>{
 const page=await open('/catalog');
 try{
  await page.setViewportSize({width:390,height:844});
  const opener=page.getByRole('button',{name:/Фільтри/}).first();await opener.focus();await page.keyboard.press('Enter');
  const panel=page.locator('[data-mobile-dialog="filters"]');
  assert.equal(await panel.getAttribute('role'),'dialog');assert.equal(await panel.getAttribute('aria-modal'),'true');
  assert.equal(await panel.evaluate(d=>d.contains(document.activeElement)),true);
  await page.keyboard.press('Escape');
  assert.equal(await opener.evaluate(e=>e===document.activeElement),true);
  assert.equal(await panel.getAttribute('aria-modal'),null);
  await page.setViewportSize({width:1280,height:900});
  assert.equal(await panel.getAttribute('role'),null,'desktop sidebar is not modal');
 }finally{await page.close();}
});

test('Stage 2: selected product size is announced as pressed and follows selection',async()=>{
 const page=await open('/product/demo-uniform');
 try{
  const sizes=page.locator('[data-size-grid]');
  await sizes.getByRole('button',{name:'L',exact:true}).click();
  assert.equal(await sizes.getByRole('button',{name:'L',exact:true}).getAttribute('aria-pressed'),'true');
  assert.equal(await sizes.getByRole('button',{name:'M',exact:true}).getAttribute('aria-pressed'),'false');
  await sizes.getByRole('button',{name:'M',exact:true}).click();
  assert.equal(await sizes.getByRole('button',{name:'L',exact:true}).getAttribute('aria-pressed'),'false');
  assert.equal(await sizes.getByRole('button',{name:'M',exact:true}).getAttribute('aria-pressed'),'true');
 }finally{await page.close();}
});

test('Stage 2: closing mobile search keeps it closed and releases the background',async()=>{
 const page=await open('/catalog');
 try{
  await page.setViewportSize({width:390,height:844});
  const input=page.getByRole('searchbox',{name:'Пошук',exact:true});await input.focus();
  await page.locator('[data-swrap][data-open="1"]').waitFor();await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  assert.equal(await page.locator('[data-swrap]').getAttribute('data-open'),'0');
  assert.equal(await input.evaluate(e=>e===document.activeElement),false);
  assert.equal(await page.locator('header [aria-label="Кошик"]').evaluate(e=>!!e.closest('[inert]')),false);
 }finally{await page.close();}
});

test('Stage 2: light theme keyboard focus contrasts with both field and panel',async()=>{
 const page=await open('/catalog');
 try{
  await page.locator('header [data-theme-toggle]').click();
  const input=page.getByRole('searchbox',{name:'Пошук',exact:true});await input.focus();
  const colors=await input.evaluate(e=>{const hex=s=>'#'+s.match(/\d+/g).slice(0,3).map(n=>Number(n).toString(16).padStart(2,'0')).join('');const background=node=>{for(;node;node=node.parentElement){const color=getComputedStyle(node).backgroundColor;if(!/^rgba\([^)]*,\s*0\)$/.test(color))return hex(color);}throw Error('No opaque background');};return {focus:hex(getComputedStyle(e).outlineColor),field:background(e),panel:background(e.closest('header'))};});
  assert.ok(contrast(colors.focus,colors.field)>=3,JSON.stringify(colors));
  assert.ok(contrast(colors.focus,colors.panel)>=3,JSON.stringify(colors));
 }finally{await page.close();}
});
