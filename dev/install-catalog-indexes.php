<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require __DIR__.'/../api/lib.php';
$db=db();$added=0;
foreach([
 ['products','idx_catpath','category_path(191)'],
 ['products','idx_vis_cat_price','visible,category_path(120),price_min'],
 ['products','idx_vis_avail_price','visible,availability,price_min'],
 ['variants','idx_prod_avail_price','product_id,availability,price'],
 ['photos','idx_updated','updated_at'],
] as [$table,$name,$columns]){
 $indexes=$db->query('SHOW INDEX FROM `'.$table.'`')->fetchAll(PDO::FETCH_ASSOC);
 if(in_array($name,array_column($indexes,'Key_name'),true))continue;
 $db->exec('ALTER TABLE `'.$table.'` ADD INDEX `'.$name.'` ('.$columns.')');$added++;
}
echo json_encode(['indexes_added'=>$added],JSON_THROW_ON_ERROR)."\n";
