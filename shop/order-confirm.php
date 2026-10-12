<?php
declare(strict_types=1);
require __DIR__.'/../auth/bootstrap.php';
try{
    if(($_SERVER['REQUEST_METHOD']??'')!=='POST')shopJson(['ok'=>false],405);
    $input=shopBody();shopCsrf($input);$actor=npManagerId();shopRequirePermission($actor,'order.confirm');
    $db=shopStoreDatabase();shopLimit($db,'order-confirm',30,60);
    $GLOBALS['rubizh_request_resolution']=is_array($input['resolution']??null)?$input['resolution']:[];
    npConfirm($db,(int)($input['order_id']??0),$actor,($input['availability_confirmed']??false)===true,($input['extra_delivery_agreed']??false)===true,(string)($input['payment_proof']??''),is_array($input['approval']??null)?$input['approval']:[],is_string($input['expected_updated_at']??null)?$input['expected_updated_at']:null);
    shopJson(['ok'=>true,'order'=>shopCanonicalOrderDto($db,npOrder($db,(int)$input['order_id']))]);
}catch(Throwable $e){shopJson(['ok'=>false,'error_code'=>$e instanceof ShopOrderConflict?$e->reason:($e instanceof ShopPermissionException?'PERMISSION_DENIED':'CONFIRMATION_FAILED'),'conflict'=>$e instanceof ShopOrderConflict?$e->details:null,'error'=>$e instanceof PDOException?'Не вдалося підтвердити замовлення.':$e->getMessage()],$e instanceof ShopPermissionException?403:($e instanceof ShopOrderConflict?409:400));}
