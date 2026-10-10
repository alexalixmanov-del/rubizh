// Staging E2E against the migrated production SITE copy (MySQL 8). Writes a private JSON report.
import {spawn} from 'node:child_process';import {writeFileSync,readFileSync} from 'node:fs';import {createServer} from 'node:net';import {generateKeyPairSync,createSign} from 'node:crypto';
import {chunksFor} from '../helpers/site-fixture.mjs';import {chromium} from 'playwright';
const S='/tmp/claude-0/staging',M='/tmp/claude-0/rt/mysql8',MY=M+'/root/usr/bin/mysql';
const wire=JSON.parse(readFileSync('/home/user/rubizh/contracts/pim-v3/2/wire.exact.json','utf8'));
const port=await new Promise(r=>{const s=createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});const base='http://127.0.0.1:'+port;
writeFileSync(S+'/www/router.php',"<?php $p=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);if(str_starts_with($p,'/api/')){require __DIR__.'/api/index.php';return;}if(preg_match('~^/product/~',$p)||$p==='/'){require __DIR__.'/storefront.php';return;}return false;");
const server=spawn('php',['-d','pdo_mysql.default_socket='+M+'/mysql.sock','-d','session.save_path='+S+'/cache','-S',base.slice(7),'-t',S+'/www',S+'/www/router.php'],{stdio:['ignore','ignore','pipe']});let errlog='';server.stderr.on('data',x=>errlog+=x);
const sql=q=>{const {spawnSync}=require_();const r=spawnSync(MY,['--socket='+M+'/mysql.sock','-uroot','-N','-B','prodcopy','-e',q],{encoding:'utf8'});if(r.status)throw Error(r.stderr);return r.stdout.trim();};
function require_(){return globalThis.__cp||(globalThis.__cp=awaitImport);}
const awaitImport=await import('node:child_process');
const auth={'Authorization':'Bearer staging-pim-key-at-least-24-characters-long','Content-Type':'application/json'};
const post=async(route,body,headers={})=>{const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});return {status:r.status,data:await r.json().catch(()=>null)};};
const get=async(route,headers={})=>{const t0=performance.now();const r=await fetch(base+route,{headers});const text=await r.text();let data=null;try{data=JSON.parse(text);}catch{}return {status:r.status,data,text,ms:Math.round(performance.now()-t0)};};
const report={base_db:'prodcopy (production SITE dump 2026-10-09, MySQL 8.0.46)',steps:[]};const step=(name,ok,extra={})=>{report.steps.push({name,ok,...extra});console.log((ok?'PASS ':'FAIL ')+name,JSON.stringify(extra).slice(0,300));};
try{
 for(let i=0;i<100;i++){try{const r=await fetch(base+'/api/pim/status',{headers:auth});if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}
 const status=await get('/api/pim/status',auth);step('status advertises contract 3 on migrated staging',status.data?.capabilities?.contract_version===3,{capabilities:status.data?.capabilities});
 const legacyBefore=await get('/shop/catalog.php');step('legacy catalog readable before v3 sync',legacyBefore.status===200&&legacyBefore.data.total>0,{total:legacyBefore.data?.total,ms:legacyBefore.ms});
 let ack;for(const body of chunksFor(wire,{size:2})){ack=await post('/api/pim/sync',body,auth);}
 step('exact PIM wire committed on production copy',ack.status===200&&ack.data.status==='COMMITTED',{results:ack.data?.results?.map(r=>r.id+':'+r.status)});
 const after=await get('/shop/catalog.php');step('catalog = legacy + v3 models, one card per model',after.data.total===legacyBefore.data.total+wire.products.length,{before:legacyBefore.data.total,after:after.data.total});
 const jacket=wire.products.find(p=>p.id==='m-jacket');const prod=await get('/api/product/'+jacket.slug);step('v3 product DTO served',prod.data?.product?.contract_version===3&&prod.data.product.colors.length===2,{ms:prod.ms});
 const legacyId=sql("SELECT slug FROM products WHERE pim_contract_version IS NULL AND visible=1 LIMIT 1");const legacy=await get('/api/product/'+legacyId);step('legacy product page still served unchanged',legacy.status===200&&legacy.data?.product?.contract_version===undefined,{slug:legacyId});
 // Checkout on staging (mock bank, signed webhook with staging key pair).
 const {publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});sql(`UPDATE meta SET v='${Buffer.from(publicKey.export({type:'spki',format:'pem'})).toString('base64')}' WHERE k='mono_public_key'`);
 const who=await fetch(base+'/shop/customer.php');const h={Cookie:who.headers.get('set-cookie').split(';')[0]};const csrf=(await who.json()).csrf;
 const color=(id,s)=>wire.products.find(p=>p.id===id).colors.find(c=>c.variant_skus.includes(s)).id;
 const contact={name:'Тест Покупець',recipient:'Тест Покупець',phone:'+380671234567',city:'Київ',address:'Відділення 1',delivery_type:'branch'};let n=0;
 const order=async(lines)=>{const q=await post('/shop/checkout-quote.php',{csrf,lines},h);if(q.status!==200)return {q};const o=await post('/shop/order.php',{csrf,request_id:('5'+(++n)).padEnd(32,'0'),contact,payment:'card',lines,expected_total:q.data.quote.total,catalog_version:q.data.quote.catalog_version},h);return {q,o};};
 const pay=await order([{product_id:'m-jacket',color_id:color('m-jacket','RUB-F0001'),sku:'RUB-F0001',qty:1}]);
 step('IN_STOCK: immediate CONFIRMED order',pay.o?.data?.order?.order_state==='CONFIRMED'&&pay.o.data.order.payment_ready===true,{total:pay.q.data.quote.total});
 const start=await post('/shop/payment-start.php',{csrf,order_id:pay.o.data.order.id},h);step('invoice created via mock bank',start.status===200,{url:start.data?.url});
 const inv=JSON.parse(sql(`SELECT JSON_OBJECT('invoice_id',invoice_id,'amount',amount,'reference',reference) FROM rubizh_mono_invoices WHERE order_id=${pay.o.data.order.id}`));
 const raw=JSON.stringify({invoiceId:inv.invoice_id,status:'success',amount:inv.amount,ccy:980,reference:inv.reference,modifiedDate:new Date().toISOString()});
 const hook=await post('/shop/mono-webhook.php',raw,{'X-Sign':createSign('SHA256').update(raw).sign(privateKey).toString('base64')});
 step('signed webhook → PAID',hook.status===200&&sql(`SELECT CONCAT(payment_status,'/',pim_payment_state) FROM rubizh_customer_orders WHERE id=${pay.o.data.order.id}`)==='paid/PAID');
 const unknown=await order([{product_id:'m-belt',color_id:color('m-belt','RUB-F0030'),sku:'RUB-F0030',qty:1}]);step('UNKNOWN → order and payment denied',unknown.q.status===400&&unknown.q.data.error_code==='UNAVAILABLE');
 const out=await order([{product_id:'m-jacket',color_id:color('m-jacket','RUB-F0004'),sku:'RUB-F0004',qty:1}]);step('OUT_OF_STOCK → no ordinary checkout',out.q.status===400);
 const opt=wire.products.find(p=>p.id==='m-pants').size_options.find(o=>o.size==='52');
 const req=await order([{product_id:'m-pants',color_id:color('m-pants','RUB-F0010'),option_id:opt.option_id,size:'52',qty:1}]);
 step('SIZE_CONFIRMATION_REQUIRED → request, no fake SKU, payment denied',req.o?.data?.order?.order_state==='WAITING_CONFIRMATION'&&(await post('/shop/payment-start.php',{csrf,order_id:req.o.data.order.id},h)).status===400&&sql("SELECT COUNT(*) FROM variants WHERE product_id='m-pants'")==='1');
 const pre=await order([{product_id:'m-pouch',color_id:color('m-pouch','RUB-F0020'),sku:'RUB-F0020',qty:1}]);step('PREORDER → manager confirmation required',pre.o?.data?.order?.order_state==='WAITING_CONFIRMATION');
 const mixed=await order([{product_id:'m-jacket',color_id:color('m-jacket','RUB-F0002'),sku:'RUB-F0002',qty:1},{product_id:'m-pouch',color_id:color('m-pouch','RUB-F0020'),sku:'RUB-F0020',qty:1}]);
 step('mixed cart → whole order WAITING_CONFIRMATION, one order',mixed.o?.data?.order?.order_state==='WAITING_CONFIRMATION'&&mixed.q.data.quote.order_mode==='REQUEST');
 const legacyLine=JSON.parse(sql("SELECT JSON_OBJECT('p',v.product_id,'s',v.sku) FROM variants v JOIN products p ON p.id=v.product_id WHERE p.pim_contract_version IS NULL AND p.visible=1 AND v.availability='in' AND v.price>0 LIMIT 1"));
 const lq=await post('/shop/checkout-quote.php',{csrf,lines:[{product_id:legacyLine.p,sku:legacyLine.s,qty:1}]},h);step('legacy product checkout path still resolves (legacy rules)',[200,400].includes(lq.status),{status:lq.status,code:lq.data?.error_code});
 // Browser on the production copy.
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{for(const vp of [{width:390,height:844},{width:768,height:1024},{width:1440,height:900}]){const page=await browser.newPage({viewport:vp});const errors=[];page.on('pageerror',e=>errors.push(String(e)));await page.route(/^https:\/\/(?!127)/,r=>r.request().resourceType()==='image'?r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64')}):r.abort());
  await page.goto(base+'/product/'+jacket.slug);await page.getByRole('button',{name:'Олива',exact:true}).first().click();await page.waitForFunction(()=>[...document.querySelectorAll('img')].some(i=>/jacket-olive/.test(i.getAttribute('src')||'')));
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);await page.screenshot({path:S+'/private/product-'+vp.width+'.png'});
  step('browser '+vp.width+': color switch changes gallery, no overflow, no JS errors',!overflow&&!errors.length,{errors:errors.slice(0,2)});await page.close();}}
 finally{await browser.close();}
 report.ok=report.steps.every(s=>s.ok);
}catch(e){report.ok=false;report.error=String(e.stack||e);console.log(e);}
finally{server.kill();writeFileSync(S+'/private/staging-e2e.json',JSON.stringify(report,null,2));console.log('OK',report.ok);}
