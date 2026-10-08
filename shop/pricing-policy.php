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
function shopPricingKitComposition(array $lines,array $definitions=[]): void {
    $groups=[];foreach($lines as $l)if(($l['price_mode']??'retail')==='kit')$groups[$l['kit_group']??''][]=$l;
    foreach($groups as $id=>$members){
        if($id==='')throw new ShopPricingException('INVALID_KIT','Вкажіть повний склад комплекту.');
        $bySku=[];$byProduct=[];foreach($members as $l){$bySku[$l['sku']]=true;$byProduct[$l['product_id']]=($byProduct[$l['product_id']]??0)+$l['qty'];}
        if(count($bySku)<2&&array_sum(array_column($members,'qty'))<2)throw new ShopPricingException('INVALID_KIT','Комплект має містити щонайменше дві одиниці спорядження.');
        if(isset($definitions[$id])){
            $spec=$definitions[$id]['items'];$expected=[];foreach($spec as $it){if(is_string($it))$it=['product_id'=>$it];$expected[$it['product_id']]=$it;}
            if(array_diff_key($expected,$byProduct)||array_diff_key($byProduct,$expected))throw new ShopPricingException('INVALID_KIT','Склад готового комплекту змінився або неповний.');
            foreach($members as $l){$it=$expected[$l['product_id']];if(isset($it['sku'])&&$it['sku']!==$l['sku']||!empty($it['color'])&&shopColor($it['color'])!==$l['color']||$byProduct[$l['product_id']]!=($it['qty']??1))throw new ShopPricingException('INVALID_KIT','Перевірте SKU, колір та кількість у готовому комплекті.');}
        }
    }
}
