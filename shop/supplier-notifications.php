<?php
declare(strict_types=1);
function supplierMigrate(PDO $db): void {
 static $ready=false;if($ready)return;
 $db->exec("CREATE TABLE IF NOT EXISTS rubizh_supplier_skus(order_id BIGINT UNSIGNED NOT NULL,line_no SMALLINT UNSIGNED NOT NULL,supplier_sku VARCHAR(120) NOT NULL,updated_at DATETIME NOT NULL,PRIMARY KEY(order_id,line_no)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
 $db->exec("CREATE TABLE IF NOT EXISTS rubizh_supplier_dispatch(shipment_id BIGINT UNSIGNED PRIMARY KEY,order_id BIGINT UNSIGNED NOT NULL,supplier_code VARCHAR(32) NOT NULL,channel VARCHAR(12) NOT NULL DEFAULT '',recipient VARCHAR(240) NOT NULL DEFAULT '',payload_json MEDIUMTEXT NULL,status VARCHAR(16) NOT NULL DEFAULT 'blocked',attempts INT NOT NULL DEFAULT 0,sent_parts INT NOT NULL DEFAULT 0,next_at DATETIME NOT NULL,locked_at DATETIME NULL,sent_at DATETIME NULL,ack_at DATETIME NULL,ack_by CHAR(32) NULL,error VARCHAR(240) NOT NULL DEFAULT '',created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,INDEX(status,next_at),INDEX(order_id,shipment_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");$db->exec("INSERT IGNORE INTO meta(k,v) VALUES('supplier_dispatch_since',UTC_TIMESTAMP())");$ready=true;
}
function supplierSkuRows(PDO $db,int $order): array {$q=$db->prepare('SELECT line_no,supplier_sku FROM rubizh_supplier_skus WHERE order_id=?');$q->execute([$order]);return array_column($q->fetchAll(PDO::FETCH_ASSOC),'supplier_sku','line_no');}
function supplierSaveSkus(PDO $db,int $order,array $input,string $actor): void {
 npLocked($db,$order,function()use($db,$order,$input,$actor){$valid=array_column(npLines($db,$order),null,'line_no');$changes=[];
 foreach($input as $no=>$sku){if(!isset($valid[$no]))throw new RuntimeException('Невідома позиція замовлення.');$sku=shopSettingsText($sku,120);if($sku==='')continue;$changes[(int)$no]=$sku;}
 $db->beginTransaction();try{foreach($changes as $no=>$sku)$db->prepare('INSERT INTO rubizh_supplier_skus(order_id,line_no,supplier_sku,updated_at) VALUES(?,?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE supplier_sku=VALUES(supplier_sku),updated_at=UTC_TIMESTAMP()')->execute([$order,$no,$sku]);npAudit($db,$actor,'supplier_skus_saved',$order);$db->commit();}catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}});
}
function supplierPayload(array $order,array $shipment,array $native): array {
 $items=[];$all=$order['items'];foreach(json_decode((string)$shipment['lines_json'],true)?:[] as $part){$no=(int)$part['line_no'];$line=$all[$no]??null;$sku=trim((string)($native[$no]??''));if(!$line||$sku==='')throw new RuntimeException('Вкажіть артикул постачальника для кожної позиції посилки.');$items[]=['name'=>(string)$line['name'],'supplier_sku'=>$sku,'size'=>(string)($line['size']??''),'color'=>(string)($line['color']??''),'qty'=>(float)$part['qty'],'sale_unit'=>$line['sale_unit']??'piece'];}
 if(!$items||!preg_match('/^\d{14}$/D',(string)$shipment['tracking_number']))throw new RuntimeException('Посилка ще не має підтвердженої ТТН.');
 return ['order_number'=>(string)$order['order_number'],'tracking_number'=>(string)$shipment['tracking_number'],'items'=>$items,'request'=>'Просимо передати цю посилку Новій пошті сьогодні. Якщо це неможливо, погодьте строк із менеджером магазину.'];
}
function supplierText(array $p): string {
 $s='РУБІЖ · замовлення '.$p['order_number']."\nТТН: ".$p['tracking_number']."\n".$p['request']."\n";
 foreach($p['items'] as $i)$s.="\n".$i['name'].' · арт. '.$i['supplier_sku'].' · '.trim($i['size'].' / '.$i['color'],' /').' · '.$i['qty'].($i['sale_unit']==='m2'?' м²':' шт.');
 return $s."\n\nПісля передачі підтвердьте «передано» менеджеру магазину.";
}
function supplierEnsureDispatch(PDO $db,int $order,int $ship): void {
 $q=$db->prepare('SELECT * FROM rubizh_order_shipments WHERE order_id=? AND id=?');$q->execute([$order,$ship]);$s=$q->fetch(PDO::FETCH_ASSOC);if(!$s||empty($s['tracking_number'])||in_array($s['status'],['cancelled','returned','error'],true))return;
 $code=$s['supplier_code'];$c=(cfg('supplier_contacts')??[])[$code]??[];$status='pending';$error='';$payload=null;$native=supplierSkuRows($db,$order);$o=npOrder($db,$order);$map=cfg('supplier_sku_map')??[];
 foreach($o['items'] as $no=>$line)if(!isset($native[$no])&&isset($map[$line['sku']??'']))$native[$no]=$map[$line['sku']];
 foreach($o['items'] as $no=>$line){$a=$o['contact']['supplier_articles'][$no]??null;if(!isset($native[$no])&&is_array($a)&&npSupplierCode('', '',(string)($a['supplier_name']??''))===$code&&!empty($a['supplier_sku']))$native[$no]=(string)$a['supplier_sku'];}
 try{if(empty($c['enabled'])||empty($c['recipient']))throw new RuntimeException('Налаштуйте й увімкніть контакт постачальника.');$payload=supplierPayload($o,$s,$native);}catch(RuntimeException $e){$status='blocked';$error=$e->getMessage();}
 $db->prepare("INSERT IGNORE INTO rubizh_supplier_dispatch(shipment_id,order_id,supplier_code,channel,recipient,payload_json,status,error,next_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP())")->execute([$ship,$order,$code,$c['channel']??'',$c['recipient']??'',$payload?json_encode($payload,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR):null,$status,$error]);
 if($status==='pending')$db->prepare("UPDATE rubizh_supplier_dispatch SET channel=?,recipient=?,payload_json=?,status='pending',error='',next_at=UTC_TIMESTAMP(),updated_at=UTC_TIMESTAMP() WHERE shipment_id=? AND status='blocked' AND attempts=0 AND ack_at IS NULL")->execute([$c['channel'],$c['recipient'],json_encode($payload,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$ship]);
}
function supplierEnsurePending(PDO $db): void {
 $q=$db->query("SELECT s.id,s.order_id FROM rubizh_order_shipments s LEFT JOIN rubizh_supplier_dispatch d ON d.shipment_id=s.id WHERE s.tracking_number IS NOT NULL AND s.status IN ('created','sent','manual') AND s.created_at>=(SELECT v FROM meta WHERE k='supplier_dispatch_since') AND (d.shipment_id IS NULL OR (d.status='blocked' AND d.attempts=0 AND d.ack_at IS NULL)) ORDER BY s.id LIMIT 50");foreach($q->fetchAll(PDO::FETCH_ASSOC) as $s)supplierEnsureDispatch($db,(int)$s['order_id'],(int)$s['id']);
}
function supplierSendPending(PDO $db,int $limit=10): int {
 $db->exec("UPDATE rubizh_supplier_dispatch SET status='failed',locked_at=NULL,error='Перервано п’яту спробу; перевірте доставку повідомлення' WHERE status='sending' AND attempts>=5 AND locked_at<UTC_TIMESTAMP()-INTERVAL 5 MINUTE");
 $db->exec("UPDATE rubizh_supplier_dispatch d JOIN rubizh_order_shipments s ON s.id=d.shipment_id SET d.status='cancelled',d.updated_at=UTC_TIMESTAMP() WHERE s.status IN ('cancelled','returned','error') AND d.status IN ('pending','blocked')");
 $rows=$db->query("SELECT * FROM rubizh_supplier_dispatch WHERE ack_at IS NULL AND attempts<5 AND ((status='pending' AND next_at<=UTC_TIMESTAMP()) OR (status='sending' AND locked_at<UTC_TIMESTAMP()-INTERVAL 5 MINUTE)) ORDER BY shipment_id LIMIT ".max(1,min(20,$limit)))->fetchAll(PDO::FETCH_ASSOC);$sent=0;
 foreach($rows as $n){$claim=$db->prepare("UPDATE rubizh_supplier_dispatch SET status='sending',attempts=attempts+1,locked_at=UTC_TIMESTAMP() WHERE shipment_id=? AND ack_at IS NULL AND attempts<5 AND ((status='pending' AND next_at<=UTC_TIMESTAMP()) OR (status='sending' AND locked_at<UTC_TIMESTAMP()-INTERVAL 5 MINUTE))");$claim->execute([$n['shipment_id']]);if(!$claim->rowCount())continue;
 try{$c=(cfg('supplier_contacts')??[])[$n['supplier_code']]??[];if(empty($c['enabled'])||($c['recipient']??'')!==$n['recipient']||($c['channel']??'')!==$n['channel'])throw new RuntimeException('Контакт змінено або канал вимкнено.');$q=$db->prepare('SELECT status FROM rubizh_order_shipments WHERE id=?');$q->execute([$n['shipment_id']]);if(in_array($q->fetchColumn(),['cancelled','returned','error'],true))throw new RuntimeException('Посилку скасовано.');$text=supplierText(json_decode((string)$n['payload_json'],true,32,JSON_THROW_ON_ERROR));
 if($n['channel']==='telegram'){foreach(shopTelegramParts($text) as $i=>$part){if($i<(int)$n['sent_parts'])continue;if(defined('RUBIZH_SUPPLIER_TESTS')&&isset($GLOBALS['supplier_test_transport']))($GLOBALS['supplier_test_transport'])('telegram',$n['recipient'],$part);else shopTelegramSend($part,$n['recipient']);$db->prepare('UPDATE rubizh_supplier_dispatch SET sent_parts=? WHERE shipment_id=?')->execute([$i+1,$n['shipment_id']]);}}
 elseif($n['channel']==='email'){if(defined('RUBIZH_SUPPLIER_TESTS')&&isset($GLOBALS['supplier_test_transport']))($GLOBALS['supplier_test_transport'])('email',$n['recipient'],$text);else{require_once __DIR__.'/../auth/mailer.php';rubizhSendEmail($n['recipient'],(string)(authConfig()['noreply_password']??''),['subject'=>'РУБІЖ · ТТН '.json_decode($n['payload_json'],true)['tracking_number'],'plain'=>$text,'html'=>rubizhEmailLayout('Посилка РУБІЖ','<div style="white-space:pre-wrap">'.rubizhEmailEsc($text).'</div>')]);}}else throw new RuntimeException('Невідомий канал.');
 $db->prepare("UPDATE rubizh_supplier_dispatch SET status='sent',sent_at=UTC_TIMESTAMP(),locked_at=NULL,error='',updated_at=UTC_TIMESTAMP() WHERE shipment_id=?")->execute([$n['shipment_id']]);$sent++;
 }catch(Throwable $e){$db->prepare("UPDATE rubizh_supplier_dispatch SET status=IF(attempts>=5,'failed','pending'),locked_at=NULL,error='Доставку не підтверджено; перевірте канал перед ручним повтором',next_at=UTC_TIMESTAMP()+INTERVAL 5 MINUTE,updated_at=UTC_TIMESTAMP() WHERE shipment_id=?")->execute([$n['shipment_id']]);}}
 return $sent;
}
function supplierAcknowledge(PDO $db,int $order,int $ship,string $actor): void {
 npLocked($db,$order,function()use($db,$order,$ship,$actor){supplierEnsureDispatch($db,$order,$ship);$q=$db->prepare('UPDATE rubizh_supplier_dispatch SET ack_at=UTC_TIMESTAMP(),ack_by=?,updated_at=UTC_TIMESTAMP() WHERE order_id=? AND shipment_id=? AND ack_at IS NULL');$q->execute([$actor,$order,$ship]);if($q->rowCount())npAudit($db,$actor,'supplier_handed_over',$order,$ship);});
}
function supplierLate(array $row,?int $now=null): bool {return empty($row['ack_at'])&&!in_array($row['status'],['cancelled'],true)&&strtotime($row['created_at'].' UTC')<($now??time())-86400;}
