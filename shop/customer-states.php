<?php
declare(strict_types=1);
// Shared by the account (shop/customer-ui.php) and the design preview renderer (dev/render-account.php).
// Plain-language order, payment and delivery states for the customer (ADDENDUM P-3); technical codes never reach the page.
function shopCustomerStates(array $o): array {
 $status=(string)($o['status']??'');$payment=(string)($o['payment_status']??'');
 return ['order'=>['new'=>'Прийнято','confirmed'=>'Підтверджено','processing'=>'Готуємо','partially_shipped'=>'Частково відправлено','shipped'=>'Відправлено','delivered'=>'Доставлено','completed'=>'Виконано','cancelled'=>'Скасовано','returned'=>'Повернено','partially_returned'=>'Частково повернено'][$status]??'Уточнюється',
  'payment'=>['pending'=>'Очікує оплати','paid'=>'Оплачено','cod'=>'Оплата при отриманні','refunded'=>'Кошти повернено','failed'=>'Оплата не пройшла'][$payment]??'Уточнюється',
  'delivery'=>['new'=>'Ще не відправлено','confirmed'=>'Ще не відправлено','processing'=>'Ще не відправлено','partially_shipped'=>'Частково відправлено','shipped'=>'В дорозі','delivered'=>'Отримано','completed'=>'Отримано','cancelled'=>'Не відправлятиметься','returned'=>'Повернено','partially_returned'=>'Частково повернено'][$status]??'Уточнюється'];
}
// «1 товар», «2 товари», «5 товарів».
function shopGoodsCount(int $n): string {$t=$n%10;$h=$n%100;return $n.' '.($t===1&&$h!==11?'товар':($t>=2&&$t<=4&&($h<12||$h>14)?'товари':'товарів'));}
