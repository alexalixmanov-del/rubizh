<?php
declare(strict_types=1);
// Shared by the account (shop/customer-ui.php) and the design preview renderer (dev/render-account.php).
// Plain-language order, payment and delivery states for the customer (ADDENDUM P-3); technical codes never reach the page.
function shopCustomerStates(array $o,?array $receipt=null): array {
 $status=(string)($o['status']??'');$payment=(string)($o['payment_status']??'');
 // A new order whose payment is not open yet waits for the manager; asking to pay would mislead.
 if($payment==='pending'&&$status==='new'&&is_array($receipt)&&($receipt['stage']??'')==='pending'&&empty($receipt['payment_ready']))$payment='after_confirmation';
 // D-56: the same refund ledger as the CRM — a partial bank refund of a paid order is shown as such, not as «Оплачено».
 if($payment==='paid'&&isset($o['id'])){$refunded=$o['refunded_minor']??shopOrderRefundedMinor((int)$o['id']);if($refunded>0)$payment=$refunded>=(int)round((float)($o['total']??0)*100)?'refunded':'partially_refunded';}
 return ['order'=>['new'=>'Прийнято','confirmed'=>'Підтверджено','processing'=>'Готуємо','partially_shipped'=>'Частково відправлено','shipped'=>'Відправлено','delivered'=>'Доставлено','completed'=>'Виконано','cancelled'=>'Скасовано','returned'=>'Повернено','partially_returned'=>'Частково повернено'][$status]??'Уточнюється',
  'payment'=>['after_confirmation'=>'Оплата після підтвердження','pending'=>'Очікує оплати','paid'=>'Оплачено','partially_refunded'=>'Кошти повернено частково','refunded'=>'Кошти повернено','failed'=>'Оплата не пройшла'][$payment]??'Уточнюється',
  'delivery'=>['new'=>'Ще не відправлено','confirmed'=>'Ще не відправлено','processing'=>'Ще не відправлено','partially_shipped'=>'Частково відправлено','shipped'=>'В дорозі','delivered'=>'Отримано','completed'=>'Отримано','cancelled'=>'Не відправлятиметься','returned'=>'Повернено','partially_returned'=>'Частково повернено'][$status]??'Уточнюється'];
}
// «1 товар», «2 товари», «5 товарів».
function shopGoodsCount(int $n): string {$t=$n%10;$h=$n%100;return $n.' '.($t===1&&$h!==11?'товар':($t>=2&&$t<=4&&($h<12||$h>14)?'товари':'товарів'));}
/** Successful bank refunds of an order, in kopecks (rubizh_refund_operations; 0 when the CRM ledger is absent). */
function shopOrderRefundedMinor(int $id): int {
 static $cache=[];if(isset($cache[$id]))return $cache[$id];if(!function_exists('shopStoreDatabase'))return 0; // design preview: no database
 try{$db=shopStoreDatabase();$q=$db->prepare("SELECT COALESCE(SUM(amount),0) FROM rubizh_refund_operations WHERE order_id=? AND status='success'");$q->execute([$id]);return $cache[$id]=(int)$q->fetchColumn();}
 catch(Throwable $e){return $cache[$id]=0;}
}
