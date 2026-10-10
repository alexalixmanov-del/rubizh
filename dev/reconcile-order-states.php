<?php
declare(strict_types=1);
// No bootstrap/db()/migrate(): a plan must not trigger any writes or DDL.
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require_once dirname(__DIR__).'/api/database.php';
require_once dirname(__DIR__).'/shop/order-state.php';
try{
    $args=getopt('',['plan','config:']);
    if(!isset($args['plan'])||array_diff(array_slice($argv,1),array_filter(array_slice($argv,1),fn($v)=>$v==='--plan'||str_starts_with($v,'--config='))))throw new RuntimeException('Use --plan [--config=<private config>] only');
    $file=$args['config']??dirname(__DIR__).'/api/config.php';
    $config=require $file;if(!is_array($config))throw new RuntimeException('Configuration unavailable');
    $db=rubizhDatabaseConnect($config);
    $db->exec('SET TRANSACTION READ ONLY');$db->beginTransaction();
    $count=['total_records'=>0,'total_legacy_records'=>0,'safe_mappings'=>0,'ambiguous_mappings'=>0,'conflicts'=>0];$rows=[];
    $last=0;
    do{
        $q=$db->prepare('SELECT * FROM rubizh_customer_orders WHERE id>? ORDER BY id LIMIT 250');$q->execute([$last]);$batch=$q->fetchAll(PDO::FETCH_ASSOC);
        foreach($batch as $o){
            $last=(int)$o['id'];$count['total_records']++;if((int)($o['pim_contract_version']??0)!==3)$count['total_legacy_records']++;
            $q=$db->prepare('SELECT * FROM rubizh_order_shipments WHERE order_id=?');$q->execute([$last]);$ships=$q->fetchAll(PDO::FETCH_ASSOC);
            // Coverage is proved from actual line quantities and allocations, not TTN count.
            $q=$db->prepare('SELECT line_no,qty FROM rubizh_order_fulfillment_lines WHERE order_id=?');$q->execute([$last]);$left=array_column($q->fetchAll(PDO::FETCH_ASSOC),'qty','line_no');
            foreach($ships as $s)if($s['status']!=='cancelled')foreach(json_decode((string)($s['lines_json']??'[]'),true)?:[] as $l)if(isset($left[$l['line_no']]))$left[$l['line_no']]-=(float)$l['qty'];
            $o['shipment_coverage_complete']=(bool)$left&&!array_filter($left,fn($qty)=>abs((float)$qty)>0.00001);
            $q=$db->prepare('SELECT status FROM rubizh_mono_invoices WHERE order_id=?');$q->execute([$last]);$dto=shopCanonicalOrder($o,$ships,$q->fetchAll(PDO::FETCH_ASSOC));
            $type=in_array('STATE_CONFLICT',$dto['review_flags'],true)?'conflicts':($dto['review_required']?'ambiguous_mappings':'safe_mappings');$count[$type]++;
            $rows[]=['id'=>$last,'classification'=>$type,'canonical'=>$dto];
        }
    }while(count($batch)===250);
    $db->rollBack();
    echo json_encode(['mode'=>'PLAN','writes'=>0,'counts'=>$count,'records'=>$rows],JSON_THROW_ON_ERROR|JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE)."\n";
}catch(Throwable $e){if(isset($db)&&$db->inTransaction())$db->rollBack();fwrite(STDERR,"Reconciliation plan refused. Verify read-only configuration and schema.\n");exit(1);}
