// ECC ADDENDUM №2, Phase 7 (S-1): Instagram/TikTok links come only from site settings, are validated (https + exact
// platform host) on save and again on read, and the footer shows only what is configured. Synthetic URLs only.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startPreview} from '../dev/preview.mjs';
import {php,root} from './helpers/site-fixture.mjs';
let browser,server,base;
before(async()=>{server=await startPreview(0);base='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({executablePath:(process.env.CHROMIUM_PATH||'/usr/bin/chromium'),args:['--no-sandbox']});});
after(async()=>{await browser?.close();await new Promise(r=>server?.close(r));});
const IG='https://www.instagram.com/rubizh.test',TT='https://www.tiktok.com/@rubizh.test';

test('S-1: settings accept only https links on the exact platform hosts; empty clears the link',()=>{
 const run=raw=>JSON.parse(php(`require '${root}/shop/settings-lib.php';try{echo json_encode(['ok'=>array_intersect_key(shopSettingsValidate(json_decode(${JSON.stringify(JSON.stringify(raw))},true)),['instagram_url'=>1,'tiktok_url'=>1])]);}catch(RuntimeException $e){echo json_encode(['error'=>$e->getMessage()]);}`).stdout);
 assert.deepEqual(run({instagram_url:IG,tiktok_url:TT}).ok,{instagram_url:IG,tiktok_url:TT});
 assert.deepEqual(run({instagram_url:'https://instagram.com/rubizh',tiktok_url:''}).ok,{instagram_url:'https://instagram.com/rubizh',tiktok_url:''});
 for(const bad of ['javascript:alert(1)','data:text/html,x','http://www.instagram.com/x','https://www.instagram.com.evil.test/x','https://evil.test/?u=https://www.instagram.com/x','https://user@www.instagram.com/x','https://www.instagram.com:8443/x','//www.instagram.com/x','https://www.tiktok.com/@x'])
  assert.ok(run({instagram_url:bad}).error,'rejected for Instagram: '+bad);
 assert.ok(run({tiktok_url:IG}).error,'an Instagram URL is not a TikTok link');
});

async function footer(social){
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage();
 // Production boots public settings inline (storefront.php → shopPublicSettings()); the preview does the same.
 await page.addInitScript(social=>{let boot;Object.defineProperty(window,'RUBIZH_BOOT',{configurable:true,get:()=>boot,set:v=>{boot=v;if(v&&v.settings)v.settings.social=social;}});},social);
 await page.goto(base+'/');await page.locator('footer').waitFor();await page.waitForTimeout(400);return {page,context};
}
test('S-1: no configured link → no social block at all',async()=>{
 const {page,context}=await footer({instagram:'',tiktok:''});
 try{assert.equal(await page.locator('[data-footer-social]').count(),0);assert.equal(await page.getByText('Ми в соцмережах').count(),0);}finally{await context.close();}
});
test('S-1: one link → one icon; a link with a wrong host is never rendered',async()=>{
 const {page,context}=await footer({instagram:IG,tiktok:'https://evil.test/@x'});
 try{
  const links=page.locator('[data-footer-social] a');assert.equal(await links.count(),1);
  assert.equal(await links.first().getAttribute('href'),IG);
 }finally{await context.close();}
});
test('S-1: two links → two named, safe, keyboard-reachable 44×44 targets',async()=>{
 const {page,context}=await footer({instagram:IG,tiktok:TT});
 try{
  const block=page.locator('[data-footer-social]');assert.match(await block.innerText(),/Ми в соцмережах/i);
  const links=block.locator('a');assert.equal(await links.count(),2);
  for(const [i,href,label] of [[0,IG,/Instagram/],[1,TT,/TikTok/]]){
   const a=links.nth(i);assert.equal(await a.getAttribute('href'),href);assert.equal(await a.getAttribute('target'),'_blank');
   assert.equal(await a.getAttribute('rel'),'noopener noreferrer');assert.match(await a.getAttribute('aria-label'),label);
   const b=await a.boundingBox();assert.ok(b.width>=44&&b.height>=44,'touch target '+JSON.stringify(b));
   const svg=await a.locator('svg').boundingBox();assert.ok(svg.width>=20&&svg.width<=26,'icon ~22–24px');
  }
  await links.first().focus();assert.equal(await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle!=='none'),true,'visible focus');
 }finally{await context.close();}
});

test('S-1: a hand-edited settings file cannot put an unsafe link into the storefront boot data',{skip:!process.env.RUBIZH_TEST_MYSQL_SOCKET},async()=>{
 const {startSite}=await import('./helpers/site-fixture.mjs'),{writeFileSync}=await import('node:fs');
 const site=await startSite({enableV3:false});
 try{
  writeFileSync(site.site+'/api/site-settings.json',JSON.stringify({instagram_url:'javascript:alert(1)',tiktok_url:TT}));
  const html=await (await fetch(site.base+'/')).text(),boot=JSON.parse(/window\.RUBIZH_BOOT=(\{.*?\});<\/script>/s.exec(html)[1]);
  assert.deepEqual(boot.settings.social,{instagram:'',tiktok:TT});
 }finally{site.stop();}
});
