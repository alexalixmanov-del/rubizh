<?php
declare(strict_types=1);
require __DIR__.'/../auth/bootstrap.php';
header("Content-Security-Policy: default-src 'none'; style-src 'self' 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
$error='';$notice='';
try{
 $db=shopStoreDatabase();$id=max(0,(int)($_GET['order']??$_POST['order']??0));
 if(!$id){$q=$db->prepare('SELECT order_id FROM rubizh_mono_invoices WHERE id=?');$q->execute([(int)($_GET['invoice']??0)]);$id=(int)$q->fetchColumn();}
 if(!$id||!shopMayReadOrder($db,$id))throw new RuntimeException('Увійдіть у кабінет покупця або відкрийте цю сторінку на пристрої, де оформляли замовлення.');
 if(($_SERVER['REQUEST_METHOD']??'GET')==='POST'){
  shopCsrf($_POST);shopLimit($db,'payment',12,60);$action=(string)($_POST['action']??'');
  if($action==='retry'){if(!monoConfigured())throw new RuntimeException('Оплату карткою ще не підключено.');$payment=monoCreate($db,$id);if(empty($payment['url']))throw new RuntimeException('Рахунок потребує звірки. Зверніться до менеджера.');header('Location: '.$payment['url'],true,303);exit;}
  elseif($action==='invoice'){shopUseInvoice($db,$id);$notice='Обрано оплату на рахунок ФОП. Менеджер надішле реквізити після підтвердження.';}
  elseif($action==='cancel'){shopCancelOrder($db,$id);$notice='Замовлення скасовано. Менеджеру надіслано сповіщення.';}
  else throw new RuntimeException('Невідома дія.');
 }
 $order=npOrder($db,$id);$q=$db->prepare('SELECT * FROM rubizh_mono_invoices WHERE order_id=? ORDER BY id DESC LIMIT 1');$q->execute([$id]);$invoice=$q->fetch(PDO::FETCH_ASSOC);
 if($invoice&&monoConfigured()&&in_array($invoice['status'],['created','processing','hold'],true)){
  try{monoRefresh($db,$invoice);$order=npOrder($db,$id);$q->execute([$id]);$invoice=$q->fetch(PDO::FETCH_ASSOC);}catch(Throwable $e){$notice='Очікуємо підтвердження банку. Повернення на сайт саме по собі не підтверджує оплату.';}
 }
 $receipt=shopOrderReceipt($db,$id);
}catch(Throwable $e){$error=$e instanceof PDOException?'Замовлення тимчасово недоступне. Спробуйте пізніше.':$e->getMessage();}
?><!doctype html><html lang="uk"><head><script src="/assets/theme.js?v=3"></script><link rel="stylesheet" href="/assets/theme.css?v=2"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>РУБІЖ · замовлення</title><script defer src="/assets/receipt.js"></script><link rel="stylesheet" href="/shop/np-manager.css"><link rel="stylesheet" href="/assets/theme.css?v=2"></head><body><header><a href="/">РУБІЖ</a><a href="/auth/?tab=orders">Мої замовлення</a></header><main class="receipt-shell">
<?php if($error): ?><div class="error" role="alert"><?=esc($error)?></div><?php endif; ?>
<?php if(isset($receipt)){require __DIR__.'/receipt-view.php';} ?>
<p><a href="tel:+380976867892">Зателефонувати менеджеру</a> · <a href="/catalog">До каталогу</a></p></main></body></html>
