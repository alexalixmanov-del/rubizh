<?php
declare(strict_types=1);
require __DIR__.'/../auth/bootstrap.php';require_once __DIR__.'/store-lib.php';
try{
    if(($_SERVER['REQUEST_METHOD'] ?? '')!=='POST')shopJson(['ok'=>false,'error'=>'Тільки POST.'],405);
    $input=shopBody();shopCsrf($input);$work=rubizhWorkAcquire('checkout',8);
    register_shutdown_function(fn()=>rubizhWorkRelease($work));$db=shopStoreDatabase();
    $key=customerField($input,'request_id',32);if(!preg_match('/^[a-f0-9]{32}$/D',$key))throw new RuntimeException('Оновіть сторінку оформлення.');
    $scope=hash('sha256',(string)($_SESSION['checkout_scope'] ?? ''));if(empty($_SESSION['checkout_scope']))throw new RuntimeException('Оновіть сторінку оформлення.');
    $contact=is_array($input['contact'] ?? null)?$input['contact']:[];
    $name=customerField($contact,'name',160);$phone=customerField($contact,'phone',30);$email=strtolower(customerField($contact,'email',254));
    $phone=preg_replace('/[^0-9]/','',$phone);if(preg_match('/^0\d{9}$/D',$phone))$phone='38'.$phone;
    if($name==='' || !preg_match('/^380\d{9}$/D',$phone))throw new RuntimeException('Вкажіть імʼя та український телефон.');
    // Email необовʼязковий: якщо вказаний — має бути коректним.
    if($email!=='' && !filter_var($email,FILTER_VALIDATE_EMAIL))throw new RuntimeException('Перевірте email або залиште поле порожнім.');
    $city=customerField($contact,'city',120);$address=customerField($contact,'address',240);$type=customerField($contact,'delivery_type',12);$comment=shopComment($contact);$recipient=customerField($contact,'recipient',160);
    if($city==='' || $address==='' || !in_array($type,['branch','postomat','courier'],true))throw new RuntimeException('Вкажіть місто та місце отримання.');
    if(count(preg_split('/\s+/u',trim($recipient?:$name)))<2)throw new RuntimeException('Вкажіть імʼя та прізвище одержувача.');
    $brigade=shopDonationTarget($contact['brigade']??'');
    $donationChannel=customerField($contact,'donation_channel',12)?:'viber';if(!in_array($donationChannel,['viber','telegram'],true))throw new RuntimeException('Оберіть Viber або Telegram.');$donationPhone=preg_replace('/\D/','',customerField($contact,'donation_phone',30))?:$phone;if(preg_match('/^0\d{9}$/D',$donationPhone))$donationPhone='38'.$donationPhone;if(!preg_match('/^380\d{9}$/D',$donationPhone))throw new RuntimeException('Перевірте номер для скріна донату.');
    $pay=customerField($input,'payment',24);if(!in_array($pay,['cod','card','invoice'],true))throw new RuntimeException('Оберіть спосіб оплати.');
    if($pay==='card'&&!monoConfigured())throw new RuntimeException('Оплату карткою ще не підключено.');
    $hash=hash('sha256',json_encode([$input['lines'] ?? [],$contact,$pay,$input['promo'] ?? ''],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR));
    $owner=customerId();session_write_close();
    $db->exec('SET SESSION innodb_lock_wait_timeout=5');
    $requestLock='rubizh-checkout-'.$key;
    $claim=$db->prepare('SELECT GET_LOCK(?,2)');$claim->execute([$requestLock]);
    if((int)$claim->fetchColumn()!==1)throw new RubizhHttpException(503,'Замовлення обробляється. Повторіть запит за кілька секунд.',2);
    register_shutdown_function(function()use($db,$requestLock){try{$q=$db->prepare('SELECT RELEASE_LOCK(?)');$q->execute([$requestLock]);}catch(Throwable $e){}});
    $q=$db->prepare('SELECT r.*,o.order_number,o.total,o.items_json,o.delivery_label,o.payment_status FROM rubizh_checkout_requests r JOIN rubizh_customer_orders o ON o.id=r.order_id WHERE r.request_id=?');$q->execute([$key]);$existing=$q->fetch(PDO::FETCH_ASSOC);
    if($existing){if(!hash_equals($existing['scope_hash'],$scope) || !hash_equals($existing['payload_hash'],$hash))shopJson(['ok'=>false,'error'=>'Запит уже використаний. Оновіть оформлення.'],409);$payment=null;shopJson(['ok'=>true,'payment'=>$payment,'order'=>shopOrderReceipt($db,(int)$existing['order_id']),'email_status'=>shopOrderMailStatus($db,(int)$existing['order_id']),'repeated'=>true]);}
    shopLimit($db,'orders',20);
    $delivery=npValidateDelivery($db,$contact,$type);$city=$delivery['city'];$address=$delivery['address'];
    $db->beginTransaction();
    try{
        $raw=shopResolvedLines($db,is_array($input['lines'] ?? null)?$input['lines']:[],true);$quote=shopCheckoutQuote($raw,customerField($input,'promo',40));
        $calc=['lines'=>$quote['lines'],'subtotal'=>$quote['subtotal']];$discount=$quote['discount'];$shipping=0;$total=$quote['total'];$lineAmounts=array_column($quote['lines'],'amount');
        $expected=$input['expected_total']??null;
        try{$expectedCents=shopMoney($expected);}catch(ShopPricingException $e){$expectedCents=null;}
        if($expectedCents!==shopMoney($total)||isset($input['catalog_version'])&&$input['catalog_version']!==$quote['catalog_version']){$db->rollBack();shopJson(['ok'=>false,'error_code'=>'PRICE_CHANGED','error'=>'Ціна або версія каталогу змінилася. Перевірте новий розрахунок та підтвердьте.','quote'=>$quote],409);}
        $number='RB-'.gmdate('ymd').'-'.strtoupper(bin2hex(random_bytes(4)));$label=['branch'=>'Нова пошта · відділення','postomat'=>'Нова пошта · поштомат','courier'=>'Нова пошта · курʼєр'][$type].' · '.$city.' · '.$address;
        $db->prepare("INSERT INTO rubizh_customer_orders(external_id,email,order_number,status,payment_status,total,currency,items_json,delivery_label,created_at,updated_at) VALUES(?,?,?,'new',?,?,'UAH',?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())")->execute(['web:'.$key,$email,$number,$pay==='cod'?'cod':'pending',$total,json_encode($calc['lines'],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$label]);
        $id=(int)$db->lastInsertId();
        $fulfillment=$db->prepare('INSERT INTO rubizh_order_fulfillment_lines(order_id,line_no,product_id,sku,qty,supplier_code,line_amount,sale_unit,created_at) VALUES(?,?,?,?,?,?,?,?,UTC_TIMESTAMP())');
        foreach($raw as $lineNo=>$line)$fulfillment->execute([$id,$lineNo,$line['product_id'],$line['sku'],$line['qty'],$line['fulfillment_supplier'],$lineAmounts[$lineNo],$line['sale_unit']]);
        if($owner!==null)$db->prepare('INSERT INTO rubizh_account_orders(order_id,customer_id) VALUES(?,?)')->execute([$id,$owner]);
        $db->prepare('INSERT INTO rubizh_checkout_requests(request_id,scope_hash,payload_hash,order_id,created_at) VALUES(?,?,?,?,UTC_TIMESTAMP())')->execute([$key,$scope,$hash,$id]);
        $db->prepare('INSERT INTO rubizh_order_details(order_id,contact_json,subtotal,discount_amount,shipping_amount) VALUES(?,?,?,?,?)')->execute([$id,json_encode(['name'=>$name,'phone'=>'+'.$phone,'email'=>$email,'recipient'=>$recipient,'city'=>$city,'address'=>$address,'delivery_type'=>$type,'comment'=>$comment,'payment'=>$pay,'catalog_version'=>$quote['catalog_version'],'request_state'=>count(array_filter($raw,fn($l)=>$l['request_state']==='order_on_request'))?'order_on_request':'stock_check','np_delivery'=>$delivery,'shipping_estimate'=>false,'shipping_paid_to_carrier'=>true,'brigade'=>$brigade,'supplier_articles'=>catalog_order_articles($db,$calc['lines']),'donation_channel'=>$donationChannel,'donation_phone'=>'+'.$donationPhone,'donation_percent'=>3,'donation_amount'=>shopDonationAmount($total),'offer_version'=>'2026-10-07','accepted_at'=>gmdate('c')],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$calc['subtotal'],$discount,$shipping]);
        if($email!=='')$db->prepare('INSERT INTO rubizh_order_mail(order_id,recipient,next_at,updated_at) VALUES(?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())')->execute([$id,$email]);shopQueueEvent($db,$id,'new_order');$timing=shopEnsureTiming($db,['id'=>$id,'created_at'=>gmdate('Y-m-d H:i:s')]);shopReserveLines($db,$id,$raw,$timing['payment_due']);shopCartRemindersConverted($db,$scope,$email,$owner);$db->commit();
    }catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
    $payment=null; // Manager confirms stock before the customer starts payment.
    $response=['ok'=>true,'order'=>shopOrderReceipt($db,$id),'email_status'=>$email!==''?'pending':'none','payment'=>$payment??null];
    // On PHP-FPM the shopper receives the saved order before an SMTP connection.
    if(function_exists('fastcgi_finish_request')){header('Content-Type: application/json; charset=utf-8');echo json_encode($response,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);fastcgi_finish_request();shopSendOrderMail($db,$id);shopSendNotifications($db,2);exit;}
    shopJson($response);
}catch(Throwable $e){error_log('rubizh checkout: '.get_class($e).' reason '.($e instanceof ShopPricingException?$e->reason:(string)$e->getCode()));if($e instanceof RubizhHttpException&&$e->retryAfter)header('Retry-After: '.$e->retryAfter);shopJson(['ok'=>false,'error_code'=>$e instanceof ShopPricingException?$e->reason:'CHECKOUT_FAILED','error'=>$e instanceof PDOException?'Не вдалося зберегти замовлення. Спробуйте ще раз.':($e instanceof JsonException?'Перевірте дані кошика.':$e->getMessage())],$e instanceof ShopPricingException?$e->httpStatus:($e instanceof RubizhHttpException?$e->status:($e instanceof PDOException?503:400)));}
