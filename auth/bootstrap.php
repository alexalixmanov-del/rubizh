<?php
declare(strict_types=1);
ini_set('display_errors', '0');
define('RUBIZH_AUTH', true);
header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-store, private');
header('Referrer-Policy: no-referrer');
header('X-Robots-Tag: noindex, nofollow');
header('X-Content-Type-Options: nosniff');
header("Content-Security-Policy: default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; script-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'self'");
session_name('rubizh_customer');
session_cache_limiter('');
ini_set('session.use_strict_mode', '1');
session_set_cookie_params(['lifetime'=>0,'path'=>'/','secure'=>true,'httponly'=>true,'samesite'=>'Lax']);
session_start();
if (empty($_SESSION['csrf'])) { $_SESSION['csrf'] = bin2hex(random_bytes(32)); }
function esc(string $s): string { return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function database(): PDO {
    static $db;
    if ($db instanceof PDO) { return $db; }
    $path = __DIR__ . '/../api/config.php';
    if (!is_file($path)) { throw new RuntimeException('Сервер магазину ще не налаштований.'); }
    $c = require $path;
    $host = (string)$c['db_host']; $name = (string)$c['db_name'];
    if (preg_match('/[;\r\n]/', $host . $name)) { throw new RuntimeException('Помилка налаштування бази.'); }
    $db = new PDO('mysql:host='.$host.';dbname='.$name.';charset=utf8mb4', $c['db_user'], $c['db_pass'], [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_EMULATE_PREPARES=>false]);
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
