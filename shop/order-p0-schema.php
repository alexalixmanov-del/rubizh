<?php
declare(strict_types=1);

// CLI-only, additive extension of the existing reservation/order store.
function shopP0SchemaPlan(): array {
    $steps=[];
    foreach(['status'=>"VARCHAR(16) NOT NULL DEFAULT 'ACTIVE'",'committed_at'=>'DATETIME NULL','released_at'=>'DATETIME NULL'] as $name=>$type)
        $steps[]=['kind'=>'column','table'=>'rubizh_stock_reservations','name'=>$name,'sql'=>"ALTER TABLE rubizh_stock_reservations ADD COLUMN $name $type"];
    $steps[]=['kind'=>'table','name'=>'rubizh_order_audit','sql'=>"CREATE TABLE rubizh_order_audit(id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,order_id BIGINT UNSIGNED NOT NULL,actor_id CHAR(32) NOT NULL,actor_role VARCHAR(16) NOT NULL,source VARCHAR(32) NOT NULL,action VARCHAR(64) NOT NULL,reason VARCHAR(400) NOT NULL,before_json JSON NOT NULL,after_json JSON NOT NULL,created_at DATETIME NOT NULL,INDEX(order_id,id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"];
    foreach(['UPDATE','DELETE'] as $verb)$steps[]=['kind'=>'trigger','name'=>'rubizh_order_audit_no_'.strtolower($verb),'sql'=>"CREATE TRIGGER rubizh_order_audit_no_".strtolower($verb)." BEFORE $verb ON rubizh_order_audit FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Order audit is append-only'"];
    return $steps;
}
function shopP0StepExists(PDO $db,array $s): bool {
    [$sql,$args]=match($s['kind']){
        'column'=>['SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?',[$s['table'],$s['name']]],
        'table'=>['SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',[$s['name']]],
        'trigger'=>['SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME=?',[$s['name']]],
    };
    $q=$db->prepare($sql);$q->execute($args);return (bool)$q->fetchColumn();
}
function shopP0ApplySchema(PDO $db): void {
    if(PHP_SAPI!=='cli'||$db->inTransaction())throw new RuntimeException('P0 schema requires CLI outside a transaction');
    foreach(shopP0SchemaPlan() as $s)if(!shopP0StepExists($db,$s))$db->exec($s['sql']);
    // Existing paid/refunded reservations remain inventory commitments, including cancelled late payments.
    $db->beginTransaction();
    try{
        $db->exec("UPDATE rubizh_stock_reservations r JOIN rubizh_customer_orders o ON o.id=r.order_id SET r.status='COMMITTED' WHERE r.status='ACTIVE' AND o.payment_status IN ('paid','refunded')");
        $db->exec("UPDATE rubizh_stock_reservations r JOIN rubizh_customer_orders o ON o.id=r.order_id SET r.status='RELEASED' WHERE r.status='ACTIVE' AND o.status='cancelled' AND o.payment_status NOT IN ('paid','refunded')");
        $db->exec("INSERT INTO meta(k,v) VALUES('order_p0_schema','1') ON DUPLICATE KEY UPDATE v=VALUES(v)");
        $db->commit();
    }catch(Throwable $e){$db->rollBack();throw $e;}
}
