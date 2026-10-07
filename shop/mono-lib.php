<?php
declare(strict_types=1);
function monoConfigured(): bool {return cfg('mono_activation_confirmed')===true&&trim((string)(getenv('RUBIZH_MONO_TOKEN')?:cfg('mono_token')))!=='';}
function monoMigrate(PDO $db): void {static $ready=false;if($ready)return;
 $db->exec("CREATE TABLE IF NOT EXISTS rubizh_mono_invoices(id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,order_id BIGINT UNSIGNED NOT NULL,invoice_id VARCHAR(100) NULL UNIQUE,reference VARCHAR(100) NOT NULL UNIQUE,amount BIGINT UNSIGNED NOT NULL,status VARCHAR(24) NOT NULL DEFAULT 'creating',page_url VARCHAR(500) NOT NULL DEFAULT '',modified_at VARCHAR(40) NOT NULL DEFAULT '',refund_ref VARCHAR(100) NOT NULL DEFAULT '',refund_status VARCHAR(24) NOT NULL DEFAULT '',created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,INDEX(order_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
 $db->exec("CREATE TABLE IF NOT EXISTS rubizh_mono_events(event_hash CHAR(64) PRIMARY KEY,invoice_id VARCHAR(100) NOT NULL,status VARCHAR(24) NOT NULL,created_at DATETIME NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");$ready=true;
}
function monoApi(string $path,?array $body=null): array {
 if(defined('RUBIZH_MONO_TESTS')&&is_callable($GLOBALS['mono_test_transport']??null))return ($GLOBALS['mono_test_transport'])($path,$body);
 if(!monoConfigured())throw new RuntimeException('Карткову оплату ще не підключено.');
 $h=curl_init('https://api.monobank.ua/api/merchant/'.$path);try{curl_setopt_array($h,[CURLOPT_HTTPHEADER=>['X-Token: '.(string)(getenv('RUBIZH_MONO_TOKEN')?:cfg('mono_token')),'X-Cms: Rubizh','X-Cms-Version: 1.3','Content-Type: application/json'],CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>5,CURLOPT_TIMEOUT=>20,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2]);if($body!==null)curl_setopt_array($h,[CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>json_encode($body,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)]);$raw=curl_exec($h);$status=(int)curl_getinfo($h,CURLINFO_HTTP_CODE);}finally{curl_close($h);}if(!is_string($raw)||$status!==200)throw new RuntimeException('monobank не підтвердив результат. Перевірте рахунок перед повтором.');$r=json_decode($raw,true,64,JSON_THROW_ON_ERROR);if(!is_array($r))throw new RuntimeException('Неповна відповідь monobank.');return $r;
}
function monoMinor(mixed $amount): int {if(!is_numeric($amount)||(float)$amount<=0||(float)$amount>10000000)throw new RuntimeException('Неприпустима сума оплати.');return (int)round((float)$amount*100);}
function monoPageUrl(string $url): bool {$p=parse_url($url);return ($p['scheme']??'')==='https'&&in_array(strtolower($p['host']??''),['pay.mbnk.biz','pay.monobank.ua'],true)&&!isset($p['user'])&&!isset($p['pass']);}
function monoCreate(PDO $db,int $orderId): array {
 return npLocked($db,$orderId,function()use($db,$orderId){$order=npOrder($db,$orderId);if(in_array($order['payment_status'],['paid','refunded'],true)||in_array($order['status'],['cancelled','returned'],true))throw new RuntimeException('Це замовлення вже оплачене або закрите.');
 if(!shopPaymentReady($order))throw new RuntimeException('Дочекайтеся підтвердження наявності менеджером.');
 if(($order['contact']['payment']??'')!=='card')throw new RuntimeException('Для замовлення обрано інший спосіб оплати.');
 $q=$db->prepare('SELECT * FROM rubizh_mono_invoices WHERE order_id=? ORDER BY id DESC LIMIT 1');$q->execute([$orderId]);$last=$q->fetch(PDO::FETCH_ASSOC);
 if($last&&in_array($last['status'],['creating','unknown','created','processing','hold'],true)){if($last['page_url']!==''&&monoPageUrl($last['page_url']))return ['url'=>$last['page_url'],'invoice_id'=>$last['invoice_id']];throw new RuntimeException('Результат створення рахунку потребує звірки з monobank. Новий рахунок поки не створюємо.');}
 $reference=$order['order_number'].'-'.bin2hex(random_bytes(6));$amount=monoMinor($order['total']);$db->prepare("INSERT INTO rubizh_mono_invoices(order_id,reference,amount,status,created_at,updated_at) VALUES(?,?,?,'creating',UTC_TIMESTAMP(),UTC_TIMESTAMP())")->execute([$orderId,$reference,$amount]);$id=(int)$db->lastInsertId();
 $basket=[];$lines=json_decode($order['items_json'],true)?:[];$allocated=npLines($db,$orderId);
 foreach($lines as $i=>$l){$total=monoMinor($allocated[$i]['line_amount']??($l['price']*$l['qty']));$basket[]=['name'=>mb_substr($l['name'],0,128),'qty'=>(float)$l['qty'],'sum'=>(int)round($total/(float)$l['qty']),'total'=>$total,'unit'=>($l['sale_unit']??'')==='m2'?'м²':'шт.','code'=>$l['sku']];}
 try{$r=monoApi('invoice/create',['amount'=>$amount,'ccy'=>980,'merchantPaymInfo'=>['reference'=>$reference,'destination'=>'Замовлення '.$order['order_number'].' · РУБІЖ','basketOrder'=>$basket],'redirectUrl'=>'https://rubizh.shop/shop/payment-return.php?invoice='.$id,'webHookUrl'=>'https://rubizh.shop/shop/mono-webhook.php','validity'=>3600,'paymentType'=>'debit']);if(!is_string($r['invoiceId']??null)||!monoPageUrl((string)($r['pageUrl']??'')))throw new RuntimeException('Некоректний результат monobank.');$db->prepare("UPDATE rubizh_mono_invoices SET invoice_id=?,page_url=?,status='created',updated_at=UTC_TIMESTAMP() WHERE id=?")->execute([$r['invoiceId'],$r['pageUrl'],$id]);return ['url'=>$r['pageUrl'],'invoice_id'=>$r['invoiceId']];}
 catch(Throwable $e){$db->prepare("UPDATE rubizh_mono_invoices SET status='unknown',updated_at=UTC_TIMESTAMP() WHERE id=?")->execute([$id]);throw $e;}});
}
function monoVerifySignature(string $raw,string $signature,string $base64key): bool {
 $key=base64_decode($base64key,true);$sig=base64_decode($signature,true);if($key===false||$sig===false||strlen($sig)>256)return false;return @openssl_verify($raw,$sig,$key,OPENSSL_ALGO_SHA256)===1;
}
function monoPublicKey(PDO $db,bool $fresh=false): string {
 if(!$fresh){$key=$db->query("SELECT v FROM meta WHERE k='mono_public_key'")->fetchColumn();if(is_string($key)&&$key!=='')return $key;}
 $r=monoApi('pubkey');$key=(string)($r['key']??'');if(!openssl_pkey_get_public((string)base64_decode($key,true)))throw new RuntimeException('Неприпустимий відкритий ключ monobank.');$db->prepare("INSERT INTO meta(k,v) VALUES('mono_public_key',?) ON DUPLICATE KEY UPDATE v=VALUES(v)")->execute([$key]);return $key;
}
function monoValidateEvent(array $event,array $invoice): void {
 if(!is_string($event['invoiceId']??null)||$event['invoiceId']!==$invoice['invoice_id']||!is_int($event['amount']??null)||$event['amount']!==(int)$invoice['amount']||($event['ccy']??null)!==980)throw new RuntimeException('Рахунок, валюта або сума не збігаються.');
 if(!in_array($event['status']??'', ['created','processing','hold','success','failure','reversed','expired'],true))throw new RuntimeException('Невідомий статус оплати.');
 if(!is_string($event['modifiedDate']??null)||strtotime($event['modifiedDate'])===false)throw new RuntimeException('Немає часу зміни статусу.');
}
function monoApplyEvent(PDO $db,array $event,string $hash): void {
 $q=$db->prepare('SELECT * FROM rubizh_mono_invoices WHERE invoice_id=?');$q->execute([(string)($event['invoiceId']??'')]);$invoice=$q->fetch(PDO::FETCH_ASSOC);if(!$invoice)throw new RuntimeException('Рахунок ще не записаний. Повторіть callback.');monoValidateEvent($event,$invoice);
 npLocked($db,(int)$invoice['order_id'],function()use($db,$event,$hash,$invoice){$db->beginTransaction();try{
 $q=$db->prepare('SELECT * FROM rubizh_mono_invoices WHERE id=? FOR UPDATE');$q->execute([$invoice['id']]);$current=$q->fetch(PDO::FETCH_ASSOC);
 $q=$db->prepare('INSERT IGNORE INTO rubizh_mono_events(event_hash,invoice_id,status,created_at) VALUES(?,?,?,UTC_TIMESTAMP())');$q->execute([$hash,$event['invoiceId'],$event['status']]);if(!$q->rowCount()){$db->commit();return;}
 if(in_array($current['status'],['success','reversed'],true)&&!in_array($event['status'],['success','reversed'],true)){$db->commit();return;}
 if($current['status']==='reversed'&&$event['status']==='success'){$db->commit();return;}
 if($current['modified_at']!==''&&strtotime($event['modifiedDate'])<strtotime($current['modified_at'])){$db->commit();return;}
 $db->prepare('UPDATE rubizh_mono_invoices SET status=?,modified_at=?,updated_at=UTC_TIMESTAMP() WHERE id=?')->execute([$event['status'],$event['modifiedDate'],$invoice['id']]);
 if($event['status']==='success'){$u=$db->prepare("UPDATE rubizh_customer_orders SET payment_status='paid',updated_at=UTC_TIMESTAMP() WHERE id=? AND payment_status NOT IN ('paid','refunded')");$u->execute([$invoice['order_id']]);if($u->rowCount())shopQueueEvent($db,(int)$invoice['order_id'],'paid');}
 elseif(in_array($event['status'],['failure','expired'],true))$db->prepare("UPDATE rubizh_customer_orders SET payment_status='failed',updated_at=UTC_TIMESTAMP() WHERE id=? AND payment_status='pending'")->execute([$invoice['order_id']]);
 elseif($event['status']==='reversed'){$db->prepare("UPDATE rubizh_customer_orders SET payment_status='refunded',updated_at=UTC_TIMESTAMP() WHERE id=? AND payment_status='paid'")->execute([$invoice['order_id']]);$db->prepare("UPDATE rubizh_mono_invoices SET refund_status='success' WHERE id=?")->execute([$invoice['id']]);}
 npAudit($db,str_repeat('0',32),'mono_'.$event['status'],(int)$invoice['order_id']);$db->commit();}catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}});
}
function monoRefresh(PDO $db,array $invoice): void {if(!$invoice['invoice_id'])return;$e=monoApi('invoice/status?invoiceId='.rawurlencode($invoice['invoice_id']));monoApplyEvent($db,$e,hash('sha256',json_encode($e,JSON_THROW_ON_ERROR)));}
function monoRefund(PDO $db,int $orderId,string $actor): void {
 npLocked($db,$orderId,function()use($db,$orderId,$actor){$order=npOrder($db,$orderId);if($order['payment_status']!=='paid')throw new RuntimeException('Замовлення не оплачене.');$q=$db->prepare("SELECT * FROM rubizh_mono_invoices WHERE order_id=? AND status='success' ORDER BY id DESC LIMIT 1");$q->execute([$orderId]);$i=$q->fetch(PDO::FETCH_ASSOC);if(!$i||$i['refund_status']!=='')throw new RuntimeException('Повернення недоступне або вже обробляється.');$ref='refund-'.$i['id'].'-'.bin2hex(random_bytes(6));$db->prepare("UPDATE rubizh_mono_invoices SET refund_ref=?,refund_status='processing' WHERE id=?")->execute([$ref,$i['id']]);npAudit($db,$actor,'mono_refund_requested',$orderId,0,$ref);
 try{$items=[];$lines=json_decode($order['items_json'],true)?:[];foreach($lines as $l)$items[]=['code'=>$l['sku'],'qty'=>(float)$l['qty']];$r=monoApi('invoice/cancel',['invoiceId'=>$i['invoice_id'],'extRef'=>$ref,'amount'=>(int)$i['amount'],'items'=>$items]);if(!in_array($r['status']??'', ['success','processing','failure'],true))throw new RuntimeException('Невідомий результат повернення.');$db->prepare('UPDATE rubizh_mono_invoices SET refund_status=? WHERE id=?')->execute([$r['status'],$i['id']]);if($r['status']==='success')$db->prepare("UPDATE rubizh_customer_orders SET payment_status='refunded',updated_at=UTC_TIMESTAMP() WHERE id=? AND payment_status='paid'")->execute([$orderId]);npAudit($db,$actor,'mono_refund_'.$r['status'],$orderId,0,$ref);}
 catch(Throwable $e){$db->prepare("UPDATE rubizh_mono_invoices SET refund_status='unknown' WHERE id=?")->execute([$i['id']]);npAudit($db,$actor,'mono_refund_unknown',$orderId,0,$ref);throw $e;}});
}
function monoReconcile(PDO $db,int $orderId,string $invoiceId,string $actor): void {
 if(!preg_match('/^[A-Za-z0-9_-]{1,100}$/D',$invoiceId))throw new RuntimeException('Перевірте ID рахунку з кабінету monobank.');
 $event=monoApi('invoice/status?invoiceId='.rawurlencode($invoiceId));
 npLocked($db,$orderId,function()use($db,$orderId,$invoiceId,$event,$actor){$q=$db->prepare("SELECT * FROM rubizh_mono_invoices WHERE order_id=? AND status IN ('creating','unknown') ORDER BY id DESC LIMIT 1");$q->execute([$orderId]);$i=$q->fetch(PDO::FETCH_ASSOC);if(!$i)throw new RuntimeException('Немає невизначеного рахунку для звірки.');
 if(($event['reference']??'')!==$i['reference'])throw new RuntimeException('Рахунок має інший reference. Прив’язку відхилено.');$i['invoice_id']=$invoiceId;monoValidateEvent($event,$i);
 $db->prepare("UPDATE rubizh_mono_invoices SET invoice_id=?,page_url=?,status='created',updated_at=UTC_TIMESTAMP() WHERE id=?")->execute([$invoiceId,'https://pay.mbnk.biz/'.rawurlencode($invoiceId),$i['id']]);npAudit($db,$actor,'mono_invoice_reconciled',$orderId,0,$invoiceId);});monoApplyEvent($db,$event,hash('sha256',json_encode($event,JSON_THROW_ON_ERROR)));
}
