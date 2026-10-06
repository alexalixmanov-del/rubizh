<?php
declare(strict_types=1);
require_once __DIR__.'/np-lib.php';
function npMigrate(PDO $db): void {
    $version=(int)$db->query("SELECT v FROM meta WHERE k='rubizh_np_schema'")->fetchColumn();if($version>=3)return;
    $db->exec("CREATE TABLE IF NOT EXISTS rubizh_order_fulfillment_lines(order_id BIGINT UNSIGNED NOT NULL,line_no SMALLINT UNSIGNED NOT NULL,product_id VARCHAR(64) NOT NULL,sku VARCHAR(64) NOT NULL,qty DECIMAL(12,2) NOT NULL,supplier_code VARCHAR(32) NOT NULL DEFAULT '',line_amount DECIMAL(12,2) NULL,created_at DATETIME NOT NULL,PRIMARY KEY(order_id,line_no),INDEX(supplier_code,order_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $db->exec("ALTER TABLE rubizh_order_fulfillment_lines MODIFY qty DECIMAL(12,2) NOT NULL");
    npAddColumn($db,'rubizh_order_fulfillment_lines','line_amount','DECIMAL(12,2) NULL');
    npAddColumn($db,'rubizh_order_fulfillment_lines','sale_unit',"VARCHAR(8) NOT NULL DEFAULT 'piece'");
    $db->exec("CREATE TABLE IF NOT EXISTS rubizh_order_shipments(id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,order_id BIGINT UNSIGNED NOT NULL,supplier_code VARCHAR(32) NOT NULL,tracking_number VARCHAR(32) NULL UNIQUE,np_document_ref VARCHAR(64) NOT NULL DEFAULT '',origin_label VARCHAR(200) NOT NULL DEFAULT '',status VARCHAR(24) NOT NULL DEFAULT 'draft',created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,INDEX(order_id,id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $db->exec("ALTER TABLE rubizh_order_shipments MODIFY tracking_number VARCHAR(32) NULL DEFAULT NULL");
    foreach(['operation_key'=>'CHAR(32) NULL','lines_json'=>'TEXT NULL','package_json'=>'TEXT NULL','payload_json'=>'MEDIUMTEXT NULL','origin_json'=>'TEXT NULL','result_json'=>'MEDIUMTEXT NULL','error'=>"VARCHAR(300) NOT NULL DEFAULT ''",'attempted_at'=>'DATETIME NULL','checked_at'=>'DATETIME NULL','declared_value'=>'DECIMAL(12,2) NULL','delivery_cost'=>'DECIMAL(12,2) NULL'] as $c=>$type)npAddColumn($db,'rubizh_order_shipments',$c,$type);
    $q=$db->query("SHOW INDEX FROM rubizh_order_shipments WHERE Key_name='np_operation'");if(!$q->fetch())$db->exec('CREATE UNIQUE INDEX np_operation ON rubizh_order_shipments(operation_key)');
    $db->exec("CREATE TABLE IF NOT EXISTS rubizh_np_order_confirmations(order_id BIGINT UNSIGNED PRIMARY KEY,availability_confirmed TINYINT NOT NULL DEFAULT 0,extra_delivery_agreed TINYINT NOT NULL DEFAULT 0,confirmed_at DATETIME NULL,confirmed_by CHAR(32) NULL,payment_proof VARCHAR(240) NOT NULL DEFAULT '',updated_at DATETIME NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $db->exec("CREATE TABLE IF NOT EXISTS rubizh_np_audit(id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,actor_id CHAR(32) NOT NULL,action VARCHAR(40) NOT NULL,order_id BIGINT UNSIGNED NOT NULL DEFAULT 0,shipment_id BIGINT UNSIGNED NOT NULL DEFAULT 0,note VARCHAR(400) NOT NULL DEFAULT '',created_at DATETIME NOT NULL,INDEX(order_id,id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $db->exec("CREATE TABLE IF NOT EXISTS rubizh_np_cache(cache_key CHAR(64) PRIMARY KEY,payload MEDIUMTEXT NOT NULL,expires_at DATETIME NOT NULL,INDEX(expires_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $db->exec("INSERT INTO meta(k,v) VALUES('rubizh_np_schema','3') ON DUPLICATE KEY UPDATE v='3'");
}
function npAddColumn(PDO $db,string $table,string $column,string $type): void {
    $q=$db->prepare('SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?');$q->execute([$table,$column]);if(!(int)$q->fetchColumn())$db->exec("ALTER TABLE `$table` ADD COLUMN `$column` $type");
}
function npManagerId(): string {
    $id=customerId();$allowed=cfg('np_manager_emails');
    if($id!==null && is_array($allowed)){
      $allowed=array_map(fn($e)=>strtolower(trim((string)$e)),$allowed);
      // Editable profile/email contact alone never grants manager permissions.
      foreach(customerIdentities($id) as $i)if(in_array($i['provider'],['email','google'],true)){
        $email=$i['provider']==='email'?$i['subject']:$i['contact_email'];
        if($email!=='' && in_array(strtolower($email),$allowed,true))return $id;
      }
    }throw new RuntimeException('Увійдіть із підтвердженим email уповноваженого менеджера.');
}
function npAudit(PDO $db,string $actor,string $action,int $order=0,int $shipment=0,string $note=''): void {
    $db->prepare('INSERT INTO rubizh_np_audit(actor_id,action,order_id,shipment_id,note,created_at) VALUES(?,?,?,?,?,UTC_TIMESTAMP())')->execute([$actor,$action,$order,$shipment,mb_substr($note,0,400)]);
}
function npOrder(PDO $db,int $id): array {
    $q=$db->prepare('SELECT o.*,d.contact_json,d.subtotal,d.discount_amount,d.shipping_amount FROM rubizh_customer_orders o LEFT JOIN rubizh_order_details d ON d.order_id=o.id WHERE o.id=?');$q->execute([$id]);$o=$q->fetch(PDO::FETCH_ASSOC);if(!$o)throw new RuntimeException('Замовлення не знайдено.');
    $o['contact']=json_decode((string)($o['contact_json']??''),true)?:[];$o['items']=json_decode((string)$o['items_json'],true)?:[];
    return $o;
}
function npLines(PDO $db,int $order): array {$q=$db->prepare('SELECT * FROM rubizh_order_fulfillment_lines WHERE order_id=? ORDER BY line_no');$q->execute([$order]);return $q->fetchAll(PDO::FETCH_ASSOC);}
function npShipments(PDO $db,int $order): array {$q=$db->prepare('SELECT * FROM rubizh_order_shipments WHERE order_id=? ORDER BY id');$q->execute([$order]);return $q->fetchAll(PDO::FETCH_ASSOC);}
function npLocked(PDO $db,int $order,callable $work): mixed {
    $key='rubizh_np_order_'.$order;$q=$db->prepare('SELECT GET_LOCK(?,2)');$q->execute([$key]);if((int)$q->fetchColumn()!==1)throw new RuntimeException('Замовлення вже обробляється. Зачекайте.');
    try{return $work();}finally{$db->prepare('SELECT RELEASE_LOCK(?)')->execute([$key]);}
}
function npRemaining(array $lines,array $shipments): array {
    $left=[];foreach($lines as $l)$left[(int)$l['line_no']]=['qty'=>(float)$l['qty'],'amount'=>$l['line_amount']===null?null:(float)$l['line_amount']];
    foreach($shipments as $s){if($s['status']==='cancelled')continue;
      foreach(json_decode((string)($s['lines_json']??''),true)?:[] as $l){$i=(int)$l['line_no'];if(isset($left[$i])){$left[$i]['qty']=round($left[$i]['qty']-(float)$l['qty'],2);if($left[$i]['amount']!==null)$left[$i]['amount']=round($left[$i]['amount']-(float)$l['amount'],2);}}
    }return $left;
}
function npPackage(array $input): array {
    $places=$input['places']??null;if(!is_array($places)||count($places)<1||count($places)>100)throw new RuntimeException('Додайте фактичні місця посилки з вагою та габаритами.');
    $total=0;$clean=[];
    foreach($places as $p){if(!is_array($p))throw new RuntimeException('Перевірте дані місця.');$row=[];
      foreach(['weight','length','width','height'] as $f){$v=$p[$f]??null;if(is_bool($v)||!is_numeric($v)||!is_finite((float)$v)||(float)$v<=0||(float)$v>30000)throw new RuntimeException('Вкажіть додатну фактичну вагу та габарити кожного місця.');$row[$f]=round((float)$v,3);if($row[$f]<=0)throw new RuntimeException('Недопустима вага або габарити.');}
      $total+=$row['weight'];$clean[]=$row;
    }return ['places'=>$clean,'weight'=>round($total,3),'seats'=>count($clean)];
}
function npAllocation(array $lines,array $shipments,string $code,array $selected): array {
    if(!isset(npOrigins()[$code]))throw new RuntimeException('Невідомий постачальник — ручне уточнення.');
    $left=npRemaining($lines,$shipments);$out=[];$seen=[];
    foreach($selected as $p){if(!is_array($p))throw new RuntimeException('Перевірте позиції посилки.');$i=$p['line_no']??null;if(!is_int($i)||isset($seen[$i]))throw new RuntimeException('Невірна або повторена позиція.');$seen[$i]=true;
      $line=null;foreach($lines as $l)if((int)$l['line_no']===$i)$line=$l;
      if(!$line||$line['supplier_code']!==$code)throw new RuntimeException('Позиція належить іншому місцю відправки.');
      $qty=$p['qty']??null;shopQuantity($qty,$line['sale_unit']??'piece');if(is_bool($qty)||!is_numeric($qty)||!is_finite((float)$qty)||(float)$qty<=0 || abs((float)$qty-round((float)$qty,2))>0.00001 || (float)$qty>$left[$i]['qty']+0.00001)throw new RuntimeException('Кількість перевищує нерозподілений залишок замовлення.');
      if($left[$i]['amount']===null)throw new RuntimeException('Для старої позиції немає підтвердженої суми. Потрібна ручна звірка.');
      $amount=(float)$qty===$left[$i]['qty']?$left[$i]['amount']:round((float)$line['line_amount']*(float)$qty/(float)$line['qty'],2);
      if($amount<=0||$amount>$left[$i]['amount']+0.001)throw new RuntimeException('Перевірте оголошену вартість позиції.');
      $out[]=['line_no'=>$i,'sku'=>$line['sku'],'qty'=>(float)$qty,'amount'=>$amount];
    }
    if(!$out)throw new RuntimeException('Оберіть позиції цієї посилки.');return $out;
}
function npDraft(PDO $db,int $order,string $actor,string $op,string $code,array $selected,array $package): int {
    if(!preg_match('/^[a-f0-9]{32}$/D',$op))throw new RuntimeException('Оновіть форму посилки.');
    return npLocked($db,$order,function()use($db,$order,$actor,$op,$code,$selected,$package){
      $q=$db->prepare('SELECT id,order_id FROM rubizh_order_shipments WHERE operation_key=?');$q->execute([$op]);if($r=$q->fetch(PDO::FETCH_ASSOC)){if((int)$r['order_id']!==$order)throw new RuntimeException('Ключ належить іншому замовленню.');return (int)$r['id'];}
      $o=npOrder($db,$order);if(in_array($o['status'],['cancelled','returned','completed'],true))throw new RuntimeException('Замовлення закрите.');
      $items=npAllocation(npLines($db,$order),npShipments($db,$order),$code,$selected);$pack=npPackage($package);
      $value=round(array_sum(array_column($items,'amount')),2);
      $db->prepare("INSERT INTO rubizh_order_shipments(order_id,supplier_code,operation_key,lines_json,package_json,declared_value,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'draft',UTC_TIMESTAMP(),UTC_TIMESTAMP())")->execute([$order,$code,$op,json_encode($items,JSON_THROW_ON_ERROR),json_encode($pack,JSON_THROW_ON_ERROR),$value]);$id=(int)$db->lastInsertId();npAudit($db,$actor,'shipment_draft',$order,$id);return $id;
    });
}
function npConfirm(PDO $db,int $order,string $actor,bool $availability,bool $extra,string $proof): void {
    if(!$availability)throw new RuntimeException('Підтвердьте наявність і комплектацію всіх позицій.');
    $o=npOrder($db,$order);$method=$o['contact']['payment']??'';if(in_array($o['status'],['cancelled','returned','completed'],true))throw new RuntimeException('Замовлення закрите.');
    if($method==='invoice' && $o['payment_status']!=='paid' && mb_strlen(trim($proof))<6)throw new RuntimeException('Вкажіть підтвердження надходження коштів на рахунок ФОП.');
    if($method==='card' && $o['payment_status']!=='paid')throw new RuntimeException('Оплату карткою ще не підтверджено платіжним сервісом.');
    if($method==='cod' && (cfg('np_cod_contract_confirmed')!==true||cfg('np_cod_service')!=='afterpayment'))throw new RuntimeException('Післяплату не підтверджено за договором ФОП.');
    if(!in_array($method,['invoice','card','cod'],true))throw new RuntimeException('Немає підтвердженого способу оплати.');
    npLocked($db,$order,function()use($db,$order,$actor,$availability,$extra,$proof,$method){$db->beginTransaction();try{
      $db->prepare('INSERT INTO rubizh_np_order_confirmations(order_id,availability_confirmed,extra_delivery_agreed,confirmed_at,confirmed_by,payment_proof,updated_at) VALUES(?,?,?,UTC_TIMESTAMP(),?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE availability_confirmed=VALUES(availability_confirmed),extra_delivery_agreed=VALUES(extra_delivery_agreed),confirmed_at=VALUES(confirmed_at),confirmed_by=VALUES(confirmed_by),payment_proof=VALUES(payment_proof),updated_at=VALUES(updated_at)')->execute([$order,1,$extra?1:0,$actor,mb_substr($proof,0,240)]);
      if($method==='invoice'&&trim($proof)!=='')$db->prepare("UPDATE rubizh_customer_orders SET payment_status='paid',updated_at=UTC_TIMESTAMP() WHERE id=? AND payment_status IN ('pending','failed')")->execute([$order]);
      $db->prepare("UPDATE rubizh_customer_orders SET status='confirmed',updated_at=UTC_TIMESTAMP() WHERE id=? AND status='new'")->execute([$order]);
      if($method==='invoice'&&trim($proof)!==''&&function_exists('shopQueueEvent'))shopQueueEvent($db,$order,'paid');
      npAudit($db,$actor,'order_confirmed',$order,0,$method==='invoice'?'Підтвердження банку: '.mb_substr($proof,0,200):'Наявність та спосіб оплати підтверджено');$db->commit();
    }catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}});
}
function npAssertReady(array $order,array $confirmation,array $lines,array $shipments,array $shipment): void {
    if(cfg('np_ttn_enabled')!==true)throw new RuntimeException('Випуск ТТН ще не увімкнено власником після перевірки налаштувань.');
    if(in_array($order['status'],['cancelled','returned','completed'],true))throw new RuntimeException('Замовлення закрите.');
    if((int)($confirmation['availability_confirmed']??0)!==1)throw new RuntimeException('Спочатку підтвердьте наявність і комплектацію.');
    if(!isset(npOrigins()[$shipment['supplier_code']]))throw new RuntimeException('Для цієї посилки постачальник не визначений; потрібне ручне уточнення.');
    $method=$order['contact']['payment']??'';
    if(in_array($method,['card','invoice'],true)&&$order['payment_status']!=='paid')throw new RuntimeException('Замовлення ще не оплачене.');
    if($method==='card'&&cfg('np_card_payment_verified')!==true&&!(function_exists('monoConfigured')&&monoConfigured()))throw new RuntimeException('Платіжний сервіс ще не підключено до перевірки оплати.');
    if($method==='cod'&&(cfg('np_cod_contract_confirmed')!==true||cfg('np_cod_service')!=='afterpayment'))throw new RuntimeException('Післяплата не підтверджена в договорі ФОП.');
    if(!in_array($method,['card','invoice','cod'],true))throw new RuntimeException('Невідомий спосіб оплати.');
    $active=array_filter($shipments,fn($s)=>$s['status']!=='cancelled');$codes=array_unique(array_column($lines,'supplier_code'));
    if((count($active)>1||count($codes)>1) && (int)($confirmation['extra_delivery_agreed']??0)!==1)throw new RuntimeException('Погодьте з покупцем доставку кожної окремої посилки.');
    if(!is_array($order['contact']['np_delivery']??null))throw new RuntimeException('Для цього старого замовлення адресу ще не перевірено в довіднику НП.');
    if(count(preg_split('/\s+/u',trim((string)(($order['contact']['recipient']??'')?:($order['contact']['name']??'')))))<2)throw new RuntimeException('Вкажіть ім’я та прізвище одержувача.');
    npPackage(json_decode((string)$shipment['package_json'],true)?:[]);
    if((float)$shipment['declared_value']<=0)throw new RuntimeException('Немає підтвердженої оголошеної вартості.');
}
function npSaveProperties(array $shipment,array $origin,array $sender,array $delivery,array $contact,string $recipientRef,string $contactRef,string $recipientAddress): array {
    $package=npPackage(json_decode((string)$shipment['package_json'],true)?:[]);
    $props=['PayerType'=>'Recipient','PaymentMethod'=>'Cash','DateTime'=>(new DateTimeImmutable('now',new DateTimeZone('Europe/Kyiv')))->format('d.m.Y'),'CargoType'=>$package['weight']>30?'Cargo':'Parcel','Weight'=>(string)$package['weight'],'ServiceType'=>$delivery['type']==='courier'?'WarehouseDoors':'WarehouseWarehouse','SeatsAmount'=>(string)$package['seats'],'Description'=>'Товари','Cost'=>number_format((float)$shipment['declared_value'],2,'.',''),'CitySender'=>$origin['city_ref'],'Sender'=>$sender['ref'],'SenderAddress'=>$origin['warehouse_ref'],'ContactSender'=>$sender['contact_ref'],'SendersPhone'=>preg_replace('/\D/','',$sender['phone']),'CityRecipient'=>$delivery['city_ref'],'Recipient'=>$recipientRef,'RecipientAddress'=>$recipientAddress,'ContactRecipient'=>$contactRef,'RecipientsPhone'=>preg_replace('/\D/','',$contact['phone']),'InfoRegClientBarcodes'=>'RB-'.$shipment['operation_key'],'AdditionalInformation'=>'RB-'.$shipment['operation_key']];
    $props['OptionsSeat']=array_map(fn($p)=>['weight'=>(string)$p['weight'],'volumetricVolume'=>(string)round($p['length']*$p['width']*$p['height']/1000000,6),'volumetricLength'=>(string)$p['length'],'volumetricWidth'=>(string)$p['width'],'volumetricHeight'=>(string)$p['height']],$package['places']);
    if(($contact['payment']??'')==='cod')$props['AfterpaymentOnGoodsCost']=$props['Cost'];
    return $props;
}
function npRecipient(array $contact,array $delivery): array {
    $name=trim((string)(($contact['recipient']??'')?:$contact['name']));$parts=preg_split('/\s+/u',$name);
    if(count($parts)<2)throw new RuntimeException('Для НП потрібні імʼя та прізвище одержувача.');
    $result=npApiCall('Counterparty','save',['FirstName'=>$parts[0],'LastName'=>$parts[1],'MiddleName'=>implode(' ',array_slice($parts,2)),'Phone'=>preg_replace('/\D/','',$contact['phone']),'Email'=>$contact['email'],'CounterpartyType'=>'PrivatePerson','CounterpartyProperty'=>'Recipient','CityRef'=>$delivery['city_ref']]);
    $r=$result[0]??[];if(!npRef($r['Ref']??''))throw new NpUnknownResult('НП не повернула ідентифікатор одержувача.');
    $persons=$r['ContactPerson']['data']??null;
    if(!is_array($persons))$persons=npApiCall('Counterparty','getCounterpartyContactPersons',['Ref'=>$r['Ref']]);
    $phone=preg_replace('/\D/','',$contact['phone']);$person=null;foreach($persons as $p)if(npRef($p['Ref']??'') && str_contains(preg_replace('/\D/','',(string)($p['Phones']??'')),$phone))$person=$p;
    if(!$person)throw new RuntimeException('Контакт одержувача не підтверджено в НП.');
    $address=$delivery['warehouse_ref']??'';
    if($delivery['type']==='courier'){
      $rows=npApiCall('Address','save',['CounterpartyRef'=>$r['Ref'],'StreetRef'=>$delivery['street_ref'],'BuildingNumber'=>$delivery['building'],'Flat'=>$delivery['flat']]);$address=$rows[0]['Ref']??'';
    }if(!npRef($address))throw new NpUnknownResult('НП не підтвердила адресу одержувача.');
    return ['ref'=>$r['Ref'],'contact_ref'=>$person['Ref'],'address_ref'=>$address];
}
function npCreate(PDO $db,int $order,int $id,string $actor): array {
    return npLocked($db,$order,function()use($db,$order,$id,$actor){
      $q=$db->prepare('SELECT * FROM rubizh_order_shipments WHERE id=? AND order_id=?');$q->execute([$id,$order]);$s=$q->fetch(PDO::FETCH_ASSOC);if(!$s)throw new RuntimeException('Посилку не знайдено.');
      if(!empty($s['tracking_number']))return $s;
      if($s['status']==='creating' && $s['attempted_at']!==null){$db->prepare("UPDATE rubizh_order_shipments SET status='unknown',error='Перерваний випуск: потрібна звірка',updated_at=UTC_TIMESTAMP() WHERE id=?")->execute([$id]);throw new RuntimeException('Перерваний випуск: звірте результат у НП.');}
      if($s['status']!=='draft')throw new RuntimeException('Повторний випуск заблоковано. Перевірте стан та результат у НП.');
      $o=npOrder($db,$order);$q=$db->prepare('SELECT * FROM rubizh_np_order_confirmations WHERE order_id=?');$q->execute([$order]);$confirmation=$q->fetch(PDO::FETCH_ASSOC)?:[];
      npAssertReady($o,$confirmation,npLines($db,$order),npShipments($db,$order),$s);
      // All read-only checks run before recording an attempted remote mutation.
      $delivery=npValidateDelivery($db,['np_delivery'=>$o['contact']['np_delivery']],$o['contact']['delivery_type']);$package=npPackage(json_decode((string)$s['package_json'],true)?:[]);$origin=npVerifiedOrigin($db,$s['supplier_code'],$package['weight']);$sender=npVerifiedSender($db);
      $db->prepare("UPDATE rubizh_order_shipments SET status='creating',attempted_at=UTC_TIMESTAMP(),origin_json=?,origin_label=?,error='',updated_at=UTC_TIMESTAMP() WHERE id=? AND status='draft'")->execute([json_encode($origin,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),mb_substr($origin['label'],0,200),$id]);npAudit($db,$actor,'shipment_create_attempt',$order,$id);
      try{
        $recipient=npRecipient($o['contact'],$delivery);$props=npSaveProperties($s,$origin,$sender,$delivery,$o['contact'],$recipient['ref'],$recipient['contact_ref'],$recipient['address_ref']);
        $db->prepare('UPDATE rubizh_order_shipments SET payload_json=? WHERE id=?')->execute([json_encode($props,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$id]);
        $rows=npApiCall('InternetDocument','save',$props);$r=$rows[0]??[];
        if(!npRef($r['Ref']??'')||!preg_match('/^[0-9]{14}$/D',(string)($r['IntDocNumber']??'')))throw new NpUnknownResult('НП не підтвердила номер ТТН.');
        $db->prepare("UPDATE rubizh_order_shipments SET status='created',np_document_ref=?,tracking_number=?,result_json=?,delivery_cost=?,error='',updated_at=UTC_TIMESTAMP() WHERE id=?")->execute([$r['Ref'],$r['IntDocNumber'],json_encode($r,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),is_numeric($r['CostOnSite']??null)?$r['CostOnSite']:null,$id]);
        npAudit($db,$actor,'shipment_created',$order,$id,$r['IntDocNumber']);return array_merge($s,['tracking_number'=>$r['IntDocNumber'],'np_document_ref'=>$r['Ref'],'status'=>'created']);
      }catch(Throwable $e){
        // Even a local persistence error after a successful save has an unknown remote result.
        $state=$e instanceof NpRejected?'error':'unknown';$message=($e instanceof NpRejected||$e instanceof NpUnknownResult)?$e->getMessage():'Результат операції потребує звірки з НП.';
        $db->prepare('UPDATE rubizh_order_shipments SET status=?,error=?,updated_at=UTC_TIMESTAMP() WHERE id=?')->execute([$state,mb_substr($message,0,300),$id]);npAudit($db,$actor,'shipment_'.$state,$order,$id,$message);throw new RuntimeException($message);
      }
    });
}
function npReconcile(PDO $db,int $order,int $id,string $actor): bool {
    return npLocked($db,$order,function()use($db,$order,$id,$actor){
      $q=$db->prepare('SELECT * FROM rubizh_order_shipments WHERE id=? AND order_id=?');$q->execute([$id,$order]);$s=$q->fetch(PDO::FETCH_ASSOC);if(!$s)throw new RuntimeException('Посилку не знайдено.');if(!empty($s['tracking_number']))return true;
      if(!in_array($s['status'],['unknown','creating'],true))throw new RuntimeException('Цій посилці звірка не потрібна.');
      $props=json_decode((string)$s['payload_json'],true)?:[];$matches=[];
      for($page=1;$page<=20;$page++){
        $rows=npApiCall('InternetDocument','getDocumentList',['DateTimeFrom'=>(new DateTimeImmutable($s['attempted_at']?:$s['created_at'],new DateTimeZone('UTC')))->modify('-1 day')->format('d.m.Y'),'DateTimeTo'=>gmdate('d.m.Y'),'Page'=>(string)$page,'Limit'=>'100']);
        foreach($rows as $r){$marker=(string)($r['InfoRegClientBarcodes']??'').' '.(string)($r['AdditionalInformation']??'');
          if(str_contains($marker,'RB-'.$s['operation_key'])&&npRef($r['Ref']??'')&&preg_match('/^[0-9]{14}$/D',(string)($r['IntDocNumber']??'')))$matches[]=$r;
        }if(count($rows)<100)break;
      }
      if(count($matches)!==1){$db->prepare("UPDATE rubizh_order_shipments SET status='unknown',error='Немає однозначного збігу у НП. Повтор заблоковано.',checked_at=UTC_TIMESTAMP(),updated_at=UTC_TIMESTAMP() WHERE id=?")->execute([$id]);npAudit($db,$actor,'shipment_reconcile_manual',$order,$id);return false;}
      $r=$matches[0];$db->prepare("UPDATE rubizh_order_shipments SET status='created',np_document_ref=?,tracking_number=?,result_json=?,error='',checked_at=UTC_TIMESTAMP(),updated_at=UTC_TIMESTAMP() WHERE id=?")->execute([$r['Ref'],$r['IntDocNumber'],json_encode($r,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$id]);npAudit($db,$actor,'shipment_reconciled',$order,$id,$r['IntDocNumber']);return true;
    });
}
function npCancelDraft(PDO $db,int $order,int $id,string $actor): void {
    npLocked($db,$order,function()use($db,$order,$id,$actor){$q=$db->prepare("UPDATE rubizh_order_shipments SET status='cancelled',updated_at=UTC_TIMESTAMP() WHERE order_id=? AND id=? AND status IN ('draft','error') AND tracking_number IS NULL");$q->execute([$order,$id]);if(!$q->rowCount())throw new RuntimeException('Можна скасувати лише чернетку або явно відхилений запит. Невідомий результат потребує звірки.');npAudit($db,$actor,'shipment_draft_cancelled',$order,$id);});
}
function npTrackingState(string $code): string {
    return match($code){'1'=>'created','2'=>'cancelled','3'=>'manual','4','5','6','7','8','41'=>'sent','9','10','11'=>'delivered','102','103','108'=>'returned',default=>'manual'};
}
function npRefresh(PDO $db,int $order,string $actor): void {
    npLocked($db,$order,function()use($db,$order,$actor){$o=npOrder($db,$order);$ships=npShipments($db,$order);$to=[];
      foreach($ships as $s)if(!empty($s['tracking_number'])&&(!in_array($s['status'],['delivered','cancelled','returned'],true))&&($s['checked_at']===null||strtotime($s['checked_at'].' UTC')<time()-900))$to[]=['DocumentNumber'=>$s['tracking_number'],'Phone'=>preg_replace('/\D/','',$o['contact']['phone']??'')];
      if($to){$rows=npApiCall('TrackingDocument','getStatusDocuments',['Documents'=>$to]);$allowed=array_column($to,'DocumentNumber');foreach($rows as $r){$number=(string)($r['Number']??'');if(!in_array($number,$allowed,true))continue;$db->prepare('UPDATE rubizh_order_shipments SET status=?,checked_at=UTC_TIMESTAMP(),updated_at=UTC_TIMESTAMP() WHERE order_id=? AND tracking_number=?')->execute([npTrackingState((string)($r['StatusCode']??'')),$order,$number]);$code=(string)($r['StatusCode']??'');if(function_exists('shopTimelineEvent')){$time=gmdate('Y-m-d H:i:s');$detail=['tracking'=>$number,'address'=>(string)($r['WarehouseRecipient']??$o['delivery_label']),'storage_until'=>(string)($r['DateFreeStorage']??''),'observed'=>true];if(in_array($code,['4','5','6','7','8','9','10','11','41'],true)){shopTimelineEvent($db,$order,'sent',$number,$time,$detail);shopQueueBuyerMail($db,$order,'shipped');}if(in_array($code,['7','8'],true))shopTimelineEvent($db,$order,'arrived',$number,$time,$detail);if(in_array($code,['9','10','11'],true))shopTimelineEvent($db,$order,'received',$number,$time,$detail);if(in_array($code,['102','103','108'],true))shopTimelineEvent($db,$order,'returned',$number,$time,$detail);}}}
      npAggregateOrder($db,$order);npAudit($db,$actor,'tracking_refresh',$order);
    });
}
function npAggregateOrder(PDO $db,int $order): void {
    $o=npOrder($db,$order);if(in_array($o['status'],['cancelled','returned','completed'],true))return;
    $ships=array_values(array_filter(npShipments($db,$order),fn($s)=>$s['status']!=='cancelled'));if(!$ships)return;
    $remaining=npRemaining(npLines($db,$order),$ships);$covered=true;foreach($remaining as $r)if($r['qty']>0.00001)$covered=false;
    $states=array_column($ships,'status');$returned=count(array_filter($states,fn($s)=>$s==='returned'));$moving=count(array_filter($states,fn($s)=>in_array($s,['sent','delivered'],true)));$status=null;
    if($returned===count($ships))$status='returned';elseif($returned>0)$status='partially_returned';
    elseif($covered&&count(array_filter($states,fn($s)=>$s==='delivered'))===count($ships))$status='delivered';
    elseif($covered&&$moving===count($ships))$status='shipped';elseif($moving>0)$status='partially_shipped';
    if($status)$db->prepare('UPDATE rubizh_customer_orders SET status=?,updated_at=UTC_TIMESTAMP() WHERE id=?')->execute([$status,$order]);
}
