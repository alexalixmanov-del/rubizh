<?php
declare(strict_types=1);
require_once __DIR__.'/../api/lib.php';
require_once __DIR__.'/units.php';
require_once __DIR__.'/normalization.php';

function shopJson(array $value, int $status=200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($value,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR); exit;
}
function shopVariantRows(PDO $db,array $ids): array {
    if(!$ids)return [];
    $q=$db->prepare('SELECT product_id,sku,size,color,price,kit_price,availability,lead_time,data FROM variants WHERE product_id IN ('.implode(',',array_fill(0,count($ids),'?')).') ORDER BY product_id,sort');
    $q->execute($ids);$out=[];foreach($q->fetchAll(PDO::FETCH_ASSOC) as $v)$out[$v['product_id']][]=$v;return $out;
}
function shopProduct(PDO $db, array $row, array $photos=[],?array $variantRows=null): array {
    $data=json_decode((string)$row['data'],true) ?: [];
    $variantRows ??= shopVariantRows($db,[$row['id']])[$row['id']] ?? [];
    $variants=[];
    foreach ($variantRows as $v) {
        $extra=json_decode((string)$v['data'],true) ?: [];$unconfirmed=shopVariantSizeUnconfirmed($v,(string)$row['name'],(string)$row['category_path']);
        $display=trim(preg_replace('/^\s*:\s*/u','',(string)($extra['size_display']??'')));
        $native=trim(preg_replace('/^\s*:\s*/u','',(string)($extra['size_native']??'')));
        $stored=trim(preg_replace('/^\s*:\s*/u','',(string)$v['size']));
        if(!$unconfirmed&&in_array(shopSlot(['name'=>$row['name'],'category_path'=>$row['category_path']]),['body','legs','boots'],true)&&!preg_match('/пончо|бахіл|костюм.*маскув/iu',$row['name']))foreach([$display,$native,$stored] as $candidate)if(!preg_match('/^(?:Один розмір|OS|універсальний|)$/iu',$candidate)){$display=$candidate;break;}
        $display=$display?:($native?:$stored);$native=$native?:$display;
        $variants[]=['sku'=>$v['sku'],'variant_id'=>(string)($extra['variant_id'] ?? $v['sku']),
            'size_display'=>$display,'size_native'=>$native,
            'size_type'=>$extra['size_type'] ?? ($data['size_scale'] ?? 'other'),'color'=>shopColor($v['color']),
            'price'=>$v['price']===null ? null : (int)$v['price'],'kit_price'=>$v['kit_price']===null ? null : (int)$v['kit_price'],
            'kit_discount_pct'=>$extra['kit_discount_pct'] ?? $data['kit_discount_pct'] ?? null,
            'size_unconfirmed'=>$unconfirmed,'stock'=>isset($extra['stock'])&&is_numeric($extra['stock']) ? max(0,(float)$extra['stock']) : null,
            'availability'=>!$unconfirmed&&shopVariantCanBuy($v)?$v['availability']:'out','lead_time'=>$v['lead_time']?:(!empty($extra['availability_date'])?'Очікується '.$extra['availability_date']:''), 'availability_date'=>$extra['availability_date']??null];
    }
    return ['id'=>$row['id'],'slug'=>$row['slug'],'name'=>$row['name'],'brand'=>shopBrand($row['brand']),'category'=>$row['category_path'],
        'sale_unit'=>shopSaleUnit($data+['name'=>$row['name']]),'description'=>shopDescription((string)($data['description']??$row['description'])),'attributes'=>shopVariantAttributes(shopDescriptionAttributes((string)($data['description']??$row['description']),array_replace(is_array($data['attributes']??null)?$data['attributes']:[],json_decode((string)$row['attributes'],true) ?: [])),$variants,shopSaleUnit($data+['name'=>$row['name']])),
        'price_min'=>($prices=array_column(array_filter($variants,fn($v)=>$v['availability']!=='out'),'price'))?min($prices):($row['price_min']===null?null:(int)$row['price_min']),'availability'=>count(array_filter($variants,fn($v)=>$v['availability']==='in'))?'in':(count(array_filter($variants,fn($v)=>$v['availability']==='order'))?'order':'out'),
        'has_docs'=>(bool)$row['has_docs'],'docs_note'=>(bool)$row['has_docs']?'Протокол випробувань додається до замовлення; до покупки надаємо за запитом':'','photos'=>$photos[$row['id']] ?? [],'variants'=>$variants];
}
function shopProductsByIds(PDO $db,array $ids): array {
    $ids=array_slice(array_values(array_unique(array_filter($ids,'is_string'))),0,200);
    if (!$ids) return [];
    $q=$db->prepare('SELECT * FROM products WHERE visible=1 AND id IN ('.implode(',',array_fill(0,count($ids),'?')).')');
    $q->execute($ids);$rows=$q->fetchAll(PDO::FETCH_ASSOC);$photos=product_photos($db,array_column($rows,'id'));
    $variants=shopVariantRows($db,array_column($rows,'id'));
    return array_map(fn($r)=>shopProduct($db,$r,$photos,$variants[$r['id']] ?? []),$rows);
}
// Кеш за версією каталогу: однакові фільтри = однакова відповідь для всіх відвідувачів.
function shopCatalog(PDO $db,array $input): array {
    $norm=[];foreach(['category','roots','slot','leaf','q','brands','availability','sizes','camo','attrs','page','sort','price_from','price_to'] as $k)if(isset($input[$k])&&$input[$k]!==''&&is_scalar($input[$k]))$norm[$k]=(string)$input[$k];ksort($norm);
    return shopCached('catalog-'.md5(json_encode($norm,JSON_UNESCAPED_UNICODE)),fn()=>shopCatalogBuild($db,$norm),'',['operation'=>'catalog','input'=>$norm]);
}
function shopCatalogBuild(PDO $db,array $input): array {
    $where=['p.visible=1'];$args=[];$buyable=shopBuyableSql('av');if($db->query("SELECT v FROM meta WHERE k='hide_unavailable'")->fetchColumn()!=='0')$where[]="EXISTS(SELECT 1 FROM variants av WHERE av.product_id=p.id AND $buyable)";
    $category=trim((string)($input['category'] ?? ''),'/');
    if ($category!=='') {
        $q=$db->prepare('SELECT path FROM categories WHERE url_path=?');$q->execute([$category]);$path=$q->fetchColumn();
        if (!$path) return ['ok'=>true,'items'=>[],'total'=>0,'page'=>1,'pages'=>0,'facets'=>[]];
        $where[]='(p.category_path=? OR p.category_path LIKE ?)';$args[]=$path;$args[]=str_replace(['%','_'],['\\%','\\_'],$path).' / %';
    }
    $roots=json_decode((string)($input['roots'] ?? '[]'),true);if(is_array($roots)&&$roots){$parts=[];foreach(array_slice($roots,0,10) as $root)if(is_string($root)){$parts[]='(p.category_path=? OR p.category_path LIKE ?)';$args[]=$root;$args[]=str_replace(['%','_'],['\\%','\\_'],$root).' / %';}if($parts)$where[]='('.implode(' OR ',$parts).')';}
    $slot=(string)($input['slot'] ?? '');$slotList=shopKitSlotPatterns();$patterns=array_fill_keys(array_column($slotList,0),true);$legacyPatterns=['gear'=>'^(підсум|чохол|сумк|футляр|холдер|тримач)','med'=>'аптеч|турнікет|джгут|гемостат|бандаж|ifak','small'=>'шкарпет|рукавич|рукавиц|наколін|налокіт','head'=>'шолом|каск|шапк|кепк|панам|бейсбол|балаклав|навушник|баф|окуляр','boots'=>'берц|черевик|кросів|взутт|бахіл','armor'=>'плитоноск|бронежилет|бронеплит|бронепакет|балістичн.*пакет','legs'=>'штани|штанів|брюки|шорти','body'=>'курт|убакс|ubacs|сороч|футбол|поло|термобілиз|термобель|фліс|флис|кофта|худі|софтшел|пончо|костюм'];
    if(isset($patterns[$slot])){
        $where[]=shopKitSlotSql().'=?';$args[]=$slot;$where[]=shopKitPrimarySql($slot);
        // У конструктор потрапляє лише те, що можна додати в кошик: з фото й хоча б одним розміром у наявності.
        $where[]='EXISTS(SELECT 1 FROM photos sph WHERE sph.product_id=p.id)';
        $where[]='EXISTS(SELECT 1 FROM variants sv WHERE sv.product_id=p.id AND '.shopBuyableSql('sv').')';
    }
    $leaf=trim((string)($input['leaf'] ?? ''));if($leaf!==''){$where[]="SUBSTRING_INDEX(p.category_path,' / ',-1)=?";$args[]=$leaf;}
    $words=preg_split('/\s+/u',mb_strtolower(mb_substr(str_replace(['берци','Берци'],['берці','Берці'],trim((string)($input['q'] ?? ''))),0,160))) ?: [];
    foreach (array_slice(array_filter($words),0,6) as $word) {
        $where[]='(LOWER(p.name) LIKE ? OR EXISTS(SELECT 1 FROM variants v WHERE v.product_id=p.id AND v.sku LIKE ?))';
        $word=str_replace(['%','_'],['\\%','\\_'],$word);$args[]='%'.$word.'%';$args[]='%'.$word.'%';
    }
    $brands=array_slice(array_filter(explode('|',(string)($input['brands'] ?? ''))),0,20);if($brands)$brands=array_values(array_unique(array_merge(...array_map('shopBrandAliases',$brands))));
    if ($brands) {$where[]='p.brand IN ('.implode(',',array_fill(0,count($brands),'?')).')';array_push($args,...$brands);}
    if (($input['availability'] ?? '')==='in') $where[]="EXISTS(SELECT 1 FROM variants av WHERE av.product_id=p.id AND av.availability='in' AND $buyable)";
    elseif (($input['availability'] ?? '')==='available') $where[]="EXISTS(SELECT 1 FROM variants av WHERE av.product_id=p.id AND $buyable)";
    $sizes=array_slice(array_filter(explode('|',(string)($input['sizes'] ?? ''))),0,20);
    $camo=array_slice(array_filter(explode('|',(string)($input['camo'] ?? ''))),0,20);
    if($camo)$camo=array_values(array_unique(array_merge(...array_map('shopColorAliases',$camo))));
    $vp=[];
    if($sizes){
        // Canonicalize each candidate once. The old nested SQL CASE expanded to
        // thousands of REGEXP/JSON operations in every count and facet query.
        $sizeQuery=$db->prepare("SELECT v.sku,v.size,v.data,p.name,p.category_path FROM products p JOIN variants v ON v.product_id=p.id WHERE ".implode(' AND ',$where));$sizeQuery->execute($args);$skus=[];
        foreach($sizeQuery->fetchAll(PDO::FETCH_ASSOC) as $row)if(shopMatchesSizes($row,$sizes))$skus[]=$row['sku'];
        if(!$skus)$vp[]='0=1';else{$vp[]='v.sku IN ('.implode(',',array_fill(0,count($skus),'?')).')';array_push($args,...$skus);}
    }
    if($camo){$vp[]='v.color IN ('.implode(',',array_fill(0,count($camo),'?')).')';array_push($args,...$camo);}
    if($vp)$where[]="EXISTS(SELECT 1 FROM variants v WHERE v.product_id=p.id AND (".shopBuyableSql('v').") AND ".implode(' AND ',$vp).')';
    $attrs=json_decode((string)($input['attrs'] ?? '[]'),true) ?: [];$groups=[];
    foreach (array_slice($attrs,0,20) as $a) if (is_string($a) && str_contains($a,"\1")) {[$key,$value]=explode("\1",$a,2);$groups[$key][]=$value;}
    foreach ($groups as $key=>$values) {
        $parts=[];foreach ($values as $value) {$parts[]=shopAttributeSql($key).'=?';$args[]=$value;}
        $where[]='('.implode(' OR ',$parts).')';
    }
    // Ціна йде останньою: межі й діапазони фільтра рахуються з урахуванням усіх інших фільтрів, але без самої ціни.
    $whereNP=$where;$argsNP=$args;
    foreach (['price_from'=>'>=','price_to'=>'<='] as $key=>$op) if (isset($input[$key]) && is_numeric($input[$key])) {
        $where[]="p.price_min $op ?";$args[]=max(0,(int)$input[$key]);
    }
    $sql=implode(' AND ',$where);$q=$db->prepare("SELECT COUNT(*) FROM products p WHERE $sql");$q->execute($args);$total=(int)$q->fetchColumn();
    $limit=24;$pages=(int)ceil($total/$limit);$page=min(max(1,(int)($input['page'] ?? 1)),max(1,$pages));
    $sort=['cheap'=>'p.price_min ASC,p.id','exp'=>'p.price_min DESC,p.id','new'=>'p.created_at DESC,p.id','name'=>'p.name,p.id'][$input['sort'] ?? ''] ?? "FIELD(p.availability,'in','order','out'),p.updated_at DESC,p.id";
    $q=$db->prepare("SELECT p.* FROM products p WHERE $sql ORDER BY $sort LIMIT $limit OFFSET ".(($page-1)*$limit));$q->execute($args);$rows=$q->fetchAll(PDO::FETCH_ASSOC);
    $photos=product_photos($db,array_column($rows,'id'));$variants=shopVariantRows($db,array_column($rows,'id'));
    $facets=['brands'=>[],'sizes'=>[],'camo'=>[],'attrs'=>[],'leaves'=>[]];
    foreach(['brands'=>['p.brand','brand'],'camo'=>['v.color','color'],'leaves'=>["SUBSTRING_INDEX(p.category_path,' / ',-1)",'leaf']] as $key=>[$expression,$field]){
        $q=$db->prepare("SELECT DISTINCT $expression AS value FROM products p JOIN variants v ON v.product_id=p.id WHERE $sql AND ".shopBuyableSql('v')." AND $expression<>'' ORDER BY value LIMIT 500");$q->execute($args);$facets[$key]=$q->fetchAll(PDO::FETCH_COLUMN);
    }
    // Normalize sizes once in PHP instead of repeating a deeply nested REGEXP/JSON CASE
    // for every facet in MySQL. Filter predicates still use the same canonical sizes.
    $q=$db->prepare("SELECT DISTINCT p.name,p.category_path,v.size,".shopNativeSizeSql()." AS size_native FROM products p JOIN variants v ON v.product_id=p.id WHERE $sql AND ".shopBuyableSql('v'));
    $q->execute($args);$facets=array_replace($facets,shopSizeFacets($q->fetchAll(PDO::FETCH_ASSOC)));
    if($category!==''){foreach(shopFilterKeys((string)($path??$category)) as $key){$expr=shopAttributeSql($key);$q=$db->prepare("SELECT DISTINCT $expr AS value FROM products p WHERE $sql AND $expr<>'' ORDER BY value LIMIT 50");$q->execute($args);$values=$q->fetchAll(PDO::FETCH_COLUMN);$values=array_values(array_unique(array_filter(array_map(fn($v)=>$key==='Матеріал'?shopMaterial((string)$v):($key==='Капюшон'?shopHood((string)$v):(string)$v),$values))));if(count($values)>1)$facets['attrs'][$key]=$values;}}
    $facets['brands']=array_values(array_unique(array_filter(array_map('shopBrand',$facets['brands']))));
    $facets['camo']=array_values(array_unique(array_map('shopColor',$facets['camo'])));
    $facets['price']=shopPriceFacet($db,implode(' AND ',$whereNP),$argsNP);
    return ['ok'=>true,'items'=>array_map(fn($r)=>shopProduct($db,$r,$photos,$variants[$r['id']] ?? []),$rows),'total'=>$total,'page'=>$page,'pages'=>$pages,'facets'=>$facets];
}

// Було: окремий підзапит COUNT на кожну з ~233 категорій для кожного відвідувача. Тепер — один GROUP BY + кеш.
function shopCategories(PDO $db): array {
 return shopCached('categories',function()use($db){
  $filter=$db->query("SELECT v FROM meta WHERE k='hide_unavailable'")->fetchColumn()!=='0'?" AND EXISTS(SELECT 1 FROM variants av WHERE av.product_id=p.id AND ".shopBuyableSql('av').")":'';
  $count=[];
  foreach($db->query("SELECT p.category_path AS path,COUNT(*) AS n FROM products p WHERE p.visible=1 $filter GROUP BY p.category_path")->fetchAll(PDO::FETCH_ASSOC) as $r){
   $parts=explode(' / ',(string)$r['path']);for($k=1;$k<=count($parts);$k++){$pp=implode(' / ',array_slice($parts,0,$k));$count[$pp]=($count[$pp]??0)+(int)$r['n'];}
  }
  $out=[];foreach($db->query("SELECT name,path,url_path FROM categories ORDER BY sort")->fetchAll(PDO::FETCH_ASSOC) as $c){$n=$count[$c['path']]??0;if($n>0)$out[]=['name'=>$c['name'],'path'=>$c['path'],'url_path'=>$c['url_path'],'product_count'=>$n];}
  return $out;
 },'',['operation'=>'categories']);
}

// Слоти конструктора — один список для сервера (фільтр slot=) і сайту (RUBIZH_BOOT.kitSlots). Порядок важливий: перший збіг за назвою.
// Фільтр ціни: межі розділу + швидкі діапазони, лише ті, де є товари. distinct<=1 — фільтр на сайті не показується.
function shopPriceFacet(PDO $db,string $sql,array $args): array {
    $q=$db->prepare("SELECT MIN(p.price_min) mn,MAX(p.price_min) mx,COUNT(DISTINCT p.price_min) n,SUM(p.price_min<=1000) r0,SUM(p.price_min BETWEEN 1001 AND 3000) r1,SUM(p.price_min BETWEEN 3001 AND 10000) r2,SUM(p.price_min>=10001) r3 FROM products p WHERE $sql AND p.price_min>0");$q->execute($args);$r=$q->fetch(PDO::FETCH_ASSOC)?:[];
    $out=['min'=>$r['mn']===null?null:(int)$r['mn'],'max'=>$r['mx']===null?null:(int)$r['mx'],'distinct'=>(int)($r['n']??0),'ranges'=>[]];
    if($out['distinct']<2)return $out;
    foreach([['до 1 000',null,1000],['1 000–3 000',1001,3000],['3 000–10 000',3001,10000],['від 10 000',10001,null]] as $i=>[$label,$from,$to]){
        $n=(int)($r['r'.$i]??0);
        if($n>0)$out['ranges'][]=['label'=>$label,'from'=>$from,'to'=>$to,'count'=>$n];
    }
    return $out;
}
// «Беруть разом із цим»: 1) ручні зв'язки з PIM, 2) правила категорій, 3) та сама категорія 2-го рівня.
function shopRelatedRules(): array {
    return [['плитоноск',['бронеплит','підсум']],['бронежилет',['бронеплит']],['шолом|каск',['кавер|чохол на шолом','навушник']],['штани|брюки',['наколін','ремін|ремен|пояс']],['берц|черевик',['шкарпет','устілк']],['рукавич|рукавиц|перчат',['наколін|налокіт','шкарпет']]];
}
function shopModelKey(string $name): string {
    $n=mb_strtolower($name);
    $n=preg_replace('/(олива|оливковий|olive|койот|coyote|чорний|black|мультикам|multicam|піксель|мм14|mm14|хакі|khaki|сірий|grey|gray|ranger green|пісочний|tan|бежевий|зелений|green)/u',' ',$n);
    return trim((string)preg_replace('/[^\p{L}\p{N}]+/u',' ',(string)$n));
}
function shopRelated(PDO $db,array $row,array $product): array {
    $data=json_decode((string)($row['data']??''),true)?:[];
    $price=(int)($product['price_min']??0);$cap=$price>0?$price*2:PHP_INT_MAX;$self=(string)$row['id'];$key=shopModelKey((string)$row['name']);
    $base="p.visible=1 AND p.id<>? AND p.price_min>0 AND EXISTS(SELECT 1 FROM photos rph WHERE rph.product_id=p.id) AND EXISTS(SELECT 1 FROM variants rv WHERE rv.product_id=p.id AND ".shopBuyableSql('rv').")";
    $order="ORDER BY FIELD(p.availability,'in','order','out'),ABS(p.price_min-?)";
    $pick=[];$seen=[$self=>true];
    $gloves=(bool)preg_match('/рукавич|рукавиц|перчат/iu',(string)$row['name']);
    $take=function(array $rows,bool $manual)use(&$pick,&$seen,$key,$cap,$gloves){foreach($rows as $r){if(count($pick)>=4)return;if(isset($seen[$r['id']])||shopModelKey((string)$r['name'])===$key)continue;if($gloves&&(!preg_match('/наколін|налокіт|шкарпет/iu',$r['name'])||preg_match('/дснс|антабк|\bqd\b/iu',$r['name'])))continue;if(!$manual&&(int)$r['price_min']>$cap)continue;$seen[$r['id']]=true;$pick[]=$r;}};
    $manual=array_slice(array_values(array_filter(array_map('strval',(array)($data['related']??$data['related_ids']??$data['suputni']??[])))),0,20);
    if($manual){$q=$db->prepare("SELECT p.* FROM products p WHERE $base AND p.id IN (".implode(',',array_fill(0,count($manual),'?')).") $order");$q->execute(array_merge([$self],$manual,[$price]));$take($q->fetchAll(PDO::FETCH_ASSOC),true);}
    $hay=mb_strtolower($row['name'].' '.$row['category_path']);$ruled=false;
    foreach(shopRelatedRules() as [$src,$targets]){
        if(count($pick)>=4||!preg_match('/'.$src.'/u',$hay))continue;$ruled=true;$groups=[];
        foreach($targets as $t){$q=$db->prepare("SELECT p.* FROM products p WHERE $base AND (LOWER(p.name) REGEXP ? OR LOWER(p.category_path) REGEXP ?) AND p.price_min<=? $order LIMIT 8");$q->execute([$self,$t,$t,$cap,$price]);$groups[]=$q->fetchAll(PDO::FETCH_ASSOC);}
        for($i=0;$i<8&&count($pick)<4;$i++)foreach($groups as $g)if(isset($g[$i]))$take([$g[$i]],false);
        break;
    }
    if(count($pick)<2&&!$ruled){$parts=explode(' / ',(string)$row['category_path']);if(count($parts)>=2){$lvl=$parts[0].' / '.$parts[1];$q=$db->prepare("SELECT p.* FROM products p WHERE $base AND (p.category_path=? OR p.category_path LIKE ?) AND p.price_min<=? $order LIMIT 12");$q->execute([$self,$lvl,str_replace(['%','_'],['\\%','\\_'],$lvl).' / %',$cap,$price]);$take($q->fetchAll(PDO::FETCH_ASSOC),false);}}
    if(count($pick)<2)return [];
    $ids=array_column($pick,'id');$photos=product_photos($db,$ids);$variants=shopVariantRows($db,$ids);
    return array_map(fn($r)=>shopProduct($db,$r,$photos,$variants[$r['id']]??[]),$pick);
}
