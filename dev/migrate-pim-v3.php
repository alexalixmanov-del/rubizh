<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require_once dirname(__DIR__).'/shop/pim-v3-schema.php';

// Two modes:
//  --isolated: fixture schema on the explicitly configured test socket (tests).
//  --site-config: the shop's own private configuration (staging or production), plan by default;
//    --apply additionally requires --database equal to the connected schema and a verified
//    off-webroot database backup (--backup-file + --backup-sha256). No credentials are printed.
try{
    $options=getopt('',['isolated','site-config','database:','socket:','plan','apply','backup-file:','backup-sha256:']);
    if($options===false||isset($options['apply'],$options['plan'])||array_key_exists('isolated',$options)===array_key_exists('site-config',$options))throw new RuntimeException('usage');
    if(array_key_exists('isolated',$options)){
        if(!isset($options['database'],$options['socket']))throw new RuntimeException('usage');
        $name=$options['database'];$socket=$options['socket'];$testSocket=getenv('RUBIZH_TEST_MYSQL_SOCKET');
        if(!is_string($name)||!preg_match('/^fixture_pim_v3_[a-f0-9]{8,32}$/D',$name)||!is_string($socket)||!$testSocket||realpath($socket)===false||realpath($socket)!==realpath($testSocket))throw new RuntimeException('Only the explicitly configured isolated fixture DB/socket is allowed');
        $db=new PDO('mysql:unix_socket='.$socket.';dbname='.$name.';charset=utf8mb4','root','',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_EMULATE_PREPARES=>false]);
        $approved=null;
    }else{
        require_once dirname(__DIR__).'/api/lib.php';
        $db=db();$name=(string)$db->query('SELECT DATABASE()')->fetchColumn();$approved=null;
        if(array_key_exists('apply',$options)){
            if(($options['database']??null)!==$name)throw new RuntimeException('--database must name the connected schema');
            $file=$options['backup-file']??'';$sum=strtolower((string)($options['backup-sha256']??''));
            $root=realpath(dirname(__DIR__));$real=is_string($file)?realpath($file):false;
            if($real===false||!is_file($real)||filesize($real)<1024||str_starts_with($real,$root.DIRECTORY_SEPARATOR)||!preg_match('/^[a-f0-9]{64}$/D',$sum)||!hash_equals($sum,hash_file('sha256',$real)))throw new RuntimeException('A verified off-webroot backup is required');
            $approved=$name;
        }
    }
    if(array_key_exists('apply',$options))$result=pimV3ApplyFoundation($db,$approved);
    else{$result=['mode'=>'plan','database'=>$name,'steps'=>array_map(fn($s)=>$s+['exists'=>pimV3SchemaStepExists($db,$s)],pimV3SchemaPlan()),'writes'=>0,'sync_enabled'=>false];}
    echo json_encode($result,JSON_THROW_ON_ERROR|JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES)."\n";
}catch(Throwable $e){fwrite(STDERR,"Foundation refused: ".($e->getMessage()==='usage'?'use --isolated --database=fixture_pim_v3_<hex> --socket=<test socket> [--plan|--apply] or --site-config [--plan | --apply --database=<connected schema> --backup-file=<off-webroot dump> --backup-sha256=<hex>]':'schema/socket, supported DB, backup and journal must be verified').". No credentials are printed.\n");exit(1);}
