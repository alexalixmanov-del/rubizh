<?php
declare(strict_types=1);
require_once __DIR__.'/pricing-policy.php';
// Retained signature for callers; quantity tiers no longer invent a PIM discount.
function shopKitTarget(int $n): int { return 0; }
function shopKitUnit(array $v,int $tier=0): int|float { $v['price_mode']='kit';return shopMoneyValue(shopPricingUnit($v)); }
function shopPriceFloor(array $v): int|float { return shopMoneyValue($v['_pricing']['minimum_cents']??shopMoney($v['price'])); }
function shopPriceLines(array $lines): array {
    $full=0;$total=0;
    foreach($lines as &$line){
        $retail=$line['_pricing']['price_cents']??shopMoney($line['price']);
        $unit=shopPricingUnit($line);$amount=shopLineMoney($unit,$line['qty']);
        $full+=shopLineMoney($retail,$line['qty']);$total+=$amount;
        $line['price']=shopMoneyValue($unit);$line['amount']=shopMoneyValue($amount);
        unset($line['_pricing'],$line['_approved_wholesale_tier'],$line['kit_price'],$line['kit_discount_pct'],$line['fulfillment_supplier']);
    }unset($line);
    return ['lines'=>$lines,'full'=>shopMoneyValue($full),'subtotal'=>shopMoneyValue($total),'saving'=>shopMoneyValue($full-$total)];
}
function shopPromoPercent(string $code): int {
    if($code==='')return 0;
    $codes=cfg('shop_promo_codes');$pct=is_array($codes)?($codes[$code]??null):null;
    if(!is_numeric($pct)||(int)$pct<=0||(int)$pct>30)throw new ShopPricingException('DISCOUNT_NOT_ALLOWED','Промокод не активний.');
    return (int)$pct;
}
function shopPromoLineAmounts(array $lines,array $raw,string $code): array {
    $pct=shopPromoPercent($code);$amounts=[];
    foreach($lines as $i=>$l){
        $unit=shopMoney($l['price']);$p=$raw[$i]['_pricing']??null;
        if($pct){
            if(($raw[$i]['price_mode']??'retail')!=='retail'||$p===null||$p['minimum_cents']===null)throw new ShopPricingException('DISCOUNT_NOT_ALLOWED','Промокод не сумується з комплектом або оптом і потребує дозволеної межі PIM.');
            $candidate=intdiv($unit*(100-$pct)+99,100);
            if($candidate<$p['minimum_cents'])throw new ShopPricingException('DISCOUNT_NOT_ALLOWED','Промокод перевищує дозволену знижку для SKU.');
            $unit=$candidate;
        }
        $amounts[]=shopMoneyValue(shopLineMoney($unit,$l['qty']));
    }
    return $amounts;
}
function shopPromoDiscount(array $lines,array $raw,string $code): int|float {
    $amounts=shopPromoLineAmounts($lines,$raw,$code);$cents=0;
    foreach($lines as $i=>$l)$cents+=shopLineMoney(shopMoney($l['price']),$l['qty'])-shopMoney($amounts[$i]);
    return shopMoneyValue($cents);
}
function shopCheckoutQuote(array $raw,string $promo): array {
    $calc=shopPriceLines($raw);$amounts=shopPromoLineAmounts($calc['lines'],$raw,$promo);$total=0;
    foreach($calc['lines'] as $i=>&$line){$line['amount']=$amounts[$i];$total+=shopMoney($amounts[$i]);if($promo!==''){$line['price_mode']='promo';$line['price']=shopMoneyValue(intdiv(shopMoney($line['price'])*(100-shopPromoPercent($promo))+99,100));}}unset($line);
    return ['lines'=>$calc['lines'],'total'=>shopMoneyValue($total),'subtotal'=>$calc['subtotal'],'discount'=>shopMoneyValue(shopMoney($calc['subtotal'])-$total),'shipping'=>0,'catalog_version'=>$raw[0]['catalog_version']??'legacy'];
}
