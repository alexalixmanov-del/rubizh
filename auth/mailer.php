<?php
declare(strict_types=1);
if (!defined('RUBIZH_AUTH')) { http_response_code(404); exit; }
require_once __DIR__.'/email-templates.php';

/** Plain alternative and HTML with an embedded PNG header. No remote images. */
function rubizhMailPayload(string $recipient, array $email): string {
    if (!filter_var($recipient,FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n<>]/',$recipient)) { throw new RuntimeException('Некоректний email.'); }
    $alternative='rubizh_alt_'.bin2hex(random_bytes(18));
    $related='rubizh_related_'.bin2hex(random_bytes(18));
    $headers=['Date: '.gmdate('D, d M Y H:i:s').' +0000','Message-ID: <'.bin2hex(random_bytes(16)).'@rubizh.shop>','From: =?UTF-8?B?'.base64_encode('РУБІЖ').'?= <noreply@rubizh.shop>','To: <'.$recipient.'>','Reply-To: <'.(filter_var(rubizhSeller()['email'],FILTER_VALIDATE_EMAIL)?rubizhSeller()['email']:'info@rubizh.shop').'>','Subject: =?UTF-8?B?'.base64_encode($email['subject']).'?=','MIME-Version: 1.0','Content-Type: multipart/alternative; boundary="'.$alternative.'"'];
    $encode=static fn(string $body): string=>chunk_split(base64_encode($body),76,"\r\n");
    $payload=implode("\r\n",$headers)."\r\n\r\n";
    $payload.='--'.$alternative."\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n".$encode($email['plain']);
    $payload.='--'.$alternative."\r\nContent-Type: multipart/related; boundary=\"".$related."\"; type=\"text/html\"\r\n\r\n";
    $payload.='--'.$related."\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n".$encode($email['html']);
    $images=['rubizh-header@rubizh.shop'=>'email-banner.png','rubizh-clock@rubizh.shop'=>'email-clock.png','rubizh-shield@rubizh.shop'=>'email-shield.png'];
    foreach ($images as $cid=>$filename) {
        if (!str_contains($email['html'],'cid:'.$cid)) { continue; }
        $image=file_get_contents(__DIR__.'/'.$filename);
        if ($image===false) { throw new RuntimeException('Не вдалося підготувати лист.'); }
        $payload.='--'.$related."\r\nContent-Type: image/png; name=\"".$filename."\"\r\nContent-Transfer-Encoding: base64\r\nContent-ID: <".$cid.">\r\nContent-Disposition: inline; filename=\"".$filename."\"\r\n\r\n".$encode($image);
    }
    return $payload.'--'.$related."--\r\n".'--'.$alternative."--\r\n";
}

function rubizhSendEmail(string $recipient, string $password, array $email): void {
    if (!filter_var($recipient, FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n<>]/', $recipient)) { throw new RuntimeException('Некоректний email.'); }
    if (!extension_loaded('curl') || !in_array('smtps', curl_version()['protocols'], true)) { throw new RuntimeException('Пошта тимчасово недоступна. Зверніться до менеджера.'); }
    $from='noreply@rubizh.shop';
    $payload=rubizhMailPayload($recipient,$email);
    $stream=fopen('php://temp','w+');
    if (!$stream) { throw new RuntimeException('Не вдалося надіслати лист. Спробуйте пізніше.'); }
    $curl=null;
    try {
        fwrite($stream,$payload); rewind($stream);
        $curl=curl_init('smtps://mail.adm.tools:465');
        curl_setopt_array($curl,[CURLOPT_USERNAME=>$from,CURLOPT_PASSWORD=>$password,CURLOPT_MAIL_FROM=>'<'.$from.'>',CURLOPT_MAIL_RCPT=>['<'.$recipient.'>'],CURLOPT_UPLOAD=>true,CURLOPT_INFILE=>$stream,CURLOPT_INFILESIZE=>strlen($payload),CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>15,CURLOPT_TIMEOUT=>35,CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_FOLLOWLOCATION=>false]);
        if (curl_exec($curl)===false) { error_log('rubizh SMTP: curl code '.curl_errno($curl).' · server response '.curl_getinfo($curl,CURLINFO_RESPONSE_CODE).' · '.curl_error($curl)); throw new RuntimeException('Не вдалося надіслати лист. Спробуйте пізніше або зверніться до менеджера.'); }
    } finally { if ($curl!==null) { curl_close($curl); } fclose($stream); }
}

function rubizhSendLogin(string $recipient, string $password, string $link): void {
    rubizhSendEmail($recipient,$password,rubizhLoginEmail($link));
}

/** Call once after saving a real order. Checkout/CRM owns retries and deduplication. */
function rubizhSendOrder(string $recipient, string $password, array $order): void {
    rubizhSendEmail($recipient,$password,rubizhOrderEmail($order));
}
