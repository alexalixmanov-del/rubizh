<?php
declare(strict_types=1);
final class CrmError extends RuntimeException {public function __construct(public readonly string $reason,public readonly int $status=400,public readonly array $details=[]){parent::__construct($reason);}}
function crmRolePermissions(string $role): array {
 $read=['order.view','customer.view','shipment.view','return.view','note.view','audit.view','report.view','search','settings.view'];
 $common=['order.assign.self','order.cancel','note.create','return.create','return.transition'];
 return array_values(array_unique([...shopRolePermissions($role),...(in_array($role,['OWNER','MANAGER','LOGISTICS','READ_ONLY'],true)?$read:[]),...match($role){'OWNER'=>[...$common,'order.assign.any','settings.manage','staff.manage','inventory.return'],'MANAGER'=>[...$common,'order.assign.any'],'LOGISTICS'=>['note.create','return.transition'],default=>[]}]));
}
function staffVerifiedRole(string $actor): ?string {return ($GLOBALS['crm_staff_actor']['id']??null)===$actor?($GLOBALS['crm_staff_actor']['role']??null):null;}
function crmActor(PDO $db): array {
 $id=$_SESSION['staff_id']??null;if(!is_string($id)||time()-(int)($_SESSION['staff_login_at']??0)>28800||time()-(int)($_SESSION['staff_seen_at']??0)>1800)throw new CrmError('AUTH_REQUIRED',401);
 $q=$db->prepare('SELECT id,email,name,role,enabled,session_version FROM rubizh_staff_users WHERE id=?');$q->execute([$id]);$a=$q->fetch(PDO::FETCH_ASSOC);
 if(!$a||!(int)$a['enabled']||(int)$a['session_version']!==(int)($_SESSION['staff_version']??0))throw new CrmError('AUTH_REQUIRED',401);
 $q=$db->prepare('SELECT permission FROM rubizh_staff_permissions WHERE role=?');$q->execute([$a['role']]);$a['permissions']=$q->fetchAll(PDO::FETCH_COLUMN);unset($a['enabled'],$a['session_version']);$_SESSION['staff_seen_at']=time();return $GLOBALS['crm_staff_actor']=$a;
}
function crmPermit(array $actor,string $permission): void {if(!in_array($permission,$actor['permissions']??[],true))throw new CrmError('PERMISSION_DENIED',403,['permission'=>$permission]);if(in_array($permission,['payment.refund.execute','payment.manual_reconcile','order.price_override','order.total_override','settings.manage','staff.manage','inventory.return'],true)&&$actor['role']!=='OWNER')throw new CrmError('PERMISSION_DENIED',403);}
function crmRequestId(mixed $id): string {if(!is_string($id)||!preg_match('/^[a-f0-9]{32}$/D',$id))throw new CrmError('INVALID_REQUEST_ID');return $id;}
function crmAudit(PDO $db,?array $a,string $entity,string $id,string $action,array $old,array $new,string $reason='',?string $request=null,string $source='STAFF'): void {
 $db->prepare('INSERT INTO rubizh_staff_audit(actor_id,actor_role,source,entity,entity_id,action,before_json,after_json,reason,request_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP())')->execute([$a['id']??str_repeat('0',32),$a['role']??'SYSTEM',$source,$entity,$id,$action,json_encode($old,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE),json_encode($new,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE),$reason,$request??$GLOBALS['crm_request_id']??bin2hex(random_bytes(16))]);
}
function crmCsrf(array $b): void {if(!is_string($b['csrf']??null)||!hash_equals($_SESSION['staff_csrf']??'', $b['csrf']))throw new CrmError('CSRF_INVALID',403);
 if(isset($_SERVER['HTTP_ORIGIN'])){$actual=parse_url((string)$_SERVER['HTTP_ORIGIN']);$host=$_SERVER['HTTP_HOST']??'';$expected=($actual['host']??'').(isset($actual['port'])?':'.$actual['port']:'');if($expected!==$host||($actual['scheme']??'')!==((($_SERVER['HTTPS']??'')==='on')?'https':'http'))throw new CrmError('CSRF_INVALID',403);}}
function crmLogin(PDO $db,array $b): array {
 crmCsrf($b);$email=mb_strtolower(trim((string)($b['email']??'')));$password=$b['password']??'';if(!is_string($password)||strlen($password)>72||strlen($email)>254)throw new CrmError('LOGIN_FAILED',401);
 $ip=rubizhNetworkIdentity();$loginKey=hash('sha256',$ip.'|'.$email);
 $proofScope='staff-login:'.$loginKey;
 if(!rubizhRateCheck('staff-login-failed',$loginKey,8,900)&&!rubizhProofValid($proofScope,$b['rate_proof']??null)){
  $proof=rubizhProofIssue($proofScope);header('Retry-After: 1');throw new CrmError('CHECK_REQUIRED',428,['challenge'=>['nonce'=>$proof['nonce'],'bits'=>$proof['bits'],'purpose'=>'staff-login'],'continue_url'=>'/auth/staff-login.php']);
 }
 $q=$db->prepare('SELECT * FROM rubizh_staff_users WHERE email=?');$q->execute([$email]);$a=$q->fetch(PDO::FETCH_ASSOC);$verified=password_verify($password,$a['password_hash']??'$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi');
 if(!$a||!$verified||!(int)$a['enabled']){rubizhRateAllow('staff-login-failed',$loginKey,PHP_INT_MAX,900);crmAudit($db,null,'security',hash('sha256',$email),'login.failed',[],['ip_hash'=>hash('sha256',$ip)],'',null,'SYSTEM');throw new CrmError('LOGIN_FAILED',401);}
 session_regenerate_id(true);$_SESSION=['staff_id'=>$a['id'],'staff_version'=>(int)$a['session_version'],'staff_login_at'=>time(),'staff_seen_at'=>time(),'staff_csrf'=>bin2hex(random_bytes(32))];$actor=crmActor($db);crmAudit($db,$actor,'security',$a['id'],'login.success',[],['session_created'=>true]);return $actor;
}
