<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require __DIR__.'/../shop/kit-catalog.php';
$db=db();$checks=[];$failed=false;
foreach(['head','body','legs','boots','armor','gear','med','small'] as $slot){
    try{
        $start=microtime(true);$result=shopCatalog($db,['slot'=>$slot]);
        foreach($result['items'] as $p){
            if(shopSlot($p)!==$slot||!$p['photos']||!$p['variants'])throw new RuntimeException('Invalid slot result');
            foreach($p['variants'] as $v)if(!shopVariantCanBuy($v))throw new RuntimeException('Unbuyable variant');
        }
        $checks[]=['slot'=>$slot,'ok'=>true,'products'=>$result['total'],'seconds'=>round(microtime(true)-$start,3)];
    }catch(Throwable $e){$failed=true;$checks[]=['slot'=>$slot,'ok'=>false,'error'=>mb_substr($e->getMessage(),0,500)];}
}
echo json_encode(['ok'=>!$failed,'slots'=>$checks],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_PRETTY_PRINT)."\n";
exit($failed?1:0);
