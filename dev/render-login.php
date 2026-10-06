<?php
declare(strict_types=1);
// A CLI-only design renderer. No browser query tokens, POSTs or cookies reach PHP.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$demo = $argv[1] ?? '';
if (!in_array($demo,['','phone','code','email-google'],true)) { $demo = ''; }
$_SERVER['REQUEST_METHOD']='GET';
$_SERVER['REMOTE_ADDR']='127.0.0.1';
$_GET=$demo==='email-google' ? ['email'=>'1'] : [];
ob_start();
require __DIR__.'/../auth/index.php';
$html=ob_get_clean();
if ($demo==='code') {
    $phoneView=true; $mergeView=false; $pending=false; $linkSent=false;
    $challenge=['phone'=>'+380000000000','sent_at'=>time()]; $resendAfter=45;
    $identityFlow=['kind'=>'phone']; $message='';
    ob_start(); require __DIR__.'/../auth/login-view.php'; $view=ob_get_clean();
    $html=preg_replace_callback('~(<main class="auth-main">).*?(</main>)~s',static fn($m)=>$m[1].$view.$m[2],$html);
    $html=str_replace('</body>','<script defer src="/auth/login.js?v=1"></script></body>',$html);
}
echo $html;
