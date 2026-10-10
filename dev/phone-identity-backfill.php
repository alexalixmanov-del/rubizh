<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require dirname(__DIR__).'/api/database.php';require dirname(__DIR__).'/staff/read.php';require dirname(__DIR__).'/staff/phone-plan.php';
try{$o=getopt('',['plan','config:']);if(!isset($o['plan'])||array_diff(array_slice($argv,1),array_filter(array_slice($argv,1),fn($v)=>$v==='--plan'||str_starts_with($v,'--config='))))throw new RuntimeException('Read-only plan only');$c=require($o['config']??dirname(__DIR__).'/api/config.php');$db=rubizhDatabaseConnect($c);$db->exec('SET TRANSACTION READ ONLY');$db->beginTransaction();$out=crmPhonePlan($db);$db->rollBack();echo json_encode($out,JSON_THROW_ON_ERROR|JSON_PRETTY_PRINT)."\n";}catch(Throwable $e){if(isset($db)&&$db->inTransaction())$db->rollBack();fwrite(STDERR,"Phone plan refused: verify mode, configuration and schema.\n");exit(1);}
