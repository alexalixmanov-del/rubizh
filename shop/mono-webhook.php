<?php
declare(strict_types=1);
require __DIR__.'/../auth/bootstrap.php';
try{if(($_SERVER['REQUEST_METHOD']??'')!=='POST')shopJson(['ok'=>false],405);$db=shopStoreDatabase();shopLimit($db,'mono-webhook',120,300);$raw=file_get_contents('php://input',false,null,0,65537);if(!is_string($raw)||strlen($raw)>65536)shopJson(['ok'=>false],413);$signature=(string)($_SERVER['HTTP_X_SIGN']??'');if($signature===''||strlen($signature)>512)shopJson(['ok'=>false],403);
$key=monoPublicKey($db);if(!monoVerifySignature($raw,$signature,$key)&&!monoVerifySignature($raw,$signature,monoPublicKey($db,true)))shopJson(['ok'=>false],403);$event=json_decode($raw,true,32,JSON_THROW_ON_ERROR);if(!is_array($event))shopJson(['ok'=>false],400);session_write_close();monoApplyEvent($db,$event,hash('sha256',$raw));shopJson(['ok'=>true]);}catch(Throwable $e){error_log('rubizh mono webhook rejected');shopJson(['ok'=>false],503);}
