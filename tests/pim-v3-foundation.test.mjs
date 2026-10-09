import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,readdirSync,copyFileSync,writeFileSync,rmSync,cpSync} from 'node:fs';
import {spawnSync,spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:net';

const root=path.resolve(import.meta.dirname,'..'),runtime='/workspace/php-runtime/root/usr';
const args=['-n','-d','error_reporting=24575','-d','pdo_mysql.default_socket='+process.env.RUBIZH_TEST_MYSQL_SOCKET,...['pdo','mysqlnd','pdo_mysql','mbstring','curl'].flatMap(x=>['-d','extension='+runtime+'/lib/php/20240924/'+x+'.so'])];
const env={...process.env,LD_LIBRARY_PATH:runtime+'/lib/x86_64-linux-gnu'};
function run(code,input=''){return spawnSync(runtime+'/bin/php8.4',[...args,'-r',code],{env,input,encoding:'utf8',timeout:30000});}
function php(code,input=''){const r=run(code,input);assert.equal(r.status,0,r.stdout+r.stderr);return r.stdout;}
const fixture=name=>JSON.parse(readFileSync(path.join(root,'tests/fixtures/pim-v3/1',name+'.json')));
const validate=batch=>JSON.parse(php(`require '${root}/shop/pim-v3-contract.php';echo json_encode(pimV3ValidateJson(stream_get_contents(STDIN)));`,JSON.stringify(batch)));
const v=b=>b.models[0].variants[0];
const mapping=(m,b=fixture('quantity'))=>JSON.parse(php(`require '${root}/shop/pim-v3-contract.php';$v=json_decode(stream_get_contents(STDIN),true);echo json_encode(pimV3ValidateMappingJson(json_encode($v[0]),json_encode($v[1])));`,JSON.stringify([m,b])));

test('Pinned schema/hash and all 143 category identities are preserved separately from production taxonomy',()=>{
 const manifest=JSON.parse(readFileSync(path.join(root,'contracts/pim-v3/1/manifest.json')));
 for(const [f,key] of [['category-size-export.schema.json','schema_sha256'],['canonical-categories.json','category_file_sha256']])assert.equal(createHash('sha256').update(readFileSync(path.join(root,'contracts/pim-v3/1',f))).digest('hex'),manifest[key]);
 const c=JSON.parse(readFileSync(path.join(root,'contracts/pim-v3/1/canonical-categories.json'))).categories;
 assert.equal(c.length,143);assert.equal(new Set(c.map(x=>x.id)).size,143);assert.ok(c.every(x=>x.parent_id===null||c.some(y=>y.id===x.parent_id)));
 for(const id of ['footwear_shoes','field_watches','symbols','symbols_flags'])assert.ok(c.some(x=>x.id===id));assert.ok(!c.some(x=>x.id==='footwear_loafers'));
 assert.equal(createHash('sha256').update(readFileSync(path.join(root,'shop/canonical-taxonomy.json'))).digest('hex'),'0754cbc1605d0aadb51af5c8e6064b92d48b8161ac81023c7e37293671798f4c');
});
for(const name of ['quantity','status','feed_presence'])test(`Versioned ${name} fixture passes offline contract; stale observation is warning, not TTL`,()=>assert.equal(validate(fixture(name)).valid,true));

for(const state of ['PREORDER','ORDER_ON_REQUEST','UNKNOWN','SIZE_CONFIRMATION_REQUIRED','OUT_OF_STOCK','PRICE_NOT_READY'])test(`Typed ${state} input preserves null/confirmation semantics without changing checkout`,()=>{
 const b=fixture('quantity'),m=b.models[0],variant=v(b);m.payment_allowed=false;
 if(state==='PRICE_NOT_READY'){
  Object.assign(variant,{price_ready:false,price:null,site_price:null,payment_allowed:false,order_submission_allowed:false,requires_order_confirmation:true});m.order_submission_allowed=false;m.requires_order_confirmation=true;
 }else{
  const request=['PREORDER','ORDER_ON_REQUEST','SIZE_CONFIRMATION_REQUIRED'].includes(state);
  Object.assign(variant,{availability:state,availability_status:state==='SIZE_CONFIRMATION_REQUIRED'?'UNKNOWN':state,payment_allowed:false,order_submission_allowed:request,requires_order_confirmation:state!=='OUT_OF_STOCK',ready_to_dispatch:false,stock:state==='OUT_OF_STOCK'?0:null,stock_quantity:state==='OUT_OF_STOCK'?0:null,stock_status:state==='OUT_OF_STOCK'?'CONFIRMED':'UNKNOWN',availability_source:state==='OUT_OF_STOCK'?'QUANTITY':['PREORDER','ORDER_ON_REQUEST'].includes(state)?'MANUAL':null,availability_confirmation:['UNKNOWN','SIZE_CONFIRMATION_REQUIRED'].includes(state)?'UNKNOWN':'CONFIRMED',inventory_mode:state==='OUT_OF_STOCK'?'QUANTITY':'NO_AVAILABILITY_SIGNAL'});
  Object.assign(m,{availability:state,order_submission_allowed:request,requires_order_confirmation:variant.requires_order_confirmation});
  if(state==='SIZE_CONFIRMATION_REQUIRED')Object.assign(variant,{size_status:state,size_confirmation_required:true});
 }
 assert.equal(validate(b).valid,true,JSON.stringify(validate(b)));
});
for(const size of ['ONE_SIZE','NO_SIZE_REQUIRED'])test(`${size} remains a real SKU with explicit typed size`,()=>{const b=fixture('quantity');Object.assign(v(b),{size_status:size,size_normalized:size==='NO_SIZE_REQUIRED'?null:'ONE_SIZE',size_system:size==='NO_SIZE_REQUIRED'?'NONE':'UNIVERSAL'});assert.equal(validate(b).valid,true);});

const negatives={
 'unsupported batch version':b=>b.contract_version=4,
 'wrong policy version':b=>b.models[0].order_policy_version=2,
 'missing required timestamp':b=>delete v(b).stock_observed_at,
 'legacy combined checkout permission':b=>v(b).checkout_allowed=true,
 'unknown effective availability':b=>v(b).availability='UNPUBLISHED',
 'numeric unknown quantity':b=>{v(b).stock_status='UNKNOWN';},
 'zero QUANTITY cannot authorize in stock':b=>{v(b).stock=v(b).stock_quantity=0;},
 'false confirmed binding while payable':b=>v(b).source_binding_status='CONFIRMATION_REQUIRED',
 'unconfirmed price while payable':b=>v(b).price_ready=false,
 'request option must not invent SKU':b=>b.models[0].size_options[0].variant_sku='fake-sku',
 'request option cannot authorize payment':b=>b.models[0].size_options[0].payment_allowed=true,
 'request option cannot invent stock':b=>b.models[0].size_options[0].stock_quantity=4,
 'COLOR scope requires owned color':b=>b.models[0].size_options[0].scope='COLOR',
 'duplicate sizes rejected':b=>b.models[0].size_catalogs[0].allowed_sizes.push('M'),
 'unknown canonical ID rejected':b=>b.models[0].canonical_category_id='footwear_loafers',
 'color object extension validated':b=>b.models[0].colors[0]={id:'clr_black'},
 'orphan SKU color rejected':b=>v(b).color_id='wrong-color',
 'wrong color gallery rejected':b=>v(b).photos=['https://cdn.example.com/wrong.webp'],
 'duplicate model rejected':b=>b.models.push(structuredClone(b.models[0])),
 'SKU ownership across models rejected':b=>{const m=structuredClone(b.models[0]);m.id=m.model_id='different-model';b.models.push(m);},
 'G02 exporter missing v1 SKU pricing rejected':b=>delete v(b).pricing_policy_version,
 'missing site price rejected':b=>delete v(b).site_price,
 'price disagreement rejected':b=>v(b).site_price=1,
 'sub-kopeck rounding forbidden':b=>v(b).price=v(b).site_price=4350.251,
 'kit below private floor rejected':b=>v(b).kit_price=1,
 'credentials in photo URL rejected':b=>{b.models[0].colors[0].photos=v(b).photos=['https://user:password@cdn.example.com/image.webp'];},
 'internal photo URL rejected':b=>{b.models[0].colors[0].photos=v(b).photos=['https://127.0.0.1/image.webp'];},
 'structured size cannot leak private object':b=>v(b).size_display={secret:'PRIVATE_CANARY'},
 'structured color cannot leak private object':b=>b.models[0].colors[0].color={secret:'PRIVATE_CANARY'}
 ,'color list cannot claim another SKU':b=>b.models[0].colors[0].variant_skus=['another-sku']
 ,'confirmation flag cannot authorize payment':b=>v(b).size_confirmation_required=true
 ,'stock precision cannot be silently rounded':b=>v(b).stock=v(b).stock_quantity=4.001
 ,'bounded catalog prevents quadratic unique-size work':b=>b.models[0].size_catalogs[0].allowed_sizes=Array.from({length:257},(_,i)=>String(i))
 ,'SKU case collision under legacy DB collation':b=>{const second=structuredClone(v(b));second.sku=second.sku.toUpperCase();b.models[0].variants.push(second);b.models[0].colors[0].variant_skus.push(second.sku);}
};
for(const [label,mutate] of Object.entries(negatives))test(`Foundation rejects ${label}`,()=>{const b=fixture('quantity');mutate(b);const r=validate(b);assert.equal(r.valid,false,JSON.stringify(r));assert.ok(r.errors.length>0);assert.ok(r.errors.every(x=>Object.keys(x).sort().join(',')==='code,path'));});

test('Schema interpreter rejects unknown keywords; JSON object/array distinction, conditional and contains checks are real',()=>{
 const r=JSON.parse(php(`require '${root}/shop/pim-v3-contract.php';$s=pimV3PinnedSchema();$v=json_decode(file_get_contents('${root}/tests/fixtures/pim-v3/1/quantity.json'))->models[0];$v->variants=[];echo json_encode(['contains'=>pimV3SchemaErrors($v,$s),'types'=>pimV3SchemaErrors(new stdClass(),['type'=>'array'])]);`));
 assert.ok(r.contains.some(x=>x.code==='CONTAINS'));assert.equal(r.types[0].code,'TYPE');
 assert.notEqual(run(`require '${root}/shop/pim-v3-contract.php';pimV3SchemaErrors(null,['unsupported'=>true]);`).status,0);
 assert.equal(validate({...fixture('quantity'),models:{}}).valid,false);
 assert.equal(JSON.parse(php(`require '${root}/shop/pim-v3-contract.php';echo json_encode(pimV3ValidateJson('{'));`)).errors[0].code,'INVALID_JSON');
 assert.equal(JSON.parse(php(`require '${root}/shop/pim-v3-contract.php';echo json_encode(pimV3ValidateJson(str_repeat(' ',8*1024*1024+1)));`)).errors[0].code,'BYTE_LIMIT');
});
test('Color identity is composite per model, unknown photos stay unassigned, absent floor disables discounts without guessing',()=>{
 const b=fixture('quantity'),m=structuredClone(b.models[0]);m.id=m.model_id='second-model';m.variants[0].sku='second-model-M';m.colors[0].variant_skus=['second-model-M'];b.models.push(m);assert.equal(validate(b).valid,true);
 v(b).color_id=null;b.models[0].colors[0].variant_skus=[];v(b).photos=['https://cdn.example.com/unassigned.webp'];delete v(b).minimum_sale_price;assert.equal(validate(b).valid,true);
 const dto=JSON.parse(php(`require '${root}/shop/pim-v3-contract.php';echo json_encode(pimV3PublicDto(stream_get_contents(STDIN)));`,JSON.stringify(b)));
 assert.equal(dto.models[0].variants[0].color_id,null);assert.equal(dto.models[0].variants[0].kit_price,null);
});
test('Public whitelist strips nested supplier/source/pricing/evidence/key canaries and retains decimal public prices',()=>{
 const b=fixture('quantity');b.models[0].description={private:'PRIVATE_DESCRIPTION_CANARY'};b.models[0].colors[0].metadata={secret:'PRIVATE_METADATA_CANARY'};
 const out=php(`require '${root}/shop/pim-v3-contract.php';echo json_encode(pimV3PublicDto(stream_get_contents(STDIN)),JSON_UNESCAPED_UNICODE);`,JSON.stringify(b));
 assert.doesNotMatch(out,/PRIVATE_|supplier|sources|bindings|evidence|minimum_sale_price|discount_margin_floor_pct|purchase_price|api_key|metadata/);
 const dto=JSON.parse(out);assert.equal(dto.models[0].variants[0].price,4350.25);assert.equal(dto.models[0].variants[0].kit_price,4200.15);assert.equal(dto.models[0].size_options[0].variant_sku,null);
});
for(const name of ['quantity','status','feed_presence'])test(`Public ${name} DTO hides supplier quantities and inventory provenance at every depth`,()=>{
 const b=fixture(name),original=structuredClone(b),model=b.models[0];
 for(const item of [model,...model.colors,...model.size_catalogs,...model.size_options,...model.variants]){
  item.inventory_provenance={private:'PRIVATE_INVENTORY_CANARY',stock_quantity:987654};
  item.supplier_quantity=987654;item.max_order_qty=987654;
 }
 // Poison optional private metadata on all non-SKU levels as well.
 for(const item of [model,...model.colors,...model.size_catalogs])item.stock_quantity=987654;
 const out=php(`require '${root}/shop/pim-v3-contract.php';echo json_encode(pimV3PublicDto(stream_get_contents(STDIN)));`,JSON.stringify(b));
 const publicModel=JSON.parse(out).models[0],variant=publicModel.variants[0];
 const forbidden=new Set(['stock','stock_quantity','supplier_quantity','max_order_qty','inventory_provenance','inventory_mode','inventory_policy_id','inventory_policy_version','inventory_policy_confirmed','availability_source','availability_confirmation','stock_status','stock_observed_at','source_updated_at','stock_data_age_hours','stale_source','stock_warning_hours','expires_at','source_binding_status','supplier_bindings','sources']);
 function walk(value){if(value&&typeof value==='object')for(const [key,child] of Object.entries(value)){assert.ok(!forbidden.has(key),key);walk(child);}}
 walk(JSON.parse(out));assert.doesNotMatch(out,/PRIVATE_INVENTORY_CANARY|987654/);
 for(const field of ['availability','order_submission_allowed','payment_allowed','requires_order_confirmation','delivery_lead_time_days','ready_to_dispatch'])assert.deepEqual(variant[field],v(original)[field],field);
 assert.equal(v(b).stock_quantity,v(original).stock_quantity);assert.equal(validate(b).valid,true);
});
test('Order states exclude payment readiness; exact PIM wire remains unconfirmed and ingestion disabled',()=>{
 const states=['NEW','WAITING_CONFIRMATION','CONFIRMED','CANCELLED','COMPLETED'];
 const result=JSON.parse(php(`require '${root}/shop/pim-v3-contract.php';require '${root}/shop/pim-v3-schema.php';echo json_encode(['states'=>pimV3OrderStates(),'policy'=>pimV3FoundationPolicy(),'steps'=>pimV3SchemaPlan()]);`));
 const manifest=JSON.parse(readFileSync(path.join(root,'contracts/pim-v3/1/manifest.json')));
 assert.deepEqual(result.states,states);assert.deepEqual(manifest.order_states,states);
 const order=result.steps.find(x=>x.id==='rubizh_customer_orders.pim_order_state');assert.doesNotMatch(order.sql,/READY_FOR_PAYMENT/);
 for(const state of states)assert.ok(order.sql.includes("'"+state+"'"));
 for(const policy of [result.policy,manifest]){assert.equal(policy.wire_contract_status,'UNCONFIRMED');assert.equal(policy.ingestion_enabled,false);assert.equal(policy.sync_enabled,false);assert.deepEqual(policy.capabilities_advertised,[]);}
 assert.equal(manifest.exact_release_wire_fixture_required,true);assert.equal(manifest.fixture_envelope,'SYNTHETIC_MODELS_ONLY');
});
test('Explicit mappings require proof and owned model/color/SKU; unknown photo has null target and redirects remain data only',()=>{
 const m=fixture('legacy-mapping');assert.equal(mapping(m).valid,true);
 for(const mutate of [m=>m.entries[0].evidence_refs=[],m=>m.entries[1].variant_sku='unrelated-sku',m=>m.entries[1].color_id='wrong-color',m=>m.entries[2].color_id='clr_black',m=>m.entries[0].redirect_url='https://attacker.example.com/',m=>m.entries[0].model_id={}]){
  const changed=structuredClone(m);mutate(changed);assert.equal(mapping(changed).valid,false);
 }
});
test('Pure inclusion/plan has no DDL or configuration side effects; foundation advertises no capability and records single-payment mixed policy',()=>{
 const result=JSON.parse(php(`require '${root}/shop/pim-v3-contract.php';require '${root}/shop/pim-v3-schema.php';echo json_encode(['files'=>get_included_files(),'policy'=>pimV3FoundationPolicy(),'steps'=>pimV3SchemaPlan()]);`));
 assert.ok(result.files.every(x=>!x.endsWith('/config.php')&&!x.endsWith('/api/lib.php')));
 assert.deepEqual(result.policy.capabilities_advertised,[]);assert.equal(result.policy.sync_enabled,false);assert.equal(result.policy.mixed_cart.automatic_split,false);assert.equal(result.policy.mixed_cart.confirmation_state,'WAITING_CONFIRMATION');
 assert.ok(result.steps.every(x=>/^(CREATE TABLE|ALTER TABLE .* ADD)/.test(x.sql)));assert.ok(!result.steps.some(x=>/\b(DROP|TRUNCATE|DELETE|MODIFY|UPDATE|RENAME)\b/.test(x.sql)));assert.equal(new Set(result.steps.map(x=>x.id)).size,result.steps.length);
});

test('Isolated CLI: additive schema, legacy/pricing/order/account preservation, composite FK, null SKU options, replay/journal drift and public GET refusal', {skip:!process.env.RUBIZH_TEST_MYSQL_SOCKET,timeout:60000},async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'rubizh-pim-foundation-')),site=path.join(dir,'www'),schema='fixture_pim_v3_'+Math.random().toString(16).slice(2,14);mkdirSync(site);
 const admin=`$db=new PDO('mysql:unix_socket='.getenv('RUBIZH_TEST_MYSQL_SOCKET'),'root','',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);`;
 const connect=admin+`$db->exec('USE ${schema}');`;
 let server;
 const cli=mode=>spawnSync(runtime+'/bin/php8.4',[...args,path.join(root,'dev/migrate-pim-v3.php'),'--isolated','--database='+schema,'--socket='+process.env.RUBIZH_TEST_MYSQL_SOCKET,'--'+mode],{env,encoding:'utf8',timeout:30000});
 const snapshot=()=>JSON.parse(php(connect+`$out=[];foreach(['products','variants','photos','meta','rubizh_catalog_pricing','rubizh_customer_orders','rubizh_customers','rubizh_accounts','rubizh_customer_identities','rubizh_account_orders','rubizh_mono_invoices','rubizh_mono_events','rubizh_order_shipments','rubizh_order_timing','rubizh_stock_reservations'] as $table){$rows=$db->query('SELECT * FROM '.$table.($table==='meta'?" WHERE k<>'pim_v3_schema'":''))->fetchAll(PDO::FETCH_ASSOC);foreach($rows as &$r)foreach(array_keys($r) as $k)if(str_starts_with($k,'pim_'))unset($r[$k]);unset($r);$out[$table]=$rows;}echo json_encode($out);`));
 try{
  for(const folder of ['api','auth','shop','dev']){mkdirSync(path.join(site,folder));for(const f of readdirSync(path.join(root,folder)))if(!['config.php','mono-private.php','np-private.php','site-settings.json','site-settings.lock'].includes(f)&&['.php','.json'].includes(path.extname(f))){try{copyFileSync(path.join(root,folder,f),path.join(site,folder,f));}catch(e){if(e.code!=='EISDIR')throw e;}}}
  cpSync(path.join(root,'contracts'),path.join(site,'contracts'),{recursive:true});
  writeFileSync(path.join(site,'api/config.php'),`<?php return ['db_host'=>'localhost','db_name'=>'${schema}','db_user'=>'root','db_pass'=>'','cache_dir'=>'${dir}/cache','media_dir'=>'${dir}/media','pim_key'=>'fixture-foundation-private-key'];`);
  writeFileSync(path.join(site,'auth/config.php'),"<?php return ['sms_enabled'=>false,'google_enabled'=>false,'noreply_password'=>'','auth_secret'=>'fixture-foundation-secret-forty-characters'];");
  php(`${admin}$db->exec('CREATE DATABASE ${schema} CHARACTER SET utf8mb4');require '${site}/dev/prepare-runtime.php';`);
  php(`require '${site}/api/lib.php';$db=db();$p=['id'=>'legacy-model','name'=>'Куртка тестова','pricing_policy_version'=>1,'variants'=>[['sku'=>'legacy-M','size'=>'M','color'=>'Чорний','stock'=>4,'availability'=>'in','price'=>4350.25,'site_price'=>4350.25,'pricing_policy_version'=>1,'minimum_sale_price'=>4100,'discount_margin_floor_pct'=>15,'kit_price'=>4200.15]],'photos'=>['https://cdn.example.com/legacy.webp']];$r=save_product($db,$p);if($r['status']==='error')throw new Exception('Fixture seed rejected');$db->exec("INSERT INTO rubizh_customer_orders(external_id,email,order_number,status,payment_status,total,items_json,delivery_label,created_at,updated_at) VALUES('fixture-order','fixture@example.com','fixture-1','confirmed','paid',4350.25,'[]','{}',UTC_TIMESTAMP(),UTC_TIMESTAMP())");`);
  php(connect+`$db->exec("INSERT INTO rubizh_accounts(id,email,phone,created_at,updated_at) VALUES('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','fixture@example.com','+380671234567',UTC_TIMESTAMP(),UTC_TIMESTAMP())");$db->exec("INSERT INTO rubizh_customers(email,phone,created_at,updated_at) VALUES('fixture@example.com','+380671234567',UTC_TIMESTAMP(),UTC_TIMESTAMP())");$db->exec("INSERT INTO rubizh_customer_identities(provider,subject,customer_id,contact_email,created_at) VALUES('phone','+380671234567','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','fixture@example.com',UTC_TIMESTAMP())");$db->exec("INSERT INTO rubizh_account_orders(order_id,customer_id) SELECT id,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' FROM rubizh_customer_orders");$db->exec("INSERT INTO rubizh_mono_invoices(order_id,invoice_id,reference,amount,status,created_at,updated_at) SELECT id,'mock-invoice','mock-reference',435025,'success',UTC_TIMESTAMP(),UTC_TIMESTAMP() FROM rubizh_customer_orders");$db->exec("INSERT INTO rubizh_mono_events(event_hash,invoice_id,status,created_at) VALUES(REPEAT('a',64),'mock-invoice','success',UTC_TIMESTAMP())");$db->exec("INSERT INTO rubizh_order_shipments(order_id,supplier_code,tracking_number,status,created_at,updated_at) SELECT id,'fixture','mock-ttn','delivered',UTC_TIMESTAMP(),UTC_TIMESTAMP() FROM rubizh_customer_orders");$db->exec("INSERT INTO rubizh_order_timing(order_id,payment_due,remind_at,paid_at) SELECT id,UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP() FROM rubizh_customer_orders");$db->exec("INSERT INTO rubizh_stock_reservations(order_id,sku,qty,expires_at) SELECT id,'legacy-M',1,UTC_TIMESTAMP() FROM rubizh_customer_orders");`);
  const before=snapshot(),plan=cli('plan');assert.equal(plan.status,0,plan.stderr);assert.equal(JSON.parse(plan.stdout).writes,0);assert.deepEqual(snapshot(),before);
  const first=cli('apply');assert.equal(first.status,0,first.stderr);assert.equal(JSON.parse(first.stdout).applied.length,JSON.parse(plan.stdout).steps.length);assert.deepEqual(snapshot(),before);
  const replay=cli('apply');assert.equal(replay.status,0,replay.stderr);assert.deepEqual(JSON.parse(replay.stdout).applied,[]);
  // Exercise the DB CHECK, not just the plan's strings. All business states fit;
  // payment eligibility is separate and cannot become an order status.
  const orderStates=JSON.parse(php(connect+`$db->beginTransaction();$q=$db->prepare('UPDATE rubizh_customer_orders SET pim_order_state=?');$out=[];foreach(['NEW','WAITING_CONFIRMATION','CONFIRMED','CANCELLED','COMPLETED'] as $s){$q->execute([$s]);$out[]=$db->query('SELECT pim_order_state FROM rubizh_customer_orders')->fetchColumn();}try{$q->execute(['READY_FOR_PAYMENT']);$out[]='ACCEPTED';}catch(PDOException){$out[]='REJECTED';}$db->rollBack();echo json_encode($out);`));
  assert.deepEqual(orderStates,['NEW','WAITING_CONFIRMATION','CONFIRMED','CANCELLED','COMPLETED','REJECTED']);assert.deepEqual(snapshot(),before);
  php(`require '${site}/api/lib.php';require '${site}/shop/store-lib.php';class NoDdl extends PDO{public function exec(string $s):int|false{if(preg_match('/^(CREATE|ALTER|DROP)/i',$s))throw new Exception('GET/bootstrap attempted DDL');return parent::exec($s);}}$db=new NoDdl('mysql:unix_socket='.getenv('RUBIZH_TEST_MYSQL_SOCKET').';dbname=${schema}','root','',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);migrate($db);shopUiMigrate($db);shopLifecycleMigrate($db);npMigrate($db);monoMigrate($db);`);
  const defaults=JSON.parse(php(connect+`echo json_encode(['product'=>$db->query('SELECT pim_contract_version,pim_model_id,pim_publication_state FROM products')->fetch(PDO::FETCH_ASSOC),'variant'=>$db->query('SELECT pim_payment_allowed,pim_stock_quantity,pim_color_id FROM variants')->fetch(PDO::FETCH_ASSOC),'prices'=>$db->query("SELECT COLUMN_NAME,COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='variants' AND COLUMN_NAME IN ('price','kit_price')")->fetchAll(PDO::FETCH_ASSOC)]);`));
  assert.deepEqual(defaults.product,{pim_contract_version:null,pim_model_id:null,pim_publication_state:'LEGACY'});assert.ok(Object.values(defaults.variant).every(x=>x===null));assert.ok(defaults.prices.every(x=>x.COLUMN_TYPE==='decimal(14,2)'));
  php(connect+`$db->exec("INSERT INTO rubizh_product_colors(product_id,color_id,revision) VALUES('legacy-model','clr_black','fixture')");$db->exec("INSERT INTO rubizh_size_catalogs(product_id,catalog_id,scope,color_id,size_system,allowed_sizes_json,revision) VALUES('legacy-model','fixture-alpha','MODEL',NULL,'ALPHA','[\\\"M\\\",\\\"L\\\"]','fixture')");$db->exec("INSERT INTO rubizh_size_options(product_id,option_id,catalog_id,scope,color_id,size,size_system,revision) VALUES('legacy-model','fixture-L','fixture-alpha','MODEL',NULL,'L','ALPHA','fixture')");$db->exec("UPDATE variants SET pim_color_id='clr_black' WHERE sku='legacy-M'");`);
  for(const sql of ["UPDATE variants SET pim_color_id='missing' WHERE sku='legacy-M'","UPDATE variants SET pim_payment_allowed=2 WHERE sku='legacy-M'","UPDATE variants SET pim_effective_availability='UNPUBLISHED' WHERE sku='legacy-M'","UPDATE variants SET pim_stock_quantity=-1 WHERE sku='legacy-M'","UPDATE rubizh_size_options SET variant_sku='fake-sku'","UPDATE rubizh_size_options SET payment_allowed=1","UPDATE rubizh_size_catalogs SET scope='COLOR',color_id=NULL","INSERT INTO rubizh_pim_legacy_mappings(mapping_id,legacy_product_id,product_id,target_sku,mapping_status,proof_reference,source_revision,created_at) VALUES('bad-owner','old','legacy-model','wrong-sku','CONFIRMED','proof','fixture',UTC_TIMESTAMP())"]){assert.equal(php(connect+`try{$db->exec(${JSON.stringify(sql)});echo 'ACCEPTED';}catch(PDOException){echo 'REJECTED';}`),'REJECTED',sql);}
  // Current GET route still advertises only pricing v1, and CLI cannot run under a public request.
  const net=createServer();await new Promise(r=>net.listen(0,'127.0.0.1',r));const port=net.address().port;await new Promise(r=>net.close(r));
  writeFileSync(path.join(site,'router.php'),"<?php if(str_starts_with($_SERVER['REQUEST_URI'],'/api/'))require __DIR__.'/api/index.php';else return false;");
  server=spawn(runtime+'/bin/php8.4',[...args,'-S','127.0.0.1:'+port,'-t',site,path.join(site,'router.php')],{env,stdio:'ignore'});
  const base='http://127.0.0.1:'+port;let status;
  for(let i=0;i<50;i++){try{status=await fetch(base+'/api/pim/status',{headers:{Authorization:'Bearer fixture-foundation-private-key'}});if(status.ok)break;await status.arrayBuffer();}catch{}await new Promise(r=>setTimeout(r,30));}
  assert.equal(status.status,200);const data=await status.json();assert.deepEqual(data.capabilities,{pricing_policy_version:1});assert.ok(!data.capabilities.contract_version);assert.equal((await fetch(base+'/dev/migrate-pim-v3.php?apply=1')).status,404);
  assert.notEqual(spawnSync(runtime+'/bin/php8.4',[...args,path.join(root,'dev/migrate-pim-v3.php'),'--isolated','--database=production','--socket='+process.env.RUBIZH_TEST_MYSQL_SOCKET,'--apply'],{env,encoding:'utf8'}).status,0);
  // DDL journal rejects altered definitions rather than silently repairing or overriding them.
  php(connect+`$db->exec('ALTER TABLE products MODIFY pim_model_id VARCHAR(60) NULL');`);assert.notEqual(cli('apply').status,0);
 }finally{server?.kill();try{php(`${admin}$db->exec('DROP DATABASE IF EXISTS ${schema}');`);}finally{rmSync(dir,{recursive:true,force:true});}}
});
