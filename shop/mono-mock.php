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
    if(str_starts_with($path,'invoice/status'))return ['status'=>'created'];
    if($path==='pubkey')throw new RuntimeException('Mock bank: staging key must be preloaded');
    throw new RuntimeException('Mock bank: unsupported call');
}
