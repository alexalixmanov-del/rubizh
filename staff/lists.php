<?php
declare(strict_types=1);
// Stage 4 read models and CRM-own records: dashboard, analytics, customers, products (PIM mirror, read-only), suppliers,
// tasks, notifications, saved views, staff, activity, settings, search and CSV export.

function crmHandleMore(PDO $db,array $actor,array $route,array $p,array $b,array $q,?string $key): mixed {
 $id=isset($p['id'])?(int)$p['id']:0;
 return match($route['id']){
  'customers.list'=>crmCustomers4($db,$actor,$q),
  'customers.export'=>crmExportCustomers($db,$actor,$q,false,''),
  'customers.export.full'=>crmExportCustomers($db,$actor,$q,true,$b['reason']),
  'customers.view'=>crmCustomer4($db,$actor,$p['cid']),
  'customers.phone'=>crmCustomerPhone($db,$actor,$p['cid']),
  'customers.edit'=>crmCustomerEdit($db,$actor,$p['cid'],$b),
  'customers.note'=>crmNote($db,$actor,'customer',$p['cid'],$b+['request_id'=>$key]),
  'products.list'=>crmProducts($db,$q),
  'products.view'=>crmProduct($db,$p['pid']),
  'suppliers.list'=>crmSuppliers($db,$q),
  'suppliers.view'=>crmSupplier($db,$p['code']),
  'suppliers.sender','settings.sender.legacy'=>crmSenderSave($db,$p['code'],$actor,$b),
  'tasks.list'=>crmTasks($db,$actor,$q),
  'tasks.create'=>crmTaskCreate($db,$actor,$b),
  'tasks.update'=>crmTaskUpdate($db,$actor,$id,$b),
  'notifications.list'=>crmNotifications($db,$actor,$q),
  'notifications.read'=>crmNotificationsRead($db,$actor,$b),
  'views.list'=>['rows'=>array_map(fn($r)=>['id'=>(int)$r['id'],'name'=>$r['name'],'query'=>$r['query'],'scope'=>$r['scope']],crmQuery($db,'SELECT * FROM rubizh_crm_saved_views WHERE staff_id=? ORDER BY scope,id',[$actor['id']]))],
  'views.save'=>crmViewSave($db,$actor,$b),
  'views.delete'=>crmViewDelete($db,$actor,$id),
  'staff.assignees'=>['rows'=>crmQuery($db,"SELECT id,name,role FROM rubizh_staff_users WHERE enabled=1 AND role IN ('OWNER','MANAGER') ORDER BY name")],
  'staff.list'=>crmStaffList($db),
  'staff.invite'=>crmStaffInvite($db,$actor,$b),
  'staff.update'=>crmStaffUpdate($db,$actor,$p['sid'],$b),
  'staff.reset'=>crmStaffReset($db,$actor,$p['sid'],$b['reason']),
  'staff.logout'=>crmStaffForceLogout($db,$actor,$p['sid'],$b['reason']),
  'settings.staff.create.legacy','settings.staff.update.legacy'=>crmStaffSave($db,$actor,$b,$p['sid']??null),
  'audit.list'=>crmAuditRows($db,$q,$actor),
  'analytics'=>crmAnalytics($db,$actor,$q),
  'reports.legacy'=>crmReports($db,$q,$actor),
  'settings.view'=>crmSettingsView($db,$actor),
  'settings.system'=>crmSettingsSave($db,$actor,$b),
  'search'=>crmSearch($db,$actor,(string)($q['q']??'')),
  'wholesale.list'=>crmWholesaleList($db,$q),
  'wholesale.update'=>crmWholesaleUpdate($db,$actor,$id,$b),
  'wholesale.phone'=>crmWholesalePhone($db,$actor,$id),
  'wholesale.detail'=>crmWholesaleDetail($db,$id),
  'wholesale.note'=>crmWholesaleNeed($db,$id)?crmNote($db,$actor,'wholesale',(string)$id,$b+['request_id'=>$key]):[],
  'wholesale.order'=>crmWholesaleOrder($db,$actor,$id,$b,(string)$key),
  default=>throw new CrmError('NOT_FOUND',404),
 };
}

// ---- session / personal --------------------------------------------------------------------------------------------
function crmLogout(PDO $db,array $actor): array {
 crmAudit($db,$actor,'security',$actor['id'],'logout',[],[]);
 $db->prepare('UPDATE rubizh_staff_sessions SET revoked_at=UTC_TIMESTAMP() WHERE id=?')->execute([crmSessionKey()]);
 $_SESSION=[];session_destroy();setcookie('rubizh_staff','',['expires'=>1,'path'=>'/api/staff','secure'=>(($_SERVER['HTTPS']??'')==='on'),'httponly'=>true,'samesite'=>'Strict']);
 return ['done'=>true,'logged_out'=>true];
}
function crmPreferences(PDO $db,array $actor,array $b): array {
 if(isset($b['theme']))$db->prepare('INSERT INTO rubizh_staff_prefs(staff_id,theme,updated_at) VALUES(?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE theme=VALUES(theme),updated_at=VALUES(updated_at)')->execute([$actor['id'],$b['theme']]);
 if(isset($b['name'])&&trim($b['name'])!==$actor['name']){$db->prepare('UPDATE rubizh_staff_users SET name=?,updated_at=UTC_TIMESTAMP() WHERE id=?')->execute([trim($b['name']),$actor['id']]);crmAudit($db,$actor,'staff',$actor['id'],'staff.rename_self',['name'=>$actor['name']],['name'=>trim($b['name'])]);}
 return crmActor($db);
}
/** Own password change: the current password is required; other sessions end, this one stays. */
function crmPasswordChange(PDO $db,array $actor,array $b): array {
 $u=crmOne($db,'SELECT password_hash FROM rubizh_staff_users WHERE id=?',[$actor['id']]);$k=hash('sha256','account|'.mb_strtolower((string)$actor['email']));
 // R4-09: wrong current passwords count like failed logins of the account (8 per 15 minutes here).
 if(!rubizhRateCheck('staff-password-change',$k,8,900))throw new CrmError('RATE_LIMITED',429,['retry_after'=>900]);
 if(!$u||!password_verify($b['current'],$u['password_hash'])){rubizhRateAllow('staff-password-change',$k,PHP_INT_MAX,900);rubizhRateAllow('staff-login-account',$k,PHP_INT_MAX,900);throw new CrmError('REAUTH_FAILED',401);}
 crmPasswordPolicy($b['password'],$actor['email']);
 $db->prepare('UPDATE rubizh_staff_users SET password_hash=?,updated_at=UTC_TIMESTAMP() WHERE id=?')->execute([crmPasswordHash($b['password']),$actor['id']]);
 crmSessionsRevoke($db,$actor['id'],crmSessionKey());crmAudit($db,$actor,'security',$actor['id'],'password.change',[],['other_sessions_revoked'=>true]);
 return ['done'=>true];
}
function crmRevokeOthers(PDO $db,array $actor): array {crmSessionsRevoke($db,$actor['id'],crmSessionKey());crmAudit($db,$actor,'security',$actor['id'],'sessions.revoke_others',[],[]);return ['done'=>true];}

// ---- periods and money facts -----------------------------------------------------------------------------------------
/** [from,to) in UTC for a Europe/Kyiv calendar period, plus the equally long previous period for comparison. */
function crmPeriod4(array $q): array {
 $tz=new DateTimeZone('Europe/Kyiv');$today=new DateTimeImmutable('today',$tz);$period=$q['period']??'30d';
 [$start,$end]=match($period){
  'today'=>[$today,$today->modify('+1 day')],'yesterday'=>[$today->modify('-1 day'),$today],'7d'=>[$today->modify('-6 days'),$today->modify('+1 day')],'30d'=>[$today->modify('-29 days'),$today->modify('+1 day')],
  'month'=>[$today->modify('first day of this month'),$today->modify('+1 day')],'last_month'=>[$today->modify('first day of last month'),$today->modify('first day of this month')],
  'custom'=>[DateTimeImmutable::createFromFormat('!Y-m-d',(string)($q['from']??''),$tz),($t=DateTimeImmutable::createFromFormat('!Y-m-d',(string)($q['to']??''),$tz))?$t->modify('+1 day'):false],
  default=>throw new CrmError('INVALID_PERIOD',400),
 };
 if(!$start||!$end||$start>=$end||$end->getTimestamp()-$start->getTimestamp()>370*86400)throw new CrmError('INVALID_PERIOD',400);
 $len=$end->getTimestamp()-$start->getTimestamp();$prevStart=$period==='last_month'?$start->modify('first day of last month'):($period==='month'?$start->modify('first day of last month'):$start->modify('-'.$len.' seconds'));$prevEnd=$period==='month'?$prevStart->modify('+'.((int)$today->format('j')).' days'):$start;
 $u=fn(DateTimeImmutable $d)=>$d->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
 return ['from'=>$u($start),'to'=>$u($end),'prev_from'=>$u($prevStart),'prev_to'=>$u($prevEnd),'timezone'=>'Europe/Kyiv','period'=>$period,'label_from'=>$start->format('Y-m-d'),'label_to'=>$end->modify('-1 day')->format('Y-m-d')];
}
/** Money received in [from,to): signed MonoPay success events + accepted FOP-invoice payments (D-51); refunds by ledger. */
function crmMoneyFacts(PDO $db,string $from,string $to,array $filter=[]): array {
 $extra='';$args=[];
 if(!empty($filter['manager'])){$extra.=' AND EXISTS(SELECT 1 FROM rubizh_order_assignments a WHERE a.order_id=o.id AND a.staff_id=?)';$args[]=$filter['manager'];}
 if(!empty($filter['supplier'])){$extra.=' AND EXISTS(SELECT 1 FROM rubizh_order_fulfillment_lines f WHERE f.order_id=o.id AND f.supplier_code=?)';$args[]=$filter['supplier'];}
 $card=crmQuery($db,"SELECT i.order_id,i.amount,ev.paid_at FROM rubizh_mono_invoices i JOIN rubizh_customer_orders o ON o.id=i.order_id JOIN (SELECT invoice_id,MIN(created_at) paid_at FROM rubizh_mono_events WHERE status='success' GROUP BY invoice_id) ev ON ev.invoice_id=i.invoice_id WHERE ev.paid_at>=? AND ev.paid_at<? $extra",[$from,$to,...$args]);
 $fop=crmQuery($db,"SELECT p.order_id,p.amount_minor amount,CONCAT(p.paid_on,' 10:00:00') paid_at FROM rubizh_invoice_payments p JOIN rubizh_customer_orders o ON o.id=p.order_id WHERE CONCAT(p.paid_on,' 10:00:00')>=? AND CONCAT(p.paid_on,' 10:00:00')<? $extra",[$from,$to,...$args]);
 $refund=(int)crmOne($db,"SELECT COALESCE(SUM(r.amount),0) n FROM rubizh_refund_operations r JOIN rubizh_customer_orders o ON o.id=r.order_id WHERE r.status='success' AND r.updated_at>=? AND r.updated_at<? $extra",[$from,$to,...$args])['n'];
 $all=[...$card,...$fop];$daily=[];foreach($all as $f){$d=(new DateTimeImmutable($f['paid_at'],new DateTimeZone('UTC')))->setTimezone(new DateTimeZone('Europe/Kyiv'))->format('Y-m-d');$daily[$d]=($daily[$d]??0)+(int)$f['amount'];}
 $paid=array_sum(array_map(fn($f)=>(int)$f['amount'],$all));$orders=count(array_unique(array_column($all,'order_id')));
 return ['revenue_minor'=>$paid,'paid_orders'=>$orders,'average_minor'=>$orders?intdiv($paid,$orders):0,'refunds_minor'=>$refund,'net_minor'=>$paid-$refund,'daily'=>$daily,'order_ids'=>array_values(array_unique(array_map('intval',array_column($all,'order_id'))))];
}
/** OD-4.1: gross profit = paid goods revenue − refunds − Σ(qty × supplier cost) over the paid orders; null without full cost data. */
function crmGrossProfit(PDO $db,array $orderIds,int $revenue,int $refunds): array {
 if(!$orderIds)return ['value_minor'=>0,'available'=>true,'missing_skus'=>0];
 $marks=implode(',',array_fill(0,count($orderIds),'?'));
 $rows=crmQuery($db,"SELECT f.sku,SUM(f.qty) qty,c.cost_minor FROM rubizh_order_fulfillment_lines f LEFT JOIN rubizh_crm_sku_costs c ON c.sku=f.sku WHERE f.order_id IN ($marks) GROUP BY f.sku,c.cost_minor",$orderIds);
 $missing=count(array_filter($rows,fn($r)=>$r['cost_minor']===null));
 if($missing)return ['value_minor'=>null,'available'=>false,'missing_skus'=>$missing,'note'=>'Немає даних собівартості від PIM'];
 $cost=array_sum(array_map(fn($r)=>(int)round((float)$r['qty']*(int)$r['cost_minor']),$rows));
 return ['value_minor'=>$revenue-$refunds-$cost,'available'=>true,'missing_skus'=>0,'cost_minor'=>$cost];
}

// ---- dashboard -------------------------------------------------------------------------------------------------------
function crmDashboard4(PDO $db,array $actor,array $q): array {
 $per=crmPeriod4($q+['period'=>'today']);$fin=crmCan($actor,'dashboard.finance');
 $created=fn($f,$t)=>(int)crmOne($db,'SELECT COUNT(*) n FROM rubizh_customer_orders WHERE created_at>=? AND created_at<?',[$f,$t])['n'];
 $kpi=['orders'=>['value'=>$created($per['from'],$per['to']),'previous'=>$created($per['prev_from'],$per['prev_to'])]];
 $queue=crmOne($db,"SELECT SUM(o.status='new' OR o.pim_order_state IN ('WAITING_CONFIRMATION','NEW')) confirmation,SUM(o.status IN ('confirmed','processing') AND o.payment_status IN ('pending','failed')) payment,SUM(o.payment_status='paid' AND o.status IN ('confirmed','processing')) shipping FROM rubizh_customer_orders o");
 $kpi['awaiting_processing']=['value'=>(int)$queue['confirmation']+(int)$queue['shipping'],'detail'=>array_map('intval',crmCan($actor,'order.amount.view')?$queue:array_diff_key($queue,['payment'=>1]))];
 $chart=[];$money=null;
 if(crmCan($actor,'order.finance.view')){
  $now=crmMoneyFacts($db,$per['from'],$per['to']);$prev=crmMoneyFacts($db,$per['prev_from'],$per['prev_to']);
  $kpi['revenue']=['value_minor'=>$now['revenue_minor'],'previous_minor'=>$prev['revenue_minor']];$kpi['average']=['value_minor'=>$now['average_minor'],'previous_minor'=>$prev['average_minor']];
  if($fin){$g=crmGrossProfit($db,$now['order_ids'],$now['revenue_minor'],$now['refunds_minor']);$gp=crmGrossProfit($db,$prev['order_ids'],$prev['revenue_minor'],$prev['refunds_minor']);$kpi['gross_profit']=['value_minor'=>$g['value_minor'],'previous_minor'=>$gp['value_minor'],'available'=>$g['available'],'note'=>$g['note']??null];}
  $money=[$now,$prev];
 }
 // Daily series in Kyiv dates, with the comparison period aligned by day index.
 $days=[];$d=new DateTimeImmutable($per['label_from']);$end=new DateTimeImmutable($per['label_to']);$i=0;
 $ordersDaily=array_column(crmQuery($db,"SELECT DATE(CONVERT_TZ(created_at,'+00:00',?)) d,COUNT(*) n FROM rubizh_customer_orders WHERE created_at>=? AND created_at<? GROUP BY d",[crmKyivOffset(),$per['from'],$per['to']]),'n','d');
 while($d<=$end&&$i<400){$k=$d->format('Y-m-d');$row=['date'=>$k,'orders'=>(int)($ordersDaily[$k]??0)];if($money){$row['revenue_minor']=$money[0]['daily'][$k]??0;$pk=array_keys($money[1]['daily']);$row['previous_revenue_minor']=0;}$chart[]=$row;$d=$d->modify('+1 day');$i++;}
 if($money){$prevDays=[];$pd=new DateTimeImmutable(substr((new DateTimeImmutable($per['prev_from'],new DateTimeZone('UTC')))->setTimezone(new DateTimeZone('Europe/Kyiv'))->format('Y-m-d'),0,10));foreach($chart as $n=>$row){$chart[$n]['previous_revenue_minor']=$money[1]['daily'][$pd->format('Y-m-d')]??0;$pd=$pd->modify('+1 day');}}
 $statuses=crmOne($db,"SELECT SUM(status='new' OR pim_order_state='WAITING_CONFIRMATION') waiting,SUM(status='confirmed') confirmed,SUM(status='processing') packing,SUM(status IN ('partially_shipped','shipped','delivered','partially_returned','returned') AND status<>'completed') delivery,SUM(status='completed') completed,SUM(status='cancelled') cancelled FROM rubizh_customer_orders WHERE created_at>=? AND created_at<?",[$per['from'],$per['to']]);
 $recent=crmOrders($db,['limit'=>8,'sort'=>'date','direction'=>'desc'],$actor)['rows'];
 $attention=crmOrders($db,['limit'=>8,'view'=>'problem'],$actor)['rows'];
 $attention=array_merge($attention,crmOrders($db,['limit'=>8,'attention'=>'confirmation','sort'=>'date','direction'=>'asc'],$actor)['rows']);
 $popular=crmQuery($db,"SELECT f.sku,f.product_id,MAX(p.name) name,SUM(f.qty) qty,COUNT(DISTINCT f.order_id) orders FROM rubizh_order_fulfillment_lines f JOIN rubizh_customer_orders o ON o.id=f.order_id LEFT JOIN products p ON p.id=f.product_id WHERE o.created_at>=? AND o.created_at<? AND o.status<>'cancelled' GROUP BY f.sku,f.product_id ORDER BY qty DESC LIMIT 5",[$per['from'],$per['to']]);
 foreach($popular as &$r){$r['qty']=(float)$r['qty'];$r['orders']=(int)$r['orders'];}unset($r);
 // M-13: OWNER only, neutral wording: counts of handled orders, no rankings or judgements.
 $managers=crmCan($actor,'dashboard.managers')?crmQuery($db,"SELECT u.id,u.name,COUNT(a.order_id) assigned,SUM(o.status NOT IN ('new','cancelled')) confirmed,SUM(o.status='completed') completed FROM rubizh_staff_users u LEFT JOIN rubizh_order_assignments a ON a.staff_id=u.id LEFT JOIN rubizh_customer_orders o ON o.id=a.order_id AND o.created_at>=? AND o.created_at<? WHERE u.enabled=1 AND u.role IN ('OWNER','MANAGER') GROUP BY u.id,u.name ORDER BY u.name",[$per['from'],$per['to']]):null;
 if($managers)foreach($managers as &$m){$m['assigned']=(int)$m['assigned'];$m['confirmed']=(int)$m['confirmed'];$m['completed']=(int)$m['completed'];}unset($m);
 $activity=crmCan($actor,'audit.view')?crmAuditRows($db,['limit'=>10],$actor)['rows']:[];
 if(!crmCan($actor,'order.amount.view'))$statuses=array_filter($statuses,fn($k)=>!preg_match('/pa(id|y)|refund/',$k),ARRAY_FILTER_USE_KEY);
 return ['period'=>$per,'kpi'=>$kpi,'chart'=>$chart,'statuses'=>array_map('intval',$statuses),'recent'=>$recent,'attention'=>array_values(array_slice(array_column(array_reverse($attention),null,'id'),0,10)),'popular'=>$popular,'managers'=>$managers,'activity'=>$activity];
}
function crmKyivOffset(): string {return (new DateTimeImmutable('now',new DateTimeZone('Europe/Kyiv')))->format('P');}

/** Tab counters (ТЗ 7.1) in one indexed pass per tab. */
function crmCounters(PDO $db,array $actor): array {
 $views=['all','new','confirmation','payment','processing','delivery','completed','cancelled','problem','mine'];if(!crmCan($actor,'order.amount.view'))$views=array_values(array_diff($views,['payment']));
 $out=[];foreach($views as $v){[$where,$args]=crmOrderWhere(['view'=>$v],$actor);$out[$v]=(int)crmOne($db,'SELECT COUNT(*) n FROM rubizh_customer_orders o LEFT JOIN rubizh_order_details d ON d.order_id=o.id LEFT JOIN rubizh_order_assignments a ON a.order_id=o.id WHERE '.$where,$args)['n'];}
 return ['tabs'=>$out];
}

// ---- analytics -------------------------------------------------------------------------------------------------------
function crmAnalytics(PDO $db,array $actor,array $q): array {
 $per=crmPeriod4($q);$f=['manager'=>$q['manager']??'','supplier'=>$q['supplier']??''];
 $now=crmMoneyFacts($db,$per['from'],$per['to'],$f);$prev=crmMoneyFacts($db,$per['prev_from'],$per['prev_to'],$f);
 $ids=$now['order_ids'];$marks=$ids?implode(',',array_fill(0,count($ids),'?')):'NULL';
 $created=(int)crmOne($db,'SELECT COUNT(*) n FROM rubizh_customer_orders WHERE created_at>=? AND created_at<?',[$per['from'],$per['to']])['n'];
 $byManager=$ids?crmQuery($db,"SELECT COALESCE(u.name,'Не призначено') name,COUNT(*) orders,SUM(ROUND(o.total*100)) revenue_minor FROM rubizh_customer_orders o LEFT JOIN rubizh_order_assignments a ON a.order_id=o.id LEFT JOIN rubizh_staff_users u ON u.id=a.staff_id WHERE o.id IN ($marks) GROUP BY name ORDER BY revenue_minor DESC",$ids):[];
 $bySupplier=$ids?crmQuery($db,"SELECT f.supplier_code code,COUNT(DISTINCT f.order_id) orders,SUM(ROUND(f.line_amount*100)) revenue_minor FROM rubizh_order_fulfillment_lines f WHERE f.order_id IN ($marks) GROUP BY f.supplier_code ORDER BY revenue_minor DESC",$ids):[];
 foreach($bySupplier as &$s)$s['name']=npOrigins()[$s['code']]['name']??($s['code']===''?'Без постачальника':$s['code']);unset($s);
 $byCategory=$ids?crmQuery($db,"SELECT COALESCE(NULLIF(p.category_path,''),'Без категорії') name,SUM(f.qty) qty,SUM(ROUND(f.line_amount*100)) revenue_minor FROM rubizh_order_fulfillment_lines f LEFT JOIN products p ON p.id=f.product_id WHERE f.order_id IN ($marks) GROUP BY name ORDER BY revenue_minor DESC LIMIT 20",$ids):[];
 $byChannel=$ids?crmQuery($db,"SELECT COALESCE(JSON_UNQUOTE(JSON_EXTRACT(d.contact_json,'$.channel')),'web') name,COUNT(*) orders,SUM(ROUND(o.total*100)) revenue_minor FROM rubizh_customer_orders o JOIN rubizh_order_details d ON d.order_id=o.id WHERE o.id IN ($marks) GROUP BY name",$ids):[];
 // New vs repeat: a buyer (account, else normalized order phone) is repeat when a paid order of theirs precedes the period.
 $buyers=$ids?crmQuery($db,"SELECT o.id,COALESCE(ao.customer_id,ev.normalized_phone,o.email) buyer,o.created_at FROM rubizh_customer_orders o LEFT JOIN rubizh_account_orders ao ON ao.order_id=o.id LEFT JOIN rubizh_order_contact_evidence ev ON ev.order_id=o.id WHERE o.id IN ($marks)",$ids):[];
 $new=0;$repeat=0;foreach(array_unique(array_column($buyers,'buyer')) as $buyer){$earlier=(int)crmOne($db,"SELECT COUNT(*) n FROM rubizh_customer_orders o LEFT JOIN rubizh_account_orders ao ON ao.order_id=o.id LEFT JOIN rubizh_order_contact_evidence ev ON ev.order_id=o.id WHERE COALESCE(ao.customer_id,ev.normalized_phone,o.email)=? AND o.payment_status IN ('paid','refunded') AND o.created_at<?",[$buyer,$per['from']])['n'];$earlier?$repeat++:$new++;}
 foreach([&$byManager,&$bySupplier,&$byCategory,&$byChannel] as &$slice)foreach($slice as &$r){foreach(['orders','revenue_minor'] as $k)if(isset($r[$k]))$r[$k]=(int)$r[$k];if(isset($r['qty']))$r['qty']=(float)$r['qty'];}unset($slice,$r);
 $daily=[];foreach($now['daily'] as $d=>$v)$daily[]=['date'=>$d,'revenue_minor'=>$v];
 return ['period'=>$per,'totals'=>['revenue_minor'=>$now['revenue_minor'],'previous_revenue_minor'=>$prev['revenue_minor'],'paid_orders'=>$now['paid_orders'],'orders_created'=>$created,'average_minor'=>$now['average_minor'],'refunds_minor'=>$now['refunds_minor'],'net_minor'=>$now['net_minor'],'new_buyers'=>$new,'repeat_buyers'=>$repeat],
  'gross_profit'=>crmGrossProfit($db,$ids,$now['revenue_minor'],$now['refunds_minor']),'slices'=>['managers'=>$byManager,'suppliers'=>$bySupplier,'categories'=>$byCategory,'channels'=>$byChannel],'daily'=>$daily];
}

// ---- customers -------------------------------------------------------------------------------------------------------
function crmMaskPhone(?string $phone): ?string {if(!$phone)return null;$d=preg_replace('/\D/','',$phone);return strlen($d)===12?'+'.substr($d,0,3).' '.substr($d,3,2).' *** ** '.substr($d,10,2):'***';}
function crmSettingsValues(PDO $db): array {
 $defaults=['vip_paid_orders'=>3,'vip_paid_total_minor'=>2000000,'sleeping_days'=>180,'auto_task_unconfirmed_minutes'=>30,'auto_task_no_ttn_hours'=>24,'invoice_grace_workdays'=>(int)(cfg('invoice_grace_workdays')??3),'direct_pay_max_qty'=>(int)(cfg('direct_pay_max_qty')??3)];
 if(!crmApiTableExists($db,'rubizh_crm_settings'))return $defaults;
 foreach(crmQuery($db,'SELECT k,v FROM rubizh_crm_settings') as $r)if(array_key_exists($r['k'],$defaults))$defaults[$r['k']]=(int)$r['v'];
 return $defaults;
}
function crmSegment(array $c,array $s): string {
 $paidMinor=(int)round((float)($c['paid_total']??0)*100);$orders=(int)($c['orders']??0);
 if($orders>=$s['vip_paid_orders']||$paidMinor>=$s['vip_paid_total_minor'])return 'VIP';
 if(!empty($c['last_order'])&&strtotime($c['last_order'].' UTC')<time()-$s['sleeping_days']*86400)return 'SLEEPING';
 if($orders>=2)return 'REPEAT';
 return $orders>=1?'NEW':'NO_ORDERS';
}
function crmCustomers4(PDO $db,array $actor,array $q): array {
 $r=crmCustomers($db,['_phones'=>crmCan($actor,'customer.phone.full')]+$q);$s=crmSettingsValues($db);
 foreach($r['rows'] as &$c){$c['segment']=$c['segment']??crmSegment($c,$s);$c['phone_masked']=crmMaskPhone($c['phone']??null);$c['paid_total_minor']=(int)round((float)($c['paid_total']??0)*100);$c['orders']=(int)$c['orders'];unset($c['phone'],$c['phone_raw']);if(!crmCan($actor,'order.finance.view'))$c['paid_total_minor']=null;}unset($c);
 // S4-05: the segment filter runs in SQL before pagination (crmCustomers).
 return $r;
}
function crmCustomer4(PDO $db,array $actor,string $id): array {
 $r=crmCustomer($db,$id,$actor);if(is_array($r['legacy_profile']??null)){$l=$r['legacy_profile'];$r['legacy_profile']=array_intersect_key($l,array_flip(['first_name','last_name','city','delivery_type','created_at','updated_at']))+['phone_masked'=>crmMaskPhone($l['phone']??null)];}$c=&$r['customer'];$c['phone_masked']=crmMaskPhone($c['phone']??null);unset($c['phone'],$c['phone_raw']);
 foreach($r['identities'] as &$i)if($i['provider']==='phone')$i['subject']=crmMaskPhone($i['subject']);unset($i);
 foreach($r['orders'] as &$o){$o['customer']['phone']=null;$o['customer']['phone_raw']=null;$o['contact']=array_diff_key($o['contact'],array_flip(['phone','phone_raw','phone_normalized','donation_phone']));}unset($o);
 return $r;
}
/** Full phone only for MANAGER/SUPPORT/OWNER, and every view is recorded (ТЗ 7.7). */
/** R4-05: full phone numbers — 30 per hour per staff member; above that the OWNER is alerted. */
function crmRevealQuota(PDO $db,array $actor): void {
 if(rubizhRateAllow('staff-phone-reveal',$actor['id'],30,3600))return;
 crmNotify($db,'role:OWNER','phone_reveal_limit','staff',$actor['id'],'Багато переглядів повних телефонів: '.$actor['name'],true,'reveal:'.$actor['id'].':'.gmdate('YmdH'));
 header('Retry-After: 3600');throw new CrmError('RATE_LIMITED',429,['retry_after'=>3600]);
}
function crmCustomerPhone(PDO $db,array $actor,string $id): array {
 crmRevealQuota($db,$actor);$phone=crmCustomerRawPhone($db,$id);
 crmAudit($db,$actor,'customer',$id,'customer.phone_view',[],['viewed'=>true]);
 return ['phone'=>$phone];
}
/** Unmasked phone straight from SITE data (the read models only carry masks). */
function crmCustomerRawPhone(PDO $db,string $id): ?string {
 if(str_starts_with($id,'order:')){$r=crmOne($db,'SELECT d.contact_json FROM rubizh_order_details d WHERE d.order_id=?',[(int)substr($id,6)]);if(!$r)throw new CrmError('NOT_FOUND',404);$c=json_decode((string)$r['contact_json'],true)?:[];return crmPhone((string)($c['phone_normalized']??$c['phone']??''));}
 $r=crmOne($db,'SELECT phone FROM rubizh_accounts WHERE id=?',[$id]);if(!$r)throw new CrmError('NOT_FOUND',404);return crmPhone((string)$r['phone']);
}
function crmCustomerEdit(PDO $db,array $actor,string $id,array $b): array {
 if(!preg_match('/^[a-f0-9]{32}$/D',$id))throw new CrmError('ACCOUNT_REQUIRED',409);
 shopCustomerRename($db,$id,$actor['id'],trim($b['first_name']),trim((string)($b['last_name']??'')),$b['reason']);
 crmAudit($db,$actor,'customer',$id,'customer.rename',[],['first_name'=>$b['first_name'],'last_name'=>$b['last_name']??''],$b['reason']);
 return crmCustomer4($db,$actor,$id);
}

// ---- products and suppliers (read-only mirror of PIM in SITE, M-5) -----------------------------------------------------
function crmProducts(PDO $db,array $q): array {
 $p=crmPage($q);$v3=!empty($GLOBALS['rubizh_pim_v3_columns']);$where=['1=1'];$args=[];
 if(($q['q']??'')!==''){$where[]="(p.name LIKE ? ESCAPE '!' OR p.id LIKE ? ESCAPE '!' OR EXISTS(SELECT 1 FROM variants v WHERE v.product_id=p.id AND v.sku LIKE ? ESCAPE '!'))";array_push($args,...array_fill(0,3,crmLike($q['q'])));}
 if(($q['published']??'')!=='')$where[]=$q['published']==='1'?'p.visible=1':'p.visible=0';
 $where=implode(' AND ',$where);$total=(int)crmOne($db,"SELECT COUNT(*) n FROM products p WHERE $where",$args)['n'];
 $per=crmPeriod4(['period'=>$q['period']??'30d']);
 $rows=crmQuery($db,"SELECT p.id,p.name,p.brand,p.category_path,p.visible,".($v3?'p.pim_publication_state,':"'LEGACY' pim_publication_state,")."(SELECT COUNT(*) FROM variants v WHERE v.product_id=p.id) skus,".($v3?"(SELECT COUNT(DISTINCT v.pim_color_id) FROM variants v WHERE v.product_id=p.id)":'1')." colors,".($v3?"(SELECT SUM(v.pim_effective_availability='IN_STOCK') FROM variants v WHERE v.product_id=p.id)":"(SELECT SUM(v.availability='in') FROM variants v WHERE v.product_id=p.id)")." in_stock,(SELECT MIN(CAST(JSON_EXTRACT(cp.policy_json,'$.price_cents') AS UNSIGNED)) FROM rubizh_catalog_pricing cp WHERE cp.product_id=p.id) price_minor,(SELECT COALESCE(SUM(f.qty),0) FROM rubizh_order_fulfillment_lines f JOIN rubizh_customer_orders o ON o.id=f.order_id WHERE f.product_id=p.id AND o.created_at>=? AND o.created_at<? AND o.status<>'cancelled') sold_qty FROM products p WHERE $where ORDER BY p.visible DESC,p.name LIMIT {$p['limit']} OFFSET {$p['offset']}",[$per['from'],$per['to'],...$args]);
 foreach($rows as &$r){$r['visible']=(int)$r['visible'];$r['skus']=(int)$r['skus'];$r['colors']=(int)$r['colors'];$r['in_stock']=(int)$r['in_stock'];$r['price_minor']=$r['price_minor']===null?null:(int)$r['price_minor'];$r['sold_qty']=(float)$r['sold_qty'];}unset($r);
 return ['rows'=>$rows,'pagination'=>crmPagination($p,$total),'period'=>$per];
}
function crmProduct(PDO $db,string $id): array {
 $v3=!empty($GLOBALS['rubizh_pim_v3_columns']);$product=crmOne($db,'SELECT id,name,brand,category_path,visible,slug'.($v3?',pim_publication_state':'').' FROM products WHERE id=?',[$id]);if(!$product)throw new CrmError('NOT_FOUND',404);
 $variants=crmQuery($db,'SELECT v.sku,v.size,v.color,'.($v3?'v.pim_color_id,v.pim_size_display,v.pim_effective_availability availability,v.pim_stock_quantity stock_quantity,v.pim_payment_allowed,v.pim_delivery_lead_time_days lead_days':"NULL pim_color_id,v.size pim_size_display,v.availability,NULL stock_quantity,NULL pim_payment_allowed,NULL lead_days").',cp.policy_json FROM variants v LEFT JOIN rubizh_catalog_pricing cp ON cp.sku=v.sku AND cp.product_id=v.product_id WHERE v.product_id=? ORDER BY v.sort,v.sku',[$id]);
 foreach($variants as &$v){$pol=$v['policy_json']?json_decode($v['policy_json'],true):null;$v['price_minor']=$pol['price_cents']??null;$v['kit_price_minor']=$pol['kit_cents']??null;unset($v['policy_json']);$v['stock_label']=$v['stock_quantity']===null?'не підтверджено':rtrim(rtrim((string)$v['stock_quantity'],'0'),'.');}unset($v);
 $photo=crmOne($db,"SELECT thumb,file FROM photos WHERE product_id=? AND status='ok' ORDER BY pos LIMIT 1",[$id]);
 $pim=cfg('pim_url');
 return ['product'=>$product+['photo'=>$photo?'/'.ltrim((string)($photo['thumb']?:$photo['file']),'/'):null],'variants'=>$variants,'pim_url'=>is_string($pim)&&preg_match('~^https://~',$pim)?rtrim($pim,'/').'/#product='.rawurlencode($id):null];
}
function crmSuppliers(PDO $db,array $q): array {
 $per=crmPeriod4($q+['period'=>'30d']);$rows=[];
 foreach(npOrigins() as $code=>$o){
  $sender=crmOne($db,'SELECT * FROM rubizh_sender_profiles WHERE code=?',[$code]);$info=crmOne($db,'SELECT contact_person,prep_days FROM rubizh_crm_supplier_info WHERE code=?',[$code]);if($sender&&$info)$sender+=$info;
  $stats=crmOne($db,"SELECT COUNT(DISTINCT f.order_id) orders,SUM(o.status='cancelled') cancelled FROM rubizh_order_fulfillment_lines f JOIN rubizh_customer_orders o ON o.id=f.order_id WHERE f.supplier_code=? AND o.created_at>=? AND o.created_at<?",[$code,$per['from'],$per['to']]);
  $ship=crmOne($db,"SELECT COUNT(*) parcels,AVG(TIMESTAMPDIFF(HOUR,s.created_at,COALESCE((SELECT MIN(t.occurred_at) FROM rubizh_order_timeline t WHERE t.order_id=s.order_id AND t.event='sent' AND t.event_key=s.tracking_number),UTC_TIMESTAMP()))) prep_hours,SUM(s.status IN ('created','draft') AND s.created_at<UTC_TIMESTAMP()-INTERVAL 48 HOUR) late_parcels FROM rubizh_order_shipments s WHERE s.supplier_code=? AND s.created_at>=? AND s.created_at<?",[$code,$per['from'],$per['to']]);
  $products=(int)crmOne($db,"SELECT COUNT(DISTINCT product_id) n FROM rubizh_catalog_fulfillment WHERE supplier_name=? OR supplier_name=?",[$o['name'],$code])['n'];
  $rows[]=['code'=>$code,'name'=>$o['name'],'city'=>$sender['city']??$o['city'],'branch'=>$sender['branch']??$o['branch'],'sender_confirmed'=>(bool)($sender['confirmed']??false),'contact_person'=>$sender['contact_person']??null,'prep_days'=>isset($sender['prep_days'])?(int)$sender['prep_days']:null,'phone_masked'=>crmMaskPhone($sender['phone']??null),'products'=>$products,'orders'=>(int)$stats['orders'],'refusal_share'=>(int)$stats['orders']?round((int)$stats['cancelled']/(int)$stats['orders'],3):0,'prep_hours'=>$ship['prep_hours']===null?null:round((float)$ship['prep_hours'],1),'delayed'=>(int)$ship['late_parcels']];
 }
 return ['rows'=>$rows,'period'=>$per];
}
function crmSupplier(PDO $db,string $code): array {
 $o=npOrigins()[$code]??null;if(!$o)throw new CrmError('NOT_FOUND',404);
 $sender=crmOne($db,'SELECT * FROM rubizh_sender_profiles WHERE code=?',[$code]);
 if($sender){$sender['complete']=npSenderProfileComplete($sender);$sender+=crmOne($db,'SELECT contact_person,prep_days FROM rubizh_crm_supplier_info WHERE code=?',[$code])??['contact_person'=>'','prep_days'=>null];}
 return ['supplier'=>['code'=>$code]+$o,'sender'=>$sender,'orders'=>crmQuery($db,"SELECT DISTINCT o.id,o.order_number,o.status,o.created_at FROM rubizh_order_fulfillment_lines f JOIN rubizh_customer_orders o ON o.id=f.order_id WHERE f.supplier_code=? ORDER BY o.id DESC LIMIT 20",[$code]),'products'=>crmQuery($db,"SELECT DISTINCT c.product_id,p.name FROM rubizh_catalog_fulfillment c LEFT JOIN products p ON p.id=c.product_id WHERE c.supplier_name IN (?,?) LIMIT 50",[$o['name'],$code])];
}

// ---- tasks, notifications, views ---------------------------------------------------------------------------------------
function crmTaskRow(array $t): array {$t['id']=(int)$t['id'];$t['order_id']=$t['order_id']===null?null:(int)$t['order_id'];$t['version']=(int)$t['version'];return $t;}
function crmTasks(PDO $db,array $actor,array $q): array {
 $p=crmPage($q);$where=['1=1'];$args=[];$view=$q['view']??'mine';
 if($view==='mine'){$where[]='t.assignee_id=?';$args[]=$actor['id'];$where[]="t.state IN ('OPEN','IN_PROGRESS')";}
 if($view==='all')$where[]="t.state IN ('OPEN','IN_PROGRESS')";
 if($view==='overdue')$where[]="t.state IN ('OPEN','IN_PROGRESS') AND t.due_at<UTC_TIMESTAMP()";
 if($view==='done')$where[]="t.state IN ('DONE','CANCELLED')";
 if(($q['order_id']??'')!==''){$where[]='t.order_id=?';$args[]=(int)$q['order_id'];}
 $w=implode(' AND ',$where);$total=(int)crmOne($db,"SELECT COUNT(*) n FROM rubizh_crm_tasks t WHERE $w",$args)['n'];
 $rows=crmQuery($db,"SELECT t.*,u.name assignee_name,o.order_number FROM rubizh_crm_tasks t LEFT JOIN rubizh_staff_users u ON u.id=t.assignee_id LEFT JOIN rubizh_customer_orders o ON o.id=t.order_id WHERE $w ORDER BY t.due_at IS NULL,t.due_at,t.id DESC LIMIT {$p['limit']} OFFSET {$p['offset']}",$args);
 return ['rows'=>array_map('crmTaskRow',$rows),'pagination'=>crmPagination($p,$total)];
}
function crmTaskCreate(PDO $db,array $actor,array $b): array {
 if(isset($b['order_id']))crmOrder($db,$b['order_id'],$actor);
 if(isset($b['assignee_id'])&&!crmOne($db,'SELECT id FROM rubizh_staff_users WHERE id=? AND enabled=1',[$b['assignee_id']]))throw new CrmError('INVALID_ASSIGNEE',400);
 if(isset($b['due_at'])){$d=DateTimeImmutable::createFromFormat(strlen($b['due_at'])===10?'!Y-m-d':'!Y-m-d H:i',$b['due_at'],new DateTimeZone('Europe/Kyiv'));$e=DateTimeImmutable::getLastErrors();if(!$d||($e&&($e['warning_count']||$e['error_count'])))throw new CrmError('INVALID_REQUEST',400,['fields'=>['$.due_at']]);}
 $due=isset($b['due_at'])?(new DateTimeImmutable($b['due_at'].(strlen($b['due_at'])===10?' 18:00':''),new DateTimeZone('Europe/Kyiv')))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s'):null;
 $db->prepare("INSERT INTO rubizh_crm_tasks(title,body,order_id,assignee_id,state,due_at,created_by,created_at,updated_at) VALUES(?,?,?,?,'OPEN',?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())")->execute([trim($b['title']),trim((string)($b['body']??'')),$b['order_id']??null,$b['assignee_id']??$actor['id'],$due,$actor['id']]);
 $id=(int)$db->lastInsertId();crmAudit($db,$actor,'task',(string)$id,'task.create',[],['title'=>$b['title'],'order_id'=>$b['order_id']??null]);
 if(($b['assignee_id']??$actor['id'])!==$actor['id'])crmNotify($db,'staff:'.$b['assignee_id'],'task','task',(string)$id,'Нове завдання: '.mb_substr($b['title'],0,120),false,'task:'.$id);
 return crmTaskRow(crmOne($db,'SELECT * FROM rubizh_crm_tasks WHERE id=?',[$id]));
}
function crmTaskUpdate(PDO $db,array $actor,int $id,array $b): array {
 $t=crmOne($db,'SELECT * FROM rubizh_crm_tasks WHERE id=?',[$id]);if(!$t)throw new CrmError('NOT_FOUND',404);
 // R4-12: a task is changed by its assignee, its author or the OWNER; a new assignee must be an active staff member.
 if($actor['role']!=='OWNER'&&!in_array($actor['id'],[$t['assignee_id'],$t['created_by']],true))throw new CrmError('PERMISSION_DENIED',403);
 if(array_key_exists('assignee_id',$b)&&$b['assignee_id']!==null&&!crmOne($db,'SELECT id FROM rubizh_staff_users WHERE id=? AND enabled=1',[$b['assignee_id']]))throw new CrmError('INVALID_ASSIGNEE',400);
 if((int)$t['version']!==$b['version'])throw new CrmError('STALE_ORDER',409);
 $state=$b['state']??$t['state'];$assignee=array_key_exists('assignee_id',$b)?$b['assignee_id']:$t['assignee_id'];
 $q=$db->prepare('UPDATE rubizh_crm_tasks SET state=?,assignee_id=?,version=version+1,updated_at=UTC_TIMESTAMP() WHERE id=? AND version=?');$q->execute([$state,$assignee,$id,$b['version']]);if(!$q->rowCount())throw new CrmError('STALE_ORDER',409);
 crmAudit($db,$actor,'task',(string)$id,'task.update',['state'=>$t['state'],'assignee_id'=>$t['assignee_id']],['state'=>$state,'assignee_id'=>$assignee]);
 return crmTaskRow(crmOne($db,'SELECT * FROM rubizh_crm_tasks WHERE id=?',[$id]));
}
function crmTasksAutoClose(PDO $db,string $prefix): void {$db->prepare("UPDATE rubizh_crm_tasks SET state='DONE',version=version+1,updated_at=UTC_TIMESTAMP() WHERE auto_key LIKE ? AND state IN ('OPEN','IN_PROGRESS')")->execute([$prefix.'%']);}
/** Audience: role:<ROLE> or staff:<id>; dedupe_key makes every producer idempotent. */
function crmNotify(PDO $db,string $audience,string $kind,string $entity,string $entityId,string $title,bool $critical,string $dedupe): void {
 if(!crmApiTableExists($db,'rubizh_crm_notifications'))return;
 $db->prepare('INSERT IGNORE INTO rubizh_crm_notifications(audience,kind,entity,entity_id,title,critical,dedupe_key,created_at) VALUES(?,?,?,?,?,?,?,UTC_TIMESTAMP())')->execute([$audience,$kind,$entity,$entityId,mb_substr($title,0,240),(int)$critical,mb_substr($dedupe,0,160)]);
}
function crmNotificationAudience(array $actor): array {return ['role:'.$actor['role'],'staff:'.$actor['id'],'role:ALL'];}
function crmNotifications(PDO $db,array $actor,array $q): array {
 $p=crmPage($q);$aud=crmNotificationAudience($actor);$m=implode(',',array_fill(0,count($aud),'?'));
 $total=(int)crmOne($db,"SELECT COUNT(*) n FROM rubizh_crm_notifications WHERE audience IN ($m)",$aud)['n'];
 $unread=(int)crmOne($db,"SELECT COUNT(*) n FROM rubizh_crm_notifications n LEFT JOIN rubizh_crm_notification_reads r ON r.notification_id=n.id AND r.staff_id=? WHERE n.audience IN ($m) AND r.notification_id IS NULL",[$actor['id'],...$aud])['n'];
 $rows=crmQuery($db,"SELECT n.*,r.read_at FROM rubizh_crm_notifications n LEFT JOIN rubizh_crm_notification_reads r ON r.notification_id=n.id AND r.staff_id=? WHERE n.audience IN ($m)".(($q['view']??'')==='unread'?' AND r.notification_id IS NULL':'')." ORDER BY n.id DESC LIMIT {$p['limit']} OFFSET {$p['offset']}",[$actor['id'],...$aud]);
 foreach($rows as &$r){$r['id']=(int)$r['id'];$r['critical']=(bool)$r['critical'];$r['read']=$r['read_at']!==null;unset($r['dedupe_key'],$r['mailed_at']);}unset($r);
 return ['rows'=>$rows,'unread'=>$unread,'pagination'=>crmPagination($p,$total)];
}
function crmNotificationsRead(PDO $db,array $actor,array $b): array {
 $aud=crmNotificationAudience($actor);$m=implode(',',array_fill(0,count($aud),'?'));
 if(($b['all']??false)===true)$db->prepare("INSERT IGNORE INTO rubizh_crm_notification_reads(notification_id,staff_id,read_at) SELECT id,?,UTC_TIMESTAMP() FROM rubizh_crm_notifications WHERE audience IN ($m)")->execute([$actor['id'],...$aud]);
 foreach($b['ids']??[] as $id)$db->prepare("INSERT IGNORE INTO rubizh_crm_notification_reads(notification_id,staff_id,read_at) SELECT id,?,UTC_TIMESTAMP() FROM rubizh_crm_notifications WHERE id=? AND audience IN ($m)")->execute([$actor['id'],$id,...$aud]);
 return ['done'=>true];
}
function crmViewSave(PDO $db,array $actor,array $b): array {
 if((int)crmOne($db,'SELECT COUNT(*) n FROM rubizh_crm_saved_views WHERE staff_id=?',[$actor['id']])['n']>=50)throw new CrmError('VIEW_LIMIT',409);
 parse_str($b['query'],$parsed);foreach($parsed as $v)if(!is_string($v))throw new CrmError('INVALID_REQUEST',400);
 $db->prepare('INSERT INTO rubizh_crm_saved_views(staff_id,scope,name,query,created_at) VALUES(?,?,?,?,UTC_TIMESTAMP())')->execute([$actor['id'],$b['scope']??'orders',trim($b['name']),$b['query']]);
 return ['id'=>(int)$db->lastInsertId(),'name'=>trim($b['name']),'query'=>$b['query'],'scope'=>$b['scope']??'orders'];
}
function crmViewDelete(PDO $db,array $actor,int $id): array {$db->prepare('DELETE FROM rubizh_crm_saved_views WHERE id=? AND staff_id=?')->execute([$id,$actor['id']]);return ['done'=>true];}

// ---- staff (OWNER, step-up in router) ----------------------------------------------------------------------------------
function crmStaffList(PDO $db): array {
 $rows=crmQuery($db,"SELECT u.id,u.email,u.name,u.role,u.enabled,u.session_version,u.created_at,t.enabled_at totp_enabled_at,(SELECT MAX(s.seen_at) FROM rubizh_staff_sessions s WHERE s.staff_id=u.id) last_seen,(SELECT COUNT(*) FROM rubizh_staff_sessions s WHERE s.staff_id=u.id AND s.revoked_at IS NULL AND s.seen_at>UTC_TIMESTAMP()-INTERVAL 12 HOUR) sessions FROM rubizh_staff_users u LEFT JOIN rubizh_staff_totp t ON t.staff_id=u.id ORDER BY u.enabled DESC,u.name");
 foreach($rows as &$r){$r['enabled']=(int)$r['enabled'];$r['session_version']=(int)$r['session_version'];$r['sessions']=(int)$r['sessions'];$r['totp_enabled']=$r['totp_enabled_at']!==null;}unset($r);
 return ['rows'=>$rows,'invites'=>crmQuery($db,"SELECT id,kind,email,name,role,expires_at,created_at FROM rubizh_staff_invites WHERE used_at IS NULL AND expires_at>UTC_TIMESTAMP() ORDER BY id DESC LIMIT 50")];
}
function crmStaffInvite(PDO $db,array $actor,array $b): array {
 $email=mb_strtolower(trim($b['email']));if(!filter_var($email,FILTER_VALIDATE_EMAIL))throw new CrmError('INVALID_REQUEST',400,['fields'=>['$.email']]);
 if(crmOne($db,'SELECT id FROM rubizh_staff_users WHERE email=?',[$email]))throw new CrmError('STAFF_EXISTS',409);
 $r=crmTokenIssue($db,$actor,'invite',['email'=>$email,'name'=>trim($b['name']),'role'=>$b['role']]);
 crmAudit($db,$actor,'staff',hash('sha256',$email),'staff.invite',[],['email'=>$email,'role'=>$b['role'],'delivery'=>$r['delivery']],$b['reason']);
 return $r;
}
function crmStaffTarget(PDO $db,string $id): array {$u=crmOne($db,'SELECT id,email,name,role,enabled,session_version FROM rubizh_staff_users WHERE id=?',[$id]);if(!$u)throw new CrmError('NOT_FOUND',404);return $u;}
function crmStaffUpdate(PDO $db,array $actor,string $id,array $b): array {
 return crmTransaction($db,function()use($db,$actor,$id,$b){
  $u=crmOne($db,'SELECT id,email,name,role,enabled,session_version FROM rubizh_staff_users WHERE id=? FOR UPDATE',[$id]);if(!$u)throw new CrmError('NOT_FOUND',404);
  if((int)$u['session_version']!==$b['session_version'])throw new CrmError('STALE_ORDER',409);
  $role=$b['role']??$u['role'];$enabled=array_key_exists('enabled',$b)?$b['enabled']:(bool)$u['enabled'];$name=trim($b['name']??$u['name']);
  if($u['role']==='OWNER'&&($role!=='OWNER'||!$enabled)&&count(crmQuery($db,"SELECT id FROM rubizh_staff_users WHERE role='OWNER' AND enabled=1 FOR UPDATE"))<=1)throw new CrmError('LAST_OWNER_REQUIRED',409);
  // Deactivation and role change end every session of that person immediately.
  $db->prepare('UPDATE rubizh_staff_users SET name=?,role=?,enabled=?,session_version=session_version+1,updated_at=UTC_TIMESTAMP() WHERE id=?')->execute([$name,$role,(int)$enabled,$id]);crmSessionsRevoke($db,$id);
  if($role!==$u['role']&&crmTotpRequired(crmRoleAlias($role))&&!crmTotpEnabled($db,$id))crmEnrollGrant($db,$id,$actor['id']);
  if(!$enabled)$db->prepare('UPDATE rubizh_order_assignments SET staff_id=NULL,assigned_by=?,updated_at=UTC_TIMESTAMP() WHERE staff_id=?')->execute([$actor['id'],$id]);
  crmAudit($db,$actor,'staff',$id,'staff.update',['role'=>$u['role'],'enabled'=>(bool)$u['enabled'],'name'=>$u['name']],['role'=>$role,'enabled'=>$enabled,'name'=>$name],$b['reason']);
  return crmStaffTarget($db,$id)+['permissions'=>crmRolePermissions($role)];
 });
}
function crmStaffReset(PDO $db,array $actor,string $id,string $reason): array {
 $u=crmStaffTarget($db,$id);$r=crmTokenIssue($db,$actor,'reset',['id'=>$id,'email'=>$u['email'],'name'=>$u['name'],'role'=>$u['role']]);
 crmAudit($db,$actor,'staff',$id,'staff.reset_password',[],['delivery'=>$r['delivery']],$reason);return $r;
}
function crmStaffForceLogout(PDO $db,array $actor,string $id,string $reason): array {
 $db->prepare('UPDATE rubizh_staff_users SET session_version=session_version+1,updated_at=UTC_TIMESTAMP() WHERE id=?')->execute([$id]);crmSessionsRevoke($db,$id);
 crmAudit($db,$actor,'staff',$id,'staff.force_logout',[],['sessions_revoked'=>true],$reason);
 return crmStaffTarget($db,$id)+['permissions'=>[]];
}

// ---- settings and search ---------------------------------------------------------------------------------------------
function crmSettingsView(PDO $db,array $actor): array {
 $owner=crmCan($actor,'settings.system');
 return ['personal'=>['name'=>$actor['name'],'email'=>$actor['email'],'theme'=>$actor['theme'],'totp_enabled'=>$actor['totp_enabled'],'totp_required'=>$actor['totp_required']],'system'=>$owner?crmSettingsValues($db):null,'flags'=>crmFlags()+['np_ttn_enabled'=>cfg('np_ttn_enabled')===true],
  'staff'=>$owner?crmQuery($db,'SELECT id,email,name,role,enabled,session_version FROM rubizh_staff_users ORDER BY name'):crmQuery($db,'SELECT id,name,role FROM rubizh_staff_users WHERE enabled=1 ORDER BY name'),
  'sender_profiles'=>crmCan($actor,'supplier.view')?crmQuery($db,'SELECT code,name,city,region,branch,cargo_branch,city_ref,warehouse_ref,cargo_warehouse_ref,sender_ref,contact_ref,phone,confirmed,version FROM rubizh_sender_profiles ORDER BY name'):[],'permissions'=>$actor['permissions']];
}
function crmSettingsSave(PDO $db,array $actor,array $b): array {
 $old=crmSettingsValues($db);
 foreach($b as $k=>$v)$db->prepare('INSERT INTO rubizh_crm_settings(k,v,updated_by,updated_at) VALUES(?,?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE v=VALUES(v),updated_by=VALUES(updated_by),updated_at=VALUES(updated_at)')->execute([$k,(string)$v,$actor['id']]);
 crmAudit($db,$actor,'settings','system','settings.update',array_intersect_key($old,$b),$b);
 return crmSettingsView($db,$actor);
}
/** ⌘K (ТЗ 7.16): order number, phone (partial), name, email, TTN, SKU — filtered by the actor's permissions. */
function crmSearch(PDO $db,array $actor,string $q): array {
 $q=trim($q);$empty=['orders'=>[],'customers'=>[],'shipments'=>[],'products'=>[]];if(mb_strlen($q)<2)return $empty;
 $orders=array_map(fn($o)=>['id'=>$o['id'],'number'=>$o['number'],'customer'=>$o['customer']['name'],'display'=>$o['display']??null],crmOrders($db,['q'=>$q,'limit'=>8],$actor)['rows']);
 $customers=crmCan($actor,'customer.view')?array_map(fn($c)=>['id'=>$c['id'],'name'=>$c['name'],'phone_masked'=>$c['phone_masked'],'email'=>$c['email']],crmCustomers4($db,$actor,['q'=>$q,'limit'=>5])['rows']):[];
 $ships=crmCan($actor,'shipment.view')?array_map(fn($s)=>['id'=>(int)$s['id'],'tracking_number'=>$s['tracking_number'],'order_number'=>$s['order_number'],'status'=>$s['status']],crmList($db,'shipments',['q'=>$q,'limit'=>5,'_contact'=>crmCan($actor,'order.search.contact')])['rows']):[];
 $products=array_map(fn($p)=>['id'=>$p['id'],'name'=>$p['name'],'skus'=>$p['skus']],crmProducts($db,['q'=>$q,'limit'=>5])['rows']);
 return ['orders'=>$orders,'customers'=>$customers,'shipments'=>$ships,'products'=>$products];
}

// ---- CSV export (ТЗ 7.17): UTF-8 BOM, role masks, audit, formula-injection safe ----------------------------------------
function crmCsvCell(mixed $v): string {$s=(string)($v??'');if(preg_match('/^[\s]*[=+\-@]/u',$s)||($s!==''&&in_array($s[0],["\t","\r","\n"],true)))$s="'".$s;return '"'.str_replace('"','""',$s).'"';}
function crmCsvOut(string $name,array $head,array $rows): never {
 header('Content-Type: text/csv; charset=UTF-8');header('Content-Disposition: attachment; filename="'.$name.'-'.gmdate('Ymd-His').'.csv"');http_response_code(200);
 echo "\xEF\xBB\xBF".implode(';',array_map('crmCsvCell',$head))."\r\n";foreach($rows as $r)echo implode(';',array_map('crmCsvCell',$r))."\r\n";exit;
}
function crmExportOrders(PDO $db,array $actor,array $q): never {
 $finance=crmCan($actor,'export.finance');$rows=[];$page=1;
 do{$r=crmOrders($db,['limit'=>100,'page'=>(string)$page]+$q,$actor);foreach($r['rows'] as $o)$rows[]=array_merge([$o['number'],crmKyiv($o['created_at']),$o['customer']['name'],(string)($o['customer']['phone_masked']??''),$o['display']['order']['label'],$o['display']['payment']['label'],$o['display']['delivery']['label'],$o['assigned_manager']['name']??'',$o['channel']??'web'],$finance?[number_format(($o['total_minor']??0)/100,2,'.','')]:[]);$page++;}while($page<=$r['pagination']['pages']&&$page<=200);
 crmAudit($db,$actor,'export','orders','export.orders',[],['rows'=>count($rows),'finance'=>$finance,'filters'=>$q]);
 crmCsvOut('orders',array_merge(['Номер','Створено (Київ)','Клієнт','Телефон','Замовлення','Оплата','Доставка','Менеджер','Канал'],$finance?['Сума, грн']:[]),$rows);
}
function crmExportPayments(PDO $db,array $actor,array $q): never {
 $rows=[];$page=1;do{$r=crmPayments($db,$actor,['limit'=>'100','page'=>(string)$page]+$q);foreach($r['rows'] as $p)$rows[]=[$p['order_number'],$p['invoice_id']??'',number_format(($p['amount']??0)/100,2,'.',''),$p['status']??($p['method']??''),$p['refund_status']??'',$p['created_at']??''];$page++;}while($page<=$r['pagination']['pages']&&$page<=200);
 crmAudit($db,$actor,'export','payments','export.payments',[],['rows'=>count($rows)]);
 crmCsvOut('payments',['Замовлення','Рахунок MonoPay','Сума, грн','Статус','Повернення','Створено (UTC)'],$rows);
}
function crmExportCustomers(PDO $db,array $actor,array $q,bool $full,string $reason): never {
 $rows=[];$page=1;do{$r=crmCustomers($db,['limit'=>100,'page'=>$page]+array_intersect_key($q,['q'=>1]));foreach($r['rows'] as $c)$rows[]=[$c['name'],$full?($c['phone']??''):crmMaskPhone($c['phone']??null),$full?$c['email']:preg_replace('/^(.).*(@.*)$/u','$1***$2',(string)$c['email']),$c['orders'],$c['source']];$page++;}while($page<=$r['pagination']['pages']&&$page<=500);
 crmAudit($db,$actor,'export','customers',$full?'export.customers_full':'export.customers',[],['rows'=>count($rows),'full'=>$full],$reason);
 crmCsvOut($full?'customers-full':'customers',['Ім’я','Телефон','Email','Замовлень','Джерело'],$rows);
}

// ---- D-54 wholesale requests (SITE table; empty until its migration) ---------------------------------------------------
/** OD-4.6: the request row as the CRM shows it — masked phone, assignee and the order made from it. */
function crmWholesaleRows(PDO $db,string $where,array $args,string $tail=''): array {
 $rows=crmQuery($db,"SELECT w.id,w.number,w.name,w.phone,w.buyer_type,w.tax_id,w.email,w.kits,w.composition,w.priority,w.state,w.manager_note,w.created_at,w.updated_at,w.assigned_to,u.name AS assignee_name,w.order_id,o.order_number FROM rubizh_wholesale_requests w LEFT JOIN rubizh_staff_users u ON u.id=w.assigned_to LEFT JOIN rubizh_customer_orders o ON o.id=w.order_id WHERE $where ORDER BY w.id DESC $tail",$args);
 foreach($rows as &$r){$r['id']=(int)$r['id'];$r['phone_masked']=crmMaskPhone($r['phone']??null);$r['assignee']=$r['assigned_to']?['id'=>$r['assigned_to'],'name'=>(string)$r['assignee_name']]:null;$r['order']=$r['order_id']?['id'=>(int)$r['order_id'],'number'=>(string)$r['order_number']]:null;unset($r['phone'],$r['assigned_to'],$r['assignee_name'],$r['order_id'],$r['order_number']);}unset($r); // R4-05: full number only via the audited reveal
 return $rows;
}
function crmWholesaleNeed(PDO $db,int $id): array {
 if(!crmApiTableExists($db,'rubizh_wholesale_requests'))throw new CrmError('NOT_FOUND',404);
 $r=crmOne($db,'SELECT * FROM rubizh_wholesale_requests WHERE id=?',[$id]);if(!$r)throw new CrmError('NOT_FOUND',404);return $r;
}
function crmWholesaleList(PDO $db,array $q): array {
 $p=crmPage($q);if(!crmApiTableExists($db,'rubizh_wholesale_requests'))return ['rows'=>[],'pagination'=>crmPagination($p,0)];
 $total=(int)crmOne($db,'SELECT COUNT(*) n FROM rubizh_wholesale_requests')['n'];
 return ['rows'=>crmWholesaleRows($db,'1=1',[],"LIMIT {$p['limit']} OFFSET {$p['offset']}"),'pagination'=>crmPagination($p,$total)];
}
function crmWholesaleDetail(PDO $db,int $id): array {
 crmWholesaleNeed($db,$id);
 $history=crmQuery($db,"SELECT a.action,u.name AS actor,a.created_at FROM rubizh_staff_audit a LEFT JOIN rubizh_staff_users u ON u.id=a.actor_id WHERE a.entity='wholesale' AND a.entity_id=? ORDER BY a.id DESC LIMIT 100",[(string)$id]);
 return ['request'=>crmWholesaleRows($db,'w.id=?',[$id])[0],'notes'=>array_map(fn($n)=>['id'=>(int)$n['id'],'body'=>$n['body'],'author'=>$n['author'],'created_at'=>$n['created_at']],crmNotes($db,'wholesale',(string)$id)),'history'=>$history];
}
function crmWholesalePhone(PDO $db,array $actor,int $id): array {
 if(!crmApiTableExists($db,'rubizh_wholesale_requests'))throw new CrmError('NOT_FOUND',404);
 $r=crmOne($db,'SELECT phone FROM rubizh_wholesale_requests WHERE id=?',[$id]);if(!$r)throw new CrmError('NOT_FOUND',404);
 crmRevealQuota($db,$actor);crmAudit($db,$actor,'wholesale',(string)$id,'wholesale.phone_view',[],['viewed'=>true]);return ['phone'=>$r['phone']];
}
function crmWholesaleUpdate(PDO $db,array $actor,int $id,array $b): array {
 $r=crmWholesaleNeed($db,$id);$assignee=array_key_exists('assignee',$b)?$b['assignee']:$r['assigned_to'];
 if($assignee!==null&&$assignee!==$r['assigned_to']&&!crmOne($db,"SELECT id FROM rubizh_staff_users WHERE id=? AND enabled=1 AND role IN ('OWNER','MANAGER')",[$assignee]))throw new CrmError('INVALID_ASSIGNEE',400);
 $db->prepare('UPDATE rubizh_wholesale_requests SET state=?,manager_note=?,assigned_to=?,updated_at=UTC_TIMESTAMP() WHERE id=?')->execute([$b['state'],(string)($b['note']??$r['manager_note']),$assignee,$id]);
 crmAudit($db,$actor,'wholesale',(string)$id,'wholesale.update',['state'=>$r['state'],'assignee'=>$r['assigned_to']],['state'=>$b['state'],'assignee'=>$assignee]);
 $w=crmWholesaleRows($db,'w.id=?',[$id])[0];return ['id'=>$w['id'],'number'=>$w['number'],'state'=>$w['state'],'assignee'=>$w['assignee'],'order'=>$w['order']];
}
/**
 * OD-4.6: an order made from a wholesale request. The buyer (name, phone, e-mail) comes from the request; lines, prices,
 * stock and delivery go through the same SITE order service as a telephone order (shopCreateOrder → shopValidateOrder).
 * One order per request; a repeated attempt with the same key returns the same order.
 */
function crmWholesaleOrder(PDO $db,array $actor,int $id,array $b,string $key): array {
 crmPermit($actor,'order.create');$lock='rubizh_ws_order_'.$id;
 if((int)$db->query("SELECT GET_LOCK(".$db->quote($lock).",10)")->fetchColumn()!==1)throw new CrmError('BUSY',409);
 try{
  $r=crmWholesaleNeed($db,$id);
  // The order's external key belongs to the request, not to the attempt: an order half-linked by a failed attempt is
  // found again by any retry, and a key used elsewhere can never attach a foreign order (review of stage 4.1).
  $orderKey=substr(hash('sha256','wholesale-order|'.$id),0,32);
  if($r['order_id']){if(crmOne($db,"SELECT 1 FROM rubizh_staff_audit WHERE entity='wholesale' AND entity_id=? AND action='wholesale.order' AND request_id=?",[(string)$id,$key]))return crmOrderCard($db,(int)$r['order_id'],$actor);throw new CrmError('ALREADY_ORDERED',409,['order_id'=>(int)$r['order_id']]);}
  $comment=trim('Оптова заявка '.$r['number'].'. '.(string)($b['comment']??''));
  $card=crmPhoneOrder($db,$actor,['customer'=>['name'=>$r['name'],'phone'=>$r['phone'],'email'=>$r['email'],'recipient'=>(string)($b['recipient']??'')],'lines'=>$b['lines'],'delivery'=>$b['delivery'],'payment'=>$b['payment']??'invoice','channel'=>'other','comment'=>mb_substr($comment,0,1000)]+(isset($b['expected_total_minor'])?['expected_total_minor'=>$b['expected_total_minor']]:[]),$orderKey);
  $db->prepare("UPDATE rubizh_wholesale_requests SET order_id=?,state=IF(state='NEW','IN_PROGRESS',state),assigned_to=COALESCE(assigned_to,?),updated_at=UTC_TIMESTAMP() WHERE id=?")->execute([$card['id'],in_array($actor['role'],['OWNER','MANAGER'],true)?$actor['id']:null,$id]);
  crmAudit($db,$actor,'wholesale',(string)$id,'wholesale.order',['state'=>$r['state']],['order_id'=>(int)$card['id']],'',$key);
  return $card;
 }finally{$db->query("SELECT RELEASE_LOCK(".$db->quote($lock).")");}
}
