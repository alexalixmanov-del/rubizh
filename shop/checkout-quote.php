<?php
declare(strict_types=1);
require __DIR__.'/../auth/bootstrap.php';require_once __DIR__.'/store-lib.php';
try {
    if(($_SERVER['REQUEST_METHOD']??'')!=='POST')shopJson(['ok'=>false,'error'=>'Тільки POST.'],405);
    $input=shopBody();shopCsrf($input);$db=shopStoreDatabase();shopLimit($db,'price-quotes',120,60);
    $db->beginTransaction();
    try{$v=shopValidateOrder($db,is_array($input['lines']??null)?$input['lines']:[],'checkout',null,[],customerField($input,'promo',40),false);$raw=$v['raw'];$quote=$v['quote'];$decision=pimV3OrderDecision($raw,customerField($input,'payment',24),shopDirectPayMaxQty($db));
        // One order: payable now only if every line is payable; otherwise a single confirmation request.
        $quote['order_mode']=$decision['contract_version']===3?($decision['payment_now']?'PAY':'REQUEST'):'LEGACY';$quote['price_pending']=(bool)array_filter($raw,fn($l)=>!empty($l['price_pending']));if(($decision['confirmation_reason']??null)==='QTY_UNCONFIRMED')$quote['notice']='Для такої кількості менеджер підтвердить наявність перед оплатою.';elseif(($decision['confirmation_reason']??null)==='STALE_SUPPLIER_DATA')$quote['notice']=SHOP_FRESHNESS_CONFIRM_NOTE.'.';$db->rollBack();}
    catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
    header('Cache-Control: no-store');shopJson(['ok'=>true,'quote'=>$quote]);
}catch(Throwable $e){error_log('rubizh quote: '.($e instanceof ShopPricingException?$e->reason:get_class($e)));shopJson(['ok'=>false,'conflict'=>$e instanceof ShopOrderConflict?$e->details:null,'error_code'=>$e instanceof ShopOrderConflict?$e->reason:($e instanceof ShopPricingException?$e->reason:'QUOTE_FAILED'),'error'=>$e instanceof PDOException?'Розрахунок тимчасово недоступний.':$e->getMessage()],$e instanceof PDOException?503:($e instanceof ShopOrderConflict?409:400));}
