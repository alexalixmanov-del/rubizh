<?php
declare(strict_types=1);
require __DIR__.'/shop/catalog-lib.php';
try{$db=db();header('Content-Type: application/xml; charset=utf-8');header('Cache-Control: public,max-age=3600');echo '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
    foreach(['','catalog','categories','porady','kit/','offer','privacy'] as $path)echo '<url><loc>https://rubizh.shop/'.$path.'</loc></url>';
    foreach(json_decode(file_get_contents(__DIR__.'/shop/guides.json'),true) as $g)echo '<url><loc>'.htmlspecialchars('https://rubizh.shop/porady/'.$g['slug'],ENT_XML1,'UTF-8').'</loc></url>';
    foreach(shopCategories($db) as $c)echo '<url><loc>'.htmlspecialchars('https://rubizh.shop/catalog/'.$c['url_path'],ENT_XML1,'UTF-8').'</loc></url>';
    // Лише опубліковані товари, які можна купити зараз або під замовлення. Карта будується на кожен запит, тож оновлюється одразу після публікації з PIM.
    foreach($db->query("SELECT p.slug,p.updated_at FROM products p WHERE p.visible=1 AND ".shopUsablePhotoSql('p')." AND p.availability IN ('in','order') AND EXISTS(SELECT 1 FROM variants av WHERE av.product_id=p.id AND ".shopBuyableSql('av').")") as $p)echo '<url><loc>'.htmlspecialchars('https://rubizh.shop/product/'.$p['slug'],ENT_XML1,'UTF-8').'</loc><lastmod>'.substr($p['updated_at'],0,10).'</lastmod></url>';echo '</urlset>';
}catch(Throwable $e){error_log('rubizh sitemap: '.$e->getMessage());http_response_code(503);}
