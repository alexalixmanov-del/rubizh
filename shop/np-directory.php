<?php
declare(strict_types=1);
require __DIR__.'/../auth/bootstrap.php';
try{
  if(($_SERVER['REQUEST_METHOD']??'GET')!=='GET')shopJson(['ok'=>false,'error'=>'Тільки GET.'],405);
  $db=shopStoreDatabase();shopLimit($db,'np-directory',90,60);
  if(!npConfigured())shopJson(['ok'=>true,'enabled'=>false,'items'=>[]]);
  $kind=(string)($_GET['kind']??'cities');$q=trim((string)($_GET['q']??''));
  if(mb_strlen($q)>80)throw new InvalidArgumentException('Запит надто довгий.');
  $items=[];
  if($kind==='cities'){
    if(mb_strlen($q)<2)shopJson(['ok'=>true,'enabled'=>true,'items'=>[]]);
    foreach(npCached($db,'Address','getCities',['FindByString'=>$q,'Limit'=>'20','Page'=>'1'],86400) as $r)if(npRef($r['Ref']??''))$items[]=['ref'=>$r['Ref'],'name'=>$r['Description']??'','note'=>trim(($r['SettlementTypeDescription']??'').' · '.($r['AreaDescription']??''),' ·')];
  }elseif($kind==='warehouses'){
    $ref=(string)($_GET['city_ref']??'');if(!npRef($ref))throw new InvalidArgumentException('Оберіть місто зі списку.');$type=(string)($_GET['type']??'branch');if(!in_array($type,['branch','postomat'],true))throw new InvalidArgumentException('Невірний спосіб доставки.');npCity($db,$ref);
    // Query by description on the server; no giant city-wide list sent to the browser.
    $props=['CityRef'=>$ref,'FindByString'=>$q,'Limit'=>'100','Page'=>'1'];
    foreach(npCached($db,'Address','getWarehouses',$props,3600) as $r){$postomat=str_contains(npNormalize((string)($r['Description']??'')),'поштомат');if(($type==='postomat')!==$postomat||!npRef($r['Ref']??'')||($r['CityRef']??'')!==$ref|| (isset($r['WarehouseStatus'])&&$r['WarehouseStatus']!=='Working'))continue;$items[]=['ref'=>$r['Ref'],'name'=>$r['Description'],'note'=>$r['ShortAddress']??''];if(count($items)>=20)break;}
  }elseif($kind==='streets'){
    $ref=(string)($_GET['city_ref']??'');if(!npRef($ref))throw new InvalidArgumentException('Оберіть місто зі списку.');npCity($db,$ref);if(mb_strlen($q)<2)shopJson(['ok'=>true,'enabled'=>true,'items'=>[]]);
    foreach(npCached($db,'Address','getStreet',['CityRef'=>$ref,'FindByString'=>$q,'Limit'=>'20','Page'=>'1'],86400) as $r)if(npRef($r['Ref']??''))$items[]=['ref'=>$r['Ref'],'name'=>trim(($r['StreetsType']??'').' '.($r['Description']??'')),'note'=>'Вулиця'];
  }else throw new InvalidArgumentException('Невідомий довідник.');
  shopJson(['ok'=>true,'enabled'=>true,'items'=>$items]);
}catch(InvalidArgumentException|NpNotFound $e){shopJson(['ok'=>false,'error'=>$e->getMessage()],400);// the customer's input, not a provider outage
}catch(Throwable $e){shopJson(['ok'=>false,'error'=>'Довідник НП тимчасово недоступний. Спробуйте пізніше або зверніться до менеджера.'],503);}
