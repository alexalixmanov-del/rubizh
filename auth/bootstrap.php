<?php
declare(strict_types=1);
ini_set('display_errors', '0');
define('RUBIZH_AUTH', true);
require_once __DIR__.'/../shop/runtime.php';
rubizhHeaders();
try{rubizhPublicGate('account',180);rubizhHttpWork(defined('RUBIZH_AUTH_NO_SESSION')?'bank-callback':'account',defined('RUBIZH_AUTH_NO_SESSION')?4:12);}catch(RubizhHttpException $e){http_response_code($e->status);header('Cache-Control: no-store');header('Content-Type: application/json; charset=UTF-8');if($e->retryAfter)header('Retry-After: '.$e->retryAfter);echo json_encode(['ok'=>false,'error'=>$e->getMessage()],JSON_UNESCAPED_UNICODE);exit;}
header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-store, private');
header('Referrer-Policy: no-referrer');
header('X-Robots-Tag: noindex, nofollow');
header('X-Content-Type-Options: nosniff');
header("Content-Security-Policy: default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; script-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
session_name('rubizh_customer');
session_cache_limiter('');
ini_set('session.use_strict_mode', '1');
session_set_cookie_params(['lifetime'=>0,'path'=>'/','secure'=>true,'httponly'=>true,'samesite'=>'Lax']);
if(!defined('RUBIZH_AUTH_NO_SESSION')){session_start();if (empty($_SESSION['csrf'])) { $_SESSION['csrf'] = bin2hex(random_bytes(32)); }}else{$_SESSION=[];}
function esc(string $s): string { return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function database(): PDO {
    static $db;
    if ($db instanceof PDO) { return $db; }
    $path = __DIR__ . '/../api/config.php';
    if (!is_file($path)) { throw new RuntimeException('Сервер магазину ще не налаштований.'); }
    $c = require $path;
    require_once __DIR__.'/../api/database.php';
    $db = rubizhDatabaseConnect($c);
    if(rubizhSchemaPrepared($db))return $db;
    $db->exec('CREATE TABLE IF NOT EXISTS rubizh_auth_links (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, email VARCHAR(254) NOT NULL, token_hash CHAR(64) NOT NULL UNIQUE, ip_hash CHAR(64) NOT NULL, created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL, used_at BIGINT NULL, INDEX(email,created_at), INDEX(ip_hash,created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    $db->exec('CREATE TABLE IF NOT EXISTS rubizh_auth_attempts (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, email VARCHAR(254) NOT NULL, ip_hash CHAR(64) NOT NULL, created_at BIGINT NOT NULL, INDEX(email,created_at), INDEX(ip_hash,created_at), INDEX(created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    return $db;
}
require_once __DIR__.'/account.php';
require_once __DIR__.'/identities.php';
require_once __DIR__.'/phone.php';
require_once __DIR__.'/../shop/store-lib.php';
if ((isset($_SESSION['customer_id']) || isset($_SESSION['email'])) && time()-(int)($_SESSION['login_time'] ?? 0)>86400) {
    unset($_SESSION['customer_id'],$_SESSION['email'],$_SESSION['login_time'],$_SESSION['login_method'],$_SESSION['identity_pending'],$_SESSION['sms_challenge'],$_SESSION['identity_merge']);
}
