<?php
declare(strict_types=1);
// Operator-only data repair: unknown historical commitment times stay unknown.
function shopReservationReconcilePlan(PDO $db): array {
    return ['terminal_rows'=>(int)$db->query("SELECT COUNT(*) FROM rubizh_stock_reservations r JOIN rubizh_customer_orders o ON o.id=r.order_id WHERE r.status IN ('ACTIVE','COMMITTED') AND (o.status IN ('cancelled','returned') OR o.payment_status='refunded')")->fetchColumn(),
        'evidenced_timestamps'=>(int)$db->query("SELECT COUNT(*) FROM rubizh_stock_reservations r WHERE r.status='COMMITTED' AND r.committed_at IS NULL AND EXISTS(SELECT 1 FROM rubizh_order_audit a WHERE a.order_id=r.order_id AND a.action='reservation.COMMITTED' AND JSON_UNQUOTE(JSON_EXTRACT(a.after_json,'$.sku'))=r.sku)")->fetchColumn()];
}
function shopReservationReconcileApply(PDO $db): array {
    if(PHP_SAPI!=='cli'||$db->inTransaction())throw new LogicException('Reservation repair requires CLI outside a transaction');
    $db->beginTransaction();try{
        $terminal=$db->exec("UPDATE rubizh_stock_reservations r JOIN rubizh_customer_orders o ON o.id=r.order_id SET r.status='RELEASED',r.released_at=COALESCE(r.released_at,UTC_TIMESTAMP()) WHERE r.status IN ('ACTIVE','COMMITTED') AND (o.status IN ('cancelled','returned') OR o.payment_status='refunded')");
        $timestamps=$db->exec("UPDATE rubizh_stock_reservations r SET r.committed_at=(SELECT MIN(a.created_at) FROM rubizh_order_audit a WHERE a.order_id=r.order_id AND a.action='reservation.COMMITTED' AND JSON_UNQUOTE(JSON_EXTRACT(a.after_json,'$.sku'))=r.sku) WHERE r.status='COMMITTED' AND r.committed_at IS NULL AND EXISTS(SELECT 1 FROM rubizh_order_audit a WHERE a.order_id=r.order_id AND a.action='reservation.COMMITTED' AND JSON_UNQUOTE(JSON_EXTRACT(a.after_json,'$.sku'))=r.sku)");
        $db->commit();return ['terminal_released'=>$terminal,'timestamps_recovered'=>$timestamps];
    }catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
}
