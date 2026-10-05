<?php
declare(strict_types=1);
function shopSettingsPath(): string {return __DIR__.'/../api/site-settings.json';}
function shopSettingsKeys(): array {return ['seller','ga4_id','meta_pixel_id','order_notification_email','supplier_contacts','supplier_sku_map','donation_enabled','donation_percent','donation_report_url','donation_schedule'];}
function shopSettingsRead(): array {
 $f=shopSettingsPath();if(!is_file($f))return [];
 $a=json_decode((string)file_get_contents($f),true);if(!is_array($a))throw new RuntimeException('Файл налаштувань пошкоджено. Відновіть його з резервної копії.');
 return array_intersect_key($a,array_flip(shopSettingsKeys()));
}
function shopSettingsText(mixed $s,int $max=240): string {
 if(!is_string($s)||!mb_check_encoding($s,'UTF-8')||mb_strlen($s)>$max||preg_match('/[\x00-\x1f\x7f]/u',$s))throw new RuntimeException('Перевірте довжину й формат налаштувань.');return trim($s);
}
function shopSettingsValidate(array $raw): array {
 $out=[];
 if(isset($raw['seller'])){$s=$raw['seller'];if(!is_array($s))throw new RuntimeException('Перевірте реквізити.');foreach(['name','tax_id','iban','bank','mfo','bank_tax_id','address','email','phone','phone_label'] as $k){$v=shopSettingsText($s[$k]??'',500);if($v==='')continue;if($k==='email'&&!filter_var($v,FILTER_VALIDATE_EMAIL))throw new RuntimeException('Некоректний email продавця.');if($k==='iban'&&!preg_match('/^UA\d{27}$/D',str_replace(' ','',$v)))throw new RuntimeException('IBAN має починатися з UA і містити 29 символів.');$out['seller'][$k]=$v;}}
 foreach(['ga4_id','meta_pixel_id','order_notification_email','donation_report_url','donation_schedule'] as $k)if(array_key_exists($k,$raw)){$v=shopSettingsText($raw[$k],500);if($k==='ga4_id'&&$v!==''&&!preg_match('/^G-[A-Z0-9]{5,20}$/D',$v))throw new RuntimeException('Перевірте GA4 ID.');if($k==='meta_pixel_id'&&$v!==''&&!preg_match('/^\d{5,30}$/D',$v))throw new RuntimeException('Перевірте Meta Pixel ID.');if($k==='order_notification_email'&&!filter_var($v,FILTER_VALIDATE_EMAIL))throw new RuntimeException('Перевірте email замовлень.');if($k==='donation_report_url'&&$v!==''&&(!filter_var($v,FILTER_VALIDATE_URL)||!str_starts_with($v,'https://')))throw new RuntimeException('Посилання на звіти має бути HTTPS.');$out[$k]=$v;}
 if(array_key_exists('donation_enabled',$raw))$out['donation_enabled']=$raw['donation_enabled']===true;
 if(isset($raw['donation_percent'])){if(!is_numeric($raw['donation_percent'])||(float)$raw['donation_percent']<0||(float)$raw['donation_percent']>100)throw new RuntimeException('Перевірте відсоток підтримки.');$out['donation_percent']=round((float)$raw['donation_percent'],2);}
 if(isset($raw['supplier_contacts'])){if(!is_array($raw['supplier_contacts']))throw new RuntimeException('Перевірте контакти постачальників.');$out['supplier_contacts']=[];foreach($raw['supplier_contacts'] as $code=>$row){if(!preg_match('/^[a-z][a-z0-9_]{1,31}$/D',(string)$code)||!is_array($row))throw new RuntimeException('Невідомий код постачальника.');$channel=shopSettingsText($row['channel']??'');$target=shopSettingsText($row['recipient']??'');if(!in_array($channel,['email','telegram'],true)||$target==='')continue;if($channel==='email'&&!filter_var($target,FILTER_VALIDATE_EMAIL))throw new RuntimeException('Перевірте email постачальника.');if($channel==='telegram'&&!preg_match('/^-?\d{1,20}$/D',$target))throw new RuntimeException('Для Telegram потрібен числовий chat_id.');$out['supplier_contacts'][$code]=['channel'=>$channel,'recipient'=>$target,'enabled'=>($row['enabled']??false)===true];}}
 if(isset($raw['supplier_sku_map'])){if(!is_array($raw['supplier_sku_map'])||count($raw['supplier_sku_map'])>20000)throw new RuntimeException('Перевірте відповідність артикулів.');$out['supplier_sku_map']=[];foreach($raw['supplier_sku_map'] as $sku=>$native){$sku=shopSettingsText((string)$sku,64);$native=shopSettingsText($native,120);if($sku!==''&&$native!=='')$out['supplier_sku_map'][$sku]=$native;}}
 $out['donation_enabled']=true;$out['donation_percent']=3;$out['donation_schedule']='Скрін переказу у Viber або Telegram протягом 3 робочих днів після оплати.';
 return $out;
}
function shopSettingsSave(array $raw): void {
 $clean=shopSettingsValidate($raw);$dir=dirname(shopSettingsPath());$lock=fopen($dir.'/site-settings.lock','c');if(!$lock||!flock($lock,LOCK_EX))throw new RuntimeException('Не вдалося заблокувати налаштування.');$tmp=null;
 try{$all=array_replace(shopSettingsRead(),$clean);$tmp=tempnam($dir,'settings-');if(!$tmp)throw new RuntimeException('Немає прав запису в api/.');chmod($tmp,0600);if(file_put_contents($tmp,json_encode($all,JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR))===false||!rename($tmp,shopSettingsPath()))throw new RuntimeException('Не вдалося зберегти налаштування.');$tmp=null;}finally{if($tmp)@unlink($tmp);flock($lock,LOCK_UN);fclose($lock);}
}
function shopPublicSettings(): array {
 require_once __DIR__.'/../api/seller.php';return ['seller'=>rubizhSeller(),'donation'=>['enabled'=>true,'percent'=>3,'report_url'=>(string)cfg('donation_report_url'),'schedule'=>(string)cfg('donation_schedule')]];
}
