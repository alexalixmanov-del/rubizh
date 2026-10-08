<?php
declare(strict_types=1);
require __DIR__.'/../auth/bootstrap.php';require_once __DIR__.'/store-lib.php';
try {
    if(($_SERVER['REQUEST_METHOD']??'')!=='POST')shopJson(['ok'=>false,'error'=>'Тільки POST.'],405);
    $input=shopBody();shopCsrf($input);$db=shopStoreDatabase();shopLimit($db,'price-quotes',120,60);
    $db->beginTransaction();
    try{$raw=shopResolvedLines($db,is_array($input['lines']??null)?$input['lines']:[],true);$quote=shopCheckoutQuote($raw,customerField($input,'promo',40));$db->rollBack();}
    catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
    header('Cache-Control: no-store');shopJson(['ok'=>true,'quote'=>$quote]);
}catch(Throwable $e){error_log('rubizh quote: '.($e instanceof ShopPricingException?$e->reason:get_class($e)));shopJson(['ok'=>false,'error_code'=>$e instanceof ShopPricingException?$e->reason:'QUOTE_FAILED','error'=>$e instanceof PDOException?'Розрахунок тимчасово недоступний.':$e->getMessage()],$e instanceof PDOException?503:400);}
