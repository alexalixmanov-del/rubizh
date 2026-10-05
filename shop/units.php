<?php
declare(strict_types=1);
function shopSaleUnit(array $p): string {
 $a=$p['attributes']??$p['attrs']??[];if(!is_array($a))$a=[];
 $u=trim((string)($p['sale_unit']??$a['Одиниця продажу']??$a['Одиниця виміру']??$p['unit']??''));
 if(preg_match('/^(м²|м2|m2|m²|sqm|кв\.?\s*м)$/iu',$u))return 'm2';
 return preg_match('/(?:ціна|цена|вартість|оплата)\s*(?:вказана\s*)?(?:за|\/|per)\s*(?:1\s*)?(?:кв\.?\s*м|м²|м2|m²|m2)/iu',(string)($p['name']??''))?'m2':'piece';
}
function shopQuantity(mixed $n,string $unit): int|float {
 if(!is_int($n)&&!is_float($n)&&!is_string($n))throw new RuntimeException('Перевірте кількість.');
 if($unit==='m2'){$s=str_replace(',','.',trim((string)$n));if(!preg_match('/^\d+(?:\.\d{1,2})?$/D',$s)||(float)$s<=0||(float)$s>10000)throw new RuntimeException('Площа має бути від 0,01 до 10 000 м², до двох знаків після коми.');return round((float)$s,2);}
 $q=filter_var($n,FILTER_VALIDATE_INT,['options'=>['min_range'=>1,'max_range'=>99]]);if($q===false)throw new RuntimeException('Кількість має бути цілим числом від 1 до 99.');return $q;
}
function shopDescription(string $s): string {
 $s=preg_replace('~<\s*br\s*/?>|</(?:p|div|li|h[1-6]|tr)>~iu',"\n\n",$s);$s=strip_tags($s);
 for($i=0;$i<2;$i++)$s=html_entity_decode($s,ENT_QUOTES|ENT_HTML5,'UTF-8');
 return trim(preg_replace('/\n{3,}/',"\n\n",preg_replace('/[^\S\n]+/u',' ',$s)));
}
function shopSlot(array $p): string {
 foreach([['gear','^(підсум|чохол|сумк|футляр|холдер|тримач)'],['med','аптеч|турнікет|джгут|гемостат|бандаж|ifak'],['small','шкарпет|рукавич|рукавиц|наколін|налокіт'],['head','шолом|каск|шапк|кепк|панам|бейсбол|балаклав|навушник|баф|окуляр'],['boots','берц|черевик|кросів|взутт|бахіл'],['armor','плитоноск|бронежилет|бронеплит|бронепакет|балістичн.*пакет'],['legs','штани|штанів|брюки|шорти'],['gear','рюкзак|підсум|баул|розвантаж|рпс|сумк|гідратор|бойовий пояс'],['small','пояс|ремінь'],['body','курт|убакс|ubacs|сороч|футбол|поло|термобілиз|термобель|фліс|флис|кофта|худі|софтшел|пончо|костюм']] as [$r,$pattern])if(preg_match('~'.$pattern.'~iu',(string)($p['name']??'')))return $r;
 foreach([['med','медицин|медицина'],['head','голов|шолом'],['armor','бронезахист'],['boots','взуття'],['legs','штани'],['small','рукавич|аксесуари одягу'],['gear','рюкзак|підсум|рпс|спорядження'],['body','одяг|форма']] as [$r,$pattern])if(preg_match('~'.$pattern.'~iu',(string)($p['category']??$p['category_path']??'')))return $r;return 'small';
}
function shopColorAliases(string $s): array {
 $groups=[['Койот','COYOTE'],['Світлий койот','LIGHT COYOTE'],['Хакі','KHAKI','Хакi'],['Олива','OLIVE','Оливковий','Оливковый','Olive drab','OD green'],['Темна олива','Темна Олива','Dark Olive'],['Чорний','BLACK','Черный','Чёрный'],['Мультикам','Multicam','MULTICAM','Мультікам','Камуфляж Мультикам'],['Піксель','Пиксель','MM14','ММ14','ММ-14','Камуфляж Пиксель','Камуфляж Піксель','Pixel','Піксель ММ14','ММ14 піксель'],['Сірий','GREY','GRAY'],['Графіт','Графит'],['Хижак','Хищник'],['Пісочний','Sand','Tan'],['Бежевий','Beige'],['Темно-синій','Dark Navy','Dark Navy Blue'],['Альпійська клякса','Альпийская клякса'],['Степовий мультикам','Степной мультикам'],['Мультикам бруд','Мультикам грязь']];
 $s=trim(preg_replace('/\s+/u',' ',$s));foreach($groups as $group)foreach($group as $a)if(mb_strtolower($s)===mb_strtolower($a))return $group;return [$s];
}
function shopColor(string $s): string {return shopColorAliases($s)[0];}
function shopBrandAliases(string $s): array {
 foreach([['Kiborg','KIBORG','Kiborg(ННВ)','Kiborg (ННВ)'],['Militex','Militex(НЕ АКЦІЯ)','Militex (НЕ АКЦІЯ)'],['UKR-TEC','Ukr-Tec','UKR TEC'],['M-TAC','M Tac','M.Tac'],['M-WIN','M WIN']] as $group)foreach($group as $a)if(mb_strtolower(trim($s))===mb_strtolower($a))return $group;return [trim($s)];
}
function shopBrand(string $s): string {$s=trim($s);if(preg_match('/^(no.?brand|none|n\/a|без бренд[ау]|невідомий|не вказан[оий]+|власне виробництво|-)$/iu',$s))return '';return shopBrandAliases($s)[0];}
function shopVariantCanBuy(array $v): bool {
 $extra=json_decode((string)($v['data']??''),true)?:[];$stock=$v['stock']??$extra['stock']??null;
 return (float)($v['price']??0)>0&&!($v['size_unconfirmed']??$extra['size_unconfirmed']??false)&&(($v['availability']??'')==='in'&&($stock===null||is_numeric($stock)&&(float)$stock>0)||($v['availability']??'')==='order'&&(trim((string)($v['lead_time']??''))!==''||preg_match('/^\d{4}-\d{2}-\d{2}$/D',(string)($extra['availability_date']??''))&&$extra['availability_date']>=gmdate('Y-m-d')));
}
function shopBuyableSql(string $a): string {
 if(!preg_match('/^[a-z]+$/D',$a))throw new InvalidArgumentException('alias');$j="CASE WHEN JSON_VALID($a.data) THEN $a.data ELSE '{}' END";
 return "$a.price>0 AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT($j,'$.size_unconfirmed')),'false') NOT IN ('true','1') AND (($a.availability='in' AND (JSON_EXTRACT($j,'$.stock') IS NULL OR JSON_UNQUOTE(JSON_EXTRACT($j,'$.stock'))='null' OR CAST(JSON_UNQUOTE(JSON_EXTRACT($j,'$.stock')) AS DECIMAL(12,2))>0)) OR ($a.availability='order' AND (TRIM($a.lead_time)<>'' OR (JSON_UNQUOTE(JSON_EXTRACT($j,'$.availability_date')) REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND JSON_UNQUOTE(JSON_EXTRACT($j,'$.availability_date'))>=DATE_FORMAT(UTC_TIMESTAMP(),'%Y-%m-%d')))))";
}
