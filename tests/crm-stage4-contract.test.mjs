// Contract-first checks (stage 4): generated artefacts are current, every contract route has a handler, real responses
// match their JSON Schemas, and the staging mocks answer with the live providers' response shapes.
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync,existsSync} from 'node:fs';import {spawnSync} from 'node:child_process';
import {startCrm,line,staffEmail,password} from './helpers/crm-fixture.mjs';import {root,php} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const c=JSON.parse(readFileSync(root+'/contracts/crm/crm-api.json','utf8'));
/** Same keyword set as staff/contract.php (crmSchemaErrors). */
function errors(v,s,p='$'){
 if(typeof s==='string')s=c.definitions[s];if(s.$ref)return errors(v,s.$ref,p);const out=[];
 const isObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
 if(s.type){const ok=[].concat(s.type).some(t=>t==='object'?isObj(v)||Array.isArray(v)&&v.length===0:t==='array'?Array.isArray(v):t==='integer'?Number.isInteger(v):t==='number'?typeof v==='number':t==='null'?v===null:typeof v===t);if(!ok)return [p+' type '+[].concat(s.type)];}
 if('const' in s&&v!==s.const)out.push(p+' const');if(s.enum&&!s.enum.includes(v))out.push(p+' enum '+v);
 if(typeof v==='string'&&s.pattern&&!new RegExp(s.pattern,'u').test(v))out.push(p+' pattern');
 if(isObj(v)){for(const k of s.required??[])if(!(k in v))out.push(p+'.'+k+' required');for(const [k,x] of Object.entries(v))if(s.properties?.[k])out.push(...errors(x,s.properties[k],p+'.'+k));else if(s.additionalProperties===false)out.push(p+'.'+k+' additional');}
 if(Array.isArray(v)&&s.items)v.forEach((x,i)=>out.push(...errors(x,s.items,p+'['+i+']')));
 for(const part of s.allOf??[])out.push(...errors(v,part,p));if(s.anyOf&&!s.anyOf.some(part=>!errors(v,part,p).length))out.push(p+' anyOf');
 return out;
}
test('generated RBAC/API docs and CRM TypeScript types are up to date with the contract',{},()=>{
 const crm=process.env.RUBIZH_CRM_DIR||'/workspace/crm.rubizh';
 const r=spawnSync(process.execPath,[root+'/dev/crm-contract-gen.mjs','--check',...(existsSync(crm+'/src/contract.gen.ts')?['--crm',crm]:[])],{encoding:'utf8'});
 assert.equal(r.status,0,r.stdout+r.stderr);
});
test('every contract route has a server handler and every permission is granted to at least OWNER',{},()=>{
 const src=['staff/orders4.php','staff/lists.php','staff/router.php'].map(f=>readFileSync(root+'/'+f,'utf8')).join('\n');
 for(const r of c.routes)assert.ok(src.includes(`'${r.id}'`),'handler for '+r.id);
 for(const [p,roles] of Object.entries(c.permissions))assert.ok(roles.includes('OWNER'),p);
 for(const r of c.routes){if(r.request)assert.ok(c.definitions[r.request],r.id+' request');if(r.response!=='csv')assert.ok(c.definitions[r.response],r.id+' response');if(r.permission)assert.ok(c.permissions[r.permission],r.id+' permission');}
});
test('real Staff API responses validate against the contract schemas',{skip,timeout:240000},async()=>{
 const s=await startCrm();
 try{
  const o=await s.checkout([line()]);const owner=await s.login('OWNER');
  const routes={'/auth/session':'auth.session','/me':'me.view','/dashboard?period=30d':'dashboard','/orders':'orders.list','/orders/counters':'orders.counters',['/orders/'+o.id]:'orders.view','/customers':'customers.list',['/customers/order:'+o.id]:'customers.view','/payments':'payments.list','/payments/review':'payments.review.list','/shipments':'shipments.list','/returns':'returns.list','/products':'products.list','/products/m-jacket':'products.view','/suppliers':'suppliers.list','/suppliers/m_vin':'suppliers.view','/tasks':'tasks.list','/notifications':'notifications.list','/views':'views.list','/staff/assignees':'staff.assignees','/staff':'staff.list','/audit':'audit.list','/analytics?period=30d':'analytics','/settings':'settings.view','/search?q=RB':'search','/me/sessions':'me.sessions','/wholesale':'wholesale.list'};
  for(const [path,id] of Object.entries(routes)){const r=await owner.get(path);assert.equal(r.status,200,path+' '+JSON.stringify(r.data).slice(0,300));const route=c.routes.find(x=>x.id===id);const e=errors(r.data.data,route.response);assert.deepEqual(e,[],id+': '+e.join(', '));assert.match(r.data.meta.request_id,/^[a-f0-9]{32}$/);}
  const err=await owner.get('/orders/999999');assert.equal(err.status,404);assert.deepEqual(Object.keys(err.data.error).sort(),['code','details','message']);assert.match(err.data.error.message,/\p{Script=Cyrillic}/u);
 }finally{s.stop();}
});
test('staging mocks answer with the live provider shapes the SITE code validates (NP TTN, tracking, MonoPay refund)',{skip,timeout:180000},async()=>{
 const s=await startCrm({extraConfig:",'np_mock'=>true"});
 try{
  const r=php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${s.site}/auth/bootstrap.php';require_once '${s.site}/shop/np-mock.php';require_once '${s.site}/shop/mono-mock.php';$_SERVER['HTTP_HOST']='127.0.0.1';
   $doc=npMockApi('InternetDocument','save',['InfoRegClientBarcodes'=>'RB-${'a'.repeat(32)}']);$track=npMockApi('TrackingDocument','getStatusDocuments',['Documents'=>[['DocumentNumber'=>$doc[0]['IntDocNumber']]]]);
   $wh=npMockApi('Address','getWarehouses',['CityRef'=>npMockCities()[0]['Ref']]);try{npMockApi('InternetDocument','save',['BackwardDeliveryData'=>[['PayerType'=>'Recipient']]]);$cod='ACCEPTED';}catch(Throwable $e){$cod='REFUSED';}
   $cancel=monoMockApi('invoice/cancel',['invoiceId'=>'x','extRef'=>'crm-1','amount'=>100]);
   echo json_encode(['ref'=>npRef($doc[0]['Ref']),'ttn'=>$doc[0]['IntDocNumber'],'track'=>$track[0],'wh'=>npRef($wh[0]['Ref']),'cod'=>$cod,'cancel'=>$cancel]);`);
  const out=JSON.parse(r.stdout);assert.equal(out.ref,true);assert.match(out.ttn,/^2045\d{10}$/);assert.deepEqual(Object.keys(out.track).sort(),['Number','StatusCode','WarehouseRecipient']);assert.equal(out.wh,true);
  assert.equal(out.cod,'REFUSED','A5: COD fields are refused even by the mock');assert.deepEqual([out.cancel.status,out.cancel.amount,out.cancel.extRef],['success',100,'crm-1']);
  void staffEmail;void password;
 }finally{s.stop();}
});
// S4-01: a mutation that returns the order card returns the whole card (history, tasks…), or the CRM card crashes
// after the action (seen in E2E: «Створити відправлення» left a blank screen).
test('S4-01: order mutations return the full card that the CRM renders (validated against the Order schema)',{skip,timeout:240000},async()=>{
 const s=await startCrm();
 try{
  const o=await s.checkout([line()]);const owner=await s.login('OWNER');const v=async()=>(await owner.get('/orders/'+o.id)).data.data.version;
  const check=(r,id)=>{assert.ok(r.status<300,id+' '+JSON.stringify(r.data).slice(0,300));const e=errors(r.data.data,'Order');assert.deepEqual(e,[],id+': '+e.join(', '));return r.data.data;};
  check(await owner.send('/orders/'+o.id+'/assign',{expected_version:await v()}),'orders.assign');
  check(await owner.send('/orders/'+o.id+'/invoice',{expected_version:await v()}),'orders.invoice');
  assert.equal((await s.webhook(s.sql('SELECT * FROM rubizh_mono_invoices WHERE invoice_id IS NOT NULL')[0])).status,200);
  check(await owner.send('/orders/'+o.id+'/packing',{expected_version:await v()}),'orders.packing');
  const profile=(await owner.get('/settings')).data.data.sender_profiles.find(p=>p.code==='m_vin');
  assert.equal((await owner.send('/settings/senders/m_vin',{...profile,name:'Склад',city:'Київ',region:'Київська',branch:'1',city_ref:s.ref(10),warehouse_ref:s.ref(20),sender_ref:s.ref(1),contact_ref:s.ref(2),phone:'+380671234567',confirmed:true,reason:'Реквізити НП для перевірки контракту'},'PUT')).status,200);
  const card=(await owner.get('/orders/'+o.id)).data.data;const supplier=card.fulfillment_lines[0].supplier_code;
  const draft=check(await owner.send('/orders/'+o.id+'/shipments',{expected_version:card.version,request_id:crypto.randomUUID().replaceAll('-',''),supplier_code:supplier,availability_confirmed:true,lines:[{line_no:0,qty:1}],package:{places:[{weight:1,length:30,width:20,height:10}]}}),'orders.shipment.draft');
  const sid=draft.parcels[0].id;
  check(await owner.send('/shipments/'+sid+'/create',{expected_version:await v()}),'shipments.create');
  check(await owner.send('/shipments/'+sid+'/refresh',{expected_version:await v()}),'shipments.refresh');
  check(await owner.send('/orders/'+o.id+'/complete',{expected_version:await v()}),'orders.complete');
  check(await owner.send('/orders/'+o.id+'/problem',{expected_version:await v(),flag:true,reason:'Перевірка повної картки'}),'orders.problem');
 }finally{s.stop();}
});
