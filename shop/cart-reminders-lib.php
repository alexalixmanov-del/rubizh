<?php
declare(strict_types=1);
// A reminder is requested explicitly, sent once after 24h of inactivity, and never creates an order.
function shopCartReminderMigrate(PDO $db): void {if(function_exists('rubizhSchemaPrepared')&&rubizhSchemaPrepared($db))return;
 static $ready=false;if($ready)return;
 $db->exec("CREATE TABLE IF NOT EXISTS rubizh_cart_reminders(scope_hash CHAR(64) PRIMARY KEY,customer_id CHAR(32) NULL,email VARCHAR(254) NOT NULL,email_hash CHAR(64) NOT NULL,items_json TEXT NOT NULL,recovery_code CHAR(64) NOT NULL UNIQUE,status VARCHAR(12) NOT NULL DEFAULT 'pending',attempts INT NOT NULL DEFAULT 0,created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,next_at DATETIME NOT NULL,expires_at DATETIME NOT NULL,locked_at DATETIME NULL,sent_at DATETIME NULL,error VARCHAR(240) NOT NULL DEFAULT '',INDEX(status,next_at),INDEX(email_hash,sent_at),INDEX(customer_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");$ready=true;
}
function shopCartReminderEmail(mixed $email): string {
 if(!is_string($email))throw new RuntimeException('Вкажіть email для нагадування.');
 $email=strtolower(trim($email));if(strlen($email)>254||!filter_var($email,FILTER_VALIDATE_EMAIL)||preg_match('/[\r\n<>]/',$email))throw new RuntimeException('Вкажіть коректний email для нагадування.');return $email;
}
function shopCartRemindersEnabled(): bool {return cfg('cart_reminders_enabled')!==false&&trim((string)(authConfig()['noreply_password']??''))!=='';}
function shopCartReminderStatus(PDO $db,string $scope): array {
 $q=$db->prepare('SELECT status,email,expires_at FROM rubizh_cart_reminders WHERE scope_hash=?');$q->execute([$scope]);$r=$q->fetch(PDO::FETCH_ASSOC);
 return ['active'=>$r&&$r['status']==='pending'&&$r['expires_at']>gmdate('Y-m-d H:i:s'),'email'=>$r['email']??'','status'=>$r['status']??'none'];
}
function shopCartReminderLock(PDO $db,string $kind,string $hash): string {
 $name='rzcart:'.$kind.':'.substr($hash,0,48);$q=$db->prepare('SELECT GET_LOCK(?,0)');$q->execute([$name]);
 if((int)$q->fetchColumn()!==1)throw new RuntimeException('Нагадування обробляється. Спробуйте трохи пізніше.');return $name;
}
function shopCartReminderUnlock(PDO $db,string $name): void {$db->prepare('SELECT RELEASE_LOCK(?)')->execute([$name]);}
function shopCartReminderSave(PDO $db,string $scope,?string $customer,array $input): array {
 if(($input['consent']??false)!==true)throw new RuntimeException('Підтвердьте, що хочете отримати нагадування.');
 if(!preg_match('/^[a-f0-9]{64}$/D',$scope))throw new RuntimeException('Оновіть оформлення.');
 $email=shopCartReminderEmail($input['email']??null);$hash=hash('sha256',$email);
 $raw=is_array($input['lines']??null)?$input['lines']:[];$resolved=shopResolvedLines($db,$raw);
 // Derive names, prices, quantities and sizes from the current catalogue; never trust browser prices.
 $items=[];foreach($resolved as $line)$items[]=['product_id'=>$line['product_id'],'sku'=>$line['sku'],'qty'=>$line['qty'],'kit_group'=>$line['kit_group']??''];
 $scopeLock=shopCartReminderLock($db,'scope',$scope);$emailLock=null;try{$emailLock=shopCartReminderLock($db,'email',$hash);
 $q=$db->prepare("SELECT 1 FROM rubizh_cart_reminders WHERE email_hash=? AND ((status IN ('pending','sending') AND scope_hash<>? AND expires_at>UTC_TIMESTAMP()) OR sent_at>UTC_TIMESTAMP()-INTERVAL 7 DAY) LIMIT 1");$q->execute([$hash,$scope]);
 if($q->fetchColumn())throw new RuntimeException('Для цього email нагадування вже заплановане або нещодавно надіслане.');
 $db->prepare("INSERT INTO rubizh_cart_reminders(scope_hash,customer_id,email,email_hash,items_json,recovery_code,created_at,updated_at,next_at,expires_at) VALUES(?,?,?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP()+INTERVAL 24 HOUR,UTC_TIMESTAMP()+INTERVAL 7 DAY) ON DUPLICATE KEY UPDATE recovery_code=IF(email_hash<>VALUES(email_hash) OR status IN ('sent','cancelled','converted','expired','failed'),VALUES(recovery_code),recovery_code),customer_id=VALUES(customer_id),email=VALUES(email),email_hash=VALUES(email_hash),items_json=VALUES(items_json),created_at=IF(status IN ('sent','cancelled','converted','expired','failed'),UTC_TIMESTAMP(),created_at),status='pending',attempts=0,updated_at=UTC_TIMESTAMP(),next_at=UTC_TIMESTAMP()+INTERVAL 24 HOUR,expires_at=UTC_TIMESTAMP()+INTERVAL 7 DAY,error=''")->execute([$scope,$customer,$email,$hash,json_encode($items,JSON_THROW_ON_ERROR),bin2hex(random_bytes(32))]);
 return shopCartReminderStatus($db,$scope);
 }finally{if($emailLock!==null)shopCartReminderUnlock($db,$emailLock);shopCartReminderUnlock($db,$scopeLock);}
}
function shopCartReminderCancel(PDO $db,string $scope,string $status='cancelled'): void {
 if(!in_array($status,['cancelled','converted'],true))throw new InvalidArgumentException('status');
 $db->prepare("UPDATE rubizh_cart_reminders SET status=?,locked_at=NULL WHERE scope_hash=? AND status IN ('pending','sending','sent')")->execute([$status,$scope]);
}
function shopCartRemindersConverted(PDO $db,string $scope,string $email,?string $customer): void {
 // Also cancel requests from other devices for the same buyer. An unpaid ORDER has its own reminder.
 $db->prepare("UPDATE rubizh_cart_reminders SET status='converted',locked_at=NULL WHERE status IN ('pending','sending') AND (scope_hash=? OR email_hash=? OR (? IS NOT NULL AND customer_id=?))")->execute([$scope,hash('sha256',strtolower($email)),$customer,$customer]);
}
function shopCartReminderCanSend(array $r,bool $hasOrder,bool $recentMail,int $now): bool {
 return in_array($r['status']??'',['pending','sending'],true)&&($r['attempts']??0)<5&&(new DateTimeImmutable($r['next_at'],new DateTimeZone('UTC')))->getTimestamp()<=$now&&(new DateTimeImmutable($r['expires_at'],new DateTimeZone('UTC')))->getTimestamp()>$now&&!$hasOrder&&!$recentMail;
}
function shopCartReminderRow(PDO $db,string $code): ?array {
 if(!preg_match('/^[a-f0-9]{64}$/D',$code))return null;
 $q=$db->prepare("SELECT * FROM rubizh_cart_reminders WHERE recovery_code=? AND expires_at>UTC_TIMESTAMP() AND status NOT IN ('cancelled','converted','expired')");$q->execute([$code]);return $q->fetch(PDO::FETCH_ASSOC)?:null;
}
function shopCartReminderCurrentItems(PDO $db,array $row): array {
 $raw=json_decode($row['items_json'],true,64,JSON_THROW_ON_ERROR);$items=[];
 foreach($raw as $line){try{foreach(shopResolvedLines($db,[$line]) as $resolved)$items[]=$resolved;}catch(RuntimeException $e){/* Removed variants are omitted, never restored as an order. */}}
 return $items;
}
function shopSendCartReminders(PDO $db,int $limit=5,?callable $send=null): int {
 $send??=static function(string $email,array $content):void{require_once __DIR__.'/../auth/mailer.php';rubizhSendEmail($email,(string)(authConfig()['noreply_password']??''),$content);};
 if(!shopCartRemindersEnabled())return 0;
 $db->exec("UPDATE rubizh_cart_reminders SET status='expired' WHERE expires_at<=UTC_TIMESTAMP() AND status IN ('pending','sending')");
 $db->exec("UPDATE rubizh_cart_reminders SET status='failed',locked_at=NULL,error='Потрібна перевірка доставки' WHERE status='sending' AND attempts>=5 AND locked_at<UTC_TIMESTAMP()-INTERVAL 5 MINUTE");
 $rows=$db->query("SELECT scope_hash FROM rubizh_cart_reminders WHERE attempts<5 AND expires_at>UTC_TIMESTAMP() AND ((status='pending' AND next_at<=UTC_TIMESTAMP()) OR (status='sending' AND locked_at<UTC_TIMESTAMP()-INTERVAL 5 MINUTE)) ORDER BY next_at LIMIT ".max(1,min(10,$limit)))->fetchAll(PDO::FETCH_COLUMN);$sent=0;
 foreach($rows as $scope){
  try{$lockName=shopCartReminderLock($db,'scope',$scope);}catch(RuntimeException $busy){continue;}$emailLock=null;
  try{
   $q=$db->prepare('SELECT * FROM rubizh_cart_reminders WHERE scope_hash=?');$q->execute([$scope]);$r=$q->fetch(PDO::FETCH_ASSOC);if(!$r)continue;
   try{$emailLock=shopCartReminderLock($db,'email',$r['email_hash']);}catch(RuntimeException $busy){continue;}
   $q=$db->prepare('SELECT 1 FROM rubizh_customer_orders WHERE LOWER(email)=? AND created_at>=? LIMIT 1');$q->execute([$r['email'],$r['created_at']]);$ordered=(bool)$q->fetchColumn();
   $q=$db->prepare('SELECT 1 FROM rubizh_cart_reminders WHERE email_hash=? AND sent_at>UTC_TIMESTAMP()-INTERVAL 7 DAY AND scope_hash<>? LIMIT 1');$q->execute([$r['email_hash'],$scope]);$recent=(bool)$q->fetchColumn();
   if(!shopCartReminderCanSend($r,$ordered,$recent,time())){if($ordered||$recent)shopCartReminderCancel($db,$scope,$ordered?'converted':'cancelled');continue;}
   $q=$db->prepare("UPDATE rubizh_cart_reminders SET status='sending',attempts=attempts+1,locked_at=UTC_TIMESTAMP() WHERE scope_hash=? AND attempts<5 AND ((status='pending' AND next_at<=UTC_TIMESTAMP()) OR (status='sending' AND locked_at<UTC_TIMESTAMP()-INTERVAL 5 MINUTE))");$q->execute([$scope]);if(!$q->rowCount())continue;
   $items=shopCartReminderCurrentItems($db,$r);if(!$items){shopCartReminderCancel($db,$scope);continue;}
   // Re-read status after resolving items, so checkout/clear-cart can cancel a claimed reminder.
   $q=$db->prepare('SELECT status FROM rubizh_cart_reminders WHERE scope_hash=?');$q->execute([$scope]);if($q->fetchColumn()!=='sending')continue;
   require_once __DIR__.'/../auth/email-templates.php';$send($r['email'],rubizhCartReminderEmail($items,$r['recovery_code']));
   $db->prepare("UPDATE rubizh_cart_reminders SET status=IF(status IN ('pending','sending'),'sent',status),sent_at=UTC_TIMESTAMP(),locked_at=NULL,error='' WHERE scope_hash=?")->execute([$scope]);$sent++;
  }catch(Throwable $e){error_log('rubizh cart reminder: delivery failed');$db->prepare("UPDATE rubizh_cart_reminders SET status=IF(attempts>=5,'failed','pending'),locked_at=NULL,next_at=UTC_TIMESTAMP()+INTERVAL 5 MINUTE,error='SMTP не підтвердив надсилання' WHERE scope_hash=? AND status='sending'")->execute([$scope]);}
  finally{if($emailLock!==null)shopCartReminderUnlock($db,$emailLock);shopCartReminderUnlock($db,$lockName);}
 }
 // Delete expired personal snapshots after one month; retain the 7-day delivery cooldown until then.
 $db->exec('DELETE FROM rubizh_cart_reminders WHERE expires_at<UTC_TIMESTAMP()-INTERVAL 30 DAY');return $sent;
}
