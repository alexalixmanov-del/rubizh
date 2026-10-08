<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require __DIR__.'/../api/lib.php';
try{@set_time_limit(60);echo json_encode(process_photos(db(),150,45),JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)."\n";}
catch(Throwable $e){fwrite(STDERR,"Обробка фото недоступна. Перевірте налаштування й права запису.\n");exit(1);}
