<?php
declare(strict_types=1);
require_once __DIR__.'/taxonomy-migration.php';
require_once __DIR__.'/taxonomy-semantic-v2.php';

function shopV2Schema(PDO $db): void {
    shopTaxonomySchema($db);
    $db->exec("CREATE TABLE IF NOT EXISTS rubizh_category_decisions(product_id VARCHAR(64) PRIMARY KEY,category_id VARCHAR(64) NOT NULL,manual_category_lock TINYINT NOT NULL DEFAULT 0,authority VARCHAR(30) NOT NULL,status VARCHAR(40) NOT NULL,semantic TEXT NOT NULL,evidence TEXT NOT NULL,classifier_version VARCHAR(40) NOT NULL,updated_at DATETIME NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $db->exec("CREATE TABLE IF NOT EXISTS rubizh_category_audit(id BIGINT AUTO_INCREMENT PRIMARY KEY,product_id VARCHAR(64) NOT NULL,old_category_id VARCHAR(64) NULL,new_category_id VARCHAR(64) NOT NULL,event VARCHAR(40) NOT NULL,reason TEXT NOT NULL,evidence TEXT NOT NULL,run_id VARCHAR(64) NOT NULL,created_at DATETIME NOT NULL,KEY product(product_id,id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $db->exec("CREATE TABLE IF NOT EXISTS rubizh_supplier_category_rules(id BIGINT AUTO_INCREMENT PRIMARY KEY,supplier VARCHAR(100) NOT NULL,raw_category VARCHAR(600) NOT NULL,primary_product_type VARCHAR(80) NOT NULL,canonical_category_id VARCHAR(64) NOT NULL,active TINYINT NOT NULL DEFAULT 0,preview_hash CHAR(64) NULL,created_at DATETIME NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}
function shopV2TableExists(PDO $db,string $table): bool {
    $q=$db->prepare('SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?');$q->execute([$table]);return (int)$q->fetchColumn()===1;
}
function shopV2Decisions(PDO $db): array {return shopV2TableExists($db,'rubizh_category_decisions')?array_column($db->query('SELECT * FROM rubizh_category_decisions ORDER BY product_id')->fetchAll(PDO::FETCH_ASSOC),null,'product_id'):[];}
function shopV2AuditEvent(PDO $db,string $id,?string $old,string $new,string $event,string $reason,array $evidence,string $run): void {
    $db->prepare('INSERT INTO rubizh_category_audit(product_id,old_category_id,new_category_id,event,reason,evidence,run_id,created_at) VALUES(?,?,?,?,?,?,?,UTC_TIMESTAMP())')->execute([$id,$old,$new,$event,$reason,json_encode($evidence,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$run]);
}
function shopV2DecisionWrite(PDO $db,string $id,array $r,string $authority='AUTO',bool $locked=false): void {
    $db->prepare('INSERT INTO rubizh_category_decisions(product_id,category_id,manual_category_lock,authority,status,semantic,evidence,classifier_version,updated_at) VALUES(?,?,?,?,?,?,?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id),manual_category_lock=VALUES(manual_category_lock),authority=VALUES(authority),status=VALUES(status),semantic=VALUES(semantic),evidence=VALUES(evidence),classifier_version=VALUES(classifier_version),updated_at=VALUES(updated_at)')->execute([$id,$r['category_id'],(int)$locked,$authority,$locked?'MANUAL_LOCK':$r['status'],json_encode($r['semantic'],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),json_encode($r['evidence'],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),'semantic-v2']);
}
function shopV2Relations(PDO $db): array {return shopV2TableExists($db,'rubizh_product_categories')?array_column($db->query('SELECT * FROM rubizh_product_categories ORDER BY product_id')->fetchAll(PDO::FETCH_ASSOC),null,'product_id'):[];}
function shopV2Evaluate(array $p,?array $old=null,?array $decision=null): array {
    $r=shopSemanticResolve($p);$data=shopSemanticObject($p['data']??[]);
    $locked=(int)($decision['manual_category_lock']??0)===1||($data['manual_category_lock']??false)===true;
    $manualId=$decision['category_id']??$old['category_id']??$data['canonical_category_id']??null;
    if($locked&&is_string($manualId)){$r['category_id']=shopCanonicalCategoryId($manualId);$r['status']='MANUAL_LOCK';$r['reason']='administrator_confirmed_category';$r['authority']='MANUAL';return $r;}
    $confirmed=$p['canonical_category_id']??$data['canonical_category_id']??(($decision['authority']??'')==='PIM'?$decision['category_id']:null)??(($old['reason']??'')==='pim_canonical_id'?$old['category_id']:null);
    if(is_string($confirmed)){
        $id=shopCanonicalCategoryId($confirmed);$def=shopTaxonomyDefinitions()[$id]??null;
        if($def&&$def['status']==='active'&&$def['parent_id']!==null){
            $r['semantic_proposed_category_id']=$r['category_id'];
            if($r['category_id']!=='__CATEGORY_REVIEW__'&&$r['category_id']!==$id){$r['status']='CATEGORY_ANOMALY';$r['reason']='semantic_evidence_contradicts_pim_authority';}
            else{$r['status']='AUTO_CONFIRMED';$r['reason']='pim_canonical_id';}
            $r['category_id']=$id;$r['authority']='PIM';
        }
    }
    return $r+['authority'=>'AUTO'];
}
function shopV2Plan(PDO $db): array {
    $before=shopTaxonomyAudit($db);$old=shopV2Relations($db);$decisions=shopV2Decisions($db);$rows=[];$relations=[];$stats=['TOTAL_PRODUCTS'=>0,'UNCHANGED'=>0,'PROPOSED_CHANGES'=>0,'AUTO_CONFIRMED'=>0,'REAL_CONFLICTS'=>0,'INSUFFICIENT_DATA'=>0,'MANUAL_LOCKS'=>0,'MANUAL_LOCK'=>0,'CATEGORY_ANOMALIES'=>0,'CHANGED_HIGH_CONFIDENCE'=>0,'CHANGED_REVIEW'=>0,'LOST_PRODUCTS'=>0,'LOST_VARIANTS'=>0,'DUPLICATES'=>0];$gain=[];$loss=[];$identities=[];
    foreach($db->query('SELECT * FROM products ORDER BY id') as $p){
        $id=$p['id'];$previous=$old[$id]['category_id']??null;$r=shopV2Evaluate($p,$old[$id]??null,$decisions[$id]??null);$relations[$id]=$r;
        $review=in_array($r['status'],['REAL_CONFLICT','INSUFFICIENT_DATA'],true);$changed=$previous!==$r['category_id'];
        $state=$r['status']==='MANUAL_LOCK'?'MANUAL_LOCK':($review?($r['status']==='INSUFFICIENT_DATA'?'INSUFFICIENT_DATA':'CHANGED_REVIEW'):($changed?'CHANGED_HIGH_CONFIDENCE':'UNCHANGED'));
        $data=shopSemanticObject($p['data']);$supplier=(string)($data['supplier_id']??$data['supplier']??$p['supplier']??'');
        if($supplier!==''&&!empty($data['external_id']))$identities[$supplier.'|'.$data['external_id']][]=$id;
        $rows[]=['product_id'=>$id,'product_name'=>$p['name'],'supplier'=>$supplier,'supplier_category'=>$r['semantic']['supplier_category'],'supplier_category_path'=>$r['semantic']['supplier_category_path'],'old_category_id'=>$previous,'proposed_category_id'=>$r['category_id'],'reason'=>$r['reason'],'evidence'=>$r['evidence'],'status'=>$state,'decision_status'=>$r['status'],'decision_score'=>$r['decision_score'],'semantic'=>$r['semantic']];
        $stats['TOTAL_PRODUCTS']++;$stats[$state]++;if($state==='MANUAL_LOCK')$stats['MANUAL_LOCKS']++;
        if($r['status']==='REAL_CONFLICT')$stats['REAL_CONFLICTS']++;
        if($r['status']==='CATEGORY_ANOMALY')$stats['CATEGORY_ANOMALIES']++;
        if(in_array($r['status'],['AUTO_CONFIRMED','AUTO_CONFIRMED_WITH_ATTRIBUTES','SUPPLIER_MAPPING'],true))$stats['AUTO_CONFIRMED']++;
        if($changed&&!$review&&$r['status']!=='MANUAL_LOCK'){$stats['PROPOSED_CHANGES']++;$gain[$r['category_id']]=($gain[$r['category_id']]??0)+1;if($previous)$loss[$previous]=($loss[$previous]??0)+1;}
    }
    $duplicates=array_values(array_filter($identities,fn($ids)=>count($ids)>1));$stats['DUPLICATES']=count($duplicates);
    if($before!==shopTaxonomyAudit($db))throw new RuntimeException('Catalogue changed while generating dry run; retry');
    $identityHash=hash('sha256',json_encode([$old,$decisions],JSON_THROW_ON_ERROR));
    return ['taxonomy_version'=>shopTaxonomySpec()['version'],'classifier_version'=>'semantic-v2','mode'=>'dry-run','before'=>$before,'category_state_sha256'=>$identityHash,'summary'=>$stats,'categories_gaining_products'=>$gain,'categories_losing_products'=>$loss,'duplicate_identity_groups'=>$duplicates,'rows'=>$rows,'relations'=>$relations,'created_at'=>gmdate('c')];
}
function shopV2Export(array $plan,string $dir): string {
    $dir=shopTaxonomyPrivateDirectory($dir);
    foreach(['dry-run.json','dry-run.json.sha256','all-products.csv','changes.csv'] as $name)if(is_link($dir.'/'.$name))throw new RuntimeException('Report file cannot be a symlink');
    $bytes=json_encode($plan,JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR);$file=$dir.'/dry-run.json';
    if(file_put_contents($file,$bytes)!==strlen($bytes))throw new RuntimeException('Report write failed');chmod($file,0600);
    $columns=['product_id','product_name','supplier','supplier_category','supplier_category_path','old_category_id','proposed_category_id','status','decision_status','reason','evidence'];
    foreach(['all-products.csv'=>false,'changes.csv'=>true] as $filename=>$onlyChanged){$f=fopen($dir.'/'.$filename,'wb');if(!$f)throw new RuntimeException('CSV write failed');fwrite($f,"\xEF\xBB\xBF");fputcsv($f,$columns,';','"','');foreach($plan['rows'] as $row){if($onlyChanged&&$row['status']==='UNCHANGED')continue;$values=array_map(function($key)use($row){$value=is_array($row[$key]??null)?json_encode($row[$key],JSON_UNESCAPED_UNICODE):($row[$key]??'');return is_string($value)&&preg_match('/^[=+\-@\t\r]/',$value)?"'".$value:$value;},$columns);fputcsv($f,$values,';','"','');}fclose($f);chmod($dir.'/'.$filename,0600);}
    $hash=hash('sha256',$bytes);file_put_contents($file.'.sha256',$hash."\n");return $hash;
}
function shopV2CategoryState(PDO $db): string {
    $state=[];
    foreach(['rubizh_canonical_categories'=>'category_id','rubizh_product_categories'=>'product_id','rubizh_category_aliases'=>'legacy_id','rubizh_category_decisions'=>'product_id'] as $table=>$key)$state[$table]=$db->query("SELECT * FROM `$table` ORDER BY `$key`")->fetchAll(PDO::FETCH_ASSOC);
    $state['meta']=$db->query("SELECT k,v FROM meta WHERE k IN ('canonical_taxonomy','classifier_version') ORDER BY k")->fetchAll(PDO::FETCH_ASSOC);
    return hash('sha256',json_encode($state,JSON_THROW_ON_ERROR));
}
function shopV2Apply(PDO $db,string $reportFile,string $expectedSha,string $backupBase): array {
    $bytes=file_get_contents($reportFile);if(!is_string($bytes)||!preg_match('/^[a-f0-9]{64}$/D',$expectedSha)||!hash_equals($expectedSha,hash('sha256',$bytes)))throw new RuntimeException('Reviewed report checksum mismatch');
    $reviewed=json_decode($bytes,true,512,JSON_THROW_ON_ERROR);if(($reviewed['mode']??'')!=='dry-run'||($reviewed['classifier_version']??'')!=='semantic-v2')throw new RuntimeException('Not a Reclassification v2 report');
    if((int)$db->query("SELECT GET_LOCK('rubizh-category-migration',30)")->fetchColumn()!==1)throw new RuntimeException('PIM import is running');
    try{
        // DDL must happen before the transaction; it does not alter products.
        shopV2Schema($db);$db->beginTransaction();$plan=shopV2Plan($db);
        if($plan['before']['fingerprints']!==$reviewed['before']['fingerprints']||$plan['category_state_sha256']!==$reviewed['category_state_sha256']||$plan['relations']!==$reviewed['relations'])throw new RuntimeException('Catalogue or decisions changed after review; generate a fresh dry run');
        $backup=shopTaxonomyBackup($db,$backupBase);$old=shopV2Relations($db);$run='v2-'.gmdate('YmdHis').'-'.bin2hex(random_bytes(4));shopTaxonomySeed($db);$applied=0;
        foreach($plan['relations'] as $id=>$r){
            if($r['status']==='MANUAL_LOCK')continue;
            if(in_array($r['status'],['REAL_CONFLICT','INSUFFICIENT_DATA'],true)&&isset($old[$id])){
                // Preserve an existing category pending review, but exclude its
                // disputed metadata from automated kit recommendations.
                $r['category_id']=shopCanonicalCategoryId($old[$id]['category_id']);shopV2DecisionWrite($db,$id,$r);shopV2AuditEvent($db,$id,$old[$id]['category_id'],$r['category_id'],'REVIEW_REQUIRED',$r['reason'],$r['evidence'],$run);continue;
            }
            shopTaxonomyWriteRelation($db,$id,$r);shopV2DecisionWrite($db,$id,$r,$r['authority']);
            shopV2AuditEvent($db,$id,$old[$id]['category_id']??null,$r['category_id'],$r['status'],$r['reason'],$r['evidence'],$run);$applied++;
        }
        foreach(shopTaxonomySpec()['id_aliases'] as $oldId=>$newId)$db->prepare('UPDATE rubizh_category_aliases SET category_id=? WHERE category_id=?')->execute([$newId,$oldId]);
        $db->prepare("INSERT INTO meta(k,v) VALUES('canonical_taxonomy',?) ON DUPLICATE KEY UPDATE v=VALUES(v)")->execute([shopTaxonomySpec()['version']]);
        $db->prepare("INSERT INTO meta(k,v) VALUES('classifier_version','semantic-v2') ON DUPLICATE KEY UPDATE v=VALUES(v)")->execute();
        $after=shopTaxonomyAudit($db);if($plan['before']['fingerprints']!==$after['fingerprints'])throw new RuntimeException('Protected catalogue data changed; rollback');
        $record=json_encode(['run_id'=>$run,'report_sha256'=>$expectedSha,'before'=>$plan['before'],'after'=>$after,'category_state_after'=>shopV2CategoryState($db),'summary'=>$plan['summary']],JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR);
        if(file_put_contents($backup.'/reclassification-v2.json',$record)!==strlen($record)||file_put_contents($backup.'/reclassification-v2.sha256',hash('sha256',$record))!==64)throw new RuntimeException('Migration record write failed');
        chmod($backup.'/reclassification-v2.json',0600);chmod($backup.'/reclassification-v2.sha256',0600);
        $db->prepare("INSERT INTO meta(k,v) VALUES('catalog_updated',?) ON DUPLICATE KEY UPDATE v=VALUES(v)")->execute([gmdate('c').'-'.$run]);$db->commit();shopTaxonomyActive($db,true);shopTaxonomyContext($db,true);shopCacheClear();
        return ['run_id'=>$run,'applied'=>$applied,'backup'=>$backup,'LOST_PRODUCTS'=>0,'LOST_VARIANTS'=>0,'protected_fingerprints_preserved'=>true];
    }catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}finally{$db->query("SELECT RELEASE_LOCK('rubizh-category-migration')");}
}
function shopV2Rollback(PDO $db,string $dir): array {
    $real=realpath($dir);$web=realpath(dirname(__DIR__));
    if(!$real||$real===$web||str_starts_with($real,$web.'/'))throw new RuntimeException('Use a private backup outside the web root');
    $bytes=file_get_contents($real.'/database-manifest.json');$sha=trim(file_get_contents($real.'/database.sha256'));
    if(!hash_equals($sha,hash('sha256',$bytes)))throw new RuntimeException('Backup manifest checksum mismatch');
    $manifest=json_decode($bytes,true,512,JSON_THROW_ON_ERROR);$recordBytes=file_get_contents($real.'/reclassification-v2.json');
    if(!hash_equals(trim(file_get_contents($real.'/reclassification-v2.sha256')),hash('sha256',$recordBytes)))throw new RuntimeException('Migration record checksum mismatch');
    $record=json_decode($recordBytes,true,512,JSON_THROW_ON_ERROR);$snapshot=[];
    foreach(['meta','rubizh_canonical_categories','rubizh_product_categories','rubizh_category_aliases','rubizh_category_decisions'] as $table){
        $entry=$manifest['tables'][$table]??null;if(!$entry)throw new RuntimeException('Category backup incomplete');
        if($entry['file']!=='table-'.$table.'.json.gz'||is_link($real.'/'.$entry['file'])||!hash_equals($entry['sha256'],hash_file('sha256',$real.'/'.$entry['file'])))throw new RuntimeException('Category backup checksum mismatch');
        $snapshot[$table]=json_decode(gzdecode(file_get_contents($real.'/'.$entry['file'])),true,512,JSON_THROW_ON_ERROR);
    }
    if((int)$db->query("SELECT GET_LOCK('rubizh-category-migration',30)")->fetchColumn()!==1)throw new RuntimeException('PIM import is running');
    try{
        $db->beginTransaction();$before=shopTaxonomyAudit($db);
        if($before['fingerprints']!==$record['after']['fingerprints']||!hash_equals($record['category_state_after'],shopV2CategoryState($db)))throw new RuntimeException('Products or category decisions changed after apply; automatic rollback refused');
        $current=shopV2Relations($db);
        foreach(['rubizh_canonical_categories','rubizh_product_categories','rubizh_category_aliases','rubizh_category_decisions'] as $table){
            $db->exec("DELETE FROM `$table`");foreach($snapshot[$table] as $row){$keys=array_keys($row);foreach($keys as $key)if(!preg_match('/^[a-z_]+$/D',$key))throw new RuntimeException('Invalid backup column');$db->prepare("INSERT INTO `$table` (`".implode('`,`',$keys)."`) VALUES (".implode(',',array_fill(0,count($keys),'?')).')')->execute(array_values($row));}
        }
        $db->exec("DELETE FROM meta WHERE k IN ('canonical_taxonomy','classifier_version')");
        foreach($snapshot['meta'] as $row)if(in_array($row['k'],['canonical_taxonomy','classifier_version'],true))$db->prepare('INSERT INTO meta(k,v) VALUES(?,?)')->execute([$row['k'],$row['v']]);
        $run='rollback-'.$record['run_id'];foreach(shopV2Relations($db) as $id=>$row)shopV2AuditEvent($db,$id,$current[$id]['category_id']??null,$row['category_id'],'ROLLBACK','Reviewed migration rolled back',[],$run);
        if($before['fingerprints']!==shopTaxonomyAudit($db)['fingerprints'])throw new RuntimeException('Protected data changed during rollback');
        $db->prepare("INSERT INTO meta(k,v) VALUES('catalog_updated',?) ON DUPLICATE KEY UPDATE v=VALUES(v)")->execute([gmdate('c').'-'.$run]);$db->commit();shopTaxonomyActive($db,true);shopTaxonomyContext($db,true);shopCacheClear();
        return ['mode'=>'category-only-rollback','run_id'=>$run,'protected_fingerprints_preserved'=>true];
    }catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}finally{$db->query("SELECT RELEASE_LOCK('rubizh-category-migration')");}
}
function shopV2ManualLock(PDO $db,string $id,string $category,string $reason): void {
    $category=shopCanonicalCategoryId($category);$def=shopTaxonomyDefinitions()[$category]??null;if(!$def||$def['status']!=='active'||$def['parent_id']===null)throw new RuntimeException('Select a canonical leaf category');
    shopV2Schema($db);if((int)$db->query("SELECT GET_LOCK('rubizh-category-migration',30)")->fetchColumn()!==1)throw new RuntimeException('PIM import is running');
    try{$db->beginTransaction();$q=$db->prepare('SELECT * FROM products WHERE id=?');$q->execute([$id]);$p=$q->fetch();if(!$p)throw new RuntimeException('Product not found');$old=shopV2Relations($db)[$id]['category_id']??null;$r=shopSemanticResolve($p);$r['category_id']=$category;$r['status']='MANUAL_LOCK';$r['reason']=$reason;shopTaxonomyWriteRelation($db,$id,$r);shopV2DecisionWrite($db,$id,$r,'MANUAL',true);shopV2AuditEvent($db,$id,$old,$category,'MANUAL_LOCK',$reason,$r['evidence'],'manual-'.bin2hex(random_bytes(5)));$db->commit();shopTaxonomyContext($db,true);shopCacheClear();}catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}finally{$db->query("SELECT RELEASE_LOCK('rubizh-category-migration')");}
}
