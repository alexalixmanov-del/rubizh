<?php
declare(strict_types=1);
require __DIR__.'/../auth/bootstrap.php';require_once __DIR__.'/store-lib.php';
try{
    $db=shopStoreDatabase();$method=$_SERVER['REQUEST_METHOD'] ?? 'GET';
    if($method==='POST'){
        $input=shopBody();shopCsrf($input);shopLimit($db,'kits',60);
        $lines=is_array($input['lines'] ?? null)?$input['lines']:[];if(count($lines)>20)throw new RuntimeException('У комплекті може бути до 20 позицій.');
        $resolved=shopResolvedLines($db,$lines);$clean=[];
        foreach($resolved as $i=>$line){$slot=customerField($lines[$i],'slot',40);if(!in_array($slot,['head','body','legs','boots','armor','gear','med','small'],true))throw new RuntimeException('Перевірте розділ товару в комплекті.');$clean[]=['product_id'=>$line['product_id'],'sku'=>$line['sku'],'qty'=>$line['qty'],'slot'=>$slot];}
        $code=bin2hex(random_bytes(16));$db->prepare('INSERT INTO rubizh_shared_kits(code,lines_json,created_at,expires_at) VALUES(?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP()+INTERVAL 1 YEAR)')->execute([$code,json_encode($clean,JSON_THROW_ON_ERROR)]);
        shopJson(['ok'=>true,'url'=>'https://rubizh.shop/kit/'.$code],201);
    }
    if($method!=='GET')shopJson(['ok'=>false,'error'=>'Недозволений метод.'],405);
    $code=(string)($_GET['code'] ?? '');if(!preg_match('/^[a-f0-9]{32}$/D',$code))shopJson(['ok'=>false,'error'=>'Комплект не знайдено.'],404);
    $q=$db->prepare('SELECT lines_json FROM rubizh_shared_kits WHERE code=? AND expires_at>UTC_TIMESTAMP()');$q->execute([$code]);$json=$q->fetchColumn();if(!$json)shopJson(['ok'=>false,'error'=>'Комплект не знайдено або термін посилання минув.'],404);
    $lines=json_decode($json,true);shopJson(['ok'=>true,'lines'=>$lines,'items'=>shopProductsByIds($db,array_column($lines,'product_id'))]);
}catch(Throwable $e){error_log('rubizh kits: '.$e->getMessage());shopJson(['ok'=>false,'error'=>$e instanceof PDOException?'Не вдалося зберегти комплект. Спробуйте ще раз.':$e->getMessage()],400);}
