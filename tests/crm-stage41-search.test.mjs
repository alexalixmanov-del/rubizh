// Stage 4.1 (owner decision on search): OWNER/MANAGER/SUPPORT/ACCOUNTANT search as before (number, TTN, e-mail, name,
// SKU; phone digits only with customer.phone.full); WAREHOUSE finds orders only by the order number and the TTN.
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {startCrm,line,roles5} from './helpers/crm-fixture.mjs';import {root} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const c=JSON.parse(readFileSync(root+'/contracts/crm/crm-api.json','utf8'));

test('role × search: each role finds an order exactly by the kinds the owner allowed',{skip,timeout:300000},async()=>{
 const s=await startCrm();
 try{
  const o=await s.checkout([line()]);const row=s.sql('SELECT order_number,email FROM rubizh_customer_orders WHERE id='+o.id)[0];
  const contact=JSON.parse(s.sql('SELECT contact_json FROM rubizh_order_details WHERE order_id='+o.id)[0].contact_json);
  s.sql("INSERT INTO rubizh_order_shipments(order_id,supplier_code,status,tracking_number,lines_json,created_at,updated_at) VALUES("+o.id+",'fixture','created','20450000999911','[]',UTC_TIMESTAMP(),UTC_TIMESTAMP())");
  const digits=String(contact.phone||'').replace(/\D/g,'');assert.ok(digits.length>=9,'fixture order has a phone');
  const kinds={number:row.order_number,ttn:'20450000999911',email:row.email,name:String(contact.name).split(' ')[0],sku:'RUB-F0001',phone:digits.slice(-9)};
  const table=[];
  for(const role of roles5){
   const a=await s.login(role);
   for(const [kind,q] of Object.entries(kinds)){
    const r=await a.get('/orders?q='+encodeURIComponent(q));assert.equal(r.status,200,role+' '+kind);
    const found=r.data.data.rows.some(x=>x.id===o.id);
    const expected=role==='WAREHOUSE'?['number','ttn'].includes(kind):kind==='phone'?c.permissions['customer.phone.full'].includes(role):true;
    table.push({role,kind,expected,found});
   }
   if(role==='WAREHOUSE'){
    const g=await a.get('/search?q='+encodeURIComponent(kinds.email));assert.equal(g.status,200);assert.deepEqual((g.data.data.orders||[]).filter(x=>x.id===o.id),[],'global search: no e-mail match for WAREHOUSE');
    const sh=await a.get('/shipments?q='+encodeURIComponent(kinds.email));assert.equal(sh.status,200);assert.deepEqual(sh.data.data.rows.filter(x=>x.order_id===o.id),[],'shipments: no e-mail match for WAREHOUSE');
    const shT=await a.get('/shipments?q=20450000999911');assert.ok(shT.data.data.rows.some(x=>x.order_id===o.id),'shipments: TTN match for WAREHOUSE');
   }
  }
  assert.deepEqual(table.filter(x=>x.expected!==x.found),[],'role × search mismatches');
 }finally{s.stop();}
});
