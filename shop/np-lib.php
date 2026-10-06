<?php
declare(strict_types=1);
// Included by protected server scripts only; no secret appears in browser requests.
class NpUnknownResult extends RuntimeException {}
class NpRejected extends RuntimeException {}
function npConfigured(): bool {return trim((string)(getenv('RUBIZH_NP_API_KEY')?:cfg('nova_poshta_api_key')))!=='';}
function npOrigins(): array {
    $origins=[
      'm_vin'=>['name'=>'М Він','city'=>'Ксаверівка','region'=>'Вінницька','branch'=>'1','address'=>'Хмельницьке шосе, 40 б'],
      'ukr_tek'=>['name'=>'Укр Тек','city'=>'Хмельницький','region'=>'Хмельницька','branch'=>'8','address'=>'Князя Святослава Хороброго, 5'],
      'armoline'=>['name'=>'Армолайн','city'=>'Чернівці','region'=>'Чернівецька','branch'=>'32','address'=>''],
      'tactical_belt'=>['name'=>'Тактикал белт','city'=>'Березань','region'=>'','branch'=>'2','address'=>''],
      'kiborg'=>['name'=>'Кіборг','city'=>'Вінниця','region'=>'Вінницька','branch'=>'9','cargo_branch'=>'36','address'=>''],
    ];
    $customOrigins=function_exists('cfg')?cfg('np_custom_origins'):null;if(is_array($customOrigins))foreach($customOrigins as $code=>$o)if(preg_match('/^[a-z][a-z0-9_]{1,31}$/D',(string)$code)&&is_array($o)&&trim((string)($o['city']??''))!==''&&trim((string)($o['branch']??''))!==''&&!isset($origins[$code]))$origins[$code]=array_intersect_key($o,array_flip(['name','city','region','branch','cargo_branch','address']))+['name'=>$code,'region'=>'','address'=>''];
    $refs=function_exists('cfg')?cfg('np_origin_refs'):null;
    if(is_array($refs))foreach($origins as $code=>&$o){$r=$refs[$code]??[];if(!is_array($r))continue;
      foreach(['city_ref','warehouse_ref','cargo_warehouse_ref'] as $f)if(npRef($r[$f]??''))$o[$f]=strtolower($r[$f]);
      $o['confirmed']=($r['confirmed']??false)===true;
      $o['cargo_confirmed']=($r['cargo_confirmed']??false)===true;
      if(is_string($r['expected_area']??null)&&trim($r['expected_area'])!=='')$o['region']=trim($r['expected_area']);
    }unset($o);return $origins;
}
function npRef(mixed $v): bool {return is_string($v)&&preg_match('/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/Di',$v)===1;}
function npNormalize(string $s): string {return mb_strtolower(trim(preg_replace('/\s+/u',' ',$s)),'UTF-8');}
function npOriginCityMatches(string $actual,string $expected): bool {return npNormalize(preg_replace('/\s+\([^()]+\)\s*$/u','',$actual))===npNormalize(preg_replace('/\s+\([^()]+\)\s*$/u','',$expected));}
function npContactPhones(mixed $input): array {
    $phones=[];
    foreach(preg_split('/[,;\r\n]+/',(string)$input) as $number){
      $phone=preg_replace('/\D/','',$number);
      if(preg_match('/^0\d{9}$/D',$phone))$phone='38'.$phone;
      if(preg_match('/^380\d{9}$/D',$phone))$phones[$phone]=$phone;
    }
    return array_values($phones);
}
function npSupplierCode(string $sku,string $productId,string $name=''): string {
    $s=function_exists('cfg')?cfg('np_supplier_by_sku'):[];$p=function_exists('cfg')?cfg('np_supplier_by_product'):[];
    $value=(is_array($s)?($s[$sku]??null):null)??(is_array($p)?($p[$productId]??null):null);
    if($value!==null)return is_string($value)&&isset(npOrigins()[$value])?$value:'';
    $names=['м він'=>'m_vin','м вин'=>'m_vin','м-він'=>'m_vin','м-вин'=>'m_vin','укр тек'=>'ukr_tek','укр-тек'=>'ukr_tek','укртек'=>'ukr_tek','ukr-tec'=>'ukr_tek','армолайн'=>'armoline','armoline'=>'armoline','тактикал белт'=>'tactical_belt','tactical belt'=>'tactical_belt','кіборг'=>'kiborg','киборг'=>'kiborg','kiborg'=>'kiborg'];
    $custom=function_exists('cfg')?cfg('np_supplier_names'):[];
    if(is_array($custom))foreach($custom as $n=>$c)if(is_string($n)&&is_string($c)&&isset(npOrigins()[$c]))$names[npNormalize($n)]=$c;
    return $names[npNormalize($name)]??'';
}
function npApiCall(string $model,string $method,array $properties=[]): array {
    if(!preg_match('/^[A-Za-z]+$/D',$model.$method))throw new InvalidArgumentException('Невірний метод НП.');
    // Only a PHP test process can supply a fixture transport; never a query parameter.
    if(defined('RUBIZH_NP_TESTS') && isset($GLOBALS['np_test_transport']))return ($GLOBALS['np_test_transport'])($model,$method,$properties);
    $key=(string)(getenv('RUBIZH_NP_API_KEY')?:cfg('nova_poshta_api_key'));
    if(trim($key)==='')throw new RuntimeException('Додайте ключ НП у конфігурацію сервера.');
    if(!function_exists('curl_init'))throw new RuntimeException('Потрібне розширення PHP curl.');
    $c=curl_init('https://api.novaposhta.ua/v2.0/json/');
    try{curl_setopt_array($c,[CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>json_encode(['apiKey'=>$key,'modelName'=>$model,'calledMethod'=>$method,'methodProperties'=>$properties],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),CURLOPT_HTTPHEADER=>['Content-Type: application/json'],CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>5,CURLOPT_TIMEOUT=>25,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2]);
      $response=curl_exec($c);$status=(int)curl_getinfo($c,CURLINFO_HTTP_CODE);
    }finally{curl_close($c);}
    // A timeout, 5xx or broken body can follow a successful remote save. Never retry a save.
    if(!is_string($response)||$status!==200||strlen($response)>8*1024*1024)throw new NpUnknownResult('НП не підтвердила результат. Потрібна звірка, повторний випуск заблоковано.');
    try{$r=json_decode($response,true,64,JSON_THROW_ON_ERROR);}catch(Throwable $e){throw new NpUnknownResult('НП повернула неповну відповідь. Потрібна звірка.');}
    if(!is_array($r)||!array_key_exists('success',$r)||!is_array($r['data']??null))throw new NpUnknownResult('Неповна відповідь НП. Потрібна звірка.');
    if($r['success']!==true){$errors=array_filter(is_array($r['errors']??null)?$r['errors']:[],'is_string');$message=mb_substr(str_replace($key,'[приховано]',implode('; ',array_slice($errors,0,3))),0,300);throw new NpRejected('НП відхилила запит'.($message!==''?': '.$message:'.'));}
    return $r['data'];
}
function npCached(PDO $db,string $model,string $method,array $properties,int $ttl=86400): array {
    $key=hash('sha256',json_encode([$model,$method,$properties],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR));
    $q=$db->prepare('SELECT payload FROM rubizh_np_cache WHERE cache_key=? AND expires_at>UTC_TIMESTAMP()');$q->execute([$key]);$v=$q->fetchColumn();if($v!==false){$v=json_decode((string)$v,true);if(is_array($v))return $v;}
    $v=npApiCall($model,$method,$properties);
    $db->prepare('INSERT INTO rubizh_np_cache(cache_key,payload,expires_at) VALUES(?,?,?) ON DUPLICATE KEY UPDATE payload=VALUES(payload),expires_at=VALUES(expires_at)')->execute([$key,json_encode($v,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),gmdate('Y-m-d H:i:s',time()+$ttl)]);
    if(random_int(1,100)===1)$db->exec('DELETE FROM rubizh_np_cache WHERE expires_at<UTC_TIMESTAMP()-INTERVAL 1 DAY');
    return $v;
}
function npCity(PDO $db,string $ref): array {
    if(!npRef($ref))throw new RuntimeException('Оберіть населений пункт із довідника НП.');
    $rows=npCached($db,'Address','getCities',['Ref'=>$ref]);
    foreach($rows as $r)if(($r['Ref']??'')===$ref && !empty($r['Description']))return $r;
    throw new RuntimeException('Населений пункт не знайдено в НП.');
}
function npWarehouse(PDO $db,string $city,string $ref): array {
    if(!npRef($ref))throw new RuntimeException('Оберіть конкретне відділення НП.');
    $rows=npCached($db,'Address','getWarehouses',['CityRef'=>$city,'Ref'=>$ref,'Limit'=>'100']);
    foreach($rows as $r)if(($r['Ref']??'')===$ref && ($r['CityRef']??'')===$city && !empty($r['Description']) && (!isset($r['WarehouseStatus'])||$r['WarehouseStatus']==='Working'))return $r;
    throw new RuntimeException('Відділення недоступне або належить іншому місту.');
}
function npValidateDelivery(PDO $db,array $contact,string $type): array {
    $d=is_array($contact['np_delivery']??null)?$contact['np_delivery']:[];
    if(!npConfigured() && !defined('RUBIZH_NP_TESTS'))return ['city'=>(string)($contact['city']??''),'address'=>(string)($contact['address']??''),'type'=>$type,'manual'=>true];
    $city=npCity($db,(string)($d['city_ref']??''));$result=['city_ref'=>$city['Ref'],'city'=>$city['Description'],'type'=>$type,'verified_at'=>gmdate('c')];
    if($type==='courier'){
      $streetRef=(string)($d['street_ref']??'');if(!npRef($streetRef))throw new RuntimeException('Оберіть вулицю з довідника НП.');
      $street=null;foreach(npCached($db,'Address','getStreet',['CityRef'=>$city['Ref'],'Ref'=>$streetRef,'Limit'=>'100']) as $s)if(($s['Ref']??'')===$streetRef)$street=$s;
      if(!$street)throw new RuntimeException('Вулиця не належить вибраному місту.');
      $building=trim((string)($d['building']??''));$flat=trim((string)($d['flat']??''));
      if(!preg_match('/^[0-9\p{L}\s\/-]{1,20}$/u',$building) || ($flat!==''&&!preg_match('/^[0-9\p{L}\s\/-]{1,20}$/u',$flat)))throw new RuntimeException('Вкажіть будинок і перевірте квартиру.');
      return $result+['street_ref'=>$streetRef,'street'=>$street['Description'],'building'=>$building,'flat'=>$flat,'address'=>$street['Description'].', '.$building.($flat!==''?', кв. '.$flat:'')];
    }
    $w=npWarehouse($db,$city['Ref'],(string)($d['warehouse_ref']??''));$postomat=str_contains(npNormalize($w['Description']),'поштомат');
    if(($type==='postomat')!==$postomat)throw new RuntimeException('Виберіть відділення для обраного способу доставки.');
    return $result+['warehouse_ref'=>$w['Ref'],'address'=>$w['Description']];
}
function npOriginWarehouseCandidates(array $origin): array {
    $result=[];
    $cities=npApiCall('Address','getCities',['FindByString'=>$origin['city'],'Limit'=>'100']);
    foreach($cities as $city){
      if(!npRef($city['Ref']??'') || !npOriginCityMatches((string)($city['Description']??''),$origin['city']) || (!empty($origin['region']) && !str_contains(npNormalize((string)($city['AreaDescription']??'')),npNormalize($origin['region']))))continue;
      for($page=1;$page<=4;$page++){
        $rows=npApiCall('Address','getWarehouses',['CityRef'=>$city['Ref'],'Page'=>(string)$page,'Limit'=>'500']);
        foreach($rows as $r)if(($r['CityRef']??'')===$city['Ref'] && (string)($r['Number']??'')===(string)$origin['branch'] && (!isset($r['WarehouseStatus'])||$r['WarehouseStatus']==='Working'))$result[]=['description'=>$r['Description']??'','city'=>$r['CityDescription']??'','area'=>$r['SettlementAreaDescription']??'','region'=>$r['SettlementRegionDescription']??'','city_ref'=>$r['CityRef']??'','warehouse_ref'=>$r['Ref']??''];
        if(count($rows)<500)break;
      }
    }return $result;
}
function npVerifiedOrigin(PDO $db,string $code,?float $weight=null): array {
    $o=npOrigins()[$code]??null;
    if(!$o || empty($o['confirmed']) || empty($o['region']) || !npRef($o['city_ref']??'') || !npRef($o['warehouse_ref']??''))throw new RuntimeException('Місце відправки не підтверджено: '.$code);
    if(!empty($o['cargo_branch']) && $weight!==null && $weight>30){
      if(empty($o['cargo_confirmed']) || !npRef($o['cargo_warehouse_ref']??''))throw new RuntimeException('Вантажне відділення понад 30 кг не підтверджено: '.$code);
      $o['branch']=$o['cargo_branch'];$o['warehouse_ref']=$o['cargo_warehouse_ref'];
    }
    $w=npWarehouse($db,$o['city_ref'],$o['warehouse_ref']);
    if((string)($w['Number']??'')!==$o['branch'] || !npOriginCityMatches((string)($w['CityDescription']??''),$o['city']) || !str_contains(npNormalize((string)($w['SettlementAreaDescription']??'')),npNormalize($o['region'])))throw new RuntimeException('Місто, область або номер відправного відділення не збігаються.');
    // The owner confirms the actual street in diagnostics before setting confirmed=true.
    return $o+['label'=>$w['CityDescription'].' · '.$w['Description'],'directory'=>$w];
}
function npVerifiedSender(PDO $db): array {
    $s=cfg('np_sender');if(!is_array($s)||($s['confirmed']??false)!==true||!npRef($s['ref']??'')||!npRef($s['contact_ref']??'')||!preg_match('/^380\d{9}$/D',preg_replace('/\D/','',(string)($s['phone']??''))))throw new RuntimeException('Підтвердьте ФОП-відправника, контакт і телефон у конфігурації НП.');
    $found=false;
    for($p=1;$p<=10;$p++){ $rows=npApiCall('Counterparty','getCounterparties',['CounterpartyProperty'=>'Sender','Page'=>(string)$p]);foreach($rows as $r)if(($r['Ref']??'')===$s['ref'])$found=true;if(count($rows)<100||$found)break; }
    if(!$found)throw new RuntimeException('Відправник не належить цьому бізнес-ключу НП.');
    $phone=preg_replace('/\D/','',$s['phone']);
    foreach(npApiCall('Counterparty','getCounterpartyContactPersons',['Ref'=>$s['ref']]) as $r)if(($r['Ref']??'')===$s['contact_ref'] && in_array($phone,npContactPhones($r['Phones']??''),true))return $s;
    throw new RuntimeException('Контакт або телефон відправника не підтверджено в НП.');
}
function npStatusLabel(string $s): string {return ['draft'=>'Дані уточнюються','creating'=>'Створюється','unknown'=>'Потрібна звірка','error'=>'Помилка НП','created'=>'Накладна створена','sent'=>'У дорозі','delivered'=>'Отримано','cancelled'=>'Скасовано','returned'=>'Повернення','manual'=>'Уточнюється'][$s]??'Уточнюється';}
