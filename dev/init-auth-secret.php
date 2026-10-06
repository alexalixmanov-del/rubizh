<?php
declare(strict_types=1);
// Run on the hosting server once. Generates only the local signing secret, preserving every existing setting.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
ini_set('display_errors','0');
define('RUBIZH_AUTH',true);
$file=__DIR__.'/../auth/config.php';
$previous=is_file($file) ? require $file : [];
if (!is_array($previous)) { fwrite(STDERR,"Invalid private auth configuration; no changes made.\n"); exit(1); }
if (strlen((string)($previous['auth_secret'] ?? ''))>=40 || strlen((string)(getenv('RUBIZH_AUTH_SECRET') ?: ''))>=40) {
    echo "Application secret already configured; no changes made.\n"; exit;
}
if (is_link($file)) { fwrite(STDERR,"Private config is a symlink; no changes made.\n"); exit(1); }
$previous['auth_secret']=bin2hex(random_bytes(32));
$contents="<?php\nif (!defined('RUBIZH_AUTH')) { http_response_code(404); exit; }\nreturn ".var_export($previous,true).";\n";
$oldMask=umask(0077);
$temp=dirname($file).'/.auth-config-'.bin2hex(random_bytes(12)).'.php';
try {
    $handle=fopen($temp,'x');
    if ($handle===false) { throw new RuntimeException('Cannot create private temporary config'); }
    try { if (fwrite($handle,$contents)!==strlen($contents) || !fflush($handle)) { throw new RuntimeException('Cannot write private config'); } }
    finally { fclose($handle); }
    if (!rename($temp,$file)) { throw new RuntimeException('Cannot replace private config'); }
    echo "Application secret created in auth/config.php; existing settings preserved. Secret value not displayed.\n";
} catch (Throwable $e) {
    if (is_file($temp)) { unlink($temp); }
    fwrite(STDERR,"Private config update failed; inspect file permissions on hosting.\n"); exit(1);
} finally { umask($oldMask); }
