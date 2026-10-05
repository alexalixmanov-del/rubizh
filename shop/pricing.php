<?php
declare(strict_types=1);

function shopKitTarget(int $n): int {
    foreach([[6,13],[5,10],[4,8],[3,5],[2,3]] as [$count,$pct])if($n>=$count)return $pct;
    return 0;
}
function shopKitUnit(array $v,int $tier): int {
    $price=(int)$v['price'];
    if ((float)($v['kit_discount_pct'] ?? 0)<=0)return $price;
    return min($price,max((int)round($price*(1-$tier/100)),shopPriceFloor($v)));
}
function shopPriceLines(array $lines): array {
    $groups=[];foreach($lines as $i=>$line)if(($line['kit_group'] ?? '')!=='')$groups[$line['kit_group']][]=$i;
    foreach($lines as &$line)$line['unit_price']=(int)$line['price'];unset($line);
    foreach($groups as $indices){$tier=shopKitTarget(count(array_unique(array_map(fn($i)=>$lines[$i]['sku'],$indices))));foreach($indices as $i)$lines[$i]['unit_price']=shopKitUnit($lines[$i],$tier);}
    $full=0;$total=0;
    foreach($lines as &$line){$full+=$line['price']*$line['qty'];$total+=$line['unit_price']*$line['qty'];$line['price']=$line['unit_price'];unset($line['unit_price'],$line['kit_price'],$line['kit_discount_pct'],$line['fulfillment_supplier']);}unset($line);
    return ['lines'=>$lines,'full'=>round($full,2),'subtotal'=>round($total,2),'saving'=>round($full-$total,2)];
}

function shopPriceFloor(array $v): int {
    $price=(int)$v['price'];$pct=max(0,min(100,(float)($v['kit_discount_pct'] ?? 0)));
    return min($price,max((int)round($price*(1-$pct/100)),(int)($v['kit_price'] ?? $price)));
}
function shopPromoPercent(string $code): int {
    if($code==='')return 0;
    $codes=cfg('shop_promo_codes');$pct=is_array($codes)?($codes[$code] ?? null):null;
    if(!is_numeric($pct) || (int)$pct<=0 || (int)$pct>30)throw new RuntimeException('Промокод не активний.');
    return (int)$pct;
}
function shopPromoDiscount(array $lines,array $raw,string $code): int|float {
    $pct=shopPromoPercent($code);$discount=0;
    foreach($lines as $i=>$l){$v=$raw[$i];if((float)$v['kit_discount_pct']<=0)continue;$final=max(shopPriceFloor($v),(int)round($l['price']*(1-$pct/100)));$discount+=max(0,$l['price']-$final)*$l['qty'];}
    return round($discount,2);
}

function shopPromoLineAmounts(array $lines,array $raw,string $code): array {
    $pct=shopPromoPercent($code);$amounts=[];
    foreach($lines as $i=>$l){$v=$raw[$i];$final=(int)$l['price'];if((float)$v['kit_discount_pct']>0)$final=max(shopPriceFloor($v),(int)round($l['price']*(1-$pct/100)));$amounts[]=round($final*$l['qty'],2);}
    return $amounts;
}
