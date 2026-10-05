<?php
declare(strict_types=1);
function shopDonationEligibleSql(): string {return "o.payment_status='paid' AND o.status NOT IN ('cancelled','returned') AND NOT EXISTS(SELECT 1 FROM rubizh_mono_invoices mi WHERE mi.order_id=o.id AND mi.refund_status IN ('processing','unknown','success'))";}
function shopDonationRows(PDO $db,bool $unsent=true): array {
 $q=$db->query("SELECT d.*,o.order_number,o.status,o.payment_status,c.contact_json,b.reference,b.transferred_at FROM rubizh_order_donations d JOIN rubizh_customer_orders o ON o.id=d.order_id LEFT JOIN rubizh_order_details c ON c.order_id=o.id LEFT JOIN rubizh_donation_batches b ON b.id=d.batch_id WHERE ".shopDonationEligibleSql().($unsent?' AND d.sent_at IS NULL':'')." ORDER BY d.due_at,d.order_id LIMIT 500");return $q->fetchAll(PDO::FETCH_ASSOC);
}
function shopDonationUpload(array $file): array {
 if(($file['error']??UPLOAD_ERR_NO_FILE)!==UPLOAD_ERR_OK||!is_uploaded_file($file['tmp_name']??'')||($file['size']??0)>8*1024*1024)throw new RuntimeException('Завантажте PNG, JPG або WebP до 8 МБ.');
 $bytes=file_get_contents($file['tmp_name']);if($bytes===false||strlen($bytes)>8*1024*1024)throw new RuntimeException('Скрін надто великий.');$info=@getimagesizefromstring($bytes);$mime=(new finfo(FILEINFO_MIME_TYPE))->buffer($bytes);
 if(!$info||!in_array($mime,['image/png','image/jpeg','image/webp'],true)||($info['mime']??'')!==$mime||$info[0]>16000||$info[1]>16000)throw new RuntimeException('Файл має бути зображенням PNG, JPG або WebP.');return ['mime'=>$mime,'bytes'=>$bytes];
}
function shopDonationBatch(PDO $db,string $actor,array $input,array $image): int {
 $op=trim((string)($input['operation_key']??''));if(!preg_match('/^[a-f0-9]{32}$/D',$op))throw new RuntimeException('Оновіть форму.');$ref=trim((string)($input['reference']??''));if(mb_strlen($ref)<4||mb_strlen($ref)>240)throw new RuntimeException('Вкажіть номер або реквізит фактичного переказу.');if(($input['transfer_confirmed']??'')!=='yes')throw new RuntimeException('Підтвердьте фактичний переказ на 47 ОМБр «Магура».');
 $raw=$input['orders']??[];if(!is_array($raw))throw new RuntimeException('Оберіть замовлення.');$ids=array_values(array_unique(array_filter(array_map('intval',$raw),fn($v)=>$v>0)));sort($ids);if(!$ids||count($ids)>500)throw new RuntimeException('Оберіть до 500 замовлень.');
 // Serialize batches, refunds and payment/fulfillment actions on the same order locks.
 $locks=[];try{foreach($ids as $id){$name='rubizh_np_order_'.$id;$q=$db->prepare('SELECT GET_LOCK(?,10)');$q->execute([$name]);if((int)$q->fetchColumn()!==1)throw new RuntimeException('Замовлення обробляється. Спробуйте ще раз.');$locks[]=$name;}
 $db->beginTransaction();try{$q=$db->prepare('SELECT id FROM rubizh_donation_batches WHERE operation_key=?');$q->execute([$op]);if($old=$q->fetchColumn()){$db->commit();return (int)$old;}
 $q=$db->prepare("SELECT d.order_id,d.amount,d.paid_at FROM rubizh_order_donations d JOIN rubizh_customer_orders o ON o.id=d.order_id WHERE d.order_id IN (".implode(',',array_fill(0,count($ids),'?')).") AND d.batch_id IS NULL AND ".shopDonationEligibleSql().' ORDER BY d.order_id FOR UPDATE');$q->execute($ids);$rows=$q->fetchAll(PDO::FETCH_ASSOC);if(count($rows)!==count($ids))throw new RuntimeException('Список змінився: замовлення вже у переказі, скасоване або повернене. Оновіть сторінку.');$amount=(int)array_sum(array_column($rows,'amount'));if(!is_numeric($input['amount']??null)||abs((float)$input['amount']-$amount)>0.001)throw new RuntimeException('Сума фактичного переказу має дорівнювати внескам обраних замовлень: '.$amount.' ₴.');
 $date=trim((string)($input['transferred_at']??''));$d=DateTimeImmutable::createFromFormat('!Y-m-d\TH:i',$date,new DateTimeZone('Europe/Kyiv'));if(!$d||$d->format('Y-m-d\TH:i')!==$date||$d->getTimestamp()>time()+300)throw new RuntimeException('Перевірте дату фактичного переказу.');
 $paid=max(array_column($rows,'paid_at'));if($d->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s')<$paid)throw new RuntimeException('Дата переказу передує оплаті одного з обраних замовлень.');
 $db->prepare('INSERT INTO rubizh_donation_batches(operation_key,amount,transferred_at,reference,image_mime,image_data,created_by,created_at) VALUES(?,?,?,?,?,?,?,UTC_TIMESTAMP())')->execute([$op,$amount,$d->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s'),$ref,$image['mime'],$image['bytes'],$actor]);$batch=(int)$db->lastInsertId();$q=$db->prepare('UPDATE rubizh_order_donations SET batch_id=? WHERE order_id=? AND batch_id IS NULL');foreach($ids as $id)$q->execute([$batch,$id]);npAudit($db,$actor,'donation_transfer',0,0,'Переказ '.$batch.' · '.$amount.' UAH');$db->commit();return $batch;
 }catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
 }finally{foreach(array_reverse($locks) as $name)$db->prepare('SELECT RELEASE_LOCK(?)')->execute([$name]);}
}
function shopDonationMarkSent(PDO $db,int $id,string $actor): void {
 npLocked($db,$id,function()use($db,$id,$actor){$db->beginTransaction();try{$q=$db->prepare("UPDATE rubizh_order_donations d JOIN rubizh_customer_orders o ON o.id=d.order_id SET d.sent_at=UTC_TIMESTAMP(),d.sent_by=? WHERE d.order_id=? AND d.batch_id IS NOT NULL AND d.sent_at IS NULL AND ".shopDonationEligibleSql());$q->execute([$actor,$id]);if(!$q->rowCount())throw new RuntimeException('Скрін уже позначений надісланим або замовлення виключене.');npAudit($db,$actor,'donation_sent',$id);$db->commit();}catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}});
}
function shopDonationChat(array $contact,int $amount): array {
 $phone=preg_replace('/\D/','',(string)($contact['donation_phone']??$contact['phone']??''));$channel=($contact['donation_channel']??'viber')==='telegram'?'telegram':'viber';$text='Ваш внесок '.$amount.' ₴ — у цьому переказі разом із внесками інших покупців РУБІЖ';
 return ['channel'=>$channel,'phone'=>'+'.$phone,'text'=>$text,'url'=>preg_match('/^380\d{9}$/D',$phone)?($channel==='telegram'?'https://t.me/+'.$phone.'?text='.rawurlencode($text):'viber://chat?number='.rawurlencode('+'.$phone)):''];
}
