<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
// Full SITE catalog reset before one fresh PIM contract-3 publication (owner command, pre-launch only).
// Clears catalog data (pre-launch): products/models, real SKU, photos and colour/model photo relations, colours, size catalogs and
// options, product category bindings and decisions, pricing/fulfillment/supplier article stores, PIM batches and
// history, legacy product/category mappings, favourites, shared kits, cart reminders, stock reservations, sync log.
// Keeps: taxonomy (categories, canonical categories, category URL aliases, PIM categories), supplier category rules,
// orders/payments/shipments/accounts/settings and all code. Rollback = the verified DB backup required by --apply.
// Usage:
//   php dev/pim-v3-catalog-reset.php --plan --out=/private/catalog-reset-plan.json
//   php dev/pim-v3-catalog-reset.php --apply --plan-file=/private/catalog-reset-plan.json --plan-sha256=<sha> --backup-file=<db.sql.gz> --backup-sha256=<sha>
require_once dirname(__DIR__).'/api/lib.php';
// Children before parents (foreign keys): history/chunks → batches; selections/mappings/photo relations/size data →
// variants → colours → photos → products. Order request selections point at catalog SKU/size options, so they go too
// (pre-launch: only test orders exist; the orders themselves stay).
const PIM_V3_RESET_TABLES=['rubizh_pim_history','rubizh_pim_batch_chunks','rubizh_pim_batches','rubizh_pim_legacy_mappings','rubizh_pim_category_mappings',
    'rubizh_order_request_selections','rubizh_color_photos','rubizh_model_photos','rubizh_size_options','rubizh_size_catalogs',
    'rubizh_catalog_pricing','rubizh_catalog_fulfillment','rubizh_catalog_supplier_articles','rubizh_product_categories','rubizh_category_decisions',
    'rubizh_category_sync_errors','rubizh_category_audit','rubizh_favorites','rubizh_shared_kits','rubizh_cart_reminders','rubizh_stock_reservations',
    'variants','rubizh_product_colors','photos','products','sync_log'];
const PIM_V3_RESET_KEEP=['categories','rubizh_canonical_categories','rubizh_category_aliases','rubizh_pim_categories','rubizh_supplier_category_rules','rubizh_customer_orders','rubizh_accounts','meta'];
try{
    $o=getopt('',['plan','out:','apply','plan-file:','plan-sha256:','backup-file:','backup-sha256:']);
    $root=realpath(dirname(__DIR__));
    $private=static function(string $file)use($root):string{$dir=realpath(dirname($file));if($dir===false||str_starts_with($dir.DIRECTORY_SEPARATOR,$root.DIRECTORY_SEPARATOR))throw new RuntimeException('Plan file must be outside the web root');return $dir.DIRECTORY_SEPARATOR.basename($file);};
    $db=rubizhDatabaseConnect(cfg());
    $database=(string)$db->query('SELECT DATABASE()')->fetchColumn();
    $exists=static fn(string $t)=>(int)$db->query('SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='.$db->quote($t))->fetchColumn()===1;
    $counts=static function(array $tables)use($db,$exists):array{$out=[];foreach($tables as $t)if($exists($t))$out[$t]=(int)$db->query("SELECT COUNT(*) FROM `$t`")->fetchColumn();return $out;};
    $planOf=static function()use($counts,$database):array{$remove=$counts(PIM_V3_RESET_TABLES);$keep=$counts(PIM_V3_RESET_KEEP);$p=['kind'=>'PIM_V3_CATALOG_RESET_PLAN','database'=>$database,'remove'=>$remove,'keep'=>$keep];$p['plan_sha256']=hash('sha256',json_encode([$database,$remove,$keep]));return $p;};
    if(isset($o['plan'])&&!isset($o['apply'])){
        $plan=$planOf()+['created_at'=>gmdate('c')];
        if(isset($o['out'])){$file=$private((string)$o['out']);file_put_contents($file,json_encode($plan,JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR));chmod($file,0600);}
        echo json_encode($plan+['plan_file'=>$file??null],JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES),"\n";exit(0);
    }
    if(isset($o['apply'])){
        $file=$private((string)($o['plan-file']??''));$want=strtolower((string)($o['plan-sha256']??''));
        $plan=json_decode((string)file_get_contents($file),true,64,JSON_THROW_ON_ERROR);
        if(($plan['kind']??'')!=='PIM_V3_CATALOG_RESET_PLAN'||!hash_equals((string)$plan['plan_sha256'],$want))throw new RuntimeException('Plan file and --plan-sha256 do not match');
        $backup=(string)($o['backup-file']??'');$sum=strtolower((string)($o['backup-sha256']??''));$real=realpath($backup);
        if($real===false||!is_file($real)||filesize($real)<1024||str_starts_with($real,$root.DIRECTORY_SEPARATOR)||!preg_match('/^[a-f0-9]{64}$/D',$sum)||!hash_equals($sum,hash_file('sha256',$real)))throw new RuntimeException('Verified off-webroot DB backup required');
        $now=$planOf();if($now['plan_sha256']!==$plan['plan_sha256'])throw new RuntimeException('STALE_PLAN: catalog changed since the plan; run --plan again');
        $db->beginTransaction();
        $deleted=[];foreach(PIM_V3_RESET_TABLES as $t)if($exists($t))$deleted[$t]=$db->exec("DELETE FROM `$t`");
        $db->prepare("INSERT INTO meta(k,v) VALUES('catalog_updated',?) ON DUPLICATE KEY UPDATE v=VALUES(v)")->execute([now().'-catalog-reset']);
        $db->prepare("INSERT INTO meta(k,v) VALUES('pricing_catalog_version',?) ON DUPLICATE KEY UPDATE v=VALUES(v)")->execute([bin2hex(random_bytes(16))]);
        $left=$counts(PIM_V3_RESET_TABLES);if(array_sum($left)!==0){$db->rollBack();throw new RuntimeException('Reset incomplete; nothing changed');}
        $db->commit();
        if(function_exists('recount_categories'))try{recount_categories($db);}catch(Throwable){}
        if(function_exists('shopCacheClear'))shopCacheClear();
        echo json_encode(['reset'=>'COMMITTED','deleted'=>$deleted,'kept'=>$counts(PIM_V3_RESET_KEEP),'rollback'=>'restore the verified DB backup given in --backup-file'],JSON_PRETTY_PRINT),"\n";exit(0);
    }
    throw new RuntimeException('usage');
}catch(Throwable $e){if(isset($db)&&$db->inTransaction())$db->rollBack();fwrite(STDERR,'Catalog reset refused: '.($e->getMessage()==='usage'?'use --plan --out=FILE | --apply --plan-file=FILE --plan-sha256=SHA --backup-file=FILE --backup-sha256=SHA':$e->getMessage())."\n");exit(1);}
