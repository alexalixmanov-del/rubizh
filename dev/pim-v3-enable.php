<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
// Guarded owner command: switch the PIM contract-3 intake (`pim_v3_sync`) in api/config.php without rewriting the file.
// Only that one setting changes (text edit of the existing key, or one appended entry); every other byte, comment and
// any PHP logic of the private config stay as they are. Apply requires the exact current SHA256 from --plan, keeps a
// backup of the original outside the web root, lints and re-reads the new file in a separate PHP process, checks that
// every other setting is unchanged, and restores the original on any failure. Already in the wanted state → NO_CHANGE.
// Usage:
//   php dev/pim-v3-enable.php --plan [--disable] [--config=api/config.php] [--backup-dir=../rubizh-private-backups]
//   php dev/pim-v3-enable.php --apply --expect-sha256=<sha from --plan> [--disable] [--config=…] [--backup-dir=…]
const PIM_V3_KEY='pim_v3_sync';
function out(array $r,int $code=0):never{echo json_encode($r,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE),"\n";exit($code);}
function readConfig(string $php,string $file):array{
    // A separate process: the private config is never evaluated inside this command.
    $cmd=[$php,'-d','display_errors=stderr','-r','$c=require $argv[1];if(!is_array($c)){fwrite(STDERR,"NOT_ARRAY");exit(3);}$j=json_encode($c,JSON_PRESERVE_ZERO_FRACTION);if($j===false){fwrite(STDERR,"NOT_JSON");exit(4);}echo $j;',$file];
    $p=proc_open($cmd,[1=>['pipe','w'],2=>['pipe','w']],$pipes);if(!is_resource($p))throw new RuntimeException('PHP_UNAVAILABLE');
    $stdout=stream_get_contents($pipes[1]);$stderr=stream_get_contents($pipes[2]);$code=proc_close($p);
    if($code!==0)throw new RuntimeException('CONFIG_UNREADABLE: '.trim((string)$stderr));
    $c=json_decode((string)$stdout,true);if(!is_array($c))throw new RuntimeException('CONFIG_UNREADABLE');return $c;
}
function lint(string $php,string $file):void{
    $p=proc_open([$php,'-l',$file],[1=>['pipe','w'],2=>['pipe','w']],$pipes);stream_get_contents($pipes[1]);stream_get_contents($pipes[2]);
    if(proc_close($p)!==0)throw new RuntimeException('LINT_FAILED');
}
function edited(string $text,bool $want):string{
    $value=$want?'true':'false';
    $re='/([\'"])'.PIM_V3_KEY.'\1(\s*=>\s*)(true|false|TRUE|FALSE|0|1)\b/';
    $n=preg_match_all($re,$text);
    if($n>1)throw new RuntimeException('KEY_DUPLICATED');
    if($n===1)return preg_replace($re,'${1}'.PIM_V3_KEY.'${1}${2}'.$value,$text,1);
    if(preg_match('/\bpim_v3_sync\b/',$text))throw new RuntimeException('KEY_PRESENT_IN_UNKNOWN_FORM');
    // Append one entry to the returned short array literal: `return [ … ];` must close the file.
    if(!preg_match('/\]\s*;\s*(?:\?>\s*)?$/',$text,$m,PREG_OFFSET_CAPTURE))throw new RuntimeException('UNKNOWN_CONFIG_SHAPE');
    $close=$m[0][1];$before=rtrim(substr($text,0,$close));$last=substr($before,-1);
    $entry=($last===','||$last==='['?'':',')."\n    '".PIM_V3_KEY."'=>$value,\n";
    return $before.$entry.substr($text,$close);
}
try{
    $o=getopt('',['plan','apply','disable','expect-sha256:','config:','backup-dir:']);
    $plan=isset($o['plan']);$apply=isset($o['apply']);if($plan===$apply)throw new RuntimeException('USAGE: --plan or --apply');
    $want=!isset($o['disable']);$root=realpath(dirname(__DIR__));
    $file=realpath((string)($o['config']??$root.'/api/config.php'));if($file===false||!is_file($file)||is_link((string)($o['config']??$root.'/api/config.php')))throw new RuntimeException('CONFIG_MISSING');
    $backupDir=(string)($o['backup-dir']??dirname($root).'/rubizh-private-backups');
    $php=PHP_BINARY;$text=(string)file_get_contents($file);$sha=hash('sha256',$text);$config=readConfig($php,$file);
    $current=array_key_exists(PIM_V3_KEY,$config)?$config[PIM_V3_KEY]:null;
    $report=['config'=>$file,'config_sha256'=>$sha,'current_pim_v3_sync'=>$current,'proposed_pim_v3_sync'=>$want,'backup_destination'=>$backupDir,'mode'=>$plan?'PLAN':'APPLY'];
    if($current===$want)out($report+['result'=>'NO_CHANGE']);
    $new=edited($text,$want);
    if($plan)out($report+['result'=>'PLANNED','changed_bytes'=>strlen($new)-strlen($text)]);
    if(($o['expect-sha256']??'')!==$sha)throw new RuntimeException('SHA_MISMATCH: run --plan again');
    $realBackup=realpath($backupDir);if($realBackup===false){if(!mkdir($backupDir,0700,true))throw new RuntimeException('BACKUP_DIR_UNAVAILABLE');$realBackup=realpath($backupDir);}
    if(str_starts_with($realBackup.DIRECTORY_SEPARATOR,$root.DIRECTORY_SEPARATOR))throw new RuntimeException('BACKUP_INSIDE_WEBROOT');
    $backup=$realBackup.'/config.php.'.gmdate('Ymd-His').'.'.substr($sha,0,12).'.bak';
    if(file_put_contents($backup,$text,LOCK_EX)!==strlen($text)||hash_file('sha256',$backup)!==$sha)throw new RuntimeException('BACKUP_FAILED');chmod($backup,0600);
    $tmp=dirname($file).'/.config.php.'.bin2hex(random_bytes(6)).'.new';
    try{
        if(file_put_contents($tmp,$new,LOCK_EX)!==strlen($new))throw new RuntimeException('WRITE_FAILED');chmod($tmp,fileperms($file)&0777);
        lint($php,$tmp);$check=readConfig($php,$tmp);
        $expected=$config;$expected[PIM_V3_KEY]=$want;
        if(json_encode($check)!==json_encode($expected))throw new RuntimeException('VERIFY_FAILED: other settings would change');
        if(hash_file('sha256',$file)!==$sha)throw new RuntimeException('CONFIG_CHANGED_DURING_APPLY');
        if(!rename($tmp,$file))throw new RuntimeException('RENAME_FAILED');
    }finally{if(is_file($tmp))unlink($tmp);}
    try{
        if(function_exists('opcache_invalidate'))opcache_invalidate($file,true);
        lint($php,$file);$after=readConfig($php,$file);if(($after[PIM_V3_KEY]??null)!==$want)throw new RuntimeException('REREAD_FAILED');
    }catch(Throwable $e){file_put_contents($file,$text,LOCK_EX);throw new RuntimeException('ROLLED_BACK: '.$e->getMessage());}
    out($report+['result'=>'APPLIED','backup'=>$backup,'new_config_sha256'=>hash_file('sha256',$file),'rollback'=>'cp '.escapeshellarg($backup).' '.escapeshellarg($file)]);
}catch(Throwable $e){out(['result'=>'ERROR','error'=>$e->getMessage()],1);}
