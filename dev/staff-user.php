<?php
declare(strict_types=1);
// Server-side staff provisioning (go-live: first OWNER) and recovery of a lost TOTP device. Passwords come from stdin only.
//   php dev/staff-user.php --email=… --name="…" --role=OWNER|MANAGER|WAREHOUSE|SUPPORT|ACCOUNTANT --reason="…"   (password on stdin)
//   php dev/staff-user.php --reset-totp --email=… --reason="…"   (removes 2FA, ends all sessions; next login enrols again)
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
define('RUBIZH_AUTH',true);require dirname(__DIR__).'/api/lib.php';require dirname(__DIR__).'/shop/store-lib.php';require_once dirname(__DIR__).'/staff/auth.php';require_once dirname(__DIR__).'/staff/schema.php';require_once dirname(__DIR__).'/staff/read.php';
try{
 $o=getopt('',['email:','name:','role:','reason:','reset-totp']);$email=mb_strtolower(trim((string)($o['email']??'')));$reason=shopFinancialReason((string)($o['reason']??''));
 if(!filter_var($email,FILTER_VALIDATE_EMAIL)||strlen($email)>254)throw new RuntimeException('Invalid account input');
 $db=rubizhDatabaseConnect(cfg());if(!crmSchemaReady($db))throw new RuntimeException('CRM migration required');
 if(isset($o['reset-totp'])){
  $u=crmOne($db,'SELECT id,role FROM rubizh_staff_users WHERE email=?',[$email]);if(!$u)throw new RuntimeException('Unknown staff member');
  $db->beginTransaction();
  try{$db->prepare('DELETE FROM rubizh_staff_totp WHERE staff_id=?')->execute([$u['id']]);$db->prepare('UPDATE rubizh_staff_users SET session_version=session_version+1,updated_at=UTC_TIMESTAMP() WHERE id=?')->execute([$u['id']]);
   if(crmApiTableExists($db,'rubizh_staff_sessions'))crmSessionsRevoke($db,$u['id']);
   crmAudit($db,null,'staff',$u['id'],'staff.totp_reset',[],['email'=>$email,'role'=>$u['role']],$reason,null,'SYSTEM');$db->commit();}
  catch(Throwable $e){$db->rollBack();throw $e;}
  echo json_encode(['id'=>$u['id'],'email'=>$email,'totp'=>'reset'],JSON_THROW_ON_ERROR)."\n";exit(0);
 }
 $role=crmRoleAlias((string)($o['role']??'MANAGER'));$name=trim((string)($o['name']??''));$password=rtrim((string)stream_get_contents(STDIN),"\r\n");
 if(mb_strlen($name)<2||mb_strlen($name)>120||!in_array($role,CRM_ROLES,true))throw new RuntimeException('Invalid account input');
 crmPasswordPolicy($password,$email);
 $id=bin2hex(random_bytes(16));$db->beginTransaction();
 try{$db->prepare('INSERT INTO rubizh_staff_users(id,email,name,password_hash,role,created_at,updated_at) VALUES(?,?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())')->execute([$id,$email,$name,crmPasswordHash($password),$role]);crmAudit($db,null,'staff',$id,'staff.provision',[],['email'=>$email,'role'=>$role],$reason,null,'SYSTEM');$db->commit();}
 catch(Throwable $e){$db->rollBack();throw $e;}
 unset($password);echo json_encode(['id'=>$id,'email'=>$email,'role'=>$role],JSON_THROW_ON_ERROR)."\n";
}catch(Throwable $e){$why=$e instanceof CrmError?$e->reason.(isset($e->details['rule'])?':'.$e->details['rule']:''):($e instanceof RuntimeException&&!$e instanceof PDOException?$e->getMessage():get_class($e));fwrite(STDERR,"Staff provisioning refused ($why). Validate input, permissions and schema; password must be provided through stdin (12–72 characters, not a common password, not your e-mail).\n");exit(1);}
