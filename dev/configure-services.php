<?php
declare(strict_types=1);
// Merge private credentials without replacing database, supplier or hosting settings.
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
$root=dirname(__DIR__);$source='';
foreach($argv as $argument)if(str_starts_with($argument,'--file='))$source=substr($argument,7);
$path=$source!==''?realpath($source):false;
if($source!==''&&(!$path||str_starts_with($path,$root.'/'))){fwrite(STDERR,"Вкажіть приватний JSON поза папкою www через --file=.\n");exit(2);}
if(!$path&&!in_array('--interactive',$argv,true)){fwrite(STDERR,"Вкажіть --file= або --interactive.\n");exit(2);}
$input=$path?json_decode(file_get_contents($path),true,16,JSON_THROW_ON_ERROR):[];
if(!is_array($input))throw new RuntimeException('Invalid credentials file');
$apiFile=$root.'/api/config.php';$authFile=$root.'/auth/config.php';
if(!is_file($apiFile)||is_link($apiFile)||is_link($authFile))throw new RuntimeException('Private hosting configuration unavailable');
$api=require $apiFile;$auth=is_file($authFile)?require $authFile:[];
if(!is_array($api)||!is_array($auth))throw new RuntimeException('Private configuration must return an array');
foreach(['mono_token','nova_poshta_api_key'] as $key)if(isset($input[$key])&&is_string($input[$key])&&trim($input[$key])!=='')$api[$key]=trim($input[$key]);
foreach(['google_client_id','google_client_secret','turbosms_token','turbosms_sender','noreply_password'] as $key)if(isset($input[$key])&&is_string($input[$key])&&$input[$key]!=='')$auth[$key]=$key==='noreply_password'?$input[$key]:trim($input[$key]);
if(in_array('--interactive',$argv,true)){
 if(!stream_isatty(STDIN)||!function_exists('shell_exec'))throw new RuntimeException('Interactive secure entry requires WebSSH terminal');
 foreach(['turbosms_token'=>'Токен TurboSMS (Шлюз API → Настройки API)', 'noreply_password'=>'Пароль ящика noreply@rubizh.shop'] as $key=>$label){
  if((string)($auth[$key]??'')!=='')continue;
  fwrite(STDOUT,$label.": ");$state=trim((string)shell_exec('stty -g 2>/dev/null'));if($state==='')throw new RuntimeException('Secure input unavailable');
  try{shell_exec('stty -echo');$value=rtrim((string)fgets(STDIN),"\r\n");}finally{shell_exec('stty '.escapeshellarg($state));fwrite(STDOUT,"\n");}
  if($value!=='')$auth[$key]=$key==='noreply_password'?$value:trim($value);
 }
}
if(strlen((string)($auth['auth_secret']??''))<40)$auth['auth_secret']=bin2hex(random_bytes(32));
$auth['turbosms_sender']=$auth['turbosms_sender']??'RUBIZH';
$auth['sms_enabled']=($auth['sms_enabled']??false)===true;
$auth['google_enabled']=($auth['google_enabled']??false)===true;
// Explicit activation is allowed only when all server-side authentication credentials exist.
if(in_array('--enable-auth',$argv,true)){
 if(trim((string)($auth['turbosms_token']??''))===''||trim((string)$auth['turbosms_sender'])==='')throw new RuntimeException('TurboSMS token and sender are required');
 $auth['sms_enabled']=true;$auth['google_enabled']=trim((string)($auth['google_client_id']??''))!==''&&trim((string)($auth['google_client_secret']??''))!=='';
}
$backupDir=dirname($root).'/rubizh-private-backups';
$mask=umask(0077);
try{
 if(!is_dir($backupDir)&&!mkdir($backupDir,0700,true))throw new RuntimeException('Backup directory unavailable');
 foreach([$apiFile=>$api,$authFile=>$auth] as $file=>$config){
  if(is_file($file)&&!copy($file,$backupDir.'/'.basename(dirname($file)).'-'.gmdate('Ymd-His').'-'.bin2hex(random_bytes(4)).'.php'))throw new RuntimeException('Private backup failed');
  $temp=$file.'.'.bin2hex(random_bytes(8)).'.tmp';$body="<?php\nreturn ".var_export($config,true).";\n";
  if(file_put_contents($temp,$body,LOCK_EX)===false||!rename($temp,$file))throw new RuntimeException('Private configuration write failed');
  chmod($file,0600);
 }
}finally{umask($mask);}
echo "Private configuration merged. Existing hosting settings preserved. No messages or payments sent.\n";
