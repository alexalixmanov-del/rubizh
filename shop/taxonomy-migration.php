<?php
declare(strict_types=1);
require_once __DIR__.'/catalog-lib.php';
function shopTaxonomyAudit(PDO $db): array {
 $out=[];
 foreach(['products','variants','photos','categories','rubizh_catalog_fulfillment','rubizh_catalog_supplier_articles'] as $table){
  $key=match($table){'products','categories','photos'=>'id','variants','rubizh_catalog_fulfillment','rubizh_catalog_supplier_articles'=>'sku'};
  $hash=hash_init('sha256');$n=0;$q=$db->query("SELECT * FROM `$table` ORDER BY `$key`");while($r=$q->fetch(PDO::FETCH_ASSOC)){hash_update($hash,json_encode($r,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)."\n");$n++;}
  $out['counts'][$table]=$n;$out['fingerprints'][$table]=hash_final($hash);
 }
 $out['TOTAL_PRODUCTS']=(int)$db->query('SELECT COUNT(*) FROM products')->fetchColumn();
 $out['TOTAL_VARIANTS']=(int)$db->query('SELECT COUNT(*) FROM variants')->fetchColumn();
 $out['TOTAL_ACTIVE_PRODUCTS']=(int)$db->query('SELECT COUNT(*) FROM products WHERE visible=1')->fetchColumn();
 $out['TOTAL_IMAGES']=(int)$db->query('SELECT COUNT(*) FROM photos')->fetchColumn();
 $out['TOTAL_CATEGORY_RELATIONS']=(int)$db->query("SELECT COUNT(*) FROM products WHERE category_id IS NOT NULL OR category_path<>''")->fetchColumn();
 $out['TOTAL_PRODUCTS_WITHOUT_CATEGORY']=(int)$db->query("SELECT COUNT(*) FROM products WHERE category_id IS NULL AND category_path=''")->fetchColumn();
 if(shopTaxonomyActive($db)){$out['TOTAL_CATEGORY_RELATIONS']=(int)$db->query('SELECT COUNT(*) FROM rubizh_product_categories')->fetchColumn();$out['TOTAL_PRODUCTS_WITHOUT_CATEGORY']=(int)$db->query('SELECT COUNT(*) FROM products p LEFT JOIN rubizh_product_categories pc ON pc.product_id=p.id WHERE pc.product_id IS NULL')->fetchColumn();}
 return $out;
}
function shopTaxonomyPlan(PDO $db): array {
 $relations=[];$review=[];$groups=[];$duplicates=[];$assignments=[];$counts=[];
 $existing=shopTaxonomyActive($db)?shopTaxonomyContext($db)['relations']:[];
 foreach($db->query('SELECT * FROM products ORDER BY id') as $p){
  $r=shopTaxonomyResolve($p);if(isset($existing[$p['id']])){$r=$existing[$p['id']];$r['derived_attributes']=json_decode($r['derived_attributes'],true)?:[];$r['filter_attributes']=json_decode($r['filter_attributes'],true)?:[];unset($r['product_id']);}
  $relations[$p['id']]=$r;$assignments[$p['category_path']][$r['category_id']]=true;$counts[$p['category_path']]=($counts[$p['category_path']]??0)+1;
  if($r['category_id']==='__CATEGORY_REVIEW__')$review[]=['id'=>$p['id'],'name'=>$p['name'],'old_path'=>$p['category_path'],'reason'=>$r['reason'],'url'=>'/product/'.$p['slug']];
  $data=json_decode((string)$p['data'],true)?:[];$external=$data['external_id']??null;$supplier=$data['supplier_id']??null;
  if(is_scalar($external)&&is_scalar($supplier)&&$external!==''&&$supplier!=='')$groups[(string)$supplier.'|'.(string)$external][]=$p['id'];
 }
 foreach($groups as $k=>$ids)if(count($ids)>1)$duplicates[]=['source_identity'=>$k,'product_ids'=>$ids];
 $legacy=[];foreach(shopTaxonomySpec()['legacy_mapping'] as $m)$legacy[$m['old_path']]=$m;
 foreach($db->query('SELECT path,url_path FROM categories') as $c)if(!isset($legacy[$c['path']]))$legacy[$c['path']]=['old_path'=>$c['path'],'old_url'=>$c['url_path'],'category_id'=>'__CATEGORY_REVIEW__','decision'=>'manual_review','derived_attributes'=>[]];
 foreach($relations as $r)if(!isset($legacy[$r['legacy_path']]))$legacy[$r['legacy_path']]=['old_path'=>$r['legacy_path'],'old_url'=>implode('/',array_map('slugify',explode(' / ',$r['legacy_path']))),'category_id'=>'__CATEGORY_REVIEW__','decision'=>'manual_review','derived_attributes'=>[]];
 $defs=shopTaxonomyDefinitions();
 foreach($legacy as &$m){
  $ids=array_keys($assignments[$m['old_path']]??[]);
  if(count($ids)===1&&$ids[0]!=='__CATEGORY_REVIEW__')$m['category_id']=$ids[0];
  elseif(count($ids)>1){$root=explode(' / ',$m['old_path'])[0];foreach($defs as $d)if($d['parent_id']===null&&$d['path']===$root&&$d['status']==='active')$m['category_id']=$d['category_id'];$m['decision']='split_by_product_type';}
  $m['direct_products']=$counts[$m['old_path']]??0;$m['assigned_category_ids']=$ids;
  $m['new_url']=$m['category_id']==='__CATEGORY_REVIEW__'?'/catalog':'/catalog/'.$defs[$m['category_id']]['url_path'];
 }unset($m);
 return ['version'=>shopTaxonomySpec()['version'],'before'=>shopTaxonomyAudit($db),'relations'=>$relations,'mapping'=>array_values($legacy),'review'=>$review,'potential_duplicates'=>$duplicates,'unassigned_products'=>0,'created_product_ids'=>[],'created_variant_ids'=>[]];
}
function shopTaxonomyWriteAliases(PDO $db,array $mapping): void {
 $q=$db->prepare('INSERT INTO rubizh_category_aliases(legacy_id,legacy_path,legacy_url,category_id,filter_attributes) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE legacy_url=VALUES(legacy_url),category_id=VALUES(category_id),filter_attributes=VALUES(filter_attributes)');
 foreach($mapping as $m)$q->execute([sha1($m['old_path']),$m['old_path'],$m['old_url'],$m['category_id'],json_encode((object)$m['derived_attributes'],JSON_UNESCAPED_UNICODE)]);
}
function shopTaxonomyPrivateDirectory(string $dir): string {
 $web=realpath(dirname(__DIR__));$ancestor=$dir;
 while(!file_exists($ancestor)&&!is_link($ancestor)){$parent=dirname($ancestor);if($parent===$ancestor)throw new RuntimeException('Private directory unavailable');$ancestor=$parent;}
 $resolved=realpath($ancestor);if(!$resolved||$resolved===$web||str_starts_with($resolved,$web.'/')||is_link($dir))throw new RuntimeException('Use a private directory outside the web root');
 if(!is_dir($dir)&&!mkdir($dir,0700,true))throw new RuntimeException('Private directory unavailable');
 $real=realpath($dir);if(!$real||$real===$web||str_starts_with($real,$web.'/')||!chmod($real,0700))throw new RuntimeException('Private directory permissions unavailable');
 return $real;
}
function shopTaxonomyBackup(PDO $db,string $base): string {
 $oldMask=umask(0077);try{
 $base=shopTaxonomyPrivateDirectory($base);
 $dir=$base.'/taxonomy-'.gmdate('Ymd-His').'-'.bin2hex(random_bytes(4));if(!mkdir($dir,0700))throw new RuntimeException('Cannot create backup');
 $manifestDB=['version'=>2,'tables'=>[]];
 foreach($db->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $table){
  if(!preg_match('/^[a-zA-Z0-9_]+$/D',$table))throw new RuntimeException('Unsupported table identifier');
  $file='table-'.$table.'.json.gz';$gzip=gzopen($dir.'/'.$file,'wb6');if(!$gzip)throw new RuntimeException('Backup file unavailable');
  if(gzwrite($gzip,'[')!==1)throw new RuntimeException('Backup write failed');$first=true;$n=0;
  foreach($db->query("SELECT * FROM `$table`") as $row){$chunk=($first?'':',').json_encode($row,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);if(gzwrite($gzip,$chunk)!==strlen($chunk))throw new RuntimeException('Backup write failed');$first=false;$n++;}
  if(gzwrite($gzip,']')!==1||!gzclose($gzip))throw new RuntimeException('Backup completion failed');
  $manifestDB['tables'][$table]=['file'=>$file,'rows'=>$n,'sha256'=>hash_file('sha256',$dir.'/'.$file),'schema'=>$db->query("SHOW CREATE TABLE `$table`")->fetch(PDO::FETCH_NUM)[1]];
 }
 $json=json_encode($manifestDB,JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR);
 if(file_put_contents($dir.'/database-manifest.json',$json)!==strlen($json))throw new RuntimeException('Database manifest failed');
 if(file_put_contents($dir.'/database.sha256',hash('sha256',$json))===false)throw new RuntimeException('Backup checksum write failed');
 // Keep actual image bytes as well as database photo references; nothing in the web root is deleted.
 $source=realpath((string)cfg('media_dir'));$manifest=[];
 if($source&&is_dir($source)){
  foreach(new RecursiveIteratorIterator(new RecursiveDirectoryIterator($source,FilesystemIterator::SKIP_DOTS)) as $f){
   if($f->isLink())throw new RuntimeException('Media symlink needs manual backup');if(!$f->isFile())continue;
   $relative=substr($f->getPathname(),strlen($source)+1);$target=$dir.'/media/'.$relative;$parent=dirname($target);
   if(!is_dir($parent)&&!mkdir($parent,0700,true))throw new RuntimeException('Media backup directory failed');
   if(!copy($f->getPathname(),$target))throw new RuntimeException('Media backup failed');
   $hash=hash_file('sha256',$f->getPathname());if(!hash_equals($hash,hash_file('sha256',$target)))throw new RuntimeException('Media changed during backup; retry');$manifest[$relative]=$hash;
  }
 }
 if(file_put_contents($dir.'/media-manifest.json',json_encode((object)$manifest,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR))===false)throw new RuntimeException('Media manifest failed');
 return $dir;
 }finally{umask($oldMask);}
}
function shopTaxonomyExport(array $report,string $dir): void {
 if(!is_dir($dir)&&!mkdir($dir,0700,true))throw new RuntimeException('Report directory unavailable');
 $public=$report;unset($public['relations']);
 if(file_put_contents($dir.'/report.json',json_encode($public,JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR))===false)throw new RuntimeException('Report write failed');
 foreach(['mapping'=>['old_path','category_id','decision','direct_products','new_url'],'review'=>['id','name','old_path','reason','url']] as $key=>$columns){
  $f=fopen($dir.'/'.$key.'.csv','wb');if(!$f)throw new RuntimeException('CSV unavailable');fwrite($f,"\xEF\xBB\xBF");fputcsv($f,$columns,';', '"','');foreach($report[$key] as $r)fputcsv($f,array_map(fn($k)=>$r[$k]??'', $columns),';','"','');fclose($f);
 }
}
function shopTaxonomyApply(PDO $db,string $backupBase): array {
 shopTaxonomySchema($db);
 if((int)$db->query("SELECT GET_LOCK('rubizh-category-migration',30)")->fetchColumn()!==1)throw new RuntimeException('PIM import is running; retry migration');
 try{
  $db->beginTransaction();$plan=shopTaxonomyPlan($db);
  if($plan['unassigned_products']!==0)throw new RuntimeException('Dry run has unassigned products');
  $backup=shopTaxonomyBackup($db,$backupBase);shopTaxonomyExport($plan,$backup.'/dry-run');
  shopTaxonomySeed($db);foreach($plan['relations'] as $id=>$r)shopTaxonomyWriteRelation($db,$id,$r);shopTaxonomyWriteAliases($db,$plan['mapping']);
  $db->prepare("INSERT INTO meta(k,v) VALUES('canonical_taxonomy',?) ON DUPLICATE KEY UPDATE v=VALUES(v)")->execute([$plan['version']]);
  $db->prepare("INSERT INTO meta(k,v) VALUES('catalog_updated',?) ON DUPLICATE KEY UPDATE v=VALUES(v)")->execute([gmdate('Y-m-d H:i:s').'-'.bin2hex(random_bytes(3))]);
  shopTaxonomyActive($db,true);shopTaxonomyContext($db,true);$after=shopTaxonomyAudit($db);
  if($plan['before']['fingerprints']!==$after['fingerprints']||$after['TOTAL_PRODUCTS_WITHOUT_CATEGORY']!==0||$after['TOTAL_CATEGORY_RELATIONS']!==$after['TOTAL_PRODUCTS'])throw new RuntimeException('Catalog integrity check failed; changes rolled back');
  $plan['after']=$after;$plan['backup']=$backup;$plan['LOST_PRODUCTS']=0;$plan['LOST_VARIANTS']=0;$plan['UNEXPECTED_DUPLICATES']=0;$plan['migrated']=count($plan['relations']);$plan['review_count']=count($plan['review']);$plan['unchanged_product_rows']=$after['TOTAL_PRODUCTS'];
  shopTaxonomyExport($plan,$backup.'/after');$db->commit();shopCacheClear();return $plan;
 }catch(Throwable $e){if($db->inTransaction())$db->rollBack();shopTaxonomyActive($db,true);shopTaxonomyContext($db,true);throw $e;}
 finally{$db->query("SELECT RELEASE_LOCK('rubizh-category-migration')");}
}
function shopTaxonomyRollback(PDO $db,string $dir): void {
 $real=realpath($dir);$web=realpath(dirname(__DIR__));
 if(!$real||str_starts_with($real,$web.'/'))throw new RuntimeException('Use a private backup outside the web root');
 $bytes=file_get_contents($real.'/database-manifest.json');$hash=trim(file_get_contents($real.'/database.sha256'));
 if(!hash_equals($hash,hash('sha256',$bytes)))throw new RuntimeException('Backup checksum mismatch');$manifest=json_decode($bytes,true,512,JSON_THROW_ON_ERROR);$snapshot=['tables'=>[]];
 foreach(['meta','rubizh_canonical_categories','rubizh_product_categories','rubizh_category_aliases'] as $table){$entry=$manifest['tables'][$table]??null;if(!$entry)continue;
  if(!preg_match('/^table-[a-zA-Z0-9_]+\.json\.gz$/D',$entry['file']))throw new RuntimeException('Invalid backup file');$file=$real.'/'.$entry['file'];
  if(!hash_equals($entry['sha256'],hash_file('sha256',$file)))throw new RuntimeException('Backup table checksum mismatch');$snapshot['tables'][$table]=json_decode(gzdecode(file_get_contents($file)),true,512,JSON_THROW_ON_ERROR);
 }
 $report=json_decode(file_get_contents($real.'/after/report.json'),true,512,JSON_THROW_ON_ERROR);
 if((int)$db->query("SELECT GET_LOCK('rubizh-category-migration',30)")->fetchColumn()!==1)throw new RuntimeException('PIM import is running');
 try{
  $db->beginTransaction();$current=shopTaxonomyAudit($db);
  if($current['fingerprints']!==$report['after']['fingerprints'])throw new RuntimeException('Products changed since migration; automatic rollback refused to avoid overwriting a later PIM import');
  foreach(['rubizh_canonical_categories','rubizh_product_categories','rubizh_category_aliases'] as $table){$db->exec("DELETE FROM `$table`");foreach($snapshot['tables'][$table]??[] as $row){$keys=array_keys($row);$db->prepare("INSERT INTO `$table` (`".implode('`,`',$keys)."`) VALUES(".implode(',',array_fill(0,count($keys),'?')).')')->execute(array_values($row));}}
  $old=null;foreach($snapshot['tables']['meta'] as $r)if($r['k']==='canonical_taxonomy')$old=$r['v'];
  if($old===null)$db->exec("DELETE FROM meta WHERE k='canonical_taxonomy'");else $db->prepare("UPDATE meta SET v=? WHERE k='canonical_taxonomy'")->execute([$old]);
  $db->prepare("INSERT INTO meta(k,v) VALUES('catalog_updated',?) ON DUPLICATE KEY UPDATE v=VALUES(v)")->execute([gmdate('Y-m-d H:i:s').'-rollback-'.bin2hex(random_bytes(3))]);$db->commit();shopTaxonomyActive($db,true);shopTaxonomyContext($db,true);shopCacheClear();
 }catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}finally{$db->query("SELECT RELEASE_LOCK('rubizh-category-migration')");}
}
