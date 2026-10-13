import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {writeFileSync,existsSync,rmSync} from 'node:fs';
import {startSite,php,phpArgs,phpEnv,runtime} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function child(site,code){const p=spawn(runtime+'/bin/php8.4',[...phpArgs,'-r',`define('RUBIZH_AUTH_NO_SESSION',true);require '${site.site}/auth/bootstrap.php';require_once '${site.site}/shop/store-lib.php';$db=db();try{${code}}catch(Throwable $e){echo get_class($e).' '.$e->getCode().' '.($e instanceof PDOException?($e->errorInfo[1]??''):'');exit(1);}`],{env:phpEnv});let out='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>out+=x);return {p,done:new Promise(r=>p.on('exit',status=>r({status,out}))) };}
function order(site,id){site.sql(`INSERT INTO rubizh_customer_orders(id,external_id,email,order_number,status,payment_status,total,currency,items_json,delivery_label,created_at,updated_at) VALUES(${id},'test:${id}','','DB-${id}','new','pending',100,'UAH','[]','fixture',UTC_TIMESTAMP(),UTC_TIMESTAMP())`);}
async function cleanup(s){s.stop();php(`$db=new PDO('mysql:unix_socket='.getenv('RUBIZH_TEST_MYSQL_SOCKET'),'root','');$db->exec('DROP DATABASE ${s.schema}');`);rmSync(s.dir,{recursive:true,force:true});}
async function catalog(s){php(`require '${s.site}/api/lib.php';try{save_product(db(),['id'=>'db-product','name'=>'Fixture','canonical_category_id'=>'clothing_headwear','photos'=>['https://img.test/db.png'],'variants'=>[['sku'=>'DB-SKU','size'=>'M','color'=>'Olive','price'=>100,'availability'=>'in','stock'=>5]]]);}catch(Throwable $e){echo get_class($e).' '.$e->getMessage();exit(1);}`);return [{product_id:'db-product',sku:'DB-SKU',qty:1}];}
async function buyer(s){const r=await s.get('/shop/customer.php');return {csrf:r.data.csrf,h:{Cookie:r.headers.get('set-cookie').split(';')[0]}};}
async function hold(s,sql,fn){const ready=s.dir+'/hold-ready',release=s.dir+'/hold-release';const worker=child(s,`$db->beginTransaction();$db->query(${JSON.stringify(sql)})->fetchAll();file_put_contents('${ready}','ready');$end=microtime(true)+4;while(!is_file('${release}')&&microtime(true)<$end)usleep(10000);$db->rollBack();`);try{for(let i=0;i<200&&!existsSync(ready);i++)await delay(10);assert.ok(existsSync(ready));await fn();}finally{writeFileSync(release,'release');await worker.done;rmSync(ready,{force:true});rmSync(release,{force:true});}}

test('R2 different SKU reservation reads avoid secondary-index gap-lock deadlock',{skip,timeout:30000},async()=>{
 const s=await startSite();try{
  order(s,101);order(s,102);s.sql("INSERT INTO variants(sku,product_id,size,color,price,availability,data) VALUES('M100','db-a','','',100,'in','{}'),('M200','db-b','','',100,'in','{}')");
  const marker=n=>s.dir+'/ready'+n,go=s.dir+'/go';
  const workers=[101,102].map((id,n)=>child(s,`$db->exec('SET SESSION innodb_lock_wait_timeout=3');$db->beginTransaction();$db->query("SELECT sku FROM variants WHERE sku='M${n?200:100}' FOR UPDATE")->fetchAll();shopReservedQty($db,'M${n?200:100}');file_put_contents('${marker(n)}','ready');$end=microtime(true)+5;while(!is_file('${go}')&&microtime(true)<$end)usleep(10000);$db->exec("INSERT INTO rubizh_stock_reservations(order_id,sku,qty,expires_at,status) VALUES(${id},'M${n?200:100}',1,'2030-01-01','ACTIVE')");$db->commit();echo 'committed';`));
  for(let i=0;i<200&&!([0,1].every(n=>existsSync(marker(n))));i++)await delay(10);
  assert.ok([0,1].every(n=>existsSync(marker(n))),'both readers reached insertion barrier');writeFileSync(go,'go');
  const results=await Promise.all(workers.map(x=>x.done));assert.deepEqual(results.map(x=>x.status),[0,0],JSON.stringify(results));assert.equal(s.sql('SELECT * FROM rubizh_stock_reservations').length,2);
 }finally{await cleanup(s);}
});
test('R2 checkout retries one deadlock victim without duplicate order or request',{skip,timeout:30000},async()=>{
 const s=await startSite({enableV3:false});try{const lines=await catalog(s),b=await buyer(s);const q=await s.post('/shop/checkout-quote.php',{csrf:b.csrf,lines},b.h);assert.equal(q.status,200);
 s.sql('CREATE TABLE fixture_deadlock_once(n INT NOT NULL) ENGINE=MyISAM');s.sql('INSERT INTO fixture_deadlock_once VALUES(0)');s.sql("CREATE TRIGGER fixture_checkout_deadlock BEFORE INSERT ON rubizh_customer_orders FOR EACH ROW BEGIN IF (SELECT n FROM fixture_deadlock_once)=0 THEN UPDATE fixture_deadlock_once SET n=1; SIGNAL SQLSTATE '40001' SET MYSQL_ERRNO=1213,MESSAGE_TEXT='synthetic deadlock victim'; END IF; END");
 const r=await s.post('/shop/order.php',{csrf:b.csrf,request_id:'e'.repeat(32),contact:{name:'Fixture Buyer',recipient:'Fixture Buyer',phone:'+380671234567',city:'Kyiv',address:'Branch 1',delivery_type:'branch'},payment:'invoice',lines,expected_total:q.data.quote.total,catalog_version:q.data.quote.catalog_version},b.h);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(+s.sql('SELECT COUNT(*) n FROM rubizh_customer_orders')[0].n,1);assert.equal(+s.sql('SELECT COUNT(*) n FROM rubizh_checkout_requests')[0].n,1);assert.equal(+s.sql('SELECT COUNT(*) n FROM rubizh_stock_reservations')[0].n,1);
 s.sql('DROP TRIGGER fixture_checkout_deadlock');s.sql("CREATE TRIGGER fixture_checkout_deadlock BEFORE INSERT ON rubizh_customer_orders FOR EACH ROW SIGNAL SQLSTATE '40001' SET MYSQL_ERRNO=1213,MESSAGE_TEXT='synthetic persistent deadlock'");const failed=await s.post('/shop/order.php',{csrf:b.csrf,request_id:'f'.repeat(32),contact:{name:'Fixture Buyer',recipient:'Fixture Buyer',phone:'+380671234567',city:'Kyiv',address:'Branch 1',delivery_type:'branch'},payment:'invoice',lines,expected_total:q.data.quote.total,catalog_version:q.data.quote.catalog_version},b.h);assert.equal(failed.status,503);assert.equal(+s.sql('SELECT COUNT(*) n FROM rubizh_customer_orders')[0].n,1);
 }finally{await cleanup(s);}
});

test('R3 quote reads do not wait for catalog or variant locks; checkout ignores unrelated catalog mutex',{skip,timeout:30000},async()=>{
 const s=await startSite({enableV3:false});try{const lines=await catalog(s),b=await buyer(s);
 await hold(s,"SELECT sku FROM variants WHERE sku='DB-SKU' FOR UPDATE",async()=>{const pending=s.post('/shop/checkout-quote.php',{csrf:b.csrf,lines},b.h);const fast=await Promise.race([pending,delay(500).then(()=>null)]);assert.ok(fast,'quote waited for variant lock');assert.equal(fast.status,200,JSON.stringify(fast.data));});
 await hold(s,"SELECT v FROM meta WHERE k='pricing_catalog_version' FOR UPDATE",async()=>{const pending=s.post('/shop/checkout-quote.php',{csrf:b.csrf,lines},b.h);const fast=await Promise.race([pending,delay(500).then(()=>null)]);assert.ok(fast,'quote waited for global catalog lock');assert.equal(fast.status,200);
 const o=s.post('/shop/order.php',{csrf:b.csrf,request_id:'d'.repeat(32),contact:{name:'Fixture Buyer',recipient:'Fixture Buyer',phone:'+380671234567',city:'Kyiv',address:'Branch 1',delivery_type:'branch'},payment:'invoice',lines,expected_total:fast.data.quote.total,catalog_version:fast.data.quote.catalog_version},b.h);const result=await Promise.race([o,delay(500).then(()=>null)]);assert.ok(result,'checkout waited for global catalog lock');assert.equal(result.status,200,JSON.stringify(result.data));});
 }finally{await cleanup(s);}
});
test('R3 final optimistic check sees a catalog version changed after quote',{skip,timeout:30000},async()=>{
 const s=await startSite({enableV3:false});try{await catalog(s);const marker=s.dir+'/version-read',release=s.dir+'/version-check';const worker=child(s,`$db=shopStoreDatabase();$db->beginTransaction();$version=shopPricingCatalogVersion($db);file_put_contents('${marker}','ready');$end=microtime(true)+4;while(!is_file('${release}')&&microtime(true)<$end)usleep(10000);try{shopAssertCatalogVersion($db,$version);echo 'accepted';}catch(ShopOrderConflict $e){echo $e->reason;}$db->rollBack();`);for(let i=0;i<200&&!existsSync(marker);i++)await delay(10);assert.ok(existsSync(marker));s.sql("UPDATE meta SET v='r3-changed' WHERE k='pricing_catalog_version'");writeFileSync(release,'go');const result=await worker.done;assert.equal(result.status,0,result.out);assert.equal(result.out,'PRICE_CHANGED');
 }finally{await cleanup(s);}
});

test('R4 sale is deducted only until a newer SKU stock observation; terminal and partial refund semantics',{skip,timeout:30000},async()=>{
 const s=await startSite();try{order(s,201);s.sql("INSERT INTO variants(sku,product_id,size,color,price,availability,data,pim_stock_observed_at) VALUES('SALE-SKU','sale','','',100,'in','{}',1000)");s.sql("UPDATE rubizh_customer_orders SET payment_status='paid' WHERE id=201");s.sql("INSERT INTO rubizh_stock_reservations(order_id,sku,qty,expires_at,status,committed_at) VALUES(201,'SALE-SKU',1,'2030-01-01','COMMITTED','2026-10-01 12:00:00')");
 const reserved=()=>+php(`require '${s.site}/shop/store-lib.php';echo shopReservedQty(db(),'SALE-SKU');`).stdout;
 assert.equal(reserved(),1,'old stock observation still deducts sale');
 s.sql("UPDATE variants SET pim_stock_observed_at=1790856000000 WHERE sku='SALE-SKU'");assert.equal(reserved(),0,'stock observation at sale time already accounts for sale');
 s.sql("UPDATE variants SET pim_stock_observed_at=1790942400000 WHERE sku='SALE-SKU'");assert.equal(reserved(),0,'new feed must not double deduct sale');
 s.sql("UPDATE variants SET pim_stock_observed_at=NULL WHERE sku='SALE-SKU'");assert.equal(reserved(),1,'unknown observation conservatively retains sale');
 const transition=()=>php(`require '${s.site}/shop/store-lib.php';$db=db();$db->beginTransaction();shopReservationTransition($db,201,'COMMITTED','SYSTEM');$db->commit();`);
 transition();assert.equal(s.sql('SELECT status FROM rubizh_stock_reservations WHERE order_id=201')[0].status,'COMMITTED','paid balance preserves commitment');
 s.sql("UPDATE rubizh_customer_orders SET status='returned' WHERE id=201");transition();assert.equal(s.sql('SELECT status FROM rubizh_stock_reservations WHERE order_id=201')[0].status,'RELEASED');assert.equal(reserved(),0);
 s.sql("UPDATE rubizh_customer_orders SET status='confirmed',payment_status='paid' WHERE id=201");s.sql("UPDATE rubizh_stock_reservations SET status='COMMITTED',released_at=NULL WHERE order_id=201");s.sql("INSERT INTO rubizh_order_shipments(order_id,supplier_code,status,created_at,updated_at) VALUES(201,'fixture','returned',UTC_TIMESTAMP(),UTC_TIMESTAMP())");php(`require '${s.site}/shop/store-lib.php';npAggregateOrder(db(),201);`);assert.equal(s.sql('SELECT status FROM rubizh_stock_reservations WHERE order_id=201')[0].status,'RELEASED','final returned shipment persists release outside caller transaction');
 for(const [status,payment] of [['cancelled','paid'],['completed','refunded']]){s.sql("UPDATE rubizh_stock_reservations SET status='COMMITTED',released_at=NULL WHERE order_id=201");s.sql(`UPDATE rubizh_customer_orders SET status='${status}',payment_status='${payment}' WHERE id=201`);transition();assert.equal(s.sql('SELECT status FROM rubizh_stock_reservations WHERE order_id=201')[0].status,'RELEASED');}
 }finally{await cleanup(s);}
});
test('R4 isolated historical migration releases terminal rows and recovers only evidenced timestamps',{skip,timeout:30000},async()=>{
 const s=await startSite();try{order(s,301);order(s,302);order(s,303);s.sql("UPDATE rubizh_customer_orders SET payment_status='refunded' WHERE id=301");s.sql("INSERT INTO rubizh_stock_reservations(order_id,sku,qty,expires_at,status) VALUES(301,'OLD-A',1,'2030-01-01','COMMITTED'),(302,'OLD-B',1,'2030-01-01','COMMITTED'),(303,'OLD-C',1,'2030-01-01','COMMITTED')");s.sql(`INSERT INTO rubizh_order_audit(order_id,actor_id,actor_role,source,action,reason,before_json,after_json,created_at) VALUES(302,'${'0'.repeat(32)}','SYSTEM','SYSTEM','reservation.COMMITTED','fixture','{}','{"sku":"OLD-B"}','2026-10-01 12:00:00')`);
 const apply=()=>php(`require '${s.site}/shop/store-lib.php';require '${s.site}/shop/reservation-reconcile.php';echo json_encode(shopReservationReconcileApply(db()));`);
 assert.deepEqual(JSON.parse(apply().stdout),{terminal_released:1,timestamps_recovered:1});assert.deepEqual(JSON.parse(apply().stdout),{terminal_released:0,timestamps_recovered:0});const rows=s.sql('SELECT order_id,status,committed_at FROM rubizh_stock_reservations ORDER BY order_id');assert.equal(rows[0].status,'RELEASED');assert.equal(rows[1].committed_at,'2026-10-01 12:00:00');assert.equal(rows[2].committed_at,null);
 }finally{await cleanup(s);}
});
test('R4 committed UTC timestamp comparison is independent of database session timezone',{skip,timeout:30000},async()=>{
 const s=await startSite();try{order(s,401);s.sql("UPDATE rubizh_customer_orders SET payment_status='paid' WHERE id=401");s.sql("INSERT INTO variants(sku,product_id,size,color,price,availability,data,pim_stock_observed_at) VALUES('UTC-SKU','utc','','',100,'in','{}',1790852400000)");s.sql("INSERT INTO rubizh_stock_reservations(order_id,sku,qty,expires_at,status,committed_at) VALUES(401,'UTC-SKU',1,'2030-01-01','COMMITTED','2026-10-01 12:00:00')");
 for(const zone of ['+00:00','+03:00','-05:00'])assert.equal(+php(`require '${s.site}/shop/store-lib.php';$db=db();$db->exec("SET SESSION time_zone='${zone}'");echo shopReservedQty($db,'UTC-SKU');`).stdout,1,zone+' must count sale newer than UTC stock observation');
 s.sql("UPDATE variants SET pim_stock_observed_at=1790856000000 WHERE sku='UTC-SKU'");for(const zone of ['+00:00','+03:00','-05:00'])assert.equal(+php(`require '${s.site}/shop/store-lib.php';$db=db();$db->exec("SET SESSION time_zone='${zone}'");echo shopReservedQty($db,'UTC-SKU');`).stdout,0,zone+' must not double deduct equal UTC stock observation');
 }finally{await cleanup(s);}
});
