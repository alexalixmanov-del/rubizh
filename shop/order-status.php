<?php
declare(strict_types=1);
require __DIR__.'/../auth/bootstrap.php';
header('Cache-Control: no-store');
try{
 if(($_SERVER['REQUEST_METHOD']??'GET')!=='GET')shopJson(['ok'=>false,'error'=>'Тільки читання.'],405);
 $db=shopStoreDatabase();shopLimit($db,'order-status',120,60);$number=customerField($_GET,'number',80);if($number==='')shopJson(['ok'=>false,'error'=>'Вкажіть номер замовлення.'],400);
 $q=$db->prepare('SELECT id FROM rubizh_customer_orders WHERE order_number=?');$q->execute([$number]);$id=(int)$q->fetchColumn();if(!$id||!shopMayReadOrder($db,$id))shopJson(['ok'=>false,'error'=>'Відкрийте замовлення у своєму кабінеті або в браузері, де його оформляли.'],404);
 $order=shopOrderReceipt($db,$id);$source=npOrder($db,$id);$source['shipments']=npShipments($db,$id);$source['timeline']=shopTimeline($db,$source);
 $order['current_step']=shopTimelineCurrent($source);
 $order['ui_version']=shopOrderUiVersion($source+['donation'=>$order['donation']]);
 shopJson(['ok'=>true,'order'=>$order,'email_status'=>shopOrderMailStatus($db,$id)]);
}catch(Throwable $e){error_log('rubizh order receipt: '.$e->getMessage());shopJson(['ok'=>false,'error'=>'Замовлення тимчасово недоступне. Спробуйте ще раз.'],503);}
