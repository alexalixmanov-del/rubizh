// Release-hardening browser QA matrix (scratch tool, not shipped): isolated PHP+MariaDB SITE copy on the legacy
// catalog path, production .htaccess routes, Chromium/WebKit/Firefox × 12 widths × storefront pages + purchase flow.
import {chromium,webkit,firefox} from '/Users/l/Projects/rubizh/node_modules/playwright/index.mjs';
import {startQaSite,png} from './qa-fixture.mjs';
import {writeFileSync,mkdirSync} from 'node:fs';
const out=process.argv[2];mkdirSync(out+'/shots',{recursive:true});
const {site,pages}=await startQaSite();
const results={started:new Date().toISOString(),pages:[],flows:[]};
try{
 const widths=[320,360,375,390,414,430,768,820,1024,1280,1440,1920];
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
     // Submit as a guest: fixture NP is off, so city/branch are free text; card payment must hand off to the MonoPay mock.
     await page.locator('input[name="name"]').fill('Тест Покупець');await page.locator('input[name="phone"]').fill('+380671234567');
     await page.locator('input[name="city"]').fill('Київ');await page.locator('input[name="address"]').fill('Відділення 1');
     const place=page.getByRole('button',{name:/Підтвердити замовлення/}).first();await place.scrollIntoViewIfNeeded();
     const nav=page.waitForURL(u=>!u.toString().startsWith(site.base+'/#')&&!u.toString().startsWith(site.base+'/product'),{timeout:15000}).then(()=>true,()=>false);
     await tapOrClick(place);steps.push('handoff:'+(await nav),'url:'+page.url().replace(site.base,'').slice(0,60));
     const err=await page.evaluate(()=>[...document.querySelectorAll('[role="alert"]')].map(e=>e.innerText).join('|').slice(0,160)).catch(()=>'');if(err)steps.push('alert:'+err);
     const order=site.sql('SELECT status,payment_status,total,(SELECT COUNT(*) FROM rubizh_customer_orders) AS orders FROM rubizh_customer_orders ORDER BY id DESC LIMIT 1')[0];steps.push('order:'+JSON.stringify(order||null));
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
