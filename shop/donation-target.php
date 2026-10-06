<?php
declare(strict_types=1);
function shopDonationDefaultBrigade(): string { return '47 ОМБр «Магура»'; }
function shopDonationTarget(mixed $value): string {
 if(!is_string($value))throw new RuntimeException('Вкажіть назву бригади текстом.');
 if(preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/',$value))throw new RuntimeException('Перевірте назву бригади.');
 $name=preg_replace('/\s+/u',' ',trim(strip_tags($value)));
 if($name===null || !preg_match('/^.{0,160}$/usD',$name) || preg_match('/[\x00-\x1F\x7F]/u',$name))throw new RuntimeException('Назва бригади має містити до 160 символів.');
 return $name!==''?$name:shopDonationDefaultBrigade();
}
function shopDonationBrigade(array $contact): string {
 try{return shopDonationTarget($contact['brigade']??'');}catch(RuntimeException $e){return shopDonationDefaultBrigade();}
}
function shopDonationBatchBrigade(array $rows): string {
 $brigades=[];foreach($rows as $row){$contact=json_decode($row['contact_json']??'{}',true);$name=shopDonationBrigade(is_array($contact)?$contact:[]);$brigades[$name]=true;}
 if(count($brigades)!==1)throw new RuntimeException('Для одного переказу оберіть замовлення лише на одну бригаду.');
 return (string)array_key_first($brigades);
}
