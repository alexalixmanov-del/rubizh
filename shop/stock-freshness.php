<?php
declare(strict_types=1);
// Stage 5.1 (owner 2026-10-16): supplier data freshness, applied by SITE on the server. The owner imports supplier files
// once a week; the age of a SKU's data (the supplier's stock_observed_at, else the PIM import time stock_imported_at) decides:
//   age ≤ pay_fresh_hours (default 72 h)                 → as PIM sent it (direct payment; the D-52 quantity limit applies);
//   pay_fresh_hours < age ≤ sell_max_days (default 8 d)  → still sold, but only through «Очікує підтвердження менеджера»
//                                                           (no MonoPay before the manager confirms), like a preorder;
//   age > sell_max_days                                  → not orderable; a model with no other orderable SKU is hidden from
//                                                           the storefront (not deleted) until fresh data arrives.
// Both thresholds are owner settings in PIM, sent with the sync batch (freshness_policy) and kept in meta. A SKU without an
// data time, or whose availability the owner set by hand in PIM (availability_source MANUAL), has no age.
// The flags PIM sent stay in variants.data; the effective columns are recomputed from them, so every reader (catalog,
// product, filters, sitemap, checkout) sees the same state (K6).

const SHOP_FRESHNESS_DEFAULT=['version'=>1,'pay_fresh_hours'=>72,'sell_max_days'=>8];
const SHOP_FRESHNESS_HIDE_REASON='STALE_SUPPLIER_DATA';
const SHOP_FRESHNESS_CONFIRM_NOTE='Менеджер підтвердить наявність перед оплатою';

/** Errors of a freshness_policy object from PIM (empty = valid). */
function shopFreshnessPolicyErrors(mixed $p): array {
    if(!is_array($p)||array_is_list($p))return ['FRESHNESS_POLICY'];
    $errors=[];
    if(array_diff(array_keys($p),['version','pay_fresh_hours','sell_max_days']))$errors[]='FRESHNESS_POLICY_FIELDS';
    if(($p['version']??null)!==1)$errors[]='FRESHNESS_POLICY_VERSION';
    $pay=$p['pay_fresh_hours']??null;$sell=$p['sell_max_days']??null;
    if(!is_int($pay)||$pay<1||$pay>336)$errors[]='PAY_FRESH_HOURS';
    if(!is_int($sell)||$sell<1||$sell>60)$errors[]='SELL_MAX_DAYS';
    if(is_int($pay)&&is_int($sell)&&$sell*24<=$pay)$errors[]='SELL_MAX_DAYS_NOT_AFTER_PAY';
    return $errors;
}
/** The policy SITE applies: the last valid one PIM sent, else the defaults. */
function shopFreshnessPolicy(PDO $db): array {
    try{$raw=$db->query("SELECT v FROM meta WHERE k='pim_freshness_policy'")->fetchColumn();}catch(PDOException){$raw=false;}
    $p=is_string($raw)?json_decode($raw,true):null;
    return shopFreshnessPolicyErrors($p)?SHOP_FRESHNESS_DEFAULT:$p;
}
function shopFreshnessPolicyStore(PDO $db,array $p): void {
    $db->prepare("INSERT INTO meta(k,v) VALUES('pim_freshness_policy',?) ON DUPLICATE KEY UPDATE v=VALUES(v)")->execute([json_encode($p,JSON_THROW_ON_ERROR)]);
}
/** Data time of a SKU: the supplier's observation time, else the PIM import time (kept in variants.data); null = no age. */
function shopFreshnessDataTime(array $v): ?int {
    $observed=$v['pim_stock_observed_at']??null;
    if(is_numeric($observed)&&(int)$observed>0)return (int)$observed;
    $raw=json_decode((string)($v['data']??''),true);$imported=is_array($raw)?($raw['stock_imported_at']??null):null;
    return is_int($imported)&&$imported>0?$imported:null;
}
/** FRESH | CONFIRM | HIDDEN for one variant row (pim_stock_observed_at, pim_availability_source, data). */
function shopFreshnessTier(array $v,array $policy,?int $nowMs=null): string {
    $time=shopFreshnessDataTime($v);
    if($time===null||($v['pim_availability_source']??null)==='MANUAL')return 'FRESH';
    $age=($nowMs??(int)floor(microtime(true)*1000))-$time;
    if($age<=$policy['pay_fresh_hours']*3600000)return 'FRESH';
    return $age<=$policy['sell_max_days']*86400000?'CONFIRM':'HIDDEN';
}
/** Effective permissions of a variant: what PIM sent (variants.data), narrowed by the tier. */
function shopFreshnessFlags(array $v,string $tier): array {
    $raw=json_decode((string)($v['data']??''),true);$raw=is_array($raw)?$raw:[];
    $flag=static fn(string $k,string $column)=>array_key_exists($k,$raw)?(bool)$raw[$k]:(int)($v[$column]??0)===1;
    $submit=$flag('order_submission_allowed','pim_order_submission_allowed');$pay=$flag('payment_allowed','pim_payment_allowed');$confirm=$flag('requires_order_confirmation','pim_requires_order_confirmation');
    if($tier==='CONFIRM'&&$pay){$pay=false;$confirm=true;}
    if($tier==='HIDDEN'){$submit=false;$pay=false;}
    return ['pim_order_submission_allowed'=>(int)$submit,'pim_payment_allowed'=>(int)$pay,'pim_requires_order_confirmation'=>(int)$confirm,'availability'=>$pay?'in':($submit?'order':'out')];
}
/** The row with its effective columns and the tier (stock_freshness). */
function shopFreshnessApplyRow(PDO $db,array $v,?int $nowMs=null): array {
    $tier=shopFreshnessTier($v,shopFreshnessPolicy($db),$nowMs);
    return array_replace($v,shopFreshnessFlags($v,$tier),['stock_freshness'=>$tier]);
}
/**
 * Bring the stored effective columns and model visibility in line with the data age. Runs at most once a minute on public
 * reads (claimed atomically in meta), and always after a sync. Returns the number of changed rows.
 */
function shopFreshnessSweep(PDO $db,bool $force=false): int {
    if(empty($GLOBALS['rubizh_pim_v3_columns'])||$db->inTransaction())return 0;
    $now=time();
    if(!$force){
        $claim=$db->prepare("UPDATE meta SET v=? WHERE k='pim_freshness_swept_at' AND CAST(v AS UNSIGNED)<=?");$claim->execute([(string)$now,$now-60]);
        if($claim->rowCount()!==1){$ins=$db->prepare("INSERT IGNORE INTO meta(k,v) VALUES('pim_freshness_swept_at',?)");$ins->execute([(string)$now]);if($ins->rowCount()!==1)return 0;}
    }else $db->prepare("INSERT INTO meta(k,v) VALUES('pim_freshness_swept_at',?) ON DUPLICATE KEY UPDATE v=VALUES(v)")->execute([(string)$now]);
    $policy=shopFreshnessPolicy($db);$nowMs=(int)floor(microtime(true)*1000);$changed=0;
    $db->beginTransaction();
    try{
        $rows=$db->query("SELECT v.product_id,v.sku,v.data,v.pim_stock_observed_at,v.pim_availability_source,v.pim_order_submission_allowed,v.pim_payment_allowed,v.pim_requires_order_confirmation,v.availability
            FROM variants v JOIN products p ON p.id=v.product_id WHERE p.pim_contract_version=3 AND v.pim_active=1 FOR UPDATE")->fetchAll(PDO::FETCH_ASSOC);
        $set=$db->prepare('UPDATE variants SET pim_order_submission_allowed=?,pim_payment_allowed=?,pim_requires_order_confirmation=?,availability=? WHERE product_id=? AND sku=?');
        $models=[];
        foreach($rows as $v){
            $tier=shopFreshnessTier($v,$policy,$nowMs);$f=shopFreshnessFlags($v,$tier);
            $m=$models[$v['product_id']]??['open'=>false,'best'=>'out'];
            if($tier!=='HIDDEN')$m['open']=true;
            $m['best']=$f['availability']==='in'||$m['best']==='in'?'in':($f['availability']==='order'||$m['best']==='order'?'order':'out');
            $models[$v['product_id']]=$m;
            if((int)$v['pim_order_submission_allowed']!==$f['pim_order_submission_allowed']||(int)$v['pim_payment_allowed']!==$f['pim_payment_allowed']||(int)$v['pim_requires_order_confirmation']!==$f['pim_requires_order_confirmation']||$v['availability']!==$f['availability']){
                $set->execute([$f['pim_order_submission_allowed'],$f['pim_payment_allowed'],$f['pim_requires_order_confirmation'],$f['availability'],$v['product_id'],$v['sku']]);$changed++;
            }
        }
        $products=$db->query("SELECT id,visible,availability,pim_publication_state,pim_publication_reason FROM products WHERE pim_contract_version=3 AND (pim_publication_state='ACTIVE' OR pim_publication_reason='".SHOP_FRESHNESS_HIDE_REASON."') FOR UPDATE")->fetchAll(PDO::FETCH_ASSOC);
        $hide=$db->prepare("UPDATE products SET visible=0,pim_publication_state='HIDDEN',pim_publication_reason='".SHOP_FRESHNESS_HIDE_REASON."',updated_at=UTC_TIMESTAMP() WHERE id=?");
        $show=$db->prepare("UPDATE products SET visible=1,pim_publication_state='ACTIVE',pim_publication_reason=NULL,updated_at=UTC_TIMESTAMP() WHERE id=?");
        $best=$db->prepare('UPDATE products SET availability=? WHERE id=?');
        foreach($products as $p){
            $m=$models[$p['id']]??null;$staleHidden=$p['pim_publication_reason']===SHOP_FRESHNESS_HIDE_REASON;
            // A model without any active SKU (size requests only) has no supplier data age.
            if($m===null){if($staleHidden){$show->execute([$p['id']]);$changed++;}continue;}
            if($staleHidden){if($m['open']){$show->execute([$p['id']]);$changed++;}}
            elseif(!$m['open']&&(int)$p['visible']===1){$hide->execute([$p['id']]);$changed++;}
            if($p['availability']!==$m['best']){$best->execute([$m['best'],$p['id']]);$changed++;}
        }
        if($changed)$db->prepare("INSERT INTO meta(k,v) VALUES('catalog_updated',?) ON DUPLICATE KEY UPDATE v=VALUES(v)")->execute([gmdate('Y-m-d H:i:s').'-fresh-'.bin2hex(random_bytes(4))]);
        $db->commit();
    }catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
    if($changed&&function_exists('shopCacheClear'))try{shopCacheClear();}catch(Throwable){}
    return $changed;
}
