<?php
declare(strict_types=1);

// rubizh_stock_reservations remains the sole quantity reservation source.
// COMMITTED bridges sales until the SKU supplier stock observation catches up.
// Terminal returned/cancelled/refunded orders release their remaining commitments.
function shopReservationTransition(PDO $db,int $order,string $target,string $source): void {
    if(!$db->inTransaction())throw new LogicException('Reservation transition requires transaction');
    if(!in_array($target,['COMMITTED','RELEASED','EXPIRED'],true))throw new InvalidArgumentException('reservation state');
    $q=$db->prepare('SELECT status,payment_status FROM rubizh_customer_orders WHERE id=? FOR UPDATE');$q->execute([$order]);$o=$q->fetch(PDO::FETCH_ASSOC);
    if(!$o)throw new RuntimeException('Order missing');
    $terminal=in_array($o['status'],['cancelled','returned'],true)||$o['payment_status']==='refunded';
    if($terminal)$target='RELEASED';
    if(!$terminal&&$target!=='COMMITTED'&&$o['payment_status']==='paid')return;
    $q=$db->prepare('SELECT sku,qty,status FROM rubizh_stock_reservations WHERE order_id=? ORDER BY sku FOR UPDATE');$q->execute([$order]);
    foreach($q->fetchAll(PDO::FETCH_ASSOC) as $r){
        if($r['status']===$target||($target!=='COMMITTED'&&$r['status']!=='ACTIVE'&&!($terminal&&$r['status']==='COMMITTED')))continue;
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
        // R4-10: an open order's expired or released reserve (e.g. a FOP invoice in its grace period) is renewed, not a conflict.
        if($r&&in_array($r['status'],['EXPIRED','RELEASED'],true)){$db->prepare("UPDATE rubizh_stock_reservations SET qty=?,expires_at=?,status='ACTIVE',released_at=NULL WHERE order_id=? AND sku=? AND status=?")->execute([$qty,$expires,$id,$sku,$r['status']]);shopOrderAudit($db,$id,str_repeat('0',32),'reservation.ACTIVE',$r,['sku'=>$sku,'qty'=>$qty,'status'=>'ACTIVE'],'Re-reservation','SYSTEM');continue;}
        if($r){if($r['status']!=='ACTIVE'||(float)$r['qty']!==$qty)throw new RuntimeException('Резерв для цього замовлення не збігається з поточною кількістю. Менеджер перевірить залишок перед підтвердженням.');continue;}
        $db->prepare("INSERT INTO rubizh_stock_reservations(order_id,sku,qty,expires_at,status) VALUES(?,?,?,?,'ACTIVE')")->execute([$id,$sku,$qty,$expires]);
        shopOrderAudit($db,$id,str_repeat('0',32),'reservation.ACTIVE',[],['sku'=>$sku,'qty'=>$qty,'status'=>'ACTIVE'],'Checkout/confirmation','SYSTEM');
    }
}
function shopReservedQty(PDO $db,string $sku,int $excludeOrder=0): float {
    // Nonlocking read: caller serializes a purchase on the variant row.
    // Keep unknown commitment timestamps conservatively until evidenced reconciliation.
    $observed='';
    if(!empty($GLOBALS['rubizh_pim_v3_columns']))$observed=" AND (r.committed_at IS NULL OR v.pim_stock_observed_at IS NULL OR TIMESTAMPDIFF(SECOND,'1970-01-01 00:00:00',r.committed_at)*1000>v.pim_stock_observed_at)";
    $q=$db->prepare("SELECT r.qty
      FROM rubizh_stock_reservations r
      JOIN rubizh_customer_orders o ON o.id=r.order_id
      LEFT JOIN variants v ON v.sku=r.sku
      WHERE r.sku=? AND r.order_id<>? AND o.status NOT IN ('cancelled','returned') AND o.payment_status<>'refunded' AND (
        (r.status='COMMITTED'$observed) OR (
          r.status='ACTIVE' AND (
            o.payment_status IN ('paid','refunded') OR (
              o.status NOT IN ('cancelled','returned') AND (
                r.expires_at>UTC_TIMESTAMP() OR EXISTS(
                  SELECT 1 FROM rubizh_mono_invoices i WHERE i.order_id=o.id AND (
                    i.status IN ('creating','unknown','created','processing','hold','awaiting_webhook') OR (
                      i.status='failure' AND i.invoice_id IS NOT NULL AND NOT EXISTS(
                        SELECT 1 FROM rubizh_np_audit a WHERE a.order_id=i.order_id
                          AND a.action IN ('mono_invoice_removed','mono_invoice_final_not_removed')
                          AND a.note=i.invoice_id
                      )
                    )
                  )
                )
              )
            )
          )
        )
      )");
    $q->execute([$sku,$excludeOrder]);return array_sum(array_map('floatval',$q->fetchAll(PDO::FETCH_COLUMN)));
}

// Retry only a rolled-back transaction victim, never arbitrary database failures.
function shopRetryableTransactionError(Throwable $e): bool {
    return $e instanceof PDOException && ((string)$e->getCode()==='40001' || (int)($e->errorInfo[1]??0)===1213);
}
