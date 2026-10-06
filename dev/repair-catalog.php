<?php
declare(strict_types=1);
// Dry run by default. Apply preserves every changed row for rollback outside the web root.
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require __DIR__.'/../shop/catalog-lib.php';
$db=db();$changes=[];$missing=0;
foreach($db->query('SELECT id,name,category_path,category_id,attributes,data,description,hash,updated_at FROM products WHERE visible=1')->fetchAll(PDO::FETCH_ASSOC) as $row){
    $data=json_decode((string)$row['data'],true)?:[];
    $attributes=shopDescriptionAttributes((string)($data['description']??$row['description']),array_replace(is_array($data['attributes']??null)?$data['attributes']:[],json_decode((string)$row['attributes'],true)?:[]));
    if(!$attributes)$missing++;
    $category=shopCorrectCategory($row['name'],$row['category_path']);
    if($category===$row['category_path']&&$attributes===(json_decode((string)$row['attributes'],true)?:[]))continue;
    $changes[]=['before'=>$row,'category'=>$category,'attributes'=>$attributes];
}
echo json_encode(['mode'=>in_array('--apply',$argv,true)?'apply':'dry-run','rows_to_repair'=>count($changes),'without_confirmed_attributes'=>$missing,'recategorize'=>count(array_filter($changes,fn($c)=>$c['category']!==$c['before']['category_path']))],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)."\n";
if(!in_array('--apply',$argv,true)||!$changes)exit;
$backupDir=dirname(dirname(__DIR__)).'/rubizh-private-backups';
if(!is_dir($backupDir)&&!mkdir($backupDir,0700,true))throw new RuntimeException('Backup directory unavailable');
$backup=$backupDir.'/catalog-'.gmdate('Ymd-His').'-'.bin2hex(random_bytes(4)).'.json';
$mask=umask(0077);try{if(file_put_contents($backup,json_encode(array_column($changes,'before'),JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),LOCK_EX)===false)throw new RuntimeException('Backup unavailable');}finally{umask($mask);}
$db->beginTransaction();
try{
    $q=$db->prepare('UPDATE products SET category_path=?,category_id=?,attributes=?,data=?,hash=?,updated_at=? WHERE id=? AND updated_at=? AND hash=?');
    foreach($changes as $c){$r=$c['before'];$data=json_decode((string)$r['data'],true)?:[];$data['category']=$c['category'];$data['attributes']=$c['attributes'];$json=json_encode($data,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);$q->execute([$c['category'],sha1($c['category']),json_encode($c['attributes'],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$json,sha1($json),now(),$r['id'],$r['updated_at'],$r['hash']]);if($q->rowCount()!==1)throw new RuntimeException('Concurrent catalog import: retry repair');}
    recount_categories($db);$db->prepare("INSERT INTO meta(k,v) VALUES('catalog_updated',?) ON DUPLICATE KEY UPDATE v=VALUES(v)")->execute([now()]);$db->commit();
}catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
echo "Repair complete; private rollback snapshot saved.\n";
