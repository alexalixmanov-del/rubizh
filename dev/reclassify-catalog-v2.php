<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
umask(0077);require __DIR__.'/../shop/reclassification-v2.php';
try{
    $options=getopt('',['report:','apply','report-file:','sha256:','rollback:','lock','product-id:','category-id:','reason:']);
    // Dry-run must never perform even an implicit baseline schema migration.
    $db=rubizhDatabaseConnect(cfg());
    if(isset($options['lock'])){
        if(!isset($options['product-id'],$options['category-id'],$options['reason'])||trim($options['reason'])==='')throw new RuntimeException('Manual lock requires product ID, canonical leaf ID and review reason');
        shopV2ManualLock($db,$options['product-id'],$options['category-id'],$options['reason']);$result=['mode'=>'manual-lock','product_id'=>$options['product-id'],'canonical_category_id'=>shopCanonicalCategoryId($options['category-id']),'mass_apply_performed'=>false];
    }elseif(isset($options['rollback'])){
        $result=shopV2Rollback($db,$options['rollback']);
    }elseif(isset($options['apply'])){
        if(!isset($options['report-file'],$options['sha256']))throw new RuntimeException('Apply requires the reviewed dry-run file and its SHA256');
        $result=shopV2Apply($db,$options['report-file'],$options['sha256'],dirname(dirname(__DIR__)).'/rubizh-private-backups');
    }else{
        $dir=$options['report']??dirname(dirname(__DIR__)).'/rubizh-private-backups/reclassification-v2-'.gmdate('Ymd-His');
        $plan=shopV2Plan($db);$hash=shopV2Export($plan,$dir);$result=$plan['summary']+['mode'=>'dry-run','report_directory'=>$dir,'report_sha256'=>$hash,'mass_apply_performed'=>false];
    }
    echo json_encode($result,JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR)."\n";
}catch(Throwable $e){fwrite(STDERR,'Reclassification v2 stopped: '.$e->getMessage()."\n");exit(1);}
