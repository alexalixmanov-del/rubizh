// Stage 4 (ТЗ §8, owner corrections 2026-10-15): every finance field × every role — «видит / не видит» — from the live
// Staff API, driven by contracts/crm/crm-api.json field_visibility (the same table as docs/crm/03-RBAC_MATRIX.md).
// SUPPORT: order total and payment status only. WAREHOUSE: no money and no payment status. MANAGER: no refund money,
// no profit. Finance: OWNER and ACCOUNTANT.
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {startCrm,line,roles5} from './helpers/crm-fixture.mjs';import {root} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const c=JSON.parse(readFileSync(root+'/contracts/crm/crm-api.json','utf8'));
const has=v=>v!==null&&v!==undefined;
/** One probe per contract field: true = the role received the value. */
const PROBES={
 'order.total':d=>has(d.card.total_minor),
 'order.payment_status':d=>d.card.display.payment.code!=='HIDDEN'&&has(d.card.payment_status),
 'order.line_prices':d=>has(d.card.lines[0].amount_minor)||has(d.card.finance?.goods_minor),
 'order.invoices':d=>d.card.payments.length>0||(d.card.finance?.invoices??[]).length>0||JSON.stringify(d.card).includes('pay.mbnk.biz'),
 'order.donation':d=>has(d.card.contact.donation_amount),
 'order.refunds':d=>d.card.refunds.some(r=>has(r.amount))||has(d.card.finance?.refunded_minor),
 'return.refund_amounts':d=>d.returns.some(r=>has(r.refund_expected_minor)||/refund_minor/.test(String(r.lines_json??''))),
 'shipment.declared_value':d=>d.shipments.some(s=>has(s.declared_value))||d.card.shipments.some(s=>has(s.declared_value)),
 'customer.paid_total':d=>d.customers!==null&&d.customers.some(x=>has(x.paid_total_minor)),
 'dashboard.revenue':d=>has(d.dashboard.kpi.revenue),
 'dashboard.gross_profit':d=>has(d.dashboard.kpi.gross_profit),
 'payments.section':d=>d.payments===200,
 'analytics':d=>d.analytics===200,
 'settings.system':d=>has(d.settings.system),
};

test('finance fields × roles: each role sees exactly what the contract grants (§8 + owner 2026-10-15)',{skip,timeout:300000},async()=>{
 const s=await startCrm();
 try{
  assert.deepEqual(Object.keys(PROBES).sort(),Object.keys(c.field_visibility).sort(),'a probe for every contract field');
  // One order with everything: paid by the bank, a parcel with declared value, a partial refund, a return.
  const owner=await s.login('OWNER');const o=await s.checkout([{...line(),qty:2}]);const v=async()=>(await owner.get('/orders/'+o.id)).data.data.version;
  assert.equal((await owner.send('/orders/'+o.id+'/invoice',{version:await v()})).status,200);
  const inv=s.sql('SELECT * FROM rubizh_mono_invoices WHERE order_id='+o.id+' AND invoice_id IS NOT NULL')[0];assert.equal((await s.webhook(inv)).status,200);
  const card0=(await owner.get('/orders/'+o.id)).data.data;
  const profile=(await owner.get('/settings')).data.data.sender_profiles.find(p=>p.code===card0.fulfillment_lines[0].supplier_code);
  assert.equal((await owner.send('/settings/senders/'+profile.code,{...profile,name:'Склад',city:'Київ',region:'Київська',branch:'1',city_ref:s.ref(10),warehouse_ref:s.ref(20),sender_ref:s.ref(1),contact_ref:s.ref(2),phone:'+380671234567',confirmed:true,reason:'Реквізити НП для перевірки'},'PUT')).status,200);
  const draft=await owner.send('/orders/'+o.id+'/shipments',{version:await v(),request_id:crypto.randomUUID().replaceAll('-',''),availability_confirmed:true,supplier_code:profile.code,lines:[{line_no:0,qty:2}],package:{places:[{weight:1,length:30,width:20,height:10}]}});assert.equal(draft.status,201,JSON.stringify(draft.data));
  s.sql("UPDATE rubizh_order_shipments SET status='delivered' WHERE order_id="+o.id);
  const ret=await owner.send('/returns',{order_id:o.id,lines:[{line_no:0,qty:1}],reason:'Не підійшов розмір',version:await v(),request_id:crypto.randomUUID().replaceAll('-','')});assert.ok(ret.status<300,JSON.stringify(ret.data));
  s.sql("INSERT INTO rubizh_refund_operations(invoice_id,order_id,amount,ext_ref,status,reason,actor_id,idempotency_key,created_at,updated_at) VALUES("+inv.id+","+o.id+",100000,'fixture-ref','success','Часткове повернення','"+'1'.repeat(32)+"','"+'f'.repeat(32)+"',UTC_TIMESTAMP(),UTC_TIMESTAMP())");
  s.sql("UPDATE rubizh_returns SET refund_expected_minor=100000 WHERE order_id="+o.id);
  const table=[];
  for(const role of roles5){
   const a=await s.login(role);const get=p=>a.get(p);
   const card=(await get('/orders/'+o.id)).data.data;
   const rr=await get('/returns');const returns=rr.status===200?rr.data.data.rows:[];
   const sr=await get('/shipments');const shipments=sr.status===200?sr.data.data.rows:[];
   const cr=await get('/customers');const customers=cr.status===200?cr.data.data.rows:null;
   const d={card,returns,shipments,customers,dashboard:(await get('/dashboard?period=30d')).data.data,payments:(await get('/payments')).status,analytics:(await get('/analytics?period=30d')).status,settings:(await get('/settings')).data.data};
   for(const [field,spec] of Object.entries(c.field_visibility)){
    const expected=c.permissions[spec.permission].includes(role),seen=PROBES[field](d);
    table.push({role,field,expected,seen});
   }
  }
  const wrong=table.filter(x=>x.expected!==x.seen);
  assert.deepEqual(wrong,[],'role × field mismatches (expected = contract): '+JSON.stringify(wrong));
  // The owner's wording, literally.
  assert.deepEqual(table.filter(x=>x.role==='SUPPORT'&&x.seen).map(x=>x.field).sort(),['order.payment_status','order.total']);
  assert.deepEqual(table.filter(x=>x.role==='WAREHOUSE'&&x.seen),[],'WAREHOUSE sees no finance field');
  assert.deepEqual(table.filter(x=>x.role==='MANAGER'&&['order.refunds','return.refund_amounts','dashboard.gross_profit','analytics'].includes(x.field)&&x.seen),[],'MANAGER: no refund money, profit or analytics');
 }finally{s.stop();}
});
