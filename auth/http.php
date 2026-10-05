<?php
declare(strict_types=1);
if (!defined('RUBIZH_AUTH')) { http_response_code(404); exit; }
function authHttp(string $url, ?string $body = null, array $headers = [], int $timeout = 15): array {
    if (!function_exists('curl_init')) { throw new RuntimeException('Сервіс входу тимчасово недоступний.'); }
    $ch=curl_init($url); $response='';
    curl_setopt_array($ch,[CURLOPT_RETURNTRANSFER=>false,CURLOPT_FOLLOWLOCATION=>false,
        CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS,CURLOPT_CONNECTTIMEOUT=>5,CURLOPT_TIMEOUT=>$timeout,
        CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_HTTPHEADER=>$headers,
        CURLOPT_WRITEFUNCTION=>static function($ch,string $part) use(&$response): int {
            if (strlen($response)+strlen($part)>1048576) { return 0; } $response.=$part; return strlen($part);
        }]);
    if ($body !== null) { curl_setopt($ch,CURLOPT_POST,true); curl_setopt($ch,CURLOPT_POSTFIELDS,$body); }
    $ok=curl_exec($ch); $status=(int)curl_getinfo($ch,CURLINFO_RESPONSE_CODE); curl_close($ch);
    if ($ok === false || $status !== 200) { throw new RuntimeException('Сервіс входу тимчасово недоступний. Спробуйте пізніше.'); }
    $data=json_decode($response,true,32,JSON_THROW_ON_ERROR);
    if (!is_array($data)) { throw new RuntimeException('Сервіс входу тимчасово недоступний.'); } return $data;
}
