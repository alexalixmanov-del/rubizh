// Staging rehearsal: SITE catalog reset → one fresh contract-3 publication of the rebuilt PIM catalog → checks →
// E2E on real models (MODEL → COLOR → gallery → size → real SKU → price → availability → cart → checkout → payment).
// Usage: node tests/.staging/reset-flow.mjs /private/wire-reset.json   (after staging-reset.sh)
import {spawn,spawnSync} from 'node:child_process';import {writeFileSync,readFileSync} from 'node:fs';import {createServer} from 'node:net';import {generateKeyPairSync,createSign,createHash} from 'node:crypto';
import {chunksFor} from '../helpers/site-fixture.mjs';import {chromium} from 'playwright';
const S='/tmp/claude-0/staging',M='/tmp/claude-0/rt/mysql8',MY=M+'/root/usr/bin/mysql',PHP=['-d','pdo_mysql.default_socket='+M+'/mysql.sock'];
const wire=JSON.parse(readFileSync(process.argv[2],'utf8'));
const sql=q=>{const r=spawnSync(MY,['--socket='+M+'/mysql.sock','-uroot','-N','-B','prodcopy','-e',q],{encoding:'utf8',maxBuffer:1<<26});if(r.status)throw Error(r.stderr);return r.stdout.trim();};
const php=a=>{const r=spawnSync('php',[...PHP,...a],{cwd:S+'/www',encoding:'utf8',maxBuffer:1<<26,timeout:1800000});return {status:r.status,out:r.stdout,err:r.stderr};};
const report={steps:[]};const step=(name,ok,extra={})=>{report.steps.push({name,ok,...extra});console.log((ok?'PASS ':'FAIL ')+name,JSON.stringify(extra).slice(0,400));};
const port=await new Promise(r=>{const s=createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});const base='http://127.0.0.1:'+port;
writeFileSync(S+'/www/router.php',"<?php $p=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);if(str_starts_with($p,'/api/')){require __DIR__.'/api/index.php';return;}if(preg_match('~^/product/~',$p)||$p==='/'){require __DIR__.'/storefront.php';return;}return false;");
const server=spawn('php',[...PHP,'-d','session.save_path='+S+'/cache','-d','memory_limit=2G','-d','max_execution_time=0','-S',base.slice(7),'-t',S+'/www',S+'/www/router.php'],{stdio:['ignore','ignore','pipe'],env:{...process.env,PHP_CLI_SERVER_WORKERS:'4'}});let errlog='';server.stderr.on('data',x=>errlog+=x);
const auth={'Authorization':'Bearer staging-pim-key-at-least-24-characters-long','Content-Type':'application/json'};
const post=async(route,body,headers={})=>{const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});return {status:r.status,data:await r.json().catch(()=>null)};};
const get=async(route,headers={})=>{const t=performance.now();const r=await fetch(base+route,{headers});const data=await r.json().catch(()=>null);return {status:r.status,data,ms:Math.round(performance.now()-t)};};
try{
 for(let i=0;i<200;i++){try{if((await fetch(base+'/api/pim/status',{headers:auth})).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 // 1. SITE catalog reset (exact plan + verified backup).
 const backup=S+'/private/backup-before.sql.gz',backupSha=createHash('sha256').update(readFileSync(backup)).digest('hex');
 const planRun=php(['dev/pim-v3-catalog-reset.php','--plan','--out='+S+'/private/catalog-reset-plan.json']);const plan=JSON.parse(planRun.out);
 const apply=php(['dev/pim-v3-catalog-reset.php','--apply','--plan-file='+S+'/private/catalog-reset-plan.json','--plan-sha256='+plan.plan_sha256,'--backup-file='+backup,'--backup-sha256='+backupSha]);
 const done=apply.status===0?JSON.parse(apply.out):null;
 report.site_reset={removed:plan.remove,kept:plan.keep};
 step('SITE catalog reset: catalog tables empty, taxonomy/orders kept',done?.reset==='COMMITTED'&&+sql('SELECT COUNT(*) FROM products')===0&&+sql('SELECT COUNT(*) FROM variants')===0&&JSON.stringify(done.kept)===JSON.stringify(plan.keep),{products_before:plan.remove.products,variants_before:plan.remove.variants,kept:done?.kept,err:apply.err.slice(0,300)});
 // 2. One fresh publication, PIM publisher chunking (100 models).
 let ack;const t0=performance.now();for(const body of chunksFor(wire,{size:100})){ack=await post('/api/pim/sync',body,auth);if(ack.status!==200)break;}
 const kinds=(ack.data?.results||[]).reduce((m,r)=>(m[r.status]=(m[r.status]||0)+1,m),{});
 step('fresh publication COMMITTED, every READY model created',ack.status===200&&ack.data.status==='COMMITTED'&&kinds.created===wire.products.length,{ms:Math.round(performance.now()-t0),kinds,error:ack.status===200?null:JSON.stringify(ack.data).slice(0,300)});
 // 3. Catalog checks.
 const wireSkus=wire.products.flatMap(p=>p.variants.map(v=>v.sku));
 const c={SITE_MODELS:+sql('SELECT COUNT(*) FROM products'),visible:+sql('SELECT COUNT(*) FROM products WHERE visible=1'),legacy:+sql('SELECT COUNT(*) FROM products WHERE pim_contract_version IS NULL'),
  SITE_SKU:+sql('SELECT COUNT(*) FROM variants WHERE pim_active=1'),variants_total:+sql('SELECT COUNT(*) FROM variants'),colors:+sql('SELECT COUNT(*) FROM rubizh_product_colors WHERE active=1'),
  size_options:+sql('SELECT COUNT(*) FROM rubizh_size_options WHERE active=1'),legacy_mappings:+sql('SELECT COUNT(*) FROM rubizh_pim_legacy_mappings'),category_mappings:+sql('SELECT COUNT(*) FROM rubizh_pim_category_mappings'),
  duplicate_names:+sql("SELECT COALESCE(SUM(n-1),0) FROM (SELECT COUNT(*) n FROM products GROUP BY LOWER(TRIM(name)),LOWER(TRIM(brand)) HAVING n>1) x"),pim_categories:+sql('SELECT COUNT(*) FROM rubizh_pim_categories')};
 const slugRows=sql('SELECT id,slug FROM products').split('\n').filter(Boolean).map(l=>l.split('\t'));const want=new Map(wire.products.map(p=>[p.id,p.slug]));
 c.slug_mismatch=slugRows.filter(([id,slug])=>want.get(id)!==slug).length;c.suffixed_urls=slugRows.filter(([id,slug])=>/-\d+$/.test(slug)&&!/-\d+$/.test(want.get(id)||'')).length;
 c.wire_duplicate_skus=wireSkus.length-new Set(wireSkus).size;report.catalog=c;
 step('no legacy products, no -N URLs, no old mappings, one card per READY model',c.SITE_MODELS===wire.products.length&&c.legacy===0&&c.suffixed_urls===0&&c.slug_mismatch===0&&c.legacy_mappings===0&&c.category_mappings===0&&c.SITE_SKU===wireSkus.length&&c.variants_total===wireSkus.length&&c.wire_duplicate_skus===0,c);
 const cat=await get('/shop/catalog.php'),catIn=await get('/shop/catalog.php?availability=in');step('catalog lists exactly the published models',cat.status===200&&cat.data.total===c.visible,{total:cat.data?.total,ms:cat.ms,in_stock_total:catIn.data?.total,in_ms:catIn.ms});
 report.sql_profile=JSON.parse(php(['dev/catalog-sql-profile.php']).out);
 // 4. E2E on real models.
 const {publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});sql(`UPDATE meta SET v='${Buffer.from(publicKey.export({type:'spki',format:'pem'})).toString('base64')}' WHERE k='mono_public_key'`);
 const who=await fetch(base+'/shop/customer.php');const h={Cookie:who.headers.get('set-cookie').split(';')[0]};const csrf=(await who.json()).csrf;
 const contact={name:'Тест Покупець',recipient:'Тест Покупець',phone:'+380671234567',city:'Київ',address:'Відділення 1',delivery_type:'branch'};let n=0;
 const order=async lines=>{const q=await post('/shop/checkout-quote.php',{csrf,lines},h);if(q.status!==200)return {q};const o=await post('/shop/order.php',{csrf,request_id:('7'+(++n)).padEnd(32,'0'),contact,payment:'card',lines,expected_total:q.data.quote.total,catalog_version:q.data.quote.catalog_version},h);return {q,o};};
 const line=(p,v,extra={})=>({product_id:p.id,color_id:v.color_id,sku:v.sku,qty:1,...extra});
 const payable=wire.products.filter(p=>p.colors.length>=2&&p.colors.every(c=>c.photos.length)).flatMap(p=>p.variants.filter(v=>v.payment_allowed&&v.availability_status==='IN_STOCK'&&v.size_display&&p.colors.findIndex(c=>c.id===v.color_id)>0).map(v=>({p,v})))[0];
 const unknown=wire.products.flatMap(p=>p.variants.filter(v=>v.availability_status==='UNKNOWN').map(v=>({p,v})))[0];
 const outOfStock=wire.products.flatMap(p=>p.variants.filter(v=>v.availability_status==='OUT_OF_STOCK').map(v=>({p,v})))[0];
 const preorder=wire.products.flatMap(p=>p.variants.filter(v=>v.availability_status==='PREORDER').map(v=>({p,v})))[0];
 const sizeReq=wire.products.find(p=>(p.size_options||[]).length);
 report.e2e_models={payable:payable&&{id:payable.p.id,sku:payable.v.sku,color:payable.v.color_id,size:payable.v.size_display},unknown:unknown?.v.sku,out:outOfStock?.v.sku,preorder:preorder?.v.sku,size_request:sizeReq?.id};
 // Browser: product → colour → gallery → size → real SKU → price/availability → add to cart.
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});let cartLines=null;
 try{for(const vp of [{width:390,height:844},{width:768,height:1024},{width:1440,height:900}]){
  const page=await browser.newPage({viewport:vp}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.route(/^https:\/\/(?!127)/,r=>r.request().resourceType()==='image'?r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64')}):r.abort());
  const {p,v}=payable,colour=p.colors.find(c=>c.id===v.color_id),label=[colour.color,colour.camouflage].filter(Boolean).join(' / ');
  await page.goto(base+'/product/'+p.slug);await page.waitForLoadState('networkidle');
  await page.getByRole('button',{name:label,exact:true}).first().click({timeout:5000}).catch(()=>{});
  const gallery=await page.waitForFunction(urls=>[...document.querySelectorAll('img')].some(i=>urls.includes(i.getAttribute('src'))),colour.photos,{timeout:5000}).then(()=>true,()=>false);
  const urlColor=page.url().includes('color='+v.color_id);
  await page.getByText(v.size_display,{exact:true}).first().click({timeout:5000}).catch(()=>{});await page.waitForTimeout(300);
  const text=await page.evaluate(()=>document.body.innerText);const priceShown=text.replace(/\s/g,'').includes(String(v.site_price).replace(/\B(?=(\d{3})+(?!\d))/g,''))||text.replace(/\s/g,'').includes(String(v.site_price));
  const available=/В наявності/.test(await page.evaluate(()=>document.body.innerText));await page.locator('text=/^До кошика/i >> visible=true').first().click({timeout:5000}).catch(()=>{});await page.waitForTimeout(500);
  const cart=await page.evaluate(()=>{try{return JSON.parse(localStorage.getItem('rubizh.cart')||'null');}catch{return null;}});
  const items=Array.isArray(cart)?cart:(cart?.items||cart?.lines||[]);const hit=items.find(x=>x.sku===v.sku||x.variant===v.sku||x.v===v.sku);
  if(hit&&!cartLines)cartLines=[{product_id:hit.product_id||hit.id||hit.p||p.id,color_id:hit.color_id||hit.colorId||v.color_id,sku:v.sku,qty:1}];
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  step(`browser ${vp.width}: colour → gallery → size → real SKU → price → availability → cart`,gallery&&urlColor&&priceShown&&available&&!!hit&&!overflow&&!errors.length,{gallery,urlColor,priceShown,available,cart_raw:JSON.stringify(cart).slice(0,160),cart_sku:hit?.sku||hit?.variant||null,overflow,errors:errors.slice(0,2)});
  await page.screenshot({path:S+'/private/reset-e2e-'+vp.width+'.png'});await page.close();}}
 finally{await browser.close();}
 // Checkout from the browser cart line → CONFIRMED → invoice → signed webhook → PAID.
 const pay=await order(cartLines||[line(payable.p,payable.v)]);
 step('checkout: IN_STOCK real SKU → CONFIRMED, price from PIM',pay.o?.data?.order?.order_state==='CONFIRMED'&&pay.o.data.order.payment_ready===true&&Math.round(pay.q.data.quote.total)>=payable.v.site_price,{total:pay.q?.data?.quote?.total,site_price:payable.v.site_price,from_cart:!!cartLines});
 const start=await post('/shop/payment-start.php',{csrf,order_id:pay.o?.data?.order?.id},h);
 const inv=JSON.parse(sql(`SELECT JSON_OBJECT('invoice_id',invoice_id,'amount',amount,'reference',reference) FROM rubizh_mono_invoices WHERE order_id=${pay.o?.data?.order?.id||0} ORDER BY id DESC LIMIT 1`)||'{}');
 const raw=JSON.stringify({invoiceId:inv.invoice_id,status:'success',amount:inv.amount,ccy:980,reference:inv.reference,modifiedDate:new Date().toISOString()});
 const hook=await post('/shop/mono-webhook.php',raw,{'X-Sign':createSign('SHA256').update(raw).sign(privateKey).toString('base64')});
 step('payment: invoice (mock bank) → signed webhook → PAID',start.status===200&&hook.status===200&&sql(`SELECT CONCAT(payment_status,'/',pim_payment_state) FROM rubizh_customer_orders WHERE id=${pay.o?.data?.order?.id||0}`)==='paid/PAID');
 if(unknown){const r=await order([line(unknown.p,unknown.v)]);step('UNKNOWN real SKU → order and payment denied',r.q.status===400,{sku:unknown.v.sku,code:r.q.data?.error_code});}
 if(outOfStock){const r=await order([line(outOfStock.p,outOfStock.v)]);step('OUT_OF_STOCK real SKU → no ordinary checkout',r.q.status===400,{sku:outOfStock.v.sku});}
 if(preorder){const r=await order([line(preorder.p,preorder.v)]);step('PREORDER real SKU → manager confirmation',r.o?.data?.order?.order_state==='WAITING_CONFIRMATION',{sku:preorder.v.sku});}
 if(sizeReq){const opt=sizeReq.size_options[0],col=sizeReq.colors.find(c=>!opt.color_id||c.id===opt.color_id)||sizeReq.colors[0];const before=+sql(`SELECT COUNT(*) FROM variants WHERE product_id='${sizeReq.id}'`);
  const r=await order([{product_id:sizeReq.id,color_id:col.id,option_id:opt.option_id,size:opt.size,qty:1}]);
  step('size without SKU → request, no fake SKU, payment denied',r.o?.data?.order?.order_state==='WAITING_CONFIRMATION'&&(await post('/shop/payment-start.php',{csrf,order_id:r.o.data.order.id},h)).status===400&&+sql(`SELECT COUNT(*) FROM variants WHERE product_id='${sizeReq.id}'`)===before,{model:sizeReq.id,size:opt.size,err:r.q.data?.error_code||r.o?.data?.error_code});}
 if(preorder){const r=await order([line(payable.p,payable.v),line(preorder.p,preorder.v)]);step('mixed cart → whole order WAITING_CONFIRMATION, one payment later',r.o?.data?.order?.order_state==='WAITING_CONFIRMATION'&&r.q.data.quote.order_mode==='REQUEST');}
}catch(e){report.error=String(e.stack||e).slice(0,3000);step('runner',false,{error:report.error.slice(0,300)});}
finally{server.kill();report.ok=report.steps.length>0&&report.steps.every(s=>s.ok);report.server_errors=errlog.split('\n').filter(l=>/Fatal|Warning|Exception/.test(l)).slice(0,10);writeFileSync(S+'/private/reset-flow.json',JSON.stringify(report,null,2));console.log('OK',report.ok);}
