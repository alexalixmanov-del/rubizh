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
  assert.notEqual(live,'store-runtime.4b6bbf46ca4c.js','a new versioned runtime (the old one is kept for cached pages)');
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
