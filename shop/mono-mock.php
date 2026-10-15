<?php
declare(strict_types=1);
// Staging-only MonoPay transport. Creates invoices locally; payment is completed only by a webhook
// signed with the staging key pair (meta mono_public_key), exactly like the real bank callback.
function monoMockApi(string $path,?array $body): array {
    if(!monoMockEnabled())throw new LogicException('Mock bank is staging-only');
    if($path==='invoice/create'){
        if(!is_array($body)||!is_int($body['amount']??null)||($body['ccy']??null)!==980)throw new RuntimeException('Mock bank: invalid invoice');
        $id='mock'.bin2hex(random_bytes(10));return ['invoiceId'=>$id,'pageUrl'=>'https://pay.mbnk.biz/'.$id];
    }
    if(str_starts_with($path,'invoice/status')){
        // Test observability (staging mock only): every status read is counted; meta mono_mock_status_fail=1 simulates a bank outage.
        $db=shopStoreDatabase();$db->exec("INSERT INTO meta(k,v) VALUES('mono_mock_status_reads','1') ON DUPLICATE KEY UPDATE v=v+1");
        if($db->query("SELECT v FROM meta WHERE k='mono_mock_status_fail'")->fetchColumn()==='1')throw new RuntimeException('Mock bank: status unavailable');
        return ['status'=>'created'];
    }
    if($path==='invoice/remove')return [];
    // Refund (cancel) of a paid invoice: the staging bank confirms the exact amount and reference (CRM_REFUND_LIVE off).
    if($path==='invoice/cancel'){if(!is_array($body)||!is_int($body['amount']??null)||$body['amount']<=0||!is_string($body['extRef']??null))throw new RuntimeException('Mock bank: invalid cancel');return ['status'=>'success','amount'=>$body['amount'],'extRef'=>$body['extRef'],'createdDate'=>gmdate('c'),'modifiedDate'=>gmdate('c')];}
    if($path==='pubkey')throw new RuntimeException('Mock bank: staging key must be preloaded');
    throw new RuntimeException('Mock bank: unsupported call');
}
