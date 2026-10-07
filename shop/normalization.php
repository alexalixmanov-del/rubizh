<?php
declare(strict_types=1);
function shopSizeKindSql(): string {
 $text="LOWER(CONCAT(p.name,' ',p.category_path))";
 return "CASE WHEN LOWER(p.name) REGEXP 'пояс|ремінь|ремень|балаклав|шапк|кепк|панам|шолом|каск|підсум|чохол|рюкзак' THEN 'other' WHEN $text REGEXP 'взут|берц|черевик|кросів' THEN 'footwear' WHEN $text REGEXP 'одяг|форма|штани|шорти|курт|убакс|ubacs|сороч|футбол|поло|термобілиз|фліс|кофт|худі|рукавич' THEN 'clothing' ELSE 'other' END";
}
function shopSizeKind(string $name,string $category): string {
 if(preg_match('/пояс|ремінь|ремень|балаклав|шапк|кепк|панам|шолом|каск|підсум|чохол|рюкзак/iu',$name))return 'other';
 if(preg_match('/взут|берц|черевик|кросів/iu',$name.' '.$category))return 'footwear';
 if(preg_match('/одяг|форма|штани|шорти|курт|убакс|ubacs|сороч|футбол|поло|термобілиз|фліс|кофт|худі|рукавич/iu',$name.' '.$category))return 'clothing';
 return 'other';
}
function shopSizeFacets(array $rows): array {
 $groups=['clothing'=>[],'footwear'=>[],'height'=>[]];
 foreach($rows as $r){$kind=shopSizeKind((string)$r['name'],(string)$r['category_path']);$raw=trim(preg_replace('/^\s*:\s*/u','',(string)$r['size']));$native=(string)($r['size_native']??$raw);
  if($kind==='clothing'){$s=shopClothingSize(preg_match('/^[:\s]*(4[0-9]|[56][0-9]|70)($|[ (\/])/u',$native)?$native:$raw);if($s!=='')$groups[$kind][$s]=true;if(preg_match('~/([1-6])$~u',$native,$m)||preg_match('/\(([1-6]-[1-6])\s*зріст/iu',$native,$m))$groups['height'][$m[1]]=true;}
  elseif($kind==='footwear'&&preg_match('/^\d{2}([.,]5)?$/D',$raw))$groups[$kind][str_replace(',','.',$raw)]=true;
 }
 $clothing=array_values(array_intersect(['XS','S','M','L','XL','XXL','3XL+'],array_keys($groups['clothing'])));$footwear=array_map('strval',array_keys($groups['footwear']));usort($footwear,fn($a,$b)=>(float)$a<=>(float)$b);$height=array_map('strval',array_keys($groups['height']));sort($height,SORT_NATURAL);
 $out=['sizes'=>array_merge($clothing,$footwear),'size_groups'=>[]];
 foreach([['clothing','Розмір одягу',$clothing],['footwear','Розмір взуття',$footwear],['height','Зріст (група виробника)',$height]] as [$kind,$label,$values])if($values)$out['size_groups'][]=compact('kind','label','values');
 return $out;
}
function shopClothingSize(string $raw): string {
 $s=mb_strtoupper(trim(preg_replace('/^\s*:\s*/u','',$raw)));
 if(preg_match('/^(?:[3-9]XL|XXXL|XXXXL|XXXXXL)(?:\b|\+|\()/u',$s))return '3XL+';
 if(preg_match('/^2XL(?:$|[\s(\/\-])/u',$s))return 'XXL';
 if(preg_match('/^(XXL|XL|XS|S|M|L)(?:$|[\s(\/\-])/u',$s,$m))return $m[1];
 if(preg_match('/^(\d{2})(?:$|[\s(\/])/u',$s,$m)){return match((int)$m[1]){40,42,44=>'XS',46=>'S',48=>'M',50,52=>'L',54,56=>'XL',58,60=>'XXL',62,64,66,68,70=>'3XL+',default=>''};}return '';
}
function shopNativeSizeSql(): string {return "CASE WHEN JSON_VALID(v.data) THEN COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(v.data,'$.size_native')),''),v.size) ELSE v.size END";}
function shopSizeSql(): string {
 $native=shopNativeSizeSql();$raw="CASE WHEN ".shopSizeKindSql()."='clothing' AND CAST(COALESCE(NULLIF(REGEXP_SUBSTR(TRIM(TRIM(LEADING ':' FROM TRIM(($native)))),'^[0-9]{2}'),''),'0') AS UNSIGNED) BETWEEN 40 AND 70 AND ($native) REGEXP '^[:[:space:]]*[0-9]{2}($|[ (/])' THEN ($native) ELSE v.size END";$s="UPPER(TRIM(TRIM(LEADING ':' FROM TRIM($raw))))";$n="CAST(LEFT($s,2) AS UNSIGNED)";
 return "CASE WHEN ".shopSizeKindSql()."='clothing' THEN CASE WHEN $s REGEXP '^([3-9]XL|XXXL|XXXXL|XXXXXL)($|[+ (/])' THEN '3XL+' WHEN $s REGEXP '^(XXL|XL|XS|S|M|L)($|[ (/\\-])' THEN REGEXP_SUBSTR($s,'^(XXL|XL|XS|S|M|L)') WHEN $s REGEXP '^[0-9]{2}($|[ (/])' THEN CASE WHEN $n IN (40,42,44) THEN 'XS' WHEN $n=46 THEN 'S' WHEN $n=48 THEN 'M' WHEN $n IN (50,52) THEN 'L' WHEN $n IN (54,56) THEN 'XL' WHEN $n IN (58,60) THEN 'XXL' WHEN $n IN (62,64,66,68,70) THEN '3XL+' ELSE '' END ELSE '' END WHEN ".shopSizeKindSql()."='footwear' AND $s REGEXP '^[0-9]{2}([.,]5)?$' THEN REPLACE($s,',','.') ELSE '' END";
}
function shopHeightSql(): string {$s=shopNativeSizeSql();return "CASE WHEN ".shopSizeKindSql()."='clothing' THEN CASE WHEN ($s) REGEXP '/[1-6]$' THEN SUBSTRING_INDEX(($s),'/',-1) WHEN LOWER(($s)) REGEXP '[(][1-6]-[1-6][[:space:]]*зріст' THEN REGEXP_SUBSTR(($s),'[1-6]-[1-6]') ELSE '' END ELSE '' END";}
function shopAttributeKeys(): array {return ['Габарити'=>['Габарити','Габариты','Розміри виробу','Размеры изделия'],'Матеріал'=>['Матеріал','Материал','material'],'Склад'=>['Склад','Состав','composition'],'Капюшон'=>['Капюшон','Тип капюшона','Наявність капюшона'],'Сезон'=>['Сезон','Сезонність'],'Утеплювач'=>['Утеплювач','Утеплитель'],'Мембрана'=>['Мембрана'],'Клас захисту'=>['Клас захисту','Класс защиты'],'Тип'=>['Тип','Тип виробу'],'Обʼєм'=>['Обʼєм','Объем','Об’єм'],'Вага'=>['Вага','Вес'],'Розмір плити'=>['Розмір плити'],'Сумісність'=>['Сумісність','Совместимость'],'Кольори'=>['Кольори','Цвета'],'Розміри'=>['Розміри','Размеры'],'Країна виробник'=>['Країна виробник','Країна-виробник','Страна производитель']];}
function shopMaterial(string $s): string {
 $s=trim(preg_replace('/\s*\([^)]*\).*/u','',$s));$s=preg_replace('/\s+/u',' ',$s);$key=mb_strtolower(preg_replace('/[\s_\-–]+/u','',$s));
 $dict=['ripstop'=>'Ріпстоп','ріпстоп'=>'Ріпстоп','рипстоп'=>'Ріпстоп','twill'=>'Твіл','твіл'=>'Твіл','твилл'=>'Твіл','coolpass'=>'CoolPASS','cordura'=>'Cordura','кордура'=>'Cordura','фліс'=>'Фліс','флис'=>'Фліс','fleece'=>'Фліс','softshell'=>'Софтшел','софтшел'=>'Софтшел','софтшелл'=>'Софтшел','нейлон'=>'Нейлон','nylon'=>'Нейлон','бавовна'=>'Бавовна','хлопок'=>'Бавовна','cotton'=>'Бавовна','поліестер'=>'Поліестер','полиэстер'=>'Поліестер','polyester'=>'Поліестер','оксфорд'=>'Оксфорд','oxford'=>'Оксфорд'];
 return $dict[$key]??mb_convert_case($s,MB_CASE_TITLE,'UTF-8');
}
function shopHood(string $s): string {if(preg_match('/без|немає|нет|відсут|^ні$|^no$/iu',$s))return 'Без капюшона';if(preg_match('/відстіб|отстег|знім|съем/iu',$s))return 'Відстібний';if(preg_match('/вшит|вшитий|капюшон|закрит|^так$|^yes$/iu',$s))return 'Вшитий';return '';}
function shopNormalizeAttributes(array $attrs): array {
 $out=[];$keys=shopAttributeKeys();foreach($attrs as $k=>$v){if(!is_scalar($v))continue;$canonical=$k;foreach($keys as $key=>$aliases)if(in_array($k,$aliases,true)){$canonical=$key;break;}$v=trim((string)$v);
 if($canonical==='Матеріал'){if(preg_match('/\(([^)]*%[^)]*)\)/u',$v,$m)&&empty($attrs['Склад'])&&empty($attrs['Состав']))$out['Склад']=trim($m[1]);$v=shopMaterial($v);}if($canonical==='Капюшон')$v=shopHood($v);if($v!=='')$out[$canonical]=$v;}return $out;
}
// Recover only explicit labelled values supplied in the product description.
// No guessed materials, protection classes, sizes or medical certification.
function shopDescriptionAttributes(string $description,array $attributes=[]): array {
 $out=shopNormalizeAttributes($attributes);$text=shopDescription($description);
 $aliases=array_merge(...array_values(shopAttributeKeys()));
 $pattern=implode('|',array_map(fn($s)=>preg_quote($s,'/'),$aliases));
 foreach(preg_split('/\n/u',$text)?:[] as $line)if(preg_match('/^\s*(?:[-•]\s*)?('.$pattern.')\s*:\s*([^\n]{1,180})$/iu',$line,$m)){
  $label=$m[1];foreach($aliases as $alias)if(mb_strtolower($label)===mb_strtolower($alias)){$label=$alias;break;}
  $out+=shopNormalizeAttributes([$label=>$m[2]]);
 }
 return $out;
}
function shopCorrectCategory(string $name,string $category): string {
 if(preg_match('/^Тактична медицина/iu',$category)){if(preg_match('/тренув|навчал|учб/iu',$name))return 'Тактична медицина / Навчальні засоби';if(preg_match('/маркер/iu',$name))return 'Тактична медицина / Медичні аксесуари';}
 if(!preg_match('/^Маскування(?:\s*\/|$)/iu',$category)||preg_match('/маскувальн.*костюм|кікімор|маскхалат|накидк|пончо/iu',$name))return $category;
 foreach([
  ['штани|брюки|джогер','Одяг та форма / Чоловічий одяг / Тактичні штани'],
  ['убакс|ubacs|бойова сороч','Одяг та форма / Чоловічий одяг / Убакси'],
  ['куртк','Одяг та форма / Чоловічий одяг / Тактичні куртки'],
  ['футбол|поло','Одяг та форма / Чоловічий одяг / Футболки та поло'],
  ['рукавич|рукавиц','Одяг та форма / Аксесуари одягу / Тактичні рукавички'],
  ['термобілиз|термобель','Одяг та форма / Чоловічий одяг / Термобілизна'],
  ['фліс|флис|кофт|худі','Одяг та форма / Чоловічий одяг / Фліси та кофти'],
  ['костюм','Одяг та форма / Чоловічий одяг / Тактичні костюми'],
 ] as [$pattern,$path])if(preg_match('/'.$pattern.'/iu',$name))return $path;
 return $category;
}
function shopAttributeSql(string $key): string {
 $aliases=shopAttributeKeys()[$key]??[$key];$parts=[];foreach($aliases as $k){$path='$.' . json_encode($k,JSON_UNESCAPED_UNICODE);$parts[]="NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p.attributes,'".str_replace("'","''",$path)."')),'')";}$raw='COALESCE('.implode(',',$parts).",'')";
 if($key==='Матеріал'){$clean="TRIM(REGEXP_REPLACE($raw,'[[:space:]]*[(].*$',''))";$norm="LOWER(REGEXP_REPLACE($clean,'[[:space:]_–-]+',''))";$cases='CASE';foreach(['Ріпстоп'=>['ripstop','ріпстоп','рипстоп'],'Твіл'=>['twill','твіл','твилл'],'CoolPASS'=>['coolpass'],'Cordura'=>['cordura','кордура'],'Фліс'=>['фліс','флис','fleece'],'Софтшел'=>['softshell','софтшел','софтшелл'],'Нейлон'=>['нейлон','nylon'],'Бавовна'=>['бавовна','хлопок','cotton'],'Поліестер'=>['поліестер','полиэстер','polyester'],'Оксфорд'=>['оксфорд','oxford']] as $canon=>$aliases)$cases.=" WHEN $norm IN ('".implode("','",$aliases)."') THEN '$canon'";return $cases." ELSE $clean END";}
 if($key==='Капюшон')return "CASE WHEN LOWER($raw) REGEXP 'без|немає|нет|відсут|^ні$|^no$' THEN 'Без капюшона' WHEN LOWER($raw) REGEXP 'відстіб|отстег|знім|съем' THEN 'Відстібний' WHEN LOWER($raw) REGEXP 'вшит|капюшон|закрит|^так$|^yes$' THEN 'Вшитий' ELSE '' END";
 return $raw;
}
function shopFilterKeys(string $category): array {
 if(preg_match('/взут|берц|черевик/iu',$category))return ['Сезон','Матеріал','Мембрана'];
 if(preg_match('/брон|шолом/iu',$category))return ['Клас захисту','Матеріал','Розмір плити'];
 if(preg_match('/рюкзак|сумк|підсум|споряд/iu',$category))return ['Матеріал','Обʼєм','Сумісність'];
 if(preg_match('/медицин|медицина/iu',$category))return ['Тип'];
 if(preg_match('/курт|пончо|софтшел|фліс|термо/iu',$category))return ['Сезон','Матеріал','Капюшон','Утеплювач'];
 return ['Сезон','Матеріал','Капюшон'];
}

function shopMatchesSizes(array $row,array $wanted): bool {
 $kind=shopSizeKind((string)$row['name'],(string)$row['category_path']);$extra=json_decode((string)($row['data']??''),true)?:[];
 $raw=trim(preg_replace('/^\s*:\s*/u','',(string)$row['size']));$native=(string)($extra['size_native']??$raw);
 $facets=shopSizeFacets([$row+['size_native'=>$native]]);$values=[];foreach($facets['size_groups'] as $g)$values[$g['kind']]=$g['values'];
 $normal=[];$height=[];
 foreach($wanted as $s){if(str_contains($s,':')){[$k,$v]=explode(':',$s,2);if($k==='height')$height[]=$v;elseif($k===$kind)$normal[]=in_array($v,$values[$k]??[],true);}
 elseif(in_array($s,['XS','S','M','L','XL','XXL','2XL','3XL+'],true))$normal[]=$kind==='clothing'&&in_array($s==='2XL'?'XXL':$s,$values['clothing']??[],true);else $normal[]=$s===$raw;}
 return (!$normal||in_array(true,$normal,true))&&(!$height||array_intersect($height,$values['height']??[]))&&($normal||$height);
}

function shopVariantAttributes(array $attributes,array $variants,string $unit): array {
 $colors=[];$sizes=[];foreach($variants as $v){if(trim((string)($v['color']??''))!=='')$colors[shopColor($v['color'])]=true;if(empty($v['size_unconfirmed'])&&trim((string)($v['size_display']??''))!=='')$sizes[$v['size_display']]=true;}
 if($colors&&!isset($attributes['Кольори']))$attributes['Кольори']=implode(', ',array_keys($colors));
 if($sizes&&!isset($attributes['Розміри']))$attributes['Розміри']=implode(', ',array_keys($sizes));
 if(!isset($attributes['Одиниця продажу']))$attributes['Одиниця продажу']=$unit==='m2'?'м²':'шт.';
 return $attributes;
}
