// Q-8 / D-11 (owner decision 2026-10-11, rules K1–K6): a custom kit gets PIM kit prices only with ≥2 models from ≥2 MAIN
// builder sections (Голова, Тіло, Ноги, Взуття, Бронезахист, Спорядження, Медицина). «Дрібниці» never qualify a kit but
// get the kit price once the kit qualifies. Kit price on 1 unit of each model (N for «Для підрозділу»); extra units retail.
// Server-side pricing only (PHP unit level); PIM prices are read, never changed.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),runtime=(process.env.RUBIZH_PHP_RUNTIME||'/workspace/php-runtime/root/usr')+'';
// retail 1000 / kit 800 / floor 700 for every SKU; kl(product, slot, qty, sku, units)
const pre=`require '${root}/shop/units.php';require '${root}/shop/pricing.php';function cfg($k){return null;}function check($b,$m='check'){if(!$b)throw new Exception($m);}
function pol(){return shopPricingPolicy(['pricing_policy_version'=>1,'price'=>1000,'minimum_sale_price'=>700,'discount_margin_floor_pct'=>15,'kit_price'=>800]);}
function kl($product,$slot,$qty=1,$sku=null,$units=null){$l=['sku'=>$sku??$product.'-M','product_id'=>$product,'price'=>1000,'_pricing'=>pol(),'price_mode'=>'kit','kit_group'=>'g1','qty'=>$qty,'qty_label'=>$qty.' шт.','kit_slot'=>$slot];if($units!==null)$l['kit_units']=$units;return $l;}
function total($lines){$q=shopCheckoutQuote(shopPricingKitComposition($lines),'');return $q['total'];}
function modes($lines){return array_map(fn($l)=>$l['price_mode'].':'.$l['qty'],shopPricingKitComposition($lines));}`;
function run(code){const r=spawnSync(runtime+'/bin/php8.4',['-n','-d','extension='+runtime+'/lib/php/20240924/mbstring.so','-r',pre+code],{encoding:'utf8',env:{...process.env,LD_LIBRARY_PATH:runtime+'/lib/x86_64-linux-gnu'},timeout:10000});assert.equal(r.status,0,r.stdout+'\n'+r.stderr);return r.stdout;}

test('K1: two units of one SKU are not a kit — retail, no error',()=>run(`check(total([kl('jacket','body',2)])==2000,'2×1000');check(modes([kl('jacket','body',2)])===['retail:2']);`));
test('K1: two models of the same main section are not a kit',()=>run(`check(total([kl('jacket','body'),kl('shirt','body')])==2000);`));
test('K1: a main section plus «Дрібниці» is not a kit',()=>run(`check(total([kl('jacket','body'),kl('gloves','small')])==2000);`));
test('K1: two main sections are a kit — kit price on both',()=>run(`check(total([kl('jacket','body'),kl('boots','boots')])==1600);check(modes([kl('jacket','body'),kl('boots','boots')])===['kit:1','kit:1']);`));
test('K1: two main sections plus «Дрібниці» — kit price on all three',()=>run(`check(total([kl('jacket','body'),kl('boots','boots'),kl('gloves','small')])==2400);`));
test('Q2: two models of one section plus another main section — kit price on every model',()=>run(`check(total([kl('jacket','body'),kl('shirt','body'),kl('helmet','head')])==2400);`));
test('K2: an extra unit of a model in a qualified kit is retail (line split into kit + retail)',()=>run(`check(total([kl('jacket','body',3),kl('boots','boots')])==1000*2+800*2,'jacket 1 kit + 2 retail, boots kit');check(modes([kl('jacket','body',3),kl('boots','boots')])===['kit:1','retail:2','kit:1']);`));
test('K2: two sizes of the same model share one kit unit',()=>run(`check(total([kl('jacket','body',1,'jacket-M'),kl('jacket','body',1,'jacket-L'),kl('boots','boots')])==800+1000+800);`));
test('K2: «Для підрозділу» N kits — kit price on N units of each model, the rest retail',()=>run(`check(total([kl('jacket','body',3,null,3),kl('boots','boots',4,null,3)])==800*3+800*3+1000);check(modes([kl('jacket','body',3,null,3),kl('boots','boots',4,null,3)])===['kit:3','kit:3','retail:1']);`));
test('K2: «Для підрозділу» needs one consistent N per kit (1–99)',()=>run(`foreach([[0,0],[2,3],[100,100]] as [$a,$b]){try{shopPricingKitComposition([kl('jacket','body',1,null,$a),kl('boots','boots',1,null,$b)]);throw new LogicException('accepted');}catch(ShopPricingException $e){check($e->reason==='INVALID_KIT',$e->reason);}}`));
test('K3: a SKU without a valid PIM kit price stays retail inside a qualified kit, the others keep the kit price',()=>run(`$b=kl('boots','boots');$b['_pricing']=shopPricingPolicy(['pricing_policy_version'=>1,'price'=>1000,'minimum_sale_price'=>700,'discount_margin_floor_pct'=>15,'kit_price'=>null]);check(total([kl('jacket','body'),$b])==1800);`));
test('K1: a retail line of another main section in the same kit still counts for the composition',()=>run(`$b=kl('boots','boots');$b['price_mode']='retail';check(total([kl('jacket','body'),$b])==1800);`));
test('Stored split lines re-price identically (re-validation before payment never changes the total)',()=>run(`$first=shopPricingKitComposition([kl('jacket','body',3),kl('boots','boots')]);foreach($first as &$l){$l['_pricing']=pol();}unset($l);check(shopCheckoutQuote(shopPricingKitComposition($first),'')['total']==shopCheckoutQuote($first,'')['total']);check(count(shopPricingKitComposition($first))===count($first));`));
test('Explanation: a kit that does not qualify is marked for the buyer',()=>run(`$l=shopPricingKitComposition([kl('jacket','body',2)]);check($l[0]['kit_status']==='needs_sections');$l=shopPricingKitComposition([kl('jacket','body'),kl('boots','boots')]);check($l[0]['kit_status']==='kit');`));
test('K4: promo code still does not stack with a kit',()=>run(`try{shopCheckoutQuote(shopPricingKitComposition([kl('jacket','body'),kl('boots','boots')]),'X');throw new LogicException('accepted');}catch(ShopPricingException $e){check($e->reason==='DISCOUNT_NOT_ALLOWED');}`));
test('Ready kit definitions keep their exact composition rules',()=>run(`$l=kl('jacket','body',2);$l['kit_group']='b1';$defs=['b1'=>['items'=>[['product_id'=>'jacket','qty'=>2]]]];check(shopCheckoutQuote(shopPricingKitComposition([$l],$defs),'')['total']==1600);$l['qty']=1;try{shopPricingKitComposition([$l],$defs);throw new LogicException('accepted');}catch(ShopPricingException $e){check($e->reason==='INVALID_KIT');}`));
test('Placed orders are never re-priced: kit lines stored before Q-8 (no kit_status) keep their kit price on re-validation',()=>run(`$l=kl('jacket','body',2);$l['kit_legacy']=true;$out=shopPricingKitComposition([$l]);check(shopCheckoutQuote($out,'')['total']==1600,'old rule kept');check(!isset($out[0]['kit_legacy']),'marker not stored');`));
