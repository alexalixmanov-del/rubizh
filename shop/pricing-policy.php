<?php
declare(strict_types=1);

final class ShopPricingException extends RuntimeException {
    public function __construct(public readonly string $reason, string $message, public readonly int $httpStatus=400) { parent::__construct($message); }
}
// Decimal input is parsed once; all subsequent monetary arithmetic is integer kopecks.
function shopMoney(mixed $value): int {
    if(!is_int($value)&&!is_float($value)&&!is_string($value))throw new ShopPricingException('DISCOUNT_NOT_ALLOWED','Некоректна ціна.');
    $s=(string)$value;
    if(!preg_match('/^(\d{1,9})(?:\.(\d{1,2}))?$/D',$s,$m))throw new ShopPricingException('DISCOUNT_NOT_ALLOWED','Некоректна ціна.');
    return (int)$m[1]*100+(int)str_pad($m[2]??'',2,'0');
}
function shopMoneyValue(int $kopecks): int|float { return $kopecks%100===0?intdiv($kopecks,100):$kopecks/100; }
function shopLineMoney(int $unit,mixed $qty): int {
    $q=shopMoney($qty); // quantity has at most two decimal places (m²).
    return intdiv($unit*$q+50,100);
}
function shopPricingPolicy(array $v): ?array {
    if(!array_key_exists('pricing_policy_version',$v))return null;
    if($v['pricing_policy_version']!==1)throw new ShopPricingException('DISCOUNT_NOT_ALLOWED','Непідтримувана версія цін PIM.');
    $price=shopMoney($v['site_price']??$v['price']??null);
    if($price<=0 || isset($v['price'])&&shopMoney($v['price'])!==$price)throw new ShopPricingException('DISCOUNT_NOT_ALLOWED','Ціни price/site_price не узгоджені.');
    // Missing bounds deliberately disable discounts, never reconstruct procurement.
    try{$floor=shopMoney($v['minimum_sale_price']??null);}catch(ShopPricingException $e){$floor=null;}
    $safe=$floor!==null&&$floor>0&&$floor<=$price&&($v['discount_margin_floor_pct']??null)===15;
    $kit=null;$wholesale=[];
    if($safe){
        if(($v['kit_price']??null)!==null){$kit=shopMoney($v['kit_price']);if($kit<$floor||$kit>$price)throw new ShopPricingException('DISCOUNT_NOT_ALLOWED','Ціна комплекту порушує межі PIM.');}
        $seen=[];
        if(!is_array($v['wholesale']??[]))throw new ShopPricingException('DISCOUNT_NOT_ALLOWED','Некоректні оптові ціни.');
        foreach($v['wholesale']??[] as $tier){
            if(!is_array($tier))throw new ShopPricingException('DISCOUNT_NOT_ALLOWED','Некоректна оптова ціна.');
            $amount=shopMoney($tier['price']??null);
            if($amount<$floor||$amount>$price)throw new ShopPricingException('DISCOUNT_NOT_ALLOWED','Оптова ціна порушує межі PIM.');
            if(isset($seen[$amount]))continue;$seen[$amount]=true;
            $wholesale[]=['price_cents'=>$amount,'discount'=>intdiv(($price-$amount)*1000,$price)/10,'requested_discount'=>$tier['requested_discount']??null,'capped'=>($tier['capped']??false)===true];
        }
    }
    return ['version'=>1,'price_cents'=>$price,'minimum_cents'=>$safe?$floor:null,'kit_cents'=>$kit,'wholesale'=>$wholesale];
}
function shopPricingPublic(?array $policy): array {
    if($policy===null)return ['kit_price'=>null,'kit_discount_pct'=>0,'wholesale'=>[]];
    return ['pricing_policy_version'=>1,'price'=>shopMoneyValue($policy['price_cents']),'site_price'=>shopMoneyValue($policy['price_cents']),
        'kit_price'=>$policy['kit_cents']===null?null:shopMoneyValue($policy['kit_cents']),
        'kit_discount_pct'=>$policy['kit_cents']===null?0:intdiv(($policy['price_cents']-$policy['kit_cents'])*1000,$policy['price_cents'])/10,
        'wholesale'=>array_map(fn($t)=>['price'=>shopMoneyValue($t['price_cents']),'discount'=>$t['discount'],'capped'=>$t['capped']],$policy['wholesale'])];
}
function shopPricingStore(PDO $db,string $product,array $policies): void {
    $db->prepare('DELETE FROM rubizh_catalog_pricing WHERE product_id=?')->execute([$product]);
    $q=$db->prepare('INSERT INTO rubizh_catalog_pricing(sku,product_id,policy_json,revision,updated_at) VALUES(?,?,?,?,UTC_TIMESTAMP())');
    foreach($policies as $sku=>$p)if($p!==null){$json=json_encode($p,JSON_THROW_ON_ERROR);$q->execute([$sku,$product,$json,hash('sha256',$json)]);}
}
function shopPricingCatalogVersion(PDO $db,bool $lock=false): string {
    $q=$db->query("SELECT v FROM meta WHERE k='pricing_catalog_version'".($lock?' FOR UPDATE':''));return (string)($q->fetchColumn()?:'legacy');
}
function shopPricingRead(PDO $db,string $sku,string $product): ?array {
    $q=$db->prepare('SELECT policy_json FROM rubizh_catalog_pricing WHERE sku=? AND product_id=?');$q->execute([$sku,$product]);$s=$q->fetchColumn();return $s===false?null:json_decode($s,true,32,JSON_THROW_ON_ERROR);
}
function shopPricingUnit(array $line): int {
    $p=$line['_pricing']??null;$retail=$p['price_cents']??shopMoney($line['price']);$mode=$line['price_mode']??'retail';
    if($mode==='retail')return $retail;
    if($p===null||$p['minimum_cents']===null)throw new ShopPricingException('DISCOUNT_NOT_ALLOWED','Для цього SKU немає підтвердженої спеціальної ціни.');
    if($mode==='kit'){$amount=$p['kit_cents'];if($amount===null)throw new ShopPricingException('INVALID_KIT','Цей SKU не дозволений у комплекті зі спеціальною ціною.');}
    elseif($mode==='wholesale'){
        // Existing shop uses a manager quotation, not automatic quantity thresholds.
        $tier=$line['_approved_wholesale_tier']??null;
        if(!is_int($tier)||!isset($p['wholesale'][$tier]))throw new ShopPricingException('DISCOUNT_NOT_ALLOWED','Оптовий рівень має підтвердити менеджер.');
        $amount=$p['wholesale'][$tier]['price_cents'];
    }else throw new ShopPricingException('DISCOUNT_NOT_ALLOWED','Невідомий режим ціни.');
    if($amount<$p['minimum_cents'])throw new ShopPricingException('DISCOUNT_NOT_ALLOWED','Ціна нижча за дозволену PIM.');
    return $amount;
}
/** Buyer-facing reason when kit prices were not applied as the cart expected (Q-8, K6). */
function shopKitExplanation(array $lines): string {
    $s=array_column($lines,'kit_status');
    $out=[];
    if(in_array('needs_sections',$s,true))$out[]='Ціну комплекту не застосовано: додайте річ ще з одного розділу, щоб отримати ціну комплекту.';
    elseif(in_array('extra_units',$s,true))$out[]='Ціна комплекту діє на одну одиницю кожної речі (або на кількість комплектів для підрозділу); решта — за звичайною ціною.';
    if(in_array('fixed_price',$s,true))$out[]=SHOP_KIT_FIXED_PRICE_NOTE;
    return implode(' ',$out);
}
// D-65 (owner decision 2026-10-16): «Бронезахист» (the armor builder section, the category and its subcategories) is
// sold at a fixed price — never the kit price — but still counts as a main section of K1.
const SHOP_KIT_FIXED_PRICE_NOTE='Бронезахист продається за фіксованою ціною, ціна комплекту на нього не застосовується.';
function shopKitFixedPrice(array $l): bool {
    $category=(string)($l['kit_category']??'');
    return ($l['kit_slot']??'')==='armor'||$category==='Бронезахист'||str_starts_with($category,'Бронезахист / ');
}
/** D-65: an armor line of a kit is charged retail, unless it belongs to an order placed before D-65 (kit_armor_legacy). */
function shopKitFixRetail(array &$l): bool {
    $legacy=!empty($l['kit_armor_legacy']);unset($l['kit_armor_legacy']);
    if($legacy||!shopKitFixedPrice($l))return false;
    $l['price_mode']='retail';$l['kit_status']='fixed_price';return true;
}
// Q-8 (owner decision 2026-10-11, K1–K6): main builder sections; «Дрібниці» (small) never qualify a kit.
const SHOP_KIT_MAIN_SLOTS=['head','body','legs','boots','armor','gear','med'];
/** Prices kit groups and returns the lines to charge. Ready kits (definitions) keep their exact composition. A custom kit
 * (K1) needs models from ≥2 main sections; then every member with a valid PIM kit price (K3) gets it for 1 unit of each
 * model per kit — N units for «Для підрозділу» (kit_units) — and extra units stay retail (K2): such a line is split into
 * a kit part and a retail remainder, so every stored line has one unit price and re-pricing a stored order is stable.
 * Members of a kit that does not qualify are charged retail with kit_status=needs_sections for the buyer's explanation. */
function shopPricingKitComposition(array $lines,array $definitions=[]): array {
    $groups=[];foreach($lines as $i=>$l){$g=(string)($l['kit_group']??'');if($g!==''||($l['price_mode']??'retail')==='kit')$groups[$g][]=$i;}
    $remainders=[];
    foreach($groups as $id=>$idx){
        $members=array_map(fn($i)=>$lines[$i],$idx);
        if($id==='')throw new ShopPricingException('INVALID_KIT','Вкажіть повний склад комплекту.');
        // A placed order from before Q-8 keeps the rule it was priced with (≥2 SKUs or ≥2 units, all kit-priced).
        if(!isset($definitions[$id])&&array_filter($members,fn($l)=>!empty($l['kit_legacy']))){
            $skus=array_unique(array_column($members,'sku'));
            if(count($skus)<2&&array_sum(array_column($members,'qty'))<2)throw new ShopPricingException('INVALID_KIT','Комплект має містити щонайменше дві одиниці спорядження.');
            foreach($idx as $i)unset($lines[$i]['kit_legacy']);
            continue;
        }
        if(!isset($definitions[$id])){
            $units=array_values(array_unique(array_map(fn($l)=>$l['kit_units']??1,$members),SORT_REGULAR));
            if(count($units)!==1||!is_int($units[0])||$units[0]<1||$units[0]>99)throw new ShopPricingException('INVALID_KIT','Кількість комплектів для підрозділу має бути однаковою для всіх речей (1–99).');
            $sections=[];foreach($members as $l){$slot=(string)($l['kit_slot']??'small');if(in_array($slot,SHOP_KIT_MAIN_SLOTS,true))$sections[$slot]=true;}
            $qualifies=count($sections)>=2;$left=[];
            foreach($idx as $i){$l=$lines[$i];
                $priced=($l['price_mode']??'retail')==='kit'&&isset($l['_pricing']['kit_cents'],$l['_pricing']['minimum_cents']);
                if(!$qualifies||!$priced){unset($lines[$i]['kit_armor_legacy']);if(($l['price_mode']??'')==='kit')$lines[$i]['price_mode']='retail';$lines[$i]['kit_status']=$qualifies?'no_kit_price':'needs_sections';continue;}
                if(shopKitFixRetail($lines[$i]))continue;$l=$lines[$i];
                $left[$l['product_id']]??=$units[0];$room=$left[$l['product_id']];
                // Area goods (m²) count as one kit unit per line.
                $kitQty=is_int($l['qty'])?min($l['qty'],$room):($room>=1?$l['qty']:0);
                if($kitQty<=0){$lines[$i]['price_mode']='retail';$lines[$i]['kit_status']='extra_units';continue;}
                $left[$l['product_id']]-=is_int($l['qty'])?$kitQty:1;$lines[$i]['kit_status']='kit';
                if($kitQty<$l['qty']){
                    $rest=$l['qty']-$kitQty;$suffix=($l['sale_unit']??'piece')==='m2'?' м²':' шт.';
                    $lines[$i]['qty']=$kitQty;$lines[$i]['qty_label']=$kitQty.$suffix;
                    $remainders[$i]=['qty'=>$rest,'qty_label'=>$rest.$suffix,'price_mode'=>'retail','kit_status'=>'extra_units']+$l;
                }
            }
            continue;
        }
        $bySku=[];$byProduct=[];foreach($members as $l){$bySku[$l['sku']]=true;$byProduct[$l['product_id']]=($byProduct[$l['product_id']]??0)+$l['qty'];}
        if(count($bySku)<2&&array_sum(array_column($members,'qty'))<2)throw new ShopPricingException('INVALID_KIT','Комплект має містити щонайменше дві одиниці спорядження.');
        {
            $spec=$definitions[$id]['items'];$expected=[];foreach($spec as $it){if(is_string($it))$it=['product_id'=>$it];$expected[$it['product_id']]=$it;}
            if(array_diff_key($expected,$byProduct)||array_diff_key($byProduct,$expected))throw new ShopPricingException('INVALID_KIT','Склад готового комплекту змінився або неповний.');
            foreach($members as $l){$it=$expected[$l['product_id']];if(isset($it['sku'])&&$it['sku']!==$l['sku']||!empty($it['color'])&&shopColor($it['color'])!==$l['color']||$byProduct[$l['product_id']]!=($it['qty']??1))throw new ShopPricingException('INVALID_KIT','Перевірте SKU, колір та кількість у готовому комплекті.');}
            foreach($idx as $i)if(($lines[$i]['price_mode']??'')==='kit')shopKitFixRetail($lines[$i]);else unset($lines[$i]['kit_armor_legacy']);
        }
    }
    $out=[];foreach($lines as $i=>$l){$out[]=$l;if(isset($remainders[$i]))$out[]=$remainders[$i];}
    return $out;
}

// Nonlocking current read: checkout variant/product locks protect relevant prices;
// the revision detects a concurrently committed catalog publication.
function shopAssertCatalogVersion(PDO $db,string $expected): void {
    if(!hash_equals($expected,shopPricingCatalogVersion($db)))throw new ShopOrderConflict('PRICE_CHANGED',[],'Версія каталогу змінилася. Перевірте новий розрахунок та підтвердьте.');
}
