<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require __DIR__.'/../auth/bootstrap.php';
try{$db=shopStoreDatabase();if(!npConfigured()){fwrite(STDERR,"НП ще не налаштована.\n");exit(1);}
$ids=$db->query("SELECT DISTINCT order_id FROM rubizh_order_shipments WHERE tracking_number IS NOT NULL AND status NOT IN ('delivered','cancelled','returned') AND (checked_at IS NULL OR checked_at<UTC_TIMESTAMP()-INTERVAL 15 MINUTE) ORDER BY order_id LIMIT 30")->fetchAll(PDO::FETCH_COLUMN);
$failed=0;foreach($ids as $id){try{npRefresh($db,(int)$id,str_repeat('0',32));echo 'order '.(int)$id." checked\n";}catch(Throwable $e){$failed++;fwrite(STDERR,'order '.(int)$id." check failed; retry on next scheduled run\n");}}if($failed)exit(1);
}catch(Throwable $e){fwrite(STDERR,"Перевірка НП недоступна. Перевірте серверні налаштування.\n");exit(1);}
