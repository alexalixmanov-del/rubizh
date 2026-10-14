<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require __DIR__.'/../auth/bootstrap.php';
try{$db=shopStoreDatabase();if(!monoConfigured())exit;$failed=monoWorkerRun($db);if($failed){fwrite(STDERR,$failed.' invoice status check(s) failed; retry next scheduled run'."\n");exit(1);}}catch(Throwable $e){fwrite(STDERR,"Оплати недоступні.\n");exit(1);}
