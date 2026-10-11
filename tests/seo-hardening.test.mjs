// Release hardening 2026-10-11: SEO regressions from docs/release-hardening/03-DEFECT_REGISTER.md (D-27, D-28).
// Isolated MySQL fixture on the legacy catalog path; no network, no production data.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
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
