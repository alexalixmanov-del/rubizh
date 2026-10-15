<?php
declare(strict_types=1);
function crmPhone(string $raw): ?string {$n=preg_replace('/[^0-9]/','',$raw);if(preg_match('/^0\d{9}$/D',$n))$n='38'.$n;return preg_match('/^380\d{9}$/D',$n)?'+'.$n:null;}
function crmQuery(PDO $db,string $sql,array $args=[]): array {if(defined('RUBIZH_CRM_TESTS'))$GLOBALS['crm_test_query_count']=($GLOBALS['crm_test_query_count']??0)+1;$q=$db->prepare($sql);$q->execute($args);return $q->fetchAll(PDO::FETCH_ASSOC);}
function crmOne(PDO $db,string $sql,array $args=[]): ?array {return crmQuery($db,$sql,$args)[0]??null;}
function crmPage(array $q): array {$page=filter_var($q['page']??1,FILTER_VALIDATE_INT);$limit=filter_var($q['limit']??25,FILTER_VALIDATE_INT);if(!$page||$page<1||$page>100000||!$limit||$limit<1||$limit>100)throw new CrmError('INVALID_PAGINATION');return ['page'=>$page,'limit'=>$limit,'offset'=>($page-1)*$limit];}
function crmLike(string $q): string {return '%'.str_replace(['!','%','_'],['!!','!%','!_'],$q).'%';}
/**
 * Order ids matching a staff search. Kinds: order number prefix (RB-…, handled by the index: returns null), e-mail,
 * phone (≥7 digits, contact evidence; orders older than the evidence fall back to the stored contact), TTN / SKU /
 * number fragments, and names (letters: the stored contact — the only JSON scan, and only for such queries).
 */
function crmSearchOrderIds(PDO $db,string $q,bool $phones=true): ?array {
 if(preg_match('/^RB-[0-9A-Z-]*$/iD',$q))return null;
 $like=crmLike($q);$digits=preg_replace('/\D/','',$q);$sql=[];$args=[];
 if(str_contains($q,'@')){$sql[]="SELECT id FROM rubizh_customer_orders WHERE email LIKE ? ESCAPE '!'";$args[]=$like;}
 elseif(preg_match('/^[\d\s()+-]+$/D',$q)){
  $sql[]="SELECT order_id FROM rubizh_order_shipments WHERE tracking_number LIKE ? ESCAPE '!'";$args[]=$like;
  $sql[]="SELECT id FROM rubizh_customer_orders WHERE order_number LIKE ? ESCAPE '!'";$args[]=$like;
  if($phones&&strlen($digits)>=7){$tail='%'.substr($digits,-9);$expr="JSON_UNQUOTE(JSON_EXTRACT(d.contact_json,'$.phone'))";foreach(['+',' ','(',')','-'] as $c)$expr="REPLACE($expr,'$c','')";
   $sql[]="SELECT order_id FROM rubizh_order_contact_evidence WHERE normalized_phone LIKE ?";$args[]=$tail;
   $old=array_map('intval',$db->query('SELECT o.id FROM rubizh_customer_orders o LEFT JOIN rubizh_order_contact_evidence ce ON ce.order_id=o.id WHERE ce.order_id IS NULL')->fetchAll(PDO::FETCH_COLUMN));
   if($old){$sql[]="SELECT d.order_id FROM rubizh_order_details d WHERE d.order_id IN (".implode(',',$old).") AND $expr LIKE ?";$args[]=$tail;}}
 }else{
  if(preg_match('/[A-Za-z0-9]/',$q)){$sql[]="SELECT order_id FROM rubizh_order_fulfillment_lines WHERE sku LIKE ? ESCAPE '!'";$args[]=$like;$sql[]="SELECT id FROM rubizh_customer_orders WHERE email LIKE ? ESCAPE '!' OR order_number LIKE ? ESCAPE '!'";array_push($args,$like,$like);}
  $sql[]="SELECT order_id FROM rubizh_order_details WHERE contact_json LIKE ? ESCAPE '!'";$args[]=$like;
 }
 $q2=$db->prepare(implode(' UNION ',$sql));$q2->execute($args);return array_map('intval',$q2->fetchAll(PDO::FETCH_COLUMN));
}
function crmOrderWhere(array $q,array $actor,?PDO $db=null): array {
 $where=['1=1'];$args=[];$search=trim((string)($q['q']??''));if(mb_strlen($search)>120)throw new CrmError('SEARCH_TOO_LONG');
 // Search (ТЗ 7.16: number, phone, name, TTN, SKU). D-59: matching order ids are collected once from narrow sources
 // chosen by the kind of query, then the count and the page select by id (50 000 orders: one scan, not two).
 if($search!==''){$db??=database();$ids=crmSearchOrderIds($db,$search,crmCan($actor,'customer.phone.full'));if($ids===null){$where[]="o.order_number LIKE ? ESCAPE '!'";$args[]=str_replace(['!','%','_'],['!!','!%','!_'],strtoupper($search)).'%';}else $where[]=$ids?'o.id IN ('.implode(',',$ids).')':'0=1';}
 foreach(['from'=>'>=','to'=>'<='] as $k=>$op)if(!empty($q[$k])){if(!preg_match('/^\d{4}-\d{2}-\d{2}$/D',$q[$k]))throw new CrmError('INVALID_DATE');$where[]="o.created_at $op ?";$args[]=$q[$k].($k==='to'?' 23:59:59':' 00:00:00');}
 if(!empty($q['customer'])){if(str_starts_with((string)$q['customer'],'order:')){$where[]='o.id=? AND ao.order_id IS NULL';$args[]=(int)substr($q['customer'],6);}else{$where[]='ao.customer_id=?';$args[]=$q['customer'];}}
 foreach(['manager'=>'a.staff_id','supplier'=>'supplier'] as $k=>$column)if(($q[$k]??'')!==''){if($k==='supplier'){$where[]='EXISTS(SELECT 1 FROM rubizh_order_fulfillment_lines f WHERE f.order_id=o.id AND f.supplier_code=?)';}else $where[]="$column=?";$args[]=$q[$k];}
 $view=$q['view']??'all';if($view==='mine'){$where[]='a.staff_id=?';$args[]=$actor['id'];}
 // Stage 4 tabs (ТЗ 7.1); legacy view names below stay for compatibility.
 $problem="(EXISTS(SELECT 1 FROM rubizh_crm_order_flags fl WHERE fl.order_id=o.id AND fl.problem=1) OR EXISTS(SELECT 1 FROM rubizh_order_shipments s WHERE s.order_id=o.id AND s.status IN ('unknown','error','manual','returned')) OR EXISTS(SELECT 1 FROM rubizh_mono_invoices mi WHERE mi.order_id=o.id AND (mi.status='unknown' OR mi.refund_status='unknown')) OR EXISTS(SELECT 1 FROM rubizh_crm_payment_reviews pr WHERE pr.order_id=o.id AND pr.state='OPEN') OR o.status IN ('returned','partially_returned') OR o.status='cancelled' AND o.payment_status='paid')";
 if($view==='new')$where[]="a.staff_id IS NULL AND o.status IN ('new','confirmed') AND o.payment_status<>'paid'";
 if($view==='processing')$where[]="o.payment_status='paid' AND o.status IN ('confirmed','processing')";
 if($view==='delivery')$where[]="o.status IN ('partially_shipped','shipped','delivered')";
 if($view==='completed')$where[]="(o.status='completed' OR o.pim_order_state='COMPLETED')";
 if($view==='cancelled')$where[]="o.status='cancelled'";
 if($view==='problem')$where[]=$problem;
 $attention=$q['attention']??'';
 if($attention==='confirmation')$where[]="(o.status='new' OR o.pim_order_state IN ('WAITING_CONFIRMATION','NEW'))";
 if($attention==='payment_review')$where[]="(EXISTS(SELECT 1 FROM rubizh_mono_invoices mi WHERE mi.order_id=o.id AND (mi.status='unknown' OR mi.refund_status='unknown')) OR EXISTS(SELECT 1 FROM rubizh_crm_payment_reviews pr WHERE pr.order_id=o.id AND pr.state='OPEN') OR JSON_UNQUOTE(JSON_EXTRACT(d.contact_json,'$.payment'))='invoice' AND o.payment_status<>'paid' AND o.status IN ('confirmed','processing') AND EXISTS(SELECT 1 FROM rubizh_order_timing t WHERE t.order_id=o.id AND t.payment_due<=UTC_TIMESTAMP()))";
 if($attention==='delivery_review')$where[]="EXISTS(SELECT 1 FROM rubizh_order_shipments s WHERE s.order_id=o.id AND s.status IN ('unknown','error','manual'))";
 if($attention==='problem')$where[]="EXISTS(SELECT 1 FROM rubizh_crm_order_flags fl WHERE fl.order_id=o.id AND fl.problem=1)";
 if($attention==='no_supplier')$where[]="EXISTS(SELECT 1 FROM rubizh_order_fulfillment_lines f WHERE f.order_id=o.id AND f.supplier_code='') AND o.status NOT IN ('cancelled','completed')";
 if($attention==='ready_to_ship')$where[]="o.payment_status='paid' AND o.status IN ('confirmed','processing') AND NOT EXISTS(SELECT 1 FROM rubizh_order_shipments s WHERE s.order_id=o.id AND s.status<>'cancelled')";
 if(($q['channel']??'')!==''){if(!in_array($q['channel'],['web','phone','instagram','tiktok','other'],true))throw new CrmError('INVALID_QUERY',400);$where[]=$q['channel']==='web'?"COALESCE(JSON_UNQUOTE(JSON_EXTRACT(d.contact_json,'$.channel')),'web')='web'":"JSON_UNQUOTE(JSON_EXTRACT(d.contact_json,'$.channel'))=?";if($q['channel']!=='web')$args[]=$q['channel'];}
 if($view==='confirmation'||!empty($q['confirmation_required']))$where[]="(o.pim_order_state='WAITING_CONFIRMATION' OR o.status='new')";
 if($view==='payment')$where[]="o.payment_status IN ('pending','failed') AND o.status IN ('confirmed','processing')";
 if($view==='shipping')$where[]="o.payment_status='paid' AND (o.pim_fulfillment_state IN ('NOT_READY','READY_TO_SHIP') OR o.pim_contract_version IS NULL AND o.status IN ('confirmed','processing'))";
 if($view==='transit')$where[]="EXISTS(SELECT 1 FROM rubizh_order_shipments s WHERE s.order_id=o.id AND s.status IN ('created','sent'))";
 if($view==='problems'||!empty($q['shipment_problems']))$where[]="(EXISTS(SELECT 1 FROM rubizh_order_shipments s WHERE s.order_id=o.id AND s.status IN ('unknown','error','manual','returned')) OR o.status IN ('returned','partially_returned') OR o.payment_status='cod' OR o.status='cancelled' AND o.payment_status='paid' OR o.pim_contract_version IS NULL AND o.status='new')";
 if(!empty($q['has_return']))$where[]='EXISTS(SELECT 1 FROM rubizh_returns r WHERE r.order_id=o.id)';
 $expressions=[
 'order_status'=>"COALESCE(o.pim_order_state,CASE WHEN o.status='new' THEN 'WAITING_CONFIRMATION' WHEN o.status='cancelled' THEN 'CANCELLED' WHEN o.status='completed' THEN 'COMPLETED' WHEN o.status IN ('confirmed','processing','shipped','partially_shipped','delivered') THEN 'CONFIRMED' ELSE 'LEGACY_REVIEW_REQUIRED' END)",
 'payment_status'=>"COALESCE(o.pim_payment_state,CASE WHEN o.payment_status='paid' THEN 'PAID' WHEN o.payment_status='refunded' THEN 'REFUNDED' WHEN o.payment_status IN ('pending','failed') THEN IF(EXISTS(SELECT 1 FROM rubizh_mono_invoices mi WHERE mi.order_id=o.id AND mi.status IN ('creating','unknown','created','processing','hold','awaiting_webhook')),'PAYMENT_PENDING','UNPAID') ELSE 'LEGACY_REVIEW_REQUIRED' END)",
 'fulfillment_status'=>"COALESCE(o.pim_fulfillment_state,CASE WHEN o.status IN ('delivered','completed') THEN 'DELIVERED' WHEN o.status IN ('shipped','partially_shipped') THEN 'SHIPPED' WHEN o.payment_status='paid' AND o.status IN ('confirmed','processing') THEN 'READY_TO_SHIP' ELSE 'NOT_READY' END)"];
 foreach($expressions as $k=>$expression)if(($q[$k]??'')!==''){$where[]="$expression=?";$args[]=$q[$k];}
 return [implode(' AND ',$where),$args];
}
function crmOrders(PDO $db,array $q,array $actor): array {
 $p=crmPage($q);[$where,$args]=crmOrderWhere($q,$actor);$joins=' FROM rubizh_customer_orders o LEFT JOIN rubizh_order_details d ON d.order_id=o.id LEFT JOIN rubizh_order_assignments a ON a.order_id=o.id LEFT JOIN rubizh_staff_users u ON u.id=a.staff_id LEFT JOIN rubizh_account_orders ao ON ao.order_id=o.id';
 $total=(int)crmOne($db,'SELECT COUNT(*) total'.$joins.' WHERE '.$where,$args)['total'];
 $sort=['date'=>'o.created_at','number'=>'o.order_number','total'=>'o.total','updated'=>'o.updated_at'][$q['sort']??'date']??'o.created_at';$dir=($q['direction']??'desc')==='asc'?'ASC':'DESC';
 $orders=crmQuery($db,'SELECT o.*,d.contact_json,d.subtotal,d.discount_amount,d.shipping_amount,a.staff_id AS assigned_id,u.name AS assigned_name,ao.customer_id'.$joins.' WHERE '.$where." ORDER BY $sort $dir,o.id $dir LIMIT {$p['limit']} OFFSET {$p['offset']}",$args);
 return ['rows'=>crmOrderDtos($db,$orders,$actor),'pagination'=>['page'=>$p['page'],'limit'=>$p['limit'],'total'=>$total,'pages'=>(int)ceil($total/$p['limit'])]];
}
function crmBatch(PDO $db,string $table,array $ids,string $extra=''): array {if(!$ids)return [];$rows=crmQuery($db,"SELECT * FROM $table WHERE order_id IN (".implode(',',array_fill(0,count($ids),'?')).") $extra",$ids);$out=[];foreach($rows as $r)$out[(int)$r['order_id']][]=$r;return $out;}
function crmOrderDtos(PDO $db,array $orders,?array $actor=null): array {
 if(!$orders)return [];$ids=array_map(fn($o)=>(int)$o['id'],$orders);$ships=crmBatch($db,'rubizh_order_shipments',$ids);$invoices=crmBatch($db,'rubizh_mono_invoices',$ids,'ORDER BY id');$lines=crmBatch($db,'rubizh_order_fulfillment_lines',$ids,'ORDER BY line_no');$refunds=crmBatch($db,'rubizh_refund_operations',$ids);$returns=crmBatch($db,'rubizh_returns',$ids);
 $v2=crmApiTableExists($db,'rubizh_crm_order_flags');$timing=array_column(crmBatchOne($db,'rubizh_order_timing',$ids),null,'order_id');
 $flags=$v2?array_column(crmBatchOne($db,'rubizh_crm_order_flags',$ids),null,'order_id'):[];$checks=$v2?crmBatch($db,'rubizh_order_line_checks',$ids):[];$fop=$v2?array_column(crmBatchOne($db,'rubizh_invoice_payments',$ids),null,'order_id'):[];$reviews=$v2?array_column(crmBatchOne($db,'rubizh_crm_payment_reviews',$ids," AND state='OPEN'"),null,'order_id'):[];
 $notes=crmQuery($db,"SELECT n.*,u.name AS author FROM rubizh_internal_notes n LEFT JOIN rubizh_staff_users u ON u.id=n.author_id WHERE n.entity='order' AND n.id IN(SELECT MAX(id) FROM rubizh_internal_notes WHERE entity='order' AND entity_id IN(".implode(',',array_fill(0,count($ids),'?')).') GROUP BY entity_id)',array_map('strval',$ids));$latest=array_column($notes,null,'entity_id');$out=[];
 foreach($orders as $o){$id=(int)$o['id'];$items=json_decode((string)$o['items_json'],true)?:[];$contact=json_decode((string)($o['contact_json']??''),true)?:[];$left=npRemaining($lines[$id]??[],$ships[$id]??[]);$o['shipment_coverage_complete']=(bool)$left&&!array_filter($left,fn($l)=>abs($l['qty'])>0.00001);$canonical=shopCanonicalOrder($o,$ships[$id]??[],$invoices[$id]??[]);
 $e=['order'=>$o,'shipments'=>$ships[$id]??[],'invoices'=>$invoices[$id]??[],'refunds'=>$refunds[$id]??[],'returns'=>$returns[$id]??[],'note_id'=>$latest[$id]['id']??null];
 if($v2)$e+=['flags'=>$flags[$id]??null,'checks'=>$checks[$id]??[],'fop'=>$fop[$id]??null,'review'=>isset($reviews[$id])];
 $blockers=$canonical['review_flags'];foreach($items as $item){if(($item['selection_type']??'')==='SIZE_OPTION')$blockers[]='SIZE_CONFIRMATION_REQUIRED';elseif(!empty($item['requires_order_confirmation']))$blockers[]=$item['availability_v3']??'CONFIRMATION_REQUIRED';}
 $dto=['id'=>$id,'number'=>$o['order_number'],'created_at'=>$o['created_at'],'updated_at'=>$o['updated_at'],'version'=>hash('sha256',json_encode($e,JSON_THROW_ON_ERROR)),...$canonical,'customer'=>['id'=>$o['customer_id']??'order:'.$id,'name'=>$contact['name']??'','email'=>$o['email'],'phone_raw'=>$contact['phone_raw']??$contact['phone']??'','phone'=>crmPhone((string)($contact['phone_normalized']??$contact['phone']??'')),'identity_evidence'=>($o['customer_id']??null)?'ACCOUNT_LINK':'ORDER_CONTACT'],'total'=>(float)$o['total'],'subtotal'=>(float)($o['subtotal']??$o['total']),'discount'=>(float)($o['discount_amount']??0),'shipping'=>(float)($o['shipping_amount']??0),'items'=>$items,'fulfillment_lines'=>$lines[$id]??[],'remaining'=>$left,'shipments'=>$ships[$id]??[],'payments'=>$invoices[$id]??[],'refunds'=>$refunds[$id]??[],'returns'=>$returns[$id]??[],'contact'=>$contact,'assigned_manager'=>$o['assigned_id']?['id'=>$o['assigned_id'],'name'=>$o['assigned_name']]:null,'latest_note'=>$latest[$id]??null,'blockers'=>array_values(array_unique($blockers))];
 if($v2&&function_exists('crmDisplayStatus'))$dto=crmOrderStage4($dto,$o,['timing'=>$timing[$id]??null,'flags'=>$flags[$id]??null,'checks'=>$checks[$id]??[],'fop'=>$fop[$id]??null,'review'=>isset($reviews[$id])],$actor);
 $out[]=$dto;
 }return $out;
}
function crmBatchOne(PDO $db,string $table,array $ids,string $extra=''): array {if(!$ids)return [];return crmQuery($db,"SELECT * FROM $table WHERE order_id IN (".implode(',',array_fill(0,count($ids),'?')).") $extra",$ids);}
function crmMinor(mixed $v): int {return (int)round((float)$v*100);}
/** Stage 4 view of an order: three statuses, attention, lines with supplier/stock check/parcels, finance in minor units, actions. */
function crmOrderStage4(array $dto,array $o,array $x,?array $actor): array {
 $checks=array_column($x['checks'],null,'line_no');$inParcels=[];foreach($dto['shipments'] as $s)if($s['status']!=='cancelled')foreach(json_decode((string)($s['lines_json']??''),true)?:[] as $l)$inParcels[(int)$l['line_no']]=($inParcels[(int)$l['line_no']]??0)+(float)$l['qty'];
 $fl=array_column($dto['fulfillment_lines'],null,'line_no');$lines=[];
 foreach($dto['items'] as $no=>$it){$f=$fl[$no]??[];$lines[]=['line_no'=>$no,'name'=>$it['name']??'','sku'=>$it['sku']??'','product_id'=>$it['product_id']??'','size'=>$it['size']??'','color'=>$it['color']??'','qty'=>(float)($it['qty']??0),'unit_minor'=>crmMinor($it['price']??0),'amount_minor'=>$f&&$f['line_amount']!==null?crmMinor($f['line_amount']):crmMinor(($it['amount']??($it['price']??0)*($it['qty']??0))),'supplier_code'=>(string)($f['supplier_code']??''),'supplier_name'=>npOrigins()[$f['supplier_code']??'']['name']??'','stock_check'=>$checks[$no]['status']??null,'stock_note'=>$checks[$no]['note']??'','in_parcels'=>$inParcels[$no]??0,'requires_confirmation'=>!empty($it['requires_order_confirmation'])||($it['selection_type']??'')==='SIZE_OPTION','availability'=>$it['availability_v3']??$it['availability']??null,'image'=>$it['image']??null];}
 $display=crmDisplayStatus(['order'=>$o,'shipments'=>$dto['shipments'],'invoices'=>$dto['payments'],'refunds'=>$dto['refunds'],'timing'=>$x['timing'],'open_review'=>$x['review'],'invoice_payment'=>$x['fop'],'coverage_complete'=>(bool)$o['shipment_coverage_complete'],'contact'=>$dto['contact'],'flags'=>$dto['review_flags']]);
 $dto['display']=$display;$dto['channel']=(string)($dto['contact']['channel']??'web');$dto['problem']=$x['flags']&&(int)$x['flags']['problem']===1?['reason'=>$x['flags']['reason'],'updated_at'=>$x['flags']['updated_at']]:null;
 $dto['lines']=$lines;$dto['attention']=crmAttention(['problem'=>$dto['problem']!==null],$display,$lines);
 $dto['parcels']=array_map(fn($s)=>['id'=>(int)$s['id'],'supplier_code'=>$s['supplier_code'],'supplier_name'=>npOrigins()[$s['supplier_code']]['name']??$s['supplier_code'],'status'=>$s['status'],'tracking_number'=>$s['tracking_number'],'lines'=>json_decode((string)($s['lines_json']??''),true)?:[],'error'=>$s['error']??'','updated_at'=>$s['updated_at']],array_values(array_filter($dto['shipments'],fn($s)=>$s['status']!=='cancelled')));
 $refunded=array_sum(array_map(fn($r)=>$r['status']==='success'?(int)$r['amount']:0,$dto['refunds']));$paid=array_sum(array_map(fn($i)=>in_array($i['status'],['success','reversed'],true)?(int)$i['amount']:0,$dto['payments']))+(int)($x['fop']['amount_minor']??0);
 $promo=(string)($dto['contact']['promo_code']??'');$kit=(bool)array_filter($dto['items'],fn($i)=>!empty($i['kit_tier'])||!empty($i['kit']));
 $dto['total_minor']=crmMinor($o['total']);
 $dto['finance']=['goods_minor'=>crmMinor($dto['subtotal']),'discount_minor'=>crmMinor($dto['discount']),'discount_type'=>$dto['discount']>0?($promo!==''?'PROMO':($kit?'KIT_Q8':'WHOLESALE')):null,'promo_code'=>$promo!==''?$promo:null,'shipping_minor'=>crmMinor($dto['shipping']),'shipping_note'=>'Доставку оплачує отримувач перевізнику','total_minor'=>crmMinor($o['total']),'paid_minor'=>$paid,'refunded_minor'=>$refunded,'refundable_minor'=>max(0,$paid-$refunded),'payment_method'=>(string)($dto['contact']['payment']??''),'payment_due'=>$x['timing']['payment_due']??null,'paid_at'=>$x['timing']['paid_at']??null,'invoice_payment'=>$x['fop'],'invoices'=>array_map(fn($i)=>['id'=>(int)$i['id'],'invoice_id'=>$i['invoice_id'],'status'=>$i['status'],'amount_minor'=>(int)$i['amount'],'page_url'=>in_array($i['status'],['created','processing','hold'],true)?$i['page_url']:'','created_at'=>$i['created_at']],$dto['payments']),'refunds'=>array_map(fn($r)=>['id'=>(int)$r['id'],'amount_minor'=>(int)$r['amount'],'status'=>$r['status'],'reason'=>$r['reason'],'updated_at'=>$r['updated_at']],$dto['refunds'])];
 // ТЗ 7.7: phones are masked in every order view; the full number comes only from the audited reveal action.
 $dto['customer']['phone_masked']=crmMaskPhone($dto['customer']['phone']??null);$dto['customer']['phone']=null;$dto['customer']['phone_raw']=null;
 foreach(['phone','phone_raw','phone_normalized','donation_phone'] as $k)if(isset($dto['contact'][$k]))$dto['contact'][$k]=crmMaskPhone((string)$dto['contact'][$k]);
 if($actor){$dto['actions']=crmOrderActions($dto,$actor);$dto['primary_action']=crmPrimaryAction($dto['actions'],$display);$dto=crmRedactOrder($dto,$actor);}else{$dto['actions']=[];$dto['primary_action']=null;}
 // R4-02: shipment rows leave the server through an allow-list only — no NP payloads (recipient/sender phones), no raw
 // provider answers; declared value and delivery cost only with finance access.
 $money=$actor&&crmCan($actor,'order.finance.view');
 $dto['shipments']=array_map(fn($s)=>array_intersect_key($s,array_flip(['id','order_id','supplier_code','status','tracking_number','lines_json','error','created_at','updated_at',...($money?['declared_value','delivery_cost']:[])])),$dto['shipments']);
 return $dto;
}
/** WAREHOUSE never receives money: totals, prices, invoices and refunds are removed server-side (A6). */
function crmRedactOrder(array $dto,array $actor): array {
 if(crmCan($actor,'order.finance.view'))return $dto;
 foreach(['total','subtotal','discount','shipping','total_minor','payments','refunds','finance'] as $k)$dto[$k]=in_array($k,['payments','refunds'],true)?[]:null;
 foreach($dto['items'] as &$i){unset($i['price'],$i['amount'],$i['unit_price'],$i['kit_price']);}unset($i);
 foreach($dto['lines'] as &$l){$l['unit_minor']=null;$l['amount_minor']=null;}unset($l);
 foreach($dto['fulfillment_lines'] as &$f)$f['line_amount']=null;unset($f);
 foreach($dto['remaining'] as &$r)$r['amount']=null;unset($r);
 return $dto;
}
function crmOrder(PDO $db,int $id,?array $actor=null): array {
 $actor??=$GLOBALS['crm_staff_actor']??null;
 $o=crmOne($db,'SELECT o.*,d.contact_json,d.subtotal,d.discount_amount,d.shipping_amount,a.staff_id AS assigned_id,u.name AS assigned_name,ao.customer_id FROM rubizh_customer_orders o LEFT JOIN rubizh_order_details d ON d.order_id=o.id LEFT JOIN rubizh_order_assignments a ON a.order_id=o.id LEFT JOIN rubizh_staff_users u ON u.id=a.staff_id LEFT JOIN rubizh_account_orders ao ON ao.order_id=o.id WHERE o.id=?',[$id]);if(!$o)throw new CrmError('NOT_FOUND',404);
 $r=crmOrderDtos($db,[$o],$actor)[0];$r['notes']=crmNotes($db,'order',(string)$id);$r['timeline']=crmQuery($db,'SELECT * FROM rubizh_order_timeline WHERE order_id=? ORDER BY occurred_at DESC LIMIT 100',[$id]);$r['sku_candidates']=crmSkuCandidates($db,$id);return $r;
}
function crmNotes(PDO $db,string $entity,string $id): array {return crmQuery($db,'SELECT n.*,u.name AS author FROM rubizh_internal_notes n LEFT JOIN rubizh_staff_users u ON u.id=n.author_id WHERE entity=? AND entity_id=? ORDER BY n.id DESC LIMIT 100',[$entity,$id]);}
function crmCheckVersion(array $o,array $b): void {if(!is_string($b['version']??null)||!hash_equals($o['version'],$b['version']))throw new CrmError('STALE_ORDER',409,['current_version'=>$o['version']]);}
function crmEntity(PDO $db,string $entity,string $id): void {$table=['order'=>['rubizh_customer_orders','id'],'shipment'=>['rubizh_order_shipments','id'],'return'=>['rubizh_returns','id'],'customer'=>['rubizh_accounts','id']][$entity]??null;if($entity==='customer'&&str_starts_with($id,'order:')){$table=['rubizh_customer_orders','id'];$id=substr($id,6);}if(!$table||!crmOne($db,"SELECT {$table[1]} FROM {$table[0]} WHERE {$table[1]}=?",[$id]))throw new CrmError('NOT_FOUND',404);}
/**
 * Customers = accounts + guest checkouts (orders without an account). D-59/D-60: search, segment and pagination run in
 * SQL on narrow columns (the order JSON only for letter queries); names, phones and money are read for the page only.
 * Segment rules are crmSegment's: VIP (paid orders / paid total), SLEEPING, REPEAT, NEW, NO_ORDERS.
 */
function crmCustomers(PDO $db,array $q): array {
 $p=crmPage($q);$text=trim((string)($q['q']??''));if(mb_strlen($text)>120)throw new CrmError('SEARCH_TOO_LONG');
 $like=crmLike($text);$digits=preg_replace('/\D/','',$text);$numeric=$text!==''&&preg_match('/^[\d\s()+-]+$/D',$text);$isPhone=$numeric&&strlen($digits)>=7&&($q['_phones']??true)===true;$tail='%'.substr($digits,-9);
 $s=function_exists('crmSettingsValues')?crmSettingsValues($db):['vip_paid_orders'=>3,'vip_paid_total_minor'=>2000000,'sleeping_days'=>180];
 $strip=fn(string $e)=>array_reduce(['+',' ','(',')','-'],fn($x,$c)=>"REPLACE($x,'$c','')",$e);
 $paidOrder="IF(o.payment_status='paid',ROUND(o.total*100),0)";
 $seg=fn(string $orders,string $paid,string $last)=>"CASE WHEN $orders>=".(int)$s['vip_paid_orders']." OR $paid>=".(int)$s['vip_paid_total_minor']." THEN 'VIP' WHEN $last IS NOT NULL AND $last<UTC_TIMESTAMP()-INTERVAL ".(int)$s['sleeping_days']." DAY THEN 'SLEEPING' WHEN $orders>=2 THEN 'REPEAT' WHEN $orders>=1 THEN 'NEW' ELSE 'NO_ORDERS' END";
 // Accounts with their order statistics (few rows).
 $aw=[];$aargs=[];if($text!==''){$aw[]="(CONCAT_WS(' ',a.first_name,a.last_name) LIKE ? ESCAPE '!' OR a.email LIKE ? ESCAPE '!'".($isPhone?' OR '.$strip('a.phone').' LIKE ?':'').')';array_push($aargs,$like,$like);if($isPhone)$aargs[]=$tail;}
 $acc="SELECT a.id,a.created_at,'ACCOUNT' source,".$seg('COALESCE(st.orders,0)','COALESCE(st.paid,0)','st.last_order')." segment FROM rubizh_accounts a LEFT JOIN (SELECT ao.customer_id,COUNT(*) orders,SUM($paidOrder) paid,MAX(o.created_at) last_order FROM rubizh_account_orders ao JOIN rubizh_customer_orders o ON o.id=ao.order_id GROUP BY ao.customer_id) st ON st.customer_id=a.id".($aw?' WHERE '.implode(' AND ',$aw):'');
 // Guest checkouts: one order each.
 $gw=['ao.order_id IS NULL'];$gargs=[];$join='';
 if($text!==''){$parts=["o.email LIKE ? ESCAPE '!'"];$gargs[]=$like;
  // Same narrow-source id collection as the order search (D-59).
  $found=crmSearchOrderIds($db,$text,($q['_phones']??true)===true);if($found===null){$parts[]="o.order_number LIKE ?";$gargs[]=strtoupper($text).'%';}elseif($found)$parts[]='o.id IN ('.implode(',',$found).')';
  $gw[]='('.implode(' OR ',$parts).')';}
 $guest="SELECT CONCAT('order:',o.id) id,o.created_at,'ORDER_CONTACT' source,".$seg('1',$paidOrder,'o.created_at')." segment FROM rubizh_customer_orders o$join LEFT JOIN rubizh_account_orders ao ON ao.order_id=o.id WHERE ".implode(' AND ',$gw);
 $base="($acc) UNION ALL ($guest)";$args=[...$aargs,...$gargs];$where='';
 if(($q['segment']??'')!==''){if(!in_array($q['segment'],['VIP','REPEAT','NEW','SLEEPING','NO_ORDERS'],true))throw new CrmError('INVALID_QUERY',400);$where=' WHERE c.segment=?';$args[]=$q['segment'];}
 $total=(int)crmOne($db,"SELECT COUNT(*) total FROM ($base) c$where",$args)['total'];
 $keys=crmQuery($db,"SELECT c.* FROM ($base) c$where ORDER BY c.created_at DESC,c.id LIMIT {$p['limit']} OFFSET {$p['offset']}",$args);
 // Page details.
 $ids=array_column(array_filter($keys,fn($r)=>$r['source']==='ACCOUNT'),'id');$guests=array_map(fn($r)=>(int)substr($r['id'],6),array_values(array_filter($keys,fn($r)=>$r['source']==='ORDER_CONTACT')));
 $paid="(SELECT COALESCE(SUM(mi.amount),0)/100 FROM rubizh_mono_invoices mi WHERE mi.order_id=o.id AND EXISTS(SELECT 1 FROM rubizh_mono_events ev WHERE ev.invoice_id=mi.invoice_id AND ev.status='success'))";
 $paidTotal="IF($paid>0,$paid,IF(COALESCE(c.payment_proof,'')<>'',o.total,0))";
 $info=[];$stats=[];$verified=[];
 if($ids){$marks=implode(',',array_fill(0,count($ids),'?'));
  foreach(crmQuery($db,"SELECT a.id,CONCAT_WS(' ',a.first_name,a.last_name) name,a.email,a.phone phone_raw FROM rubizh_accounts a WHERE a.id IN ($marks)",$ids) as $r)$info[$r['id']]=$r;
  $stats=array_column(crmQuery($db,"SELECT ao.customer_id,COUNT(*) orders,SUM($paidTotal) paid_total,MAX(o.created_at) last_order,SUM(o.status NOT IN ('cancelled','returned','completed','delivered')) active_orders FROM rubizh_account_orders ao JOIN rubizh_customer_orders o ON o.id=ao.order_id LEFT JOIN rubizh_np_order_confirmations c ON c.order_id=o.id WHERE ao.customer_id IN ($marks) GROUP BY ao.customer_id",$ids),null,'customer_id');
  $verified=array_column(crmQuery($db,"SELECT customer_id,subject FROM rubizh_customer_identities WHERE provider='phone' AND customer_id IN ($marks)",$ids),'subject','customer_id');}
 if($guests){$marks=implode(',',array_fill(0,count($guests),'?'));
  foreach(crmQuery($db,"SELECT o.id,JSON_UNQUOTE(JSON_EXTRACT(d.contact_json,'$.name')) name,o.email,COALESCE(JSON_UNQUOTE(JSON_EXTRACT(d.contact_json,'$.phone_raw')),JSON_UNQUOTE(JSON_EXTRACT(d.contact_json,'$.phone'))) phone_raw,$paidTotal paid_total,o.created_at last_order,(o.status NOT IN ('cancelled','returned','completed','delivered')) active_orders FROM rubizh_customer_orders o JOIN rubizh_order_details d ON d.order_id=o.id LEFT JOIN rubizh_np_order_confirmations c ON c.order_id=o.id WHERE o.id IN ($marks)",$guests) as $r){$k='order:'.$r['id'];$info[$k]=['name'=>$r['name'],'email'=>$r['email'],'phone_raw'=>$r['phone_raw']];$stats[$k]=['orders'=>1,'paid_total'=>$r['paid_total'],'last_order'=>$r['last_order'],'active_orders'=>$r['active_orders']];}}
 $rows=[];foreach($keys as $k){$r=['id'=>$k['id']]+($info[$k['id']]??['name'=>null,'email'=>null,'phone_raw'=>null])+['source'=>$k['source'],'created_at'=>$k['created_at'],'segment'=>$k['segment']];
  $r['phone']=crmPhone((string)($r['phone_raw']??''));$r['phone_verified']=isset($verified[$r['id']])&&crmPhone($verified[$r['id']])===$r['phone'];$r+=($stats[$r['id']]??['orders'=>0,'paid_total'=>0,'active_orders'=>0,'last_order'=>null]);$rows[]=$r;}
 return ['rows'=>$rows,'pagination'=>['page'=>$p['page'],'limit'=>$p['limit'],'total'=>$total,'pages'=>(int)ceil($total/$p['limit'])]];
}
function crmCustomer(PDO $db,string $id,array $actor): array {
 if(str_starts_with($id,'order:')){$order=crmOrder($db,(int)substr($id,6));$customer=$order['customer']+['source'=>'ORDER_CONTACT','phone_verified'=>false];$orders=[$order];$identities=[];$legacy=null;}
 else{$customer=crmOne($db,'SELECT id,email,CONCAT_WS(" ",first_name,last_name) name,phone AS phone_raw,created_at,updated_at FROM rubizh_accounts WHERE id=?',[$id]);if(!$customer)throw new CrmError('NOT_FOUND',404);$identities=crmQuery($db,'SELECT provider,subject,contact_email,created_at FROM rubizh_customer_identities WHERE customer_id=?',[$id]);$customer['phone']=crmPhone($customer['phone_raw']);$customer['phone_verified']=(bool)array_filter($identities,fn($i)=>$i['provider']==='phone'&&crmPhone($i['subject'])===$customer['phone']);$customer['source']='ACCOUNT';$history=crmOrders($db,['customer'=>$id,'page'=>$_GET['page']??1,'limit'=>25],$actor);$orders=$history['rows'];$pagination=$history['pagination'];$legacy=$customer['email']?crmOne($db,'SELECT * FROM rubizh_customers WHERE email=?',[$customer['email']]):null;}
 return ['customer'=>$customer,'identities'=>$identities,'legacy_profile'=>$legacy,'orders'=>$orders,'pagination'=>$pagination??['page'=>1,'limit'=>25,'total'=>1,'pages'=>1],'notes'=>crmNotes($db,'customer',$id)];
}

function crmSkuCandidates(PDO $db,int $id): array {
 $requests=crmQuery($db,'SELECT * FROM rubizh_order_request_selections WHERE order_id=? AND resolved_sku IS NULL ORDER BY line_no',[$id]);if(!$requests)return [];
 $models=array_values(array_unique(array_column($requests,'product_id')));$variants=crmQuery($db,"SELECT product_id,sku,pim_color_id,pim_size_display,pim_size_normalized,color,pim_effective_availability FROM variants WHERE product_id IN (".implode(',',array_fill(0,count($models),'?')).") AND pim_active=1 AND pim_effective_availability NOT IN ('UNKNOWN','OUT_OF_STOCK') ORDER BY sort",$models);$out=[];
 foreach($requests as $r){$sel=json_decode($r['original_selection_json'],true);$skus=[];foreach($variants as $v)if($v['product_id']===$r['product_id']&&(($sel['color_id']??null)===null||$sel['color_id']===$v['pim_color_id']))$skus[]=['sku'=>$v['sku'],'label'=>$v['sku'].' · '.(trim((string)$v['pim_size_display'])?:$v['pim_size_normalized']).' · '.$v['color'].' · '.$v['pim_effective_availability']];$out[]=['line_no'=>(int)$r['line_no'],'label'=>$r['product_id'].' · '.$sel['size'],'skus'=>$skus];}return $out;
}
