<?php
declare(strict_types=1);
require __DIR__.'/../auth/bootstrap.php';require_once __DIR__.'/store-lib.php';
try{
    $db=shopStoreDatabase();$id=customerId();
    if(($_SERVER['REQUEST_METHOD'] ?? 'GET')==='POST'){
        $input=shopBody();shopCsrf($input);if($id===null)shopJson(['ok'=>false,'error'=>'Увійдіть, щоб зберігати обране між пристроями.'],401);
        shopLimit($db,'favorites',300);$action=$input['action'] ?? '';
        $db->beginTransaction();$lock=$db->prepare('SELECT id FROM rubizh_accounts WHERE id=? FOR UPDATE');$lock->execute([$id]);
        if($action==='favorite'){
            $product=customerField($input,'product_id',64);$enabled=($input['enabled'] ?? false)===true;
            if($enabled){$q=$db->prepare('SELECT id FROM products WHERE id=? AND visible=1');$q->execute([$product]);if(!$q->fetchColumn())shopJson(['ok'=>false,'error'=>'Товар не знайдено.'],404);
                $existing=shopFavoriteIds($db,$id);if(!in_array($product,$existing,true)&&count($existing)>=200)throw new RuntimeException('Можна зберегти до 200 товарів.');
                $db->prepare('INSERT IGNORE INTO rubizh_favorites(customer_id,product_id,created_at) VALUES(?,?,UTC_TIMESTAMP())')->execute([$id,$product]);
            }else $db->prepare('DELETE FROM rubizh_favorites WHERE customer_id=? AND product_id=?')->execute([$id,$product]);
        }elseif($action==='import'){
            $ids=shopProductsByIds($db,is_array($input['ids'] ?? null)?$input['ids']:[]);
            $existing=shopFavoriteIds($db,$id);$remaining=max(0,200-count($existing));$ids=array_filter($ids,fn($p)=>!in_array($p['id'],$existing,true));foreach(array_slice($ids,0,$remaining) as $p)$db->prepare('INSERT IGNORE INTO rubizh_favorites(customer_id,product_id,created_at) VALUES(?,?,UTC_TIMESTAMP())')->execute([$id,$p['id']]);
        }else shopJson(['ok'=>false,'error'=>'Невідома дія.'],400);
        $db->commit();
    }elseif(($_SERVER['REQUEST_METHOD'] ?? 'GET')!=='GET')shopJson(['ok'=>false,'error'=>'Недозволений метод.'],405);
    if(empty($_SESSION['checkout_scope']))$_SESSION['checkout_scope']=bin2hex(random_bytes(32));
    $favorites=$id===null?[]:shopFavoriteIds($db,$id);
    shopJson(['ok'=>true,'csrf'=>$_SESSION['csrf'],'authed'=>$id!==null,'customer_id'=>$id,
        'cart_reminders_enabled'=>shopCartRemindersEnabled(),'cart_reminder'=>shopCartReminderStatus($db,hash('sha256',$_SESSION['checkout_scope'])),'cart_restore_pending'=>!empty($_SESSION['cart_recovery']),
        'preferences'=>$id===null?null:shopPreferences($db,$id),'mono_enabled'=>monoConfigured(),'np_enabled'=>npConfigured(),'np_cod_enabled'=>cfg('np_cod_contract_confirmed')===true&&cfg('np_cod_service')==='afterpayment',
        'profile'=>$id===null?null:array_intersect_key(customerProfile($id),array_flip(['email','first_name','last_name','phone','delivery_type','city','delivery_address'])),
        'favorites'=>$favorites,'items'=>shopProductsByIds($db,$favorites)]);
}catch(Throwable $e){if(isset($db)&&$db->inTransaction())$db->rollBack();error_log('rubizh customer: '.get_class($e).' code '.(string)$e->getCode());shopJson(['ok'=>false,'error'=>$e instanceof PDOException?'Кабінет тимчасово недоступний.':$e->getMessage()],400);}
