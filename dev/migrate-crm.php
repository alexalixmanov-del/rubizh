<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
define('RUBIZH_AUTH',true);require dirname(__DIR__).'/api/lib.php';require dirname(__DIR__).'/shop/store-lib.php';require_once dirname(__DIR__).'/staff/auth.php';require_once dirname(__DIR__).'/staff/schema.php';
try{$o=getopt('',['plan','apply','isolated','database:','backup-file:','backup-sha256:']);if(isset($o['plan'])===isset($o['apply']))throw new RuntimeException('Choose plan/apply');$db=rubizhDatabaseConnect(cfg());$name=(string)$db->query('SELECT DATABASE()')->fetchColumn();
 if(isset($o['apply'])){if(($o['database']??'')!==$name)throw new RuntimeException('Database mismatch');if(isset($o['isolated'])){if(!preg_match('/^fixture_[a-z0-9_]+$/D',$name)||!getenv('RUBIZH_TEST_MYSQL_SOCKET')||cfg('db_host')!=='localhost')throw new RuntimeException('Fixture only');}else{$file=realpath((string)($o['backup-file']??''));$hash=$o['backup-sha256']??'';if(!$file||str_starts_with($file,dirname(__DIR__).'/')||filesize($file)<1024||!preg_match('/^[a-f0-9]{64}$/D',$hash)||!hash_equals($hash,hash_file('sha256',$file)))throw new RuntimeException('Verified backup required');}crmMigrate($db);}
 echo json_encode(['version'=>CRM_SCHEMA_VERSION,'mode'=>isset($o['apply'])?'APPLY':'PLAN','database'=>$name,'steps'=>array_map(fn($s)=>['name'=>$s['name'],'sha256'=>hash('sha256',$s['sql']),'exists'=>crmStepExists($db,$s)],crmSchemaSteps())],JSON_THROW_ON_ERROR|JSON_PRETTY_PRINT)."\n";
}catch(Throwable $e){fwrite(STDERR,'CRM migration refused: '.$e->getMessage()."\n");exit(1);}
