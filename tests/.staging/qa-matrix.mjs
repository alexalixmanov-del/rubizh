// Release-hardening browser QA matrix (scratch tool, not shipped): isolated PHP+MariaDB SITE copy on the legacy
// catalog path, production .htaccess routes, Chromium/WebKit/Firefox × 12 widths × storefront pages + purchase flow.
import {chromium,webkit,firefox} from '/Users/l/Projects/rubizh/node_modules/playwright/index.mjs';
import {startSite,php} from '/Users/l/Projects/rubizh/tests/helpers/site-fixture.mjs';
import {writeFileSync,mkdirSync} from 'node:fs';
const out=process.argv[2];mkdirSync(out+'/shots',{recursive:true});
const img=n=>'https://img.test/'+n+'.png',v=(sku,color,size,photos,extra={})=>({sku,color,size,size_display:size,price:1250,availability:'in',stock:4,photos,...extra});
const g=['olive-1','olive-2','black-1','black-2'].map(img);
const products=[
 {id:'qa-jacket',slug:'qa-jacket',name:'Куртка QA Softshell',brand:'QA',category:'Одяг та форма / Куртки',category_path:['Одяг та форма','Куртки'],description:'Тестова куртка для перевірки вітрини.',photos:g,variants:[v('J-O-M','Олива','M',g.slice(0,2)),v('J-O-L','Олива','L',g.slice(0,2)),v('J-B-M','Чорний','M',g.slice(2)),v('J-B-XL','Чорний','XL',g.slice(2))]},
 {id:'qa-pouch',slug:'qa-pouch',name:'Підсумок QA під замовлення',brand:'QA',category:'Підсумки / Підсумки для магазинів',category_path:['Підсумки','Підсумки для магазинів'],description:'Під замовлення.',photos:[img('pouch')],variants:[v('P-1','Олива','Один розмір',[img('pouch')],{availability:'order',stock:null,lead_time:'7 днів'})]},
 {id:'qa-boots',slug:'qa-boots',name:'Берці QA',brand:'QA',category:'Взуття / Берці',category_path:['Взуття','Берці'],description:'Берці.',photos:[img('boots')],variants:[v('B-42','Койот','42',[img('boots')]),v('B-43','Койот','43',[img('boots')],{availability:'out',stock:0})]},
 {id:'qa-cap',slug:'qa-cap',name:'Кепка QA',brand:'QA',category:'Одяг та форма / Головні убори',category_path:['Одяг та форма','Головні убори'],description:'Кепка.',photos:[img('cap')],variants:[v('C-1','Мультикам','Один розмір',[img('cap')])]}];
const site=await startSite({enableV3:false,extraConfig:",'mono_mock'=>true,'environment'=>'staging'"});
const results={started:new Date().toISOString(),pages:[],flows:[]};
try{
 for(const p of products)php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${site.site}/auth/bootstrap.php';require_once '${site.site}/api/lib.php';save_product(db(),json_decode(${JSON.stringify(JSON.stringify(p))},true));`);
 writeFileSync(site.site+'/router.php',`<?php // Mirrors the production .htaccess routes (tests/.staging/serve.sh).
$p=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);if(str_starts_with($p,'/api/')){require __DIR__.'/api/index.php';return;}if($p==='/sitemap.xml'){require __DIR__.'/sitemap.php';return;}
if($p==='/'||preg_match('~^/(?:product|catalog|kit|categories|porady)(?:/.*)?$|^/(?:offer|privacy)/?$~',$p)){require __DIR__.'/storefront.php';return;}return false;`);
 const cat=JSON.parse(php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${site.site}/auth/bootstrap.php';require_once '${site.site}/shop/catalog-lib.php';echo json_encode(array_values(array_filter(shopCategories(db()),fn($c)=>$c['product_count']>0)));`).stdout);
 const leaf=cat.find(c=>c.path.includes(' / '))?.url_path||cat[0]?.url_path||'';
 const pages=[['home','/'],['catalog','/catalog'],['category','/catalog/'+leaf.split('/')[0]],['subcategory','/catalog/'+leaf],['categories','/categories'],['search','/catalog?q='+encodeURIComponent('Куртка')],['search-empty','/catalog?q='+encodeURIComponent('zzzнемаєтакого')],['product','/product/qa-jacket'],['product-preorder','/product/qa-pouch'],['product-404','/product/qa-missing'],['offer','/offer'],['privacy','/privacy'],['guides','/porady'],['kit','/kit'],['login','/auth/']];
 const widths=[320,360,375,390,414,430,768,820,1024,1280,1440,1920];
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAGElEQVR4nGNkYPjPQAxgGlU4qnBU4ahCAOsUAhDDMbNjAAAAAElFTkSuQmCC','base64');
 for(const [bname,engine] of [['chromium',chromium],['webkit',webkit],['firefox',firefox]]){
  const browser=await engine.launch(bname==='chromium'?{executablePath:process.env.CHROMIUM_PATH}:{});
  for(const w of widths){
   const mobile=w<768&&bname!=='firefox';
   const context=await browser.newContext({viewport:{width:w,height:w<768?844:900},...(mobile?{isMobile:true,hasTouch:true}:{})});
   await context.route('https://img.test/**',r=>r.fulfill({contentType:'image/png',body:png}));
   for(const [name,path] of pages){
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message.slice(0,160)));page.on('console',m=>{if(m.type()==='error'&&!/favicon|googletagmanager|facebook|ERR_NAME_NOT_RESOLVED|net::ERR/.test(m.text()))errors.push('console: '+m.text().slice(0,160));});
    let status=0;try{const r=await page.goto(site.base+path,{waitUntil:'load',timeout:30000});status=r?.status()||0;await page.waitForTimeout(500);}catch(e){errors.push('nav: '+e.message.slice(0,120));}
    const info=await page.evaluate(()=>{const vw=document.documentElement.clientWidth;return {overflow:document.documentElement.scrollWidth>vw+1,scrollW:document.documentElement.scrollWidth,vw,
     broken:[...document.images].filter(i=>i.complete&&i.currentSrc&&i.naturalWidth===0&&i.getBoundingClientRect().width>0).map(i=>i.currentSrc.slice(0,100)),
     noAlt:[...document.images].filter(i=>!i.hasAttribute('alt')&&i.getBoundingClientRect().width>0).length,
     cod:/Післяплат|Оплата при отриманні/.test(document.body.innerText),title:document.title.slice(0,80),
     emptyLinks:[...document.querySelectorAll('a')].filter(a=>a.getBoundingClientRect().width>0&&(!a.getAttribute('href')||a.getAttribute('href')==='#')&&!a.onclick).length};}).catch(e=>({evalError:e.message.slice(0,100)}));
    if((w===390||w===1280)&&['home','catalog','product','categories'].includes(name))await page.screenshot({path:`${out}/shots/${bname}-${w}-${name}.png`,fullPage:false}).catch(()=>{});
    results.pages.push({browser:bname,width:w,page:name,path,status,errors,...info});
    await page.close();
   }
   // Purchase flow at three representative widths: colour → size → cart → checkout; only card/invoice offered.
   if([390,768,1280].includes(w)){
    const page=await context.newPage(),errors=[],steps=[];page.on('pageerror',e=>errors.push(e.message.slice(0,160)));
    try{
     await page.goto(site.base+'/product/qa-jacket');await page.locator('[data-product-colors] button').first().waitFor({timeout:20000});
     const tapOrClick=async l=>mobile?l.tap():l.click();
     await tapOrClick(page.locator('[data-product-colors] button',{hasText:'Чорний'}));
     await page.waitForFunction(()=>[...document.querySelectorAll('[data-gal-track] img')].filter(i=>i.getAttribute('src')).every(i=>i.getAttribute('src').includes('black')),null,{timeout:8000});steps.push('gallery-black');
     await tapOrClick(page.locator('[data-size-grid]').getByText('XL',{exact:true}));steps.push('size-XL');
     const buy=w<768?page.locator('[data-mob-buy] [role="button"]'):page.getByRole('button',{name:/До кошика/}).first();
     await tapOrClick(buy);await page.waitForTimeout(600);
     const cart=await page.evaluate(()=>JSON.parse(localStorage.getItem('rubizh.cart')||'[]').map(l=>l.sku));steps.push('cart:'+cart.join(','));
     await page.goto(site.base+'/#cart');await page.waitForTimeout(800);
     const checkout=page.getByRole('button',{name:/Оформити/}).first();if(await checkout.count()){await tapOrClick(checkout);await page.waitForTimeout(800);steps.push('checkout');}
     const txt=await page.evaluate(()=>document.body.innerText);
     steps.push('pay-card:'+/Оплата карткою/.test(txt),'pay-invoice:'+/Оплата на рахунок ФОП/.test(txt),'cod:'+/Післяплат|Оплата при отриманні/.test(txt));
     const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);steps.push('overflow:'+overflow);
     if(w!==768)await page.screenshot({path:`${out}/shots/${bname}-${w}-checkout.png`}).catch(()=>{});
    }catch(e){errors.push('flow: '+e.message.split('\n')[0].slice(0,160));}
    results.flows.push({browser:bname,width:w,steps,errors});await page.close();
   }
   await context.close();
  }
  await browser.close();
 }
}finally{site.stop();results.finished=new Date().toISOString();writeFileSync(out+'/matrix.json',JSON.stringify(results,null,1));}
