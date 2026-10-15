<?php
declare(strict_types=1);
// Stage 4 SITE domain operations (A2): the CRM calls these and any other SITE channel must use the same functions.
// Every operation takes the order lock, re-reads facts inside its transaction and writes one order-audit record.

function shopOpsTx(PDO $db,callable $fn): mixed {
    $own=!$db->inTransaction();if($own)$db->beginTransaction();
    try{$r=$fn();if($own)$db->commit();return $r;}catch(Throwable $e){if($own&&$db->inTransaction())$db->rollBack();throw $e;}
}
function shopOpsStaff(string $actor): void {if(shopStaffRole($actor)==='')throw new ShopPermissionException('Недостатньо прав для цієї дії.');}
/** Shipments that already left the draft stage (a TTN exists or was attempted). */
function shopLiveShipments(PDO $db,int $order): array {return array_values(array_filter(npShipments($db,$order),fn($s)=>!in_array($s['status'],['draft','error','cancelled'],true)));}
function shopOpsOpen(array $o): void {if(in_array($o['status'],['cancelled','completed','returned'],true))throw new ShopOrderConflict('ORDER_CLOSED',[],'Замовлення закрите.');}

/** M-12: the manager records the supplier's stock answer for one line. OUT_OF_STOCK leads to replace/remove/cancel. */
function shopConfirmLineStock(PDO $db,int $order,int $line,string $actor,string $status,string $note=''): void {
    shopRequirePermission($actor,'order.confirm');
    if(!in_array($status,['CONFIRMED','OUT_OF_STOCK'],true))throw new InvalidArgumentException('Невідомий результат перевірки.');
    npLocked($db,$order,fn()=>shopOpsTx($db,function()use($db,$order,$line,$actor,$status,$note){
        $o=npOrder($db,$order);shopOpsOpen($o);if(!isset($o['items'][$line]))throw new ShopOrderConflict('LINE_NOT_FOUND',['line_no'=>$line],'Позицію не знайдено.');
        if(shopLiveShipments($db,$order))throw new ShopOrderConflict('SHIPMENT_STARTED',[],'Посилку вже оформлено. Перевірка залишку більше не змінює замовлення.');
        $q=$db->prepare('SELECT status,note FROM rubizh_order_line_checks WHERE order_id=? AND line_no=?');$q->execute([$order,$line]);$old=$q->fetch(PDO::FETCH_ASSOC)?:[];
        $db->prepare('INSERT INTO rubizh_order_line_checks(order_id,line_no,status,note,checked_by,checked_at) VALUES(?,?,?,?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE status=VALUES(status),note=VALUES(note),checked_by=VALUES(checked_by),checked_at=VALUES(checked_at)')->execute([$order,$line,$status,mb_substr($note,0,400),$actor]);
        $db->prepare('UPDATE rubizh_customer_orders SET updated_at=UTC_TIMESTAMP() WHERE id=?')->execute([$order]);
        shopOrderAudit($db,$order,$actor,'order.line_stock',['line_no'=>$line]+$old,['line_no'=>$line,'sku'=>$o['items'][$line]['sku']??'','status'=>$status,'note'=>$note],$status==='CONFIRMED'?'Залишок у постачальника підтверджено':'Постачальник не має товару');
    }));
}

/**
 * Re-prices the order for a new list of lines through the same validation service as checkout and confirmation.
 * Allowed only before payment, before any TTN and with no payable card invoice. A higher total than the customer agreed
 * (expected_total_minor) returns PRICE_CHANGED with the new quote; reservations are rebuilt for the new lines.
 */
function shopRelineOrder(PDO $db,array $o,array $items,array $lineMap,string $actor,string $action,string $reason,?int $expectedTotalMinor): array {
    $id=(int)$o['id'];
    if(in_array($o['payment_status'],['paid','refunded'],true))throw new ShopOrderConflict('ORDER_PAID',[],'Оплачене замовлення змінюється лише через повернення.');
    if(shopLiveShipments($db,$id))throw new ShopOrderConflict('SHIPMENT_STARTED',[],'Посилку вже оформлено.');
    if(!shopNoOpenCardInvoice($db,$id))throw new ShopOrderConflict('INVOICE_OPEN',[],'Відкрито рахунок на попередню суму. Дочекайтеся його завершення або закриття.');
    $probe=$o;$probe['items']=$items;$probe['shipping_amount']=$o['shipping_amount']??0;
    $v=shopValidateOrder($db,$items,'confirmation',$probe);
    $newMinor=shopMoney($v['quote']['total']);
    if($expectedTotalMinor===null){$before=0;foreach($lineMap as $new=>$old)$before+=shopMoney($o['items'][$old]['amount']??0);$after=0;foreach(array_keys($lineMap) as $new)$after+=shopMoney($v['quote']['lines'][$new]['amount']);if($after>$before)throw new ShopOrderConflict('PRICE_CHANGED',['old_total'=>$o['total'],'quote'=>$v['quote'],'quote_total_minor'=>$newMinor],'Сума інших позицій змінилася. Погодьте нову суму з клієнтом.');}
    elseif($expectedTotalMinor!==$newMinor)throw new ShopOrderConflict('PRICE_CHANGED',['old_total'=>$o['total'],'quote'=>$v['quote'],'quote_total_minor'=>$newMinor],'Нова сума відрізняється від погодженої з клієнтом.');
    $lines=$v['quote']['lines'];
    $db->prepare('DELETE FROM rubizh_order_fulfillment_lines WHERE order_id=?')->execute([$id]);
    $ins=$db->prepare('INSERT INTO rubizh_order_fulfillment_lines(order_id,line_no,product_id,sku,qty,supplier_code,line_amount,sale_unit,created_at) VALUES(?,?,?,?,?,?,?,?,UTC_TIMESTAMP())');
    foreach($v['raw'] as $no=>$l)$ins->execute([$id,$no,$l['product_id'],$l['sku'],$l['qty'],$l['fulfillment_supplier'],$lines[$no]['amount'],$l['sale_unit']]);
    // Request selections and stock checks follow their line to its new number; a replaced/removed line loses its check.
    foreach(['rubizh_order_request_selections','rubizh_order_line_checks'] as $t){
        $rows=crmQuery($db,"SELECT * FROM $t WHERE order_id=? ORDER BY line_no",[$id]);$db->prepare("DELETE FROM $t WHERE order_id=?")->execute([$id]);
        foreach($rows as $r){$new=array_search((int)$r['line_no'],$lineMap,true);if($new===false||($t==='rubizh_order_line_checks'&&($items[$new]['_replaced']??false)))continue;$r['line_no']=$new;$db->prepare("INSERT INTO $t(".implode(',',array_keys($r)).') VALUES('.implode(',',array_fill(0,count($r),'?')).')')->execute(array_values($r));}
    }
    $db->prepare('UPDATE rubizh_customer_orders SET items_json=?,total=?,updated_at=UTC_TIMESTAMP() WHERE id=?')->execute([json_encode($lines,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE),$v['quote']['total'],$id]);
    $db->prepare('UPDATE rubizh_order_details SET subtotal=?,discount_amount=? WHERE order_id=?')->execute([$v['quote']['subtotal'],$v['quote']['discount'],$id]);
    $db->prepare("DELETE FROM rubizh_stock_reservations WHERE order_id=? AND status='ACTIVE'")->execute([$id]);
    $t=shopEnsureTiming($db,$o);shopReserveLines($db,$id,$v['raw'],(string)$t['payment_due']);
    shopOrderAudit($db,$id,$actor,$action,['items'=>$o['items'],'total'=>$o['total']],['items'=>$lines,'total'=>$v['quote']['total']],$reason);
    return $v;
}
function shopRemoveLine(PDO $db,int $order,int $line,string $actor,string $reason,?int $expectedTotalMinor=null): void {
    shopRequirePermission($actor,'order.confirm');$reason=shopFinancialReason($reason);
    npLocked($db,$order,fn()=>shopOpsTx($db,function()use($db,$order,$line,$actor,$reason,$expectedTotalMinor){
        $o=npOrder($db,$order);shopOpsOpen($o);if(!isset($o['items'][$line]))throw new ShopOrderConflict('LINE_NOT_FOUND',['line_no'=>$line],'Позицію не знайдено.');
        if(count($o['items'])<2)throw new ShopOrderConflict('LAST_LINE',[],'Це остання позиція. Скасуйте замовлення замість видалення.');
        $items=[];$map=[];foreach($o['items'] as $no=>$it)if($no!==$line){$map[count($items)]=$no;$items[]=$it;}
        shopRelineOrder($db,$o,$items,$map,$actor,'order.line_remove',$reason,$expectedTotalMinor);
    }));
}
/** Replacement only with the customer's consent; the new SKU is priced by the server and the agreed total must match. */
function shopReplaceLine(PDO $db,int $order,int $line,string $actor,string $sku,string $reason,?int $expectedTotalMinor): void {
    shopRequirePermission($actor,'order.confirm');$reason=shopFinancialReason($reason);
    npLocked($db,$order,fn()=>shopOpsTx($db,function()use($db,$order,$line,$actor,$sku,$reason,$expectedTotalMinor){
        $o=npOrder($db,$order);shopOpsOpen($o);if(!isset($o['items'][$line]))throw new ShopOrderConflict('LINE_NOT_FOUND',['line_no'=>$line],'Позицію не знайдено.');
        $q=$db->prepare('SELECT product_id,'.(!empty($GLOBALS['rubizh_pim_v3_columns'])?'pim_color_id':'NULL').' AS color_id FROM variants WHERE sku=?');$q->execute([$sku]);$v=$q->fetch(PDO::FETCH_ASSOC);
        if(!$v)throw new ShopOrderConflict('SKU_UNAVAILABLE',['sku'=>$sku],'SKU не знайдено в каталозі.');
        $items=$o['items'];$old=$items[$line];
        $items[$line]=['product_id'=>$v['product_id'],'color_id'=>$v['color_id'],'sku'=>$sku,'qty'=>$old['qty'],'price_pending'=>true,'_replaced'=>true];
        $map=array_combine(array_keys($items),array_keys($items));
        shopRelineOrder($db,$o,$items,$map,$actor,'order.line_replace',$reason.' · '.($old['sku']??'').' → '.$sku,$expectedTotalMinor);
    }));
}
/** «Передати в комплектацію»: a paid, confirmed order moves to the existing SITE status `processing` (OD-4.3). */
function shopTransferToPacking(PDO $db,int $order,string $actor): void {
    shopOpsStaff($actor);
    npLocked($db,$order,fn()=>shopOpsTx($db,function()use($db,$order,$actor){
        $o=npOrder($db,$order);if($o['status']!=='confirmed'||$o['payment_status']!=='paid')throw new ShopOrderConflict('PACKING_NOT_ALLOWED',[],'Передати в комплектацію можна лише оплачене підтверджене замовлення.');
        $db->prepare("UPDATE rubizh_customer_orders SET status='processing',updated_at=UTC_TIMESTAMP() WHERE id=? AND status='confirmed'")->execute([$order]);
        shopTimelineEvent($db,$order,'preparing','packing',gmdate('Y-m-d H:i:s'),['packing'=>true]);
        shopOrderAudit($db,$order,$actor,'order.packing',['status'=>'confirmed'],['status'=>'processing'],'Передано в комплектацію');
    }));
}
/** «Завершити»: only when every live parcel is delivered, every line is covered and money is settled. */
function shopCompleteOrder(PDO $db,int $order,string $actor): void {
    shopOpsStaff($actor);
    npLocked($db,$order,fn()=>shopOpsTx($db,function()use($db,$order,$actor){
        $o=npOrder($db,$order);if($o['status']==='completed')return;
        if(in_array($o['status'],['cancelled','returned','partially_returned'],true))throw new RuntimeException('Повернене або скасоване замовлення не завершують.');
        $ships=array_values(array_filter(npShipments($db,$order),fn($s)=>$s['status']!=='cancelled'));$left=npRemaining(npLines($db,$order),$ships);
        $covered=$ships&&!array_filter($left,fn($l)=>$l['qty']>0.00001);$delivered=$ships&&!array_filter($ships,fn($s)=>$s['status']!=='delivered');
        if(!$covered||!$delivered)throw new ShopOrderConflict('NOT_DELIVERED',[],'Завершити можна, коли всі посилки доставлено.');
        if(!in_array($o['payment_status'],['paid','refunded'],true))throw new ShopOrderConflict('NOT_PAID',[],'Замовлення не оплачене.');
        $db->prepare("UPDATE rubizh_customer_orders SET status='completed',updated_at=UTC_TIMESTAMP() WHERE id=?")->execute([$order]);
        if(!empty($GLOBALS['rubizh_pim_v3_columns']))$db->prepare("UPDATE rubizh_customer_orders SET pim_order_state='COMPLETED',pim_fulfillment_state='DELIVERED' WHERE id=? AND pim_contract_version=3")->execute([$order]);
        shopTimelineEvent($db,$order,'received','order',gmdate('Y-m-d H:i:s'),['completed'=>true]);
        shopOrderAudit($db,$order,$actor,'order.complete',['status'=>$o['status']],['status'=>'completed'],'Усі посилки доставлено');
    }));
}
/** LOG-06: delivery point correction before any TTN. Only directory-verified references are accepted, never free text. */
function shopUpdateDelivery(PDO $db,int $order,string $actor,array $delivery,?string $recipient,?string $phone,string $reason): void {
    shopOpsStaff($actor);$reason=shopFinancialReason($reason);$type=(string)($delivery['type']??'');
    if(!npConfigured()&&!defined('RUBIZH_NP_TESTS')&&!(function_exists('npMockEnabled')&&npMockEnabled()))throw new ShopOrderConflict('DELIVERY_UNVERIFIED',[],'Довідник НП недоступний. Адресу не змінено.');
    $verified=npValidateDelivery($db,['np_delivery'=>$delivery],$type);
    if(!empty($verified['manual'])||!npRef($verified['city_ref']??''))throw new ShopOrderConflict('DELIVERY_UNVERIFIED',[],'Оберіть місто й відділення з довідника НП.');
    if($phone!==null){$n=preg_replace('/\D/','',$phone);if(preg_match('/^0\d{9}$/D',$n))$n='38'.$n;if(!preg_match('/^380\d{9}$/D',$n))throw new InvalidArgumentException('Вкажіть український телефон отримувача.');$phone='+'.$n;}
    if($recipient!==null&&count(preg_split('/\s+/u',trim($recipient)))<2)throw new InvalidArgumentException('Вкажіть ім’я та прізвище одержувача.');
    npLocked($db,$order,fn()=>shopOpsTx($db,function()use($db,$order,$actor,$verified,$type,$recipient,$phone,$reason){
        $o=npOrder($db,$order);shopOpsOpen($o);
        foreach(npShipments($db,$order) as $s)if($s['status']!=='cancelled'&&(($s['tracking_number']??'')!==''||in_array($s['status'],['creating','unknown','created','sent','delivered','manual'],true)))throw new ShopOrderConflict('TTN_EXISTS',[],'ТТН уже створено. Адресу змінює лише перевізник.');
        $c=$o['contact'];$before=array_intersect_key($c,array_flip(['np_delivery','city','address','delivery_type','recipient','phone']));
        $c['np_delivery']=$verified;$c['city']=$verified['city'];$c['address']=$verified['address']??$c['address'];$c['delivery_type']=$type;if($recipient!==null)$c['recipient']=trim($recipient);if($phone!==null){$c['phone']=$phone;$c['phone_normalized']=$phone;}
        $label=['branch'=>'Нова пошта · відділення','postomat'=>'Нова пошта · поштомат','courier'=>'Нова пошта · кур’єр'][$type].' · '.$c['city'].' · '.$c['address'];
        $db->prepare('UPDATE rubizh_order_details SET contact_json=? WHERE order_id=?')->execute([json_encode($c,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$order]);
        $db->prepare('UPDATE rubizh_customer_orders SET delivery_label=?,updated_at=UTC_TIMESTAMP() WHERE id=?')->execute([$label,$order]);
        shopOrderAudit($db,$order,$actor,'order.delivery_update',$before,array_intersect_key($c,$before+['np_delivery'=>1]),$reason);
    }));
}
/** LOG-05: a line without a supplier (PIM gap) gets one only while no parcel is live. */
function shopAssignLineSupplier(PDO $db,int $order,int $line,string $actor,string $code,string $reason): void {
    shopRequirePermission($actor,'shipment.manage');$reason=shopFinancialReason($reason);
    if(!isset(npOrigins()[$code]))throw new ShopOrderConflict('UNKNOWN_SUPPLIER',['supplier_code'=>$code],'Невідомий постачальник.');
    npLocked($db,$order,fn()=>shopOpsTx($db,function()use($db,$order,$line,$actor,$code,$reason){
        $o=npOrder($db,$order);shopOpsOpen($o);$q=$db->prepare('SELECT * FROM rubizh_order_fulfillment_lines WHERE order_id=? AND line_no=? FOR UPDATE');$q->execute([$order,$line]);$l=$q->fetch(PDO::FETCH_ASSOC);
        if(!$l)throw new ShopOrderConflict('LINE_NOT_FOUND',['line_no'=>$line],'Позицію не знайдено.');
        if($l['supplier_code']!=='')throw new ShopOrderConflict('SUPPLIER_SET',[],'Постачальника для позиції вже визначено.');
        if(shopLiveShipments($db,$order))throw new ShopOrderConflict('SHIPMENT_STARTED',[],'Посилку вже оформлено.');
        $db->prepare('UPDATE rubizh_order_fulfillment_lines SET supplier_code=? WHERE order_id=? AND line_no=?')->execute([$code,$order,$line]);
        $db->prepare('UPDATE rubizh_customer_orders SET updated_at=UTC_TIMESTAMP() WHERE id=?')->execute([$order]);
        shopOrderAudit($db,$order,$actor,'order.line_supplier',['line_no'=>$line,'supplier_code'=>''],['line_no'=>$line,'sku'=>$l['sku'],'supplier_code'=>$code],$reason);
    }));
}
/** M-4: OWNER-only manual delivery confirmation; the history is marked so the exception stays visible (A4). */
function npManualDeliver(PDO $db,int $order,int $shipment,string $actor,string $reason): void {
    if(shopStaffRole($actor)!=='OWNER')throw new ShopPermissionException('Потрібні права власника.');
    shopRequirePermission($actor,'payment.manual_reconcile');$reason=shopFinancialReason($reason);
    npLocked($db,$order,fn()=>shopOpsTx($db,function()use($db,$order,$shipment,$actor,$reason){
        $q=$db->prepare('SELECT * FROM rubizh_order_shipments WHERE id=? AND order_id=? FOR UPDATE');$q->execute([$shipment,$order]);$s=$q->fetch(PDO::FETCH_ASSOC);
        if(!$s||!in_array($s['status'],['sent','manual'],true)||($s['tracking_number']??'')==='')throw new ShopOrderConflict('MANUAL_DELIVERY_NOT_ALLOWED',[],'Вручну можна підтвердити лише відправлену посилку з ТТН.');
        $db->prepare("UPDATE rubizh_order_shipments SET status='delivered',checked_at=UTC_TIMESTAMP(),updated_at=UTC_TIMESTAMP() WHERE id=?")->execute([$shipment]);
        shopTimelineEvent($db,$order,'received',(string)$s['tracking_number'],gmdate('Y-m-d H:i:s'),['tracking'=>$s['tracking_number'],'manual'=>true]);
        npAudit($db,$actor,'shipment_manual_delivered',$order,$shipment,$reason);npAggregateOrder($db,$order);
        shopOrderAudit($db,$order,$actor,'shipment.manual_deliver',['shipment_id'=>$shipment,'status'=>$s['status']],['shipment_id'=>$shipment,'status'=>'delivered','manual'=>true],$reason);
    }));
}
/**
 * D-51: payment by FOP invoice (bank transfer) is accepted from the bank statement by OWNER/ACCOUNTANT (step-up), exactly
 * the order total, idempotent per order. If the reservation lapsed, stock is re-checked first; without stock the payment
 * is not accepted and the manager arranges a refund of the transfer.
 */
function shopAcceptInvoicePayment(PDO $db,int $order,string $actor,int $amountMinor,string $paidOn,string $document,string $reason): array {
    shopRequirePermission($actor,'payment.invoice.accept');$reason=shopFinancialReason($reason);
    $document=trim($document);if($document===''||mb_strlen($document)>64||preg_match('/[\x00-\x1f\x7f]/u',$document))throw new InvalidArgumentException('Вкажіть номер платіжки.');
    $day=DateTimeImmutable::createFromFormat('!Y-m-d',$paidOn,new DateTimeZone('Europe/Kyiv'));if(!$day||$day->format('Y-m-d')!==$paidOn||$day>new DateTimeImmutable('now',new DateTimeZone('Europe/Kyiv')))throw new InvalidArgumentException('Перевірте дату оплати.');
    return npLocked($db,$order,fn()=>shopOpsTx($db,function()use($db,$order,$actor,$amountMinor,$paidOn,$document,$reason){
        $q=$db->prepare('SELECT * FROM rubizh_invoice_payments WHERE order_id=? FOR UPDATE');$q->execute([$order]);$done=$q->fetch(PDO::FETCH_ASSOC);
        if($done){if((int)$done['amount_minor']===$amountMinor&&$done['document']===$document&&$done['paid_on']===$paidOn)return ['repeated'=>true];throw new ShopOrderConflict('INVOICE_ALREADY_ACCEPTED',[],'Оплату за рахунком уже прийнято з іншими даними.');}
        $o=npOrder($db,$order);
        if(($o['contact']['payment']??'')!=='invoice')throw new ShopOrderConflict('NOT_INVOICE_ORDER',[],'Замовлення оплачується карткою; оплату підтверджує лише банк.');
        if(in_array($o['payment_status'],['paid','refunded'],true))throw new ShopOrderConflict('ALREADY_PAID',[],'Замовлення вже оплачене.');
        if($o['status']==='cancelled')throw new ShopOrderConflict('ORDER_CANCELLED',[],'Замовлення скасовано після строку звірки. Оплату не прийнято: поверніть кошти клієнту.');
        if(!in_array($o['status'],['confirmed','processing'],true))throw new ShopOrderConflict('CONFIRMATION_REQUIRED',[],'Спочатку підтвердьте замовлення.');
        if($amountMinor!==shopMoney($o['total']))throw new ShopOrderConflict('AMOUNT_MISMATCH',['total_minor'=>shopMoney($o['total'])],'Сума платіжки не дорівнює сумі замовлення. Часткову оплату не приймаємо — зв’яжіться з клієнтом.');
        if($paidOn<substr((string)$o['created_at'],0,10))throw new InvalidArgumentException('Дата оплати раніша за замовлення.');
        $q=$db->prepare("SELECT COUNT(*) FROM rubizh_stock_reservations WHERE order_id=? AND (status='ACTIVE' AND expires_at>UTC_TIMESTAMP() OR status='COMMITTED')");$q->execute([$order]);$held=(int)$q->fetchColumn()>0;
        if(!$held){
            // Reservation lapsed during the reconciliation period: current stock decides.
            // 'confirmation' re-checks SKU, availability and stock without the payment-deadline rule (the money already arrived).
            try{$v=shopValidateOrder($db,$o['items'],'confirmation',$o);}catch(ShopOrderConflict $e){throw new ShopOrderConflict('STOCK_UNAVAILABLE',['suggest'=>'REFUND','cause'=>$e->reason],'Товару вже немає в наявності. Оплату не прийнято: оформіть повернення коштів клієнту.');}
            $db->prepare("DELETE FROM rubizh_stock_reservations WHERE order_id=? AND status IN ('ACTIVE','EXPIRED','RELEASED')")->execute([$order]);
            shopReserveLines($db,$order,$v['raw'],gmdate('Y-m-d H:i:s',time()+3600));
        }
        $db->prepare('INSERT INTO rubizh_invoice_payments(order_id,amount_minor,paid_on,document,reason,accepted_by,accepted_at) VALUES(?,?,?,?,?,?,UTC_TIMESTAMP())')->execute([$order,$amountMinor,$paidOn,$document,$reason,$actor]);
        $db->prepare("UPDATE rubizh_customer_orders SET payment_status='paid',updated_at=UTC_TIMESTAMP() WHERE id=?")->execute([$order]);
        if(!empty($GLOBALS['rubizh_pim_v3_columns']))$db->prepare("UPDATE rubizh_customer_orders SET pim_payment_state='PAID',pim_fulfillment_state=IF(pim_fulfillment_state='NOT_READY','READY_TO_SHIP',pim_fulfillment_state) WHERE id=? AND pim_contract_version=3")->execute([$order]);
        shopReservationTransition($db,$order,'COMMITTED','BANK_STATEMENT');
        $db->prepare('UPDATE rubizh_order_timing SET paid_at=COALESCE(paid_at,?) WHERE order_id=?')->execute([$paidOn.' 12:00:00',$order]);
        shopOrderAudit($db,$order,$actor,'payment.invoice.accept',['payment_status'=>$o['payment_status']],['payment_status'=>'paid','amount_minor'=>$amountMinor,'paid_on'=>$paidOn,'document'=>$document],$reason);
        shopQueueEvent($db,$order,'paid');
        return ['repeated'=>false];
    }));
}
/** 7.6: a TTN that the carrier has not accepted yet is deleted at NP and the parcel is cancelled; the supplier is told. */
function npDeleteTtn(PDO $db,int $order,int $shipment,string $actor): void {
    shopRequirePermission($actor,'shipment.manage');
    npLocked($db,$order,function()use($db,$order,$shipment,$actor){
        $q=$db->prepare('SELECT * FROM rubizh_order_shipments WHERE id=? AND order_id=?');$q->execute([$shipment,$order]);$s=$q->fetch(PDO::FETCH_ASSOC);
        if(!$s||$s['status']!=='created'||!npRef($s['np_document_ref']??''))throw new ShopOrderConflict('TTN_DELETE_NOT_ALLOWED',[],'Видалити можна лише ТТН, яку ще не передано перевізнику.');
        npApiCall('InternetDocument','delete',['DocumentRefs'=>[$s['np_document_ref']]]);
        shopOpsTx($db,function()use($db,$order,$shipment,$actor,$s){
            $db->prepare("UPDATE rubizh_order_shipments SET status='cancelled',updated_at=UTC_TIMESTAMP() WHERE id=? AND status='created'")->execute([$shipment]);
            npAudit($db,$actor,'shipment_ttn_deleted',$order,$shipment,(string)$s['tracking_number']);supplierQueueNpCancellation($db,$order,$shipment);npAggregateOrder($db,$order);
            shopOrderAudit($db,$order,$actor,'shipment.delete_ttn',['shipment_id'=>$shipment,'tracking_number'=>$s['tracking_number']],['status'=>'cancelled'],'ТТН видалено до передачі перевізнику');
        });
    });
}
/** 7.7: staff correction of a customer account name, audited in SITE. */
function shopCustomerRename(PDO $db,string $customer,string $actor,string $first,string $last,string $reason): void {
    shopOpsStaff($actor);$reason=shopFinancialReason($reason);
    if($first===''||mb_strlen($first)>80||mb_strlen($last)>80||preg_match('/[\x00-\x1f\x7f<>]/u',$first.$last))throw new InvalidArgumentException('Перевірте ім’я клієнта.');
    shopOpsTx($db,function()use($db,$customer,$actor,$first,$last,$reason){
        $q=$db->prepare('SELECT first_name,last_name FROM rubizh_accounts WHERE id=? FOR UPDATE');$q->execute([$customer]);$old=$q->fetch(PDO::FETCH_ASSOC);if(!$old)throw new ShopOrderConflict('NOT_FOUND',[],'Клієнта не знайдено.');
        $db->prepare('UPDATE rubizh_accounts SET first_name=?,last_name=?,updated_at=UTC_TIMESTAMP() WHERE id=?')->execute([$first,$last,$customer]);
        $db->prepare('INSERT INTO rubizh_order_audit(order_id,actor_id,actor_role,source,action,reason,before_json,after_json,created_at) VALUES(0,?,?,\'USER\',\'customer.rename\',?,?,?,UTC_TIMESTAMP())')->execute([$actor,shopStaffRole($actor),$reason,json_encode($old,JSON_UNESCAPED_UNICODE),json_encode(['first_name'=>$first,'last_name'=>$last],JSON_UNESCAPED_UNICODE)]);
    });
}
