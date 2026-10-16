// Stage 5, D-65 (owner decision 2026-10-16): «Бронезахист» is sold at a fixed price. Lines of the armor builder section
// (category Бронезахист and its subcategories) never get the kit price — always retail — but the armor section still
// counts as one of the ≥2 main sections of K1. Server (shopPricingKitComposition) and storefront (K6: the client shows
// what the server charges). Orders placed before D-65 are never re-priced.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const root=path.resolve(import.meta.dirname,'..'),runtime=(process.env.RUBIZH_PHP_RUNTIME||'/workspace/php-runtime/root/usr')+'';
// retail 1000 / kit 800 / floor 700 for every SKU; kl(product, slot, qty, units, category)
const pre=`require '${root}/shop/units.php';require '${root}/shop/pricing.php';function cfg($k){return null;}function check($b,$m='check'){if(!$b)throw new Exception($m);}
function pol(){return shopPricingPolicy(['pricing_policy_version'=>1,'price'=>1000,'minimum_sale_price'=>700,'discount_margin_floor_pct'=>15,'kit_price'=>800]);}
function kl($product,$slot,$qty=1,$units=null,$category=''){$l=['sku'=>$product.'-M','product_id'=>$product,'price'=>1000,'_pricing'=>pol(),'price_mode'=>'kit','kit_group'=>'g1','qty'=>$qty,'qty_label'=>$qty.' шт.','kit_slot'=>$slot,'kit_category'=>$category];if($units!==null)$l['kit_units']=$units;return $l;}
function compose($lines,$definitions=[]){return shopPricingKitComposition($lines,$definitions);}
function total($lines,$definitions=[]){return shopCheckoutQuote(compose($lines,$definitions),'')['total'];}
function status($lines){return array_map(fn($l)=>$l['product_id'].':'.$l['price_mode'].':'.$l['kit_status'],compose($lines));}`;
function run(code){const r=spawnSync(runtime+'/bin/php8.4',['-n','-d','extension='+runtime+'/lib/php/20240924/mbstring.so','-r',pre+code],{encoding:'utf8',env:{...process.env,LD_LIBRARY_PATH:runtime+'/lib/x86_64-linux-gnu'},timeout:10000});assert.equal(r.status,0,r.stdout+'\n'+r.stderr);return r.stdout;}

test('D-65: helmet + armor plate — a kit (2 sections), the kit price only on the helmet',()=>run(`
 check(total([kl('helmet','head'),kl('plate','armor')])==800+1000,'helmet 800 + plate retail 1000');
 check(status([kl('helmet','head'),kl('plate','armor')])===['helmet:kit:kit','plate:retail:fixed_price'],json_encode(status([kl('helmet','head'),kl('plate','armor')])));`));
test('D-65: armor plate + plate carrier (one section) — not a kit, both retail',()=>run(`
 check(total([kl('plate','armor'),kl('carrier','armor')])==2000);
 check(status([kl('plate','armor'),kl('carrier','armor')])===['plate:retail:needs_sections','carrier:retail:needs_sections']);`));
test('D-65: an armor-category line is fixed-price whatever its builder section (subcategories of Бронезахист)',()=>run(`
 check(total([kl('jacket','body'),kl('pouch','gear',1,null,'Бронезахист / Аксесуари для бронезахисту')])==800+1000);
 check(total([kl('jacket','body'),kl('vest','gear',1,null,'Бронезахист')])==800+1000);
 check(total([kl('jacket','body'),kl('bag','gear',1,null,'Рюкзаки, сумки та баули')])==1600,'other categories keep the kit price');`));
test('D-65: «Для підрозділу» N — armor stays retail on every unit, the other section gets N kit units',()=>run(`
 check(total([kl('helmet','head',3,3),kl('plate','armor',6,3)])==800*3+1000*6);
 check(total([kl('helmet','head',4,3),kl('plate','armor',3,3)])==800*3+1000+1000*3);`));
test('D-65: ready kits (owner definitions) do not give armor the kit price either',()=>run(`
 $a=kl('helmet','head');$b=kl('plate','armor');$a['kit_group']=$b['kit_group']='b1';$defs=['b1'=>['items'=>[['product_id'=>'helmet'],['product_id'=>'plate']]]];
 check(total([$a,$b],$defs)==800+1000);`));
test('D-65: an order placed before D-65 keeps its stored armor kit price on re-validation (never re-priced)',()=>run(`
 $p=kl('plate','armor');$p['kit_armor_legacy']=true;
 check(total([kl('helmet','head'),$p])==1600,'stored kit price kept');
 check(!array_key_exists('kit_armor_legacy',compose([kl('helmet','head'),$p])[1]),'marker not stored');`));
test('D-65: the buyer is told why armor is retail',()=>run(`check(str_contains(shopKitExplanation(compose([kl('helmet','head'),kl('plate','armor')])),'Бронезахист продається за фіксованою ціною'));`));

test('D-65 K6: the storefront kit calculation shows exactly what the server charges',()=>{
 const src=readFileSync(path.join(root,'assets/shop-client.2026101101.js'),'utf8');
 // The kit calculation is a pure function of rows (St); evaluate it with the helpers it needs.
 const start=src.indexOf('St = (t, e, ready) => {'),end=src.indexOf('}, vt = t =>',start);assert.ok(start>0&&end>start,'kit calculation found');
 const helper=src.match(/function storeKitFixedPrice\(.*\n/);assert.ok(helper,'storeKitFixedPrice helper exists');
 const ctx={Z:[],storeSlot:p=>p.slot};
 vm.runInNewContext(helper[0]+';this.St=(()=>{const '+src.slice(start,end+1).replace(/^St = /,'f = ')+';return f;})()',ctx);
 const v={price:1000,kit_price:800,pricing_policy_version:1},row=(slot,q=1,category='')=>({p:{id:slot+q+category,slot,category,name:''},v,q});
 const a=ctx.St([row('head'),row('armor')],1);
 assert.equal(a.qualifies,true,'armor counts as a section');assert.equal(a.kit,1800,'helmet kit 800 + plate retail 1000');
 assert.equal(a.rows[1].kitQty,0);assert.equal(a.rows[1].fixedArmor,true);
 const b=ctx.St([row('armor'),row('armor',2)],1);assert.equal(b.qualifies,false);assert.equal(b.kit,3000);
 const c=ctx.St([row('body'),row('gear',1,'Бронезахист / Аксесуари для бронезахисту')],1);assert.equal(c.kit,1800);
 const d=ctx.St([row('head',3),row('armor',6)],3);assert.equal(d.kit,800*3+1000*6);
 assert.match(src,/Бронезахист продається за фіксованою ціною/,'the builder explains the fixed armor price');
});

test('D-65: the public offer says armor is fixed-price and still counts as a kit section',()=>{
 const offer=readFileSync(path.join(root,'offer.html'),'utf8').replace(/\s+/g,' ');
 assert.ok(offer.includes('Бронезахист продається за фіксованою ціною, ціна комплекту на нього не застосовується, але він враховується як розділ комплекту.'));
});

// The whole path on a database: PIM v3 armor model (kit_component «plates», category Бронезахист / Бронеплити) + a jacket
// in a custom kit → the quote and the stored order charge armor retail; an order stored with the armor kit price before
// D-65 is re-validated (as before payment) without any change of its total.
test('D-65 HTTP: quote and order charge armor retail; an order placed before D-65 is not re-priced',{skip:!process.env.RUBIZH_TEST_MYSQL_SOCKET,timeout:180000},async()=>{
 const {startSite,publish,wire,php}=await import('./helpers/site-fixture.mjs');
 const site=await startSite({extraConfig:",'environment'=>'staging','mono_mock'=>true"});
 try{
  const w=structuredClone(wire),src=w.products.find(m=>m.id==='m-pouch'),plate=structuredClone(src);
  Object.assign(plate,{id:'m-plate',product_id:'m-plate',model_id:'m-plate',slug:'broneplyta-fixture',name:'Бронеплита Fixture',marketing_name_uk:'Бронеплита Fixture',model_name:'Бронеплита Fixture',category:'Бронезахист / Бронеплити',category_path:['Бронезахист','Бронеплити'],canonical_category_id:'armor_plates',primary_product_type:'plates',kit_component:'plates',source_product_ids:['plate-src']});
  const pick=plate.variants.find(v=>v.payment_allowed)??plate.variants[0];plate.variants=[{...pick,sku:'RUB-F0040',fulfillment_supplier_sku:'PL-1'}];plate.colors=plate.colors.filter(c=>c.id===pick.color_id).map(c=>({...c,variant_skus:['RUB-F0040']}));
  w.products.push(plate);const pub=await publish(site,w);assert.equal(pub.status,200,JSON.stringify(pub.data).slice(0,800));
  const jacket=w.products.find(m=>m.id==='m-jacket'),jv=jacket.variants[0],pv=plate.variants[0];
  const lines=[{product_id:'m-jacket',color_id:jacket.colors.find(c=>c.variant_skus.includes(jv.sku)).id,sku:jv.sku,qty:1,price_mode:'kit',kit_group:'g1'},{product_id:'m-plate',color_id:plate.colors[0].id,sku:'RUB-F0040',qty:1,price_mode:'kit',kit_group:'g1'}];
  const s=await site.get('/shop/customer.php'),cookie=s.headers.get('set-cookie').split(';')[0],csrf=s.data.csrf;
  const q=await site.post('/shop/checkout-quote.php',{csrf,lines,payment:'card'},{Cookie:cookie});assert.equal(q.status,200,JSON.stringify(q.data));
  assert.equal(q.data.quote.total,jv.kit_price+pv.price,'jacket kit price + plate retail');
  assert.deepEqual(q.data.quote.lines.map(l=>l.kit_status),['kit','fixed_price']);
  // The stored order: armor line retail, kit_status fixed_price.
  const ref=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
  const contact={name:'Олена Петренко',recipient:'Олена Петренко',email:'buyer@fixture.test',phone:'+380671234567',city:'Київ',address:'Відділення 1',delivery_type:'branch',np_delivery:{city_ref:ref(10),warehouse_ref:ref(20)}};
  const o=await site.post('/shop/order.php',{csrf,request_id:crypto.randomUUID().replaceAll('-',''),contact,payment:'card',lines,expected_total:q.data.quote.total,catalog_version:q.data.quote.catalog_version},{Cookie:cookie});assert.equal(o.status,200,JSON.stringify(o.data));
  const id=o.data.order.id,stored=JSON.parse(site.sql('SELECT items_json FROM rubizh_customer_orders WHERE id='+id)[0].items_json);
  assert.deepEqual(stored.map(l=>[l.price_mode,l.kit_status]),[['kit','kit'],['retail','fixed_price']]);
  // The same order as it would have been stored before D-65 (armor line at the kit price) is re-validated as before a
  // payment is accepted: nothing is re-priced.
  const old=stored.map(l=>l.sku==='RUB-F0040'?{...l,price_mode:'kit',kit_status:'kit',price:pv.kit_price,amount:pv.kit_price}:l),oldTotal=jv.kit_price+pv.kit_price;
  site.sql("UPDATE rubizh_customer_orders SET items_json='"+JSON.stringify(old).replace(/'/g,"''")+"',total="+oldTotal+" WHERE id="+id);
  const r=php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${site.site}/auth/bootstrap.php';require_once '${site.site}/auth/account.php';require_once '${site.site}/shop/store-lib.php';require_once '${site.site}/shop/np-fulfillment.php';$db=db();$db->beginTransaction();try{$o=npOrder($db,${id});$v=shopValidateOrder($db,$o['items'],'confirmation',$o);echo json_encode([$v['quote']['total'],array_column($v['quote']['lines'],'price_mode')]);}catch(Throwable $e){echo get_class($e),': ',$e->getMessage(),' ',json_encode($e->details??null,JSON_UNESCAPED_UNICODE);exit(1);}$db->rollBack();`,{allowFail:true});
  assert.equal(r.status,0,r.stdout+r.stderr);const [total,modes]=JSON.parse(r.stdout.trim().split('\n').pop());
  assert.equal(total,oldTotal,'pre-D-65 order keeps its armor kit price');assert.deepEqual(modes,['kit','kit']);
 }finally{site.stop();}
});
