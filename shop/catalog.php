<?php
declare(strict_types=1);
require __DIR__.'/catalog-lib.php';
require_once __DIR__.'/pricing.php';
try {
    rubizhHeaders();rubizhPublicGate('catalog');rubizhHttpWork('public-read',16);$GLOBALS['rubizh_public_query_budget']=true;
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET')!=='GET') shopJson(['ok'=>false,'error'=>'Тільки читання.'],405);
    header('Cache-Control: public, max-age=30');
    $_GET=rubizhCatalogInput($_GET);
    $db=db();if(($_GET['action'] ?? '')==='promo'){try{shopJson(['ok'=>true,'percent'=>shopPromoPercent(trim((string)($_GET['code'] ?? '')))]);}catch(RuntimeException $e){shopJson(['ok'=>false,'error'=>$e->getMessage()],400);}}$action=$_GET['action'] ?? '';
    // Short HTTP freshness; a stale snapshot must not receive the new version's ETag.
    if($action==='storefront'){require_once __DIR__.'/kit-data.php';shopJson(shopStorefront($db));}
    if($action==='product') {
        $slug=(string)($_GET['slug'] ?? '');$id=(string)($_GET['id'] ?? '');
        $p=shopCached('product-'.md5($slug.'|'.$id),function()use($db,$slug,$id){
            $q=$db->prepare('SELECT * FROM products WHERE visible=1 AND '.($slug!=='' ? 'slug' : 'id').'=?');$q->execute([$slug!=='' ? $slug : $id]);$r=$q->fetch(PDO::FETCH_ASSOC);
            if(!$r)return null;
            $p=shopProduct($db,$r,product_photos($db,[$r['id']]));try{$p['related']=shopRelated($db,$r,$p);}catch(Throwable $e){error_log('rubizh related: '.get_class($e).' code '.(string)$e->getCode());$p['related']=[];}
            return $p;
        });
        if(!$p)shopJson(['ok'=>false,'error'=>'Товар не знайдено.'],404);
        shopJson(['ok'=>true,'product'=>$p]);
    }
    if($action==='ids') shopJson(['ok'=>true,'items'=>shopProductsByIds($db,explode(',',(string)($_GET['ids'] ?? '')))]);
    if($action==='categories')shopJson(['ok'=>true,'categories'=>shopCategories($db)]);
    shopJson(shopCatalog($db,$_GET));
} catch(Throwable $e) {error_log('rubizh catalog: '.get_class($e).' code '.(string)$e->getCode());if($e instanceof RubizhHttpException){header('Cache-Control: no-store');if($e->retryAfter)header('Retry-After: '.$e->retryAfter);shopJson(['ok'=>false,'error'=>$e->getMessage()],$e->status);}header('Cache-Control: no-store');header('Retry-After: 2');shopJson(['ok'=>false,'error'=>'Каталог тимчасово недоступний. Спробуйте ще раз.'],503);}
