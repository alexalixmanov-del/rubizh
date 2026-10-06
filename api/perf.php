<?php
declare(strict_types=1);
// РУБІЖ · кеш даних каталогу і профілювання запитів.
//
// Кеш: файли JSON у cfg('cache_dir') (за замовчуванням <корінь сайту>/cache). Ключ містить версію каталогу:
//   catalog_updated (час останньої публікації з PIM) + останнє оновлення фото + налаштування hide_unavailable.
//   Після імпорту версія змінюється; публічні списки повертають попередню копію до 5 хв і ставлять оновлення у чергу.
//   shop/cache-worker.php запускається cron раз на хвилину. Оплата та авторизація не використовують цей кеш.
// Ручне очищення: видалити вміст папки cache/ (окрім .htaccess) — сайт перебудує кеш при наступному запиті.
// Профілювання: 'perf_profile' => true у api/config.php — кожен запит пише в cache/perf.log час, кількість SQL і 5 найповільніших запитів.

function shopCacheDir(): string {
    static $dir = null;
    if ($dir !== null) return $dir;
    $dir = rtrim((string)(cfg('cache_dir') ?: dirname(__DIR__) . '/cache'), '/');
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    if (is_dir($dir) && !is_file($dir . '/.htaccess')) @file_put_contents($dir . '/.htaccess', "Require all denied\nDeny from all\n");
    return $dir;
}

function shopCatalogVersion(): string {
    static $ver = null;
    if ($ver !== null) return $ver;
    $db = db();
    $updated = (string)($db->query("SELECT v FROM meta WHERE k='catalog_updated'")->fetchColumn() ?: '');
    $hide = (string)($db->query("SELECT v FROM meta WHERE k='hide_unavailable'")->fetchColumn() ?: '');
    $photos = (string)($db->query("SELECT MAX(updated_at) FROM photos")->fetchColumn() ?: '');
    return $ver = substr(md5($updated . '|' . $photos . '|' . $hide . '|v2'), 0, 12);
}

function shopCacheFile(string $key, string $extra = ''): string {
    $ver = shopCatalogVersion() . ($extra !== '' ? substr(md5($extra), 0, 6) : '');
    return shopCacheDir() . '/' . preg_replace('/[^a-z0-9_-]/i', '_', $key) . '-' . $ver . '.json';
}
function shopCacheGet(string $key, string $extra = '') {
    $file = shopCacheFile($key, $extra);
    if (!is_file($file)) return null;
    $raw = @file_get_contents($file);
    return $raw === false || $raw === '' ? null : json_decode($raw, true);
}
function shopCachePut(string $key, $data, string $extra = ''): void {
    $file = shopCacheFile($key, $extra); $dir = dirname($file);
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false || !is_dir($dir) || !is_writable($dir)) return;
    $tmp = $file . '.' . bin2hex(random_bytes(4)) . '.tmp';
    if (@file_put_contents($tmp, $json, LOCK_EX) !== false) @rename($tmp, $file); else @unlink($tmp);
    shopCacheGc(shopCatalogVersion());
}
function shopCacheLastFile(string $key,string $extra=''): string {
    return shopCacheDir().'/last-'.hash('sha256',$key.'|'.$extra).'.json';
}
function shopCacheQueue(string $key,array $job): string {
    $file=shopCacheDir().'/refresh-'.hash('sha256',$key).'.json';
    if(is_file($file))return $file;
    $tmp=$file.'.'.bin2hex(random_bytes(4)).'.tmp';
    if(@file_put_contents($tmp,json_encode($job,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),LOCK_EX)!==false)@rename($tmp,$file);
    return $file;
}
function shopCached(string $key, callable $build, string $extra = '', ?array $refresh = null) {
    $ver = shopCatalogVersion() . ($extra !== '' ? substr(md5($extra), 0, 6) : '');
    $key = preg_replace('/[^a-z0-9_-]/i', '_', $key);
    if (function_exists('apcu_fetch') && ini_get('apc.enabled')) {
        $hit = apcu_fetch('rubizh:' . $key . ':' . $ver, $ok);
        if ($ok && empty($GLOBALS['rubizh_cache_rebuild'])) return $hit;
    }
    $dir = shopCacheDir();
    $file = $dir . '/' . $key . '-' . $ver . '.json';
    if (is_file($file) && empty($GLOBALS['rubizh_cache_rebuild'])) {
        $raw = @file_get_contents($file);
        if ($raw !== false && $raw !== '') {
            $data = json_decode($raw, true);
            if ($data !== null || $raw === 'null') { shopPerfMark('cache-hit:' . $key); return $data; }
        }
    }
    // A bounded stale snapshot keeps visitors off expensive rebuilds. Only known public
    // datasets have worker descriptors; checkout/authentication never use this cache.
    $last=shopCacheLastFile($key,$extra);$stale=null;$hasStale=false;
    if($refresh!==null&&is_file($last)){
        $snapshot=json_decode((string)@file_get_contents($last),true);
        if(is_array($snapshot)&&array_key_exists('data',$snapshot)){$stale=$snapshot['data'];$hasStale=true;}
    }
    if($hasStale&&empty($GLOBALS['rubizh_cache_rebuild'])&&empty($GLOBALS['rubizh_cache_worker'])){$queued=shopCacheQueue($key.'|'.$extra,$refresh);if(is_file($queued)&&time()-filemtime($queued)<=300){shopPerfMark('cache-stale:'.$key);return $stale;}$hasStale=false;}
    $lock=@fopen($dir.'/build-'.hash('sha256',$key.'|'.$extra).'.lock','c');
    if($lock&&!flock($lock,LOCK_EX|LOCK_NB)){fclose($lock);if($hasStale)return $stale;throw new RuntimeException('Catalog cache is being prepared');}
    try {
    // A process may have finished between our first read and obtaining the lock.
    if(empty($GLOBALS['rubizh_cache_rebuild'])&&is_file($file)){$raw=@file_get_contents($file);$decoded=json_decode((string)$raw,true);if($decoded!==null||$raw==='null')return $decoded;}
    $data = $build();
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json !== false && is_dir($dir) && is_writable($dir)) {
        $tmp = $file . '.' . bin2hex(random_bytes(4)) . '.tmp';
        if (@file_put_contents($tmp, $json, LOCK_EX) !== false) @rename($tmp, $file); else @unlink($tmp);
        if($refresh!==null){$snapshot=json_encode(['saved_at'=>time(),'data'=>$data],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);$tmp=$last.'.'.bin2hex(random_bytes(4)).'.tmp';if($snapshot!==false&&@file_put_contents($tmp,$snapshot,LOCK_EX)!==false)@rename($tmp,$last);else @unlink($tmp);}
        shopCacheGc($ver);
    }
    if (function_exists('apcu_store') && ini_get('apc.enabled')) @apcu_store('rubizh:' . $key . ':' . $ver, $data, 86400);
    shopPerfMark('cache-build:' . $key);
    return $data;
    } finally {if($lock){flock($lock,LOCK_UN);fclose($lock);}}
}

// Видаляє файли попередніх версій каталогу — один раз на версію.
function shopCacheGc(string $ver): void {
    $dir = shopCacheDir();
    $base = substr($ver, 0, 12);
    $marker = $dir . '/.gc-' . $base;
    if (is_file($marker)) return;
    @touch($marker);
    foreach (glob($dir . '/*.json') ?: [] as $f) {
        $name=basename($f);
        if(str_starts_with($name,'refresh-'))continue;
        if(str_starts_with($name,'last-')){if(filemtime($f)<time()-7*86400)@unlink($f);continue;}
        if(!str_contains($name,'-'.$base)&&filemtime($f)<time()-3600)@unlink($f);
    }
    foreach (glob($dir . '/.gc-*') ?: [] as $f) if ($f !== $marker) @unlink($f);
    foreach (glob($dir . '/*.tmp') ?: [] as $f) if (filemtime($f) < time() - 300) @unlink($f);
}

function shopCacheClear(): int {
    $n = 0;
    foreach (array_merge(glob(shopCacheDir() . '/*.json') ?: [], glob(shopCacheDir() . '/.gc-*') ?: []) as $f) if (@unlink($f)) $n++;
    if (function_exists('apcu_clear_cache')) @apcu_clear_cache();
    return $n;
}

// ETag за версією каталогу: повторний запит без змін отримує 304 без тіла.
function shopEtag(string $extra): void {
    $tag = '"' . substr(md5(shopCatalogVersion() . '|' . $extra), 0, 20) . '"';
    header('ETag: ' . $tag);
    $sent = trim((string)($_SERVER['HTTP_IF_NONE_MATCH'] ?? ''));
    if ($sent !== '' && in_array($tag, array_map('trim', explode(',', $sent)), true)) { http_response_code(304); exit; }
}

/* ---------- профілювання ---------- */
final class RubizhPerf {
    public static float $t0 = 0; public static int $n = 0; public static float $sql = 0; public static array $slow = []; public static array $marks = [];
    public static function add(float $dt, string $q): void {
        self::$n++; self::$sql += $dt;
        self::$slow[] = [$dt, preg_replace('/\s+/', ' ', mb_substr($q, 0, 220))];
        if (count(self::$slow) > 40) { usort(self::$slow, fn($a, $b) => $b[0] <=> $a[0]); self::$slow = array_slice(self::$slow, 0, 10); }
    }
}
function shopPerfOn(): bool { static $on = null; return $on ??= (bool)cfg('perf_profile'); }
function shopPerfMark(string $name): void { if (shopPerfOn()) RubizhPerf::$marks[] = [$name, round((microtime(true) - RubizhPerf::$t0) * 1000)]; }
function shopPerfStart(): void {
    if (!shopPerfOn() || RubizhPerf::$t0) return;
    RubizhPerf::$t0 = $_SERVER['REQUEST_TIME_FLOAT'] ?? microtime(true);
    register_shutdown_function(function () {
        usort(RubizhPerf::$slow, fn($a, $b) => $b[0] <=> $a[0]);
        $line = ['at' => gmdate('c'), 'uri' => $_SERVER['REQUEST_URI'] ?? '', 'ms' => round((microtime(true) - RubizhPerf::$t0) * 1000), 'sql_count' => RubizhPerf::$n, 'sql_ms' => round(RubizhPerf::$sql * 1000),
            'marks' => RubizhPerf::$marks, 'slowest' => array_map(fn($s) => [round($s[0] * 1000, 1), $s[1]], array_slice(RubizhPerf::$slow, 0, 5))];
        @file_put_contents(shopCacheDir() . '/perf.log', json_encode($line, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n", FILE_APPEND | LOCK_EX);
    });
}
if (class_exists('PDO')) {
    class RubizhStatement extends PDOStatement {
        protected function __construct() {}
        public function execute(?array $params = null): bool {
            $t = microtime(true);
            try { return parent::execute($params); } finally { RubizhPerf::add(microtime(true) - $t, (string)$this->queryString); }
        }
    }
    class RubizhPDO extends PDO {
        public function query(string $query, ?int $fetchMode = null, mixed ...$fetchModeArgs): PDOStatement|false {
            $t = microtime(true);
            try { return $fetchMode === null ? parent::query($query) : parent::query($query, $fetchMode, ...$fetchModeArgs); } finally { RubizhPerf::add(microtime(true) - $t, $query); }
        }
        public function exec(string $statement): int|false {
            $t = microtime(true);
            try { return parent::exec($statement); } finally { RubizhPerf::add(microtime(true) - $t, $statement); }
        }
    }
}
