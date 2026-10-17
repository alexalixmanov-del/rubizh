<?php
declare(strict_types=1);
// Stage 5.5 (owner D-72): anonymous real-user speed metrics. One row = Kyiv day, page template, metric, device, value.
// No IP, no session, no cookie identifier, no URL — the table has no column that could hold them.
const SHOP_VITALS_TEMPLATES=['home','catalog','category','product','kit'];
const SHOP_VITALS_METRICS=['LCP'=>60000,'CLS'=>10,'INP'=>60000];
const SHOP_VITALS_DEVICES=['mobile','desktop'];

function shopVitalsMigrate(PDO $db): void {
    $db->exec("CREATE TABLE IF NOT EXISTS rubizh_vitals(day DATE NOT NULL,template VARCHAR(16) NOT NULL,metric VARCHAR(8) NOT NULL,device VARCHAR(8) NOT NULL,value DECIMAL(12,4) NOT NULL,INDEX idx_vitals_day(day),INDEX idx_vitals_slice(template,metric,device,day)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}
function shopVitalsDay(int $offset=0): string {
    return (new DateTimeImmutable('today',new DateTimeZone('Europe/Kyiv')))->modify('-'.$offset.' days')->format('Y-m-d');
}
/** Strict sample: exactly {t,m,v,d} with known values and a finite number in range; anything else → null. */
function shopVitalsSample(mixed $in): ?array {
    if(!is_array($in)||array_is_list($in)||count($in)!==4)return null;
    foreach(['t','m','v','d'] as $k)if(!array_key_exists($k,$in))return null;
    [$t,$m,$v,$d]=[$in['t'],$in['m'],$in['v'],$in['d']];
    if(!in_array($t,SHOP_VITALS_TEMPLATES,true)||!is_string($m)||!isset(SHOP_VITALS_METRICS[$m])||!in_array($d,SHOP_VITALS_DEVICES,true))return null;
    if(!is_int($v)&&!is_float($v)||!is_finite((float)$v)||$v<0||$v>SHOP_VITALS_METRICS[$m])return null;
    return [$t,$m,$d,round((float)$v,4)];
}
function shopVitalsEnd(int $status): never {
    http_response_code($status);header('Cache-Control: no-store');header('X-Content-Type-Options: nosniff');exit;
}
/** POST /shop/analytics.php: no CSRF (nothing is tied to a visitor); JSON content type only, so a cross-site form cannot post. */
function shopVitalsCollect(): never {
    $type=strtolower(trim(explode(';',(string)($_SERVER['CONTENT_TYPE']??''),2)[0]));
    if($type!=='application/json')shopVitalsEnd(415);
    if((int)($_SERVER['CONTENT_LENGTH']??0)>1024)shopVitalsEnd(413);
    $raw=file_get_contents('php://input',false,null,0,1025);
    if(!is_string($raw)||strlen($raw)>1024)shopVitalsEnd(413);
    try{$sample=shopVitalsSample(json_decode($raw,true,4,JSON_THROW_ON_ERROR));}catch(JsonException){$sample=null;}
    if($sample===null)shopVitalsEnd(400);
    require_once __DIR__.'/store-lib.php';
    try{
        $db=db();if(!rubizhSchemaPrepared($db))shopVitalsMigrate($db);
        shopLimit($db,'vitals',300,3600,'network:'.rubizhNetworkIdentity());
        $db->prepare('INSERT INTO rubizh_vitals(day,template,metric,device,value) VALUES(?,?,?,?,?)')->execute([shopVitalsDay(),...$sample]);
        // Keep 35 days: the CRM reads 28.
        if(random_int(1,200)===1)$db->prepare('DELETE FROM rubizh_vitals WHERE day<? LIMIT 5000')->execute([shopVitalsDay(35)]);
    }catch(PDOException $e){error_log('rubizh vitals: '.$e->getCode());shopVitalsEnd(503);}
    shopVitalsEnd(204);
}
/** Linear interpolation between closest ranks (PERCENTILE_CONT) over an ascending list. */
function shopVitalsPercentile(array $sorted,float $p): ?float {
    $n=count($sorted);if(!$n)return null;
    $i=($n-1)*$p;$lo=(int)floor($i);$hi=(int)ceil($i);
    return round($sorted[$lo]+($sorted[$hi]-$sorted[$lo])*($i-$lo),4);
}
/** Staff API site.speed (OWNER): median and p75 over the last 7 and 28 Kyiv days, every template × metric × device. */
function shopVitalsReport(PDO $db): array {
    $from28=shopVitalsDay(27);$from7=shopVitalsDay(6);$values=[];
    try{
        $q=$db->prepare('SELECT template,metric,device,day,value FROM rubizh_vitals WHERE day>=? ORDER BY template,metric,device,value');$q->execute([$from28]);
        while($r=$q->fetch(PDO::FETCH_ASSOC)){$k=$r['template'].'|'.$r['metric'].'|'.$r['device'];$v=(float)$r['value'];$values[$k][28][]=$v;if($r['day']>=$from7)$values[$k][7][]=$v;}
    }catch(PDOException $e){if($e->getCode()!=='42S02')throw $e;}
    $window=fn(array $v)=>['n'=>count($v),'median'=>shopVitalsPercentile($v,0.5),'p75'=>shopVitalsPercentile($v,0.75)];
    $rows=[];
    foreach(SHOP_VITALS_TEMPLATES as $t)foreach(array_keys(SHOP_VITALS_METRICS) as $m)foreach(SHOP_VITALS_DEVICES as $d){$k="$t|$m|$d";$rows[]=['template'=>$t,'metric'=>$m,'device'=>$d,'d7'=>$window($values[$k][7]??[]),'d28'=>$window($values[$k][28]??[])];}
    return ['timezone'=>'Europe/Kyiv','windows'=>[7,28],'from_7'=>$from7,'from_28'=>$from28,'to'=>shopVitalsDay(),'rows'=>$rows];
}
