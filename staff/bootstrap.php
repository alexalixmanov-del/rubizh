<?php
declare(strict_types=1);
if(!defined('RUBIZH_AUTH'))define('RUBIZH_AUTH',true);
require_once dirname(__DIR__).'/api/lib.php';
require_once dirname(__DIR__).'/auth/account.php';
require_once dirname(__DIR__).'/auth/identities.php';
require_once dirname(__DIR__).'/auth/phone.php';
require_once dirname(__DIR__).'/shop/store-lib.php';
require_once __DIR__.'/auth.php';require_once __DIR__.'/schema.php';
function database(): PDO {static $db;if(!$db){$db=rubizhDatabaseConnect(cfg());pimV3DetectColumns($db);}return $db;}
function crmBootstrap(): PDO {
 rubizhHeaders();header('Cache-Control: no-store, private');header('X-Robots-Tag: noindex, nofollow');header('Content-Type: application/json; charset=UTF-8');
 $https=($_SERVER['HTTPS']??'')==='on';$loopback=in_array($_SERVER['REMOTE_ADDR']??'',['127.0.0.1','::1'],true)&&cfg('environment')==='staging';if(!$https&&!$loopback)throw new CrmError('HTTPS_REQUIRED',403);
 session_name('rubizh_staff');session_cache_limiter('');ini_set('session.use_strict_mode','1');session_set_cookie_params(['lifetime'=>0,'path'=>'/api/staff','secure'=>$https,'httponly'=>true,'samesite'=>'Strict']);session_start();$_SESSION['staff_csrf']??=bin2hex(random_bytes(32));
 $db=database();if(!crmSchemaReady($db))throw new CrmError('STAFF_SCHEMA_REQUIRED',503);return $db;
}
