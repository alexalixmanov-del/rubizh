<?php
declare(strict_types=1);
require_once __DIR__.'/donation-target.php';
function shopWorkdayDeadline(string $utc,int $days): string {
 $d=new DateTimeImmutable($utc,new DateTimeZone('UTC'));$d=$d->setTimezone(new DateTimeZone('Europe/Kyiv'));$holidays=function_exists('cfg')?(cfg('bank_holidays')??[]):[];if(!is_array($holidays))$holidays=[];
 while($days>0){$d=$d->modify('+1 day');if((int)$d->format('N')<6&&!in_array($d->format('Y-m-d'),$holidays,true))$days--;}
 return $d->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
}
function shopDonationAmount(float $total): int {return (int)round($total*0.03,0,PHP_ROUND_HALF_UP);}
function shopPaymentReady(array $o): bool {return in_array($o['status']??'',['confirmed','processing','shipped','completed'],true)&&in_array($o['payment_status']??'',['pending','failed'],true);}
function shopStartPaymentTiming(PDO $db,array $o): void {
 $now=gmdate('Y-m-d H:i:s');$due=shopWorkdayDeadline($now,2);$remind=(new DateTimeImmutable($now,new DateTimeZone('UTC')))->modify('+24 hours')->format('Y-m-d H:i:s');
 $db->prepare('INSERT INTO rubizh_order_timing(order_id,payment_due,remind_at) VALUES(?,?,?) ON DUPLICATE KEY UPDATE payment_due=VALUES(payment_due),remind_at=VALUES(remind_at)')->execute([$o['id'],$due,$remind]);
 $db->prepare('UPDATE rubizh_stock_reservations SET expires_at=? WHERE order_id=?')->execute([$due,$o['id']]);
 if(trim((string)($o['email']??''))!=='')shopQueueBuyerMail($db,(int)$o['id'],'confirmed');
}
function shopReceiptStage(array $o): string {return in_array($o['status']??'',['cancelled','returned'],true)||($o['payment_status']??'')==='refunded'?'cancelled':(($o['payment_status']??'')==='paid'?'paid':'pending');}
function shopLifecycleMigrate(PDO $db): void {
 static $ready=false;if($ready)return;
 $db->exec("CREATE TABLE IF NOT EXISTS rubizh_order_timing(order_id BIGINT UNSIGNED PRIMARY KEY,payment_due DATETIME NOT NULL,remind_at DATETIME NOT NULL,paid_at DATETIME NULL,INDEX(payment_due)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
 $db->exec("CREATE TABLE IF NOT EXISTS rubizh_stock_reservations(order_id BIGINT UNSIGNED NOT NULL,sku VARCHAR(64) NOT NULL,qty DECIMAL(12,2) NOT NULL,expires_at DATETIME NOT NULL,PRIMARY KEY(order_id,sku),INDEX(sku,expires_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
 $db->exec("CREATE TABLE IF NOT EXISTS rubizh_buyer_mail(order_id BIGINT UNSIGNED NOT NULL,event VARCHAR(64) NOT NULL,status VARCHAR(12) NOT NULL DEFAULT 'pending',attempts INT NOT NULL DEFAULT 0,next_at DATETIME NOT NULL,locked_at DATETIME NULL,error VARCHAR(240) NOT NULL DEFAULT '',PRIMARY KEY(order_id,event),INDEX(status,next_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
 $width=$db->query("SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='rubizh_buyer_mail' AND COLUMN_NAME='event'")->fetchColumn();if($width!==false&&(int)$width<64)$db->exec('ALTER TABLE rubizh_buyer_mail MODIFY event VARCHAR(64) NOT NULL');
 $db->exec("CREATE TABLE IF NOT EXISTS rubizh_donation_batches(id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,operation_key CHAR(32) NOT NULL UNIQUE,amount INT UNSIGNED NOT NULL,transferred_at DATETIME NOT NULL,reference VARCHAR(240) NOT NULL,image_mime VARCHAR(32) NOT NULL,image_data MEDIUMBLOB NOT NULL,created_by CHAR(32) NOT NULL,created_at DATETIME NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
 $db->exec("CREATE TABLE IF NOT EXISTS rubizh_order_donations(order_id BIGINT UNSIGNED PRIMARY KEY,amount INT UNSIGNED NOT NULL,paid_at DATETIME NOT NULL,due_at DATETIME NOT NULL,batch_id BIGINT UNSIGNED NULL,sent_at DATETIME NULL,sent_by CHAR(32) NULL,INDEX(batch_id,sent_at),INDEX(due_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");$ready=true;
}
function shopEnsureTiming(PDO $db,array $o): array {
 $q=$db->prepare('SELECT * FROM rubizh_order_timing WHERE order_id=?');$q->execute([$o['id']]);$t=$q->fetch(PDO::FETCH_ASSOC);if($t)return $t;
 $due=shopWorkdayDeadline($o['created_at'],2);$remind=(new DateTimeImmutable($o['created_at'],new DateTimeZone('UTC')))->modify('+24 hours')->format('Y-m-d H:i:s');
 $db->prepare('INSERT IGNORE INTO rubizh_order_timing(order_id,payment_due,remind_at) VALUES(?,?,?)')->execute([$o['id'],$due,$remind]);$q->execute([$o['id']]);return $q->fetch(PDO::FETCH_ASSOC);
}
function shopReserveLines(PDO $db,int $id,array $lines,string $expires): void {
 $totals=[];foreach($lines as $l)$totals[$l['sku']]=($totals[$l['sku']]??0)+(float)$l['qty'];foreach($totals as $sku=>$qty)$db->prepare('INSERT INTO rubizh_stock_reservations(order_id,sku,qty,expires_at) VALUES(?,?,?,?)')->execute([$id,$sku,$qty,$expires]);
}
function shopReservedQty(PDO $db,string $sku): float {
 $q=$db->prepare("SELECT COALESCE(SUM(r.qty),0) FROM rubizh_stock_reservations r JOIN rubizh_customer_orders o ON o.id=r.order_id WHERE r.sku=? AND r.expires_at>UTC_TIMESTAMP() AND o.payment_status IN ('pending','failed','cod') AND o.status IN ('new','confirmed','processing')");$q->execute([$sku]);return (float)$q->fetchColumn();
}
function shopQueueBuyerMail(PDO $db,int $order,string $event,string $shipment=''): void {if(!in_array($event,['confirmed','paid','reminder','cancelled','shipped','arrived','received'],true)||($shipment!==''&&!preg_match('/^\d{14}$/D',$shipment)))throw new InvalidArgumentException('mail event');$event.=$shipment!==''?':'.$shipment:'';$db->prepare('INSERT IGNORE INTO rubizh_buyer_mail(order_id,event,next_at) VALUES(?,?,UTC_TIMESTAMP())')->execute([$order,$event]);}
function shopRecordPaid(PDO $db,int $id): void {
 $o=npOrder($db,$id);if(($o['payment_status']??'')!=='paid')return;$t=shopEnsureTiming($db,$o);
 if(empty($t['paid_at'])){$now=$o['updated_at']??gmdate('Y-m-d H:i:s');$q=$db->prepare("SELECT modified_at FROM rubizh_mono_invoices WHERE order_id=? AND status='success' ORDER BY modified_at LIMIT 1");$q->execute([$id]);$bank=$q->fetchColumn();if(is_string($bank)&&$bank!==''&&strtotime($bank)!==false)$now=(new DateTimeImmutable($bank))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');else{$q=$db->prepare("SELECT confirmed_at FROM rubizh_np_order_confirmations WHERE order_id=? AND payment_proof<>''");$q->execute([$id]);$confirmed=$q->fetchColumn();if(is_string($confirmed)&&$confirmed!=='')$now=$confirmed;}if($now<$o['created_at']||$now>gmdate('Y-m-d H:i:s'))$now=gmdate('Y-m-d H:i:s');$db->prepare('UPDATE rubizh_order_timing SET paid_at=? WHERE order_id=? AND paid_at IS NULL')->execute([$now,$id]);$t['paid_at']=$now;}
 if(!in_array($o['status'],['cancelled','returned'],true)){$db->prepare('INSERT IGNORE INTO rubizh_order_donations(order_id,amount,paid_at,due_at) VALUES(?,?,?,?)')->execute([$id,shopDonationAmount((float)$o['total']),$t['paid_at'],shopWorkdayDeadline($t['paid_at'],3)]);shopQueueBuyerMail($db,$id,'paid');}
 // A late bank payment on a cancelled order remains visible to the manager; no donation is accrued.
}
function shopDonationText(int $amount,bool $paid,string $brigade=''): string {$brigade=shopDonationTarget($brigade);return ($paid?'':'Після оплати '.$amount.' ₴ підуть на '.$brigade.'. ').'Протягом 3 робочих днів після оплати надішлемо скрін переказу на '.$brigade.' у Viber або Telegram. Ваш внесок — '.$amount.' ₴.';}
function shopDonationForOrder(PDO $db,int $id): ?array {
 $q=$db->prepare("SELECT d.*,b.transferred_at,b.reference FROM rubizh_order_donations d LEFT JOIN rubizh_donation_batches b ON b.id=d.batch_id JOIN rubizh_customer_orders o ON o.id=d.order_id WHERE d.order_id=? AND o.payment_status='paid' AND o.status NOT IN ('cancelled','returned')");$q->execute([$id]);$d=$q->fetch(PDO::FETCH_ASSOC);if(!$d)return null;return ['amount'=>(int)$d['amount'],'due_at'=>$d['due_at'],'sent_at'=>$d['sent_at'],'transferred_at'=>$d['transferred_at'],'proof_url'=>$d['batch_id']?'/shop/donation-proof.php?order='.$id:''];
}
function shopOrderReceipt(PDO $db,int $id): array {
 $o=npOrder($db,$id);$t=shopEnsureTiming($db,$o);if($o['payment_status']==='paid')shopRecordPaid($db,$id);$stage=shopReceiptStage($o);$ready=shopPaymentReady($o);
 require_once __DIR__.'/../api/seller.php';$s=rubizhSeller();$c=$o['contact'];$due=new DateTimeImmutable($t['payment_due'],new DateTimeZone('UTC'));
 return ['id'=>$id,'number'=>$o['order_number'],'total'=>(float)$o['total'],'items'=>$o['items'],'lines'=>$o['items'],'delivery'=>$o['delivery_label'],'status'=>$o['status'],'payment_status'=>$o['payment_status'],'payment_method'=>$c['payment']??'invoice','was_paid'=>!empty($t['paid_at'])||in_array($o['payment_status'],['paid','refunded'],true),'stage'=>$stage,'payment_ready'=>$ready,'title'=>$stage==='pending'&&!$ready?'Замовлення отримано — очікуйте підтвердження':['pending'=>'Наявність підтверджено — можна оплатити','paid'=>'Замовлення оформлено','cancelled'=>'Скасовано'][$stage],
 'payment_due'=>$ready?$due->format('c'):'','payment_due_label'=>$ready?$due->setTimezone(new DateTimeZone('Europe/Kyiv'))->format('d.m.Y H:i'):'','payment_url'=>'/shop/payment-return.php?order='.$id,'seller'=>$s,'brigade'=>shopDonationBrigade($c),'donation_amount'=>shopDonationAmount((float)$o['total']),'donation_text'=>$stage==='cancelled'?'Внесок за скасованим або поверненим замовленням не нараховується.':shopDonationText(shopDonationAmount((float)$o['total']),$stage==='paid',shopDonationBrigade($c)),'donation'=>shopDonationForOrder($db,$id),'donation_channel'=>$c['donation_channel']??'viber'];
}
function shopLifecycleTick(PDO $db,int $limit=30): void {
 $rows=$db->query("SELECT o.* FROM rubizh_customer_orders o LEFT JOIN rubizh_order_timing t ON t.order_id=o.id WHERE t.order_id IS NULL AND o.status IN ('new','confirmed','processing') ORDER BY o.id DESC LIMIT ".max(1,min(100,$limit)))->fetchAll(PDO::FETCH_ASSOC);foreach($rows as $o)shopEnsureTiming($db,$o);
 $rows=$db->query("SELECT o.id,t.payment_due,t.remind_at FROM rubizh_customer_orders o JOIN rubizh_order_timing t ON t.order_id=o.id WHERE o.status IN ('confirmed','processing') AND o.payment_status IN ('pending','failed') AND (t.remind_at<=UTC_TIMESTAMP() OR t.payment_due<=UTC_TIMESTAMP()) ORDER BY t.payment_due LIMIT ".max(1,min(100,$limit)))->fetchAll(PDO::FETCH_ASSOC);
 foreach($rows as $r){$id=(int)$r['id'];try{if($r['payment_due']<=gmdate('Y-m-d H:i:s')){
 $q=$db->prepare("SELECT * FROM rubizh_mono_invoices WHERE order_id=? AND status IN ('created','processing','hold')");$q->execute([$id]);foreach($q->fetchAll(PDO::FETCH_ASSOC) as $i)monoRefresh($db,$i);
 // Never cancel while a bank operation or a shipment remains unresolved.
 if(shopNoOpenCardInvoice($db,$id)){shopCancelOrder($db,$id);shopQueueBuyerMail($db,$id,'cancelled');}
 }else shopQueueBuyerMail($db,$id,'reminder');}catch(Throwable $e){error_log('rubizh payment deadline: order '.$id.' needs reconciliation');}}
 $rows=$db->query("SELECT o.id FROM rubizh_customer_orders o LEFT JOIN rubizh_order_donations d ON d.order_id=o.id WHERE o.payment_status='paid' AND o.status NOT IN ('cancelled','returned') AND d.order_id IS NULL ORDER BY o.id DESC LIMIT ".max(1,min(100,$limit)))->fetchAll(PDO::FETCH_COLUMN);foreach($rows as $id)shopRecordPaid($db,(int)$id);
}
function shopSendBuyerMail(PDO $db,int $limit=5): int {
 require_once __DIR__.'/../auth/mailer.php';$db->exec("UPDATE rubizh_buyer_mail SET status='failed',locked_at=NULL,error='Перевищено кількість спроб надсилання' WHERE status='sending' AND attempts>=5 AND locked_at<UTC_TIMESTAMP()-INTERVAL 5 MINUTE");$rows=$db->query("SELECT * FROM rubizh_buyer_mail WHERE attempts<5 AND ((status='pending' AND next_at<=UTC_TIMESTAMP()) OR (status='sending' AND locked_at<UTC_TIMESTAMP()-INTERVAL 5 MINUTE)) ORDER BY next_at LIMIT ".max(1,min(10,$limit)))->fetchAll(PDO::FETCH_ASSOC);$sent=0;
 foreach($rows as $r){$q=$db->prepare("UPDATE rubizh_buyer_mail SET status='sending',attempts=attempts+1,locked_at=UTC_TIMESTAMP() WHERE order_id=? AND event=? AND attempts<5 AND ((status='pending' AND next_at<=UTC_TIMESTAMP()) OR (status='sending' AND locked_at<UTC_TIMESTAMP()-INTERVAL 5 MINUTE))");$q->execute([$r['order_id'],$r['event']]);if(!$q->rowCount())continue;
 try{$o=npOrder($db,(int)$r['order_id']);$stage=shopReceiptStage($o);[$event,$tracking]=array_pad(explode(':',$r['event'],2),2,'');if(($event==='paid'&&$stage!=='paid')||(in_array($event,['confirmed','reminder'],true)&&(!shopPaymentReady($o)||$o['payment_status']==='cod'))||($event==='cancelled'&&$stage!=='cancelled')||(in_array($event,['shipped','arrived','received'],true)&&$stage==='cancelled')){$db->prepare("UPDATE rubizh_buyer_mail SET status='skipped',locked_at=NULL WHERE order_id=? AND event=?")->execute([$r['order_id'],$r['event']]);continue;}
 if($tracking!==''&&in_array($event,['shipped','arrived'],true)){$later=$event==='shipped'?['arrived','received']:['received'];$q=$db->prepare('SELECT 1 FROM rubizh_order_timeline WHERE order_id=? AND event_key=? AND event IN ('.implode(',',array_fill(0,count($later),'?')).') LIMIT 1');$q->execute([$r['order_id'],$tracking,...$later]);if($q->fetchColumn()){$db->prepare("UPDATE rubizh_buyer_mail SET status='skipped',locked_at=NULL WHERE order_id=? AND event=?")->execute([$r['order_id'],$r['event']]);continue;}}
 $t=shopEnsureTiming($db,$o);$o['mail_event']=$event;if(in_array($event,['shipped','arrived','received'],true)){$ships=npShipments($db,(int)$r['order_id']);$o['split_delivery']=count(array_filter($ships,fn($ship)=>!in_array($ship['status'],['cancelled','returned'],true)))>1;$o['shipments']=$tracking!==''?array_values(array_filter($ships,fn($ship)=>$ship['tracking_number']===$tracking)):$ships;if(!$o['shipments']||array_filter($o['shipments'],fn($ship)=>in_array($ship['status'],['cancelled','returned'],true)||($event!=='received'&&$ship['status']==='delivered'))){$db->prepare("UPDATE rubizh_buyer_mail SET status='skipped',locked_at=NULL WHERE order_id=? AND event=?")->execute([$r['order_id'],$r['event']]);continue;}}$o['payment_method']=$o['contact']['payment']??'';$o['payment_due']=$t['payment_due'];$o['shipping_paid_to_carrier']=true;$o['donation_amount']=shopDonationAmount((float)$o['total']);rubizhSendOrder($o['email'],(string)(authConfig()['noreply_password']??''),$o);
 $db->prepare("UPDATE rubizh_buyer_mail SET status='sent',locked_at=NULL,error='' WHERE order_id=? AND event=?")->execute([$r['order_id'],$r['event']]);$sent++;
 }catch(Throwable $e){error_log('rubizh buyer mail: '.$e->getMessage());$db->prepare("UPDATE rubizh_buyer_mail SET status=IF(attempts>=5,'failed','pending'),locked_at=NULL,error='SMTP не підтвердив надсилання',next_at=UTC_TIMESTAMP()+INTERVAL 5 MINUTE WHERE order_id=? AND event=?")->execute([$r['order_id'],$r['event']]);}}
 return $sent;
}
