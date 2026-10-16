<?php
declare(strict_types=1);
require __DIR__.'/shop/catalog-lib.php';
try{$db=db();header('Content-Type: application/xml; charset=utf-8');header('Cache-Control: public,max-age=3600');echo '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">';
    foreach(['','catalog','categories','porady','kit/','offer','privacy'] as $path)echo '<url><loc>https://rubizh.shop/'.$path.'</loc></url>';
    foreach(json_decode(file_get_contents(__DIR__.'/shop/guides.json'),true) as $g)echo '<url><loc>'.htmlspecialchars('https://rubizh.shop/porady/'.$g['slug'],ENT_XML1,'UTF-8').'</loc></url>';
    // Stage 5 (D-62): the indexable group pages.
    foreach(shopCategoryGroups() as $g)echo '<url><loc>https://rubizh.shop/rozdil/'.htmlspecialchars($g['slug'],ENT_XML1,'UTF-8').'</loc></url>';
    foreach(shopCategories($db) as $c)echo '<url><loc>'.htmlspecialchars('https://rubizh.shop/catalog/'.$c['url_path'],ENT_XML1,'UTF-8').'</loc></url>';
    // Лише опубліковані товари, які можна купити зараз або під замовлення. Карта будується на кожен запит, тож оновлюється одразу після публікації з PIM.
    // SEO-5.4: each product carries its photos (image sitemap, up to 10 per page, absolute https URLs only).
    $rows=$db->query("SELECT p.id,p.slug,p.updated_at FROM products p WHERE p.visible=1 AND ".shopUsablePhotoSql('p')." AND p.availability IN ('in','order') AND EXISTS(SELECT 1 FROM variants av WHERE av.product_id=p.id AND ".shopBuyableSql('av').")")->fetchAll(PDO::FETCH_ASSOC);
    foreach(array_chunk($rows,500) as $chunk){$photos=product_photos($db,array_column($chunk,'id'));
        foreach($chunk as $p){$images='';foreach(array_slice($photos[$p['id']]??[],0,10) as $ph){$u=(string)$ph['url'];if(str_starts_with($u,'/'))$u='https://rubizh.shop'.$u;if(str_starts_with($u,'https://'))$images.='<image:image><image:loc>'.htmlspecialchars($u,ENT_XML1,'UTF-8').'</image:loc></image:image>';}
            echo '<url><loc>'.htmlspecialchars('https://rubizh.shop/product/'.$p['slug'],ENT_XML1,'UTF-8').'</loc><lastmod>'.substr($p['updated_at'],0,10).'</lastmod>'.$images.'</url>';}}
    echo '</urlset>';
}catch(Throwable $e){error_log('rubizh sitemap: '.$e->getMessage());http_response_code(503);}
