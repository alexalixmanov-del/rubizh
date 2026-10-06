<?php
declare(strict_types=1);
require __DIR__.'/../auth/bootstrap.php';
try{
 if(($_SERVER['REQUEST_METHOD']??'')!=='POST')shopJson(['ok'=>false,'error'=>'Тільки POST.'],405);
 $input=shopBody();shopCsrf($input);$db=shopStoreDatabase();$scope=hash('sha256',(string)($_SESSION['checkout_scope']??''));
 if(empty($_SESSION['checkout_scope']))throw new RuntimeException('Оновіть оформлення.');
 $action=$input['action']??'';
 if($action==='restore'){
  $code=(string)($_SESSION['cart_recovery']??'');$row=shopCartReminderRow($db,$code);unset($_SESSION['cart_recovery']);
  if(!$row)throw new RuntimeException('Посилання на кошик закінчилося. Оберіть товари в каталозі.');
  $items=shopCartReminderCurrentItems($db,$row);shopJson(['ok'=>true,'items'=>$items,'products'=>shopProductsByIds($db,array_column($items,'product_id')),'omitted'=>count(json_decode($row['items_json'],true))-count($items)]);
 }
 if($action==='cancel'){shopCartReminderCancel($db,$scope);shopJson(['ok'=>true,'active'=>false]);}
 if($action!=='save')throw new RuntimeException('Невідома дія.');
 if(!shopCartRemindersEnabled())throw new RuntimeException('Нагадування тимчасово недоступні.');
 shopLimit($db,'cart-reminder',30);$result=shopCartReminderSave($db,$scope,customerId(),$input);shopJson(['ok'=>true]+$result);
}catch(Throwable $e){if(($action??'')==='save'&&isset($db,$scope)){try{shopCartReminderCancel($db,$scope);}catch(Throwable $cleanup){/* A failed database connection is reported below. */}}error_log('rubizh cart reminder request: '.get_class($e));shopJson(['ok'=>false,'error'=>$e instanceof PDOException?'Нагадування тимчасово недоступні.':$e->getMessage()],400);}
