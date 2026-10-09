<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require_once dirname(__DIR__).'/shop/pim-v3-schema.php';

try{
    $options=getopt('',['isolated','database:','socket:','plan','apply']);
    if($options===false||!array_key_exists('isolated',$options)||!isset($options['database'],$options['socket'])||isset($options['apply'],$options['plan']))throw new RuntimeException('Use --isolated --database=fixture_pim_v3_<8-32 hex> --socket=<test socket> [--plan|--apply]');
    $name=$options['database'];$socket=$options['socket'];$testSocket=getenv('RUBIZH_TEST_MYSQL_SOCKET');
    if(!is_string($name)||!preg_match('/^fixture_pim_v3_[a-f0-9]{8,32}$/D',$name)||!is_string($socket)||!$testSocket||realpath($socket)===false||realpath($socket)!==realpath($testSocket))throw new RuntimeException('Only the explicitly configured isolated fixture DB/socket is allowed');
    $db=new PDO('mysql:unix_socket='.$socket.';dbname='.$name.';charset=utf8mb4','root','',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_EMULATE_PREPARES=>false]);
    if(array_key_exists('apply',$options))$result=pimV3ApplyFoundation($db);
    else{$result=['mode'=>'plan','steps'=>array_map(fn($s)=>$s+['exists'=>pimV3SchemaStepExists($db,$s)],pimV3SchemaPlan()),'writes'=>0,'sync_enabled'=>false];}
    echo json_encode($result,JSON_THROW_ON_ERROR|JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES)."\n";
}catch(Throwable){fwrite(STDERR,"Foundation refused: isolated schema/socket, supported DB and journal must be verified. No production credentials are read.\n");exit(1);}
