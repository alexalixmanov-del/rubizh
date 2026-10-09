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
 foreach(shopKitSlotPatterns() as [$r,$pattern])if(preg_match('~'.$pattern.'~iu',(string)($p['name']??'')))return $r;
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
function shopVariantSizeUnconfirmed(array $v,string $name='',string $category=''): bool {
 $extra=json_decode((string)($v['data']??''),true)?:[];
 if(!empty($v['size_unconfirmed'])||!empty($extra['size_unconfirmed']))return true;
 $name=$name?:($v['name']??'');$category=$category?:($v['category_path']??'');
 if(!in_array(shopSlot(['name'=>$name,'category_path'=>$category]),['body','legs','boots'],true)||preg_match('/пончо|бахіл|костюм.*маскув/iu',$name))return false;
 foreach([$extra['size_display']??'',$extra['size_native']??'',$v['size_display']??'',$v['size_native']??'',$v['size']??''] as $size)if(!preg_match('/^(?:Один розмір|OS|універсальний|)$/iu',trim(preg_replace('/^\s*:\s*/u','',(string)$size))))return false;
 return true;
}
function shopVariantCanBuy(array $v): bool {
 $extra=json_decode((string)($v['data']??''),true)?:[];$stock=$v['stock']??$extra['stock']??null;
 return (float)($v['price']??0)>0&&!shopVariantSizeUnconfirmed($v)&&(($v['availability']??'')==='in'&&($stock===null||is_numeric($stock)&&(float)$stock>0)||($v['availability']??'')==='order'&&(!empty($extra['order_on_request'])||trim((string)($v['lead_time']??''))!==''||preg_match('/^\d{4}-\d{2}-\d{2}$/D',(string)($extra['availability_date']??''))&&$extra['availability_date']>=gmdate('Y-m-d')));
}
function shopBuyableSql(string $a,?string $sizeRequiredSql=null): string {
 if(!preg_match('/^[a-z]+$/D',$a))throw new InvalidArgumentException('alias');
 $v3="($a.pim_active=1 AND $a.pim_order_submission_allowed=1 AND $a.price>0)";
 if(!empty($GLOBALS['rubizh_pim_v3_columns'])&&$sizeRequiredSql==='0=1')return $v3;
 if(!empty($GLOBALS['rubizh_pim_v3_columns']))return "($v3 OR ($a.pim_active IS NULL AND ".shopBuyableLegacySql($a,$sizeRequiredSql)."))";
 return shopBuyableLegacySql($a,$sizeRequiredSql);
}
function shopBuyableLegacySql(string $a,?string $sizeRequiredSql=null): string {
 $j="CASE WHEN JSON_VALID($a.data) THEN $a.data ELSE '{}' END";
 $sizes=["JSON_UNQUOTE(JSON_EXTRACT($j,'$.size_display'))","JSON_UNQUOTE(JSON_EXTRACT($j,'$.size_native'))","$a.size"];
 $missing=implode(' AND ',array_map(fn($size)=>"LOWER(TRIM(TRIM(LEADING ':' FROM TRIM(COALESCE($size,''))))) IN ('','один розмір','os','універсальний')",$sizes));
 $required=$sizeRequiredSql??("(".shopKitSlotSql()." IN ('body','legs','boots') AND LOWER(p.name) NOT REGEXP 'пончо|бахіл|костюм.*маскув')");
 $context="NOT (($required) AND ($missing))";
 return "$a.price>0 AND $context AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT($j,'$.size_unconfirmed')),'false') NOT IN ('true','1') AND (($a.availability='in' AND (JSON_EXTRACT($j,'$.stock') IS NULL OR JSON_UNQUOTE(JSON_EXTRACT($j,'$.stock'))='null' OR CAST(JSON_UNQUOTE(JSON_EXTRACT($j,'$.stock')) AS DECIMAL(12,2))>0)) OR ($a.availability='order' AND (JSON_UNQUOTE(JSON_EXTRACT($j,'$.order_on_request'))='true' OR TRIM($a.lead_time)<>'' OR (JSON_UNQUOTE(JSON_EXTRACT($j,'$.availability_date')) REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND JSON_UNQUOTE(JSON_EXTRACT($j,'$.availability_date'))>=DATE_FORMAT(UTC_TIMESTAMP(),'%Y-%m-%d')))))";
}

function shopKitSlotPatterns(): array {
    return [['gear','^(?:підсум|чохол|сумк|футляр|холдер|тримач)|рюкзак|баул|розвантаж|рпс|гідратор|бойовий пояс'],['med','аптеч|турнікет|джгут|гемостат|бандаж|ifak'],['small','шкарпет|рукавич|рукавиц|наколін|налокіт'],['head','шолом|каск|шапк|кепк|панам|бейсбол|балаклав|навушник|баф|окуляр'],['boots','берц|черевик|кросів|взутт|бахіл'],['armor','плитоноск|бронежилет|бронеплит|бронепакет|балістичн.*пакет'],['legs','штани|штанів|брюки|джогер|шорти'],['small','пояс|ремінь'],['body','курт|убакс|ubacs|сороч|футбол|поло|термобілиз|термобель|фліс|флис|кофта|худі|софтшел|пончо|костюм']];
}
function shopKitSlotSql(): string {
    $sql='CASE';foreach(shopKitSlotPatterns() as [$key,$pattern])$sql.=" WHEN LOWER(p.name) REGEXP '".str_replace(['(?:',"'"],['(',''],$pattern)."' THEN '$key'";
    foreach(['med'=>'медицин|медицина','head'=>'голов|шолом','armor'=>'бронезахист','boots'=>'взуття','legs'=>'штани','small'=>'рукавич|аксесуари одягу','gear'=>'рюкзак|підсум|рпс|спорядження','body'=>'одяг|форма'] as $key=>$pattern)$sql.=" WHEN LOWER(p.category_path) REGEXP '$pattern' THEN '$key'";
    return $sql." ELSE 'small' END";
}
function shopKitPrimarySql(string $slot): string {
 $patterns=['head'=>'шолом|каск|шапк|балаклав|кепк|панам|бейсбол|навушник|окуляр','boots'=>'берц|черевик|кросів','armor'=>'плитоноск|бронежилет|бронеплит|бронепакет','med'=>'турнікет|джгут|гемостат|бандаж|аптечка|ifak','body'=>'курт|убакс|ubacs|сороч|фліс|флис|термобілиз|худі|костюм|пончо','legs'=>'штани|брюки|джогер|шорти','gear'=>'рюкзак|розвантаж|рпс|бойовий пояс|підсум','small'=>'рукавич|рукавиц|шкарпет|наколін|налокіт|пояс|ремінь'];
 if(!isset($patterns[$slot]))throw new InvalidArgumentException('slot');$n='LOWER(p.name)';$sql="$n REGEXP '".$patterns[$slot]."'";
 if(in_array($slot,['head','armor'],true))$sql.=" AND $n NOT REGEXP 'болт|велкро|подуш|панел|наклад|адаптер|кронштейн|чохол|фастекс|ремін|тримач|кріплен|рейк|фартух|напашник'";
 if($slot==='head')$sql.=" AND $n NOT REGEXP 'кавер|камера|camera|ліхтар|стробоскоп|маркер|обвіс|підвіс|рюкзак|сумк'";
 if($slot==='armor')$sql.=" AND $n NOT REGEXP 'камербанд|сороч|ubacs|сидуш|каремат|рюкзак|кавер'";
 if($slot==='med')$sql.=" AND $n NOT REGEXP 'тренув|тренир|навчал|учб|маркер|сумк|підсум|чохол|порожн|без наповнення'";
 return $sql;
}
