<?php
declare(strict_types=1);
function crmRefundRows(PDO $db,int $order): array {return crmQuery($db,'SELECT * FROM rubizh_refund_operations WHERE order_id=? ORDER BY id',[$order]);}
function crmRefundState(PDO $db,int $order): void {
 $total=(int)(crmOne($db,"SELECT COALESCE(SUM(amount),0) amount FROM rubizh_refund_operations WHERE order_id=? AND status='success'",[$order])['amount']);if(!$total)return;
 $paid=(int)crmOne($db,"SELECT COALESCE(SUM(amount),0) amount FROM rubizh_mono_invoices WHERE order_id=? AND status IN ('success','reversed')",[$order])['amount'];if($total>$paid||!$paid)throw new CrmError('REFUND_FACT_CONFLICT',409);
 $state=$total===$paid?'REFUNDED':'PARTIALLY_REFUNDED';$db->prepare("UPDATE rubizh_customer_orders SET payment_status=?,pim_payment_state=IF(pim_contract_version=3,?,pim_payment_state),updated_at=UTC_TIMESTAMP() WHERE id=?")->execute([$state==='REFUNDED'?'refunded':'paid',$state,$order]);
}
function crmRefund(PDO $db,int $order,array $actor,int $amount,string $key,string $reason,?string $version=null): array {
 crmPermit($actor,'payment.refund.execute');shopRequirePermission($actor['id'],'payment.refund.request');shopRequirePermission($actor['id'],'payment.refund.execute');$key=crmRequestId($key);$reason=shopFinancialReason($reason);if($amount<=0)throw new CrmError('INVALID_REFUND_AMOUNT');
 return npLocked($db,$order,function()use($db,$order,$actor,$amount,$key,$reason,$version){
 $existing=crmOne($db,'SELECT * FROM rubizh_refund_operations WHERE idempotency_key=?',[$key]);if($existing){if((int)$existing['order_id']!==$order||(int)$existing['amount']!==$amount||$existing['actor_id']!==$actor['id']||$existing['reason']!==$reason)throw new CrmError('IDEMPOTENCY_CONFLICT',409);return $existing;}
 if($version!==null)crmCheckVersion(crmOrder($db,$order),['version'=>$version]);
 $db->beginTransaction();try{$i=crmOne($db,"SELECT * FROM rubizh_mono_invoices WHERE order_id=? AND status IN ('success','reversed') ORDER BY id DESC LIMIT 1 FOR UPDATE",[$order]);if(!$i)throw new CrmError('VERIFIED_PAYMENT_REQUIRED',409);
 $ops=crmQuery($db,"SELECT * FROM rubizh_refund_operations WHERE invoice_id=? FOR UPDATE",[$i['id']]);$held=0;foreach($ops as $op){if(in_array($op['status'],['processing','unknown'],true))throw new CrmError('REFUND_RECONCILIATION_REQUIRED',409);if($op['status']==='success')$held+=(int)$op['amount'];}
 if(!$ops&&$i['refund_status']==='success'||!$ops&&$i['status']==='reversed')throw new CrmError('REFUND_LIMIT_EXCEEDED',409);
 if(!$ops&&in_array($i['refund_status'],['processing','unknown'],true))throw new CrmError('REFUND_RECONCILIATION_REQUIRED',409);
 if($amount+$held>(int)$i['amount'])throw new CrmError('REFUND_LIMIT_EXCEEDED',409,['remaining'=>(int)$i['amount']-$held]);
 $ext='crm-'.$key;$db->prepare("INSERT INTO rubizh_refund_operations(invoice_id,order_id,amount,ext_ref,status,reason,actor_id,idempotency_key,created_at,updated_at) VALUES(?,?,?,?,'processing',?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())")->execute([$i['id'],$order,$amount,$ext,$reason,$actor['id'],$key]);$id=(int)$db->lastInsertId();crmAudit($db,$actor,'order',(string)$order,'payment.refund.request',['refunded'=>$held],['refund_id'=>$id,'amount'=>$amount,'status'=>'processing'],$reason,$key);$db->commit();}catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
 try{$response=monoApi('invoice/cancel',['invoiceId'=>$i['invoice_id'],'extRef'=>$ext,'amount'=>$amount]);$status=$response['status']??'';if(!in_array($status,['success','processing','failure'],true)||isset($response['amount'])&&(!is_int($response['amount'])||$response['amount']!==$amount)||isset($response['extRef'])&&$response['extRef']!==$ext)throw new CrmError('PROVIDER_RESULT_UNKNOWN',409);
 $db->beginTransaction();try{$current=crmOne($db,'SELECT * FROM rubizh_refund_operations WHERE id=? FOR UPDATE',[$id]);if($current['status']==='success'&&$status!=='success')throw new CrmError('PROVIDER_STATE_CONFLICT',409);$db->prepare('UPDATE rubizh_refund_operations SET status=?,response_json=?,updated_at=UTC_TIMESTAMP() WHERE id=?')->execute([$status,json_encode(array_intersect_key($response,array_flip(['status','createdDate','modifiedDate','amount','extRef'])),JSON_THROW_ON_ERROR),$id]);crmRefundState($db,$order);crmAudit($db,$actor,'order',(string)$order,'payment.refund.result',['refund_id'=>$id,'status'=>$current['status']],['refund_id'=>$id,'status'=>$status,'amount'=>$amount],$reason,$key);$db->commit();}catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
 }catch(Throwable $e){$db->prepare("UPDATE rubizh_refund_operations SET status='unknown',updated_at=UTC_TIMESTAMP() WHERE id=? AND status='processing'")->execute([$id]);throw $e instanceof CrmError?$e:new CrmError('PROVIDER_RESULT_UNKNOWN',409);}
 return crmOne($db,'SELECT * FROM rubizh_refund_operations WHERE id=?',[$id]);});
}
/** Signed callbacks correlate provider cancellation facts by extRef and exact minor units.
 * An unattributed reversal can never silently turn a partial refund into a full one.
 */
function crmRefundWebhook(PDO $db,array $event,array $invoice): bool {
 if(!crmSchemaReady($db))return false;$ops=crmRefundRows($db,(int)$invoice['order_id']);if(!$ops)return false;
 $cancels=$event['cancelList']??[];if(!$cancels)throw new CrmError('REFUND_RECONCILIATION_REQUIRED',409);if(!is_array($cancels))throw new CrmError('REFUND_FACT_CONFLICT',409);
 foreach($cancels as $c){if(!is_array($c)||!is_string($c['extRef']??null)||!is_int($c['amount']??null)||($c['ccy']??980)!==980||!in_array($c['status']??'',['success','processing','failure'],true))throw new CrmError('REFUND_FACT_CONFLICT',409);$op=null;foreach($ops as $r)if($r['ext_ref']===$c['extRef'])$op=$r;if(!$op||(int)$op['amount']!==$c['amount'])throw new CrmError('REFUND_FACT_CONFLICT',409);if($op['status']==='success'&&$c['status']!=='success')continue;if($op['status']===$c['status'])continue;$db->prepare('UPDATE rubizh_refund_operations SET status=?,response_json=?,updated_at=UTC_TIMESTAMP() WHERE id=?')->execute([$c['status'],json_encode($c,JSON_THROW_ON_ERROR),$op['id']]);crmAudit($db,null,'order',(string)$invoice['order_id'],'payment.refund.webhook',['refund_id'=>$op['id'],'status'=>$op['status']],['refund_id'=>$op['id'],'status'=>$c['status'],'amount'=>$c['amount']],$op['reason'],$op['idempotency_key'],'MONOPAY');}
 crmRefundState($db,(int)$invoice['order_id']);$sum=(int)crmOne($db,"SELECT COALESCE(SUM(amount),0) amount FROM rubizh_refund_operations WHERE invoice_id=? AND status='success'",[$invoice['id']])['amount'];
 $db->prepare('UPDATE rubizh_mono_invoices SET status=?,refund_status=? WHERE id=?')->execute([$sum===(int)$invoice['amount']?'reversed':'success',$sum===(int)$invoice['amount']?'success':'',$invoice['id']]);return true;
}
