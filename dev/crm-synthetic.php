<?php
declare(strict_types=1);
// Stage 4 synthetic stand data (ТЗ §9): orders in every state, produced by the same SITE/CRM functions staff use —
// shopCreateOrder (web) and the Staff API handlers (phone orders, confirm, invoice, packing, TTN, tracking, completion,
// cancellation, refund, returns, problems, assignments, notes, tasks). Payments arrive as MonoPay webhook events of the
// staging mock bank (A3); TTN and tracking come from the NP mock (A4). Optional --bulk clones the generated orders for
// the 50 000-order list performance check (clones are for timing only; their cards are not a business scenario).
//
// Staging only: refuses to run unless environment=staging with mono_mock and np_mock on. Never run on production.
//   php dev/crm-synthetic.php --orders=520 [--bulk=50000] [--seed=42]
//
// Synthetic buyers use @synthetic.rubizh.test e-mails and +38067… numbers; nothing is sent (no SMS/e-mail live flags).

// The Staff API bootstrap (as api/staff/index.php): shop, NP, MonoPay and CRM handlers in one process.
require_once dirname(__DIR__).'/staff/bootstrap.php';require_once dirname(__DIR__).'/shop/np-mock.php';

const SYN_DOMAIN='synthetic.rubizh.test';
// Target mix (sums to 100). Each scenario ends in a different CRM display state.
const SYN_MIX=['awaiting_confirmation'=>7,'awaiting_payment'=>8,'invoice_waiting'=>5,'invoice_review'=>3,'paid'=>8,'packing'=>7,'in_transit'=>11,'delivered'=>7,'completed'=>12,'multi_parcel'=>4,'cancelled'=>7,'refunded'=>4,'partial_refund'=>4,'problem'=>3,'returned'=>3,'payment_review'=>2,'disputed_event'=>2,'ttn_unknown'=>3];
// Two buyer accounts (A/B) own part of the web orders; the rest are guest checkouts.
const SYN_BUYERS=['a'=>['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa01','+380670000001','Покупець А'],'b'=>['bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb02','+380670000002','Покупець Б']];

function synGuard(): void {
    if(PHP_SAPI!=='cli')throw new RuntimeException('CLI only.');
    if(cfg('environment')!=='staging'||!monoMockEnabled()||!npMockEnabled())throw new RuntimeException('Synthetic data needs the staging stand: environment=staging, mono_mock=true, np_mock=true.');
    foreach(['crm_refund_live','crm_np_ttn_live','crm_np_tracking_live','crm_sms_live','crm_email_live'] as $flag)if(cfg($flag)===true)throw new RuntimeException("Live flag $flag is on: synthetic data is refused.");
}
/** One Staff API action, validated against the contract and executed by the same handler as the HTTP router. */
function synCall(PDO $db,array $actor,string $method,string $path,array $body=[]): mixed {
    // The operator acts as this staff member with a fresh login (same as crmActor() after a re-login on the stand).
    $GLOBALS['crm_staff_actor']=$actor;$_SESSION['staff_fresh_at']=time();$GLOBALS['syn_step']=$method.' '.$path;$m=crmRouteMatch($method,$path);if(!$m)throw new RuntimeException("Unknown route $method $path");[$route,$params]=$m;
    if(($route['version']??'')==='required'&&!isset($body['expected_version'])&&isset($params['id'])&&str_starts_with($path,'/orders/'))$body['expected_version']=synOrder($db,$actor,(int)$params['id'])['version'];
    if($route['permission']!==null)crmPermit($actor,$route['permission']);
    crmValidateBody($route,json_decode(json_encode($body?:new stdClass(),JSON_THROW_ON_ERROR)));
    $key=!empty($route['idempotent'])?bin2hex(random_bytes(16)):null;$GLOBALS['crm_idempotency_key']=$key;
    return crmHandle($db,$actor,$route,$params,$body,[],$key);
}
function synOrder(PDO $db,array $actor,int $id): array {return crmOrderCard($db,$id,$actor);}
function synActor(PDO $db,string $role): ?array {
    $a=crmOne($db,"SELECT id,email,name,role,enabled,session_version FROM rubizh_staff_users WHERE enabled=1 AND role IN (?,?) ORDER BY created_at,id LIMIT 1",[$role,['WAREHOUSE'=>'LOGISTICS','SUPPORT'=>'READ_ONLY'][$role]??$role]);
    if(!$a)return null;$a['role']=crmRoleAlias($a['role']);unset($a['enabled'],$a['session_version']);
    return $a+['theme'=>'light','totp_enabled'=>false,'totp_required'=>false,'permissions'=>crmRolePermissions($a['role']),'fresh_until'=>null];
}
/** Purchasable catalogue lines (published, priced, orderable); in-stock and on-request kept apart. */
function synAccounts(PDO $db): void {
    foreach(SYN_BUYERS as [$id,$phone,$name]){
        $db->prepare("INSERT IGNORE INTO rubizh_accounts(id,email,first_name,last_name,phone,created_at,updated_at) VALUES(?,?,?,'',?,UTC_TIMESTAMP(),UTC_TIMESTAMP())")->execute([$id,substr($id,-2).'@'.SYN_DOMAIN,$name,$phone]);
        $db->prepare("INSERT IGNORE INTO rubizh_customer_identities(provider,subject,customer_id,contact_email,created_at) VALUES('phone',?,?,'',UTC_TIMESTAMP())")->execute([$phone,$id]);
    }
}
/** Staff of every role (ТЗ §9); missing roles are created only when a stand password is given (RUBIZH_SYN_STAFF_PASSWORD). */
function synStaff(PDO $db): array {
    $missing=[];foreach(CRM_ROLES as $role){if(synActor($db,$role))continue;$pw=(string)getenv('RUBIZH_SYN_STAFF_PASSWORD');if($pw===''){$missing[]=$role;continue;}
        crmPasswordPolicy($pw,strtolower($role).'@'.SYN_DOMAIN);$db->prepare('INSERT INTO rubizh_staff_users(id,email,name,password_hash,role,created_at,updated_at) VALUES(?,?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())')->execute([bin2hex(random_bytes(16)),strtolower($role).'@'.SYN_DOMAIN,'Синтетичний '.$role,crmPasswordHash($pw),$role]);}
    return $missing;
}
function synCatalog(PDO $db): array {
    $rows=$db->query("SELECT v.sku,v.product_id,v.pim_color_id color_id,v.pim_payment_allowed pay FROM variants v JOIN products p ON p.id=v.product_id WHERE p.visible=1 AND p.pim_publication_state='ACTIVE' AND p.pim_contract_version=3 AND v.pim_active=1 AND v.pim_order_submission_allowed=1 AND v.pim_price_ready=1 AND (v.pim_expires_at IS NULL OR v.pim_expires_at>".(time()*1000).") ORDER BY v.sku LIMIT 400")->fetchAll(PDO::FETCH_ASSOC);
    $out=['in'=>[],'order'=>[],'by_supplier'=>[]];foreach($rows as $r){$l=['product_id'=>$r['product_id'],'color_id'=>(string)$r['color_id'],'sku'=>$r['sku']];$out[(int)$r['pay']===1?'in':'order'][]=$l;
        if((int)$r['pay']===1){$code=npSupplierCode($r['sku'],$r['product_id'],(string)($db->query('SELECT supplier_name FROM rubizh_catalog_fulfillment WHERE sku='.$db->quote($r['sku']).' AND product_id='.$db->quote($r['product_id']))->fetchColumn()?:''));if($code!==''&&!isset($out['by_supplier'][$code]))$out['by_supplier'][$code]=$l;}}
    if(!$out['in'])throw new RuntimeException('No in-stock priced SKU in the stand catalogue.');
    return $out;
}
function synPick(array $list,int $n): array {$out=[];$keys=array_rand($list,min($n,count($list)));foreach((array)$keys as $k)$out[]=$list[$k]+['qty'=>random_int(1,2)];return $out;}
function synBuyer(int $i): array {
    $first=['Олена','Андрій','Ірина','Максим','Наталія','Богдан','Оксана','Тарас','Юлія','Дмитро','Світлана','Ігор'];$last=['Коваленко','Бондар','Ткаченко','Шевчук','Мельник','Кравець','Олійник','Литвин','Савчук','Гнатюк'];
    $name=$first[$i%count($first)].' '.$last[intdiv($i,count($first))%count($last)];
    return ['name'=>$name,'phone'=>'+38067'.str_pad((string)(1000000+$i*37%9000000),7,'0',STR_PAD_LEFT),'email'=>'buyer'.$i.'@'.SYN_DOMAIN,'recipient'=>$name];
}
function synDelivery(int $i): array {$cities=npMockCities();$c=$cities[$i%count($cities)]['Ref'];return ['type'=>'branch','city_ref'=>$c,'warehouse_ref'=>npMockRef('wh:'.$c.':'.(1+$i%5))];}
/** Web order through the website's own service; phone/Instagram orders through the CRM route. Total confirmed like the UI. */
function synCreate(PDO $db,array $actor,int $i,array $lines,string $pay): int {
    $buyer=synBuyer($i);$owner=null;if($i%7===0||$i%7===1){[$owner,$phone,$name]=SYN_BUYERS[$i%7===0?'a':'b'];$buyer=['name'=>$name.' Синтетичний','phone'=>$phone,'email'=>'','recipient'=>$name.' Синтетичний'];}$delivery=synDelivery($i);$channel=['web','web','web','phone','instagram','tiktok','other'][$i%7];$total=null;
    for($attempt=0;$attempt<2;$attempt++){
        try{
            if($channel==='web'){
                $d=npValidateDelivery($db,['np_delivery'=>$delivery],'branch');
                $c=shopOrderContact(['name'=>$buyer['name'],'phone'=>$buyer['phone'],'email'=>$buyer['email'],'recipient'=>$buyer['recipient'],'city'=>$d['city'],'address'=>$d['address'],'delivery_type'=>'branch','comment'=>'']);
                return shopCreateOrder($db,$lines,$c,$d,$pay,['external_id'=>'web:'.bin2hex(random_bytes(16)),'owner'=>$owner,'expected_total'=>$total,'channel'=>'web'])['id'];
            }
            $body=['customer'=>$buyer,'lines'=>array_map(fn($l)=>array_filter($l,fn($v)=>$v!==''),$lines),'delivery'=>$delivery,'channel'=>$channel,'payment'=>$pay];
            if($total!==null)$body['expected_total_minor']=(int)round($total*100);
            return (int)synCall($db,$actor,'POST','/orders',$body)['id'];
        }catch(ShopOrderConflict $e){$total=(float)$e->details['quote']['total'];}
    }
    throw new RuntimeException('Price did not settle for a synthetic order.');
}
function synPay(PDO $db,array $actor,int $id): void {
    $card=synOrder($db,$actor,$id);if(($card['display']['payment']['code']??'')==='PAID')return;
    synCall($db,$actor,'POST',"/orders/$id/invoice",[]);
    $inv=crmOne($db,"SELECT * FROM rubizh_mono_invoices WHERE order_id=? AND invoice_id IS NOT NULL ORDER BY id DESC LIMIT 1",[$id]);if(!$inv)throw new RuntimeException("No bank invoice for order $id");
    $event=['invoiceId'=>$inv['invoice_id'],'status'=>'success','amount'=>(int)$inv['amount'],'ccy'=>980,'modifiedDate'=>gmdate('c')];
    monoApplyEvent($db,$event,hash('sha256',json_encode($event,JSON_THROW_ON_ERROR)),true);
}
function synConfirm(PDO $db,array $actor,int $id): void {
    $card=synOrder($db,$actor,$id);if(!in_array('confirm',$card['actions']??[],true))return;
    synCall($db,$actor,'POST',"/orders/$id/confirm",['availability_confirmed'=>true,'extra_delivery_agreed'=>true]);
}
/** Mock-NP sender profiles must be complete before a TTN (LOG-04); filled once on the stand. */
function synSenders(PDO $db,array $owner): void {
    foreach((synCall($db,$owner,'GET','/settings')['sender_profiles']??[]) as $p){
        if(npSenderProfileComplete($p))continue;$city=npMockCities()[0];
        synCall($db,$owner,'PUT','/settings/senders/'.$p['code'],['name'=>$p['name']?:'Склад '.$p['code']]+array_merge($p,['city'=>$city['Description'],'region'=>$city['AreaDescription'],'branch'=>'1','city_ref'=>$city['Ref'],'warehouse_ref'=>npMockRef('wh:'.$city['Ref'].':1'),'sender_ref'=>npMockRef('sender'),'contact_ref'=>npMockRef('contact'),'phone'=>'+380671234567','confirmed'=>true,'reason'=>'Синтетичний стенд: профіль НП (mock)']));
    }
}
function synShip(PDO $db,array $actor,int $id,string $npStatus,bool $unknown=false): void {
    $card=synOrder($db,$actor,$id);$bySupplier=[];foreach($card['fulfillment_lines'] as $l)$bySupplier[$l['supplier_code']?:''][]=['line_no'=>(int)$l['line_no'],'qty'=>(float)$l['qty']];
    foreach($bySupplier as $code=>$lines){
        if($code==='')throw new RuntimeException("Order $id has a line without supplier");
        $card=synCall($db,$actor,'POST',"/orders/$id/shipments",['supplier_code'=>$code,'availability_confirmed'=>true,'extra_delivery_agreed'=>true,'lines'=>$lines,'package'=>['places'=>[['weight'=>1,'length'=>30,'width'=>20,'height'=>10]]]]);
        $sid=(int)end($card['shipments'])['id'];
        if($unknown){npMockMeta('np_mock_save','unknown');try{synCall($db,$actor,'POST',"/shipments/$sid/create",['expected_version'=>$card['version']]);}catch(Throwable $e){}return;} // NP did not answer (R6)
        $card=synCall($db,$actor,'POST',"/shipments/$sid/create",['expected_version'=>$card['version']]);
        $ttn=(string)crmOne($db,'SELECT tracking_number FROM rubizh_order_shipments WHERE id=?',[$sid])['tracking_number'];
        if($ttn!==''&&$npStatus!=='1'){npMockMeta('np_mock_status_'.$ttn,$npStatus);synCall($db,$actor,'POST',"/shipments/$sid/refresh",['expected_version'=>$card['version']]);}
    }
}
function synRun(array $opt): array {
    synGuard();$db=shopStoreDatabase();crmMigrate($db);mt_srand((int)($opt['seed']??42));
    $owner=synActor($db,'OWNER');if(!$owner)throw new RuntimeException('Create the stand OWNER first (dev/staff-user.php).');
    $managers=array_map(fn($r)=>$r['id'],crmQuery($db,"SELECT id FROM rubizh_staff_users WHERE enabled=1 AND role='MANAGER'"));
    $catalog=synCatalog($db);synSenders($db,$owner);synAccounts($db);$missingRoles=synStaff($db);
    // Every scenario at least once, the rest by weight.
    $n=max(0,(int)($opt['orders']??520));$plan=[];foreach(SYN_MIX as $k=>$w)for($j=0;$j<(int)floor($n*$w/100);$j++)$plan[]=$k;
    $plan=$n?array_merge(array_keys(SYN_MIX),array_slice($plan,0,max(0,$n-count(SYN_MIX)))):[];shuffle($plan);
    $done=[];$errors=[];$start=(int)(crmOne($db,"SELECT COUNT(*) n FROM rubizh_customer_orders WHERE email LIKE ?",['%@'.SYN_DOMAIN])['n']);
    foreach($plan as $k=>$scenario){
        $i=$start+$k;
        try{
            $onRequest=$scenario==='awaiting_confirmation'&&$catalog['order'];$pay=in_array($scenario,['invoice_waiting','invoice_review'],true)?'invoice':'card';
            $lines=$onRequest?synPick($catalog['order'],1):($scenario==='multi_parcel'&&count($catalog['by_supplier'])>1?array_map(fn($l)=>$l+['qty'=>1],array_slice(array_values($catalog['by_supplier']),0,2)):synPick($catalog['in'],random_int(1,3)));
            if($scenario==='awaiting_confirmation'&&!$onRequest)$lines[0]['qty']=shopDirectPayMaxQty($db)+1; // D-52: a large quantity waits for the manager
            $id=synCreate($db,$owner,$i,$lines,$pay);
            if($managers&&$i%5!==0)synCall($db,$owner,'POST',"/orders/$id/assign",['staff_id'=>$managers[$i%count($managers)],'reason'=>'Розподіл синтетичних замовлень']);
            if($scenario!=='awaiting_confirmation')synConfirm($db,$owner,$id);
            switch($scenario){
                case 'awaiting_confirmation':case 'invoice_waiting':break;
                case 'awaiting_payment':synCall($db,$owner,'POST',"/orders/$id/invoice",[]);break;
                case 'invoice_review':
                    // FOP invoice overdue: the lifecycle worker moves it to «потребує звірки виписки» (D-51), not cancelled.
                    $db->prepare('UPDATE rubizh_order_timing SET payment_due=UTC_TIMESTAMP()-INTERVAL 1 HOUR WHERE order_id=?')->execute([$id]);shopLifecycleTick($db,50);break;
                case 'payment_review':
                    // A bank attempt that never got an invoice id (R-C1): shown under «Потребують звірки».
                    $db->prepare("INSERT INTO rubizh_mono_invoices(order_id,reference,amount,status,created_at,updated_at) VALUES(?,?,?,'creating',UTC_TIMESTAMP()-INTERVAL 2 HOUR,UTC_TIMESTAMP()-INTERVAL 2 HOUR)")->execute([$id,'syn-'.bin2hex(random_bytes(6)),(int)round((float)crmOne($db,'SELECT total FROM rubizh_customer_orders WHERE id=?',[$id])['total']*100)]);break;
                case 'cancelled':synCall($db,$owner,'POST',"/orders/$id/cancel",['reason'=>'Покупець відмовився до оплати']);break;
                case 'disputed_event':
                    // A signed bank event that can never match the invoice is parked for the OWNER (CRM-4.1).
                    synCall($db,$owner,'POST',"/orders/$id/invoice",[]);$inv=crmOne($db,'SELECT * FROM rubizh_mono_invoices WHERE order_id=? AND invoice_id IS NOT NULL ORDER BY id DESC LIMIT 1',[$id]);
                    $event=['invoiceId'=>$inv['invoice_id'],'status'=>'success','amount'=>(int)$inv['amount']+100,'ccy'=>980,'modifiedDate'=>gmdate('c')];
                    try{monoApplyEvent($db,$event,hash('sha256',json_encode($event,JSON_THROW_ON_ERROR)),true);}catch(MonoEventRejected $e){}
                    break;
                default:
                    synPay($db,$owner,$id);
                    if($scenario==='paid')break;
                    if($scenario==='refunded'){$inv=crmOne($db,"SELECT id,amount FROM rubizh_mono_invoices WHERE order_id=? AND status='success' ORDER BY id DESC LIMIT 1",[$id]);
                        // Full refund of a paid order through the bank (CRM_REFUND_LIVE off → staging mock bank).
                        synCall($db,$owner,'POST','/payments/'.$inv['id'].'/refund',['amount'=>(int)$inv['amount'],'reason'=>'Повне повернення за відмовою покупця','expected_version'=>synOrder($db,$owner,$id)['version']]);break;}
                    if($scenario==='partial_refund'){$inv=crmOne($db,"SELECT id,amount FROM rubizh_mono_invoices WHERE order_id=? AND status='success' ORDER BY id DESC LIMIT 1",[$id]);
                        synCall($db,$owner,'POST','/payments/'.$inv['id'].'/refund',['amount'=>max(100,intdiv((int)$inv['amount'],3)),'reason'=>'Часткове повернення: один товар не підійшов','expected_version'=>synOrder($db,$owner,$id)['version']]);break;}
                    if($scenario==='problem'){synCall($db,$owner,'POST',"/orders/$id/problem",['flag'=>true,'reason'=>'Покупець не відповідає на дзвінки']);break;}
                    synCall($db,$owner,'POST',"/orders/$id/packing",[]);
                    if($scenario==='packing')break;
                    synShip($db,$owner,$id,$scenario==='in_transit'?'5':'9',$scenario==='ttn_unknown');
                    if($scenario==='completed')synCall($db,$owner,'POST',"/orders/$id/complete",[]);
                    if($scenario==='returned'){$card=synOrder($db,$owner,$id);synCall($db,$owner,'POST','/returns',['order_id'=>$id,'lines'=>[['line_no'=>(int)$card['fulfillment_lines'][0]['line_no'],'qty'=>1]],'reason'=>'Не підійшов розмір','expected_version'=>$card['version']]);}
            }
            if($i%4===0)synCall($db,$owner,'POST',"/orders/$id/note",['body'=>'Синтетична нотатка: уточнити зручний час дзвінка.']);
            if($i%9===0)synCall($db,$owner,'POST','/tasks',['title'=>'Передзвонити покупцю','order_id'=>$id]+($managers?['assignee_id'=>$managers[$i%count($managers)]]:[]));
            // History for analytics: spread creation over the last 180 days.
            $db->prepare('UPDATE rubizh_customer_orders SET created_at=created_at-INTERVAL ? MINUTE WHERE id=?')->execute([random_int(0,180*24*60),$id]);
            $done[$scenario]=($done[$scenario]??0)+1;
        }catch(Throwable $e){$errors[]=$scenario.': '.get_class($e).' '.($e instanceof CrmError?$e->getMessage():'').' '.mb_substr($e->getMessage(),0,160).' @'.basename($e->getFile()).':'.$e->getLine();}
    }
    $out=['created'=>array_sum($done),'by_scenario'=>$done,'errors'=>$errors,'staff_roles_missing'=>$missingRoles,'buyer_accounts'=>array_keys(SYN_BUYERS)];
    if(!empty($opt['bulk']))$out['bulk']=synBulk($db,(int)$opt['bulk']);
    return $out;
}
/**
 * Performance volume: copies the synthetic orders (and the rows the list and counters read) until the store holds
 * $target orders. Unique text keys get a copy suffix; tables with other unique numbers are not copied.
 */
function synBulk(PDO $db,int $target): array {
    $tables=['rubizh_order_details','rubizh_order_assignments','rubizh_order_fulfillment_lines','rubizh_order_timing','rubizh_order_shipments','rubizh_mono_invoices','rubizh_crm_order_flags','rubizh_order_contact_evidence','rubizh_account_orders'];
    $cols=fn(string $t)=>array_column(crmQuery($db,'SELECT COLUMN_NAME c,EXTRA e,DATA_TYPE d,CHARACTER_MAXIMUM_LENGTH l FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION',[$t]),null,'c');
    $uniq=fn(string $t)=>array_column(crmQuery($db,"SELECT COLUMN_NAME c FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND NON_UNIQUE=0 AND INDEX_NAME<>'PRIMARY'",[$t]),'c');
    $base=crmQuery($db,"SELECT id FROM rubizh_customer_orders WHERE email LIKE ? ORDER BY id",['buyer%@'.SYN_DOMAIN]);if(!$base)throw new RuntimeException('Generate synthetic orders first.');
    $min=(int)$base[0]['id'];$max=(int)end($base)['id'];$rounds=0;$t0=microtime(true);$oc=$cols('rubizh_customer_orders');
    while(($have=(int)crmOne($db,'SELECT COUNT(*) n FROM rubizh_customer_orders')['n'])<$target){
        $offset=(int)crmOne($db,'SELECT MAX(id) m FROM rubizh_customer_orders')['m']-$min+1;$rounds++;$limit=$target-$have;
        $db->beginTransaction();
        try{
            $sel=[];foreach($oc as $c=>$m)$sel[]=match($c){'id'=>"id+$offset",'order_number'=>"CONCAT('RB-S',LPAD(id+$offset,9,'0'))",'external_id'=>"IF(external_id IS NULL,NULL,CONCAT('syn',id+$offset))",'email'=>"CONCAT('bulk',id+$offset,'@".SYN_DOMAIN."')",'created_at'=>'created_at-INTERVAL '.random_int(0,540).' DAY',default=>"`$c`"};
            $db->exec('INSERT INTO rubizh_customer_orders(`'.implode('`,`',array_keys($oc)).'`) SELECT '.implode(',',$sel)." FROM rubizh_customer_orders WHERE id BETWEEN $min AND $max AND email LIKE 'buyer%@".SYN_DOMAIN."' ORDER BY id LIMIT $limit");
            $last=(int)crmOne($db,'SELECT MAX(id) m FROM rubizh_customer_orders')['m'];
            foreach($tables as $t){
                $tc=$cols($t);if(!$tc||!isset($tc['order_id']))continue;$u=array_diff($uniq($t),['order_id']);$skip=false;$sel=[];$names=[];
                foreach($tc as $c=>$m){
                    if($c==='id'&&str_contains((string)$m['e'],'auto_increment'))continue;$names[]="`$c`";
                    if($c==='order_id'){$sel[]="order_id+$offset";continue;}
                    if(in_array($c,$u,true)){if(!in_array($m['d'],['varchar','char'],true)){$skip=true;break;}$len=(int)$m['l'];$sel[]=$len<=40?"IF(`$c` IS NULL,NULL,LEFT(MD5(CONCAT(`$c`,'-c$rounds')),$len))":"IF(`$c` IS NULL,NULL,LEFT(CONCAT(`$c`,'-c$rounds'),$len))";continue;}
                    $sel[]="`$c`";
                }
                if(!$skip)$db->exec("INSERT INTO $t(".implode(',',$names).') SELECT '.implode(',',$sel)." FROM $t WHERE order_id BETWEEN $min AND ".min($max,$last-$offset));
            }
            $db->commit();
        }catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
    }
    return ['orders'=>(int)crmOne($db,'SELECT COUNT(*) n FROM rubizh_customer_orders')['n'],'rounds'=>$rounds,'seconds'=>round(microtime(true)-$t0,1)];
}

if(PHP_SAPI==='cli'&&realpath((string)($_SERVER['argv'][0]??''))===__FILE__){
    $opt=[];foreach(array_slice($_SERVER['argv'],1) as $a)if(preg_match('/^--(orders|bulk|seed)=(\d+)$/D',$a,$m))$opt[$m[1]]=(int)$m[2];else{fwrite(STDERR,"Usage: php dev/crm-synthetic.php --orders=520 [--bulk=50000] [--seed=42]\n");exit(2);}
    try{echo json_encode(synRun($opt),JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE),"\n";}catch(Throwable $e){fwrite(STDERR,'crm-synthetic: '.$e->getMessage()."\n");exit(1);}
}
