// Cabinet browser QA (scratch tool): a real customer session on an isolated SITE copy; orders list, order detail,
// TTN visibility, empty states, IDOR (customer A cannot open B's order) at phone and desktop widths, 3 engines.
import {chromium,webkit,firefox} from '/Users/l/Projects/rubizh/node_modules/playwright/index.mjs';
import {startSite,wire,publish,php} from '/Users/l/Projects/rubizh/tests/helpers/site-fixture.mjs';
import {writeFileSync,mkdirSync} from 'node:fs';import path from 'node:path';
const out=process.argv[2];mkdirSync(out+'/shots',{recursive:true});
const site=await startSite({extraConfig:",'mono_mock'=>true,'environment'=>'staging'"});const results=[];
try{
 const w=structuredClone(wire);await publish(site,w);
 const A='a'.repeat(32),B='b'.repeat(32);
 for(const [id,email] of [[A,'a@fixture.test'],[B,'b@fixture.test']])site.sql(`INSERT INTO rubizh_accounts(id,email,first_name,last_name,created_at,updated_at) VALUES('${id}','${email}','Тест','Покупець',UTC_TIMESTAMP(),UTC_TIMESTAMP())`);
 // Orders through the real checkout (fixture schema), then owned by A or B.
 const model=wire.products.find(p=>p.id==='m-jacket'),line={product_id:'m-jacket',color_id:model.colors.find(c=>c.variant_skus.includes('RUB-F0001')).id,sku:'RUB-F0001',qty:1};
 const ids=[];for(let i=0;i<3;i++){const r=await fetch(site.base+'/shop/customer.php');const h={Cookie:r.headers.get('set-cookie').split(';')[0]},csrf=(await r.json()).csrf;
  const q=await site.post('/shop/checkout-quote.php',{csrf,lines:[line],payment:'card'},h);
  const o=await site.post('/shop/order.php',{csrf,request_id:String(i+1).padStart(32,'0'),contact:{name:'Тест Покупець',recipient:'Тест Покупець',phone:'+38067123456'+i,city:'Київ',address:'Відділення 1',delivery_type:'branch'},payment:'card',lines:[line],expected_total:q.data.quote.total,catalog_version:q.data.quote.catalog_version},h);ids.push(o.data.order.id);}
 site.sql(`INSERT INTO rubizh_account_orders(order_id,customer_id) VALUES(${ids[0]},'${A}'),(${ids[1]},'${A}'),(${ids[2]},'${B}')`);
 site.sql(`INSERT INTO rubizh_order_shipments(order_id,supplier_code,tracking_number,status,created_at,updated_at) VALUES(${ids[0]},'m_vin','20450000000011','created',UTC_TIMESTAMP(),UTC_TIMESTAMP()),(${ids[0]},'m_vin','20450000000012','cancelled',UTC_TIMESTAMP(),UTC_TIMESTAMP())`);
 const sid='qa'+'0'.repeat(30),now=Math.floor(Date.now()/1000);
 writeFileSync(path.join(site.dir,'sess_'+sid),`csrf|s:64:"${'c'.repeat(64)}";customer_id|s:32:"${A}";login_time|i:${now};login_method|s:5:"email";`);
 for(const [bname,engine] of [['chromium',chromium],['webkit',webkit],['firefox',firefox]]){
  const browser=await engine.launch(bname==='chromium'?{executablePath:process.env.CHROMIUM_PATH}:{});
  for(const width of [360,390,768,1280]){
   const context=await browser.newContext({viewport:{width,height:900}});
   await context.addCookies([{name:'rubizh_customer',value:sid,url:site.base,secure:true,httpOnly:true,sameSite:'Lax'}]);
   const page=await context.newPage(),errors=[],check={};page.on('pageerror',e=>errors.push(e.message.slice(0,140)));
   const overflow=()=>page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
   try{
    let r=await page.goto(site.base+'/auth/?tab=orders');check.ordersStatus=r.status();const t=await page.evaluate(()=>document.body.innerText);
    check.loggedIn=!/Увійти|Вхід до/.test(t.slice(0,400))||/Мої замовлення|Замовлення/.test(t);check.listOverflow=await overflow();
    const nums=site.sql(`SELECT id,order_number FROM rubizh_customer_orders ORDER BY id`);
    check.ownListed=nums.slice(0,2).every(n=>t.includes(n.order_number));check.foreignListed=t.includes(nums[2].order_number);
    if(width===390||width===1280)await page.screenshot({path:`${out}/shots/${bname}-${width}-cabinet-orders.png`,fullPage:true});
    r=await page.goto(site.base+'/auth/?tab=orders&order='+ids[0]);const d=await page.evaluate(()=>document.body.innerText);
    check.detailStatus=r.status();check.validTtn=d.includes('20450000000011');check.cancelledTtn=d.includes('20450000000012');check.detailOverflow=await overflow();
    if(width===390||width===1280)await page.screenshot({path:`${out}/shots/${bname}-${width}-cabinet-order.png`,fullPage:true});
    r=await page.goto(site.base+'/auth/?tab=orders&order='+ids[2]);const f=await page.evaluate(()=>document.body.innerText);
    check.foreignStatus=r.status();check.foreignLeak=f.includes(nums[2].order_number)||f.includes('+380671234562');
    for(const tab of ['profile','delivery','favorites']){r=await page.goto(site.base+'/auth/?tab='+tab);check[tab]=r.status()+(await overflow()?':overflow':'');}
   }catch(e){errors.push('flow: '+e.message.split('\n')[0].slice(0,160));}
   results.push({browser:bname,width,check,errors});await context.close();
  }
  await browser.close();
 }
}finally{site.stop();writeFileSync(out+'/cabinet.json',JSON.stringify(results,null,1));}
