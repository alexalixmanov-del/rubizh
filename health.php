<?php
declare(strict_types=1);
// Readiness probe, no sessions, customer records, orders or external messages.
ini_set('display_errors', '0');
require __DIR__.'/shop/runtime.php';
require __DIR__.'/api/database.php';
rubizhHeaders();
header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store, private');
header('X-Robots-Tag: noindex, nofollow');
$ready = false;
try {
    rubizhPublicGate('health', 120);
    rubizhHttpWork('health', 2);
    if (rubizhCacheHealthy() && is_file(__DIR__.'/api/config.php')) {
        $db = rubizhDatabaseConnect(require __DIR__.'/api/config.php');
        $ready = rubizhSchemaPrepared($db) && (int)$db->query('SELECT 1')->fetchColumn() === 1;
    }
} catch (Throwable $e) {error_log('rubizh readiness check failed');}
http_response_code($ready ? 200 : 503);
if (!$ready) header('Retry-After: 60');
echo json_encode(['ready'=>$ready], JSON_THROW_ON_ERROR)."\n";
