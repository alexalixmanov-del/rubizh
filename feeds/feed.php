<?php
declare(strict_types=1);
require_once __DIR__.'/../shop/catalog-lib.php';
function shopFeedVariant(array $p,array $v,array $photos): ?array {
 $data=json_decode((string)($p['data']??''),true)?:[];$extra=json_decode((string)($v['data']??''),true)?:[];
 if(!shopVariantCanBuy($v)||empty($data['ads_allowed'])||!(int)$p['visible']||(float)$v['price']<=0||!empty($extra['size_unconfirmed']))return null;
 $date='';if($v['availability']==='in'){
  if(!isset($extra['stock'])||(float)$extra['stock']<=0)return null;$availability='in_stock';
 }elseif($v['availability']==='order'){$attrs=json_decode((string)($p['attributes']??''),true)?:[];$date=(string)($extra['availability_date']??$attrs['Дата доступності']??'');if(!preg_match('/^\d{4}-\d{2}-\d{2}$/D',$date)||!checkdate((int)substr($date,5,2),(int)substr($date,8,2),(int)substr($date,0,4))||$date<gmdate('Y-m-d'))return null;$availability='preorder';$date.='T00:00:00+03:00';}else return null;
 $image='';foreach($photos as $ph){$url=(string)($ph['url']??'');if(preg_match('~^/media/[a-zA-Z0-9_./-]+\.webp$~D',$url)&&!str_contains($url,'..')){$image='https://rubizh.shop'.$url;break;}}if($image==='')return null;
 $size=(string)($extra['size_display']??$v['size']);return ['id'=>$v['sku'],'item_group_id'=>$p['id'],'title'=>mb_substr(trim($p['name'].' · '.$v['color'].' · '.$size,' ·'),0,150),'description'=>mb_substr(shopDescription((string)$p['description']),0,5000),'link'=>'https://rubizh.shop/product/'.$p['slug'],'image_link'=>$image,'availability'=>$availability,'availability_date'=>$date,'condition'=>'new','price'=>number_format((float)$v['price'],2,'.','').' UAH','brand'=>shopBrand($p['brand']),'mpn'=>$v['sku'],'identifier_exists'=>'no','color'=>shopColor($v['color']),'size'=>$size,'product_type'=>$p['category_path']];
}
function shopFeedRows(PDO $db): Generator {
 $last='';do{$q=$db->prepare("SELECT * FROM products p WHERE visible=1 AND ".shopUsablePhotoSql('p')." AND id>? AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.ads_allowed'))='true' ORDER BY id LIMIT 200");$q->execute([$last]);$products=$q->fetchAll(PDO::FETCH_ASSOC);$photos=product_photos($db,array_column($products,'id'));$variants=shopVariantRows($db,array_column($products,'id'));foreach($products as $p){$last=$p['id'];foreach($variants[$p['id']]??[] as $v){$row=shopFeedVariant($p,$v,$photos[$p['id']]??[]);if($row)yield $row;}}}while(count($products)===200);
}
function shopFeedOutput(string $format): void {
 try{$db=db();header('X-Content-Type-Options: nosniff');header('Cache-Control: public, no-cache');
 if($format==='google'){header('Content-Type: application/xml; charset=utf-8');echo '<?xml version="1.0" encoding="UTF-8"?><rss xmlns:g="http://base.google.com/ns/1.0" version="2.0"><channel><title>РУБІЖ</title><link>https://rubizh.shop</link><description>Каталог РУБІЖ</description>';foreach(shopFeedRows($db) as $row){echo '<item>';foreach($row as $key=>$value)if($value!=='')echo '<g:'.$key.'>'.htmlspecialchars((string)$value,ENT_XML1|ENT_QUOTES,'UTF-8').'</g:'.$key.'>';echo '</item>';}echo '</channel></rss>';}
 else{header('Content-Type: text/csv; charset=utf-8');$h=fopen('php://output','w');$keys=['id','item_group_id','title','description','link','image_link','availability','availability_date','condition','price','brand','mpn','identifier_exists','color','size','product_type'];fputcsv($h,$keys,',','"','');foreach(shopFeedRows($db) as $row)fputcsv($h,array_map(fn($k)=>$row[$k],$keys),',','"','');fclose($h);}}
 catch(Throwable $e){error_log('rubizh feed generation failed');http_response_code(503);header('Cache-Control: no-store');echo $format==='google'?'<!-- Каталог тимчасово недоступний -->':'';}
}
