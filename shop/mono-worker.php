<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require __DIR__.'/../auth/bootstrap.php';
try{$db=shopStoreDatabase();if(!monoConfigured())exit;$rows=$db->query("SELECT * FROM rubizh_mono_invoices WHERE invoice_id IS NOT NULL AND (status IN ('created','processing','hold') OR refund_status IN ('processing','unknown')) ORDER BY updated_at LIMIT 25")->fetchAll(PDO::FETCH_ASSOC);$failed=0;foreach($rows as $i){try{monoRefresh($db,$i);}catch(Throwable $e){$failed++;fwrite(STDERR,'invoice status check failed; retry next scheduled run'."\n");}}if($failed)exit(1);}catch(Throwable $e){fwrite(STDERR,"Оплати недоступні.\n");exit(1);}
