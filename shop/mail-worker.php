<?php
declare(strict_types=1);
require __DIR__.'/../auth/bootstrap.php';require_once __DIR__.'/store-lib.php';
$secret=(string)cfg('cron_key');$key=$_GET['key'] ?? '';
if(!is_string($key) || strlen($secret)<16 || !hash_equals($secret,$key))shopJson(['ok'=>false,'error'=>'Недозволений запит.'],401);
try{$db=shopStoreDatabase();session_write_close();shopLifecycleTick($db);$buyerSent=shopSendBuyerMail($db);$ids=$db->query("SELECT order_id FROM rubizh_order_mail WHERE attempts<5 AND ((status='pending' AND next_at<=UTC_TIMESTAMP()) OR (status='sending' AND locked_at<UTC_TIMESTAMP()-INTERVAL 5 MINUTE)) ORDER BY next_at LIMIT 1")->fetchAll(PDO::FETCH_COLUMN);$sent=0;foreach($ids as $id)if(shopSendOrderMail($db,(int)$id)==='sent')$sent++;shopJson(['ok'=>true,'sent'=>$sent+$buyerSent]);}
catch(Throwable $e){error_log('rubizh mail worker: '.get_class($e).' code '.(string)$e->getCode());shopJson(['ok'=>false,'error'=>'Не вдалося обробити чергу.'],503);}
