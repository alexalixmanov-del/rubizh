<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
define('RUBIZH_AUTH',true);require dirname(__DIR__).'/api/lib.php';require dirname(__DIR__).'/shop/store-lib.php';
try{
 $o=getopt('',['plan','apply','isolated','database:','socket:','backup-file:','backup-sha256:']);
 if(isset($o['plan'])===isset($o['apply']))throw new RuntimeException('Choose plan/apply');
 if(isset($o['isolated'])){
  $name=$o['database']??'';$socket=$o['socket']??'';$testSocket=getenv('RUBIZH_TEST_MYSQL_SOCKET');
  if(!is_string($name)||!preg_match('/^fixture_pim_v3_[a-f0-9]{8,32}$/D',$name)||!is_string($socket)||!$testSocket||realpath($socket)===false||realpath($socket)!==realpath($testSocket))throw new RuntimeException('Only the configured fixture schema/socket is allowed');
  $db=new PDO('mysql:unix_socket='.$socket.';dbname='.$name.';charset=utf8mb4','root','',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_EMULATE_PREPARES=>false]);
 }else{$db=rubizhDatabaseConnect(cfg());$name=(string)$db->query('SELECT DATABASE()')->fetchColumn();}
 if(isset($o['apply'])){
  if(($o['database']??'')!==$name)throw new RuntimeException('Database mismatch');
  if(!isset($o['isolated'])){
   $file=realpath((string)($o['backup-file']??''));$hash=$o['backup-sha256']??'';
   if(!$file||!is_file($file)||str_starts_with($file,dirname(__DIR__).'/')||filesize($file)<1024||!preg_match('/^[a-f0-9]{64}$/D',$hash)||!hash_equals($hash,hash_file('sha256',$file)))throw new RuntimeException('Verified backup required');
  }
  npRecoveryMigrate($db);
 }
 echo json_encode(['mode'=>isset($o['apply'])?'APPLY':'PLAN','database'=>$name,'additive_columns'=>['reconciliation_zero_at','reconciliation_matches','reconciliation_evidence']],JSON_PRETTY_PRINT)."\n";
}catch(Throwable $e){fwrite(STDERR,'NP recovery migration refused: '.$e->getMessage()."\n");exit(1);}
