<?php
declare(strict_types=1);
// D-54: wholesale («Запит на прорахунок») requests are stored in SITE and handled in CRM instead of a mailto link.
// OPSEC: no unit number tied to the composition, no location, no soldiers' names are asked for.

const WHOLESALE_TYPES=['PERSON'=>'Фізособа','FOP'=>'ФОП','LLC'=>'ТОВ','CHARITY'=>'Благодійний фонд','MILITARY'=>'Військова частина'];

/** ЄДРПОУ (8 digits) control digit. */
function wholesaleEdrpouValid(string $c): bool {
    if(!preg_match('/^\d{8}$/D',$c))return false;$d=array_map('intval',str_split($c));$n=(int)$c;
    $w=$n<30000000||$n>60000000?[1,2,3,4,5,6,7]:[7,1,2,3,4,5,6];
    $sum=0;for($i=0;$i<7;$i++)$sum+=$d[$i]*$w[$i];$r=$sum%11;
    if($r===10){$sum=0;for($i=0;$i<7;$i++)$sum+=$d[$i]*($w[$i]+2);$r=$sum%11;if($r===10)$r=0;}
    return $r===$d[7];
}
/** РНОКПП / ІПН (10 digits) control digit. */
function wholesaleRnokppValid(string $c): bool {
    if(!preg_match('/^\d{10}$/D',$c))return false;$d=array_map('intval',str_split($c));$w=[-1,5,7,9,4,6,10,5,7];
    $sum=0;for($i=0;$i<9;$i++)$sum+=$d[$i]*$w[$i];return ($sum%11)%10===$d[9];
}
/** Validated request or InvalidArgumentException with a Ukrainian message. */
function wholesaleValidate(array $in): array {
    // OD-4.6: a hidden «website» field is a trap for bots; a person never fills it.
    if(is_string($in['website']??null)&&trim($in['website'])!=='')throw new InvalidArgumentException('Заявку не прийнято. Оновіть сторінку й спробуйте ще раз.');
    $s=fn(string $k,int $max)=>is_string($in[$k]??null)?trim(preg_replace('/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u','',$in[$k])):'';
    $name=$s('name',120);if(mb_strlen($name)<2||mb_strlen($name)>120)throw new InvalidArgumentException('Вкажіть ім’я.');
    $phone=preg_replace('/\D/','',$s('phone',30));if(preg_match('/^0\d{9}$/D',$phone))$phone='38'.$phone;if(!preg_match('/^380\d{9}$/D',$phone))throw new InvalidArgumentException('Вкажіть телефон у форматі +380XXXXXXXXX.');
    $type=$s('buyer_type',16);if(!isset(WHOLESALE_TYPES[$type]))throw new InvalidArgumentException('Оберіть тип покупця.');
    $tax=preg_replace('/\D/','',$s('tax_id',12));if($tax!==''&&!(strlen($tax)===8&&wholesaleEdrpouValid($tax)||strlen($tax)===10&&wholesaleRnokppValid($tax)))throw new InvalidArgumentException('Перевірте ЄДРПОУ (8 цифр) або ІПН (10 цифр): контрольна цифра не збігається.');
    $email=mb_strtolower($s('email',254));if($email!==''&&(!filter_var($email,FILTER_VALIDATE_EMAIL)||strlen($email)>254))throw new InvalidArgumentException('Перевірте email або залиште поле порожнім.');
    $kits=$in['kits']??null;if(is_string($kits))$kits=ctype_digit($kits)?(int)$kits:null;if($kits!==null&&(!is_int($kits)||$kits<1||$kits>10000))throw new InvalidArgumentException('Кількість комплектів — ціле число від 1.');
    $text=$s('composition',2000);if(mb_strlen($text)<3||mb_strlen($text)>2000)throw new InvalidArgumentException('Опишіть склад замовлення: позиції та розміри.');
    $priority=$s('priority',16)?:'PRICE';if(!in_array($priority,['PRICE','DONATION'],true))throw new InvalidArgumentException('Оберіть, що для вас важливіше.');
    if(($in['consent']??null)!==true)throw new InvalidArgumentException('Потрібна згода на обробку персональних даних.');
    return ['name'=>$name,'phone'=>'+'.$phone,'buyer_type'=>$type,'tax_id'=>$tax,'email'=>$email,'kits'=>$kits,'composition'=>$text,'priority'=>$priority];
}
function wholesaleTableReady(PDO $db): bool {$q=$db->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='rubizh_wholesale_requests'");return (bool)$q->fetchColumn();}
/** Stores the request once per request_id; returns the public number. */
function wholesaleCreate(PDO $db,array $v,string $requestId): array {
    if(!wholesaleTableReady($db))throw new RuntimeException('Заявки тимчасово недоступні. Напишіть нам на info@rubizh.shop.');
    $q=$db->prepare('SELECT id,number,payload_hash FROM rubizh_wholesale_requests WHERE request_id=?');$q->execute([$requestId]);$old=$q->fetch(PDO::FETCH_ASSOC);
    $hash=hash('sha256',json_encode($v,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE));
    if($old){if(!hash_equals($old['payload_hash'],$hash))throw new InvalidArgumentException('Цю заявку вже надіслано з іншими даними. Оновіть сторінку.');return ['number'=>$old['number'],'repeated'=>true];}
    $number='WS-'.gmdate('ymd').'-'.strtoupper(bin2hex(random_bytes(3)));
    $db->prepare("INSERT INTO rubizh_wholesale_requests(number,request_id,payload_hash,name,phone,buyer_type,tax_id,email,kits,composition,priority,state,manager_note,consent_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,'NEW','',UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP())")
        ->execute([$number,$requestId,$hash,$v['name'],$v['phone'],$v['buyer_type'],$v['tax_id'],$v['email'],$v['kits'],$v['composition'],$v['priority']]);
    $id=(int)$db->lastInsertId();
    $t=$db->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='rubizh_crm_notifications'")->fetchColumn();
    if($t)foreach(['MANAGER','OWNER'] as $r)$db->prepare('INSERT IGNORE INTO rubizh_crm_notifications(audience,kind,entity,entity_id,title,critical,dedupe_key,created_at) VALUES(?,?,?,?,?,0,?,UTC_TIMESTAMP())')->execute(['role:'.$r,'wholesale_request','wholesale',(string)$id,'Оптова заявка '.$number.' · '.WHOLESALE_TYPES[$v['buyer_type']],'wholesale:'.$r.':'.$id]);
    return ['number'=>$number,'repeated'=>false];
}
