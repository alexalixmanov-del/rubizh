<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require __DIR__.'/../auth/bootstrap.php';
try{
 $db=shopStoreDatabase();phoneDatabase();
 $indexes=$db->query('SHOW INDEX FROM rubizh_shop_limits')->fetchAll(PDO::FETCH_ASSOC);
 if(!in_array('idx_limit_expiry',array_column($indexes,'Key_name'),true))$db->exec('ALTER TABLE rubizh_shop_limits ADD INDEX idx_limit_expiry(window_start)');
 $db->prepare("INSERT INTO meta(k,v) VALUES('runtime_schema','20261008-v1') ON DUPLICATE KEY UPDATE v=VALUES(v)")->execute();
 rubizhRuntimeDir();
 echo "Runtime schema prepared. No orders or external notifications created.\n";
}catch(Throwable $e){error_log('rubizh runtime setup: '.$e->getMessage());fwrite(STDERR,"Runtime setup failed; check private server logs.\n");exit(1);}
