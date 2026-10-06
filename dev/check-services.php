<?php
declare(strict_types=1);
// CLI-only, read-only checks. This script never sends SMS/mail, creates invoices, orders or waybills.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
ini_set('display_errors','0');
define('RUBIZH_AUTH',true);
define('RUBIZH_PRIVATE_CONFIG',true);
require __DIR__.'/../auth/identities.php';
require __DIR__.'/../auth/http.php';
$c=authConfig();
$file=__DIR__.'/../api/config.php';
$saved=is_file($file) ? require $file : [];
$api=is_array($saved) ? $saved : [];
foreach (['np-private.php','mono-private.php'] as $name) { $api=array_replace($api,require __DIR__.'/../api/'.$name); }
$mono=trim((string)($api['mono_token'] ?? ''));
$np=trim((string)($api['nova_poshta_api_key'] ?? ''));
$required=['pdo_mysql','curl','mbstring','openssl','gd','fileinfo'];
$result=[
    'runtime'=>['php'=>PHP_VERSION,'missing_extensions'=>array_values(array_filter($required,static fn($name)=>!extension_loaded($name)))],
    'database'=>['config_present'=>is_file($file),'status'=>'not_checked'],
    'turbosms'=>['configured'=>smsEnabled(),'sender'=>(string)($c['turbosms_sender'] ?? ''),'status'=>'not_checked'],
    'monobank'=>['token_present'=>$mono!=='','payments_enabled'=>($api['mono_activation_confirmed'] ?? false)===true,'status'=>'not_checked'],
    'nova_poshta'=>['key_present'=>$np!=='','waybills_enabled'=>($api['np_ttn_enabled'] ?? false)===true,'status'=>'not_checked'],
    'google'=>['configured'=>googleEnabled(),'redirect_uri'=>'https://rubizh.shop/auth/google.php','status'=>'browser_login_required'],
    'mail'=>['password_present'=>(string)($c['noreply_password'] ?? '')!=='','server'=>'mail.adm.tools','port'=>465,'from'=>'noreply@rubizh.shop','status'=>'delivery_test_required'],
];
if (in_array('--database',$argv,true) && is_file($file)) {
    try {
        $host=(string)($api['db_host'] ?? '');$name=(string)($api['db_name'] ?? '');
        if ($host===''||$name===''||preg_match('/[;\r\n]/',$host.$name)) { throw new RuntimeException('Invalid database config'); }
        $db=new PDO('mysql:host='.$host.';dbname='.$name.';charset=utf8mb4',(string)($api['db_user'] ?? ''),(string)($api['db_pass'] ?? ''),[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_EMULATE_PREPARES=>false]);
        $result['database']['status']=$db->query('SELECT 1')->fetchColumn()==1 ? 'verified' : 'failed';
    } catch (Throwable $e) { $result['database']['status']='failed'; }
}
if (in_array('--remote',$argv,true)) {
    if ((string)($c['turbosms_token'] ?? '')!=='') {
        try {
            $headers=['Authorization: Bearer '.$c['turbosms_token'],'Content-Type: application/json'];
            $balance=authHttp('https://api.turbosms.ua/user/balance.json',null,$headers);
            $senders=authHttp('https://api.turbosms.ua/senders/list.json',json_encode(['type'=>'sms'],JSON_THROW_ON_ERROR),$headers);
            if (($balance['response_code'] ?? null)!==0||($senders['response_code'] ?? null)!==0||!is_array($senders['response_result'] ?? null)) { throw new RuntimeException('API rejected request'); }
            $senderStatus=null;
            foreach ($senders['response_result'] as $sender) {
                if (is_array($sender)&&($sender['name'] ?? '')===($c['turbosms_sender'] ?? '')) { $senderStatus=$sender['status'] ?? null; break; }
            }
            $result['turbosms']['balance_positive']=is_numeric($balance['response_result']['balance'] ?? null)&&(float)$balance['response_result']['balance']>0;
            $result['turbosms']['sender_status']=is_string($senderStatus) ? $senderStatus : 'not_found';
            $result['turbosms']['temporary_sender_substitution']=$senderStatus==='operator';
            $result['turbosms']['status']=$result['turbosms']['balance_positive']&&in_array($senderStatus,['operator','national'],true) ? 'verified' : 'needs_attention';
        } catch (Throwable $e) { $result['turbosms']['status']='failed'; }
    }
    if ($mono!=='') {
        try {
            $merchant=authHttp('https://api.monobank.ua/api/merchant/details',null,['X-Token: '.$mono]);
            $result['monobank']['status']=is_string($merchant['merchantId'] ?? null)&&$merchant['merchantId']!=='' ? 'verified' : 'failed';
        } catch (Throwable $e) { $result['monobank']['status']='failed'; }
    }
    if ($np!=='') {
        try {
            $data=authHttp('https://api.novaposhta.ua/v2.0/json/',json_encode(['apiKey'=>$np,'modelName'=>'Counterparty','calledMethod'=>'getCounterparties','methodProperties'=>['CounterpartyProperty'=>'Sender','Page'=>'1']],JSON_THROW_ON_ERROR),['Content-Type: application/json']);
            if (($data['success'] ?? null)!==true||!is_array($data['data'] ?? null)) { throw new RuntimeException('API rejected request'); }
            $result['nova_poshta']['status']='verified';$result['nova_poshta']['senders_count']=count($data['data']);
        } catch (Throwable $e) { $result['nova_poshta']['status']='failed'; }
    }
}
echo json_encode($result,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR).PHP_EOL;
$failed=$result['runtime']['missing_extensions']!==[]||!$result['database']['config_present']||!$result['turbosms']['configured']||!$result['monobank']['token_present']||!$result['nova_poshta']['key_present']||!$result['google']['configured']||!$result['mail']['password_present'];
foreach (['database','turbosms','monobank','nova_poshta'] as $service) { $failed=$failed||in_array($result[$service]['status'],['failed','needs_attention'],true); }
exit($failed ? 2 : 0);
