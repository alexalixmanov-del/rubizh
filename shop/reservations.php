<?php
declare(strict_types=1);

// rubizh_stock_reservations remains the sole quantity reservation source.
// COMMITTED survives payment, expiry, fulfillment and financial refunds. Only a
// separate, evidenced inventory reconciliation may consume/return that stock.
function shopReservationTransition(PDO $db,int $order,string $target,string $source): void {
    if(!$db->inTransaction())throw new LogicException('Reservation transition requires transaction');
    if(!in_array($target,['COMMITTED','RELEASED','EXPIRED'],true))throw new InvalidArgumentException('reservation state');
    $q=$db->prepare('SELECT payment_status FROM rubizh_customer_orders WHERE id=? FOR UPDATE');$q->execute([$order]);$payment=$q->fetchColumn();
    if($payment===false)throw new RuntimeException('Order missing');
    if($target!=='COMMITTED'&&in_array($payment,['paid','refunded'],true))return;
    $q=$db->prepare('SELECT sku,qty,status FROM rubizh_stock_reservations WHERE order_id=? ORDER BY sku FOR UPDATE');$q->execute([$order]);
    foreach($q->fetchAll(PDO::FETCH_ASSOC) as $r){
        if($r['status']===$target||($target!=='COMMITTED'&&$r['status']!=='ACTIVE'))continue;
        $time=$target==='COMMITTED'?'committed_at':'released_at';
        $db->prepare("UPDATE rubizh_stock_reservations SET status=?,$time=UTC_TIMESTAMP() WHERE order_id=? AND sku=? AND status=?")->execute([$target,$order,$r['sku'],$r['status']]);
        shopOrderAudit($db,$order,str_repeat('0',32),'reservation.'.$target,$r,['sku'=>$r['sku'],'qty'=>$r['qty'],'status'=>$target],$source,$source);
    }
}
function shopReserveLines(PDO $db,int $id,array $lines,string $expires): void {
    if(!$db->inTransaction())throw new LogicException('Reservation creation requires transaction');
    $q=$db->prepare('SELECT status,payment_status FROM rubizh_customer_orders WHERE id=? FOR UPDATE');$q->execute([$id]);$o=$q->fetch(PDO::FETCH_ASSOC);
    if(!$o||in_array($o['payment_status'],['paid','refunded'],true)||in_array($o['status'],['cancelled','returned','completed'],true))return;
    $totals=[];foreach($lines as $l)if(($l['availability']??'')==='in'&&!empty($l['stock_confirmed'])&&($l['sku']??'')!=='')$totals[$l['sku']]=($totals[$l['sku']]??0)+(float)$l['qty'];
    foreach($totals as $sku=>$qty){
        $q=$db->prepare('SELECT qty,status FROM rubizh_stock_reservations WHERE order_id=? AND sku=? FOR UPDATE');$q->execute([$id,$sku]);$r=$q->fetch(PDO::FETCH_ASSOC);
        if($r){if($r['status']!=='ACTIVE'||(float)$r['qty']!==$qty)throw new RuntimeException('Reservation differs; explicit inventory review required');continue;}
        $db->prepare("INSERT INTO rubizh_stock_reservations(order_id,sku,qty,expires_at,status) VALUES(?,?,?,?,'ACTIVE')")->execute([$id,$sku,$qty,$expires]);
        shopOrderAudit($db,$id,str_repeat('0',32),'reservation.ACTIVE',[],['sku'=>$sku,'qty'=>$qty,'status'=>'ACTIVE'],'Checkout/confirmation','SYSTEM');
    }
}
function shopReservedQty(PDO $db,string $sku,int $excludeOrder=0): float {
    // An expired clock cannot free a pending/unknown bank operation. Historical
    // paid rows also count before/while the additive migration is reconciled.
    $q=$db->prepare("SELECT r.qty FROM rubizh_stock_reservations r JOIN rubizh_customer_orders o ON o.id=r.order_id WHERE r.sku=? AND r.order_id<>? AND (r.status='COMMITTED' OR (r.status='ACTIVE' AND (o.payment_status IN ('paid','refunded') OR (o.status NOT IN ('cancelled','returned') AND (r.expires_at>UTC_TIMESTAMP() OR EXISTS(SELECT 1 FROM rubizh_mono_invoices i WHERE i.order_id=o.id AND i.status IN ('creating','unknown','created','processing','hold','awaiting_webhook'))))))) FOR UPDATE");
    $q->execute([$sku,$excludeOrder]);return array_sum(array_map('floatval',$q->fetchAll(PDO::FETCH_COLUMN)));
}
