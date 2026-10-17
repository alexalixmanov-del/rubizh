<?php
declare(strict_types=1);
if(!defined('RUBIZH_AUTH'))define('RUBIZH_AUTH',true);
require_once dirname(__DIR__).'/api/lib.php';
require_once dirname(__DIR__).'/auth/account.php';
require_once dirname(__DIR__).'/auth/identities.php';
require_once dirname(__DIR__).'/auth/phone.php';
require_once dirname(__DIR__).'/shop/store-lib.php';
require_once __DIR__.'/auth.php';require_once __DIR__.'/schema.php';
require_once __DIR__.'/read.php';require_once __DIR__.'/refunds.php';require_once __DIR__.'/operations.php';require_once __DIR__.'/reports.php';
require_once __DIR__.'/status.php';require_once __DIR__.'/adapters.php';require_once __DIR__.'/router.php';require_once __DIR__.'/orders4.php';require_once __DIR__.'/lists.php';
require_once dirname(__DIR__).'/shop/order-ops.php';require_once dirname(__DIR__).'/shop/order-create.php';require_once dirname(__DIR__).'/shop/vitals-lib.php';
function database(): PDO {static $db;if(!$db){$db=rubizhDatabaseConnect(cfg());pimV3DetectColumns($db);}return $db;}
