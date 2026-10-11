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
    // Q-5: an action prepared on an order that changed since it was viewed is refused. Money-out actions (refund, manual
    // reconcile) must name the order version they were prepared on; the role is checked first so outsiders still get 403.
    $highRisk=['refund.execute'=>'payment.refund.execute','manual_reconcile'=>'payment.manual_reconcile'][is_string($action)?$action:'']??null;
    if($highRisk!==null){shopRequirePermission($actor,$highRisk);
        if(!is_string($input['expected_updated_at']??null))throw new ShopOrderConflict('STATE_REQUIRED',[],'Відкрийте актуальну картку замовлення та повторіть дію.');}
    if(isset($input['expected_updated_at'])){$cur=$db->prepare('SELECT updated_at FROM rubizh_customer_orders WHERE id=?');$cur->execute([$id]);$now=$cur->fetchColumn();
        if($now===false||(string)$now!==(string)$input['expected_updated_at'])throw new ShopOrderConflict('STATE_CHANGED',['updated_at'=>$now===false?null:(string)$now],'Замовлення змінилося після перегляду. Оновіть дані та повторіть дію.');}
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
