<?php
declare(strict_types=1);
require_once __DIR__.'/catalog-lib.php';

// The picker uses the same product/variant rules as checkout, without repeating
// the slot CASE in every SQL count and facet query.
function shopKitCatalogBase(PDO $db,string $slot): array {
    return shopCached('kit-slot-'.$slot,fn()=>shopKitCatalogBaseBuild($db,$slot),'picker-v1',['operation'=>'kit-slot','slot'=>$slot]);
}
function shopKitCatalogBaseBuild(PDO $db,string $slot): array {
    $primary=shopKitPrimarySql($slot);
    if($slot==='body')$primary.=" OR LOWER(p.name) REGEXP 'футбол|поло|кофт|жилет|софтшел'";
    if($slot==='gear')$primary.=" OR LOWER(p.name) REGEXP 'сумк|баул|гідратор'";
    $rows=$db->query("SELECT p.id,p.name,p.category_path FROM products p WHERE p.visible=1 AND (".$primary.") AND EXISTS(SELECT 1 FROM photos ph WHERE ph.product_id=p.id) AND EXISTS(SELECT 1 FROM variants v WHERE v.product_id=p.id AND v.price>0 AND v.availability IN ('in','order')) ORDER BY FIELD(p.availability,'in','order','out'),p.updated_at DESC,p.id")->fetchAll(PDO::FETCH_ASSOC);
    $ids=[];foreach($rows as $row)if(shopSlot($row)===$slot&&!preg_match('/патрон|боєприпас|глушник|реб|репліка|страйкбол/iu',$row['name']))$ids[]=$row['id'];
    $items=[];foreach(array_chunk($ids,200) as $batch)foreach(shopProductsByIds($db,$batch) as $p){
        if(!$p['photos']||$p['sale_unit']==='m2')continue;
        $p['variants']=array_values(array_filter($p['variants'],fn($v)=>shopVariantCanBuy($v)&&!shopVariantSizeUnconfirmed($v,$p['name'],$p['category'])));
        if(!$p['variants'])continue;
        $p['description']='';$p['docs_note']='';$p['photos']=array_slice($p['photos'],0,1);
        $items[]=$p;
    }
    // IN() does not preserve the candidate order.
    $order=array_flip($ids);usort($items,fn($a,$b)=>$order[$a['id']]<=>$order[$b['id']]);
    return $items;
}
function shopKitCatalog(PDO $db,array $input): array {
    $slot=(string)$input['slot'];$all=shopKitCatalogBase($db,$slot);
    $words=array_slice(array_filter(preg_split('/\s+/u',mb_strtolower(str_replace('берци','берці',trim(mb_substr((string)($input['q']??''),0,160)))))?:[]),0,6);
    $sizes=array_slice(array_filter(explode('|',(string)($input['sizes']??''))),0,20);
    $colors=array_slice(array_filter(explode('|',(string)($input['camo']??''))),0,20);$colors=array_map('shopColor',$colors);
    $leaf=trim((string)($input['leaf']??''));$in=($input['availability']??'')==='in';$items=[];
    foreach($all as $p){
        if($leaf!==''){$parts=explode(' / ',$p['category']);if(end($parts)!==$leaf)continue;}
        $search=mb_strtolower($p['name'].' '.implode(' ',array_column($p['variants'],'sku')));foreach($words as $word)if(!str_contains($search,$word))continue 2;
        $variants=array_filter($p['variants'],function($v)use($p,$sizes,$colors,$in){
            if($in&&$v['availability']!=='in')return false;
            if($colors&&!in_array(shopColor($v['color']),$colors,true))return false;
            if($sizes&&!shopMatchesSizes(['name'=>$p['name'],'category_path'=>$p['category'],'size'=>$v['size_display'],'data'=>json_encode($v)],$sizes))return false;
            return true;
        });
        if($variants)$items[]=$p;
    }
    $facets=['leaves'=>[],'sizes'=>[],'camo'=>[]];$sizeRows=[];
    foreach($all as $p){$parts=explode(' / ',$p['category']);$facets['leaves'][]=end($parts);foreach($p['variants'] as $v){$facets['camo'][]=$v['color'];$sizeRows[]=['name'=>$p['name'],'category_path'=>$p['category'],'size'=>$v['size_display'],'size_native'=>$v['size_native']];}}
    $facets=array_replace($facets,shopSizeFacets($sizeRows));foreach(['leaves','camo'] as $key){$facets[$key]=array_values(array_unique(array_filter($facets[$key])));sort($facets[$key]);}
    $total=count($items);$pages=(int)ceil($total/24);$page=min(max(1,(int)($input['page']??1)),max(1,$pages));
    return ['ok'=>true,'items'=>array_slice($items,($page-1)*24,24),'total'=>$total,'page'=>$page,'pages'=>$pages,'facets'=>$facets];
}
