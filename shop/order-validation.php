<?php
declare(strict_types=1);

final class ShopOrderConflict extends RuntimeException {
    public function __construct(public readonly string $reason,public readonly array $details=[],string $message=''){
        parent::__construct($message?:$reason,409);
    }
}
function shopQuoteHash(array $quote): string {return hash('sha256',json_encode($quote,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE));}
function shopOrderBuyer(PDO $db,int $order): ?string {
    $q=$db->prepare('SELECT customer_id FROM rubizh_account_orders WHERE order_id=?');$q->execute([$order]);$id=$q->fetchColumn();return $id===false?null:(string)$id;
}
/** One resolver/quote/eligibility service for checkout, confirmation, resolution and invoice.
 * Callers own the transaction; catalog revision and sorted variant locks come first.
 * Persisted snapshots are compared, never silently repriced here.
 */
function shopValidateOrder(PDO $db,array $input,string $phase='checkout',?array $order=null,array $resolution=[],string $promo=''): array {
    if(!$db->inTransaction())throw new LogicException('Order validation requires transaction');
    if(!in_array($phase,['checkout','confirmation','invoice','selection'],true))throw new InvalidArgumentException('validation phase');
    $id=(int)($order['id']??0);
    if($phase==='invoice'&&$id){$q=$db->prepare('SELECT payment_due FROM rubizh_order_timing WHERE order_id=?');$q->execute([$id]);$due=$q->fetchColumn();if(is_string($due)&&$due<=gmdate('Y-m-d H:i:s')&&shopNoOpenCardInvoice($db,$id))throw new ShopOrderConflict('PAYMENT_NOT_ALLOWED',['blocker'=>'ORDER_EXPIRED']);}
    shopPricingCatalogVersion($db,true);
    $buyer=$order===null?(function_exists('customerId')?customerId():null):shopOrderBuyer($db,$id);
    $selections=$input;
    foreach($resolution as $no=>$sku){
        if(!isset($selections[$no])||($selections[$no]['selection_type']??'')!=='SIZE_OPTION'||!is_string($sku)||$sku==='')throw new ShopOrderConflict('SKU_UNAVAILABLE',['line_no'=>$no]);
        $selections[$no]=array_replace($selections[$no],['sku'=>$sku,'option_id'=>null]);
        // A manager may choose a different real size; ownership and exact size are
        // read from that SKU, and the before/after selection is recorded on apply.
        unset($selections[$no]['size']);
    }
    if($order!==null)foreach($selections as $i=>$l){
        if(isset($resolution[$i])||($l['sku']??'')==='')continue;
        $v3=!empty($GLOBALS['rubizh_pim_v3_columns']);
        $q=$db->prepare('SELECT product_id,availability'.($v3?',pim_effective_availability':',NULL AS pim_effective_availability').' FROM variants WHERE sku=?');$q->execute([$l['sku']]);$current=$q->fetch(PDO::FETCH_ASSOC);
        if(!$current||$current['product_id']!==$l['product_id'])throw new ShopOrderConflict('SKU_UNAVAILABLE',['line_no'=>$i]);
        $before=$input[$i]['availability_v3']??$input[$i]['availability']??null;
        $after=($input[$i]['contract_version']??null)===3?$current['pim_effective_availability']:$current['availability'];
        if($before!==null&&$before!==$after)throw new ShopOrderConflict('AVAILABILITY_CHANGED',['line_no'=>$i,'old'=>$before,'current'=>$after],'Наявність змінилася. Повторно перевірте замовлення.');
    }
    try{$raw=shopResolveCatalogLines($db,$selections,true,$id,$buyer);}
    catch(ShopPricingException $e){
        $code=match($e->reason){'INVALID_VARIANT'=>'SKU_UNAVAILABLE','UNAVAILABLE'=>'SKU_UNAVAILABLE',default=>$e->reason};
        throw new ShopOrderConflict($code,[],$e->getMessage());
    }
    // Cart recovery validates real selections without offering a checkout price.
    if($phase==='selection')return ['raw'=>$raw];
    $promo=$order!==null?($order['contact']['promo_code']??''):$promo;
    // Checkout callers apply their server-approved promo through this same service.
    $quote=shopCheckoutQuote($raw,(string)$promo);
    foreach($raw as $i=>$l){
        if($order!==null){
            $old=$input[$i];
            if(!isset($resolution[$i])&&($old['availability_v3']??$old['availability']??null)!==null&&($old['availability_v3']??$old['availability'])!==($l['availability_v3']??$l['availability']))
                throw new ShopOrderConflict('AVAILABILITY_CHANGED',['line_no'=>$i,'old'=>$old['availability_v3']??$old['availability'],'current'=>$l['availability_v3']??$l['availability']],'Наявність змінилася. Повторно перевірте замовлення.');
        }
        if($phase!=='checkout'&&($l['sku']??'')==='')throw new ShopOrderConflict('SKU_UNAVAILABLE',['line_no'=>$i],'Оберіть реальний SKU для кожного запиту розміру.');
        if($phase!=='checkout'&&empty($l['payment_allowed']))throw new ShopOrderConflict('PAYMENT_NOT_ALLOWED',['line_no'=>$i],'PIM ще не дозволяє оплату цього SKU. Потрібне актуальне підтвердження.');
    }
    if($order!==null){
        $changed=shopMoney($order['total'])!==shopMoney($quote['total'])+shopMoney($order['shipping_amount']??0);
        foreach($input as $i=>$old){
            if(isset($resolution[$i])||!empty($old['price_pending'])){$changed=true;continue;}
            $new=$quote['lines'][$i];
            if(shopMoney($old['price'])!==shopMoney($new['price'])||shopMoney($old['amount']??shopMoneyValue(shopLineMoney(shopMoney($old['price']),$old['qty'])))!==shopMoney($new['amount']))$changed=true;
            if(isset($old['retail_price'],$new['retail_price'])&&shopMoney($old['retail_price'])!==shopMoney($new['retail_price']))$changed=true;
        }
        $quote['shipping']=shopMoneyValue(shopMoney($order['shipping_amount']??0));
        $quote['total']=shopMoneyValue(shopMoney($quote['total'])+shopMoney($quote['shipping']));
        $result=['raw'=>$raw,'quote'=>$quote,'quote_hash'=>shopQuoteHash($quote),'price_changed'=>$changed,'resolution'=>$resolution];
        return $result;
    }
    return ['raw'=>$raw,'quote'=>$quote,'quote_hash'=>shopQuoteHash($quote),'price_changed'=>false,'resolution'=>[]];
}
function shopAssertPriceUnchanged(array $validation,array $order): void {
    if($validation['price_changed'])throw new ShopOrderConflict('PRICE_CHANGED',['old_total'=>$order['total'],'quote'=>$validation['quote'],'quote_hash'=>$validation['quote_hash']],'Ціна змінилася. Власник має явно погодити новий розрахунок.');
}
function shopAcceptOrderQuote(PDO $db,array $order,array $v,string $actor,array $approval): void {
    if(!$db->inTransaction())throw new LogicException('Quote acceptance requires transaction');
    if($v['price_changed']){
        shopRequirePermission($actor,'order.price_override');shopRequirePermission($actor,'order.total_override');
        $reason=shopFinancialReason((string)($approval['reason']??''));
        if(!is_string($approval['quote_hash']??null)||!hash_equals($v['quote_hash'],$approval['quote_hash']))shopAssertPriceUnchanged($v,$order);
    }else $reason='Актуальний склад і ціни перевірено';
    $id=(int)$order['id'];$lines=$v['quote']['lines'];
    // The bank charges the invoice amount: the total may change only when no card invoice can still be paid.
    if(round((float)$v['quote']['total'],2)!==round((float)$order['total'],2)&&!shopNoOpenCardInvoice($db,$id))throw new ShopOrderConflict('INVOICE_OPEN',['total'=>$order['total'],'quote_total'=>$v['quote']['total']],'Відкрито рахунок на попередню суму. Дочекайтеся його завершення або закриття, потім погодьте нову ціну.');
    foreach($v['resolution'] as $no=>$sku){
        $old=$order['items'][$no];$lines[$no]['resolved_from_option']=$old['option_id'];
        $db->prepare('UPDATE rubizh_order_request_selections SET resolved_sku=?,resolution_revision=? WHERE order_id=? AND line_no=?')->execute([$sku,$v['quote_hash'],$id,$no]);
    }
    foreach($v['raw'] as $no=>$l)$db->prepare('UPDATE rubizh_order_fulfillment_lines SET sku=?,supplier_code=?,line_amount=? WHERE order_id=? AND line_no=?')->execute([$l['sku'],$l['fulfillment_supplier'],$lines[$no]['amount'],$id,$no]);
    $db->prepare('UPDATE rubizh_customer_orders SET items_json=?,total=?,updated_at=UTC_TIMESTAMP() WHERE id=?')->execute([json_encode($lines,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE),$v['quote']['total'],$id]);
    $db->prepare('UPDATE rubizh_order_details SET subtotal=?,discount_amount=? WHERE order_id=?')->execute([$v['quote']['subtotal'],$v['quote']['discount'],$id]);
    shopOrderAudit($db,$id,$actor,'order.confirmation_quote',['items'=>$order['items'],'total'=>$order['total']],['items'=>$lines,'total'=>$v['quote']['total']],$reason);
}

// Compatibility signature, backed by the same validation service.
function shopResolvedLines(PDO $db,array $input,bool $lock=false): array {
    $own=!$db->inTransaction();if($own)$db->beginTransaction();
    try{$v=shopValidateOrder($db,$input,'selection');if($own)$db->rollBack();return $v['raw'];}
    catch(Throwable $e){if($own&&$db->inTransaction())$db->rollBack();throw $e;}
}
