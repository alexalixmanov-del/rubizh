// Unit tests of the CRM status projection (docs/crm/02-CRM_STATE_MAP.md), money/phone helpers and CSV safety — pure PHP.
import {test} from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {root,runtime,phpArgs,phpEnv} from './helpers/site-fixture.mjs';
const run=code=>{const r=spawnSync(runtime+'/bin/php8.4',[...phpArgs,'-r',`define('RUBIZH_AUTH_NO_SESSION',true);require '${root}/staff/status.php';require '${root}/staff/lists.php';function cfg($k=null){return null;}function npOrigins(){return [];}function crmApiTableExists($d,$t){return false;}function crmCan($a,$p){return in_array($p,$a['permissions']??[],true);}`+code],{env:phpEnv,encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);return JSON.parse(r.stdout);};
const base={order:{status:'confirmed',payment_status:'pending',pim_contract_version:3,pim_order_state:'CONFIRMED'},shipments:[],invoices:[],refunds:[],timing:{payment_due:'2099-01-01 00:00:00'},open_review:false,invoice_payment:null,coverage_complete:false,contact:{payment:'card'},flags:[]};
const status=f=>run(`echo json_encode(crmDisplayStatus(json_decode(${JSON.stringify(JSON.stringify(f))},true)),JSON_UNESCAPED_UNICODE);`);
const inv=(st,extra={})=>({id:1,invoice_id:'x',status:st,refund_status:'',amount:100000,created_at:'2026-01-01 00:00:00',...extra});
test('order status projection covers every SITE state without inventing new ones',()=>{
 const cases=[[{status:'new',pim_contract_version:null},'WAITING_CONFIRMATION','очікує підтвердження менеджера'],[{status:'new',pim_contract_version:3,pim_order_state:'NEW'},'NEW','нове'],[{status:'confirmed'},'CONFIRMED','підтверджене'],[{status:'processing'},'PACKING','у комплектації'],[{status:'shipped'},'HANDED_TO_DELIVERY','передане на доставку'],[{status:'partially_shipped'},'HANDED_TO_DELIVERY','передане на доставку'],[{status:'completed',pim_order_state:'COMPLETED'},'COMPLETED','завершене'],[{status:'cancelled',pim_order_state:'CANCELLED'},'CANCELLED','скасоване']];
 for(const [o,code,label] of cases){const r=status({...base,order:{...base.order,pim_order_state:null,...o}});assert.equal(r.order.code,code,JSON.stringify(o));assert.equal(r.order.label,label);}
});
test('payment projection: not issued, awaiting, paid, failed, expired retry, partial/full refund, review',()=>{
 assert.equal(status(base).payment.code,'NOT_ISSUED');
 assert.equal(status({...base,invoices:[inv('created')]}).payment.code,'AWAITING');
 assert.equal(status({...base,order:{...base.order,payment_status:'paid'},invoices:[inv('success')]}).payment.code,'PAID');
 assert.equal(status({...base,invoices:[inv('failure')]}).payment.code,'FAILED');
 const ex=status({...base,invoices:[inv('expired')]});assert.equal(ex.payment.code,'EXPIRED_RETRY');assert.match(ex.payment.label,/можна оплатити повторно до 01\.01\.2099/);
 assert.equal(status({...base,invoices:[inv('expired')],timing:{payment_due:'2000-01-01 00:00:00'}}).payment.code,'NOT_ISSUED','after payment_due no retry is offered');
 assert.equal(status({...base,order:{...base.order,payment_status:'paid'},invoices:[inv('success')],refunds:[{status:'success',amount:30000}]}).payment.code,'PARTIALLY_REFUNDED');
 assert.equal(status({...base,order:{...base.order,payment_status:'paid'},invoices:[inv('success')],refunds:[{status:'success',amount:100000}]}).payment.code,'REFUNDED');
 assert.equal(status({...base,invoices:[inv('unknown')]}).payment.code,'NEEDS_REVIEW');
 assert.equal(status({...base,open_review:true}).payment.code,'NEEDS_REVIEW','CRM-4.1 parked event');
 assert.equal(status({...base,order:{...base.order,payment_status:'paid'},invoices:[inv('success',{refund_status:'unknown'})]}).payment.code,'NEEDS_REVIEW');
 const fop=status({...base,contact:{payment:'invoice'},timing:{payment_due:'2000-01-01 00:00:00'}});assert.equal(fop.payment.code,'NEEDS_REVIEW');assert.equal(fop.payment.label,'потребує звірки виписки','D-51');
 assert.equal(status({...base,contact:{payment:'invoice'}}).payment.code,'AWAITING');
});
test('delivery projection: none, preparing, sent N of M, delivered (only when covered), returning, needs review (R6)',()=>{
 const sh=st=>({status:st,tracking_number:st==='draft'?null:'20450000000001'});
 assert.equal(status(base).delivery.code,'NONE');assert.equal(status({...base,shipments:[sh('draft')]}).delivery.code,'PREPARING');
 const sent=status({...base,shipments:[sh('sent'),sh('created')]});assert.equal(sent.delivery.code,'SENT');assert.equal(sent.delivery.label,'відправлено (посилка 1 із 2)');
 assert.equal(status({...base,shipments:[sh('delivered')],coverage_complete:false}).delivery.code,'SENT','uncovered lines keep it in transit');
 assert.equal(status({...base,shipments:[sh('delivered')],coverage_complete:true}).delivery.code,'DELIVERED');
 assert.equal(status({...base,shipments:[sh('returned')]}).delivery.code,'RETURNING');
 for(const st of ['unknown','error','manual'])assert.equal(status({...base,shipments:[sh(st)]}).delivery.code,'NEEDS_REVIEW',st);
 assert.equal(status({...base,shipments:[sh('cancelled')]}).delivery.code,'NONE','cancelled parcels are ignored');
});
test('phone masking, CSV formula neutralisation and segment thresholds',()=>{
 const r=run(`echo json_encode(['m'=>crmMaskPhone('+380671234567'),'n'=>crmMaskPhone(null),'c'=>[crmCsvCell('=1+1'),crmCsvCell('+380'),crmCsvCell('@x'),crmCsvCell('-5'),crmCsvCell('ok "q"')],'seg'=>[crmSegment(['orders'=>3,'paid_total'=>10],['vip_paid_orders'=>3,'vip_paid_total_minor'=>2000000,'sleeping_days'=>180]),crmSegment(['orders'=>1,'paid_total'=>25000],['vip_paid_orders'=>3,'vip_paid_total_minor'=>2000000,'sleeping_days'=>180]),crmSegment(['orders'=>2,'paid_total'=>10,'last_order'=>'2000-01-01 00:00:00'],['vip_paid_orders'=>3,'vip_paid_total_minor'=>2000000,'sleeping_days'=>180]),crmSegment(['orders'=>2,'paid_total'=>10,'last_order'=>gmdate('Y-m-d H:i:s')],['vip_paid_orders'=>3,'vip_paid_total_minor'=>2000000,'sleeping_days'=>180]),crmSegment(['orders'=>1,'paid_total'=>10,'last_order'=>gmdate('Y-m-d H:i:s')],['vip_paid_orders'=>3,'vip_paid_total_minor'=>2000000,'sleeping_days'=>180])]],JSON_UNESCAPED_UNICODE);`);
 assert.equal(r.m,'+380 67 *** ** 67');assert.equal(r.n,null);
 assert.deepEqual(r.c,['"\'=1+1"','"\'+380"','"\'@x"','"\'-5"','"ok ""q"""']);
 assert.deepEqual(r.seg,['VIP','VIP','SLEEPING','REPEAT','NEW']);
});
