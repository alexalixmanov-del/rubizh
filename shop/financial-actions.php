<?php
declare(strict_types=1);
require __DIR__.'/../auth/bootstrap.php';
try{
    $db=shopStoreDatabase();$actor=npManagerId();$id=(int)($_GET['order_id']??0);
    if(($_SERVER['REQUEST_METHOD']??'')==='GET'){
        shopRequirePermission($actor,'payment.view');$order=npOrder($db,$id);
        if(($_GET['action']??'')==='audit')shopJson(['ok'=>true,'audit'=>shopFinancialAudit($db,$id,$actor)]);
        shopJson(['ok'=>true,'order'=>shopCanonicalOrderDto($db,$order)]);
    }
    if(($_SERVER['REQUEST_METHOD']??'')!=='POST')shopJson(['ok'=>false],405);
    $input=shopBody();shopCsrf($input);shopLimit($db,'financial-actions',20,60);$id=(int)($input['order_id']??0);$action=$input['action']??'';
    if($action==='invoice.create')$result=monoCreate($db,$id,$actor);
    elseif($action==='invoice.resend'){
        shopRequirePermission($actor,'payment.invoice.resend');
        // Same validation and permission gate; this returns the one existing link,
        // never sends unsolicited messages or bypasses current eligibility.
        $result=monoCreate($db,$id,$actor);
    }elseif($action==='refund.execute'){monoRefund($db,$id,$actor,(string)($input['reason']??''));$result=['requested'=>true];}
    elseif($action==='manual_reconcile'){monoReconcile($db,$id,(string)($input['invoice_id']??''),$actor,(string)($input['reason']??''));$result=['reconciled'=>true];}
    else throw new InvalidArgumentException('Невідома фінансова операція.');
    shopJson(['ok'=>true,'result'=>$result]);
}catch(Throwable $e){shopJson(['ok'=>false,'error_code'=>$e instanceof ShopOrderConflict?$e->reason:($e instanceof ShopPermissionException?'PERMISSION_DENIED':'FINANCIAL_OPERATION_FAILED'),'conflict'=>$e instanceof ShopOrderConflict?$e->details:null,'error'=>$e instanceof PDOException?'Фінансова операція не завершена.':$e->getMessage()],$e instanceof ShopPermissionException?403:($e instanceof ShopOrderConflict?409:400));}
