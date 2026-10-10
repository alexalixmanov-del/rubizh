<?php
declare(strict_types=1);

class ShopPermissionException extends RuntimeException {}
function shopRolePermissions(string $role): array {
    $financial=['payment.view','payment.invoice.create','payment.invoice.resend','payment.refund.request','payment.refund.execute','payment.manual_reconcile','order.price_override','order.total_override','financial.audit.view'];
    return match($role){
        'OWNER'=>[...$financial,'order.confirm','shipment.manage'],
        'MANAGER'=>['payment.view','payment.invoice.create','payment.invoice.resend','order.confirm'],
        'LOGISTICS'=>['payment.view','shipment.manage'],
        'READ_ONLY'=>['payment.view'],
        default=>[],
    };
}
function shopStaffRole(string $actor): string {
    if(!preg_match('/^[a-f0-9]{32}$/D',$actor))return '';
    $verified=function_exists('staffVerifiedRole')?staffVerifiedRole($actor):null;
    if(in_array($verified,['OWNER','MANAGER','LOGISTICS','READ_ONLY'],true))return $verified;
    $roles=cfg('staff_roles');$role=is_array($roles)?($roles[$actor]??''):'';
    if(in_array($role,['OWNER','MANAGER','LOGISTICS','READ_ONLY'],true))return $role;
    // Preserve existing verified-email managers, without granting financial corrections/refunds.
    $allowed=cfg('np_manager_emails');if(!is_array($allowed))return '';
    $allowed=array_map(fn($v)=>strtolower(trim((string)$v)),$allowed);
    foreach(customerIdentities($actor) as $i){
        $email=$i['provider']==='email'?$i['subject']:($i['provider']==='google'?$i['contact_email']:'');
        if($email!==''&&in_array(strtolower($email),$allowed,true))return 'MANAGER';
    }
    return '';
}
function shopRequirePermission(string $actor,string $permission): void {
    $role=shopStaffRole($actor);
    if(!in_array($permission,shopRolePermissions($role),true))throw new ShopPermissionException('Недостатньо прав: '.$permission);
    if(in_array($permission,['payment.manual_reconcile','order.price_override','order.total_override'],true)&&$role!=='OWNER')throw new ShopPermissionException('Потрібні права власника.');
}
function shopFinancialReason(string $reason): string {
    $reason=trim($reason);
    if(mb_strlen($reason)<6||mb_strlen($reason)>400||preg_match('/[\x00-\x1f\x7f]/u',$reason))throw new InvalidArgumentException('Вкажіть причину фінансової операції (6–400 символів).');
    return $reason;
}
function shopOrderAudit(PDO $db,int $order,string $actor,string $action,array $old,array $new,string $reason,string $source='USER'): void {
    $db->prepare('INSERT INTO rubizh_order_audit(order_id,actor_id,actor_role,source,action,reason,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?,?,UTC_TIMESTAMP())')
        ->execute([$order,$actor,$source==='USER'?shopStaffRole($actor):'SYSTEM',$source,$action,$reason,json_encode($old,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE),json_encode($new,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE)]);
}
function shopFinancialAudit(PDO $db,int $order,string $actor): array {
    shopRequirePermission($actor,'financial.audit.view');
    $q=$db->prepare('SELECT * FROM rubizh_order_audit WHERE order_id=? ORDER BY id');$q->execute([$order]);return $q->fetchAll(PDO::FETCH_ASSOC);
}
