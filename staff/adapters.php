<?php
declare(strict_types=1);
require_once dirname(__DIR__).'/shop/staging-gate.php';
// A9: every external service is behind a feature switch with one contract for live and mock.
// live  — the flag is ON in the server config (default OFF);
// mock  — staging stand with the provider mock (monobank mock / NP mock / test transport / local outbox);
// off   — production without the flag: the action answers 409 FEATURE_NOT_CONNECTED «Функція ще не підключена».

function crmFlags(): array {
 return ['crm_enabled'=>cfg('crm_enabled')===true,'crm_refund_live'=>cfg('crm_refund_live')===true,'crm_np_ttn_live'=>cfg('crm_np_ttn_live')===true,'crm_np_tracking_live'=>cfg('crm_np_tracking_live')===true,'crm_sms_live'=>cfg('crm_sms_live')===true,'crm_email_live'=>cfg('crm_email_live')===true];
}
function crmStaging(): bool {return rubizhStagingRelaxed();}
function crmFeature(string $name): string {
 $flag=['refund'=>'crm_refund_live','np_ttn'=>'crm_np_ttn_live','np_tracking'=>'crm_np_tracking_live','sms'=>'crm_sms_live','email'=>'crm_email_live'][$name]??throw new LogicException('feature');
 if(crmFlags()[$flag])return 'live';
 if(!crmStaging())return 'off';
 return match($name){
  'refund'=>monoMockEnabled()||defined('RUBIZH_MONO_TESTS')?'mock':'off',
  'np_ttn','np_tracking'=>npMockEnabled()||defined('RUBIZH_NP_TESTS')?'mock':'off',
  default=>'mock',
 };
}
function crmFeatureRequire(string $name): string {$m=crmFeature($name);if($m==='off')throw new CrmError('FEATURE_NOT_CONNECTED',409,['feature'=>$name]);return $m;}

/** Outgoing messages (staff invites, OWNER alerts, customer TTN notice). Returns how it was delivered. */
function crmAdapterSend(string $kind,array $message): string {
 $mode=crmFeature($kind==='sms'?'sms':'email');
 if($mode==='off')return 'shown';
 if($mode==='mock'){
  $box=(string)(cfg('crm_mock_outbox')??'');
  if($box!=='')file_put_contents($box,json_encode(['kind'=>$kind,'at'=>gmdate('c')]+$message,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES)."\n",FILE_APPEND|LOCK_EX);
  return 'mock';
 }
 if($kind==='sms'){
  require_once dirname(__DIR__).'/auth/http.php';$c=authConfig();
  $r=authHttp('https://api.turbosms.ua/message/send.json',json_encode(['recipients'=>[ltrim((string)$message['to'],'+')],'sms'=>['sender'=>$c['turbosms_sender'],'text'=>(string)$message['text']]],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),['Authorization: Bearer '.$c['turbosms_token'],'Content-Type: application/json']);
  if(!turboSmsAccepted(is_array($r)?$r:[],(string)$message['to']))throw new CrmError('PROVIDER_RESULT_UNKNOWN',409);
  return 'sent';
 }
 require_once dirname(__DIR__).'/auth/mailer.php';
 $subject=['staff_invite'=>'Запрошення до CRM РУБІЖ','staff_reset'=>'Скидання пароля CRM РУБІЖ','owner_alert'=>'CRM РУБІЖ: потрібна увага'][$message['template']??'']??'CRM РУБІЖ';
 $body=$message['text']??('Посилання (діє обмежений час): '.($message['url']??''));
 rubizhSendEmail((string)$message['to'],(string)(authConfig()['noreply_password']??''),['subject'=>$subject,'plain'=>$body,'html'=>'<p>'.htmlspecialchars($body,ENT_QUOTES).'</p>']);
 return 'sent';
}
