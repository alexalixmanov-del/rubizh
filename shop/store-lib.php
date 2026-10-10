<?php
declare(strict_types=1);
require_once __DIR__.'/catalog-lib.php';
require_once __DIR__.'/pricing.php';
require_once __DIR__.'/np-fulfillment.php';
require_once __DIR__.'/notifications.php';
require_once __DIR__.'/mono-lib.php';
require_once __DIR__.'/settings-lib.php';
require_once __DIR__.'/supplier-notifications.php';
require_once __DIR__.'/order-lifecycle.php';
require_once __DIR__.'/customer-ui.php';
require_once __DIR__.'/cart-reminders-lib.php';
require_once __DIR__.'/pim-v3-checkout.php';

function shopStoreDatabase(): PDO {
    $db=database();migrate($db);pimV3DetectColumns($db);if(rubizhSchemaPrepared($db))return $db;
    customerDatabase();$db=identityDatabase();shopNotificationMigrate($db);monoMigrate($db);shopLifecycleMigrate($db);shopUiMigrate($db);shopCartReminderMigrate($db);static $ready=false;
    if(!$ready){migrate($db);npMigrate($db);supplierMigrate($db);
        if((int)$db->query("SELECT v FROM meta WHERE k='rubizh_shop_schema'")->fetchColumn()>=1){$ready=true;return $db;}
        $db->exec("CREATE TABLE IF NOT EXISTS rubizh_favorites(customer_id CHAR(32) NOT NULL,product_id VARCHAR(64) NOT NULL,created_at DATETIME NOT NULL,PRIMARY KEY(customer_id,product_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        $db->exec("CREATE TABLE IF NOT EXISTS rubizh_shared_kits(code CHAR(32) PRIMARY KEY,lines_json TEXT NOT NULL,created_at DATETIME NOT NULL,expires_at DATETIME NOT NULL,INDEX(expires_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        $db->exec("CREATE TABLE IF NOT EXISTS rubizh_checkout_requests(request_id CHAR(32) PRIMARY KEY,scope_hash CHAR(64) NOT NULL,payload_hash CHAR(64) NOT NULL,order_id BIGINT UNSIGNED NOT NULL,created_at DATETIME NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        $db->exec("CREATE TABLE IF NOT EXISTS rubizh_order_details(order_id BIGINT UNSIGNED PRIMARY KEY,contact_json TEXT NOT NULL,subtotal DECIMAL(12,2) NOT NULL,discount_amount DECIMAL(12,2) NOT NULL,shipping_amount DECIMAL(12,2) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        $db->exec("CREATE TABLE IF NOT EXISTS rubizh_order_mail(order_id BIGINT UNSIGNED PRIMARY KEY,recipient VARCHAR(254) NOT NULL,status VARCHAR(12) NOT NULL DEFAULT 'pending',attempts INT NOT NULL DEFAULT 0,next_at DATETIME NOT NULL,locked_at DATETIME NULL,error VARCHAR(240) NOT NULL DEFAULT '',updated_at DATETIME NOT NULL,INDEX(status,next_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        $db->exec("CREATE TABLE IF NOT EXISTS rubizh_shop_limits(bucket CHAR(64) PRIMARY KEY,window_start BIGINT NOT NULL,hits INT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        $db->exec("INSERT INTO meta(k,v) VALUES('rubizh_shop_schema','1') ON DUPLICATE KEY UPDATE v='1'");$ready=true;
    }
    return $db;
}
function shopBody(): array {
    if((int)($_SERVER['CONTENT_LENGTH'] ?? 0)>65536)throw new RuntimeException('Запит надто великий.');
    $raw=file_get_contents('php://input',false,null,0,65537);
    if($raw===false || strlen($raw)>65536)throw new RuntimeException('Запит надто великий.');
    $data=json_decode($raw,true,64,JSON_THROW_ON_ERROR);
    if(!is_array($data))throw new RuntimeException('Перевірте дані запиту.');
    return $data;
}
function shopComment(array $input): string {
    $value=$input['comment'] ?? '';
    if(!is_string($value)||!mb_check_encoding($value,'UTF-8'))throw new RuntimeException('Перевірте коментар.');
    $value=trim(str_replace(["\r\n","\r"],"\n",$value));
    if(mb_strlen($value)>1500||preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u',$value))throw new RuntimeException('Коментар надто довгий або містить недопустимі символи.');
    return $value;
}
// Staging may add its own exact origins (and a loopback test origin); production keeps only rubizh.shop.
function shopAllowedOrigins(): array {
    $out=['https://rubizh.shop','https://www.rubizh.shop'];
    if(function_exists('cfg')&&cfg('environment')==='staging'){foreach((array)(cfg('staging_origins')??[]) as $o)if(is_string($o)&&preg_match('~^https?://[a-z0-9.-]+(?::\d+)?$~D',$o))$out[]=$o;
        if(cfg('staging_allow_loopback')===true&&isset($_SERVER['HTTP_ORIGIN'])&&preg_match('~^http://127\.0\.0\.1:\d+$~D',(string)$_SERVER['HTTP_ORIGIN']))$out[]=(string)$_SERVER['HTTP_ORIGIN'];}
    return $out;
}
function shopCsrf(array $input): void {
    if(!is_string($input['csrf'] ?? null) || !hash_equals($_SESSION['csrf'],$input['csrf']))shopJson(['ok'=>false,'error'=>'Оновіть сторінку та спробуйте ще раз.'],403);
    if(isset($_SERVER['HTTP_ORIGIN']) && !in_array($_SERVER['HTTP_ORIGIN'],shopAllowedOrigins(),true))shopJson(['ok'=>false,'error'=>'Недозволений запит.'],403);
}
function shopLimit(PDO $db,string $kind,int $max,int $window=3600): void {
    $key=hash('sha256',$kind.'|'.($_SERVER['REMOTE_ADDR'] ?? 'unknown'));$start=(int)(floor(time()/$window)*$window);
    $db->prepare('INSERT INTO rubizh_shop_limits(bucket,window_start,hits) VALUES(?,?,1) ON DUPLICATE KEY UPDATE hits=IF(window_start=VALUES(window_start),hits+1,1),window_start=VALUES(window_start)')->execute([$key,$start]);
    $q=$db->prepare('SELECT hits FROM rubizh_shop_limits WHERE bucket=?');$q->execute([$key]);if((int)$q->fetchColumn()>$max)shopJson(['ok'=>false,'error'=>'Забагато запитів. Спробуйте пізніше.'],429);
    if(random_int(1,64)===1)$db->prepare('DELETE FROM rubizh_shop_limits WHERE window_start<? LIMIT 500')->execute([time()-172800]);
}
function shopFavoriteIds(PDO $db,string $id): array {
    $q=$db->prepare('SELECT product_id FROM rubizh_favorites WHERE customer_id=? ORDER BY created_at DESC');$q->execute([$id]);return $q->fetchAll(PDO::FETCH_COLUMN);
}
function shopResolvedLines(PDO $db,array $input,bool $lock=false): array {
    if($lock)shopPricingCatalogVersion($db,true);
    if(!$input || count($input)>100)throw new RuntimeException('У кошику має бути від 1 до 100 позицій.');
    // Lock variants in the same order for all carts, even if customers add items
    // in opposite order. Output stays in the original order for kit discounts.
    if($lock){
        $skus=[];$productIds=[];foreach($input as $line){if(!is_array($line))throw new RuntimeException('Перевірте кошик.');$skus[]=customerField($line,'sku',64);$productIds[]=customerField($line,'product_id',64);}$skus=array_values(array_filter($skus,'strlen'));if(!$skus)$skus=[''];
        $productIds=array_values(array_unique($productIds));sort($productIds,SORT_STRING);
        $products=$db->prepare('SELECT id FROM products WHERE id IN ('.implode(',',array_fill(0,count($productIds),'?')).') ORDER BY id FOR UPDATE');$products->execute($productIds);$products->fetchAll();
        $skus=array_values(array_unique($skus));sort($skus,SORT_STRING);
        $prelock=$db->prepare('SELECT sku FROM variants WHERE sku IN ('.implode(',',array_fill(0,count($skus),'?')).') ORDER BY sku FOR UPDATE');$prelock->execute($skus);$prelock->fetchAll();
    }
    $resolved=[];$totals=[];
    foreach($input as $line){
        if(!is_array($line))throw new RuntimeException('Перевірте кошик.');
        if(($model=pimV3LineProduct($db,customerField($line,'product_id',64),$lock))!==null){$resolved[]=pimV3ResolveLine($db,$line,$model,$lock,$totals);continue;}
        $sku=customerField($line,'sku',64);$productId=customerField($line,'product_id',64);
        $qty=null;
        if($sku==='' || $productId==='')throw new RuntimeException('Перевірте товар і кількість у кошику.');
        $q=$db->prepare('SELECT v.*,p.name,p.slug,p.category_path,p.has_docs,p.docs_note,p.data AS product_data,f.supplier_name AS fulfillment_supplier_name FROM variants v JOIN products p ON p.id=v.product_id LEFT JOIN rubizh_catalog_fulfillment f ON f.sku=v.sku AND f.product_id=p.id WHERE v.sku=? AND p.id=? AND p.visible=1'.($lock?' FOR UPDATE':''));$q->execute([$sku,$productId]);$v=$q->fetch(PDO::FETCH_ASSOC);
        if(!$v)throw new ShopPricingException('INVALID_VARIANT','SKU більше не належить цьому товару. Оновіть кошик.');
        if(!shopVariantCanBuy($v))throw new ShopPricingException('UNAVAILABLE','Товар або розмір більше недоступний. Оновіть кошик.');
        $extra=json_decode((string)$v['data'],true) ?: [];$product=json_decode((string)$v['product_data'],true) ?: [];
        $unit=shopSaleUnit($product+['name'=>$v['name']]);$qty=shopQuantity($line['qty']??null,$unit);
        if(!empty($extra['size_unconfirmed']))throw new RuntimeException('Розмір товару не підтверджено. Уточніть у менеджера.');
        $totals[$sku]=($totals[$sku] ?? 0)+$qty;
        if($v['availability']==='in' && isset($extra['stock']) && $totals[$sku]+shopReservedQty($db,$sku)>(float)$extra['stock'])throw new ShopPricingException('UNAVAILABLE','Недостатньо товару на складі: '.$v['name']);
        $policy=shopPricingRead($db,$sku,$productId);
        $mode=$line['price_mode']??(!empty($line['kit_group'])?'kit':'retail');
        if(!is_string($mode)||!in_array($mode,['retail','kit','wholesale'],true))throw new ShopPricingException('DISCOUNT_NOT_ALLOWED','Невідомий режим ціни.');
        if(isset($line['color'])&&(!is_string($line['color'])||shopColor($line['color'])!==shopColor($v['color']))||isset($line['size'])&&$line['size']!==$v['size'])throw new ShopPricingException('INVALID_VARIANT','Колір або розмір не відповідає SKU.');
        $maxAge=max(3600,(int)(cfg('catalog_checkout_max_age_seconds')??172800));
        $fresh=$db->prepare('SELECT synced_at FROM products WHERE id=?');$fresh->execute([$productId]);
        if(strtotime((string)$fresh->fetchColumn().' UTC')<time()-$maxAge)throw new ShopPricingException('UNAVAILABLE','Наявність потребує актуального підтвердження постачальника.');
        $grants=cfg('shop_wholesale_customers');$buyer=function_exists('customerId')?customerId():null;$tier=is_array($grants)&&$buyer!==null?($grants[$buyer]??null):null;
        $group=customerField($line,'kit_group',64);$size=trim((string)($extra['size_display']??''))?:trim((string)($extra['size_native']??''));$size=$size?:trim((string)$v['size']);$size=preg_replace('/^\s*:\s*/u','',$size);
        $resolved[]=['product_id'=>$productId,'sku'=>$sku,'variant_id'=>(string)($extra['variant_id'] ?? $sku),'name'=>$v['name'],'slug'=>$v['slug'],
            'has_docs'=>!empty($v['has_docs']),'docs_note'=>!empty($v['has_docs'])?'Протокол випробувань додається до замовлення; до покупки надаємо за запитом':'','size'=>$size,'color'=>shopColor($v['color']),'variant'=>trim($size.' · '.$v['color'],' ·'),
            'qty'=>$qty,'sale_unit'=>$unit,'qty_label'=>$qty.($unit==='m2'?' м²':' шт.'),'price'=>shopMoneyValue(shopMoney($v['price'])),'kit_price'=>$policy===null||$policy['kit_cents']===null?null:shopMoneyValue($policy['kit_cents']),
            '_pricing'=>$policy,'_approved_wholesale_tier'=>$tier,'price_mode'=>$mode,'catalog_version'=>shopPricingCatalogVersion($db),'kit_group'=>$group,'stock_confirmed'=>isset($extra['stock'])&&is_numeric($extra['stock']),'request_state'=>$v['availability']==='order'?(!empty($extra['preorder_confirmed'])?'confirmed_preorder':'order_on_request'):'stock_check','availability'=>$v['availability'],'fulfillment_supplier'=>npSupplierCode($sku,$productId,(string)($v['fulfillment_supplier_name']??''))];
    }
    $definitions=json_decode((string)$db->query("SELECT v FROM meta WHERE k='site_kits'")->fetchColumn(),true)?:[];
    shopPricingKitComposition($resolved,array_column($definitions,null,'id'));
    return $resolved;
}
function shopSendOrderMail(PDO $db,int $orderId): string {
    $claim=$db->prepare("UPDATE rubizh_order_mail SET status='sending',attempts=attempts+1,locked_at=UTC_TIMESTAMP(),updated_at=UTC_TIMESTAMP() WHERE order_id=? AND attempts<5 AND ((status='pending' AND next_at<=UTC_TIMESTAMP()) OR (status='sending' AND locked_at<UTC_TIMESTAMP()-INTERVAL 5 MINUTE))");$claim->execute([$orderId]);
    if($claim->rowCount()===0){$q=$db->prepare('SELECT status FROM rubizh_order_mail WHERE order_id=?');$q->execute([$orderId]);return (string)$q->fetchColumn();}
    try{
        $q=$db->prepare('SELECT o.*,m.recipient,d.subtotal,d.discount_amount,d.shipping_amount FROM rubizh_customer_orders o JOIN rubizh_order_mail m ON m.order_id=o.id LEFT JOIN rubizh_order_details d ON d.order_id=o.id WHERE o.id=?');$q->execute([$orderId]);$order=$q->fetch(PDO::FETCH_ASSOC);
        $d=$db->prepare('SELECT contact_json FROM rubizh_order_details WHERE order_id=?');$d->execute([$orderId]);$contact=json_decode((string)$d->fetchColumn(),true)?:[];$order['contact']=$contact;$order['shipping_paid_to_carrier']=!empty($contact['shipping_paid_to_carrier']);$order['payment_method']=$contact['payment']??'';
        $timing=shopEnsureTiming($db,$order);$order['payment_due']=$timing['payment_due'];$order['donation_amount']=shopDonationAmount((float)$order['total']);if(shopReceiptStage($order)==='cancelled'){shopQueueBuyerMail($db,$orderId,'cancelled');$db->prepare("UPDATE rubizh_order_mail SET status='skipped',locked_at=NULL,error='',updated_at=UTC_TIMESTAMP() WHERE order_id=?")->execute([$orderId]);return 'skipped';}if($order['payment_status']==='paid'){shopRecordPaid($db,$orderId);$db->prepare("UPDATE rubizh_order_mail SET status='skipped',locked_at=NULL,error='',updated_at=UTC_TIMESTAMP() WHERE order_id=?")->execute([$orderId]);return 'skipped';}
        $cfg=authConfig();$password=(string)($cfg['noreply_password'] ?? '');if($password==='')throw new RuntimeException('Пошта не налаштована.');
        require_once __DIR__.'/../auth/mailer.php';rubizhSendOrder($order['recipient'],$password,$order);
        $db->prepare("UPDATE rubizh_order_mail SET status='sent',locked_at=NULL,error='',updated_at=UTC_TIMESTAMP() WHERE order_id=?")->execute([$orderId]);return 'sent';
    }catch(Throwable $e){error_log('rubizh order email: '.get_class($e).' code '.(string)$e->getCode());$db->prepare("UPDATE rubizh_order_mail SET status=IF(attempts>=5,'failed','pending'),locked_at=NULL,error='Не вдалося надіслати лист',next_at=UTC_TIMESTAMP()+INTERVAL 5 MINUTE,updated_at=UTC_TIMESTAMP() WHERE order_id=?")->execute([$orderId]);return shopOrderMailStatus($db,$orderId);}
}

function shopOrderMailStatus(PDO $db,int $orderId): string {
    $q=$db->prepare('SELECT status FROM rubizh_order_mail WHERE order_id=?');$q->execute([$orderId]);return (string)$q->fetchColumn();
}

function shopMayReadOrder(PDO $db,int $order): bool {
 $id=customerId();if($id!==null){customerOwnOrders($id);$q=$db->prepare('SELECT 1 FROM rubizh_account_orders WHERE order_id=? AND customer_id=?');$q->execute([$order,$id]);if($q->fetchColumn())return true;}
 $scope=$_SESSION['checkout_scope']??'';if(!is_string($scope)||$scope==='')return false;
 $q=$db->prepare('SELECT scope_hash FROM rubizh_checkout_requests WHERE order_id=?');$q->execute([$order]);$hash=$q->fetchColumn();return is_string($hash)&&hash_equals($hash,hash('sha256',$scope));
}
function shopNoOpenCardInvoice(PDO $db,int $order): bool {
 $q=$db->prepare("SELECT COUNT(*) FROM rubizh_mono_invoices WHERE order_id=? AND status IN ('creating','unknown','created','processing','hold')");$q->execute([$order]);return (int)$q->fetchColumn()===0;
}
function shopUseInvoice(PDO $db,int $id): void {
 npLocked($db,$id,function()use($db,$id){$o=npOrder($db,$id);if(!shopNoOpenCardInvoice($db,$id)||!in_array($o['payment_status'],['pending','failed'],true)||!in_array($o['status'],['new','confirmed','processing'],true))throw new RuntimeException('Спосіб оплати зараз змінити не можна.');
 $c=$o['contact'];$c['payment']='invoice';$db->beginTransaction();try{$db->prepare('UPDATE rubizh_order_details SET contact_json=? WHERE order_id=?')->execute([json_encode($c,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$id]);$db->prepare("UPDATE rubizh_customer_orders SET payment_status='pending',updated_at=UTC_TIMESTAMP() WHERE id=?")->execute([$id]);npAudit($db,str_repeat('0',32),'customer_invoice',$id);$db->commit();}catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}});
}
function shopCancelOrder(PDO $db,int $id): void {
 npLocked($db,$id,function()use($db,$id){$o=npOrder($db,$id);if($o['status']==='cancelled')return;
 if(!in_array($o['status'],['new','confirmed','processing'],true)||in_array($o['payment_status'],['paid','refunded'],true)||!shopNoOpenCardInvoice($db,$id))throw new RuntimeException('Для цього замовлення потрібне скасування через менеджера.');
 foreach(npShipments($db,$id) as $s)if(!in_array($s['status'],['draft','error','cancelled'],true))throw new RuntimeException('Посилку вже передано на оформлення. Зверніться до менеджера.');
 $db->beginTransaction();try{$db->prepare("UPDATE rubizh_customer_orders SET status='cancelled',updated_at=UTC_TIMESTAMP() WHERE id=?")->execute([$id]);if(!empty($GLOBALS['rubizh_pim_v3_columns']))$db->prepare("UPDATE rubizh_customer_orders SET pim_order_state='CANCELLED' WHERE id=? AND pim_contract_version=3")->execute([$id]);$db->prepare("UPDATE rubizh_order_shipments SET status='cancelled',updated_at=UTC_TIMESTAMP() WHERE order_id=? AND status IN ('draft','error')")->execute([$id]);shopQueueEvent($db,$id,'cancelled');shopQueueBuyerMail($db,$id,'cancelled');npAudit($db,str_repeat('0',32),'customer_cancelled',$id);$db->commit();}catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}});
}
