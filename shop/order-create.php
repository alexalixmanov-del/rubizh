<?php
declare(strict_types=1);
// One order-creation service for every channel (A2): the website checkout (shop/order.php) and the CRM phone order
// use the same contact rules, server prices (shopValidateOrder, Q-7/Q-4 decision), reservation and audit.

/** Normalized buyer contact; the same messages the checkout has always shown. */
function shopOrderContact(array $contact): array {
    $name=customerField($contact,'name',160);$phoneRaw=customerField($contact,'phone',30);$email=strtolower(customerField($contact,'email',254));
    $phone=preg_replace('/[^0-9]/','',$phoneRaw);if(preg_match('/^0\d{9}$/D',$phone))$phone='38'.$phone;
    if($name===''||!preg_match('/^380\d{9}$/D',$phone))throw new RuntimeException('Вкажіть ім’я та український телефон.');
    if($email!==''&&!filter_var($email,FILTER_VALIDATE_EMAIL))throw new RuntimeException('Перевірте email або залиште поле порожнім.');
    $city=customerField($contact,'city',120);$address=customerField($contact,'address',240);$type=customerField($contact,'delivery_type',12);$comment=shopComment($contact);$recipient=customerField($contact,'recipient',160);
    if($city===''||$address===''||!in_array($type,['branch','postomat','courier'],true))throw new RuntimeException('Вкажіть місто та місце отримання.');
    if(count(preg_split('/\s+/u',trim($recipient?:$name)))<2)throw new RuntimeException('Вкажіть ім’я та прізвище одержувача.');
    $brigade=shopDonationTarget($contact['brigade']??'');
    $donationChannel=customerField($contact,'donation_channel',12)?:'viber';if(!in_array($donationChannel,['viber','telegram'],true))throw new RuntimeException('Оберіть Viber або Telegram.');
    $donationPhone=preg_replace('/\D/','',customerField($contact,'donation_phone',30))?:$phone;if(preg_match('/^0\d{9}$/D',$donationPhone))$donationPhone='38'.$donationPhone;if(!preg_match('/^380\d{9}$/D',$donationPhone))throw new RuntimeException('Перевірте номер для скріна донату.');
    // 5-3: optional payer requisites for the invoice PDF (stored only for invoice orders).
    require_once __DIR__.'/invoice-pdf.php';$payer=shopInvoicePayer($contact);
    return ['payer'=>$payer,'name'=>$name,'phone_raw'=>$phoneRaw,'phone'=>$phone,'email'=>$email,'city'=>$city,'address'=>$address,'type'=>$type,'comment'=>$comment,'recipient'=>$recipient,'brigade'=>$brigade,'donation_channel'=>$donationChannel,'donation_phone'=>$donationPhone];
}

/**
 * Creates the order in one transaction (retried once on a deadlock victim). Options:
 *  external_id, owner (customer id or null), promo, expected_total (agreed total; mismatch → PRICE_CHANGED with quote),
 *  catalog_version, channel (web|phone|instagram|tiktok|other), staff (staff id for CRM orders),
 *  before_insert(): consume rate limits; after_insert(int $id, array $quote): channel bookkeeping inside the transaction.
 */
function shopCreateOrder(PDO $db,array $lines,array $c,array $delivery,string $pay,array $opts): array {
    if(!in_array($pay,['card','invoice'],true))throw new RuntimeException('Оберіть спосіб оплати: карткою онлайн або на рахунок ФОП.');
    require_once __DIR__.'/settings-lib.php';
    if($pay==='invoice'&&!shopInvoicePaymentEnabled())throw new RuntimeException('Оплата на рахунок ФОП зараз недоступна. Оплатіть карткою онлайн або зверніться до менеджера.');
    $channel=$opts['channel']??'web';$promo=(string)($opts['promo']??'');
    for($attempt=0;;$attempt++){
    $db->beginTransaction();
    try{
        $validated=shopValidateOrder($db,$lines,'checkout',null,[],$promo);$raw=$validated['raw'];$quote=$validated['quote'];
        $calc=['lines'=>$quote['lines'],'subtotal'=>$quote['subtotal']];$discount=$quote['discount'];$shipping=0;$total=$quote['total'];$lineAmounts=array_column($quote['lines'],'amount');
        try{$expectedCents=shopMoney($opts['expected_total']??null);}catch(ShopPricingException $e){$expectedCents=null;}
        if($expectedCents!==shopMoney($total)||isset($opts['catalog_version'])&&$opts['catalog_version']!==$quote['catalog_version']){$db->rollBack();throw new ShopOrderConflict('PRICE_CHANGED',['quote'=>$quote],'Ціна або версія каталогу змінилася. Перевірте новий розрахунок та підтвердьте.');}
        if(isset($opts['before_insert']))($opts['before_insert'])();
        $decision=pimV3OrderDecision($raw,$pay,shopDirectPayMaxQty($db));
        $number='RB-'.gmdate('ymd').'-'.strtoupper(bin2hex(random_bytes(4)));$label=['branch'=>'Нова пошта · відділення','postomat'=>'Нова пошта · поштомат','courier'=>'Нова пошта · кур’єр'][$c['type']].' · '.$delivery['city'].' · '.$delivery['address'];
        $db->prepare("INSERT INTO rubizh_customer_orders(external_id,email,order_number,status,payment_status,total,currency,items_json,delivery_label,created_at,updated_at) VALUES(?,?,?,?,?,?,'UAH',?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())")->execute([$opts['external_id'],$c['email'],$number,$decision['legacy_status'],'pending',$total,json_encode($calc['lines'],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$label]);
        $id=(int)$db->lastInsertId();pimV3RecordOrder($db,$id,$raw,$decision,(string)$quote['catalog_version']);
        $fulfillment=$db->prepare('INSERT INTO rubizh_order_fulfillment_lines(order_id,line_no,product_id,sku,qty,supplier_code,line_amount,sale_unit,created_at) VALUES(?,?,?,?,?,?,?,?,UTC_TIMESTAMP())');
        foreach($raw as $lineNo=>$line)$fulfillment->execute([$id,$lineNo,$line['product_id'],$line['sku'],$line['qty'],$line['fulfillment_supplier'],$lineAmounts[$lineNo],$line['sale_unit']]);
        if(($opts['owner']??null)!==null)$db->prepare('INSERT INTO rubizh_account_orders(order_id,customer_id) VALUES(?,?)')->execute([$id,$opts['owner']]);
        $contact=['name'=>$c['name'],'phone_raw'=>$c['phone_raw'],'phone_normalized'=>'+'.$c['phone'],'phone'=>'+'.$c['phone'],'email'=>$c['email'],'recipient'=>$c['recipient'],'city'=>$delivery['city'],'address'=>$delivery['address'],'delivery_type'=>$c['type'],'comment'=>$c['comment'],'payment'=>$pay,'promo_code'=>$promo,'catalog_version'=>$quote['catalog_version'],'request_state'=>count(array_filter($raw,fn($l)=>$l['request_state']==='order_on_request'))?'order_on_request':'stock_check','np_delivery'=>$delivery,'shipping_estimate'=>false,'shipping_paid_to_carrier'=>true,'brigade'=>$c['brigade'],'supplier_articles'=>catalog_order_articles($db,$calc['lines']),'donation_channel'=>$c['donation_channel'],'donation_phone'=>'+'.$c['donation_phone'],'donation_percent'=>3,'donation_amount'=>shopDonationAmount($total),'offer_version'=>'2026-10-07','accepted_at'=>gmdate('c')];
        if($pay==='invoice')$contact+=$c['payer']??[];
        if($channel!=='web')$contact+=['channel'=>$channel,'created_by_staff'=>$opts['staff']??null];
        if(!empty($decision['confirmation_reason']))$contact['confirmation_reason']=$decision['confirmation_reason'];
        $db->prepare('INSERT INTO rubizh_order_details(order_id,contact_json,subtotal,discount_amount,shipping_amount) VALUES(?,?,?,?,?)')->execute([$id,json_encode($contact,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$calc['subtotal'],$discount,$shipping]);
        if(crmSchemaReady($db))$db->prepare('INSERT INTO rubizh_order_contact_evidence(order_id,raw_phone,normalized_phone,evidence,updated_at) VALUES(?,?,?,\'ORDER_CONTACT\',UTC_TIMESTAMP())')->execute([$id,$c['phone_raw'],'+'.$c['phone']]);
        if($c['email']!=='')$db->prepare('INSERT INTO rubizh_order_mail(order_id,recipient,next_at,updated_at) VALUES(?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())')->execute([$id,$c['email']]);
        shopQueueEvent($db,$id,'new_order');$timing=shopEnsureTiming($db,['id'=>$id,'created_at'=>gmdate('Y-m-d H:i:s')]);shopReserveLines($db,$id,$raw,$timing['payment_due']);if($decision['payment_now'])shopStartPaymentTiming($db,['id'=>$id,'email'=>$c['email']]);
        if(isset($opts['after_insert']))($opts['after_insert'])($id,$quote);
        shopAssertCatalogVersion($db,(string)$quote['catalog_version']);$db->commit();
    }catch(Throwable $e){if($db->inTransaction())$db->rollBack();if($attempt===0&&shopRetryableTransactionError($e))continue;throw $e;}
    return ['id'=>$id,'quote'=>$quote,'decision'=>$decision];
    }
}
