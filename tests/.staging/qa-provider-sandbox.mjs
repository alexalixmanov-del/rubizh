// SITE code against a confirmed monobank SANDBOX and Nova Poshta READONLY lookups (scratch tool, not shipped).
//   ~/Projects/rubizh-test-secrets/run-testing.sh monobank   -- node tests/.staging/qa-provider-sandbox.mjs OUT.json
//   ~/Projects/rubizh-test-secrets/run-testing.sh novaposhta -- node tests/.staging/qa-provider-sandbox.mjs OUT.json
// Isolated fixture with synthetic orders. The bank's webhook/redirect origin is the unreachable sandbox.rubizh.invalid,
// so production never receives callbacks. No payment is made, no TTN is created, no SMS is sent. Keys are never printed.
import {startSite,wire,publish,php} from '/Users/l/Projects/rubizh/tests/helpers/site-fixture.mjs';
import {writeFileSync} from 'node:fs';
const provider=process.env.RUBIZH_INTEGRATION_PROVIDER,mode=process.env.RUBIZH_INTEGRATION_MODE,out=process.argv[2];
const secrets=[process.env.RUBIZH_MONO_TOKEN,process.env.RUBIZH_NP_API_KEY].filter(Boolean);
const clean=x=>{let s=JSON.stringify(x);for(const k of secrets)s=s.split(k).join('<redacted>');return JSON.parse(s);};
const report={provider,mode,started:new Date().toISOString(),checks:[]};
const check=(name,ok,detail={})=>{report.checks.push(clean({name,ok,...detail}));console.log((ok?'PASS ':'FAIL ')+name+' '+JSON.stringify(clean(detail)).slice(0,200));};
if(!(provider==='monobank'&&mode==='sandbox')&&!(provider==='novaposhta'&&mode==='readonly'))throw new Error('Allowed only: monobank sandbox or novaposhta readonly (through run-testing.sh).');
const site=await startSite({extraConfig:",'environment'=>'staging','mono_mock'=>false,'mono_activation_confirmed'=>true,'public_base_url'=>'https://sandbox.rubizh.invalid','np_ttn_enabled'=>false,'staging_allow_loopback'=>true"});
try{
 assert200(await publish(site,structuredClone(wire)),'publish synthetic catalog');
 if(provider==='monobank'){
  const r=await fetch(site.base+'/shop/customer.php');const h={Cookie:r.headers.get('set-cookie').split(';')[0]},csrf=(await r.json()).csrf;
  const model=wire.products.find(p=>p.id==='m-jacket'),line={product_id:'m-jacket',color_id:model.colors.find(c=>c.variant_skus.includes('RUB-F0001')).id,sku:'RUB-F0001',qty:1};
  const q=await site.post('/shop/checkout-quote.php',{csrf,lines:[line],payment:'card'},h);
  const o=await site.post('/shop/order.php',{csrf,request_id:'f'.repeat(32),contact:{name:'Тест Покупець',recipient:'Тест Покупець',phone:'+380671234567',city:'Київ',address:'Відділення 1',delivery_type:'branch'},payment:'card',lines:[line],expected_total:q.data?.quote?.total,catalog_version:q.data?.quote?.catalog_version},h);
  check('synthetic order created',o.status===200,{status:o.status,error:o.data?.error});const id=o.data?.order?.id;
  const a=await site.post('/shop/payment-start.php',{csrf,order_id:id},h);
  const inv=()=>site.sql('SELECT invoice_id,status,amount,reference FROM rubizh_mono_invoices WHERE order_id='+id);
  const first=inv();
  check('sandbox invoice/create through SITE',a.status===200&&first.length===1&&!!first[0].invoice_id,{status:a.status,error:a.data?.error,invoice:first[0]?.invoice_id,status_row:first[0]?.status,payHost:(()=>{try{return new URL(a.data?.payment?.url||a.data?.url||'').host;}catch{return '';}})()});
  const b=await site.post('/shop/payment-start.php',{csrf,order_id:id},h);
  check('second payment-start reuses the open invoice (no double invoice)',inv().length===1,{status:b.status,invoices:inv().length});
  const read=php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${site.site}/auth/bootstrap.php';$db=shopStoreDatabase();$q=$db->prepare('SELECT * FROM rubizh_mono_invoices WHERE order_id=?');$q->execute([${id}]);$i=$q->fetch(PDO::FETCH_ASSOC);monoRefresh($db,$i);$q->execute([${id}]);echo json_encode($q->fetch(PDO::FETCH_ASSOC)['status']);`,{allowFail:true});
  check('sandbox invoice/status read through SITE (no money state change)',read.status===0,{status_after_read:read.stdout.trim(),stderr:read.stderr.slice(0,160)});
  const pay=site.sql('SELECT payment_status FROM rubizh_customer_orders WHERE id='+id)[0]?.payment_status;check('order stays unpaid without a signed webhook',pay==='pending',{payment_status:pay});
  const rm=php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${site.site}/auth/bootstrap.php';$db=shopStoreDatabase();$i=$db->query('SELECT invoice_id FROM rubizh_mono_invoices WHERE order_id=${id}')->fetchColumn();try{monoApi('invoice/remove',['invoiceId'=>$i]);$e=monoApi('invoice/status?invoiceId='.rawurlencode($i));echo json_encode(['removed'=>true,'bank_status'=>$e['status']??null]);}catch(Throwable $x){echo json_encode(['removed'=>false,'error'=>$x->getMessage()]);}`,{allowFail:true});
  let rmj={};try{rmj=JSON.parse(rm.stdout);}catch{rmj={raw:rm.stdout.slice(0,120)};}
  check('sandbox invoice/remove (cancel unpaid invoice) and status after removal',rmj.removed===true,rmj);
 }else{
  const dir=async(qs)=>{const r=await fetch(site.base+'/shop/np-directory.php?'+qs);let j=null;try{j=await r.json();}catch{}return {status:r.status,j};};
  const c=await dir('kind=cities&q='+encodeURIComponent('Київ'));
  check('city search through SITE (Address.getCities)',c.status===200&&c.j?.enabled===true&&(c.j?.items||[]).length>0,{status:c.status,items:(c.j?.items||[]).length,first:c.j?.items?.[0]?.name});
  const ref=c.j?.items?.[0]?.ref||'';
  const w=await dir('kind=warehouses&type=branch&city_ref='+encodeURIComponent(ref)+'&q=1');
  check('branch search through SITE (Address.getWarehouses)',w.status===200&&(w.j?.items||[]).length>0,{status:w.status,items:(w.j?.items||[]).length,first:w.j?.items?.[0]?.name});
  const none=await dir('kind=cities&q='+encodeURIComponent('Ззззнеіснуюче'));
  check('no-result search is a clean empty list',none.status===200&&Array.isArray(none.j?.items)&&none.j.items.length===0,{status:none.status,items:(none.j?.items||[]).length});
  const bad=await dir('kind=warehouses&type=branch&city_ref=not-a-ref&q=1');
  check('invalid city reference is rejected without a provider call',bad.status!==500,{status:bad.status,error:bad.j?.error});
  const long=await dir('kind=cities&q='+'а'.repeat(81));
  check('over-long query refused',long.status>=400||long.j?.ok===false,{status:long.status,error:long.j?.error});
 }
}finally{site.stop();report.finished=new Date().toISOString();if(out)writeFileSync(out,JSON.stringify(report,null,1));}
function assert200(r,name){if(r.status!==200)throw new Error(name+' failed: '+r.status);}
