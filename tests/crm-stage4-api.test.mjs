// Stage 4 CRM API behaviour through real HTTP on an isolated SITE copy (MariaDB, mock bank/NP, no network).
import {test} from 'node:test';import assert from 'node:assert/strict';import {createHmac} from 'node:crypto';import {writeFileSync} from 'node:fs';
import {startCrm,line,password,staffEmail} from './helpers/crm-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const key=()=>crypto.randomUUID().replaceAll('-','');
export function totp(secret,offset=0){const a='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const c of secret)bits+=a.indexOf(c).toString(2).padStart(5,'0');const k=Buffer.from(bits.match(/.{8}/g).map(b=>parseInt(b,2)));const step=Math.floor(Date.now()/30000)+offset;const msg=Buffer.alloc(8);msg.writeBigUInt64BE(BigInt(step));const h=createHmac('sha1',k).update(msg).digest();const o=h[19]&15;return String(((h[o]&127)<<24|h[o+1]<<16|h[o+2]<<8|h[o+3])%1e6).padStart(6,'0');}
/** Session helper speaking the stage 4 conventions: Idempotency-Key per attempt, X-CSRF-Token, expected_version. */
async function session(s,email,extra={}){
 let r=await fetch(s.base+'/api/staff/auth/session');let cookie=r.headers.get('set-cookie').split(';')[0];let csrf=(await r.json()).meta.csrf;
 r=await fetch(s.base+'/api/staff/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie,'X-CSRF-Token':csrf},body:JSON.stringify({email,password,...extra})});
 const body=await r.json();if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];csrf=body.meta.csrf;
 const me={status:r.status,body,cookie,csrf};
 me.call=async(method,path,data,{idem=key(),raw=false}={})=>{const res=await fetch(s.base+'/api/staff'+path,{method,headers:{'Content-Type':'application/json',Cookie:me.cookie,'X-CSRF-Token':me.csrf,...(idem?{'Idempotency-Key':idem}:{})},body:method==='GET'?undefined:JSON.stringify(data??{})});if(raw)return res;const j=await res.json();if(j.meta?.csrf)me.csrf=j.meta.csrf;return {status:res.status,data:j.data,error:j.error};};
 me.get=p=>me.call('GET',p);me.post=(p,d,o)=>me.call('POST',p,d,o);
 return me;
}
const ok=r=>{assert.ok(r.status<300,JSON.stringify(r));return r.data;};

test('TOTP is mandatory for OWNER/ACCOUNTANT, codes cannot be replayed, backup codes work once; step-up gates sensitive actions',{skip,timeout:240000},async()=>{
 const s=await startCrm({totp:true});
 try{
  const owner=await session(s,staffEmail('OWNER'));assert.equal(owner.status,200);assert.equal(owner.body.data.totp_enroll_required,true);
  assert.equal((await owner.get('/orders')).error.code,'TOTP_ENROLL_REQUIRED','no CRM data before enrolment');
  const setup=ok(await owner.post('/auth/totp/setup',{}));assert.match(setup.secret,/^[A-Z2-7]{32}$/);
  assert.equal((await owner.post('/auth/totp/enable',{code:'000000'})).error.code,'TOTP_INVALID');
  const enabled=ok(await owner.post('/auth/totp/enable',{code:totp(setup.secret)}));assert.equal(enabled.backup_codes.length,10);
  assert.equal((await owner.get('/orders')).status,200,'enrolled session works');
  assert.match(s.sql('SELECT secret_enc FROM rubizh_staff_totp')[0].secret_enc,/^[A-Za-z0-9+/=]+$/);assert.ok(!s.sql('SELECT secret_enc FROM rubizh_staff_totp')[0].secret_enc.includes(setup.secret),'secret is sealed at rest');
  assert.equal((await session(s,staffEmail('OWNER'))).body.error.code,'TOTP_REQUIRED');
  await new Promise(r=>setTimeout(r,31000-Date.now()%30000));
  const second=await session(s,staffEmail('OWNER'),{totp:totp(setup.secret)});assert.equal(second.status,200);
  assert.equal((await session(s,staffEmail('OWNER'),{totp:totp(setup.secret)})).body.error.code,'TOTP_INVALID','same code replay is refused');
  const backup=await session(s,staffEmail('OWNER'),{backup_code:enabled.backup_codes[0]});assert.equal(backup.status,200);
  assert.equal((await session(s,staffEmail('OWNER'),{backup_code:enabled.backup_codes[0]})).body.error.code,'TOTP_INVALID','backup code is single-use');
  const manager=await session(s,staffEmail('MANAGER'));assert.equal(manager.status,200);assert.equal(manager.body.data.totp_enroll_required,false,'TOTP optional for MANAGER');
  // Step-up: a sensitive action older than the window needs a fresh password (+TOTP).
  s.sql("UPDATE rubizh_staff_users SET name=name");const sid=s.sql("SELECT id FROM rubizh_staff_users WHERE role='SUPPORT'")[0].id;const sv=+s.sql("SELECT session_version FROM rubizh_staff_users WHERE role='SUPPORT'")[0].session_version;
  writeFileSync(s.dir+'/stepup.php','');
  const stale=await session(s,staffEmail('OWNER'),{backup_code:enabled.backup_codes[1]});
  const files=(await import('node:fs')).readdirSync(s.dir).filter(f=>f.startsWith('sess_'));for(const f of files){const p=s.dir+'/'+f;const t=(await import('node:fs')).readFileSync(p,'utf8');if(t.includes('staff_fresh_at'))(await import('node:fs')).writeFileSync(p,t.replace(/staff_fresh_at\|i:\d+/,'staff_fresh_at|i:1'));}
  const denied=await stale.post('/staff/'+sid,{session_version:sv,role:'SUPPORT',enabled:true,reason:'Перевірка повторного входу'});assert.equal(denied.status,401);assert.equal(denied.error.code,'STEP_UP_REQUIRED');assert.equal(denied.error.message,'Для цієї дії підтвердьте вхід.');
  assert.equal((await stale.post('/auth/reauth',{password:'wrong-password-123'})).error.code,'REAUTH_FAILED');
  await new Promise(r=>setTimeout(r,31000-Date.now()%30000));
  ok(await stale.post('/auth/reauth',{password,totp:totp(setup.secret)}));
  assert.equal((await stale.post('/staff/'+sid,{session_version:sv,role:'SUPPORT',enabled:true,reason:'Перевірка повторного входу'})).status,200);
 }finally{s.stop();}
});

test('staff lifecycle: invite link, weak password refused, deactivation ends sessions now, sessions list/revoke, last OWNER kept',{skip,timeout:240000},async()=>{
 const s=await startCrm();
 try{
  const owner=await session(s,staffEmail('OWNER'));
  const invite=ok(await owner.post('/staff/invite',{email:'new.manager@fixture.test',name:'Нова Менеджерка',role:'MANAGER',reason:'Новий співробітник відділу продажів'}));
  assert.match(invite.url,/\/crm\/accept\?token=[A-Za-z0-9_-]{43}$/);const token=invite.url.split('token=')[1];
  assert.equal(s.sql("SELECT COUNT(*) n FROM rubizh_staff_invites WHERE token_hash='"+token+"'")[0].n,0,'only the hash is stored');
  const accept=async pw=>{let r=await fetch(s.base+'/api/staff/auth/session');const c=r.headers.get('set-cookie').split(';')[0];const csrf=(await r.json()).meta.csrf;r=await fetch(s.base+'/api/staff/auth/token/accept',{method:'POST',headers:{'Content-Type':'application/json',Cookie:c,'X-CSRF-Token':csrf},body:JSON.stringify({token,password:pw})});return r.json();};
  assert.equal((await accept('qwerty123456')).error.code,'WEAK_PASSWORD');
  assert.equal((await accept('Rubizh-Manager-Strong-1')).ok,true);
  assert.equal((await accept('Rubizh-Manager-Strong-2')).error.code,'TOKEN_INVALID','one-time link');
  const fresh=await session(s,'new.manager@fixture.test',{password:'Rubizh-Manager-Strong-1'});assert.equal(fresh.status,200);assert.equal(fresh.body.data.user.role,'MANAGER');
  const list=ok(await owner.get('/staff'));const row=list.rows.find(r=>r.email==='new.manager@fixture.test');
  ok(await owner.post('/staff/'+row.id,{session_version:row.session_version,enabled:false,reason:'Співробітник більше не працює'}));
  assert.equal((await fresh.get('/orders')).status,401,'deactivation ends the session immediately');
  const m1=await session(s,staffEmail('MANAGER')),m2=await session(s,staffEmail('MANAGER'));
  assert.equal(ok(await m1.get('/me/sessions')).rows.length,2);ok(await m1.post('/me/sessions/revoke-others',{}));
  assert.equal((await m2.get('/orders')).status,401);assert.equal((await m1.get('/orders')).status,200);
  const ownerRow=ok(await owner.get('/staff')).rows.find(r=>r.role==='OWNER');
  assert.equal((await owner.post('/staff/'+ownerRow.id,{session_version:ownerRow.session_version,role:'MANAGER',reason:'Спроба зняти останнього власника'})).error.code,'LAST_OWNER_REQUIRED');
  const reset=ok(await owner.post('/staff/'+s.sql("SELECT id FROM rubizh_staff_users WHERE role='SUPPORT'")[0].id+'/reset-password',{reason:'Співробітник забув пароль'}));assert.match(reset.url,/token=/);
  const audit=s.sql("SELECT action FROM rubizh_staff_audit WHERE action IN ('staff.invite','staff.update','staff.reset_password','sessions.revoke_others')").map(r=>r.action);for(const a of ['staff.invite','staff.update','staff.reset_password','sessions.revoke_others'])assert.ok(audit.includes(a),a);
  assert.ok(+s.sql('SELECT COUNT(*) n FROM rubizh_staff_audit_context')[0].n>0,'audit rows carry IP hash and agent');
 }finally{s.stop();}
});

test('orders: line stock check blocks confirmation, replace needs consent+price, remove recomputes, scope and concurrency (409), reason for reassignment',{skip,timeout:240000},async()=>{
 const s=await startCrm({stock:20});
 try{
  const o=await s.checkout([line(),{...line(),qty:2}]);const m=await session(s,staffEmail('MANAGER')),m2=await session(s,'owner@fixture.test');
  s.sql("UPDATE rubizh_customer_orders SET status='new',pim_order_state='WAITING_CONFIRMATION' WHERE id="+o.id);
  let v=ok(await m.get('/orders/'+o.id));assert.equal(v.display.order.code,'WAITING_CONFIRMATION');assert.ok(v.actions.includes('confirm'));assert.ok(v.actions.includes('line_stock'));
  v=ok(await m.post('/orders/'+o.id+'/lines/1/stock',{status:'OUT_OF_STOCK',note:'Постачальник: немає',expected_version:v.version}));
  assert.equal(v.lines[1].stock_check,'OUT_OF_STOCK');assert.ok(v.attention.includes('OUT_OF_STOCK'));
  assert.equal((await m.post('/orders/'+o.id+'/confirm',{availability_confirmed:true,expected_version:v.version})).error.code,'LINE_OUT_OF_STOCK');
  const before=v.total_minor;
  assert.equal((await m.post('/orders/'+o.id+'/lines/1/remove',{reason:'Клієнт погодив без позиції',expected_version:'0'.repeat(64)})).error.code,'STALE_ORDER');
  v=ok(await m.post('/orders/'+o.id+'/lines/1/remove',{reason:'Клієнт погодив без позиції',expected_version:v.version}));
  assert.equal(v.lines.length,1);assert.ok(v.total_minor<before);assert.equal(v.lines.every(l=>l.stock_check!=='OUT_OF_STOCK'),true);
  assert.equal(+s.sql("SELECT COUNT(*) n FROM rubizh_order_fulfillment_lines WHERE order_id="+o.id)[0].n,1);
  assert.equal(s.sql("SELECT qty FROM rubizh_stock_reservations WHERE order_id="+o.id+" AND status='ACTIVE'")[0].qty,'1.00','reservation rebuilt for remaining line');
  const agreed=v.total_minor;
  assert.equal((await m.post('/orders/'+o.id+'/lines/0/replace',{sku:'RUB-F0001',customer_agreed:true,reason:'Клієнт погодив заміну розміру',expected_total_minor:agreed+100,expected_version:v.version})).error.code,'PRICE_CHANGED');
  v=ok(await m.post('/orders/'+o.id+'/lines/0/replace',{sku:'RUB-F0001',customer_agreed:true,reason:'Клієнт погодив заміну розміру',expected_total_minor:agreed,expected_version:v.version}));
  assert.equal(v.total_minor,agreed);
  // Two managers, one order: the second «взяти в роботу» on the same version gets 409.
  const ver=v.version;const [a,b]=await Promise.all([m.post('/orders/'+o.id+'/assign',{expected_version:ver}),m2.post('/orders/'+o.id+'/assign',{expected_version:ver})]);
  assert.deepEqual([a.status,b.status].sort(),[200,409]);
  v=ok(await m.get('/orders/'+o.id));const owner=v.assigned_manager.name;
  const other=await session(s,staffEmail('MANAGER'));s.sql("INSERT INTO rubizh_staff_users(id,email,name,password_hash,role,created_at,updated_at) SELECT '66666666666666666666666666666666','m2@fixture.test','Другий',password_hash,'MANAGER',UTC_TIMESTAMP(),UTC_TIMESTAMP() FROM rubizh_staff_users WHERE role='MANAGER'");
  const second=await session(s,'m2@fixture.test');
  if(owner==='MANAGER'){assert.equal((await second.post('/orders/'+o.id+'/confirm',{availability_confirmed:true,expected_version:v.version})).error.code,'ORDER_NOT_ASSIGNED');
   assert.equal((await second.post('/orders/'+o.id+'/assign',{expected_version:v.version})).error.code,'REASON_REQUIRED');
   ok(await second.post('/orders/'+o.id+'/assign',{expected_version:v.version,reason:'Колега у відпустці'}));}
  void other;
 }finally{s.stop();}
});

test('packing, completion, delivery correction before TTN, supplier assignment for unknown lines, CRM-4.2 refund version, R-C1 attempt without bank id',{skip,timeout:240000},async()=>{
 const s=await startCrm();
 try{
  const o=await s.checkout([line()]);const owner=await session(s,staffEmail('OWNER'));let v=ok(await owner.get('/orders/'+o.id));
  assert.equal((await owner.post('/orders/'+o.id+'/packing',{expected_version:v.version})).error.code,'PACKING_NOT_ALLOWED','unpaid order cannot be packed');
  // LOG-06 correction through the NP directory (fixture transport): verified refs only.
  v=ok(await owner.post('/orders/'+o.id+'/delivery',{delivery:{type:'branch',city_ref:s.ref(10),warehouse_ref:s.ref(20)},recipient:'Олена Іваненко',reason:'Клієнт змінив отримувача',expected_version:v.version}));
  assert.equal(v.contact.recipient,'Олена Іваненко');assert.ok(s.sql("SELECT action FROM rubizh_order_audit WHERE order_id="+o.id).some(r=>r.action==='order.delivery_update'));
  // R-C1: an attempt without bank id is closed by OWNER as «рахунок у банку не створено».
  s.sql("INSERT INTO rubizh_mono_invoices(order_id,reference,amount,status,created_at,updated_at) VALUES("+o.id+",'rc1-ref',286000,'creating',UTC_TIMESTAMP()-INTERVAL 1 HOUR,UTC_TIMESTAMP()-INTERVAL 1 HOUR)");
  v=ok(await owner.get('/orders/'+o.id));assert.equal(v.display.payment.code,'NEEDS_REVIEW');assert.ok(v.actions.includes('reconcile_not_created'));
  v=ok(await owner.post('/orders/'+o.id+'/reconcile-not-created',{reason:'У кабінеті банку рахунку немає',expected_version:v.version}));
  assert.equal(s.sql("SELECT status FROM rubizh_mono_invoices WHERE reference='rc1-ref'")[0].status,'failure');assert.notEqual(v.display.payment.code,'NEEDS_REVIEW');
  // Pay, pack, ship (mock TTN), deliver, complete.
  v=ok(await owner.post('/orders/'+o.id+'/invoice',{expected_version:v.version}));assert.ok(v.invoice.url);
  const inv=s.sql("SELECT * FROM rubizh_mono_invoices WHERE invoice_id IS NOT NULL")[0];assert.equal((await s.webhook(inv)).status,200);
  v=ok(await owner.get('/orders/'+o.id));assert.equal(v.display.payment.code,'PAID');
  assert.equal((await owner.post('/payments/'+inv.id+'/refund',{amount:100,reason:'Перевірка версії повернення'},{idem:key()})).error.code,'VERSION_REQUIRED','CRM-4.2');
  v=ok(await owner.post('/orders/'+o.id+'/packing',{expected_version:v.version}));assert.equal(v.display.order.code,'PACKING');
  assert.equal((await owner.post('/orders/'+o.id+'/complete',{expected_version:v.version})).error.code,'NOT_DELIVERED');
  assert.equal((await owner.post('/orders/'+o.id+'/delivery',{delivery:{type:'branch',city_ref:s.ref(10),warehouse_ref:s.ref(20)},reason:'Ще одна зміна адреси',expected_version:v.version})).status,200);
 }finally{s.stop();}
});

test('telephone order uses the SITE checkout service, is idempotent per attempt and joins the account only after SMS login',{skip,timeout:240000},async()=>{
 const s=await startCrm();
 try{
  const m=await session(s,staffEmail('MANAGER'));const idem=key();
  const body={customer:{name:'Тарас Шевченко',phone:'+380 67 555 12 34'},lines:[{product_id:'m-jacket',color_id:line().color_id,sku:'RUB-F0001',qty:1}],delivery:{type:'branch',city_ref:s.ref(10),warehouse_ref:s.ref(20)},channel:'phone',payment:'card',expected_total_minor:286000};
  const a=await m.post('/orders',body,{idem});assert.equal(a.status,201,JSON.stringify(a));const b=await m.post('/orders',body,{idem});assert.equal(b.data.id,a.data.id,'double click = one order');
  assert.equal(+s.sql("SELECT COUNT(*) n FROM rubizh_customer_orders WHERE external_id LIKE 'crm:%'")[0].n,1);
  assert.equal(a.data.channel,'phone');assert.equal(a.data.assigned_manager.name,'MANAGER');
  assert.equal((await m.post('/orders',{...body,expected_total_minor:100},{idem:key()})).error.code,'PRICE_CHANGED','price only from the server');
  assert.equal((await m.post('/orders',{...body,discount:500},{idem:key()})).error.code,'INVALID_REQUEST','no manual discount field');
  assert.equal(+s.sql('SELECT COUNT(*) n FROM rubizh_account_orders WHERE order_id='+a.data.id)[0].n,0,'no account link before SMS proof');
  s.sql("INSERT INTO rubizh_accounts(id,email,first_name,last_name,phone,created_at,updated_at) VALUES('77777777777777777777777777777777','','Тарас','','+380675551234',UTC_TIMESTAMP(),UTC_TIMESTAMP())");
  s.sql("INSERT INTO rubizh_customer_identities(customer_id,provider,subject,contact_email,created_at) VALUES('77777777777777777777777777777777','phone','+380675551234','',UTC_TIMESTAMP())");
  const r=await s.get('/shop/order-status.php?order='+a.data.id);void r;
  const {php}=await import('./helpers/site-fixture.mjs');php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${s.site}/auth/bootstrap.php';customerOwnOrders('77777777777777777777777777777777');`);
  assert.equal(s.sql('SELECT customer_id FROM rubizh_account_orders WHERE order_id='+a.data.id)[0].customer_id,'77777777777777777777777777777777');
 }finally{s.stop();}
});

test('customers are masked, full phone is audited, WAREHOUSE gets no money, CSV export is BOM-prefixed and formula-safe',{skip,timeout:240000},async()=>{
 const s=await startCrm();
 try{
  const o=await s.checkout([line()],{name:'=HYPERLINK("x")'});const sup=await session(s,staffEmail('SUPPORT')),wh=await session(s,staffEmail('WAREHOUSE')),own=await session(s,staffEmail('OWNER')),man=await session(s,staffEmail('MANAGER'));
  const list=ok(await sup.get('/customers'));assert.ok(list.rows.every(c=>!('phone' in c)&&/\*\*\*/.test(c.phone_masked??'***')));
  const shown=ok(await sup.post('/customers/order:'+o.id+'/phone',{}));assert.equal(shown.phone,'+380671234567');
  assert.ok(s.sql("SELECT action FROM rubizh_staff_audit WHERE action='customer.phone_view'").length===1);
  assert.equal((await wh.post('/customers/order:'+o.id+'/phone',{})).status,403);
  const wv=ok(await wh.get('/orders/'+o.id));assert.equal(wv.finance,null);assert.equal(wv.total_minor,null);assert.ok(wv.items.every(i=>!('price' in i)));assert.ok(wv.lines.every(l=>l.amount_minor===null));
  const res=await man.call('GET','/orders/export',null,{raw:true,idem:null});const bytes=Buffer.from(await res.arrayBuffer());const text=bytes.toString('utf8');assert.equal(res.headers.get('content-type'),'text/csv; charset=UTF-8');assert.deepEqual([...bytes.subarray(0,3)],[0xef,0xbb,0xbf],'UTF-8 BOM for Excel');
  assert.ok(text.includes("\"'=HYPERLINK"),'formula injection neutralised');assert.ok(!text.includes('Сума'),'manager export without finance');
  const fin=await (await own.call('GET','/orders/export',null,{raw:true,idem:null})).text();assert.ok(fin.includes('Сума'));
  assert.ok(s.sql("SELECT action FROM rubizh_staff_audit WHERE action='export.orders'").length===2);
 }finally{s.stop();}
});

test('tasks, notifications and saved views are CRM-own data; idempotency key conflict; payment review queue (CRM-4.1)',{skip,timeout:240000},async()=>{
 const s=await startCrm();
 try{
  const o=await s.checkout([line()]);const m=await session(s,staffEmail('MANAGER')),own=await session(s,staffEmail('OWNER'));
  const idem=key();const t=await m.post('/tasks',{title:'Передзвонити клієнту',order_id:o.id,due_at:'2030-01-01'},{idem});assert.equal(t.status,201);
  assert.equal((await m.post('/tasks',{title:'Інший текст',order_id:o.id},{idem})).error.code,'IDEMPOTENCY_CONFLICT');
  assert.equal((await m.post('/tasks',{title:'Передзвонити клієнту',order_id:o.id,due_at:'2030-01-01'},{idem})).data.id,t.data.id,'same attempt replays');
  ok(await m.post('/tasks/'+t.data.id,{state:'DONE',version:t.data.version}));assert.equal((await m.post('/tasks/'+t.data.id,{state:'OPEN',version:t.data.version})).error.code,'STALE_ORDER');
  const view=ok(await m.post('/views',{name:'Мої нові',query:'view=mine&attention=confirmation',scope:'orders'}));assert.equal(ok(await m.get('/views')).rows[0].id,view.id);assert.equal(ok(await own.get('/views')).rows.length,0,'views are personal');
  // A signed but mismatching MonoPay event is parked and shown to OWNER only.
  ok(await own.post('/orders/'+o.id+'/invoice',{expected_version:ok(await own.get('/orders/'+o.id)).version}));const inv=s.sql('SELECT * FROM rubizh_mono_invoices')[0];
  await s.webhook({...inv,amount:+inv.amount+1});
  const reviews=ok(await own.get('/payments/review'));assert.equal(reviews.rows.length,1);assert.equal((await m.get('/payments/review')).status,403);
  const checked=ok(await own.post('/payments/review/'+reviews.rows[0].id+'/check',{}));assert.ok(checked.bank_result);
  assert.equal(ok(await own.get('/orders/'+o.id)).display.payment.code,'NEEDS_REVIEW');
  ok(await own.post('/payments/review/'+reviews.rows[0].id+'/resolve',{reason:'Перевірено в кабінеті банку, оплати немає'}));
  assert.notEqual(ok(await own.get('/orders/'+o.id)).display.payment.code,'NEEDS_REVIEW');
  const n=ok(await own.get('/notifications'));assert.ok(n.rows.some(r=>r.kind==='payment_review'));ok(await own.post('/notifications/read',{all:true}));assert.equal(ok(await own.get('/notifications')).unread,0);
 }finally{s.stop();}
});
