<?php
declare(strict_types=1);
require __DIR__.'/../auth/bootstrap.php';
try{if(($_SERVER['REQUEST_METHOD']??'GET')!=='POST')shopJson(['ok'=>false,'error'=>'Тільки POST.'],405);$input=shopBody();shopCsrf($input);$db=shopStoreDatabase();shopLimit($db,'payment-start',12,60);$id=(int)($input['order_id']??0);if(!$id||!shopMayReadOrder($db,$id))shopJson(['ok'=>false,'error'=>'Замовлення недоступне.'],404);$payment=monoCreate($db,$id);if(empty($payment['url']))throw new RuntimeException('Рахунок потребує звірки. Зверніться до менеджера.');shopJson(['ok'=>true,'url'=>$payment['url']]);}catch(Throwable $e){shopJson(['ok'=>false,'error'=>$e instanceof PDOException?'Не вдалося відкрити оплату.':$e->getMessage()],400);}
