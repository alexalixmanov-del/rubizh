<?php
declare(strict_types=1);
require_once __DIR__.'/../shop/donation-target.php';
if (!defined('RUBIZH_AUTH')) { http_response_code(404); exit; }

require_once __DIR__.'/../api/seller.php';

function rubizhEmailEsc(string $value): string {
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function rubizhEmailLayout(string $preheader, string $content): string {
    return '<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>РУБІЖ</title></head>'
        .'<body style="margin:0;padding:0;background-color:#090F0A;color:#A7B499;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">'
        .'<div style="display:none;font-size:1px;color:#090F0A;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">'.rubizhEmailEsc($preheader).'</div>'
        .'<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#090F0A"><tr><td align="center" style="padding:0">'
        .'<!--[if mso]><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->'
        .'<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#10170F" style="max-width:600px;background-color:#10170F;text-align:left">'
        .'<tr><td bgcolor="#10170F" style="padding:0;line-height:0;border-bottom:1px solid #7A876B"><a href="https://rubizh.shop/" style="text-decoration:none"><img src="cid:rubizh-header@rubizh.shop" width="600" height="376" alt="РУБІЖ · Свої знають, де знайти своє. Увійдіть до кабінету, щоб переглянути свої замовлення." border="0" style="display:block;width:100%;max-width:600px;height:auto;color:#F2F0E7;font-size:22px;line-height:30px"></a></td></tr>'
        .'<tr><td style="padding:26px 36px 24px;text-align:left">'.$content.'</td></tr>'
        .'<tr><td style="padding:20px 36px 28px;background-color:#10170F;border-top:1px solid #4B583F;text-align:left"><p style="margin:0 0 4px;font-size:13px;line-height:21px;color:#A7B499">Потрібна допомога? Відповідайте на цей лист.</p>'
        .'<p style="margin:0;font-size:13px;line-height:21px;color:#A7B499">Команда РУБІЖ<br>'.rubizhEmailEsc(rubizhSeller()['name']).'<br><a href="https://rubizh.shop/" style="color:#A7B499;text-decoration:underline">rubizh.shop</a></p></td></tr></table>'
        .'<!--[if mso]></td></tr></table><![endif]-->'
        .'</td></tr></table></body></html>';
}

function rubizhEmailButton(string $url, string $label): string {
    return '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px"><tr><td align="center" bgcolor="#F5A332" style="background-color:#F5A332;border-radius:6px;text-align:center">'
        .'<a href="'.rubizhEmailEsc($url).'" style="display:block;padding:17px 12px;background-color:#F5A332;border:1px solid #F5A332;border-radius:6px;color:#0E150D;font-size:20px;line-height:26px;font-weight:bold;text-decoration:none;text-align:center;mso-padding-alt:0">'
        .'<!--[if mso]><i style="mso-font-width:150%;mso-text-raise:24pt" hidden>&emsp;</i><![endif]-->'
        .rubizhEmailEsc($label).'<!--[if mso]><i style="mso-font-width:150%" hidden>&emsp;&#8203;</i><![endif]--></a></td></tr></table>';
}

/** Content only: does not send email or consume a login token. */
function rubizhLoginEmail(string $link): array {
    $plain="Добрий день!\n\nВи запросили вхід до РУБІЖ. Відкрийте посилання та підтвердьте вхід:\n".$link."\n\nПосилання одноразове та діє 45 хвилин. Якщо ви не запитували вхід, просто проігноруйте цей лист.\n\nПотрібна допомога? Відповідайте на цей лист.\nКоманда РУБІЖ\nhttps://rubizh.shop";
    $content=rubizhEmailButton($link,'Увійти до кабінету →')
        .'<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px"><tr><td width="24" valign="middle" style="padding-right:12px;line-height:0"><img src="cid:rubizh-clock@rubizh.shop" width="22" height="22" alt="" style="display:block;border:0"></td><td><p style="margin:0;font-size:14px;line-height:23px;color:#A7B499">Одноразове посилання · діє <strong style="color:#F2F0E7;white-space:nowrap">45 хвилин</strong></p></td></tr></table>'
        .'<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #3B4733;border-radius:5px;background-color:#172015"><tr><td style="padding:18px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td width="32" valign="middle" style="padding-right:16px;border-right:1px solid #44513B"><img src="cid:rubizh-shield@rubizh.shop" width="28" height="35" alt="" style="display:block;border:0"></td><td style="padding-left:16px"><p style="margin:0;font-size:14px;line-height:22px;color:#A7B499">Якщо ви не запитували вхід, просто проігноруйте цей лист. Не пересилайте посилання іншим.</p></td></tr></table></td></tr></table>'
        .'<p style="margin:28px 0 8px;font-size:13px;line-height:21px;color:#A7B499">Кнопка не працює? Скопіюйте посилання в браузер:</p>'
        .'<p style="margin:0;font-size:13px;line-height:21px;word-break:break-all;overflow-wrap:anywhere"><a href="'.rubizhEmailEsc($link).'" style="color:#A7B499;word-break:break-all;text-decoration:underline">'.rubizhEmailEsc($link).'</a></p>';
    return ['subject'=>'Ваше посилання для входу — РУБІЖ','plain'=>$plain,'html'=>rubizhEmailLayout('Ваше одноразове посилання для входу. Діє 45 хвилин.',$content)];
}

function rubizhEmailMoney(mixed $amount, string $currency): string {
    if (!is_numeric($amount) || !is_finite((float)$amount) || (float)$amount<0) { throw new InvalidArgumentException('Некоректна сума замовлення.'); }
    return number_format((float)$amount,2,',',' ').' '.($currency==='UAH' ? '₴' : $currency);
}

function rubizhCartReminderEmail(array $items,string $code): array {
 if(!$items||!preg_match('/^[a-f0-9]{64}$/D',$code))throw new InvalidArgumentException('Некоректний кошик.');
 $url='https://rubizh.shop/shop/cart-return.php?code='.$code;$cancel=$url.'&unsubscribe=1';$rows='';$plain=[];
 foreach($items as $item){
  $name=(string)$item['name'];$variant=(string)($item['variant']??'');$qty=(float)$item['qty'];if(trim($name)===''||!is_finite($qty)||$qty<=0)throw new InvalidArgumentException('Некоректний товар.');
  $label=$name.($variant!==''?' · '.$variant:'').' — '.$qty.(($item['sale_unit']??'')==='m2'?' м²':' шт.');$plain[]=$label;
  $rows.='<tr><td style="padding:16px 0;border-bottom:1px solid #3B4733;color:#F2F0E7;font-size:14px;line-height:23px;overflow-wrap:anywhere">'.rubizhEmailEsc($label).'</td></tr>';
 }
 $intro='Ви залишили спорядження в кошику й попросили нагадати про нього. Замовлення ще не оформлене.';
 $note='Після повернення перевірте наявність, розмір і підсумкову ціну. Товари в кошику не резервуються.';
 $content='<h1 style="font-size:28px;line-height:36px;color:#F2F0E7">Ваше спорядження залишилось у кошику</h1><p style="color:#A7B499;line-height:24px">'.rubizhEmailEsc($intro).'</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0">'.$rows.'</table><div style="padding-top:24px">'.rubizhEmailButton($url,'Повернутися до кошика →').'</div><p style="color:#A7B499;font-size:13px;line-height:22px">'.rubizhEmailEsc($note).'</p><p style="color:#A7B499;font-size:12px;line-height:20px">Це одноразове нагадування. <a href="'.rubizhEmailEsc($cancel).'" style="color:#A7B499">Вимкнути нагадування про цей кошик</a></p>';
 return ['subject'=>'Ваш кошик чекає на вас — РУБІЖ','plain'=>$intro."\n\n".implode("\n",$plain)."\n\nПовернутися до кошика: ".$url."\n\n".$note."\nВимкнути нагадування: ".$cancel,'html'=>rubizhEmailLayout('Одноразове нагадування про ваш кошик.',$content)];
}

/** For future trusted checkout/CRM integration, using a persisted order, never browser prices. */
function rubizhOrderEmail(array $order): array {
    $number=trim((string)($order['order_number'] ?? ''));
    if ($number==='' || strlen($number)>240 || preg_match('/[\x00-\x1F\x7F]/',$number)) { throw new InvalidArgumentException('Некоректний номер замовлення.'); }
    $currency=(string)($order['currency'] ?? 'UAH');
    if (!preg_match('/^[A-Z]{3}$/D',$currency)) { throw new InvalidArgumentException('Некоректна валюта.'); }
    $total=rubizhEmailMoney($order['total'] ?? null,$currency);
    $lines=json_decode((string)($order['items_json'] ?? ''),true,512,JSON_THROW_ON_ERROR);
    if (!is_array($lines) || !$lines) { throw new InvalidArgumentException('Замовлення не містить товарів.'); }
    $payment=['pending'=>'Очікує оплати','paid'=>'Оплачено','cod'=>'Оплата при отриманні','refunded'=>'Кошти повернено','failed'=>'Оплата не пройшла'][(string)($order['payment_status'] ?? '')] ?? 'Уточнюється';
    $delivery=(string)($order['delivery_label'] ?? '');
    $stage=in_array($order['status']??'',['cancelled','returned'],true)||($order['payment_status']??'')==='refunded'?'cancelled':(($order['payment_status']??'')==='paid'?'paid':'pending');
    $ready=in_array($order['status']??'',['confirmed','processing','shipped','completed'],true);if($stage==='pending'&&!$ready)$payment='Очікує підтвердження наявності';
    $title=['pending'=>$ready?'Наявність підтверджено — можна оплатити':'Замовлення отримано — очікуйте підтвердження','paid'=>'Замовлення оформлено','cancelled'=>'Скасовано'][$stage];
    if(($order['mail_event']??'')==='shipped'&&$stage!=='cancelled')$title='Передано Новій пошті';
    if(($order['mail_event']??'')==='reminder'&&$stage==='pending')$title='Нагадування: залишилась оплата';
    if(($order['mail_event']??'')==='arrived'&&$stage!=='cancelled')$title='Замовлення прибуло у відділення';
    if(($order['mail_event']??'')==='received'&&$stage!=='cancelled')$title='Дякуємо — замовлення отримано';
    if(!empty($order['split_delivery'])&&in_array($order['mail_event']??'',['shipped','arrived','received'],true))$title=['shipped'=>'Частину замовлення передано Новій пошті','arrived'=>'Частина замовлення прибула у відділення','received'=>'Частину замовлення отримано'][$order['mail_event']];
    $donation=(int)round((float)$order['total']*.03,0,PHP_ROUND_HALF_UP);
    $brigade=shopDonationBrigade($order['contact']??[]);
    $donationText=$stage==='cancelled'?'Внесок за скасованим або поверненим замовленням не нараховується.':($stage==='pending'?'Після оплати '.$donation.' ₴ підуть на '.$brigade.'. ':'').'Протягом 3 робочих днів після оплати надішлемо скрін переказу на '.$brigade.' у Viber або Telegram. Ваш внесок — '.$donation.' ₴.';
    $deadline='';if($ready&&$stage==='pending'&&($order['payment_status']??'')!=='cod'&&!empty($order['payment_due'])){$deadline='Резерв до '.(new DateTimeImmutable($order['payment_due'],new DateTimeZone('UTC')))->setTimezone(new DateTimeZone('Europe/Kyiv'))->format('d.m.Y H:i').' (2 банківські дні). Після закінчення строку неоплачене замовлення скасуємо, якщо банк підтвердить відсутність оплати.';}

    $rows=''; $plainLines=[];
    foreach ($lines as $line) {
        if (!is_array($line) || trim((string)($line['name'] ?? ''))==='') { throw new InvalidArgumentException('Некоректний товар у замовленні.'); }
        $qty=is_numeric($line['qty']??null)?(float)$line['qty']:false;$unit=($line['sale_unit']??'')==='m2'?'м²':'шт.';
        if ($qty===false||$qty<=0) { throw new InvalidArgumentException('Некоректна кількість товару.'); }
        $name=(string)$line['name']; $variant=(string)($line['variant'] ?? '');
        rubizhEmailMoney($line['price'] ?? null,$currency);
        $subtotal=rubizhEmailMoney((float)$line['price']*$qty,$currency);
        $rows.='<tr><td style="padding:16px 10px 16px 0;border-bottom:1px solid #3B4733;font-size:14px;line-height:21px;overflow-wrap:anywhere;word-break:break-word">'.rubizhEmailEsc($name)
            .($variant!=='' ? '<br><span style="font-size:12px;color:#99A68D">'.rubizhEmailEsc($variant).'</span>' : '')
            .'<br><span style="font-size:12px;color:#99A68D">'.$qty.' '.$unit.'</span></td><td width="108" align="right" valign="top" style="padding:16px 0;border-bottom:1px solid #3B4733;font-size:14px;line-height:21px;color:#F2F0E7;white-space:nowrap">'.rubizhEmailEsc($subtotal).'</td></tr>';
        $plainLines[]=$name.($variant!=='' ? ' · '.$variant : '').' — '.$qty.' '.$unit.' — '.$subtotal;
    }
    $summaryRows='';$summaryPlain='';
    foreach(['subtotal'=>'Товари','discount_amount'=>'Промокод','shipping_amount'=>'Доставка'] as $key=>$label){
        if(!isset($order[$key]) || ($key==='shipping_amount'&&!empty($order['shipping_paid_to_carrier'])) || ($key==='discount_amount' && (float)$order[$key]<=0))continue;
        $value=($key==='discount_amount'?'−':'').rubizhEmailMoney($order[$key],$currency);
        $summaryRows.='<tr><td style="padding:6px 8px 6px 0;font-size:14px;color:#A7B499">'.rubizhEmailEsc($label).'</td><td align="right" style="font-size:14px;color:#F2F0E7;white-space:nowrap">'.rubizhEmailEsc($value).'</td></tr>';
        $summaryPlain.="\n".$label.': '.$value;
    }
    if(!empty($order['shipping_paid_to_carrier'])){$summaryRows.='<tr><td style="padding:6px 8px 6px 0;font-size:14px;color:#A7B499">Доставка</td><td align="right" style="font-size:14px;color:#F2F0E7">Окремо за тарифом НП</td></tr>';$summaryPlain.="\nДоставка: окремо за тарифом НП";}
    $content='<p style="margin:0 0 12px;font-size:11px;line-height:16px;letter-spacing:1.5px;font-weight:bold;color:#A7B499">ВАШЕ ЗАМОВЛЕННЯ</p>'
        .'<p style="display:inline-block;padding:6px 10px;border-radius:20px;background:'.($stage==='paid'?'#E6F2E3':($stage==='cancelled'?'#FBE6E4':'#FDF1DF')).';color:'.($stage==='paid'?'#2F6B2A':($stage==='cancelled'?'#A12C22':'#9A5B00')).';font-size:12px">'.rubizhEmailEsc($payment).'</p><h1 style="margin:0 0 18px;font-size:30px;line-height:36px;letter-spacing:-0.5px;color:#F2F0E7">'.rubizhEmailEsc($title).'</h1>'
        .'<p style="margin:0 0 20px;font-size:16px;line-height:25px;color:#A7B499">Ми отримали замовлення <strong style="color:#F2F0E7;overflow-wrap:anywhere;word-break:break-word">№ '.rubizhEmailEsc($number).'</strong>. Деталі — нижче.</p>'
        .'<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="table-layout:fixed">'.$rows.'</table>'
        .'<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">'.$summaryRows.'<tr><td style="padding:20px 8px 20px 0;font-size:15px;color:#A7B499">Сума замовлення</td><td align="right" style="padding:20px 0;font-size:20px;font-weight:bold;color:#F2F0E7;white-space:nowrap">'.rubizhEmailEsc($total).'</td></tr></table>'
        .'<p style="margin:0 0 10px;font-size:14px;line-height:22px;color:#A7B499"><strong style="color:#F2F0E7">Оплата:</strong> '.rubizhEmailEsc($payment).'</p>'
        .($delivery!=='' ? '<p style="margin:0;font-size:14px;line-height:22px;color:#A7B499;overflow-wrap:anywhere;word-break:break-word"><strong style="color:#F2F0E7">Доставка:</strong> '.rubizhEmailEsc($delivery).'</p>' : '')
        .'<div style="padding-top:24px">'.rubizhEmailButton('https://rubizh.shop/auth/?tab=orders','Переглянути замовлення →').'</div>';
    if($ready&&$stage==='pending'){$link='https://rubizh.shop/shop/payment-return.php?order='.(int)($order['id']??0);$content.='<p>Наявність і комплектацію підтверджено менеджером.</p>'.rubizhEmailButton($link,'Перейти до оплати →');$summaryPlain.="\nОплата: ".$link;}elseif($stage==='pending'){$content.='<p>Перевіримо наявність і комплектацію. Оплата стане доступною після підтвердження менеджером.</p>';$summaryPlain.="\nОплачуйте після підтвердження наявності менеджером.";}
    $trackingPlain='';
    foreach($order['shipments']??[] as $shipment){$tracking=(string)($shipment['tracking_number']??'');if(!preg_match('/^\d{14}$/D',$tracking)||in_array($shipment['status']??'',['cancelled','returned'],true))continue;$trackingPlain.="\nТТН: ".$tracking." · https://novaposhta.ua/tracking/?cargo_number=".$tracking;$content.='<p style="color:#A7B499;line-height:24px">ТТН: <a href="https://novaposhta.ua/tracking/?cargo_number='.$tracking.'" style="color:#F2A33C">'.$tracking.'</a></p>';}
    $seller=rubizhSeller();$paymentDetails='';
    if($ready&&$stage==='pending'&&($order['payment_method']??'')==='invoice'&&in_array($order['payment_status']??'',['pending','failed'],true)){$paymentDetails="\n\nОплата після підтвердження наявності — 100% на рахунок ФОП.\n".$seller['name']."\nРНОКПП: ".$seller['tax_id']."\nIBAN: ".$seller['iban']."\nБанк: ".$seller['bank']."\nПризначення: оплата замовлення ".$number;$content.='<div style="color:#A7B499;white-space:pre-wrap">'.rubizhEmailEsc($paymentDetails).'</div>';}
    $docs=count(array_filter($lines,fn($l)=>!empty($l['has_docs'])));$docText=$docs?"\nПротокол випробувань додається до замовлення; до покупки надаємо за запитом":'';if($docs)$content.='<p style="color:#A7B499">'.rubizhEmailEsc(trim($docText)).'</p>';
    $plain=$title."\n\n".$donationText."\n".$deadline."\n\nЗамовлення № ".$number."\n\n".implode("\n",$plainLines).$summaryPlain.$paymentDetails.$docText."\n\nСума замовлення: ".$total."\nОплата: ".$payment.($delivery!=='' ? "\nДоставка: ".$delivery : '')."\n\nВаші замовлення: https://rubizh.shop/auth/?tab=orders\n\nПотрібна допомога? Відповідайте на цей лист.\nКоманда РУБІЖ\nhttps://rubizh.shop";
     $content.='<p style="font-size:15px;color:#F2F0E7;line-height:1.6">'.rubizhEmailEsc($donationText).'</p><p style="color:#A7B499">'.rubizhEmailEsc($deadline).'</p>';
    $plain.=$trackingPlain;
    return ['subject'=>$title.' · № '.$number.' — РУБІЖ','plain'=>$plain,'html'=>rubizhEmailLayout('Ми отримали ваше замовлення № '.$number.'.',$content)];
}
