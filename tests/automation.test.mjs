import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,copyFileSync,readdirSync,rmSync,readFileSync,existsSync} from 'node:fs';
import {spawnSync,spawn} from 'node:child_process';
import path from 'node:path';
import {tmpdir} from 'node:os';
const root=path.resolve(import.meta.dirname,'..'),php=process.env.PHP_PATH||'/workspace/php-runtime/root/usr/bin/php8.4',ext='/workspace/php-runtime/root/usr/lib/php/20240924/';
const env={...process.env,LD_LIBRARY_PATH:'/workspace/php-runtime/root/usr/lib/x86_64-linux-gnu'};
function run(source,args=[]){const r=spawnSync(php,['-n','-d','error_reporting=24575','-d','extension='+ext+'pdo.so','-d','extension='+ext+'mysqlnd.so','-d','extension='+ext+'pdo_mysql.so','-d','extension='+ext+'mbstring.so','-r',source,...args],{env,encoding:'utf8',timeout:20000});assert.equal(r.status,0,r.stderr+'\n'+r.stdout);return r.stdout;}
test('Cart mail has escaped real variants, quantities and a limited recovery link; order stages include one tracking section',()=>{
 const result=JSON.parse(run(`define('RUBIZH_AUTH',true);require '${root}/auth/email-templates.php';
 $items=[['name'=>'Костюм <script>','variant'=>'L · Олива','qty'=>2],['name'=>'Сітка','qty'=>1.5,'sale_unit'=>'m2']];
 $cart=rubizhCartReminderEmail($items,str_repeat('a',64));$o=['order_number'=>'FIXTURE-1','total'=>2000,'payment_status'=>'paid','items_json'=>json_encode([['name'=>'Костюм','variant'=>'L · Олива','price'=>1000,'qty'=>2]]),'shipments'=>[['tracking_number'=>'20450000000001','status'=>'arrived'],['tracking_number'=>'<invalid>','status'=>'arrived']]];
 $out=['cart'=>$cart];foreach(['shipped','arrived','received'] as $event){$out[$event]=rubizhOrderEmail($o+['mail_event'=>$event,'split_delivery'=>true]);}echo json_encode($out);`));
 assert.match(result.cart.html,/&lt;script&gt;/);assert.doesNotMatch(result.cart.html,/<script>/);assert.match(result.cart.plain,/L · Олива — 2 шт/);assert.match(result.cart.plain,/1.5 м²/);
 assert.match(result.cart.plain,/cart-return.php\?code=a{64}/);assert.match(result.cart.html,/unsubscribe=1/);assert.doesNotMatch(result.cart.html,/auth\/confirm|login_token/);
 for(const event of ['shipped','arrived','received']){assert.match(result[event].subject,/Частин/);assert.equal((result[event].plain.match(/ТТН:/g)||[]).length,1);assert.match(result[event].html,/cargo_number=20450000000001/);assert.doesNotMatch(result[event].html,/invalid/);}
});
test('Reminder eligibility uses UTC, checks deadline and expiry and never re-sends terminal carts',()=>{
 run(`require '${root}/shop/cart-reminders-lib.php';date_default_timezone_set('Europe/Kyiv');$now=strtotime('2026-10-07 12:00:00 UTC');$r=['status'=>'pending','attempts'=>0,'next_at'=>'2026-10-07 12:00:00','expires_at'=>'2026-10-08 12:00:00'];
 if(!shopCartReminderCanSend($r,false,false,$now)||shopCartReminderCanSend($r,false,false,$now-1))throw new Exception('UTC deadline');
 foreach(['sent','cancelled','converted','expired','failed'] as $s)if(shopCartReminderCanSend(array_replace($r,['status'=>$s]),false,false,$now))throw new Exception('Terminal cart sent');
 if(shopCartReminderCanSend($r,true,false,$now)||shopCartReminderCanSend($r,false,true,$now)||shopCartReminderCanSend(array_replace($r,['attempts'=>5]),false,false,$now)||shopCartReminderCanSend($r,false,false,$now+86400))throw new Exception('Guard ignored');
 foreach([null,'bad',"x@example.com\\r\\nBcc:y@example.com"] as $e){try{shopCartReminderEmail($e);throw new LogicException('Invalid email accepted');}catch(RuntimeException $ok){}}`);
});
test('Real MySQL queue: consent, validated catalogue, debounce, delivery, conversion, retries, locks and parcel dedupe',{skip:!process.env.RUBIZH_TEST_MYSQL_SOCKET},()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'rubizh-mail-sql-'));
 try{
  for(const folder of ['shop','auth','api']){mkdirSync(path.join(dir,folder));for(const file of readdirSync(path.join(root,folder)))if(file.endsWith('.php')&&!['config.php','np-private.php','mono-private.php'].includes(file))copyFileSync(path.join(root,folder,file),path.join(dir,folder,file));}
  writeFileSync(path.join(dir,'api/config.php'),"<?php return ['seller'=>[]];");
  writeFileSync(path.join(dir,'auth/mailer.php'),"<?php function rubizhSendOrder($email,$password,$order){$GLOBALS['fixture_sent_orders'][]=$order;}");
  run(`define('RUBIZH_AUTH',true);function authConfig(){return ['noreply_password'=>'fixture-only'];}require '${dir}/auth/account.php';require '${dir}/shop/store-lib.php';
  $dsn='mysql:unix_socket='.getenv('RUBIZH_TEST_MYSQL_SOCKET').';charset=utf8mb4';$db=new PDO($dsn,'root','',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_EMULATE_PREPARES=>false]);$schema='fixture_cart_'.bin2hex(random_bytes(5));$db->exec('CREATE DATABASE '.$schema.' CHARACTER SET utf8mb4');$db->exec('USE '.$schema);
  function check($v,$m){if(!$v)throw new Exception($m);}function rejected($call){try{$call();throw new LogicException('Expected rejection');}catch(RuntimeException $e){}}
  try{
   migrate($db);$db->exec("CREATE TABLE rubizh_customer_orders(id BIGINT PRIMARY KEY,email VARCHAR(254),created_at DATETIME,status VARCHAR(24),payment_status VARCHAR(24))");
   $db->exec("CREATE TABLE rubizh_buyer_mail(order_id BIGINT UNSIGNED NOT NULL,event VARCHAR(16) NOT NULL,status VARCHAR(12) NOT NULL DEFAULT 'pending',attempts INT NOT NULL DEFAULT 0,next_at DATETIME NOT NULL,locked_at DATETIME NULL,error VARCHAR(240) NOT NULL DEFAULT '',PRIMARY KEY(order_id,event))");
   shopLifecycleMigrate($db);shopCartReminderMigrate($db);
   $db->exec("INSERT INTO products(id,slug,name,category_path,data,created_at,updated_at,synced_at) VALUES('p','fixture','Костюм','Одяг та форма','{}',UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP())");
   $db->exec("INSERT INTO variants(sku,product_id,size,color,price,availability,data) VALUES('SKU-L','p','','Олива',1000,'in','{\\\"size_native\\\":\\\"L\\\"}'),('SKU-BLANK','p','','Олива',1000,'in','{}')");
   $a=str_repeat('a',64);$input=['consent'=>true,'email'=>' Buyer@example.com ','lines'=>[['product_id'=>'p','sku'=>'SKU-L','qty'=>2,'kit_group'=>'kit-one','name'=>'spoof','price'=>1]]];
   rejected(fn()=>shopCartReminderSave($db,$a,null,array_replace($input,['consent'=>false])));rejected(fn()=>shopCartReminderSave($db,$a,null,array_replace($input,['lines'=>[['product_id'=>'p','sku'=>'SKU-BLANK','qty'=>1]]])));
   shopCartReminderSave($db,$a,null,$input);$row=$db->query('SELECT * FROM rubizh_cart_reminders')->fetch();$oldCode=$row['recovery_code'];check($row['email']==='buyer@example.com'&&!str_contains($row['items_json'],'spoof')&&!str_contains($row['items_json'],'price'),'Trusted snapshot');
   check((int)$db->query('SELECT TIMESTAMPDIFF(SECOND,updated_at,next_at) FROM rubizh_cart_reminders')->fetchColumn()===86400,'24h inactivity');
   check(shopSendCartReminders($db,5,fn()=>throw new Exception('Premature send'))===0,'Before due');
   $db->exec("UPDATE rubizh_cart_reminders SET next_at=UTC_TIMESTAMP()-INTERVAL 1 MINUTE");shopCartReminderSave($db,$a,null,$input);check(shopSendCartReminders($db,5,fn()=>throw new Exception('Premature send'))===0,'Activity postpones');
   $db2=new PDO($dsn.';dbname='.$schema,'root','',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$lock=shopCartReminderLock($db2,'scope',$a);rejected(fn()=>shopCartReminderSave($db,$a,null,$input));shopCartReminderUnlock($db2,$lock);
   $db->exec("UPDATE rubizh_cart_reminders SET next_at=UTC_TIMESTAMP()-INTERVAL 1 MINUTE");$lock=shopCartReminderLock($db2,'email',hash('sha256','buyer@example.com'));check(shopSendCartReminders($db,5,fn()=>throw new Exception('Email lock ignored'))===0,'Per-email lock');shopCartReminderUnlock($db2,$lock);
   $db->exec("UPDATE rubizh_cart_reminders SET next_at=UTC_TIMESTAMP()-INTERVAL 1 MINUTE");$sent=0;check(shopSendCartReminders($db,5,function($email,$mail)use(&$sent){$sent++;check($email==='buyer@example.com'&&str_contains($mail['plain'],'L · Олива'),'Resolved email');})===1,'Send due');check($sent===1,'Single message');check(shopSendCartReminders($db,5,fn()=>throw new Exception('Duplicate'))===0,'No repeat');rejected(fn()=>shopCartReminderSave($db,str_repeat('b',64),null,$input));
   shopCartReminderCancel($db,$a);check(shopCartReminderRow($db,$oldCode)===null,'Unsubscribe revokes recovery');$db->exec("UPDATE rubizh_cart_reminders SET sent_at=UTC_TIMESTAMP()-INTERVAL 8 DAY");shopCartReminderSave($db,$a,null,$input);check(shopCartReminderRow($db,$oldCode)===null,'Old capability not revived');
   $db->beginTransaction();shopCartRemindersConverted($db,$a,'buyer@example.com',null);$db->commit();check($db->query('SELECT status FROM rubizh_cart_reminders')->fetchColumn()==='converted','Order cancels reminder');
   shopCartReminderSave($db,$a,null,$input);$db->exec("INSERT INTO rubizh_customer_orders VALUES(1,'buyer@example.com',UTC_TIMESTAMP(),'new','pending')");$db->exec("UPDATE rubizh_cart_reminders SET next_at=UTC_TIMESTAMP()-INTERVAL 1 MINUTE");check(shopSendCartReminders($db,5,fn()=>throw new Exception('Ordered cart emailed'))===0,'Order guard');check($db->query('SELECT status FROM rubizh_cart_reminders')->fetchColumn()==='converted','Guard converts');
   $db->exec('DELETE FROM rubizh_customer_orders');shopCartReminderSave($db,$a,null,$input);
   for($i=0;$i<5;$i++){$db->exec("UPDATE rubizh_cart_reminders SET next_at=UTC_TIMESTAMP()-INTERVAL 1 MINUTE");shopSendCartReminders($db,5,fn()=>throw new Exception('Fixture SMTP rejection'));}
   $r=$db->query('SELECT status,attempts FROM rubizh_cart_reminders')->fetch();check($r['status']==='failed'&&(int)$r['attempts']===5,'Retries bounded');
   check(npDeliveryMailEvent('7')==='arrived'&&npDeliveryMailEvent('9')==='received'&&npDeliveryMailEvent('4')==='shipped'&&npDeliveryMailEvent('102')==='','Only current parcel event');
   shopQueueBuyerMail($db,1,'arrived','20450000000001');shopQueueBuyerMail($db,1,'arrived','20450000000001');shopQueueBuyerMail($db,1,'arrived','20450000000002');check((int)$db->query('SELECT COUNT(*) FROM rubizh_buyer_mail')->fetchColumn()===2,'Per-parcel dedupe');
   $db->exec('DELETE FROM rubizh_buyer_mail');shopUiMigrate($db);npMigrate($db);
   $db->exec("ALTER TABLE rubizh_customer_orders ADD order_number VARCHAR(64),ADD total DECIMAL(12,2),ADD items_json TEXT,ADD delivery_label VARCHAR(500),ADD updated_at DATETIME");
   $db->exec("CREATE TABLE rubizh_order_details(order_id BIGINT PRIMARY KEY,contact_json TEXT,subtotal DECIMAL(12,2),discount_amount DECIMAL(12,2),shipping_amount DECIMAL(12,2))");
   $db->prepare('INSERT INTO rubizh_customer_orders(id,email,created_at,status,payment_status,order_number,total,items_json,delivery_label,updated_at) VALUES(2,?,UTC_TIMESTAMP(),?,?,?,?,?,?,UTC_TIMESTAMP())')->execute(['buyer@example.com','new','pending','FIXTURE-2',2000,json_encode([['name'=>'Костюм','variant'=>'L · Олива','price'=>1000,'qty'=>2]]),'НП']);
   $db->prepare('INSERT INTO rubizh_order_details VALUES(2,?,2000,0,0)')->execute([json_encode(['brigade'=>'Бригада покупця','payment'=>'invoice'])]);
   $db->exec("CREATE TABLE rubizh_order_mail(order_id BIGINT PRIMARY KEY,recipient VARCHAR(254),status VARCHAR(12),attempts INT DEFAULT 0,next_at DATETIME,locked_at DATETIME,error VARCHAR(240),updated_at DATETIME)");
   $db->exec("INSERT INTO rubizh_order_mail(order_id,recipient,status,next_at) VALUES(2,'buyer@example.com','pending',UTC_TIMESTAMP())");
   check(shopSendOrderMail($db,2)==='sent','Initial confirmation queued');check($GLOBALS['fixture_sent_orders'][0]['contact']['brigade']==='Бригада покупця','Initial confirmation retains custom brigade');$GLOBALS['fixture_sent_orders']=[];
   $db->exec("UPDATE rubizh_customer_orders SET payment_status='paid' WHERE id=2");
   foreach(['20450000000001','20450000000002'] as $number)$db->prepare("INSERT INTO rubizh_order_shipments(order_id,supplier_code,tracking_number,status,created_at,updated_at) VALUES(2,'fixture',?,'sent',UTC_TIMESTAMP(),UTC_TIMESTAMP())")->execute([$number]);
   shopTimelineEvent($db,2,'arrived','20450000000001',gmdate('Y-m-d H:i:s'));shopQueueBuyerMail($db,2,'shipped','20450000000001');shopQueueBuyerMail($db,2,'arrived','20450000000001');shopQueueBuyerMail($db,2,'arrived','20450000000002');
   check(shopSendBuyerMail($db,5)===2,'Skip stale shipment message, send two parcel arrivals');check(count($GLOBALS['fixture_sent_orders'])===2,'Only current events delivered');foreach($GLOBALS['fixture_sent_orders'] as $mail)check($mail['mail_event']==='arrived'&&count($mail['shipments'])===1&&$mail['split_delivery']===true,'Specific parcel delivery');
   $db->exec("UPDATE rubizh_customer_orders SET status='cancelled' WHERE id=2");shopQueueBuyerMail($db,2,'received','20450000000002');check(shopSendBuyerMail($db,5)===0,'Do not email a cancelled shipment');

  }finally{$db->exec('DROP DATABASE '.$schema);}echo 'passed';`);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('Scheduler runs each worker once, respects its interval, isolates failures and prevents concurrent overlap',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'rubizh-automation-')),site=path.join(dir,'www');mkdirSync(path.join(site,'shop'),{recursive:true});copyFileSync(path.join(root,'shop/automation-worker.sh'),path.join(site,'shop/automation-worker.sh'));
 const fake=path.join(dir,'php');writeFileSync(fake,'#!/bin/sh\nprintf "%s\\n" "$1" >> "$FIXTURE_RUNS"\nsleep 0.2\ncase "$1" in *notification*) exit 7;; esac\n',{mode:0o755});const runs=path.join(dir,'runs'),options={env:{...process.env,RUBIZH_PHP_BIN:fake,FIXTURE_RUNS:runs},encoding:'utf8'};
 const execute=()=>new Promise(resolve=>{const p=spawn('bash',[path.join(site,'shop/automation-worker.sh')],options);p.on('close',resolve);});
 try{await Promise.all([execute(),execute()]);const lines=readFileSync(runs,'utf8').trim().split('\n');assert.equal(lines.length,5);assert.equal(new Set(lines).size,5);assert.match(readFileSync(path.join(dir,'rubizh-automation/notifications.state'),'utf8'),/^\d+ 7 0/);assert.match(readFileSync(path.join(dir,'rubizh-automation/cache.state'),'utf8'),/^\d+ 0 \d+/);assert.equal(await execute(),0);assert.equal(readFileSync(runs,'utf8').trim().split('\n').length,5);}finally{rmSync(dir,{recursive:true,force:true});}
});
test('Read-only launch report distinguishes fresh, failed and missing workers without printing private credentials',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'rubizh-launch-report-')),site=path.join(dir,'www'),state=path.join(dir,'rubizh-automation');
 for(const folder of ['dev','auth','api'])mkdirSync(path.join(site,folder),{recursive:true});mkdirSync(state);
 copyFileSync(path.join(root,'dev/check-launch.php'),path.join(site,'dev/check-launch.php'));copyFileSync(path.join(root,'auth/identities.php'),path.join(site,'auth/identities.php'));
 writeFileSync(path.join(site,'auth/config.php'),"<?php return ['noreply_password'=>'private-fixture-mail'];");writeFileSync(path.join(site,'api/config.php'),"<?php return ['db_host'=>'','db_pass'=>'private-fixture-db'];");
 const now=Math.floor(Date.now()/1000);writeFileSync(path.join(state,'cache.state'),`${now} 0 ${now}`);writeFileSync(path.join(state,'notifications.state'),`${now} 7 ${now-60}`);writeFileSync(path.join(state,'payments.state'),`${now-900} 0 ${now-900}`);
 try{const r=spawnSync(php,['-n',path.join(site,'dev/check-launch.php')],{env,encoding:'utf8'});assert.equal(r.status,2,r.stderr||r.stdout);assert.doesNotMatch(r.stdout,/private-fixture/);const report=JSON.parse(r.stdout);assert.equal(report.smtp_auth,'not_checked');assert.equal(report.workers.cache.status,'verified');assert.equal(report.workers.notifications.status,'failed');assert.equal(report.workers.payments.status,'stale');assert.equal(report.workers.delivery.status,'not_seen');assert.equal(report.inbox_delivery,'real_checkout_test_required');assert.equal(report.database,'failed');}finally{rmSync(dir,{recursive:true,force:true});}
});
