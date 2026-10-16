<?php
declare(strict_types=1);
// Private PIM ↔ SITE exchanges (stage 5): supplier payouts for CRM gross profit (OD-4.1, contracts/pim-private-costs/1).
// Reached only through api/index.php after require_pim(); denied over HTTP by api/.htaccess.

final class PimPrivateRejected extends RuntimeException {}

/** Validates a private costs envelope exactly like contracts/pim-private-costs/1/schema.json; returns [sku => kopecks]. */
function pimPrivateCostsParse(string $raw): array {
    $fail=fn(string $why)=>throw new PimPrivateRejected($why,422);
    if(strlen($raw)>2*1024*1024)throw new PimPrivateRejected('TOO_LARGE',413);
    try{$b=json_decode($raw,true,8,JSON_THROW_ON_ERROR);}catch(JsonException){$fail('INVALID_JSON');}
    if(!is_array($b)||array_is_list($b))$fail('INVALID_ENVELOPE');
    $keys=['private_contract','version','currency','generated_at','revision','costs'];
    if(array_diff(array_keys($b),$keys)||array_diff($keys,array_keys($b)))$fail('INVALID_ENVELOPE');
    if($b['private_contract']!=='rubizh-pim-private-costs'||$b['version']!==1||$b['currency']!=='UAH')$fail('UNSUPPORTED_CONTRACT');
    if(!is_string($b['generated_at'])||!preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/D',$b['generated_at']))$fail('INVALID_GENERATED_AT');
    if(!is_string($b['revision'])||!preg_match('/^[a-f0-9]{8,64}$/D',$b['revision']))$fail('INVALID_REVISION');
    if(!is_array($b['costs'])||!array_is_list($b['costs'])||count($b['costs'])>20000)$fail('INVALID_COSTS');
    $out=[];
    foreach($b['costs'] as $row){
        if(!is_array($row)||count($row)!==2||!array_key_exists('sku',$row)||!array_key_exists('supplier_payout_minor',$row))$fail('INVALID_COST_ROW');
        $sku=$row['sku'];$minor=$row['supplier_payout_minor'];
        if(!is_string($sku)||!preg_match('/^[A-Za-z0-9._-]{1,64}$/D',$sku))$fail('INVALID_SKU');
        if(!is_int($minor)||$minor<0||$minor>10000000000)$fail('INVALID_PAYOUT');
        if(isset($out[$sku]))$fail('DUPLICATE_SKU');
        $out[$sku]=$minor;
    }
    return $out;
}

/** POST /api/pim/costs: upserts every payout in one transaction; never deletes (stored orders keep their cost). */
function pimPrivateCostsHandle(PDO $db,string $raw): array {
    $costs=pimPrivateCostsParse($raw);
    $exists=$db->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='rubizh_crm_sku_costs'")->fetchColumn();
    if(!(int)$exists)throw new PimPrivateRejected('CRM_SCHEMA_MISSING',409);
    // A delayed or replayed older batch never overwrites newer costs (review of stage 5).
    $at=json_decode($raw,true)['generated_at'];
    $db->beginTransaction();
    try{
        $last=$db->query("SELECT v FROM meta WHERE k='pim_costs_generated_at' FOR UPDATE")->fetchColumn();
        if(is_string($last)&&strcmp($at,$last)<0){$db->rollBack();throw new PimPrivateRejected('STALE_BATCH',409);}
        $db->prepare("INSERT INTO meta(k,v) VALUES('pim_costs_generated_at',?) ON DUPLICATE KEY UPDATE v=VALUES(v)")->execute([$at]);
        $q=$db->prepare("INSERT INTO rubizh_crm_sku_costs(sku,cost_minor,source,observed_at) VALUES(?,?,'pim',UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE cost_minor=VALUES(cost_minor),source=VALUES(source),observed_at=VALUES(observed_at)");
        foreach($costs as $sku=>$minor)$q->execute([(string)$sku,$minor]);
        $db->commit();
    }catch(PimPrivateRejected $e){throw $e;}catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
    return ['ok'=>true,'private_contract'=>'rubizh-pim-private-costs','version'=>1,'stored'=>count($costs)];
}

// ---------- 5-4: automatic PIM backup outside IndexedDB (private storage on SITE) ----------
// The folder lives outside the public web root (config pim_backup_dir); the newest pim_backup_keep (14) copies stay.
const PIM_BACKUP_ID='/^pim-\d{8}T\d{12}Z-[a-f0-9]{12}$/D';

/** The private backup folder; refuses (500) a folder inside the public web root. */
function pimBackupDir(): string {
    $dir=(string)(cfg('pim_backup_dir')??dirname(__DIR__,2).'/private/pim-backups');
    if(!is_dir($dir)&&!@mkdir($dir,0700,true)&&!is_dir($dir))fail(500,'Папка резервних копій PIM недоступна');
    // Second layer: even a misplaced folder is not served by Apache.
    if(!is_file($dir.'/.htaccess'))@file_put_contents($dir.'/.htaccess',"Require all denied\n");
    $real=realpath($dir);$roots=array_filter([realpath(dirname(__DIR__)),realpath((string)($_SERVER['DOCUMENT_ROOT']??''))]);
    foreach($roots as $root)if($real===false||$real===$root||str_starts_with($real.'/',rtrim($root,'/').'/'))fail(500,'Папка резервних копій PIM не може бути в публічному корені сайту');
    return $real;
}
/** The secrets a copy must never contain: the PIM keys and the scheduler key. */
function pimBackupSecrets(): array {
    $keys=array_values(array_filter([(string)cfg('pim_key'),(string)(cfg('pim_key_next')??''),(string)(cfg('cron_key')??'')],fn($k)=>strlen($k)>=16));
    // Also the JSON-escaped spelling of each key (a key with «/», «"» or «\\» is stored escaped inside the copy).
    foreach($keys as $k){$j=substr(json_encode($k,JSON_UNESCAPED_UNICODE),1,-1);if($j!==$k)$keys[]=$j;}
    return $keys;
}
/** POST /api/pim/backup — raw gzip body, X-Backup-Sha256 (hex), X-Backup-Label (URL-encoded, ≤80 characters). */
function pimBackupStore(): array {
    $dir=pimBackupDir();$max=max(1024,(int)(cfg('pim_backup_max_bytes')??64*1024*1024));
    require_once __DIR__.'/../shop/runtime.php';if(!rubizhRateAllow('pim-backup','pim',30,3600))throw new PimPrivateRejected('TOO_MANY_BACKUPS',429);
    foreach(glob($dir.'/.upload-*')?:[] as $stale)if(filemtime($stale)<time()-3600)@unlink($stale);
    if((int)($_SERVER['CONTENT_LENGTH']??0)>$max)throw new PimPrivateRejected('TOO_LARGE',413);
    $digest=strtolower(trim((string)($_SERVER['HTTP_X_BACKUP_SHA256']??'')));if(!preg_match('/^[a-f0-9]{64}$/D',$digest))throw new PimPrivateRejected('INVALID_SHA256',422);
    $label=rawurldecode((string)($_SERVER['HTTP_X_BACKUP_LABEL']??''));
    if(!mb_check_encoding($label,'UTF-8')||mb_strlen($label)>80||preg_match('/[\x00-\x1f\x7f]/u',$label))throw new PimPrivateRejected('INVALID_LABEL',422);
    $tmp=tempnam($dir,'.upload-');if($tmp===false)fail(500,'Немає прав запису в папку резервних копій PIM');chmod($tmp,0600);
    try{
        $in=fopen('php://input','rb');$out=fopen($tmp,'wb');$size=0;
        while(!feof($in)){$chunk=fread($in,1<<16);if($chunk===false)break;$size+=strlen($chunk);if($size>$max)throw new PimPrivateRejected('TOO_LARGE',413);fwrite($out,$chunk);}
        fclose($in);fclose($out);
        if($size<18||file_get_contents($tmp,false,null,0,2)!=="\x1f\x8b")throw new PimPrivateRejected('NOT_GZIP',422);
        if(!hash_equals($digest,hash_file('sha256',$tmp)))throw new PimPrivateRejected('SHA256_MISMATCH',422);
        // Streamed scan of the decompressed copy (overlap keeps a key split across chunks visible).
        $secrets=pimBackupSecrets();$keep=max(array_map('strlen',$secrets?:[''])+[0]);$gz=gzopen($tmp,'rb');$tail='';$plain=0;
        if($gz===false)throw new PimPrivateRejected('NOT_GZIP',422);
        while(!gzeof($gz)){$part=gzread($gz,1<<16);if($part===false||$part===''&&!gzeof($gz)){gzclose($gz);throw new PimPrivateRejected('NOT_GZIP',422);}$plain+=strlen($part);$window=$tail.$part;
            foreach($secrets as $s)if(str_contains($window,$s)){gzclose($gz);throw new PimPrivateRejected('SECRET_IN_BACKUP',422);}
            if($plain>4*$max){gzclose($gz);throw new PimPrivateRejected('TOO_LARGE',413);}
            $tail=$keep?substr($window,-$keep):'';}
        gzclose($gz);
        $now=microtime(true);$id='pim-'.gmdate('Ymd\THis',(int)$now).sprintf('%06d',(int)(($now-floor($now))*1e6)).'Z-'.substr($digest,0,12);
        $lock=fopen($dir.'/.lock','c');if(!$lock||!flock($lock,LOCK_EX))fail(500,'Не вдалося заблокувати папку резервних копій PIM');
        try{
            if(!rename($tmp,$dir.'/'.$id.'.json.gz'))fail(500,'Не вдалося зберегти резервну копію PIM');$tmp=null;
            file_put_contents($dir.'/'.$id.'.meta.json',json_encode(['id'=>$id,'at'=>gmdate('c',(int)$now),'size'=>$size,'sha256'=>$digest,'label'=>$label],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR));chmod($dir.'/'.$id.'.meta.json',0600);
            $keepCopies=max(1,(int)(cfg('pim_backup_keep')??14));
            foreach(array_slice(pimBackupIds($dir),$keepCopies) as $old){@unlink($dir.'/'.$old.'.json.gz');@unlink($dir.'/'.$old.'.meta.json');}
        }finally{flock($lock,LOCK_UN);fclose($lock);}
        return ['ok'=>true,'id'=>$id,'size'=>$size,'sha256'=>$digest];
    }finally{if($tmp!==null&&is_file($tmp))@unlink($tmp);}
}
/** Stored copy ids, newest first. */
function pimBackupIds(string $dir): array {
    $ids=[];foreach(scandir($dir)?:[] as $f)if(str_ends_with($f,'.json.gz')&&preg_match(PIM_BACKUP_ID,substr($f,0,-8)))$ids[]=substr($f,0,-8);
    rsort($ids,SORT_STRING);return $ids;
}
/** GET /api/pim/backups — [{id, at, size, sha256, label}], newest first. */
function pimBackupList(): array {
    $dir=pimBackupDir();$out=[];
    foreach(pimBackupIds($dir) as $id){$meta=json_decode((string)@file_get_contents($dir.'/'.$id.'.meta.json'),true);$out[]=['id'=>$id,'at'=>(string)($meta['at']??''),'size'=>(int)($meta['size']??filesize($dir.'/'.$id.'.json.gz')),'sha256'=>(string)($meta['sha256']??''),'label'=>(string)($meta['label']??'')];}
    return ['ok'=>true,'keep'=>max(1,(int)(cfg('pim_backup_keep')??14)),'backups'=>$out];
}
/** GET /api/pim/backups/{id} — the exact stored bytes. */
function pimBackupSend(string $id): never {
    if(!preg_match(PIM_BACKUP_ID,$id))fail(404,'Копію не знайдено');
    $dir=pimBackupDir();$file=realpath($dir.'/'.$id.'.json.gz');
    if($file===false||dirname($file)!==$dir)fail(404,'Копію не знайдено');
    header('Content-Type: application/gzip');header('Cache-Control: no-store');header('X-Content-Type-Options: nosniff');header('Content-Length: '.filesize($file));
    readfile($file);exit;
}
