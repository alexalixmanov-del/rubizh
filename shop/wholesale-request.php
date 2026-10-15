<?php
declare(strict_types=1);
// D-54: storefront «Запит на прорахунок» → SITE table, visible in CRM («Оптові заявки»). JSON POST with CSRF.
require __DIR__.'/../auth/bootstrap.php';require_once __DIR__.'/store-lib.php';require_once __DIR__.'/wholesale-lib.php';
try{
    if(($_SERVER['REQUEST_METHOD']??'')!=='POST')shopJson(['ok'=>false,'error'=>'Тільки POST.'],405);
    $input=shopBody();shopCsrf($input);session_write_close();$db=shopStoreDatabase();shopLimit($db,'wholesale-request',10,3600);
    $key=is_string($input['request_id']??null)?$input['request_id']:'';if(!preg_match('/^[a-f0-9]{32}$/D',$key))throw new InvalidArgumentException('Оновіть сторінку й надішліть заявку ще раз.');
    $r=wholesaleCreate($db,wholesaleValidate($input),$key);
    shopJson(['ok'=>true,'number'=>$r['number'],'repeated'=>$r['repeated'],'message'=>'Заявку '.$r['number'].' прийнято. Менеджер зв’яжеться з вами протягом робочого дня.']);
}catch(InvalidArgumentException $e){shopJson(['ok'=>false,'error'=>$e->getMessage()],400);}
catch(RubizhHttpException $e){if($e->retryAfter)header('Retry-After: '.$e->retryAfter);shopJson(['ok'=>false,'error'=>$e->getMessage()],$e->status);}
catch(Throwable $e){error_log('rubizh wholesale: '.get_class($e));shopJson(['ok'=>false,'error'=>$e instanceof RuntimeException&&preg_match('/\p{Cyrillic}/u',$e->getMessage())?$e->getMessage():'Заявку не збережено. Спробуйте ще раз або напишіть на info@rubizh.shop.'],503);}
