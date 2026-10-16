<?php
declare(strict_types=1);
// 5-3: the buyer's invoice PDF (receipt page and cabinet). Only the order's owner — the device that placed it or the
// signed-in customer (shopMayReadOrder) — may download it; anyone else gets 404 (no order enumeration).
require __DIR__.'/../auth/bootstrap.php';require_once __DIR__.'/invoice-pdf.php';
header('X-Robots-Tag: noindex, nofollow');
try{
 $db=shopStoreDatabase();$id=max(0,(int)($_GET['order']??0));
 if(!$id||!shopMayReadOrder($db,$id)){http_response_code(404);header('Content-Type: text/plain; charset=UTF-8');echo 'Замовлення не знайдено.';exit;}
 shopLimit($db,'invoice-pdf',30,3600);
 shopInvoiceSend($db,$id);
}catch(ShopInvoiceUnavailable $e){
 http_response_code(409);header('Content-Type: text/plain; charset=UTF-8');header('Cache-Control: no-store');
 echo match($e->getMessage()){'NOT_READY'=>'Рахунок буде доступний після підтвердження замовлення менеджером.','NOT_INVOICE'=>'Замовлення оплачується карткою — рахунок ФОП не потрібен.','CANCELLED'=>'Замовлення скасовано.',default=>'Рахунок тимчасово недоступний. Зверніться до менеджера.'};
}catch(Throwable $e){
 error_log('rubizh invoice: '.get_class($e));http_response_code(500);header('Content-Type: text/plain; charset=UTF-8');echo 'Рахунок тимчасово недоступний. Спробуйте пізніше.';
}
