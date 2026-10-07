<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require __DIR__.'/../api/lib.php';
try{@set_time_limit(60);$db=db();$q=$db->query("SELECT GET_LOCK('rubizh_photo_worker',0)");if((int)$q->fetchColumn()!==1)exit;try{$audit=repair_photo_files($db);echo json_encode($audit+process_photos($db,150,45),JSON_UNESCAPED_UNICODE)."\n";}finally{$db->query("SELECT RELEASE_LOCK('rubizh_photo_worker')");}}catch(Throwable $e){fwrite(STDERR,"Обробка фото недоступна. Перевірте налаштування й права запису.\n");exit(1);}
