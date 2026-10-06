<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require __DIR__.'/../auth/bootstrap.php';
try{shopStoreDatabase();echo "Automation tables prepared. No emails, payments or waybills sent.\n";}
catch(Throwable $e){fwrite(STDERR,"Automation tables unavailable; check private database configuration.\n");exit(1);}
