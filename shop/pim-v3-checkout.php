<?php
declare(strict_types=1);
// PIM contract 3 checkout: one server resolver for quote, order, manager confirmation and invoice.
// Browser flags, prices, stock and SKU ownership are never trusted.

function pimV3LineProduct(PDO $db,string $productId,bool $lock): ?array {
    if(empty($GLOBALS['rubizh_pim_v3_columns'])||$productId==='')return null;
    $q=$db->prepare('SELECT p.* FROM products p WHERE p.id=? AND p.pim_contract_version=3'.($lock?' FOR UPDATE':''));$q->execute([$productId]);
    return $q->fetch(PDO::FETCH_ASSOC)?:null;
}
function pimV3Field(array $line,string $key,int $max): string {
    $v=$line[$key]??'';if($v===null)return '';if(!is_string($v)||mb_strlen($v)>$max||preg_match('/[\x00-\x1f\x7f]/u',$v))throw new ShopPricingException('INVALID_VARIANT','Перевірте вибір товару.');return trim($v);
}
function pimV3Published(PDO $db,array $model): void {
    $q=$db->prepare('SELECT 1 FROM products p WHERE p.id=? AND p.visible=1 AND p.pim_publication_state=\'ACTIVE\' AND '.shopUsablePhotoSql('p'));$q->execute([$model['id']]);
    if(!$q->fetchColumn())throw new ShopPricingException('UNAVAILABLE','Товар зараз не опублікований. Оновіть кошик.');
}
/** Resolve one cart line of a v3 MODEL: either a real SKU or a size request option without SKU. */
function pimV3ResolveLine(PDO $db,array $line,array $model,bool $lock,array &$totals): array {
    pimV3Published($db,$model);
    $colorId=pimV3Field($line,'color_id',64);$optionId=pimV3Field($line,'option_id',64);$sku=pimV3Field($line,'sku',64);
    $colors=$db->prepare('SELECT color_id FROM rubizh_product_colors WHERE product_id=? AND active=1');$colors->execute([$model['id']]);$active=$colors->fetchAll(PDO::FETCH_COLUMN);
    if($colorId!==''&&!in_array($colorId,$active,true))throw new ShopPricingException('INVALID_VARIANT','Колір не належить цій моделі.');
    if($colorId===''&&count($active)>1)throw new ShopPricingException('INVALID_VARIANT','Оберіть колір.');
    $qty=shopQuantity($line['qty']??null,'pcs');
    $base=['product_id'=>$model['id'],'model_id'=>$model['pim_model_id']??$model['id'],'contract_version'=>3,'name'=>$model['name'],'slug'=>$model['slug'],'has_docs'=>false,'docs_note'=>'',
        'qty'=>$qty,'sale_unit'=>'pcs','qty_label'=>$qty.' шт.','catalog_version'=>shopPricingCatalogVersion($db),'kit_group'=>customerField($line,'kit_group',64)];
    if($optionId!==''){
        if($sku!=='')throw new ShopPricingException('INVALID_VARIANT','Заявка на розмір не має SKU.');
        if(($line['price_mode']??'retail')!=='retail')throw new ShopPricingException('DISCOUNT_NOT_ALLOWED','Спеціальна ціна для заявки недоступна.');
        $q=$db->prepare('SELECT * FROM rubizh_size_options WHERE product_id=? AND option_id=? AND active=1');$q->execute([$model['id'],$optionId]);$o=$q->fetch(PDO::FETCH_ASSOC);
        if(!$o)throw new ShopPricingException('INVALID_VARIANT','Розмір більше не пропонується. Оновіть кошик.');
        if($o['scope']==='COLOR'&&$o['color_id']!==$colorId)throw new ShopPricingException('INVALID_VARIANT','Розмір не належить вибраному кольору.');
        if(isset($line['size'])&&$line['size']!==$o['size'])throw new ShopPricingException('INVALID_VARIANT','Розмір не відповідає заявці.');
        $label=$colorId!==''?(string)$db->query('SELECT TRIM(CONCAT_WS(\' / \',color,camouflage)) FROM rubizh_product_colors WHERE product_id='.$db->quote($model['id']).' AND color_id='.$db->quote($colorId))->fetchColumn():'';
        // Request only: no SKU, no stock reservation, no invoice before a manager resolves a real SKU.
        return $base+['sku'=>'','variant_id'=>'','option_id'=>$optionId,'color_id'=>$colorId?:null,'selection_type'=>'SIZE_OPTION','size'=>$o['size'],'color'=>$label,'variant'=>trim($o['size'].' · '.$label,' ·'),
            'price'=>0,'kit_price'=>null,'_pricing'=>null,'_approved_wholesale_tier'=>null,'price_mode'=>'retail','price_pending'=>true,'stock_confirmed'=>false,
            'availability'=>'order','availability_v3'=>'SIZE_CONFIRMATION_REQUIRED','payment_allowed'=>false,'requires_order_confirmation'=>true,'request_state'=>'size_confirmation','fulfillment_supplier'=>''];
    }
    if($sku==='')throw new ShopPricingException('INVALID_VARIANT','Оберіть розмір.');
    $q=$db->prepare('SELECT v.*,f.supplier_name AS fulfillment_supplier_name FROM variants v LEFT JOIN rubizh_catalog_fulfillment f ON f.sku=v.sku AND f.product_id=v.product_id WHERE v.sku=? AND v.product_id=? AND v.pim_active=1'.($lock?' FOR UPDATE':''));
    $q->execute([$sku,$model['id']]);$v=$q->fetch(PDO::FETCH_ASSOC);
    if(!$v)throw new ShopPricingException('INVALID_VARIANT','SKU більше не належить цьому товару. Оновіть кошик.');
    if($colorId!==''&&$v['pim_color_id']!==$colorId)throw new ShopPricingException('INVALID_VARIANT','SKU не належить вибраному кольору.');
    $size=trim((string)($v['pim_size_display']??''))?:trim((string)($v['pim_size_normalized']??''));
    if(isset($line['size'])&&is_string($line['size'])&&$line['size']!==''&&$line['size']!==$size)throw new ShopPricingException('INVALID_VARIANT','Розмір не відповідає SKU.');
    if((int)$v['pim_order_submission_allowed']!==1)throw new ShopPricingException('UNAVAILABLE',$v['pim_effective_availability']==='UNKNOWN'?'Наявність невідома: оформлення недоступне.':'Товар або розмір недоступний. Оновіть кошик.');
    // Only an explicit supplier expiry ends an observation; data age alone is a warning (no 48h gate).
    if($v['pim_expires_at']!==null&&(int)$v['pim_expires_at']<=time()*1000)throw new ShopPricingException('UNAVAILABLE','Дані постачальника про наявність закінчилися. Оновіть кошик.');
    $policy=shopPricingRead($db,$sku,$model['id']);
    if($policy===null||(int)$v['pim_price_ready']!==1)throw new ShopPricingException('UNAVAILABLE','Ціна цього SKU не підтверджена.');
    $mode=$line['price_mode']??(!empty($line['kit_group'])?'kit':'retail');
    if(!is_string($mode)||!in_array($mode,['retail','kit','wholesale'],true))throw new ShopPricingException('DISCOUNT_NOT_ALLOWED','Невідомий режим ціни.');
    $payable=(int)$v['pim_payment_allowed']===1;
    $totals[$sku]=($totals[$sku]??0)+$qty;
    // Numeric reservations only for a confirmed QUANTITY; STATUS null is never turned into a number.
    $numeric=$payable&&$v['pim_stock_quantity']!==null;
    if($numeric&&$totals[$sku]+shopReservedQty($db,$sku)>(float)$v['pim_stock_quantity'])throw new ShopPricingException('UNAVAILABLE','Недостатньо товару на складі: '.$model['name']);
    $grants=cfg('shop_wholesale_customers');$buyer=function_exists('customerId')?customerId():null;$tier=is_array($grants)&&$buyer!==null?($grants[$buyer]??null):null;
    $color=(string)$v['color'];
    return $base+['sku'=>$sku,'variant_id'=>$sku,'option_id'=>null,'color_id'=>$v['pim_color_id'],'selection_type'=>'SKU','size'=>$v['pim_size_status']==='NO_SIZE_REQUIRED'?'':$size,'color'=>$color,
        'variant'=>trim(($v['pim_size_status']==='NO_SIZE_REQUIRED'?'':$size).' · '.$color,' ·'),'price'=>shopMoneyValue($policy['price_cents']),'kit_price'=>$policy['kit_cents']===null?null:shopMoneyValue($policy['kit_cents']),
        '_pricing'=>$policy,'_approved_wholesale_tier'=>$tier,'price_mode'=>$mode,'retail_price'=>shopMoneyValue($policy['price_cents']),'price_pending'=>false,'stock_confirmed'=>$numeric,
        'availability'=>$payable?'in':'order','availability_v3'=>$v['pim_effective_availability'],'payment_allowed'=>$payable,'requires_order_confirmation'=>!$payable,
        'delivery_lead_time_days'=>$v['pim_delivery_lead_time_days']===null?null:(int)$v['pim_delivery_lead_time_days'],
        'request_state'=>$payable?'stock_check':($v['pim_effective_availability']==='PREORDER'?'confirmed_preorder':'order_on_request'),
        'fulfillment_supplier'=>npSupplierCode($sku,$model['id'],(string)($v['fulfillment_supplier_name']??''))];
}

/** Whole-order policy: any line needing confirmation → WAITING_CONFIRMATION, one payment later; no split. */
function pimV3OrderDecision(array $lines,string $payment): array {
    $v3=(bool)array_filter($lines,fn($l)=>($l['contract_version']??null)===3);
    if(!$v3)return ['contract_version'=>null,'order_state'=>null,'legacy_status'=>'new','payment_now'=>false];
    $confirm=(bool)array_filter($lines,fn($l)=>($l['contract_version']??null)!==3||empty($l['payment_allowed']))||$payment==='cod';
    return ['contract_version'=>3,'order_state'=>$confirm?'WAITING_CONFIRMATION':'CONFIRMED','legacy_status'=>$confirm?'new':'confirmed','payment_now'=>!$confirm];
}
function pimV3RecordOrder(PDO $db,int $id,array $lines,array $decision,string $revision): void {
    if($decision['contract_version']!==3)return;
    $db->prepare("UPDATE rubizh_customer_orders SET pim_contract_version=3,pim_order_state=?,pim_payment_state='UNPAID',pim_fulfillment_state='NOT_READY',pim_catalog_revision=? WHERE id=?")->execute([$decision['order_state'],mb_substr($revision,0,64),$id]);
    $q=$db->prepare('INSERT INTO rubizh_order_request_selections(order_id,line_no,product_id,option_id,original_selection_json,created_at) VALUES(?,?,?,?,?,UTC_TIMESTAMP())');
    foreach($lines as $no=>$l)if(($l['selection_type']??'')==='SIZE_OPTION')$q->execute([$id,$no,$l['product_id'],$l['option_id'],json_encode(['model_id'=>$l['model_id'],'color_id'=>$l['color_id'],'option_id'=>$l['option_id'],'size'=>$l['size'],'qty'=>$l['qty']],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)]);
}
function pimV3Order(PDO $db,int $id): ?array {
    if(empty($GLOBALS['rubizh_pim_v3_columns']))return null;
    $q=$db->prepare('SELECT * FROM rubizh_customer_orders WHERE id=? AND pim_contract_version=3');$q->execute([$id]);return $q->fetch(PDO::FETCH_ASSOC)?:null;
}
/** Revalidate an order against the current catalog right before an invoice. Saved amount is never rewritten here. */
function pimV3RevalidateForPayment(PDO $db,array $order): void {
    $o=pimV3Order($db,(int)$order['id']);if(!$o)return;
    if($o['pim_order_state']!=='CONFIRMED')throw new RuntimeException('Замовлення очікує підтвердження менеджера; оплата поки недоступна.');
    $managerConfirmed=(bool)$db->query('SELECT COUNT(*) FROM rubizh_np_order_confirmations WHERE availability_confirmed=1 AND order_id='.(int)$o['id'])->fetchColumn();
    foreach(json_decode((string)$o['items_json'],true)?:[] as $l){
        if(($l['contract_version']??null)!==3)continue;
        if(($l['sku']??'')==='')throw new RuntimeException('Розмір ще не підтверджено менеджером.');
        $model=pimV3LineProduct($db,(string)$l['product_id'],true);if(!$model)throw new RuntimeException('Товар більше недоступний. Зверніться до менеджера.');
        pimV3Published($db,$model);
        $q=$db->prepare('SELECT * FROM variants WHERE sku=? AND product_id=? AND pim_active=1 FOR UPDATE');$q->execute([$l['sku'],$l['product_id']]);$v=$q->fetch(PDO::FETCH_ASSOC);
        if(!$v||($l['color_id']??null)!==null&&$v['pim_color_id']!==$l['color_id'])throw new RuntimeException('SKU змінився. Зверніться до менеджера.');
        // Without a manager confirmation only a currently payable SKU may be paid.
        if(!$managerConfirmed&&(int)$v['pim_payment_allowed']!==1)throw new RuntimeException('Наявність змінилася; оплата можлива після підтвердження менеджера.');
        if(in_array($v['pim_effective_availability'],['UNKNOWN','OUT_OF_STOCK'],true)||(int)$v['pim_order_submission_allowed']!==1)throw new RuntimeException('Товар зараз недоступний. Зверніться до менеджера.');
        $policy=shopPricingRead($db,(string)$l['sku'],(string)$l['product_id']);
        if($policy===null||shopMoney($l['retail_price']??$l['price'])!==$policy['price_cents'])throw new ShopPricingException('PRICE_CHANGED','Ціна змінилася. Менеджер погодить новий розрахунок перед оплатою.',409);
    }
}
/** Manager resolves every size request to a real owned SKU; the whole order then gets one total and one payment. */
function pimV3ConfirmRequests(PDO $db,int $id,array $resolution,string $actor): void {
    $o=pimV3Order($db,$id);if(!$o||$o['pim_order_state']!=='WAITING_CONFIRMATION')return;
    $q=$db->prepare('SELECT * FROM rubizh_order_request_selections WHERE order_id=? ORDER BY line_no');$q->execute([$id]);$requests=$q->fetchAll(PDO::FETCH_ASSOC);
    $lines=json_decode((string)$o['items_json'],true)?:[];
    foreach($requests as $r){
        $no=(int)$r['line_no'];$sku=$resolution[$no]??'';if(!is_string($sku)||$sku==='')throw new RuntimeException('Оберіть реальний SKU для кожного запиту розміру.');
        $sel=json_decode($r['original_selection_json'],true);
        $v=$db->prepare('SELECT v.*,cp.policy_json FROM variants v JOIN rubizh_catalog_pricing cp ON cp.sku=v.sku AND cp.product_id=v.product_id WHERE v.sku=? AND v.product_id=? AND v.pim_active=1 FOR UPDATE');$v->execute([$sku,$r['product_id']]);$row=$v->fetch(PDO::FETCH_ASSOC);
        if(!$row||$sel['color_id']!==null&&$row['pim_color_id']!==$sel['color_id'])throw new RuntimeException('SKU не належить вибраній моделі/кольору.');
        if(in_array($row['pim_effective_availability'],['UNKNOWN','OUT_OF_STOCK'],true))throw new RuntimeException('Цей SKU зараз недоступний.');
        $policy=json_decode($row['policy_json'],true,32,JSON_THROW_ON_ERROR);$size=trim((string)$row['pim_size_display'])?:trim((string)$row['pim_size_normalized']);
        $line=$lines[$no];$unit=shopMoneyValue($policy['price_cents']);$amount=shopMoneyValue(shopLineMoney($policy['price_cents'],$line['qty']));
        $lines[$no]=array_replace($line,['sku'=>$sku,'variant_id'=>$sku,'selection_type'=>'SKU','resolved_from_option'=>$r['option_id'],'size'=>$size,'variant'=>trim($size.' · '.$row['color'],' ·'),'price'=>$unit,'retail_price'=>$unit,'amount'=>$amount,'price_pending'=>false]);
        $db->prepare('UPDATE rubizh_order_request_selections SET resolved_sku=?,resolution_revision=? WHERE order_id=? AND line_no=?')->execute([$sku,hash('sha256',$sku.'|'.$policy['price_cents'].'|'.$actor),$id,$no]);
        $db->prepare('UPDATE rubizh_order_fulfillment_lines SET sku=?,line_amount=? WHERE order_id=? AND line_no=?')->execute([$sku,$amount,$id,$no]);
    }
    $total=0;foreach($lines as $l)$total+=shopMoney($l['amount']??0);
    $revision=hash('sha256',json_encode($lines,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR));
    $db->prepare("UPDATE rubizh_customer_orders SET items_json=?,total=?,pim_order_state='CONFIRMED',pim_confirmation_revision=?,updated_at=UTC_TIMESTAMP() WHERE id=?")->execute([json_encode($lines,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),shopMoneyValue($total),$revision,$id]);
    $db->prepare('UPDATE rubizh_order_details SET subtotal=? WHERE order_id=?')->execute([shopMoneyValue($total),$id]);
}

/** Manager form data: each open size request with the owned real SKU of its model/color. */
function pimV3RequestChoices(PDO $db,int $orderId): array {
    $o=pimV3Order($db,$orderId);if(!$o||$o['pim_order_state']!=='WAITING_CONFIRMATION')return [];
    $q=$db->prepare('SELECT * FROM rubizh_order_request_selections WHERE order_id=? AND resolved_sku IS NULL ORDER BY line_no');$q->execute([$orderId]);$out=[];
    foreach($q->fetchAll(PDO::FETCH_ASSOC) as $r){$sel=json_decode($r['original_selection_json'],true);
        $v=$db->prepare("SELECT sku,pim_size_display,pim_size_normalized,color,pim_effective_availability FROM variants WHERE product_id=? AND pim_active=1 AND pim_effective_availability NOT IN ('UNKNOWN','OUT_OF_STOCK')".($sel['color_id']!==null?' AND pim_color_id=?':'').' ORDER BY sort');
        $v->execute($sel['color_id']!==null?[$r['product_id'],$sel['color_id']]:[$r['product_id']]);
        $out[]=['line_no'=>(int)$r['line_no'],'label'=>$r['product_id'].' · розмір '.$sel['size'].' × '.$sel['qty'],'skus'=>array_map(fn($x)=>['sku'=>$x['sku'],'label'=>$x['sku'].' · '.(trim((string)$x['pim_size_display'])?:$x['pim_size_normalized']).' · '.$x['color'].' · '.$x['pim_effective_availability']],$v->fetchAll(PDO::FETCH_ASSOC))];}
    return $out;
}
