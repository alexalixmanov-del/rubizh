<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require __DIR__.'/../api/lib.php';
$db=db();$q=$db->query("SELECT GET_LOCK('rubizh_photo_worker',55)");
if((int)$q->fetchColumn()!==1){fwrite(STDERR,"Photo worker is already running; retry after it finishes.\n");exit(2);}
try{
 $report=repair_photo_files($db,250,true);
 // Explicit repair run may retry old failures once; normal cron remains bounded.
 if(in_array('--retry-errors',$argv,true)){
  $report['errors_requeued']=$db->exec("UPDATE photos SET status='pending',tries=0,error='',updated_at=UTC_TIMESTAMP() WHERE status='error'");
 }
 echo json_encode($report,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)."\n";
}finally{$db->query("SELECT RELEASE_LOCK('rubizh_photo_worker')");}
