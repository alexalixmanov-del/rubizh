<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require_once dirname(__DIR__).'/api/database.php';
require_once dirname(__DIR__).'/shop/order-p0-schema.php';
try{
    $o=getopt('',['plan','apply','config:','database:','backup-file:','backup-sha256:','isolated']);
    if(isset($o['plan'])===isset($o['apply']))throw new RuntimeException('Use --plan or --apply');
    $config=require($o['config']??dirname(__DIR__).'/api/config.php');
    $db=rubizhDatabaseConnect($config);$name=(string)$db->query('SELECT DATABASE()')->fetchColumn();
    if(isset($o['apply'])){
        if(($o['database']??null)!==$name)throw new RuntimeException('Database mismatch');
        if(isset($o['isolated'])){
            $socket=getenv('RUBIZH_TEST_MYSQL_SOCKET');
            if(!preg_match('/^fixture_pim_v3_[a-f0-9]{8,32}$/D',$name)||!$socket||($config['db_host']??'')!=='localhost')throw new RuntimeException('Isolated database required');
        }else{
            $f=realpath((string)($o['backup-file']??''));$root=realpath(dirname(__DIR__));$hash=(string)($o['backup-sha256']??'');
            if(!$f||str_starts_with($f,$root.'/')||!is_file($f)||filesize($f)<1024||!preg_match('/^[a-f0-9]{64}$/D',$hash)||!hash_equals($hash,hash_file('sha256',$f)))throw new RuntimeException('Verified off-webroot backup required');
        }
        shopP0ApplySchema($db);
    }
    echo json_encode(['mode'=>isset($o['apply'])?'APPLY':'PLAN','database'=>$name,'steps'=>array_map(fn($s)=>$s+['exists'=>shopP0StepExists($db,$s)],shopP0SchemaPlan())],JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR)."\n";
}catch(Throwable $e){fwrite(STDERR,"P0 migration refused: verify mode, database, backup and schema.\n");exit(1);}
