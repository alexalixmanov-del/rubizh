<?php
declare(strict_types=1);
require __DIR__.'/../auth/bootstrap.php';
try{if(($_SERVER['REQUEST_METHOD']??'GET')!=='GET')shopJson(['ok'=>false,'error'=>'Тільки читання.'],405);$db=shopStoreDatabase();$id=(int)($_GET['order']??0);if(!$id||!shopMayReadOrder($db,$id))shopJson(['ok'=>false,'error'=>'Замовлення недоступне.'],404);$o=npOrder($db,$id);if(!in_array($o['status'],['delivered','completed','cancelled'],true))throw new RuntimeException('Повтор доступний для отриманого або скасованого замовлення.');$products=shopProductsByIds($db,array_column($o['items'],'product_id'));shopJson(['ok'=>true,'items'=>$o['items'],'products'=>$products]);}catch(Throwable $e){shopJson(['ok'=>false,'error'=>'Не вдалося повторити замовлення.'],400);}
