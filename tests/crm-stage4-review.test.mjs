// Stage 4 independent review (ecc:security-reviewer + ecc:code-reviewer): regression tests for every finding fixed
// before the Quality Gate (R4-01…). Real HTTP against an isolated SITE copy; mock bank and NP.
import {test} from 'node:test';import assert from 'node:assert/strict';import {createHash,createHmac} from 'node:crypto';
import {startCrm,line,password,staffEmail} from './helpers/crm-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const key=()=>crypto.randomUUID().replaceAll('-','');
function totp(secret,offset=0){const a='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const c of secret)bits+=a.indexOf(c).toString(2).padStart(5,'0');const k=Buffer.from(bits.match(/.{8}/g).map(b=>parseInt(b,2)));const step=Math.floor(Date.now()/30000)+offset;const msg=Buffer.alloc(8);msg.writeBigUInt64BE(BigInt(step));const h=createHmac('sha1',k).update(msg).digest();const o=h[19]&15;return String(((h[o]&127)<<24|h[o+1]<<16|h[o+2]<<8|h[o+3])%1e6).padStart(6,'0');}
function solve(nonce,bits){for(let n=0;;n++){const h=createHash('sha256').update(nonce+':'+n).digest();let z=0;for(const b of h){if(b===0){z+=8;continue;}z+=Math.clz32(b)-24;break;}if(z>=bits)return String(n);}}
/** Raw staff session: login body extras (totp, backup_code, rate_proof) and calls with Idempotency-Key. */
async function session(s,email,extra={},pw=password){
 let r=await fetch(s.base+'/api/staff/auth/session');let cookie=r.headers.get('set-cookie').split(';')[0];let csrf=(await r.json()).meta.csrf;
 r=await fetch(s.base+'/api/staff/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie,'X-CSRF-Token':csrf},body:JSON.stringify({email,password:pw,...extra})});
 const body=await r.json();if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];if(body.meta?.csrf)csrf=body.meta.csrf;
 const me={status:r.status,body,cookie,csrf};
 me.call=async(method,path,data,{idem=key()}={})=>{const res=await fetch(s.base+'/api/staff'+path,{method,headers:{'Content-Type':'application/json',Cookie:me.cookie,'X-CSRF-Token':me.csrf,...(idem?{'Idempotency-Key':idem}:{})},body:method==='GET'?undefined:JSON.stringify(data??{})});const text=await res.text();let j;try{j=JSON.parse(text);}catch{j={raw:text};}if(j.meta?.csrf)me.csrf=j.meta.csrf;return {status:res.status,data:j.data,error:j.error,raw:j.raw};};
 me.get=p=>me.call('GET',p);me.post=(p,d,o)=>me.call('POST',p,d,o);return me;
}
const ok=r=>{assert.ok(r.status<300,JSON.stringify(r).slice(0,400));return r.data;};
const version=async(c,id)=>ok(await c.get('/orders/'+id)).version;
async function paidOrder(s,owner,lines=[line()]){const o=await s.checkout(lines);ok(await owner.post('/orders/'+o.id+'/invoice',{expected_version:await version(owner,o.id)}));assert.equal((await s.webhook(s.sql('SELECT * FROM rubizh_mono_invoices WHERE order_id='+o.id+' AND invoice_id IS NOT NULL ORDER BY id DESC LIMIT 1')[0])).status,200);return o;}
async function senders(s,owner){const profile=ok(await owner.get('/settings')).sender_profiles.find(p=>p.code==='m_vin');assert.equal((await owner.call('PUT','/settings/senders/m_vin',{...profile,name:'Склад',city:'Київ',region:'Київська',branch:'1',city_ref:s.ref(10),warehouse_ref:s.ref(20),sender_ref:s.ref(1),contact_ref:s.ref(2),phone:'+380671234567',confirmed:true,reason:'Реквізити НП для перевірки'})).status,200);}
async function shipped(s,owner,o){await senders(s,owner);const c=ok(await owner.get('/orders/'+o.id));const d=ok(await owner.post('/orders/'+o.id+'/shipments',{expected_version:c.version,supplier_code:c.fulfillment_lines[0].supplier_code,availability_confirmed:true,lines:[{line_no:0,qty:1}],package:{places:[{weight:1,length:30,width:20,height:10}]}}));const sid=d.parcels[0].id;ok(await owner.post('/shipments/'+sid+'/create',{expected_version:d.version}));return sid;}

test('R4-01: per-account failure limit across addresses, second-factor failure limit, backup code works once under concurrency',{skip,timeout:300000},async()=>{
 const s=await startCrm({totp:true});
 try{
  // OWNER enrols (provisioned staff hold an enrolment grant), then a backup code is raced by two logins.
  const first=await session(s,staffEmail('OWNER'));assert.equal(first.status,200,JSON.stringify(first.body));
  const setup=ok(await first.post('/auth/totp/setup',{}));const enabled=ok(await first.post('/auth/totp/enable',{code:totp(setup.secret)}));const backup=enabled.backup_codes[0];
  const race=await Promise.all([session(s,staffEmail('OWNER'),{backup_code:backup}),session(s,staffEmail('OWNER'),{backup_code:backup})]);
  assert.equal(race.filter(r=>r.status===200).length,1,'one backup code, one login: '+race.map(r=>r.status));
  // Second factor: 5 wrong codes, then even a right one waits (429) — no proof of work can bypass it.
  // (the losing backup-code login above already counted as one failed second factor)
  let limited=false;for(let i=0;i<6&&!limited;i++)limited=(await session(s,staffEmail('OWNER'),{totp:'000000'})).status===429;assert.ok(limited,'wrong codes reach the limit');
  assert.equal((await session(s,staffEmail('OWNER'),{totp:totp(setup.secret)})).status,429,'TOTP failures are limited per account');
  // Password: 20 failures for one account (proof of work after 8 is solved every time), then the right password waits.
  const target=staffEmail('MANAGER');
  // One browser session: the proof is bound to the session that received the challenge.
  let r0=await fetch(s.base+'/api/staff/auth/session');const cookie=r0.headers.get('set-cookie').split(';')[0];let csrf=(await r0.json()).meta.csrf;
  const attempt=async(pw,proof)=>{const r=await fetch(s.base+'/api/staff/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie,'X-CSRF-Token':csrf},body:JSON.stringify({email:target,password:pw,...(proof?{rate_proof:proof}:{})})});const j=await r.json();if(j.meta?.csrf)csrf=j.meta.csrf;return {status:r.status,body:j};};
  let counted=0;for(let i=0;counted<20&&i<60;i++){let r=await attempt('wrong-password-'+i);if(r.status===428){const c=r.body.error.details.challenge;assert.ok(c.bits>=18);r=await attempt('wrong-password-'+i,solve(c.nonce,c.bits));}if(r.status===401)counted++;else if(r.status===429)break;}
  const locked=await session(s,target);assert.equal(locked.status,429,'per-account limit across addresses: '+JSON.stringify(locked.body));
 }finally{s.stop();}
});

test('R4-02/R4-04/R4-05: order card hides NP payloads and finance from WAREHOUSE; wholesale and return lists are redacted; phone reveal is limited',{skip,timeout:300000},async()=>{
 const s=await startCrm();
 try{
  const owner=await session(s,staffEmail('OWNER'));const o=await paidOrder(s,owner);await shipped(s,owner,o);
  const wh=await session(s,staffEmail('WAREHOUSE'));const wcard=ok(await wh.get('/orders/'+o.id));const text=JSON.stringify(wcard);
  for(const k of ['payload_json','result_json','origin_json','declared_value','delivery_cost','RecipientsPhone','SendersPhone'])assert.ok(!text.includes(k),'WAREHOUSE card has no '+k);
  const ocard=ok(await owner.get('/orders/'+o.id));assert.ok(!JSON.stringify(ocard).includes('payload_json'),'nobody gets NP payloads');assert.ok('declared_value' in ocard.shipments[0],'OWNER keeps declared value');
  // Wholesale requests: masked phone in the list, full number only through the audited reveal.
  s.sql("INSERT INTO rubizh_wholesale_requests(number,request_id,payload_hash,name,phone,buyer_type,composition,priority,consent_at,created_at,updated_at) VALUES('WS-261015-AAAAAA','"+'a'.repeat(32)+"','"+'b'.repeat(64)+"','Ігор','+380671112233','MILITARY','Куртка M','PRICE',UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP())");
  const mgr=await session(s,staffEmail('MANAGER'));const ws=ok(await mgr.get('/wholesale')).rows[0];assert.ok(!('phone' in ws)&&ws.phone_masked,'masked wholesale phone');
  const rev=ok(await mgr.post('/wholesale/'+ws.id+'/phone',{}));assert.equal(rev.phone,'+380671112233');assert.equal(+s.sql("SELECT COUNT(*) n FROM rubizh_staff_audit WHERE action='wholesale.phone_view'")[0].n,1);
  // Returns: refund amounts are finance data.
  s.sql("UPDATE rubizh_order_shipments SET status='delivered' WHERE order_id="+o.id);
  const ret=await owner.post('/returns',{order_id:o.id,lines:[{line_no:0,qty:1}],reason:'Не підійшов розмір',expected_version:await version(owner,o.id)});assert.ok(ret.status<300,JSON.stringify(ret));
  const wr=JSON.stringify(ok(await wh.get('/returns')));assert.ok(!/refund_minor|refund_allocations/.test(wr.replace(/"refund_(minor|allocations[a-z_]*)":null/g,'')),'WAREHOUSE returns without refund amounts: '+wr.slice(0,300));
  // Phone reveal: 30 per hour per staff member, then 429.
  const cust='order:'+o.id;let last;for(let i=0;i<31;i++)last=await mgr.post('/customers/'+encodeURIComponent(cust)+'/phone',{});assert.equal(last.status,429,'reveal quota');
  // Roles without the full-phone right cannot probe numbers through search.
  const acc=await session(s,staffEmail('ACCOUNTANT'));assert.equal(ok(await acc.get('/orders?q=0671234567')).pagination.total,0,'no phone search without customer.phone.full');
  assert.ok(ok(await owner.get('/orders?q=0671234567')).pagination.total>0,'OWNER finds by phone');
 }finally{s.stop();}
});

test('R4-03/R4-12: MANAGER changes shipments and returns only on own or unassigned orders; task and notification abuse limited',{skip,timeout:300000},async()=>{
 const s=await startCrm();
 try{
  s.sql("INSERT INTO rubizh_staff_users(id,email,name,password_hash,role,created_at,updated_at) SELECT 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','manager.b@fixture.test','Менеджер Б',password_hash,'MANAGER',UTC_TIMESTAMP(),UTC_TIMESTAMP() FROM rubizh_staff_users WHERE email='"+staffEmail('MANAGER')+"'");
  const owner=await session(s,staffEmail('OWNER'));const o=await paidOrder(s,owner);await senders(s,owner);
  const a=await session(s,staffEmail('MANAGER'));ok(await a.post('/orders/'+o.id+'/assign',{expected_version:await version(a,o.id)}));
  const b=await session(s,'manager.b@fixture.test');const c=ok(await b.get('/orders/'+o.id));
  const draft=await b.post('/orders/'+o.id+'/shipments',{expected_version:c.version,supplier_code:c.fulfillment_lines[0].supplier_code,availability_confirmed:true,lines:[{line_no:0,qty:1}],package:{places:[{weight:1,length:30,width:20,height:10}]}});
  assert.equal(draft.status,403);assert.equal(draft.error.code,'ORDER_NOT_ASSIGNED');
  const ret=await b.post('/returns',{order_id:o.id,lines:[{line_no:0,qty:1}],reason:'Чужий менеджер',expected_version:c.version});assert.equal(ret.status,403,JSON.stringify(ret));
  // Tasks: only the assignee, the author or the OWNER changes a task.
  const t=ok(await a.post('/tasks',{title:'Передзвонити',order_id:o.id}));const upd=await b.post('/tasks/'+t.id,{state:'DONE',version:t.version});assert.equal(upd.status,403,JSON.stringify(upd));
  // Customer TTN notice: once per TTN within 10 minutes.
  const sid=await shipped(s,owner,o);assert.ok((await owner.post('/shipments/'+sid+'/notify',{})).status<300);assert.equal((await owner.post('/shipments/'+sid+'/notify',{})).status,429,'notify cooldown');
 }finally{s.stop();}
});

test('R4-06/R4-07/R4-09: invite links are not kept in the idempotency store; TOTP enrolment needs a grant; legacy staff routes and password change follow the policy',{skip,timeout:300000},async()=>{
 const s=await startCrm({totp:true});
 try{
  const owner=await session(s,staffEmail('OWNER'));const setup=ok(await owner.post('/auth/totp/setup',{}));ok(await owner.post('/auth/totp/enable',{code:totp(setup.secret)}));
  const o2=await session(s,staffEmail('OWNER'),{totp:totp(setup.secret,1)});
  const inv=ok(await o2.post('/staff/invite',{email:'buh2@fixture.test',name:'Бухгалтер',role:'ACCOUNTANT',reason:'Новий бухгалтер команди'}));assert.match(inv.url,/token=/);
  const token=new URL(inv.url,'http://x').searchParams.get('token');
  assert.equal(+s.sql("SELECT COUNT(*) n FROM rubizh_crm_idempotency WHERE response_json LIKE '%"+token+"%'")[0].n,0,'token is not stored in plain text');
  // Without an enrolment grant the password alone cannot attach an authenticator.
  s.sql("UPDATE rubizh_staff_invites SET used_at=UTC_TIMESTAMP() WHERE kind='enroll' AND staff_id=(SELECT id FROM rubizh_staff_users WHERE email='"+staffEmail('ACCOUNTANT')+"')");
  const acc=await session(s,staffEmail('ACCOUNTANT'));const denied=await acc.post('/auth/totp/setup',{});assert.equal(denied.status,403,JSON.stringify(denied));assert.equal(denied.error.code,'TOTP_ENROLL_GRANT_REQUIRED');
  // The invite link itself grants enrolment.
  let r=await fetch(s.base+'/api/staff/auth/session');const cookie=r.headers.get('set-cookie').split(';')[0];const csrf=(await r.json()).meta.csrf;
  r=await fetch(s.base+'/api/staff/auth/token/accept',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie,'X-CSRF-Token':csrf},body:JSON.stringify({token,password:'Kvitka-Sad-2026-Lypen'})});assert.ok(r.status<300,await r.text());
  const nb=await session(s,'buh2@fixture.test',{},'Kvitka-Sad-2026-Lypen');assert.equal((await nb.post('/auth/totp/setup',{})).status,200);
  // Legacy staff form: weak password refused like everywhere else.
  const weak=await o2.call('POST','/settings/staff',{email:'weak2@fixture.test',name:'Слабкий',role:'MANAGER',password:'aaaaaaaaaaaaaa',reason:'Перевірка політики паролів'});assert.equal(weak.status,400,JSON.stringify(weak));
  // Password change: wrong current passwords are limited.
  let last;for(let i=0;i<9;i++)last=await o2.post('/me/password',{current:'wrong-current-'+i,password:'Another-Strong-2026-Pass'});assert.equal(last.status,429,'password change attempts limited: '+last.status);
 }finally{s.stop();}
});

test('R4-10: stale reserve rows do not break re-reservation; cancel refused before closing the bank invoice; a returned order cannot be completed; bulk assign answers per row; export phone; bad dates',{skip,timeout:300000},async()=>{
 const s=await startCrm();
 try{
  const owner=await session(s,staffEmail('OWNER'));
  // A line removal re-reserves the surviving lines even when an EXPIRED reservation row exists for them.
  const two=[line(),{...line(),qty:1}];const o1=await s.checkout([{...line(),qty:2}]);void two;
  s.sql("UPDATE rubizh_stock_reservations SET status='EXPIRED' WHERE order_id="+o1.id);
  const php=(await import('./helpers/site-fixture.mjs')).php;
  const relined=php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${s.site}/staff/bootstrap.php';$db=shopStoreDatabase();$o=npOrder($db,${o1.id});try{$db->beginTransaction();shopReserveLines($db,${o1.id},array_map(fn($l)=>['sku'=>$l['sku'],'qty'=>(float)$l['qty'],'availability'=>'in','stock_confirmed'=>true],npLines($db,${o1.id})),gmdate('Y-m-d H:i:s',time()+3600));$db->commit();echo 'ok',json_encode($db->query('SELECT status FROM rubizh_stock_reservations WHERE order_id=${o1.id}')->fetchAll(PDO::FETCH_COLUMN));}catch(Throwable $e){echo get_class($e),': ',$e->getMessage();}`,{allowFail:true}).stdout;
  assert.equal(relined,'ok["ACTIVE"]','a stale EXPIRED row is revived, not a conflict');
  // Cancel: a guard failure must not close the open bank invoice first.
  const o2=await s.checkout([line()]);ok(await owner.post('/orders/'+o2.id+'/invoice',{expected_version:await version(owner,o2.id)}));
  s.sql("INSERT INTO rubizh_order_shipments(order_id,supplier_code,status,tracking_number,created_at,updated_at) VALUES("+o2.id+",'m_vin','created','20450000000001',UTC_TIMESTAMP(),UTC_TIMESTAMP())");
  const cancel=await owner.post('/orders/'+o2.id+'/cancel',{reason:'Покупець відмовився',expected_version:await version(owner,o2.id)});assert.ok(cancel.status>=400,JSON.stringify(cancel));
  assert.equal(s.sql("SELECT status FROM rubizh_mono_invoices WHERE order_id="+o2.id+" AND invoice_id IS NOT NULL")[0].status,'created','the bank invoice stays open when the cancellation is refused');
  // A returned order cannot be completed.
  const o3=await paidOrder(s,owner);const sid=await shipped(s,owner,o3);s.sql("UPDATE rubizh_order_shipments SET status='delivered' WHERE id="+sid);s.sql("UPDATE rubizh_customer_orders SET status='returned' WHERE id="+o3.id);
  const done=await owner.post('/orders/'+o3.id+'/complete',{expected_version:await version(owner,o3.id)});assert.ok(done.status>=400,'returned order is not completed: '+JSON.stringify(done));
  // Bulk assign: every row answers, including one that fails.
  const o4=await s.checkout([line()]);const bulk=ok(await owner.post('/orders/bulk/assign',{ids:[o4.id,999999],versions:{[o4.id]:await version(owner,o4.id),999999:'x'},staff_id:null,reason:'Перерозподіл замовлень'}));
  assert.equal((bulk.results??bulk.rows??[]).length,2,JSON.stringify(bulk));
  // CSV export carries the masked phone, not an empty column.
  const res=await owner.call('GET','/orders/export');assert.match(res.raw??'',/\+380 67 \*\*\* \*\* 67/,'masked phone in the export');
  // Task with an impossible date is a validation error, not 500.
  const bad=await owner.post('/tasks',{title:'Передзвонити',due_at:'2026-13-45'});assert.equal(bad.status,400,JSON.stringify(bad));
 }finally{s.stop();}
});
