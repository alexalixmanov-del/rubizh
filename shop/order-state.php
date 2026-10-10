<?php
declare(strict_types=1);

/** Pure read-only compatibility projection. Null means review, never an invented state. */
function shopCanonicalOrder(array $o,array $shipments=[],array $invoices=[]): array {
    $flags=[];$legacyOrder=$o['status']??'';$legacyPayment=$o['payment_status']??'';
    $items=$o['items']??json_decode((string)($o['items_json']??'[]'),true)??[];
    $needs=(bool)array_filter($items,fn($l)=>!empty($l['requires_order_confirmation'])||($l['selection_type']??'')==='SIZE_OPTION');
    $order=match($legacyOrder){'new'=>$needs?'WAITING_CONFIRMATION':null,'confirmed','processing','partially_shipped','shipped','delivered'=>'CONFIRMED','cancelled'=>'CANCELLED','completed'=>'COMPLETED',default=>null};
    $active=(bool)array_filter($invoices,fn($i)=>in_array($i['status'],['creating','unknown','created','processing','hold','awaiting_webhook'],true));
    $payment=match($legacyPayment){'pending','failed'=>$active?'PAYMENT_PENDING':'UNPAID','paid'=>'PAID','refunded'=>'REFUNDED',default=>null};
    $fulfillment=match($legacyOrder){'new','cancelled'=>'NOT_READY','confirmed','processing'=>$legacyPayment==='paid'?'READY_TO_SHIP':'NOT_READY','shipped','partially_shipped'=>'SHIPPED','delivered','completed'=>'DELIVERED',default=>null};
    if($shipments){
        $ships=array_values(array_filter($shipments,fn($s)=>($s['status']??'')!=='cancelled'));
        $unknown=(bool)array_filter($ships,fn($s)=>!in_array($s['status']??'',['draft','creating','unknown','error','created','sent','delivered'],true));
        if($unknown){$fulfillment=null;$flags[]='SHIPMENT_REVIEW_REQUIRED';}
        elseif($ships){
            $allDelivered=count(array_filter($ships,fn($s)=>$s['status']==='delivered'))===count($ships);
            $allCovered=$o['shipment_coverage_complete']??false;
            if($allDelivered&&$allCovered)$fulfillment='DELIVERED';
            elseif(array_filter($ships,fn($s)=>in_array($s['status'],['sent','delivered'],true)))$fulfillment='IN_TRANSIT';
            elseif(array_filter($ships,fn($s)=>($s['tracking_number']??'')!==''&&($s['tracking_number']??null)!==null))$fulfillment='TTN_CREATED';
        }
    }
    if(in_array($legacyOrder,['returned','partially_returned'],true))$flags[]='LEGACY_REVIEW_REQUIRED';
    if($legacyPayment==='cod')$flags[]='LEGACY_REVIEW_REQUIRED';
    if($order==='COMPLETED'&&(!in_array($payment,['PAID','REFUNDED'],true)||$fulfillment!=='DELIVERED'))$flags[]='STATE_CONFLICT';
    if($order==='CANCELLED'&&in_array($payment,['PAID','REFUNDED'],true))$flags[]='STATE_CONFLICT';
    $v3=(int)($o['pim_contract_version']??0)===3;
    $allowed=[
        'order_status'=>['NEW','WAITING_CONFIRMATION','CONFIRMED','CANCELLED','COMPLETED'],
        'payment_status'=>['UNPAID','PAYMENT_PENDING','PAID','PARTIALLY_REFUNDED','REFUNDED'],
        'fulfillment_status'=>['NOT_READY','READY_TO_SHIP','TTN_CREATED','SHIPPED','IN_TRANSIT','DELIVERED'],
    ];
    $states=['order_status'=>$order,'payment_status'=>$payment,'fulfillment_status'=>$fulfillment];
    foreach(['order_status'=>'pim_order_state','payment_status'=>'pim_payment_state','fulfillment_status'=>'pim_fulfillment_state'] as $key=>$column){
        if($v3){
            $value=$o[$column]??null;
            if(!in_array($value,$allowed[$key],true)){$flags[]='STATE_CONFLICT';$states[$key]=null;continue;}
            $legacy=$states[$key];
            // Legacy cannot represent partial refunds or NEW vs WAITING. Keep the
            // explicit v3 state, but flag contradictory money/terminal evidence.
            if($key==='payment_status'&&$legacy!==null&&$value!==$legacy&&!($value==='PAYMENT_PENDING'&&$legacy==='UNPAID')&&!($value==='PARTIALLY_REFUNDED'&&$legacy==='PAID'))$flags[]='STATE_CONFLICT';
            if($key==='order_status'&&$legacy!==null&&$value!==$legacy&&!($value==='COMPLETED'&&$legacyOrder==='delivered'&&in_array($payment,['PAID','REFUNDED'],true)&&$fulfillment==='DELIVERED'&&!empty($o['shipment_coverage_complete'])))$flags[]='STATE_CONFLICT';
            if($key==='fulfillment_status'&&in_array($legacy,['DELIVERED','IN_TRANSIT','TTN_CREATED'],true)&&$value!==$legacy)$flags[]='STATE_CONFLICT';
            $states[$key]=$value;
        }elseif($states[$key]===null)$flags[]='LEGACY_REVIEW_REQUIRED';
    }
    $flags=array_values(array_unique($flags));
    return $states+['id'=>(int)($o['id']??0),'number'=>$o['order_number']??'','review_required'=>(bool)$flags,'review_flags'=>$flags,'source'=>$v3?'V3':'LEGACY'];
}
function shopCanonicalOrderDto(PDO $db,array $o): array {
    $ships=npShipments($db,(int)$o['id']);$left=npRemaining(npLines($db,(int)$o['id']),$ships);
    $o['shipment_coverage_complete']=(bool)$left&&!array_filter($left,fn($l)=>abs($l['qty'])>0.00001);
    $q=$db->prepare('SELECT status FROM rubizh_mono_invoices WHERE order_id=?');$q->execute([$o['id']]);
    return shopCanonicalOrder($o,$ships,$q->fetchAll(PDO::FETCH_ASSOC));
}
