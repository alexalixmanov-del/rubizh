<?php
declare(strict_types=1);
require __DIR__.'/../auth/bootstrap.php';
header('Cache-Control: private, no-store');header('X-Content-Type-Options: nosniff');
try{$db=shopStoreDatabase();$id=max(0,(int)($_GET['order']??0));$manager=false;try{npManagerId();$manager=true;}catch(Throwable $e){}
 if(!$id||(!$manager&&!shopMayReadOrder($db,$id)))throw new RuntimeException('Недоступно.');$eligible=$manager?'':" AND o.payment_status='paid' AND o.status NOT IN ('cancelled','returned')";
 $q=$db->prepare('SELECT b.id,b.image_mime,b.image_data FROM rubizh_order_donations d JOIN rubizh_donation_batches b ON b.id=d.batch_id JOIN rubizh_customer_orders o ON o.id=d.order_id WHERE d.order_id=?'.$eligible);$q->execute([$id]);$r=$q->fetch(PDO::FETCH_ASSOC);if(!$r||!in_array($r['image_mime'],['image/png','image/jpeg','image/webp'],true))throw new RuntimeException('Недоступно.');$ext=['image/png'=>'png','image/jpeg'=>'jpg','image/webp'=>'webp'][$r['image_mime']];header('Content-Type: '.$r['image_mime']);header('Content-Disposition: '.(($_GET['download']??'')==='1'?'attachment':'inline').'; filename="rubizh-transfer-'.(int)$r['id'].'.'.$ext.'"');echo $r['image_data'];
}catch(Throwable $e){http_response_code(404);header('Content-Type: text/plain; charset=utf-8');echo 'Скрін недоступний.';}
