<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require __DIR__.'/kit-data.php';
$GLOBALS['rubizh_cache_worker']=true;
$lock=fopen(shopCacheDir().'/worker.lock','c');
if(!$lock||!flock($lock,LOCK_EX|LOCK_NB))exit;
try {
    $db=db();$started=microtime(true);$built=0;$failed=0;
    // Prewarm shared entry points after imports, without any visitor waiting.
    foreach([['operation'=>'categories'],['operation'=>'storefront'],['operation'=>'catalog','input'=>[]]] as $job)shopCacheQueue('warm-'.$job['operation'],$job);
    $files=glob(shopCacheDir().'/refresh-*.json')?:[];
    usort($files,fn($a,$b)=>filemtime($a)<=>filemtime($b));
    foreach($files as $file){
        if(microtime(true)-$started>45)break;
        $job=json_decode((string)file_get_contents($file),true);
        try {
            switch($job['operation']??''){
                case 'categories':shopCategories($db);break;
                case 'storefront':shopStorefront($db);break;
                case 'catalog':shopCatalog($db,is_array($job['input']??null)?$job['input']:[]);break;
                default:throw new RuntimeException('Unknown cache job');
            }
            unlink($file);$built++;
        }catch(Throwable $e){$failed++;error_log('rubizh cache worker: refresh failed');}
    }
    echo json_encode(['built'=>$built,'failed'=>$failed],JSON_THROW_ON_ERROR)."\n";
    if($failed)exit(1);
}finally{flock($lock,LOCK_UN);fclose($lock);}
