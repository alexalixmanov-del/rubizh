<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require __DIR__.'/../shop/settings-lib.php';
$input=[];
foreach($argv as $arg)foreach(['ga4_id'=>'--ga4=','meta_pixel_id'=>'--meta='] as $key=>$prefix)if(str_starts_with($arg,$prefix))$input[$key]=substr($arg,strlen($prefix));
if(!$input){fwrite(STDERR,"Usage: php dev/configure-analytics.php --ga4=G-... --meta=...\n");exit(2);}
shopSettingsValidate($input);
$file=shopSettingsPath();$backup=dirname(__DIR__,2).'/rubizh-private-backups';$mask=umask(0077);
try{
 if(is_file($file)){if(!is_dir($backup)&&!mkdir($backup,0700,true))throw new RuntimeException('Backup unavailable');if(!copy($file,$backup.'/analytics-'.gmdate('Ymd-His').'-'.bin2hex(random_bytes(4)).'.json'))throw new RuntimeException('Backup unavailable');}
 shopSettingsSave($input);
}finally{umask($mask);}
echo "Analytics IDs saved. Tracking loads only after the customer's consent.\n";
