<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
// Read-only catalog SQL profile: builds catalog responses without cache and records every statement,
// its time, Handler_read* rows examined, EXPLAIN plan keys and whether it contains REGEXP/JSON inference.
// Usage: php dev/catalog-sql-profile.php [--input='{"category":"..."}' ...]
require_once dirname(__DIR__).'/shop/catalog-lib.php';
try{
    $inputs=[];foreach((array)(getopt('',['input:'])['input']??[]) as $raw)$inputs[]=json_decode((string)$raw,true,16,JSON_THROW_ON_ERROR);
    if(!$inputs)$inputs=[[],['availability'=>'in'],['q'=>'куртка'],['sort'=>'cheap']];
    $db=db();$GLOBALS['rubizh_cache_rebuild']=true;
    $examined=function()use($db):int{$n=0;foreach($db->query("SHOW SESSION STATUS LIKE 'Handler_read%'")->fetchAll(PDO::FETCH_NUM) as [$k,$v])$n+=(int)$v;return $n;};
    $pure=function_exists('pimV3OnlyCatalog')&&pimV3OnlyCatalog($db);
    $out=['pim_v3_only_catalog'=>$pure,'visible_products'=>(int)$db->query('SELECT COUNT(*) FROM products WHERE visible=1')->fetchColumn(),'runs'=>[]];
    foreach($inputs as $input){
        $db->exec('FLUSH STATUS');$before=$examined();$t=microtime(true);
        $result=shopCatalogBuild($db,rubizhCatalogInput($input));
        $ms=round((microtime(true)-$t)*1000,1);$rows=$examined()-$before;
        $out['runs'][]=['input'=>$input,'total'=>$result['total'],'items'=>count($result['items']),'ms'=>$ms,'handler_rows_read'=>$rows];
    }
    // Static SQL text checks of the generated predicates for the default listing.
    $sizeRequired=$pure?'0=1':shopSizeRequiredProductSql($db);
    $buyable=shopBuyableSql('av',$sizeRequired);
    $out['buyable_predicate_has_regexp']=stripos($buyable,'REGEXP')!==false;
    $out['buyable_predicate_has_json']=stripos($buyable,'JSON_')!==false;
    $photo=function_exists('shopUsablePhotoSql')?shopUsablePhotoSql('p'):'1=1';
    $count="SELECT COUNT(*) FROM products p WHERE p.visible=1 AND $photo AND ".($pure?'p.pim_contract_version=3':"EXISTS(SELECT 1 FROM variants av WHERE av.product_id=p.id AND $buyable)");
    $out['explain_count']=$db->query('EXPLAIN '.$count)->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode($out,JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR)."\n";
}catch(Throwable $e){fwrite(STDERR,'Profile failed: '.$e->getMessage()."\n");exit(1);}
