<?php
declare(strict_types=1);
// Staff security (stage 4, ТЗ §8): session registry (list / revoke / deactivate), TOTP with backup codes,
// step-up freshness, password policy and one-time invite / reset links. Secrets never leave the server in clear,
// except the TOTP secret shown once during enrolment.

const CRM_SESSION_IDLE=1800;
const CRM_SESSION_ABSOLUTE=43200; // OD-4.4: 12 h
const CRM_STEP_UP_DEFAULT=900;

// Without crm_ip_salt the hash is keyed by the CRM secret key, never unsalted (R4-13).
function crmClientIpHash(): string {$salt=(string)cfg('crm_ip_salt');if($salt===''){try{$salt=hash('sha256','ip|'.crmSecretKey());}catch(Throwable $e){$salt='';}}return hash('sha256',$salt.'|'.rubizhNetworkIdentity());}
function crmAgent(): string {return mb_substr(preg_replace('/[\x00-\x1f\x7f]/u','',(string)($_SERVER['HTTP_USER_AGENT']??'')),0,160);}
function crmSessionKey(): string {return hash('sha256',session_id());}

function crmSessionRegister(PDO $db,string $staff): void {
 $db->prepare('INSERT INTO rubizh_staff_sessions(id,staff_id,created_at,seen_at,ip_hash,agent) VALUES(?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP(),?,?) ON DUPLICATE KEY UPDATE staff_id=VALUES(staff_id),seen_at=VALUES(seen_at),revoked_at=NULL')->execute([crmSessionKey(),$staff,crmClientIpHash(),crmAgent()]);
}
/** A session row that was revoked (logout elsewhere, deactivation, password change) ends this session immediately. */
function crmSessionAlive(PDO $db,string $staff): bool {
 $q=$db->prepare('SELECT revoked_at,seen_at FROM rubizh_staff_sessions WHERE id=? AND staff_id=?');$q->execute([crmSessionKey(),$staff]);$r=$q->fetch(PDO::FETCH_ASSOC);
 if(!$r||$r['revoked_at']!==null)return false;
 if(strtotime($r['seen_at'].' UTC')<time()-60)$db->prepare('UPDATE rubizh_staff_sessions SET seen_at=UTC_TIMESTAMP() WHERE id=?')->execute([crmSessionKey()]);
 return true;
}
function crmSessionsRevoke(PDO $db,string $staff,?string $except=null): void {
 $db->prepare('UPDATE rubizh_staff_sessions SET revoked_at=UTC_TIMESTAMP() WHERE staff_id=? AND revoked_at IS NULL AND id<>?')->execute([$staff,$except??'']);
}
function crmSessionsList(PDO $db,string $staff): array {
 $rows=crmQuery($db,'SELECT id,created_at,seen_at,agent FROM rubizh_staff_sessions WHERE staff_id=? AND revoked_at IS NULL AND seen_at>UTC_TIMESTAMP()-INTERVAL 12 HOUR ORDER BY seen_at DESC LIMIT 50',[$staff]);
 return ['rows'=>array_map(fn($r)=>['id'=>substr($r['id'],0,12),'current'=>hash_equals($r['id'],crmSessionKey()),'created_at'=>$r['created_at'],'seen_at'=>$r['seen_at'],'agent'=>$r['agent']],$rows)];
}

/** Step-up: a password (and TOTP when enabled) re-entry within the window. */
function crmFreshUntil(): ?int {$at=(int)($_SESSION['staff_fresh_at']??0);return $at?$at+max(60,(int)(cfg('staff_stepup_seconds')??CRM_STEP_UP_DEFAULT)):null;}
function crmRequireFresh(): void {if((crmFreshUntil()??0)<time())throw new CrmError('STEP_UP_REQUIRED',401);}

// ---- password policy -------------------------------------------------------------------------------------------
function crmWeakPasswords(): array {
 return ['123456789012','1234567890123','qwertyuiop12','qwerty123456','password1234','password12345','passw0rd1234','1q2w3e4r5t6y','1qaz2wsx3edc','qazwsxedcrfv','zaq12wsxcde3','iloveyou1234','admin1234567','administrator','111111111111','000000000000','123123123123','abcdefghijkl','abc123456789','letmein12345','welcome12345','monkey123456','dragon123456','football1234','superman1234','baseball1234','sunshine1234','princess1234','trustno11234','starwars1234','whatever1234','qwertyqwerty','asdfghjkl123','zxcvbnm12345','йцукенгшщзхї','пароль123456','україна12345','slavaukraini','slavaukraini1','heroyamslava','rubizh123456','rubizhrubizh','rubizh.shop1','shop12345678','manager12345','owner1234567','changeme1234','temp12345678','test12345678','secret123456'];
}
function crmPasswordPolicy(string $password,string $email=''): void {
 $len=mb_strlen($password);$lower=mb_strtolower($password);
 if($len<12||strlen($password)>72)throw new CrmError('WEAK_PASSWORD',400,['rule'=>'LENGTH']);
 if(in_array($lower,crmWeakPasswords(),true))throw new CrmError('WEAK_PASSWORD',400,['rule'=>'COMMON']);
 if(preg_match('/^(.)\1+$/u',$password)||count(array_unique(mb_str_split($password)))<5)throw new CrmError('WEAK_PASSWORD',400,['rule'=>'REPEATED']);
 $local=mb_strtolower(explode('@',$email)[0]??'');if(mb_strlen($local)>=4&&str_contains($lower,$local))throw new CrmError('WEAK_PASSWORD',400,['rule'=>'EMAIL']);
}
function crmPasswordHash(string $password): string {
 return defined('PASSWORD_ARGON2ID')?password_hash($password,PASSWORD_ARGON2ID):password_hash($password,PASSWORD_BCRYPT,['cost'=>12]);
}

// ---- TOTP (RFC 6238, SHA-1, 30 s, 6 digits, ±1 step, replay-protected) ---------------------------------------------
function crmSecretKey(): string {
 $k=base64_decode((string)(getenv('RUBIZH_CRM_SECRET_KEY')?:cfg('crm_secret_key')),true);
 if(!is_string($k)||strlen($k)!==SODIUM_CRYPTO_SECRETBOX_KEYBYTES)throw new CrmError('CRM_SECRET_KEY_MISSING',503);
 return $k;
}
function crmSeal(string $plain): string {$n=random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);return base64_encode($n.sodium_crypto_secretbox($plain,$n,crmSecretKey()));}
function crmUnseal(string $sealed): string {$raw=base64_decode($sealed,true);$p=$raw===false?false:sodium_crypto_secretbox_open(substr($raw,SODIUM_CRYPTO_SECRETBOX_NONCEBYTES),substr($raw,0,SODIUM_CRYPTO_SECRETBOX_NONCEBYTES),crmSecretKey());if($p===false)throw new CrmError('TOTP_UNAVAILABLE',503);return $p;}
function crmBase32(string $bin): string {$a='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';$bits='';foreach(str_split($bin) as $c)$bits.=str_pad(decbin(ord($c)),8,'0',STR_PAD_LEFT);$out='';foreach(str_split($bits,5) as $chunk)$out.=$a[bindec(str_pad($chunk,5,'0'))];return $out;}
function crmBase32Decode(string $s): string {$a='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';$bits='';foreach(str_split(strtoupper($s)) as $c){$i=strpos($a,$c);if($i===false)continue;$bits.=str_pad(decbin($i),5,'0',STR_PAD_LEFT);}$out='';foreach(str_split($bits,8) as $b)if(strlen($b)===8)$out.=chr(bindec($b));return $out;}
function crmTotpCode(string $secretBase32,int $step): string {
 $h=hash_hmac('sha1',pack('J',$step),crmBase32Decode($secretBase32),true);$o=ord($h[19])&0xf;
 $v=((ord($h[$o])&0x7f)<<24)|(ord($h[$o+1])<<16)|(ord($h[$o+2])<<8)|ord($h[$o+3]);return str_pad((string)($v%1000000),6,'0',STR_PAD_LEFT);
}
function crmTotpRow(PDO $db,string $staff): ?array {return crmOne($db,'SELECT * FROM rubizh_staff_totp WHERE staff_id=?',[$staff]);}
function crmTotpEnabled(PDO $db,string $staff): bool {$r=crmTotpRow($db,$staff);return $r!==null&&$r['enabled_at']!==null;}
function crmTotpRequired(string $role): bool {return cfg('crm_totp_required')!==false&&in_array($role,['OWNER','ACCOUNTANT'],true);}
/** Verifies a TOTP code or a single-use backup code; the accepted time step is recorded so a code cannot be replayed. */
function crmTotpVerify(PDO $db,string $staff,?string $code,?string $backup): bool {
 $r=crmTotpRow($db,$staff);if(!$r||$r['enabled_at']===null)return false;
 if(is_string($backup)&&$backup!==''){
  $codes=json_decode((string)$r['backup_json'],true)?:[];
  // The code is consumed only if nobody consumed one in between (compare-and-set): a code works exactly once.
  foreach($codes as $i=>$hash)if(password_verify($backup,$hash)){unset($codes[$i]);$q=$db->prepare('UPDATE rubizh_staff_totp SET backup_json=?,updated_at=UTC_TIMESTAMP() WHERE staff_id=? AND backup_json=?');$q->execute([json_encode(array_values($codes)),$staff,(string)$r['backup_json']]);return $q->rowCount()===1;}
  return false;
 }
 if(!is_string($code)||!preg_match('/^\d{6}$/D',$code))return false;
 $secret=crmUnseal($r['secret_enc']);$now=intdiv(time(),30);
 foreach([0,-1,1] as $d){$step=$now+$d;if($step<=(int)$r['last_step'])continue;if(hash_equals(crmTotpCode($secret,$step),$code)){$q=$db->prepare('UPDATE rubizh_staff_totp SET last_step=?,updated_at=UTC_TIMESTAMP() WHERE staff_id=? AND last_step<?');$q->execute([$step,$staff,$step]);return $q->rowCount()===1;}}
 return false;
}
/** R4-07: attaching an authenticator needs a grant from provisioning, an invite/reset link or the server CLI — never the password alone. */
function crmEnrollGrant(PDO $db,string $staff,string $by): void {
 $db->prepare("INSERT INTO rubizh_staff_invites(token_hash,kind,staff_id,email,name,role,created_by,expires_at,created_at) SELECT ?,'enroll',id,email,name,role,?,UTC_TIMESTAMP()+INTERVAL 72 HOUR,UTC_TIMESTAMP() FROM rubizh_staff_users WHERE id=?")->execute([hash('sha256',random_bytes(32)),$by,$staff]);
}
function crmEnrollGrantOpen(PDO $db,string $staff): bool {return (bool)crmOne($db,"SELECT id FROM rubizh_staff_invites WHERE kind='enroll' AND staff_id=? AND used_at IS NULL AND expires_at>UTC_TIMESTAMP()",[$staff]);}
function crmTotpSetup(PDO $db,array $actor): array {
 if(crmTotpEnabled($db,$actor['id']))throw new CrmError('TOTP_ALREADY_ENABLED',409);
 if(!crmEnrollGrantOpen($db,$actor['id']))throw new CrmError('TOTP_ENROLL_GRANT_REQUIRED',403);
 $secret=crmBase32(random_bytes(20));
 $db->prepare('INSERT INTO rubizh_staff_totp(staff_id,secret_enc,updated_at) VALUES(?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE secret_enc=VALUES(secret_enc),enabled_at=NULL,last_step=0,backup_json=NULL,updated_at=VALUES(updated_at)')->execute([$actor['id'],crmSeal($secret)]);
 crmAudit($db,$actor,'security',$actor['id'],'totp.setup',[],['started'=>true]);
 return ['secret'=>$secret,'otpauth_uri'=>'otpauth://totp/'.rawurlencode('RUBIZH CRM:'.$actor['email']).'?secret='.$secret.'&issuer=RUBIZH%20CRM&digits=6&period=30'];
}
function crmTotpEnable(PDO $db,array $actor,string $code): array {
 $r=crmTotpRow($db,$actor['id']);if(!$r)throw new CrmError('TOTP_SETUP_REQUIRED',409);if($r['enabled_at']!==null)throw new CrmError('TOTP_ALREADY_ENABLED',409);
 $secret=crmUnseal($r['secret_enc']);$now=intdiv(time(),30);$ok=null;
 foreach([0,-1,1] as $d)if(hash_equals(crmTotpCode($secret,$now+$d),$code))$ok=$now+$d;
 if($ok===null)throw new CrmError('TOTP_INVALID',400);
 $codes=[];$hashes=[];for($i=0;$i<10;$i++){$c=substr(bin2hex(random_bytes(4)),0,4).'-'.substr(bin2hex(random_bytes(4)),0,4);$codes[]=$c;$hashes[]=password_hash($c,PASSWORD_BCRYPT,['cost'=>10]);}
 $db->prepare('UPDATE rubizh_staff_totp SET enabled_at=UTC_TIMESTAMP(),last_step=?,backup_json=?,updated_at=UTC_TIMESTAMP() WHERE staff_id=?')->execute([$ok,json_encode($hashes),$actor['id']]);
 $db->prepare("UPDATE rubizh_staff_invites SET used_at=UTC_TIMESTAMP() WHERE kind='enroll' AND staff_id=? AND used_at IS NULL")->execute([$actor['id']]);crmAudit($db,$actor,'security',$actor['id'],'totp.enable',[],['enabled'=>true,'backup_codes'=>10]);
 $_SESSION['staff_totp_ok']=true;$_SESSION['staff_fresh_at']=time();
 return ['backup_codes'=>$codes];
}

// ---- one-time links (invite / password reset) --------------------------------------------------------------------
function crmTokenIssue(PDO $db,array $actor,string $kind,array $who): array {
 $token=rtrim(strtr(base64_encode(random_bytes(32)),'+/','-_'),'=');$ttl=$kind==='invite'?72*3600:2*3600;
 $expires=gmdate('Y-m-d H:i:s',time()+$ttl);
 $db->prepare('UPDATE rubizh_staff_invites SET used_at=UTC_TIMESTAMP() WHERE email=? AND used_at IS NULL AND kind=?')->execute([$who['email'],$kind]);
 $db->prepare('INSERT INTO rubizh_staff_invites(token_hash,kind,staff_id,email,name,role,created_by,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,UTC_TIMESTAMP())')->execute([hash('sha256',$token),$kind,$who['id']??null,$who['email'],$who['name'],$who['role'],$actor['id'],$expires]);
 $url=rtrim((string)(cfg('public_base_url')??''),'/').'/crm/accept?token='.$token;
 $delivery=crmAdapterSend('email',['to'=>$who['email'],'template'=>'staff_'.$kind,'url'=>$url]);
 return ['url'=>$url,'expires_at'=>$expires,'delivery'=>$delivery];
}
function crmTokenAccept(PDO $db,string $token,string $password): array {
 return crmTransaction($db,function()use($db,$token,$password){
  $t=crmOne($db,'SELECT * FROM rubizh_staff_invites WHERE token_hash=? FOR UPDATE',[hash('sha256',$token)]);
  if(!$t||$t['used_at']!==null||strtotime($t['expires_at'].' UTC')<time())throw new CrmError('TOKEN_INVALID',400);
  crmPasswordPolicy($password,$t['email']);
  if($t['kind']==='invite'){
   if(crmOne($db,'SELECT id FROM rubizh_staff_users WHERE email=?',[$t['email']]))throw new CrmError('STAFF_EXISTS',409);
   $id=bin2hex(random_bytes(16));
   $db->prepare('INSERT INTO rubizh_staff_users(id,email,name,password_hash,role,created_at,updated_at) VALUES(?,?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())')->execute([$id,$t['email'],$t['name'],crmPasswordHash($password),$t['role']]);
  }else{
   $id=$t['staff_id'];$u=crmOne($db,'SELECT id FROM rubizh_staff_users WHERE id=? FOR UPDATE',[$id]);if(!$u)throw new CrmError('TOKEN_INVALID',400);
   $db->prepare('UPDATE rubizh_staff_users SET password_hash=?,session_version=session_version+1,updated_at=UTC_TIMESTAMP() WHERE id=?')->execute([crmPasswordHash($password),$id]);crmSessionsRevoke($db,$id);
  }
  $db->prepare('UPDATE rubizh_staff_invites SET used_at=UTC_TIMESTAMP() WHERE id=?')->execute([$t['id']]);crmEnrollGrant($db,$id,str_repeat('0',32)); // the link proved the mailbox: enrolment allowed for 72 h
  crmAudit($db,['id'=>$id,'role'=>$t['role']],'staff',$id,'staff.token.'.$t['kind'],[],['email'=>$t['email'],'role'=>$t['role']],'Одноразове посилання використано');
  return ['done'=>true];
 });
}
