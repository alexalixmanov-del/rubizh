<?php
declare(strict_types=1);
if (!defined('RUBIZH_AUTH')) { http_response_code(404); exit; }
function googleBase64(string $part): string {
    if (!preg_match('/^[A-Za-z0-9_-]+$/D',$part)) { throw new RuntimeException('Не вдалося підтвердити вхід через Google.'); }
    $decoded=base64_decode(strtr($part,'-_','+/').str_repeat('=',(4-strlen($part)%4)%4),true);
    if ($decoded===false) { throw new RuntimeException('Не вдалося підтвердити вхід через Google.'); } return $decoded;
}
function googleVerifyToken(string $token, string $clientId, string $nonce, array $certificates): array {
    $fail='Не вдалося підтвердити вхід через Google. Почніть ще раз.';
    if (strlen($token)>16384 || substr_count($token,'.')!==2) { throw new RuntimeException($fail); }
    [$h,$p,$s]=explode('.',$token);
    $header=json_decode(googleBase64($h),true,16,JSON_THROW_ON_ERROR);
    $claims=json_decode(googleBase64($p),true,16,JSON_THROW_ON_ERROR);
    if (!is_array($header) || !is_array($claims) || ($header['alg'] ?? '')!=='RS256'
        || !is_string($header['kid'] ?? null) || !is_string($certificates[$header['kid']] ?? null)) { throw new RuntimeException($fail); }
    // Certificates are obtained only by the server from Google's fixed HTTPS URL.
    // Token-supplied jku/x5u URLs and embedded keys are never followed.
    if (openssl_verify($h.'.'.$p,googleBase64($s),$certificates[$header['kid']],OPENSSL_ALGO_SHA256)!==1) { throw new RuntimeException($fail); }
    if (!in_array($claims['iss'] ?? null,['accounts.google.com','https://accounts.google.com'],true)
        || ($claims['aud'] ?? null)!==$clientId || (isset($claims['azp']) && $claims['azp']!==$clientId)
        || !is_int($claims['exp'] ?? null) || $claims['exp']<=time()
        || !is_int($claims['iat'] ?? null) || $claims['iat']>time()+60
        || (isset($claims['nbf']) && (!is_int($claims['nbf']) || $claims['nbf']>time()+60))
        || !is_string($claims['nonce'] ?? null) || !hash_equals($nonce,$claims['nonce'])
        || !is_string($claims['sub'] ?? null) || !preg_match('/^[A-Za-z0-9_-]{1,128}$/D',$claims['sub'])
        || ($claims['email_verified'] ?? false)!==true || !is_string($claims['email'] ?? null)
        || strlen($claims['email'])>254 || !filter_var($claims['email'],FILTER_VALIDATE_EMAIL)) { throw new RuntimeException($fail); }
    $email=strtolower($claims['email']);
    $trusted=str_ends_with($email,'@gmail.com') || (is_string($claims['hd'] ?? null) && $claims['hd']!=='');
    $clean=static function(mixed $s): string {
        return is_string($s) && mb_check_encoding($s,'UTF-8') ? mb_substr(preg_replace('/[\x00-\x1F\x7F]/u','',trim($s)),0,80) : '';
    };
    return ['kind'=>'google','sub'=>$claims['sub'],'email'=>$email,'email_trusted'=>$trusted,
        'first_name'=>$clean($claims['given_name'] ?? ''),'last_name'=>$clean($claims['family_name'] ?? '')];
}
function googleExchange(string $code, string $nonce): array {
    require_once __DIR__.'/http.php'; $c=authConfig();
    $data=authHttp('https://oauth2.googleapis.com/token',http_build_query([
        'code'=>$code,'client_id'=>$c['google_client_id'],'client_secret'=>$c['google_client_secret'],
        'redirect_uri'=>'https://rubizh.shop/auth/google.php','grant_type'=>'authorization_code'
    ],'','&',PHP_QUERY_RFC3986),['Content-Type: application/x-www-form-urlencoded']);
    if (!is_string($data['id_token'] ?? null)) { throw new RuntimeException('Не вдалося підтвердити вхід через Google.'); }
    $certificates=authHttp('https://www.googleapis.com/oauth2/v1/certs');
    return googleVerifyToken($data['id_token'],$c['google_client_id'],$nonce,$certificates);
}
