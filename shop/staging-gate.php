<?php
declare(strict_types=1);
// Stage 5.5 (owner D-80): the closed mode on rubizh.shop before opening day. With environment=staging and a configured
// staging_gate (user + password_hash) every web request needs HTTP Basic Auth and is marked noindex; only then do the
// staging relaxations (mock bank, Nova Poshta and SMS stubs, no e-mail) apply on the production host. environment=staging
// on rubizh.shop without a valid gate is a misconfiguration: the site answers 503 and nothing is relaxed. Any other
// environment never relaxes anything. A local stand (not rubizh.shop) keeps the earlier staging behaviour.
function rubizhStagingSettings(): array {
    static $c=null;if($c!==null)return $c;
    $f=$GLOBALS['rubizh_config_file']??dirname(__DIR__).'/api/config.php';$all=is_file($f)?(require $f):[];
    $c=['environment'=>is_array($all)?($all['environment']??null):null,'gate'=>is_array($all)?($all['staging_gate']??null):null];
    return $c;
}
function rubizhProductionHost(): bool {return in_array(strtolower((string)($_SERVER['HTTP_HOST']??'')),['rubizh.shop','www.rubizh.shop'],true);}
function rubizhStagingGateConfigured(): bool {
    $c=rubizhStagingSettings();$g=$c['gate'];
    if($c['environment']!=='staging'||!is_array($g))return false;
    $user=$g['user']??null;$hash=$g['password_hash']??null;
    if(!is_string($user)||preg_match('/^[A-Za-z0-9._-]{3,64}$/D',$user)!==1||!is_string($hash))return false;
    $algo=password_get_info($hash)['algo']??null;
    return $algo!==null&&$algo!==0;
}
// The staging relaxations (mocks, on-screen SMS code, no e-mail): staging, and either not the production host or behind the gate.
function rubizhStagingRelaxed(): bool {
    return rubizhStagingSettings()['environment']==='staging'&&(!rubizhProductionHost()||rubizhStagingGateConfigured());
}
function rubizhStagingCredentials(): array {
    if(isset($_SERVER['PHP_AUTH_USER']))return [(string)$_SERVER['PHP_AUTH_USER'],(string)($_SERVER['PHP_AUTH_PW']??'')];
    $h=(string)($_SERVER['HTTP_AUTHORIZATION']??$_SERVER['REDIRECT_HTTP_AUTHORIZATION']??'');
    if(preg_match('/^Basic\s+([A-Za-z0-9+\/=]{4,512})$/D',$h,$m)){$pair=base64_decode($m[1],true);if(is_string($pair)&&str_contains($pair,':'))return explode(':',$pair,2);}
    return ['',''];
}
// PIM talks to /api/ with its own key (Authorization: Bearer); that API checks the key itself, so it is not asked for the gate.
function rubizhStagingKeyRequest(): bool {
    $path=(string)parse_url((string)($_SERVER['REQUEST_URI']??'/'),PHP_URL_PATH);
    $h=(string)($_SERVER['HTTP_AUTHORIZATION']??$_SERVER['REDIRECT_HTTP_AUTHORIZATION']??'');
    return str_starts_with($path,'/api/')&&!str_starts_with($path,'/api/staff')&&preg_match('/^Bearer\s+\S+$/D',$h)===1;
}
function rubizhStagingGate(): void {
    if(PHP_SAPI==='cli'||!empty($GLOBALS['rubizh_staging_gate_passed']))return;
    $c=rubizhStagingSettings();if($c['environment']!=='staging')return;
    if(!headers_sent())header('X-Robots-Tag: noindex, nofollow');
    if(!rubizhStagingGateConfigured()){
        if(!rubizhProductionHost())return;
        http_response_code(503);header('Cache-Control: no-store');header('Content-Type: text/plain; charset=utf-8');header('Retry-After: 300');
        echo "Сайт тимчасово недоступний.\n";exit;
    }
    if(rubizhStagingKeyRequest()){$GLOBALS['rubizh_staging_gate_passed']=true;return;}
    [$user,$password]=rubizhStagingCredentials();$g=$c['gate'];
    if(hash_equals((string)$g['user'],$user)&&password_verify($password,(string)$g['password_hash'])){$GLOBALS['rubizh_staging_gate_passed']=true;return;}
    http_response_code(401);header('WWW-Authenticate: Basic realm="RUBIZH", charset="UTF-8"');header('Cache-Control: no-store');header('Content-Type: text/plain; charset=utf-8');
    echo "Потрібен вхід.\n";exit;
}
