<?php
declare(strict_types=1);
// Shared-hosting admission control. No client-supplied forwarding header is trusted.
final class RubizhHttpException extends RuntimeException {
    public function __construct(public readonly int $status, string $message, public readonly int $retryAfter=0) {parent::__construct($message);}
}
function rubizhRuntimeDir(): string {
    $dir=$GLOBALS['rubizh_runtime_dir']??dirname(__DIR__,2).'/rubizh-runtime';
    if(!is_dir($dir)&&!@mkdir($dir,0700,true)&&!is_dir($dir))throw new RubizhHttpException(503,'Сервіс тимчасово недоступний.',5);
    return $dir;
}
function rubizhCacheHeartbeat(bool $healthy): void {
    $file = rubizhRuntimeDir().'/cache-heartbeat.json';
    $temp = tempnam(dirname($file), '.heartbeat-');
    if ($temp === false) throw new RuntimeException('Worker heartbeat unavailable');
    try {
        chmod($temp, 0600);
        $data = json_encode(['at'=>time(), 'healthy'=>$healthy], JSON_THROW_ON_ERROR);
        if (file_put_contents($temp, $data, LOCK_EX) !== strlen($data) || !rename($temp, $file)) throw new RuntimeException('Worker heartbeat unavailable');
    } finally {if (is_file($temp)) unlink($temp);}
}
function rubizhCacheHealthy(?int $now = null): bool {
    $file = rubizhRuntimeDir().'/cache-heartbeat.json';
    if (!is_file($file)) return false;
    $value = json_decode((string)file_get_contents($file), true);
    $now ??= time();
    return is_array($value) && ($value['healthy'] ?? null) === true && is_int($value['at'] ?? null)
        && $value['at'] <= $now + 10 && $value['at'] >= $now - 180;
}
function rubizhHeaders(): void {
    header('X-Content-Type-Options: nosniff');header('X-Frame-Options: DENY');
    header('Strict-Transport-Security: max-age=31536000');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
    header("Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
}
function rubizhStorefrontCsp(): string {
    $nonce=base64_encode(random_bytes(18));
    // The existing compiled UI needs unsafe-eval. Inline scripts still require a
    // fresh nonce; inline event attributes and injected third-party scripts fail.
    header("Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-".$nonce."' 'unsafe-eval' https://www.googletagmanager.com https://connect.facebook.net; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self'; connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://www.facebook.com; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
    return $nonce;
}
function rubizhNonceHtml(string $html,string $nonce): string {return preg_replace('/<script\b/i','<script nonce="'.htmlspecialchars($nonce,ENT_QUOTES,'UTF-8').'"',$html);}
function rubizhRateAllow(string $kind,string $identity,int $limit,int $window,?int $now=null): bool {
    $now??=time();$hash=hash('sha256',$kind.'|'.$identity);
    // Fixed 4096 files; each holds at most 64 short-lived identities. Random URLs/IPs
    // cannot create an unlimited number of files on a shared disk.
    $file=rubizhRuntimeDir().'/rate-'.substr($hash,0,3).'.json';$handle=@fopen($file,'c+');
    $locked=false;$deadline=microtime(true)+0.01;
    if($handle)do{if(flock($handle,LOCK_EX|LOCK_NB)){$locked=true;break;}usleep(1000);}while(microtime(true)<$deadline);
    if(!$locked){if($handle)fclose($handle);throw new RubizhHttpException(503,'Спробуйте за кілька секунд.',2);}
    try {
        $raw=stream_get_contents($handle);$rows=json_decode($raw?:'{}',true);if(!is_array($rows))$rows=[];
        foreach($rows as $key=>$row)if(!is_array($row)||($row['until']??0)<=$now)unset($rows[$key]);
        if(!isset($rows[$hash])&&count($rows)>=64)throw new RubizhHttpException(503,'Спробуйте пізніше.',5);
        $row=$rows[$hash]??['until'=>$now+$window,'hits'=>0];$row['hits']++;$rows[$hash]=$row;
        $json=json_encode($rows,JSON_THROW_ON_ERROR);rewind($handle);
        if(!ftruncate($handle,0)||fwrite($handle,$json)!==strlen($json)||!fflush($handle))throw new RubizhHttpException(503,'Сервіс тимчасово недоступний.',5);
        return $row['hits']<=$limit;
    } finally {flock($handle,LOCK_UN);fclose($handle);}
}
function rubizhPublicGate(string $kind,int $limit=300,int $window=60): void {
    if(PHP_SAPI==='cli')return;
    if(!rubizhRateAllow($kind,(string)($_SERVER['REMOTE_ADDR']??'unknown'),$limit,$window))throw new RubizhHttpException(429,'Забагато запитів. Спробуйте пізніше.',$window);
}
function rubizhWorkAcquire(string $kind,int $capacity=4): mixed {
    if(!preg_match('/^[a-z-]+$/D',$kind))throw new LogicException('Invalid work pool');
    for($i=0;$i<$capacity;$i++){
        $h=@fopen(rubizhRuntimeDir().'/work-'.$kind.'-'.$i.'.lock','c');
        if($h&&flock($h,LOCK_EX|LOCK_NB))return $h;
        if($h)fclose($h);
    }
    throw new RubizhHttpException(503,'Зараз багато відвідувачів. Повторіть запит за кілька секунд.',2);
}
function rubizhWorkRelease(mixed $handle): void {if(is_resource($handle)){flock($handle,LOCK_UN);fclose($handle);}}
function rubizhHttpWork(string $kind,int $capacity): void {
    if(PHP_SAPI==='cli')return;
    $handle=rubizhWorkAcquire($kind,$capacity);
    register_shutdown_function(fn()=>rubizhWorkRelease($handle));
}
// This flag is written only by the CLI installer after every component is prepared.
// Bump it whenever a schema migration changes. A missing flag keeps first-run behavior.
function rubizhSchemaPrepared(PDO $db): bool {
    static $known;
    $known??=new WeakMap();
    if(isset($known[$db]))return $known[$db];
    try{$value=$db->query("SELECT v FROM meta WHERE k='runtime_schema'")->fetchColumn();}
    catch(PDOException $e){$value=false;}
    return $known[$db]=$value==='20261008-v1';
}
function rubizhCatalogInput(array $input): array {
    $limits=['action'=>20,'id'=>64,'ids'=>13000,'slug'=>191,'code'=>40,'q'=>160,'category'=>700,'roots'=>1500,'leaf'=>255,'brands'=>1500,'sizes'=>1000,'camo'=>1000,'attrs'=>4096,'slot'=>20,'sort'=>20,'availability'=>20,'page'=>8,'limit'=>4,'price_from'=>16,'price_to'=>16];
    foreach($limits as $key=>$max)if(isset($input[$key])){
        if(!is_scalar($input[$key])||!mb_check_encoding((string)$input[$key],'UTF-8')||mb_strlen((string)$input[$key])>$max)throw new RubizhHttpException(400,'Перевірте параметри каталогу.');
        $input[$key]=trim((string)$input[$key]);
    }
    foreach(['page','limit'] as $key)if(isset($input[$key])){
        if(!preg_match('/^\d{1,8}$/D',$input[$key]))throw new RubizhHttpException(400,'Перевірте сторінку каталогу.');
        $input[$key]=(string)max(1,min($key==='limit'?100:1000,(int)$input[$key]));
    }
    if(isset($input['attrs'])){$attrs=json_decode($input['attrs'],true,8);if(!is_array($attrs)||count($attrs)>24||array_filter($attrs,fn($v)=>!is_string($v)||strlen($v)>500))throw new RubizhHttpException(400,'Перевірте фільтри каталогу.');}
    return $input;
}
