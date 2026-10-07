<?php
declare(strict_types=1);
// Read-only data report. Provider keys, customer records and source URLs are never printed.
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require __DIR__.'/../shop/catalog-lib.php';
$db=db();$photos=['counts'=>[],'missing_local_files'=>0,'failed_products'=>[]];$failed=[];
foreach($db->query('SELECT ph.product_id,ph.status,ph.file,ph.thumb,ph.error,p.slug FROM photos ph LEFT JOIN products p ON p.id=ph.product_id')->fetchAll(PDO::FETCH_ASSOC) as $r){
 $photos['counts'][$r['status']]=($photos['counts'][$r['status']]??0)+1;
 if($r['status']==='ok'&&(!media_file_exists((string)$r['file'])||!media_file_exists((string)$r['thumb'])))$photos['missing_local_files']++;
 if($r['status']==='error'&&isset($r['slug'])){$http=preg_match('/HTTP\s+(\d{3})/',(string)$r['error'],$m)?(int)$m[1]:null;$failed[$r['product_id']]=['slug'=>$r['slug'],'http_status'=>$http];}
}
$photos['failed_product_count']=count($failed);$photos['failed_products']=array_slice(array_values($failed),0,12);
$unconfirmed=0;$withoutSizes=[];
$q=$db->query('SELECT p.id,p.name,p.category_path,v.size,v.data FROM products p JOIN variants v ON v.product_id=p.id WHERE p.visible=1');
foreach($q->fetchAll(PDO::FETCH_ASSOC) as $r)if(shopVariantSizeUnconfirmed($r)){$unconfirmed++;$withoutSizes[$r['id']]=true;}
$report=['photos'=>$photos,'data'=>['unconfirmed_variants'=>$unconfirmed,'products_with_unconfirmed_sizes'=>count($withoutSizes),'brand_not_supplied'=>(int)$db->query("SELECT COUNT(*) FROM products WHERE visible=1 AND TRIM(brand)=''")->fetchColumn(),'source_attributes_not_supplied'=>(int)$db->query("SELECT COUNT(*) FROM products WHERE visible=1 AND (attributes IS NULL OR TRIM(attributes) IN ('','{}','[]'))")->fetchColumn()]];
echo json_encode($report,JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR)."\n";
