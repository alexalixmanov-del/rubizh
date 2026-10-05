<?php
declare(strict_types=1);
require __DIR__.'/../auth/bootstrap.php';
try{$db=shopStoreDatabase();$id=customerId();if(($_SERVER['REQUEST_METHOD']??'GET')==='POST'){$body=shopBody();shopCsrf($body);if(!$id)shopJson(['ok'=>false,'error'=>'Увійдіть до кабінету.'],401);shopSavePreferences($db,$id,$body);}
 shopJson(['ok'=>true,'authed'=>$id!==null,'csrf'=>$_SESSION['csrf'],'preferences'=>$id?shopPreferences($db,$id):null]);
}catch(Throwable $e){shopJson(['ok'=>false,'error'=>'Не вдалося зберегти налаштування.'],400);}
