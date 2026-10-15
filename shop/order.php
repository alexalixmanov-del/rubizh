<?php
declare(strict_types=1);
require __DIR__.'/../auth/bootstrap.php';require_once __DIR__.'/store-lib.php';require_once __DIR__.'/order-create.php';
try{
    if(($_SERVER['REQUEST_METHOD'] ?? '')!=='POST')shopJson(['ok'=>false,'error'=>'Тільки POST.'],405);
    $input=shopBody();shopCsrf($input);$work=rubizhWorkAcquire('checkout',8);
    register_shutdown_function(fn()=>rubizhWorkRelease($work));$db=shopStoreDatabase();
    $key=customerField($input,'request_id',32);if(!preg_match('/^[a-f0-9]{32}$/D',$key))throw new RuntimeException('Оновіть сторінку оформлення.');
    $scope=hash('sha256',(string)($_SESSION['checkout_scope'] ?? ''));if(empty($_SESSION['checkout_scope']))throw new RuntimeException('Оновіть сторінку оформлення.');
    $contact=is_array($input['contact'] ?? null)?$input['contact']:[];$c=shopOrderContact($contact);
    // Cash on delivery is permanently forbidden: only online card payment or a FOP invoice for new orders.
    $pay=customerField($input,'payment',24);if(!in_array($pay,['card','invoice'],true))throw new RuntimeException('Оберіть спосіб оплати: карткою онлайн або на рахунок ФОП.');
    if($pay==='card'&&!monoConfigured())throw new RuntimeException('Оплату карткою ще не підключено.');
    $hash=hash('sha256',json_encode([$input['lines'] ?? [],$contact,$pay,$input['promo'] ?? ''],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR));
    $owner=customerId();$verifiedPhone=$owner!==null?customerVerifiedPhone($owner):null;
    $rateKeys=shopCheckoutRateKeys($verifiedPhone,$scope,rubizhDeviceIdentity());$rateProof=rubizhProofValid('checkout:'.$scope,$input['rate_proof']??null);
    session_write_close();
    $db->exec('SET SESSION innodb_lock_wait_timeout=5');
    $requestLock='rubizh-checkout-'.$key;
    $claim=$db->prepare('SELECT GET_LOCK(?,2)');$claim->execute([$requestLock]);
    if((int)$claim->fetchColumn()!==1)throw new RubizhHttpException(503,'Замовлення обробляється. Повторіть запит за кілька секунд.',2);
    register_shutdown_function(function()use($db,$requestLock){try{$q=$db->prepare('SELECT RELEASE_LOCK(?)');$q->execute([$requestLock]);}catch(Throwable $e){}});
    $q=$db->prepare('SELECT r.*,o.order_number,o.total,o.items_json,o.delivery_label,o.payment_status FROM rubizh_checkout_requests r JOIN rubizh_customer_orders o ON o.id=r.order_id WHERE r.request_id=?');$q->execute([$key]);$existing=$q->fetch(PDO::FETCH_ASSOC);
    if($existing){if(!hash_equals($existing['scope_hash'],$scope) || !hash_equals($existing['payload_hash'],$hash))shopJson(['ok'=>false,'error'=>'Запит уже використаний. Оновіть оформлення.'],409);$payment=null;shopJson(['ok'=>true,'payment'=>$payment,'order'=>shopOrderReceipt($db,(int)$existing['order_id']),'email_status'=>shopOrderMailStatus($db,(int)$existing['order_id']),'repeated'=>true]);}
    try{shopCheckoutLimit($db,$rateKeys,false,$rateProof);}catch(RubizhHttpException $e){if($e->status!==428)throw $e;session_start();$proof=rubizhProofIssue('checkout:'.$scope);session_write_close();header('Retry-After: 1');shopJson(['ok'=>false,'error_code'=>'CHECK_REQUIRED','error'=>$e->getMessage(),'challenge'=>['nonce'=>$proof['nonce'],'bits'=>$proof['bits'],'purpose'=>'checkout']],428);}
    $delivery=npValidateDelivery($db,$contact,$c['type']);
    try{
        $created=shopCreateOrder($db,is_array($input['lines'] ?? null)?$input['lines']:[],$c,$delivery,$pay,['external_id'=>'web:'.$key,'owner'=>$owner,'promo'=>customerField($input,'promo',40),'expected_total'=>$input['expected_total']??null,'catalog_version'=>$input['catalog_version']??null,
            'before_insert'=>fn()=>shopCheckoutLimit($db,$rateKeys,true,$rateProof),
            'after_insert'=>function(int $id)use($db,$key,$scope,$hash,$c,$owner){$db->prepare('INSERT INTO rubizh_checkout_requests(request_id,scope_hash,payload_hash,order_id,created_at) VALUES(?,?,?,?,UTC_TIMESTAMP())')->execute([$key,$scope,$hash,$id]);shopCartRemindersConverted($db,$scope,$c['email'],$owner);}]);
    }catch(ShopOrderConflict $e){if($e->reason!=='PRICE_CHANGED')throw $e;$quote=$e->details['quote'];$kitNote=shopKitExplanation($quote['lines']);shopJson(['ok'=>false,'error_code'=>'PRICE_CHANGED','error'=>($kitNote!==''?$kitNote.' ':'').'Ціна або версія каталогу змінилася. Перевірте новий розрахунок та підтвердьте.','quote'=>$quote],409);}
    $id=$created['id'];$email=$c['email'];
    $payment=null; // Legacy and request orders: manager confirms first. A fully payable v3 order is CONFIRMED and may start payment now.
    $response=['ok'=>true,'order'=>shopOrderReceipt($db,$id),'email_status'=>$email!==''?'pending':'none','payment'=>$payment??null];
    // On PHP-FPM the shopper receives the saved order before an SMTP connection.
    if(function_exists('fastcgi_finish_request')){header('Content-Type: application/json; charset=utf-8');echo json_encode($response,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);fastcgi_finish_request();shopSendOrderMail($db,$id);shopSendNotifications($db,2);exit;}
    shopJson($response);
}catch(Throwable $e){error_log('rubizh checkout: '.get_class($e).' reason '.($e instanceof ShopPricingException?$e->reason:(string)$e->getCode()));if($e instanceof RubizhHttpException&&$e->retryAfter)header('Retry-After: '.$e->retryAfter);shopJson(['ok'=>false,'conflict'=>$e instanceof ShopOrderConflict?$e->details:null,'error_code'=>$e instanceof ShopOrderConflict?$e->reason:($e instanceof ShopPricingException?$e->reason:'CHECKOUT_FAILED'),'error'=>$e instanceof PDOException?'Не вдалося зберегти замовлення. Спробуйте ще раз.':($e instanceof JsonException?'Перевірте дані кошика.':$e->getMessage())],$e instanceof ShopOrderConflict?409:($e instanceof ShopPricingException?$e->httpStatus:($e instanceof RubizhHttpException?$e->status:($e instanceof PDOException?503:400))));}
