<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require __DIR__.'/../auth/bootstrap.php';
try{
 $db=shopStoreDatabase();session_write_close();$deadline=microtime(true)+45;
 shopLifecycleTick($db);supplierEnsurePending($db);
 $db->exec("UPDATE rubizh_order_mail SET status='failed',locked_at=NULL,error='Остання спроба не завершилась; потрібна перевірка доставки' WHERE status='sending' AND attempts>=5 AND locked_at<UTC_TIMESTAMP()-INTERVAL 5 MINUTE");
 // New order confirmations take priority over optional cart reminders.
 $ids=$db->query("SELECT order_id FROM rubizh_order_mail WHERE attempts<5 AND ((status='pending' AND next_at<=UTC_TIMESTAMP()) OR (status='sending' AND locked_at<UTC_TIMESTAMP()-INTERVAL 5 MINUTE)) ORDER BY next_at LIMIT 5")->fetchAll(PDO::FETCH_COLUMN);
 foreach($ids as $id){if(microtime(true)>=$deadline)break;shopSendOrderMail($db,(int)$id);}
 foreach(['shopSendBuyerMail','shopSendNotifications','supplierSendPending','shopSendCartReminders'] as $worker){
  for($i=0;$i<5&&microtime(true)<$deadline;$i++){if($worker($db,1)===0)break;}
 }
 echo "Notification queues processed.\n";
}catch(Throwable $e){fwrite(STDERR,"Черга недоступна. Перевірте серверні налаштування.\n");exit(1);}
