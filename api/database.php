<?php
declare(strict_types=1);

// The optional connection override is outside the document root. It contains
// credentials, never customer records. Existing local installations stay valid.
function rubizhDatabaseSettings(array $base, ?string $privateFile = null): array {
    $privateFile ??= dirname(__DIR__, 2).'/rubizh-private/database.php';
    if (!is_file($privateFile)) return $base;
    $private = require $privateFile;
    if (!is_array($private)) throw new RuntimeException('Invalid private database configuration');
    $keys = ['db_host','db_port','db_name','db_user','db_pass','db_tls_required','db_tls_ca','db_tls_cert','db_tls_key','db_connect_timeout'];
    foreach (array_keys($private) as $key) {
        if (!in_array($key, $keys, true)) throw new RuntimeException('Unsupported private database option');
    }
    if (($private['db_tls_required'] ?? null) !== true) throw new RuntimeException('External database requires verified TLS');
    return array_replace($base, $private);
}

function rubizhDatabaseParameters(array $settings): array {
    $host = (string)($settings['db_host'] ?? '');
    $name = (string)($settings['db_name'] ?? '');
    if ($host === '' || strlen($host) > 253 || !preg_match('/^[a-zA-Z0-9.:-]+$/D', $host)
        || !preg_match('/^[a-zA-Z0-9_$-]{1,64}$/D', $name)) throw new RuntimeException('Invalid database address');
    $port = $settings['db_port'] ?? 3306;
    if (!is_scalar($port) || !preg_match('/^[0-9]{1,5}$/D', (string)$port) || (int)$port < 1 || (int)$port > 65535) throw new RuntimeException('Invalid database port');
    $timeout = $settings['db_connect_timeout'] ?? 5;
    if (!is_int($timeout) || $timeout < 1 || $timeout > 15) throw new RuntimeException('Invalid database connection timeout');
    $options = [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES=>false, PDO::ATTR_TIMEOUT=>$timeout];
    if (($settings['db_tls_required'] ?? false) === true) {
        if (!defined('PDO::MYSQL_ATTR_SSL_CA') || !defined('PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT')) throw new RuntimeException('Verified MySQL TLS unavailable');
        $ca = (string)($settings['db_tls_ca'] ?? '');
        if ($ca === '' || !is_file($ca) || !is_readable($ca)) throw new RuntimeException('Database CA certificate unavailable');
        $options[PDO::MYSQL_ATTR_SSL_CA] = $ca;
        $options[PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT] = true;
        foreach (['db_tls_cert'=>'PDO::MYSQL_ATTR_SSL_CERT','db_tls_key'=>'PDO::MYSQL_ATTR_SSL_KEY'] as $setting=>$constant) {
            if (empty($settings[$setting])) continue;
            if (!is_file($settings[$setting]) || !is_readable($settings[$setting])) throw new RuntimeException('Database client certificate unavailable');
            $options[constant($constant)] = $settings[$setting];
        }
    }
    return ['mysql:host='.$host.';port='.(int)$port.';dbname='.$name.';charset=utf8mb4', $options];
}

function rubizhDatabaseConnect(array $base, string $pdoClass = PDO::class): PDO {
    $settings = rubizhDatabaseSettings($base);
    [$dsn, $options] = rubizhDatabaseParameters($settings);
    $db = new $pdoClass($dsn, (string)($settings['db_user'] ?? ''), (string)($settings['db_pass'] ?? ''), $options);
    // Some clients can negotiate plaintext when a server has TLS disabled.
    // Refuse such a connection before any application query is issued.
    if (($settings['db_tls_required'] ?? false) === true) {
        $row = $db->query("SHOW SESSION STATUS LIKE 'Ssl_cipher'")->fetch(PDO::FETCH_NUM);
        if (!is_array($row) || (string)($row[1] ?? '') === '') throw new RuntimeException('Database transport encryption required');
    }
    return $db;
}
