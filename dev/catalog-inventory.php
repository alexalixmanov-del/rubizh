<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
// Read-only identity inventory of the shop database for migration reconciliation (LOST_* = 0 checks).
// Prints counts and SHA256 digests of identities only; no customer data, credentials or prices in clear text.
// Usage: php dev/catalog-inventory.php > before.json ; (migrate) ; php dev/catalog-inventory.php --compare=before.json
require_once dirname(__DIR__).'/api/lib.php';
try{
    $options=getopt('',['compare:']);
    // Direct connection: db() would run request-time migrations; an inventory must never write.
    $db=rubizhDatabaseConnect(cfg());
    $db->exec('SET SESSION TRANSACTION READ ONLY');$db->beginTransaction();
    $has=fn(string $t)=>(int)$db->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=".$db->quote($t))->fetchColumn()===1;
    $digest=function(string $sql)use($db){$h=hash_init('sha256');$n=0;foreach($db->query($sql,PDO::FETCH_NUM) as $row){hash_update($h,json_encode($row,JSON_UNESCAPED_UNICODE)."\n");$n++;}return ['count'=>$n,'sha256'=>hash_final($h)];};
    $money=fn(string $c)=>"CASE WHEN $c IS NULL THEN NULL ELSE CAST(ROUND($c*100) AS SIGNED) END";
    $out=['database'=>(string)$db->query('SELECT DATABASE()')->fetchColumn(),'schema'=>(string)$db->query("SELECT v FROM meta WHERE k='schema'")->fetchColumn(),
     'PRODUCTS'=>$digest('SELECT id,visible FROM products ORDER BY id'),
     'URLS'=>$digest('SELECT id,slug FROM products ORDER BY id'),
     'SKU'=>$digest('SELECT sku,product_id FROM variants ORDER BY sku'),
     'VARIANTS'=>$digest('SELECT sku,size,color,availability FROM variants ORDER BY sku'),
     'PRICES'=>$digest('SELECT sku,'.$money('price').','.$money('kit_price').' FROM variants ORDER BY sku'),
     'STOCK'=>$digest("SELECT sku,availability,JSON_UNQUOTE(JSON_EXTRACT(CASE WHEN JSON_VALID(data) THEN data ELSE '{}' END,'$.stock')) FROM variants ORDER BY sku"),
     'PHOTOS'=>$digest('SELECT id,product_id,pos,src_hash,status FROM photos ORDER BY id'),
     'CATEGORIES'=>$digest('SELECT id,path,url_path FROM categories ORDER BY id'),
     'CANONICAL_CATEGORIES'=>$has('rubizh_canonical_categories')?$digest('SELECT category_id,parent_id,slug,url_path,status FROM rubizh_canonical_categories ORDER BY category_id'):null,
     'CATEGORY_BINDINGS'=>$has('rubizh_product_categories')?$digest('SELECT product_id,category_id FROM rubizh_product_categories ORDER BY product_id'):null,
     'CATEGORY_ALIASES'=>$has('rubizh_category_aliases')?$digest('SELECT legacy_id,legacy_url,category_id FROM rubizh_category_aliases ORDER BY legacy_id'):null,
     'ORDERS'=>$has('rubizh_customer_orders')?$digest('SELECT id,order_number,status,payment_status,'.$money('total').',SHA2(items_json,256) FROM rubizh_customer_orders ORDER BY id'):null,
     'ORDER_ITEMS'=>$has('rubizh_customer_orders')?['count'=>(int)array_sum(array_map(fn($j)=>count(json_decode((string)$j,true)?:[]),$db->query('SELECT items_json FROM rubizh_customer_orders')->fetchAll(PDO::FETCH_COLUMN)))]:null,
     'ACCOUNTS'=>$has('rubizh_accounts')?$digest('SELECT id FROM rubizh_accounts ORDER BY id'):null,
     'ACCOUNT_ORDERS'=>$has('rubizh_account_orders')?$digest('SELECT order_id,customer_id FROM rubizh_account_orders ORDER BY order_id'):null,
     'FAVORITES'=>$has('rubizh_favorites')?$digest('SELECT customer_id,product_id FROM rubizh_favorites ORDER BY customer_id,product_id'):null,
     'PRICING_POLICIES'=>$has('rubizh_catalog_pricing')?$digest('SELECT sku,product_id,revision FROM rubizh_catalog_pricing ORDER BY sku'):null,
     'FULFILLMENT'=>$has('rubizh_catalog_fulfillment')?$digest('SELECT sku,product_id,SHA2(supplier_name,256) FROM rubizh_catalog_fulfillment ORDER BY sku'):null,
     'MONO_INVOICES'=>$has('rubizh_mono_invoices')?$digest('SELECT id,order_id,status,amount FROM rubizh_mono_invoices ORDER BY id'):null,
     'SHIPMENTS'=>$has('rubizh_order_shipments')?$digest('SELECT * FROM rubizh_order_shipments ORDER BY 1'):null,
     'HISTORY'=>$has('rubizh_order_timeline')?$digest('SELECT * FROM rubizh_order_timeline ORDER BY 1'):null];
    $db->rollBack();
    if(isset($options['compare'])){
        $before=json_decode((string)file_get_contents((string)$options['compare']),true,64,JSON_THROW_ON_ERROR);$lost=[];
        foreach($out as $k=>$v)if(is_array($v)&&isset($before[$k])&&is_array($before[$k]))$lost['LOST_'.$k]=['before'=>$before[$k]['count'],'after'=>$v['count'],'identical'=>($before[$k]['sha256']??null)===($v['sha256']??null)&&$before[$k]['count']===$v['count']];
        $out=['compare'=>$lost,'all_identical'=>!array_filter($lost,fn($x)=>!$x['identical'])]+$out;
    }
    echo json_encode($out,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR)."\n";
}catch(Throwable $e){fwrite(STDERR,"Inventory failed: ".get_class($e)."\n");exit(1);}
