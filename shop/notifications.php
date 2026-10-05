<?php
declare(strict_types=1);
function shopNotificationMigrate(PDO $db): void {
 static $done=false;if($done)return;
 $db->exec("CREATE TABLE IF NOT EXISTS rubizh_notifications(id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,order_id BIGINT UNSIGNED NOT NULL,event VARCHAR(32) NOT NULL,channel VARCHAR(12) NOT NULL,status VARCHAR(16) NOT NULL DEFAULT 'pending',attempts INT NOT NULL DEFAULT 0,sent_parts INT NOT NULL DEFAULT 0,next_at DATETIME NOT NULL,locked_at DATETIME NULL,error VARCHAR(240) NOT NULL DEFAULT '',updated_at DATETIME NOT NULL,UNIQUE KEY event_once(order_id,event,channel),INDEX(status,next_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");$done=true;
}
function shopQueueEvent(PDO $db,int $order,string $event): void {
 if(!in_array($event,['new_order','paid','cancelled'],true))throw new RuntimeException('Невідома подія.');
 if($event==='paid'&&function_exists('shopRecordPaid'))shopRecordPaid($db,$order);
 foreach(['telegram','email'] as $channel)$db->prepare('INSERT IGNORE INTO rubizh_notifications(order_id,event,channel,next_at,updated_at) VALUES(?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())')->execute([$order,$event,$channel]);
}
function shopNotificationText(array $order,array $supplierLines,string $event): string {
 $c=$order['contact'];$suppliers=array_column($supplierLines,'supplier_code','line_no');$items=json_decode($order['items_json'],true)?:[];
 $text=(['new_order'=>'НОВЕ ЗАМОВЛЕННЯ','paid'=>'ОПЛАТУ ПІДТВЕРДЖЕНО','cancelled'=>'ПОКУПЕЦЬ СКАСУВАВ'][$event]??$event).' '.$order['order_number']."\nСума: ".number_format((float)$order['total'],2,',',' ')." ₴\n";
 foreach($items as $i=>$l)$text.="\n".($i+1).'. '.($l['name']??'').' · '.($l['sku']??'').' · '.trim(($l['size']??'').' / '.($l['color']??''),' /').' · '.($l['qty']??'').(($l['sale_unit']??'')==='m2'?' м²':' шт.').' · постачальник: '.(($suppliers[$i]??'')?:'Потрібне уточнення');
 return $text."\n\n".(($c['recipient']??'')?:$c['name'])."\n".$c['phone']."\n".$order['delivery_label']."\nОплата: ".($c['payment']??'')."\nКоментар: ".($c['comment']??'')."\nhttps://rubizh.shop/shop/np-manager.php?order=".(int)$order['id'];
}
function shopTelegramParts(string $text): array {
 $out=[];while(mb_strlen($text)>3500){$chunk=mb_substr($text,0,3500);$cut=mb_strrpos($chunk,"\n");$cut=$cut!==false&&$cut>2000?$cut:3500;$out[]=mb_substr($text,0,$cut);$text=mb_substr($text,$cut);}if($text!=='')$out[]=$text;return $out;
}
function shopTelegramSend(string $part,?string $target=null): void {
 $token=trim((string)cfg('tg_bot_token'));$chat=$target??(string)cfg('tg_chat_id');if(!preg_match('/^\d+:[A-Za-z0-9_-]+$/D',$token)||$chat==='')throw new RuntimeException('Telegram не налаштовано.');
 $h=curl_init('https://api.telegram.org/bot'.$token.'/sendMessage');try{curl_setopt_array($h,[CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>json_encode(['chat_id'=>$chat,'text'=>$part,'disable_web_page_preview'=>true],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),CURLOPT_HTTPHEADER=>['Content-Type: application/json'],CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>5,CURLOPT_TIMEOUT=>15,CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2]);$raw=curl_exec($h);$status=curl_getinfo($h,CURLINFO_HTTP_CODE);}finally{curl_close($h);} $r=is_string($raw)?json_decode($raw,true):null;if($status!==200||empty($r['ok']))throw new RuntimeException('Telegram не підтвердив надсилання.');
}
function shopSendNotifications(PDO $db,int $limit=10): int {
 $db->exec("UPDATE rubizh_notifications SET status='failed',locked_at=NULL,error='Остання спроба не завершилась; перевірте доставку перед ручним повтором' WHERE status='sending' AND attempts>=5 AND locked_at<UTC_TIMESTAMP()-INTERVAL 5 MINUTE");
 $rows=$db->query("SELECT * FROM rubizh_notifications WHERE attempts<5 AND ((status='pending' AND next_at<=UTC_TIMESTAMP()) OR(status='sending' AND locked_at<UTC_TIMESTAMP()-INTERVAL 5 MINUTE)) ORDER BY id LIMIT ".max(1,min(20,$limit)))->fetchAll(PDO::FETCH_ASSOC);$sent=0;
 foreach($rows as $n){$claim=$db->prepare("UPDATE rubizh_notifications SET status='sending',attempts=attempts+1,locked_at=UTC_TIMESTAMP() WHERE id=? AND attempts<5 AND ((status='pending' AND next_at<=UTC_TIMESTAMP()) OR(status='sending' AND locked_at<UTC_TIMESTAMP()-INTERVAL 5 MINUTE))");$claim->execute([$n['id']]);if(!$claim->rowCount())continue;
 try{$order=npOrder($db,(int)$n['order_id']);$text=shopNotificationText($order,npLines($db,(int)$n['order_id']),$n['event']);
 if($n['channel']==='telegram'){foreach(shopTelegramParts($text) as $i=>$part){if($i<(int)$n['sent_parts'])continue;shopTelegramSend($part);$db->prepare('UPDATE rubizh_notifications SET sent_parts=? WHERE id=?')->execute([$i+1,$n['id']]);}}
 else{require_once __DIR__.'/../auth/mailer.php';$recipient=(string)(cfg('order_notification_email')?:'zakaz@rubizh.shop');rubizhSendEmail($recipient,(string)(authConfig()['noreply_password']??''),['subject'=>'РУБІЖ · '.$order['order_number'].' · '.$n['event'],'plain'=>$text,'html'=>rubizhEmailLayout($order['order_number'],'<div style="color:#EDEFEA;white-space:pre-wrap">'.rubizhEmailEsc($text).'</div>')]);}
 $db->prepare("UPDATE rubizh_notifications SET status='sent',locked_at=NULL,error='',updated_at=UTC_TIMESTAMP() WHERE id=?")->execute([$n['id']]);$sent++;
 }catch(Throwable $e){$db->prepare("UPDATE rubizh_notifications SET status=IF(attempts>=5,'failed','pending'),locked_at=NULL,error='Надсилання не підтверджено; перевірте налаштування каналу',next_at=UTC_TIMESTAMP()+INTERVAL 5 MINUTE,updated_at=UTC_TIMESTAMP() WHERE id=?")->execute([$n['id']]);}}
 return $sent;
}
