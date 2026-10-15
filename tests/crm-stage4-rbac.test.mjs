// Stage 4 RBAC matrix (ТЗ §8): derived from contracts/crm/crm-api.json — every staff route × every role.
// Allowed → never 401/403/5xx; denied → 403 PERMISSION_DENIED; no session → 401; a customer session → 401.
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';
import {startCrm,line,roles5} from './helpers/crm-fixture.mjs';import {root} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const contract=JSON.parse(readFileSync(root+'/contracts/crm/crm-api.json','utf8'));
const key=()=>crypto.randomUUID().replaceAll('-','');
test('RBAC matrix: every contract route × every role, anonymous and customer sessions',{skip,timeout:900000},async()=>{
 const s=await startCrm();
 try{
  const o=await s.checkout([line()]);
  s.sql("INSERT INTO rubizh_mono_invoices(order_id,reference,amount,status,created_at,updated_at) VALUES("+o.id+",'rbac-ref',286000,'created',UTC_TIMESTAMP(),UTC_TIMESTAMP())");const inv=s.sql('SELECT id FROM rubizh_mono_invoices')[0].id;
  s.sql("INSERT INTO rubizh_order_shipments(order_id,supplier_code,status,created_at,updated_at) VALUES("+o.id+",'m_vin','draft',UTC_TIMESTAMP(),UTC_TIMESTAMP())");const ship=s.sql('SELECT id FROM rubizh_order_shipments')[0].id;
  s.sql("INSERT INTO rubizh_returns(order_id,state,lines_json,reason,refund_expected_minor,created_by,request_id,created_at,updated_at) VALUES("+o.id+",'REQUESTED','[]','RBAC fixture return',0,'11111111111111111111111111111111','"+key()+"',UTC_TIMESTAMP(),UTC_TIMESTAMP())");const ret=s.sql('SELECT id FROM rubizh_returns')[0].id;
  s.sql("INSERT INTO rubizh_crm_tasks(title,body,state,created_by,created_at,updated_at) VALUES('RBAC','','OPEN','11111111111111111111111111111111',UTC_TIMESTAMP(),UTC_TIMESTAMP())");
  const params={id:String(o.id),line:'0',cid:'order:'+o.id,rid:'review:999999',pid:'m-jacket',code:'m_vin',sid:'44444444444444444444444444444444'};
  const idFor=p=>p.startsWith('/payments/')?inv:p.startsWith('/shipments/')?ship:p.startsWith('/returns/')?ret:['/tasks/','/views/','/wholesale/'].some(x=>p.startsWith(x))?1:o.id;
  const pathFor=r=>r.path.replace('{id}',String(idFor(r.path))).replace(/\{(\w+)\}/g,(_,k)=>params[k]);
  const staffRoutes=contract.routes.filter(r=>r.auth==='staff');
  const sessions={};for(const role of roles5)sessions[role]=await s.login(role);
  const matrix=[];const failures=[];
  const call=async(sess,r)=>{const headers={'Idempotency-Key':key(),'Content-Type':'application/json','X-CSRF-Token':sess?.csrf??''};if(sess?.cookie)headers.Cookie=sess.cookie;const res=await fetch(s.base+'/api/staff'+pathFor(r)+(r.query==='SearchQuery'?'?q=RB':''),{method:r.method,headers,body:r.method==='GET'?undefined:'{}'});const ct=res.headers.get('content-type')||'';const body=ct.includes('json')?await res.json():await res.text();return {status:res.status,code:body?.error?.code};};
  const revive=async()=>{for(const x of roles5)if((await sessions[x].get('/me')).status!==200)sessions[x]=await s.login(x);};
  for(const r of staffRoutes){
   const row={id:r.id,method:r.method,path:r.path,permission:r.permission};
   for(const role of roles5){
    const allowed=contract.permissions[r.permission].includes(role);const res=await call(sessions[role],r);row[role]=res.status;
    // A MANAGER outside their own orders is permitted by role but limited by scope: 403 ORDER_NOT_ASSIGNED.
    const scoped=role==='MANAGER'&&res.status===403&&res.code==='ORDER_NOT_ASSIGNED';
    if(allowed&&!scoped&&([401,403].includes(res.status)||res.status>=500))failures.push(`${role} ${r.method} ${r.path} expected allowed, got ${res.status} ${res.code}`);
    if(!allowed&&!(res.status===403&&res.code==='PERMISSION_DENIED'))failures.push(`${role} ${r.method} ${r.path} expected 403, got ${res.status} ${res.code}`);
    if(['staff.logout','staff.update','me.sessions.revoke','me.password','auth.logout'].includes(r.id))await revive();
   }
   const anon=await call({cookie:'',csrf:''},r);row.ANON=anon.status;if(anon.status!==401)failures.push(`ANON ${r.method} ${r.path} expected 401, got ${anon.status}`);
   const cust=await call({cookie:'rubizh_account=forged; PHPSESSID=forged',csrf:'x'},r);row.CUSTOMER=cust.status;if(cust.status!==401)failures.push(`CUSTOMER ${r.method} ${r.path} expected 401, got ${cust.status}`);
   matrix.push(row);
  }
  if(process.env.RUBIZH_TEST_REPORTS)writeFileSync(process.env.RUBIZH_TEST_REPORTS+'/crm-rbac-matrix.json',JSON.stringify({routes:matrix.length,roles:roles5,matrix},null,1));
  assert.deepEqual(failures,[],failures.join('\n'));
  assert.equal(matrix.length,staffRoutes.length);assert.ok(matrix.length>=80,'every staff route is covered');
 }finally{s.stop();}
});
