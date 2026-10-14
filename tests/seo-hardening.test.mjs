// Release hardening 2026-10-11: SEO regressions from docs/release-hardening/03-DEFECT_REGISTER.md (D-27, D-28).
// Isolated MySQL fixture on the legacy catalog path; no network, no production data.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {startSite,php,root} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;

test('D-27: robots.txt allows only public paths that the site actually serves',()=>{
  const robots=readFileSync(path.join(root,'robots.txt'),'utf8'),htaccess=readFileSync(path.join(root,'.htaccess'),'utf8');
  const routed=/RewriteRule \^\(\?:([a-z|]+)\)\(\?:\/\.\*\)\?\$ storefront\.php/.exec(htaccess)[1].split('|').concat(/RewriteRule \^\(\?:([a-z|]+)\)\/\?\$ storefront\.php/.exec(htaccess)[1].split('|'));
  const allows=[...robots.matchAll(/^Allow: (\S+)$/gm)].map(m=>m[1]);
  // Uploaded media is outside git but served (and guarded) by .htaccess.
  const dead=allows.filter(a=>{const first=a.replace(/^\//,'').split(/[/$]/)[0];return first!==''&&!routed.includes(first)&&!existsSync(path.join(root,first.replace(/\.xml$/,'.php')))&&!existsSync(path.join(root,first))&&!htaccess.includes('^'+first+'/');});
  assert.deepEqual(dead,[],'Allow rules for paths that do not exist');
  // Every indexable storefront section must be reachable for the agents that are otherwise blocked hosting-wide.
  const agents=robots.slice(robots.indexOf('User-agent: GPTBot'));
  for(const p of ['/$','/catalog','/categories','/product/','/porady','/kit/$','/offer','/privacy','/sitemap.xml'])assert.ok(agents.includes('Allow: '+p+'\n'),'AI agents cannot reach '+p);
});

test('Stage 2 SEO: direct responses and SPA navigation share truthful route metadata',{skip,timeout:120000},async t=>{
  const site=await startSite({enableV3:false});let browser;
  const products=['unknown','known'].map(kind=>({id:'seo-'+kind,slug:'seo-'+kind,name:'Куртка SEO '+kind,brand:'QA',canonical_category_id:'clothing_jackets',category:'Одяг та форма / Куртки',description:'Повний опис куртки '+kind,photos:['https://img.test/seo.webp'],
    variants:[{sku:'SEO-'+kind.toUpperCase(),color:'Олива',size:'M',size_display:'M',price:1500,availability:'in',...(kind==='known'?{stock:2}:{}),photos:['https://img.test/seo.webp']}]}));
  const schemas=html=>[...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs)].map(m=>JSON.parse(m[1]));
  const productSchema=html=>schemas(html).find(s=>s['@type']==='Product');
  const open=async route=>{
    const context=await browser.newContext({viewport:{width:390,height:844}});
    await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
    const page=await context.newPage();await page.goto(site.base+route,{waitUntil:'networkidle'});
    await page.locator('#dc-root h1').waitFor();return {page,context};
  };
  const renderedSchema=page=>page.locator('#rubizh-product-schema').evaluate(el=>JSON.parse(el.textContent));
  try{
    for(const p of products)php(`require '${site.site}/api/lib.php';$result=save_product(db(),json_decode(${JSON.stringify(JSON.stringify(p))},true));if($result['status']==='error')throw new RuntimeException(json_encode($result));`);
    writeFileSync(site.site+'/router.php',`<?php $p=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);if($p==='/'||preg_match('~^/(?:product|catalog|categories|kit)(?:/.*)?$~',$p)){require __DIR__.'/storefront.php';return;}return false;`);
    browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
    await t.test('SEO-03: direct route responses contain exactly one route-specific description',async()=>{
      for(const [route,expected] of [['/product/seo-unknown','Повний опис куртки unknown'],['/catalog','Каталог тактичного спорядження']]){
        const res=await fetch(site.base+route);assert.equal(res.status,200);const html=await res.text();
        const metas=[...html.matchAll(/<meta\b[^>]*name="description"[^>]*>/g)];assert.equal(metas.length,1,route+' has one description');assert.ok(metas[0][0].includes(expected),route+' has its own description');
      }
    });
    await t.test('SEO-01: hydration never turns unknown stock into InStock',async()=>{
      for(const kind of ['unknown','known']){
        const server=productSchema(await (await fetch(site.base+'/product/seo-'+kind)).text());
        const b=await open('/product/seo-'+kind);try{
          const client=await renderedSchema(b.page);assert.equal(client.offers.availability,server.offers.availability,kind+' stock projection');
          assert.equal(client.offers.priceCurrency,'UAH');assert.equal(Number(client.offers.price),1500);
        }finally{await b.context.close();}
      }
    });
    await t.test('SEO-02: hydration preserves complete Product identity, image and seller',async()=>{
      const server=productSchema(await (await fetch(site.base+'/product/seo-known')).text()),b=await open('/product/seo-known');
      try{assert.deepEqual(await renderedSchema(b.page),server,'server Product schema survives hydration');}
      finally{await b.context.close();}
    });
    await t.test('SEO-04: filtered catalog → product clears noindex and replaces breadcrumbs',async()=>{
      const serverHtml=await (await fetch(site.base+'/product/seo-known')).text(),server=productSchema(serverHtml),serverCrumbs=schemas(serverHtml).find(s=>s['@type']==='BreadcrumbList');
      const b=await open('/catalog?sort=cheap');try{
        assert.equal(await b.page.locator('meta[name="robots"]').getAttribute('content'),'noindex,follow');
        await b.page.locator('a[href="/product/seo-known"]').first().click();
        await b.page.waitForURL('**/product/seo-known');await b.page.waitForLoadState('networkidle');
        assert.equal(await b.page.locator('meta[name="robots"]').count(),0,'product does not inherit noindex');
        const crumbs=await b.page.locator('script[type="application/ld+json"]').evaluateAll(els=>els.map(el=>JSON.parse(el.textContent)).find(s=>s['@type']==='BreadcrumbList'));
        assert.deepEqual(crumbs,serverCrumbs);assert.deepEqual(await renderedSchema(b.page),server,'SPA Product matches direct response');
        await b.page.goBack();await b.page.waitForURL('**/catalog?sort=cheap');
        await b.page.waitForFunction(()=>document.head.querySelector('meta[name="robots"]')?.content==='noindex,follow');
        assert.equal(await b.page.locator('#rubizh-product-schema').count(),0,'catalog removes Product schema');
      }finally{await b.context.close();}
    });
  }finally{if(browser)await browser.close();site.stop();}
});

test('D-28: product and category pages publish a BreadcrumbList that mirrors the category tree',{skip},async()=>{
  const site=await startSite({enableV3:false});
  try{
    const p={id:'seo-jacket',slug:'seo-jacket',canonical_category_id:'clothing_jackets',name:'Куртка SEO',brand:'QA',category:'Одяг та форма / Куртки',category_path:['Одяг та форма','Куртки'],description:'Тест.',photos:['https://img.test/a.png'],
      variants:[{sku:'SEO-1',color:'Олива',size:'M',size_display:'M',price:1500,availability:'in',stock:2,photos:['https://img.test/a.png']}]};
    php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${site.site}/auth/bootstrap.php';require_once '${site.site}/api/lib.php';save_product(db(),json_decode(${JSON.stringify(JSON.stringify(p))},true));`);
    writeFileSync(site.site+'/router.php',`<?php $p=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);if($p==='/'||preg_match('~^/(?:product|catalog)(?:/.*)?$~',$p)){require __DIR__.'/storefront.php';return;}return false;`);
    const crumbs=async url=>{const html=await (await fetch(site.base+url)).text();const blocks=[...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs)].map(m=>JSON.parse(m[1]));
      const list=blocks.find(b=>b['@type']==='BreadcrumbList');assert.ok(list,'no BreadcrumbList on '+url);
      list.itemListElement.forEach((e,i)=>assert.equal(e.position,i+1));return list.itemListElement.map(e=>[e.name,e.item??null]);};
    assert.deepEqual(await crumbs('/product/seo-jacket'),[['РУБІЖ','https://rubizh.shop/'],['Каталог','https://rubizh.shop/catalog'],['Одяг та форма','https://rubizh.shop/catalog/odiah-ta-forma'],['Куртки','https://rubizh.shop/catalog/odiah-ta-forma/kurtky'],['Куртка SEO',null]]);
    assert.deepEqual(await crumbs('/catalog/odiah-ta-forma/kurtky'),[['РУБІЖ','https://rubizh.shop/'],['Каталог','https://rubizh.shop/catalog'],['Одяг та форма','https://rubizh.shop/catalog/odiah-ta-forma'],['Куртки',null]]);
    assert.deepEqual(await crumbs('/catalog'),[['РУБІЖ','https://rubizh.shop/'],['Каталог',null]]);
  }finally{site.stop();}
});
