<?php
declare(strict_types=1);
// CRM is an additive SITE module. Older isolated SITE releases can run without its files
// only while the database has never enabled CRM; a partial CRM deployment fails closed.
$crmRoot=dirname(__DIR__).'/staff';
if(is_file($crmRoot.'/schema.php')&&is_file($crmRoot.'/auth.php')&&is_file($crmRoot.'/read.php')&&is_file($crmRoot.'/refunds.php')){
 require_once $crmRoot.'/auth.php';require_once $crmRoot.'/read.php';require_once $crmRoot.'/schema.php';require_once $crmRoot.'/refunds.php';
}else{
 function crmSchemaReady(PDO $db): bool {if((int)$db->query("SELECT v FROM meta WHERE k='crm_schema'")->fetchColumn()>0)throw new RuntimeException('CRM domain files missing; restore the complete SITE release before payment processing');return false;}
 function crmRefundWebhook(PDO $db,array $event,array $invoice): bool {crmSchemaReady($db);return false;}
}
unset($crmRoot);
