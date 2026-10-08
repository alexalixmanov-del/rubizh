<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require __DIR__.'/../api/lib.php';
// Read-only: never performs a production stress test or prints credentials.
$out=['php'=>PHP_VERSION,'cli_memory_limit'=>ini_get('memory_limit'),'web_worker_limit'=>'ask_hosting_provider','tenant_cpu_memory_limits'=>'ask_hosting_provider','origin_admission'=>['public_reads'=>16,'account_requests'=>12,'checkout'=>8,'catalog_rebuilds'=>4],'guaranteed_simultaneous_buyers'=>null];
try{
 $db=db();$out['database']='verified';
 foreach(['max_connections','max_user_connections','innodb_buffer_pool_size'] as $name){$rows=$db->query("SHOW VARIABLES LIKE '".$name."'")->fetch(PDO::FETCH_NUM);$out['db'][$name]=isset($rows[1])?(int)$rows[1]:null;}
 foreach(['Threads_connected','Threads_running'] as $name){$rows=$db->query("SHOW STATUS LIKE '".$name."'")->fetch(PDO::FETCH_NUM);$out['db'][$name]=isset($rows[1])?(int)$rows[1]:null;}
 $start=microtime(true);$db->query('SELECT 1')->fetchColumn();$out['db_roundtrip_ms']=round((microtime(true)-$start)*1000,2);
 $out['note']='Database global limits are not hosting tenant limits. Admission slots are safeguards, not a visitor capacity guarantee.';
 echo json_encode($out,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR)."\n";
}catch(Throwable $e){fwrite(STDERR,"Capacity report unavailable; check private database configuration.\n");exit(1);}
