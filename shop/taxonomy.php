<?php
declare(strict_types=1);
// Category identities are independent of PIM names, product identities and supplier records.
function shopTaxonomySpec(): array {
 static $spec;return $spec??=json_decode(file_get_contents(__DIR__.'/canonical-taxonomy.json'),true,512,JSON_THROW_ON_ERROR);
}
function shopTaxonomyDefinitions(): array {return array_column(shopTaxonomySpec()['categories'],null,'category_id');}
function shopCanonicalCategoryId(string $id): string {return shopTaxonomySpec()['id_aliases'][$id]??$id;}
function shopTaxonomyNormalize(string $s): string {return mb_strtolower(trim(preg_replace('/\s+/u',' ',str_replace(['’','ʼ'],"'",$s))));}
function shopTaxonomyLegacy(string $path): ?array {
 static $map; $map??=array_column(shopTaxonomySpec()['legacy_mapping'],null,'old_path');
 return $map[$path]??null;
}
function shopTaxonomyActive(PDO $db,bool $reset=false): bool {
 global $rubizhTaxonomyActive;$key=spl_object_id($db);if($reset)unset($rubizhTaxonomyActive[$key]);
 if(isset($rubizhTaxonomyActive[$key]))return $rubizhTaxonomyActive[$key];
 $version=$db->query("SELECT v FROM meta WHERE k='canonical_taxonomy'")->fetchColumn();
 return $rubizhTaxonomyActive[$key]=$version==='20261007-v1'||($version!==false&&$version===shopTaxonomySpec()['version']);
}
function shopTaxonomyContext(PDO $db,bool $reset=false): array {
 global $rubizhTaxonomyContext;$key=spl_object_id($db);
 if($reset){unset($rubizhTaxonomyContext[$key]);return [];}
 if(isset($rubizhTaxonomyContext[$key]))return $rubizhTaxonomyContext[$key];
 $active=shopTaxonomyActive($db);
 $relations=[];
 if($active)foreach($db->query('SELECT product_id,category_id,derived_attributes,filter_attributes,legacy_path,reason FROM rubizh_product_categories')->fetchAll(PDO::FETCH_ASSOC) as $r)$relations[$r['product_id']]=$r;
 return $rubizhTaxonomyContext[$key]=['active'=>$active,'relations'=>$relations];
}
function shopTaxonomySchema(PDO $db): void {
 $db->exec("CREATE TABLE IF NOT EXISTS rubizh_canonical_categories(category_id VARCHAR(64) PRIMARY KEY,parent_id VARCHAR(64) NULL,slug VARCHAR(191) NOT NULL,display_name_uk VARCHAR(255) NOT NULL,status VARCHAR(20) NOT NULL,sort_order INT NOT NULL,path VARCHAR(600) NOT NULL,url_path VARCHAR(700) NOT NULL,aliases TEXT NOT NULL,KEY parent(parent_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
 $db->exec("CREATE TABLE IF NOT EXISTS rubizh_product_categories(product_id VARCHAR(64) PRIMARY KEY,category_id VARCHAR(64) NOT NULL,legacy_path VARCHAR(600) NOT NULL,derived_attributes TEXT NOT NULL,filter_attributes TEXT NOT NULL,reason VARCHAR(255) NOT NULL,revision VARCHAR(64) NOT NULL,KEY category(category_id,product_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
 $db->exec("CREATE TABLE IF NOT EXISTS rubizh_category_aliases(legacy_id CHAR(40) PRIMARY KEY,legacy_path VARCHAR(600) NOT NULL,legacy_url VARCHAR(700) NOT NULL,category_id VARCHAR(64) NOT NULL,filter_attributes TEXT NOT NULL,KEY category(category_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
 $db->exec("CREATE TABLE IF NOT EXISTS rubizh_category_sync_errors(id BIGINT AUTO_INCREMENT PRIMARY KEY,product_id VARCHAR(64) NOT NULL,category_id VARCHAR(191) NOT NULL,reason VARCHAR(255) NOT NULL,created_at DATETIME NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}
function shopTaxonomySeed(PDO $db): void {
 $q=$db->prepare('INSERT INTO rubizh_canonical_categories(category_id,parent_id,slug,display_name_uk,status,sort_order,path,url_path,aliases) VALUES(?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE parent_id=VALUES(parent_id),slug=VALUES(slug),display_name_uk=VALUES(display_name_uk),status=VALUES(status),sort_order=VALUES(sort_order),path=VALUES(path),url_path=VALUES(url_path),aliases=VALUES(aliases)');
 foreach(shopTaxonomySpec()['categories'] as $c)$q->execute([$c['category_id'],$c['parent_id'],$c['slug'],$c['display_name_uk'],$c['status'],$c['sort_order'],$c['path'],$c['url_path'],json_encode($c['aliases'],JSON_UNESCAPED_UNICODE)]);
}
// Resolve type names in ambiguous old branches. Colour, gender and season never create categories.
function shopTaxonomyResolve(array $p): array {
 $path=(string)($p['category_path']??$p['category']??'');$name=shopTaxonomyNormalize((string)($p['name']??''));$mapping=shopTaxonomyLegacy($path);$defs=shopTaxonomyDefinitions();
 $root=explode(' / ',$path)[0];$rid=null;foreach($defs as $c)if($c['parent_id']===null&&$c['status']==='active'&&$c['path']===$root)$rid=$c['category_id'];
 $id=$mapping['category_id']??'__CATEGORY_REVIEW__';$reason='legacy_mapping';$attrs=$mapping['derived_attributes']??[];
 // Already canonical IDs/paths and scoped aliases are accepted during the transition.
 if(!$mapping){$matches=[];$normalized=shopTaxonomyNormalize($path);foreach($defs as $c)if($c['status']==='active'&&in_array($normalized,array_map('shopTaxonomyNormalize',array_merge([$c['path']],$c['aliases'])),true))$matches[$c['category_id']]=$c;
  if(count($matches)===1){$c=reset($matches);$id=$c['category_id'];$rid=$c['parent_id']??$id;}}
 $rules=[
  'clothing'=>[['rainwear','пончо|дощовик'],['gloves','рукавич|рукавиці'],['balaclavas','балаклав|бафф?|шарф.*труб'],['headwear','шапк|кепк|панам|бейсбол'],['belts','^ремін|^ремень|портуп'],['thermal','термобілиз|термо.*футбол|термо.*кальсон'],['combat_shirts','убакс|ubacs|бойова сороч'],['pants','^штани|^брюки|тактичн.*штани'],['shorts','шорти'],['jackets','куртк|вітровк'],['costumes','костюм|^форма|комплект.*форм'],['fleece','фліс|флис|худі|кофт'],['tshirts','футбол|поло|майк|тільняшк'],['vests','жилет'],['sweaters','светр|гольф']],
  'footwear'=>[['gaiters','бахіл'],['socks','шкарпет'],['accessories','устілк|стельк|спрей|догляд'],['boots','берц|берци'],['sneakers','кросів|кроссов'],['shoes','черевик']],
  'armor'=>[['accessories','^комплект камербанд|^камербанд|^кишен|^чохол|^підсум'],['soft','балістичний пакет|балістичні пакети|бронепакет|балістичний фартух'],['sets','бронекомплект|комплект.*бронезахист'],['plates','бронеплит'],['vests','бронежилет'],['carriers','плитоноск']],
  'helmets'=>[['covers','кавер'],['suspension','подушк|підвіс'],['rails','рейк|планк'],['mounts','кріплен|адаптер'],['ballistic','шолом|каск']],
  'communications'=>[['ptt','ptt'],['antennas','антен'],['accessories','заряд|кріплен'],['headphones','навушник|наушник'],['radios','^раці|радіостанц']],
  'bags'=>[['hydration','гідратор|питна система'],['duffel','баул|транспортна сумк'],['waist','поясна сумк|бананка'],['shoulder','через плече'],['organizers','органайзер'],['assault','штурмов.*рюкзак|рюкзак.*штурмов'],['tactical','рюкзак'],['tactical_bags','сумк|баул']],
  'pouches'=>[['dump','скидання|скид.*магазин'],['dangler','напашн'],['tourniquets','турнікет'],['grenades','гранат'],['magazines','магазин'],['ifak','ifak|аптеч'],['radios','раці'],['phone','телефон'],['panels','панел|платформ'],['utility','утилітар|органайзер']],
  'load_bearing'=>[['rps','рпс'],['belts','пояс|ремінь'],['shoulder','плечов'],['systems','розвантаж']],
  'limb_protection'=>[['sets','наколін.*налокіт|налокіт.*наколін'],['knees','наколін'],['elbows','налокіт']],
  'medical'=>[['training','навчальн|тренувальн'],['tourniquets','турнікет|джгут'],['hemostatics','гемостат'],['bandages','бандаж'],['kits','аптеч|ifak'],['shears','ножиц'],['occlusive','оклюз']],
  'camouflage'=>[['antidrone','антидрон'],['nets','маскувальн.*сітка'],['suits','маскувальн.*костюм'],['materials','маскувальн.*стрічк']],
  'field'=>[['seats','сидуш|п.ятиточ|для сидіння'],['mats','каремат|килимок'],['sleeping','спальн.*мішок'],['blankets','термоковд'],['thermos','термос'],['burners','пальник'],['fasteners','карабін'],['hygiene','гігієн|комар|кліщ|комах'],['other','прапор|шеврон|очищення води']],
  'electronics'=>[['mounts','перехідник|кріплення|j-arm|адаптер'],['memory',"карта пам|карти пам"],['cameras','екшн|камера'],['monoculars','монокуляр']],
  'lighting'=>[['headlamps','налобн'],['tactical','тактичн.*ліхтар'],['handheld','ліхтар']],
  'power'=>[['banks','повербанк|павербанк'],['stations','блок.*заряд|станці'],['solar','solar|соняч'],['batteries','акумулятор|батарей'],['cables','перехідник|кабель']],
  'weapon_accessories'=>[['slings','ремінь|ремень'],['magazines','^магазин'],['grips','руків|цівк|упор|^ручка'],['stocks','приклад|щок'],['bipods','сошк|біпод'],['holsters','кобур'],['cases','чохол|кейс'],['cleaning','чищенн|чистк']],
  'eye_protection'=>[['glasses','окуляр'],['masks','маск']],
  'tools'=>[['multitools','мультитул'],['knives','ніж|нож'],['tools','інструмент|ключ']]
 ];
 // Correct unmistakable misplaced goods; do not infer a random type from a broad technical branch.
 if(preg_match('/^(?:костюм тактичний|штани тактичні)/u',$name)&&$rid==='weapon_accessories')$rid='clothing';
 if(preg_match('/^наколінники/u',$name)&&$rid==='electronics')$rid='limb_protection';
 if($rid)foreach($rules[$rid]??[] as [$suffix,$pattern])if(preg_match('/'.$pattern.'/u',$name)){$id=$rid.'_'.$suffix;$reason='product_type';break;}
 // Root headings are navigation scopes, never an invented product type.
 if(!isset($defs[$id])||($defs[$id]['parent_id']===null&&$id!=='__CATEGORY_REVIEW__')){$id='__CATEGORY_REVIEW__';$reason='ambiguous_type';}
 // Preserve already precise attributes, including aliases from source descriptions.
 if(($p['brand']??'')!=='')unset($attrs['Бренд']);
 $existing=shopNormalizeAttributes(array_replace(json_decode((string)($p['data']??'{}'),true)['attributes']??[],is_array($p['attributes']??null)?$p['attributes']:(json_decode((string)($p['attributes']??'{}'),true)?:[])));
 foreach($attrs as $key=>$value)if(isset($existing[$key])&&trim((string)$existing[$key])!=='')unset($attrs[$key]);
 $effective=array_replace($attrs,$existing);$effective=array_intersect_key($effective,array_flip(['Стать','Сезон','Матеріал','Капюшон','Утеплювач','Мембрана','Клас захисту','Тип','Обʼєм','Вага','Розмір плити','Сумісність','Камуфляж','Бренд','Форм-фактор','Основа сітки']));
 return ['category_id'=>$id,'legacy_path'=>$path,'derived_attributes'=>$attrs,'filter_attributes'=>$effective,'reason'=>$reason];
}
function shopTaxonomyWriteRelation(PDO $db,string $id,array $r): void {
 $db->prepare('INSERT INTO rubizh_product_categories(product_id,category_id,legacy_path,derived_attributes,filter_attributes,reason,revision) VALUES(?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id),legacy_path=VALUES(legacy_path),derived_attributes=VALUES(derived_attributes),filter_attributes=VALUES(filter_attributes),reason=VALUES(reason),revision=VALUES(revision)')->execute([$id,$r['category_id'],$r['legacy_path'],json_encode((object)$r['derived_attributes'],JSON_UNESCAPED_UNICODE),json_encode((object)$r['filter_attributes'],JSON_UNESCAPED_UNICODE),$r['reason'],shopTaxonomySpec()['version']]);
}
function shopTaxonomySyncValidate(PDO $db,array $p): ?string {
 if(!shopTaxonomyActive($db)||!array_key_exists('canonical_category_id',$p))return null;
  $id=is_string($p['canonical_category_id'])?shopCanonicalCategoryId($p['canonical_category_id']):$p['canonical_category_id'];$defs=shopTaxonomyDefinitions();
 if(!is_string($id)||!isset($defs[$id])||$defs[$id]['status']!=='active'||$defs[$id]['parent_id']===null){
  $db->prepare('INSERT INTO rubizh_category_sync_errors(product_id,category_id,reason,created_at) VALUES(?,?,?,UTC_TIMESTAMP())')->execute([(string)($p['id']??''),is_scalar($id)?mb_substr((string)$id,0,191):'invalid','unknown_or_nonleaf_category_id']);
  return 'Невідомий canonical_category_id; товар і його поточну категорію збережено.';
 }return null;
}
function shopTaxonomySyncProduct(PDO $db,array $p): void {
 if(!shopTaxonomyActive($db))return;
 // An administrator's lock also survives imports during the v1 -> v2 review.
 $q=$db->prepare("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='rubizh_category_decisions'");$q->execute();
 if((int)$q->fetchColumn()===1){$q=$db->prepare('SELECT manual_category_lock FROM rubizh_category_decisions WHERE product_id=?');$q->execute([(string)$p['id']]);if((int)$q->fetchColumn()===1)return;}
 if($db->query("SELECT v FROM meta WHERE k='classifier_version'")->fetchColumn()==='semantic-v2'){
  require_once __DIR__.'/reclassification-v2.php';
  $q=$db->prepare('SELECT * FROM rubizh_product_categories WHERE product_id=?');$q->execute([(string)$p['id']]);$old=$q->fetch()?:null;
  $q=$db->prepare('SELECT * FROM rubizh_category_decisions WHERE product_id=?');$q->execute([(string)$p['id']]);$decision=$q->fetch()?:null;
  $r=shopV2Evaluate($p,$old,$decision);
  if($r['status']==='MANUAL_LOCK')return;
  if(in_array($r['status'],['REAL_CONFLICT','INSUFFICIENT_DATA'],true)&&$old)$r['category_id']=shopCanonicalCategoryId($old['category_id']);
  shopTaxonomyWriteRelation($db,(string)$p['id'],$r);shopV2DecisionWrite($db,(string)$p['id'],$r,$r['authority']);shopV2AuditEvent($db,(string)$p['id'],$old['category_id']??null,$r['category_id'],$r['status'],$r['reason'],$r['evidence'],'import-'.bin2hex(random_bytes(5)));shopTaxonomyContext($db,true);return;
 }
 $r=shopTaxonomyResolve($p);
 if(isset($p['canonical_category_id'])){$r['category_id']=shopCanonicalCategoryId($p['canonical_category_id']);$r['reason']='pim_canonical_id';}
 shopTaxonomyWriteRelation($db,(string)$p['id'],$r);shopTaxonomyContext($db,true);
}
function shopTaxonomyProduct(PDO $db,array $row): array {
 $context=shopTaxonomyContext($db);$r=$context['relations'][$row['id']]??null;
 if(!$context['active']||!$r)return [];
 $c=shopTaxonomyDefinitions()[shopCanonicalCategoryId($r['category_id'])]??null;if(!$c)return [];
 return ['canonical_category_id'=>$c['category_id'],'category'=>$c['status']==='active'?$c['path']:$row['category_path'],'category_url'=>$c['status']==='active'?$c['url_path']:'','derived_attributes'=>json_decode($r['derived_attributes'],true)?:[]];
}
function shopTaxonomyTarget(PDO $db,string $url): ?array {
 if(!shopTaxonomyContext($db)['active'])return null;
 $id=shopCanonicalCategoryId($url);foreach(shopTaxonomyDefinitions() as $c)if($c['status']==='active'&&($c['url_path']===$url||$c['category_id']===$id))return $c+['filters'=>[]];
 $q=$db->prepare('SELECT category_id,filter_attributes FROM rubizh_category_aliases WHERE legacy_url=? ORDER BY legacy_id LIMIT 1');$q->execute([$url]);$r=$q->fetch(PDO::FETCH_ASSOC);
 if(!$r)return null;if($r['category_id']==='__CATEGORY_REVIEW__')return ['category_id'=>'__CATEGORY_REVIEW__','status'=>'internal','url_path'=>'','filters'=>[]];$c=shopTaxonomyDefinitions()[shopCanonicalCategoryId($r['category_id'])]??null;
 return $c&&$c['status']==='active'?$c+['filters'=>json_decode($r['filter_attributes'],true)?:[]]:null;
}
function shopTaxonomyPredicate(PDO $db,array $category): string {
 $ids=[$category['category_id']];foreach(shopTaxonomyDefinitions() as $c)if($c['parent_id']===$category['category_id'])$ids[]=$c['category_id'];
 foreach(shopTaxonomySpec()['id_aliases']??[] as $old=>$target)if(in_array($target,$ids,true))$ids[]=$old;
 return 'EXISTS(SELECT 1 FROM rubizh_product_categories pc WHERE pc.product_id=p.id AND pc.category_id IN ('.implode(',',array_map(fn($id)=>$db->quote($id),$ids)).'))';
}
function shopTaxonomyCategories(PDO $db): array {
 $defs=shopTaxonomyDefinitions();$counts=[];
 // Count published goods, including preorder/out of stock. Publication is not changed by migration.
 foreach($db->query('SELECT pc.category_id,COUNT(*) n FROM rubizh_product_categories pc JOIN products p ON p.id=pc.product_id WHERE p.visible=1 GROUP BY pc.category_id') as $r){$id=shopCanonicalCategoryId($r['category_id']);$counts[$id]=($counts[$id]??0)+(int)$r['n'];$parent=$defs[$id]['parent_id']??null;if($parent)$counts[$parent]=($counts[$parent]??0)+(int)$r['n'];}
 $out=[];foreach($defs as $id=>$c)if($c['status']==='active'&&($counts[$id]??0)>0)$out[]=['id'=>$id,'category_id'=>$id,'parent_id'=>$c['parent_id'],'slug'=>$c['slug'],'name'=>$c['display_name_uk'],'path'=>$c['path'],'url_path'=>$c['url_path'],'status'=>$c['status'],'sort_order'=>$c['sort_order'],'product_count'=>$counts[$id]];
 return $out;
}
function shopTaxonomyRedirect(PDO $db,string $url,array $query=[]): ?string {
 $target=shopTaxonomyTarget($db,$url);if(!$target||$target['url_path']===$url)return null;
 if($target['status']==='internal')return '/catalog'.($query?'?'.http_build_query($query):'');
 $attrs=json_decode((string)($query['attrs']??'[]'),true);if(!is_array($attrs))$attrs=[];
 foreach($target['filters'] as $k=>$v)$attrs[]=$k."\1".$v;
 if($attrs)$query['attrs']=json_encode(array_values(array_unique($attrs)),JSON_UNESCAPED_UNICODE);
 return '/catalog/'.$target['url_path'].($query?'?'.http_build_query($query):'');
}
