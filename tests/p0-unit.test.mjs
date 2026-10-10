import {test} from 'node:test';
import assert from 'node:assert/strict';
import {php,root} from './helpers/site-fixture.mjs';
const result=code=>JSON.parse(php(code).stdout);
const permissions=['payment.view','payment.invoice.create','payment.invoice.resend','payment.refund.request','payment.refund.execute','payment.manual_reconcile','order.price_override','order.total_override','financial.audit.view'];
for(const role of ['OWNER','MANAGER','LOGISTICS','READ_ONLY','UNKNOWN'])test(`financial permission preset: ${role}`,()=>{
 const actual=result(`require '${root}/shop/financial-permissions.php';echo json_encode(shopRolePermissions('${role}'));`);
 const wanted=role==='OWNER'?permissions:role==='MANAGER'?permissions.slice(0,3):['LOGISTICS','READ_ONLY'].includes(role)?['payment.view']:[];
 assert.deepEqual(actual.filter(p=>permissions.includes(p)),wanted);
});
const canonical=o=>result(`require '${root}/shop/order-state.php';$o=json_decode('${JSON.stringify(o)}',true);echo json_encode(shopCanonicalOrder($o));`);
for(const [status,expected] of [['confirmed','CONFIRMED'],['processing','CONFIRMED'],['shipped','CONFIRMED'],['partially_shipped','CONFIRMED'],['delivered','CONFIRMED'],['cancelled','CANCELLED']])test(`legacy order mapping: ${status}`,()=>{
 const r=canonical({status,payment_status:'pending'});assert.equal(r.order_status,expected);assert.equal(r.review_required,false);
});
for(const [status,expected] of [['pending','UNPAID'],['failed','UNPAID'],['paid','PAID'],['refunded','REFUNDED']])test(`legacy payment mapping: ${status}`,()=>assert.equal(canonical({status:'confirmed',payment_status:status}).payment_status,expected));
test('ambiguous legacy/new/returns/COD never invent canonical states',()=>{
 for(const o of [{status:'new',payment_status:'pending'},{status:'returned',payment_status:'paid'},{status:'confirmed',payment_status:'cod'},{status:'unknown',payment_status:'paid'}]){
  const r=canonical(o);assert.equal(r.review_required,true);assert.ok(r.review_flags.includes('LEGACY_REVIEW_REQUIRED'));
 }
});
test('known confirmation-required snapshot maps legacy new safely',()=>{
 const r=canonical({status:'new',payment_status:'pending',items:[{requires_order_confirmation:true}]});assert.equal(r.order_status,'WAITING_CONFIRMATION');assert.equal(r.review_required,false);
});
test('v3 and legacy contradictory money states are explicit conflicts',()=>{
 const r=canonical({status:'confirmed',payment_status:'paid',pim_contract_version:3,pim_order_state:'CONFIRMED',pim_payment_state:'UNPAID',pim_fulfillment_state:'NOT_READY'});assert.equal(r.payment_status,'UNPAID');assert.ok(r.review_flags.includes('STATE_CONFLICT'));
});
test('completed unpaid order is not considered safe for backfill',()=>assert.ok(canonical({status:'completed',payment_status:'pending'}).review_flags.includes('STATE_CONFLICT')));
test('manual financial reason rejects blanks and control characters',()=>{
 const r=result(`require '${root}/shop/financial-permissions.php';$out=[];foreach(['','abc',"reason\ninvalid",'Перевірено виписку банку'] as $reason){try{shopFinancialReason($reason);$out[]=true;}catch(Throwable $e){$out[]=false;}}echo json_encode($out);`);assert.deepEqual(r,[false,false,false,true]);
});

test('fully delivered paid v3 order may be COMPLETED without a false legacy conflict',()=>{
 const r=result(`require '${root}/shop/order-state.php';echo json_encode(shopCanonicalOrder(['status'=>'delivered','payment_status'=>'paid','pim_contract_version'=>3,'pim_order_state'=>'COMPLETED','pim_payment_state'=>'PAID','pim_fulfillment_state'=>'DELIVERED','shipment_coverage_complete'=>true],[['status'=>'delivered','tracking_number'=>'20450000000001']]));`);assert.equal(r.review_required,false);assert.equal(r.order_status,'COMPLETED');
});
test('partial delivery and unknown shipment statuses require conservative presentation',()=>{
 const r=result(`require '${root}/shop/order-state.php';echo json_encode([shopCanonicalOrder(['status'=>'shipped','payment_status'=>'paid'],[['status'=>'delivered']]),shopCanonicalOrder(['status'=>'shipped','payment_status'=>'paid'],[['status'=>'returned']])]);`);assert.equal(r[0].fulfillment_status,'IN_TRANSIT');assert.equal(r[1].fulfillment_status,null);assert.equal(r[1].review_required,true);
});
test('completed delivered order remains canonical after a verified full refund; financial reversal does not undo fulfillment',()=>{const state=canonical({status:'delivered',payment_status:'refunded',pim_contract_version:3,pim_order_state:'COMPLETED',pim_payment_state:'REFUNDED',pim_fulfillment_state:'DELIVERED',shipment_coverage_complete:true});assert.equal(state.order_status,'COMPLETED');assert.equal(state.payment_status,'REFUNDED');assert.equal(state.fulfillment_status,'DELIVERED');assert.equal(state.review_required,false);});
