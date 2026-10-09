<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
// Explicit owner hide of legacy (pre-contract-3) catalog cards after the first PIM v3 publish. Contract 3 never hides
// by absence, and the current PIM does not know cards left from an older PIM generation, so this is a separate,
// reviewed owner command: plan (read-only) → apply (exact plan, verified off-webroot DB backup) → restore.
// Nothing is deleted: only products.visible changes; SKU, orders, URLs, photos and history stay.
// Usage:
//   php dev/pim-v3-legacy-hide.php --plan --out=/private/legacy-hide-plan.json
//   php dev/pim-v3-legacy-hide.php --apply --plan-file=/private/legacy-hide-plan.json --plan-sha256=<sha> --backup-file=<db.sql.gz> --backup-sha256=<sha>
//   php dev/pim-v3-legacy-hide.php --restore=/private/legacy-hide-plan.json --plan-sha256=<sha>
require_once dirname(__DIR__).'/api/lib.php';
try{
    $o=getopt('',['plan','out:','apply','plan-file:','plan-sha256:','backup-file:','backup-sha256:','restore:']);
    $root=realpath(dirname(__DIR__));
    $private=static function(string $file)use($root):string{$dir=realpath(dirname($file));if($dir===false||str_starts_with($dir.DIRECTORY_SEPARATOR,$root.DIRECTORY_SEPARATOR))throw new RuntimeException('Plan file must be outside the web root');return $dir.DIRECTORY_SEPARATOR.basename($file);};
    $db=rubizhDatabaseConnect(cfg());
    pimV3DetectColumns($db);if(empty($GLOBALS['rubizh_pim_v3_columns']))throw new RuntimeException('PIM v3 schema not applied');
    $current=static fn()=>$db->query('SELECT id FROM products WHERE visible=1 AND pim_contract_version IS NULL ORDER BY id')->fetchAll(PDO::FETCH_COLUMN);
    $v3=(int)$db->query('SELECT COUNT(*) FROM products WHERE visible=1 AND pim_contract_version=3')->fetchColumn();
    $sha=static fn(array $ids)=>hash('sha256',implode("\n",$ids));
    if(isset($o['plan'])&&!isset($o['apply'])){
        $ids=$current();if($v3===0)throw new RuntimeException('No PIM v3 model is visible yet: publish contract 3 first');
        $sample=$db->query('SELECT id,slug,name FROM products WHERE visible=1 AND pim_contract_version IS NULL ORDER BY id LIMIT 20')->fetchAll(PDO::FETCH_ASSOC);
        $plan=['kind'=>'PIM_V3_LEGACY_HIDE_PLAN','database'=>(string)$db->query('SELECT DATABASE()')->fetchColumn(),'created_at'=>gmdate('c'),'visible_v3_models'=>$v3,'legacy_visible'=>count($ids),'ids'=>$ids];
        $plan['plan_sha256']=$sha($ids);
        if(isset($o['out'])){$file=$private((string)$o['out']);file_put_contents($file,json_encode($plan,JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR));chmod($file,0600);}
        echo json_encode(['legacy_visible'=>count($ids),'visible_v3_models'=>$v3,'plan_sha256'=>$plan['plan_sha256'],'plan_file'=>$file??null,'sample'=>$sample],JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT),"\n";exit(0);
    }
    $load=static function(string $file,string $want)use($private,$sha):array{
        $plan=json_decode((string)file_get_contents($private($file)),true,64,JSON_THROW_ON_ERROR);
        if(($plan['kind']??'')!=='PIM_V3_LEGACY_HIDE_PLAN'||!is_array($plan['ids']??null)||!hash_equals($sha($plan['ids']),strtolower($want))||!hash_equals((string)$plan['plan_sha256'],strtolower($want)))throw new RuntimeException('Plan file and --plan-sha256 do not match');
        return $plan;
    };
    if(isset($o['apply'])){
        $plan=$load((string)($o['plan-file']??''),(string)($o['plan-sha256']??''));
        $file=(string)($o['backup-file']??'');$sum=strtolower((string)($o['backup-sha256']??''));$real=realpath($file);
        if($real===false||!is_file($real)||filesize($real)<1024||str_starts_with($real,$root.DIRECTORY_SEPARATOR)||!preg_match('/^[a-f0-9]{64}$/D',$sum)||!hash_equals($sum,hash_file('sha256',$real)))throw new RuntimeException('Verified off-webroot DB backup required');
        if($plan['database']!==(string)$db->query('SELECT DATABASE()')->fetchColumn())throw new RuntimeException('Plan belongs to another database');
        if($current()!==$plan['ids'])throw new RuntimeException('STALE_PLAN: legacy visibility changed since the plan; run --plan again');
        $db->beginTransaction();
        $up=$db->prepare('UPDATE products SET visible=0 WHERE id=? AND visible=1 AND pim_contract_version IS NULL');
        $log=$db->prepare("INSERT INTO rubizh_pim_history(batch_id,entity_type,entity_id,operation,before_json,after_json,proof_reference,created_at) VALUES(NULL,'model',?,'OWNER_LEGACY_HIDE','{\"visible\":1}','{\"visible\":0}',?,UTC_TIMESTAMP())");
        $n=0;foreach($plan['ids'] as $id){$up->execute([$id]);$n+=$up->rowCount();$log->execute([$id,'legacy-hide plan:'.$plan['plan_sha256']]);}
        if($n!==count($plan['ids'])){$db->rollBack();throw new RuntimeException('STALE_PLAN: not every planned card was hidden; nothing changed');}
        $db->commit();if(function_exists('shopCacheClear'))shopCacheClear();
        echo json_encode(['hidden'=>$n,'plan_sha256'=>$plan['plan_sha256'],'restore'=>'php dev/pim-v3-legacy-hide.php --restore=<plan file> --plan-sha256='.$plan['plan_sha256']]),"\n";exit(0);
    }
    if(isset($o['restore'])){
        $plan=$load((string)$o['restore'],(string)($o['plan-sha256']??''));
        $db->beginTransaction();$up=$db->prepare('UPDATE products SET visible=1 WHERE id=? AND visible=0 AND pim_contract_version IS NULL');$n=0;
        foreach($plan['ids'] as $id){$up->execute([$id]);$n+=$up->rowCount();}
        $db->prepare("INSERT INTO rubizh_pim_history(batch_id,entity_type,entity_id,operation,before_json,after_json,proof_reference,created_at) VALUES(NULL,'catalog','legacy','OWNER_LEGACY_RESTORE',NULL,?,?,UTC_TIMESTAMP())")->execute([json_encode(['restored'=>$n]),'legacy-hide plan:'.$plan['plan_sha256']]);
        $db->commit();if(function_exists('shopCacheClear'))shopCacheClear();
        echo json_encode(['restored'=>$n,'plan_sha256'=>$plan['plan_sha256']]),"\n";exit(0);
    }
    throw new RuntimeException('usage');
}catch(Throwable $e){if(isset($db)&&$db->inTransaction())$db->rollBack();fwrite(STDERR,'Legacy hide refused: '.($e->getMessage()==='usage'?'use --plan --out=FILE | --apply --plan-file=FILE --plan-sha256=SHA --backup-file=FILE --backup-sha256=SHA | --restore=FILE --plan-sha256=SHA':$e->getMessage())."\n");exit(1);}
