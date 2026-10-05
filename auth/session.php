<?php
declare(strict_types=1);
require __DIR__.'/bootstrap.php';
header('Content-Type: application/json; charset=utf-8');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    http_response_code(405); header('Allow: GET');
    echo json_encode(['ok'=>false,'error'=>'Method not allowed']); exit;
}
try {
    if (customerId()===null) { echo json_encode(['ok'=>true,'authed'=>false]); exit; }
    $p = customerProfile(customerId());
    echo json_encode(['ok'=>true,'authed'=>true,'email'=>$p['email'],'customer_id'=>customerId(),'phone_verified'=>customerVerifiedPhone(customerId())!=='','profile'=>[
        'first_name'=>$p['first_name'],'last_name'=>$p['last_name'],'phone'=>$p['phone'],
        'delivery_type'=>$p['delivery_type'],'city'=>$p['city'],'delivery_address'=>$p['delivery_address']
    ]], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(503); echo json_encode(['ok'=>false,'error'=>'Account temporarily unavailable']);
}
