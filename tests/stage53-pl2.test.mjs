// Stage 5.3 (PL-2, owner plan): mobile first screen. Step 1 — the storefront CSP has no 'unsafe-eval': the runtime runs the
// one known logic script directly instead of compiling it (new versioned store-runtime). Every storefront route renders in
// WebKit, Chromium and Firefox with no CSP violation and no uncaught error.
import {test} from 'node:test';import assert from 'node:assert/strict';import {writeFileSync,readFileSync} from 'node:fs';import path from 'node:path';
import {chromium,firefox,webkit} from 'playwright';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const root=path.resolve(import.meta.dirname,'..');
const ENGINES=[['webkit',()=>webkit.launch()],['chromium',()=>chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']})],['firefox',()=>firefox.launch()]];

test('PL-2: the storefront CSP has no unsafe-eval and every storefront route renders under it (WebKit, Chromium, Firefox)',{skip,timeout:600000},async()=>{
 const {startSite,php}=await import('./helpers/site-fixture.mjs');
 const site=await startSite({enableV3:false});
 try{
  const p={id:'pl2-jacket',slug:'pl2-jacket',canonical_category_id:'clothing_jackets',name:'Куртка PL-2',brand:'QA',category:'Одяг та форма / Куртки',category_path:['Одяг та форма','Куртки'],description:'Тест.',photos:['https://img.test/a.png'],variants:[{sku:'PL2-1',color:'Олива',size:'M',size_display:'M',price:1500,availability:'in',stock:2,photos:['https://img.test/a.png']}]};
  php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${site.site}/auth/bootstrap.php';require_once '${site.site}/api/lib.php';save_product(db(),json_decode(${JSON.stringify(JSON.stringify(p))},true));`);
  writeFileSync(site.site+'/router.php',`<?php $p=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);if($p==='/'||preg_match('~^/(?:product|catalog|categories|kit|rozdil|porady)(?:/.*)?$~',$p)){require __DIR__.'/storefront.php';return;}return false;`);
  const routes=['/','/catalog/odiah-ta-forma','/product/pl2-jacket','/kit/','/categories','/rozdil/bronezakhyst'];
  for(const r of routes){
   const res=await fetch(site.base+r);const csp=res.headers.get('content-security-policy')||'';await res.arrayBuffer();
   assert.equal(res.status,200,r);const scriptSrc=(csp.match(/script-src([^;]*)/)||[,''])[1];
   assert.match(scriptSrc,/'self'/,r);assert.match(scriptSrc,/'nonce-/,r);assert.doesNotMatch(scriptSrc,/'unsafe-eval'|'unsafe-inline'/,r+': '+scriptSrc);
  }
  const live=readFileSync(path.join(root,'index.html'),'utf8').match(/src="\/assets\/(store-runtime\.[0-9a-f]{12}\.js)"/)[1];
  assert.notEqual(live,'store-runtime.4b6bbf46ca4c.js','a new versioned runtime (the old file is kept unchanged, Q-9; it cannot run under the new CSP)');
  for(const [name,launch] of ENGINES){const browser=await launch();
   try{for(const r of routes){
    const ctx=await browser.newContext({viewport:{width:390,height:844}});const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective+' '+e.blockedURI));});
    await page.goto(site.base+r);await page.locator('[data-store-surface]').first().waitFor({timeout:20000});await page.waitForTimeout(400);
    assert.deepEqual(await page.evaluate(()=>window.__csp),[],name+' '+r+': no CSP violation');assert.deepEqual(errors,[],name+' '+r+': no uncaught error');
    await ctx.close();
   }}finally{await browser.close();}
  }
 }finally{site.stop();}
});

// Step 2 — the home first screen is in the HTML: the template's hero (no bindings, inert, hidden from assistive technology)
// is painted while the client scripts still load, and gives way to the live page once it renders.
test('PL-2: home hero is server-rendered — visible before the client runtime, removed once the live page renders; other pages unchanged',{skip,timeout:600000},async()=>{
 const {startSite,php}=await import('./helpers/site-fixture.mjs');
 const site=await startSite({enableV3:false});
 try{
  const p={id:'pl2-boots',slug:'pl2-boots',canonical_category_id:'footwear_boots',name:'Берці PL-2',brand:'QA',category:'Взуття / Берці',category_path:['Взуття','Берці'],description:'Тест.',photos:['https://img.test/b.png'],variants:[{sku:'PL2-B1',color:'Койот',size:'42',size_display:'42',price:2500,availability:'in',stock:2,photos:['https://img.test/b.png']}]};
  php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${site.site}/auth/bootstrap.php';require_once '${site.site}/api/lib.php';save_product(db(),json_decode(${JSON.stringify(JSON.stringify(p))},true));`);
  writeFileSync(site.site+'/router.php',`<?php $p=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);if($p==='/'||preg_match('~^/(?:product|catalog|categories|kit|rozdil|porady)(?:/.*)?$~',$p)){require __DIR__.'/storefront.php';return;}return false;`);
  const html=await (await fetch(site.base+'/')).text();
  const first=html.match(/<div class="rz-first-screen" data-first-screen inert aria-hidden="true">[\s\S]*?<\/section><\/div><\/div>/)?.[0]||'';
  assert.ok(first,'the home HTML has the first screen');
  assert.ok(html.indexOf(first)<html.indexOf('<x-dc>'),'before the client template');
  assert.match(first,/<h1>ТВІЙ РУБІЖ\. <br>ТВОЯ <span>ПЕРЕВАГА\.<\/span><\/h1>/,'the template hero text');assert.match(first,/class="rz-hero-image"[^>]*fetchpriority="high"/);
  assert.doesNotMatch(first,/\{\{|sc-[a-z-]+=|\sid="/,'no bindings and no duplicate ids');
  assert.equal((html.match(/id="hero-title"/g)||[]).length,1,'one hero-title id (the template)');
  // hero-theme chooses the preloaded artwork by the viewport width, so the viewport must be known before it runs
  // (before 5.3 the meta came after the scripts: every phone preloaded the 136 KB desktop artwork as well).
  const head=html.slice(0,html.indexOf('</head>'));
  assert.ok(head.indexOf('name="viewport"')>0&&head.indexOf('name="viewport"')<head.indexOf('<script'),'viewport before the first script');
  assert.ok(Buffer.from(html).indexOf('<meta charset="utf-8">')<1024,'charset in the first 1024 bytes');
  for(const r of ['/catalog/vzuttia','/product/pl2-boots','/kit/','/categories'])assert.doesNotMatch(await (await fetch(site.base+r)).text(),/data-first-screen/,r+': no home first screen');
  for(const [name,launch] of ENGINES){const browser=await launch();
   try{
    const ctx=await browser.newContext({viewport:{width:390,height:844}});const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const heroes=[];page.on('request',q=>{const m=q.url().match(/\/assets\/hero-(mobile|desktop)-/);if(m)heroes.push(m[1]);});
    // Hold the client runtime: the first screen must already be painted (hero heading and image source set) without it.
    let release;const held=new Promise(r=>release=r);
    await page.route(/\/assets\/store-runtime\.[0-9a-f]{12}\.js$/,async route=>{await held;await route.continue();});
    // Deferred scripts hold DOMContentLoaded, so wait for the painted heading itself.
    await page.goto(site.base+'/',{waitUntil:'commit'});await page.locator('[data-first-screen] h1').waitFor({state:'visible',timeout:20000});await page.waitForTimeout(300);
    const before=await page.evaluate(()=>{const f=document.querySelector('[data-first-screen]');const h=f?.querySelector('h1')?.getBoundingClientRect();const img=f?.querySelector('img.rz-hero-image');
     return {present:!!f,inert:f?.inert===true||f?.hasAttribute('inert'),h1:h?[Math.round(h.top),Math.round(h.height)]:null,src:img?.currentSrc||img?.getAttribute('src')||'',live:!!document.querySelector('[data-store-surface]:not(x-dc [data-store-surface])')};});
    assert.equal(before.present,true,name+': first screen before the runtime');assert.equal(before.live,false,name);assert.ok(before.h1&&before.h1[1]>0&&before.h1[0]<844,name+': hero heading on the first screen '+JSON.stringify(before.h1));
    assert.match(before.src,/\/assets\/hero-(?:mobile|desktop)-(?:dark|light)\.2026100608\.webp$/,name+': hero image chosen by hero-theme');
    release();await page.locator('[data-store-surface] .rz-hero h1').first().waitFor({timeout:20000});await page.waitForTimeout(300);
    assert.equal(await page.locator('[data-first-screen]').count(),0,name+': the first screen gave way to the live page');
    assert.equal(await page.evaluate(()=>[...document.querySelectorAll('h1')].filter(h=>h.getBoundingClientRect().height>0&&!h.closest('x-dc')).length),1,name+': one visible h1');
    assert.deepEqual([...new Set(heroes)],['mobile'],name+': a phone loads only the mobile hero artwork');
    assert.deepEqual(errors,[],name);await ctx.close();
   }finally{await browser.close();}
  }
 }finally{site.stop();}
});
