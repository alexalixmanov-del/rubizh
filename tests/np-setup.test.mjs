import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync, existsSync, statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
import {startSite,php as sitePhp} from './helpers/site-fixture.mjs';
const root=path.resolve(import.meta.dirname,'..');
const retained=(process.env.RUBIZH_PHP_RUNTIME||'/workspace/php-runtime/root/usr')+'';
const php=process.env.PHP_PATH||(existsSync(retained+'/bin/php8.4')?retained+'/bin/php8.4':'php');
const env={...process.env,LD_LIBRARY_PATH:process.env.LD_LIBRARY_PATH||retained+'/lib/x86_64-linux-gnu'};
for(const key of Object.keys(env))if(key.startsWith('RUBIZH_'))delete env[key];
const options=existsSync(retained+'/lib/php/20240924/mbstring.so')?['-n',...['pdo','mbstring'].flatMap(name=>['-d','extension='+retained+'/lib/php/20240924/'+name+'.so'])]:[];
function fixture(mode='normal'){
 const parent=mkdtempSync(path.join(tmpdir(),'rubizh-np-setup-'));const site=path.join(parent,'www');
 for(const dir of ['dev','api','shop'])mkdirSync(path.join(site,dir),{recursive:true});
 copyFileSync(path.join(root,'dev/configure-np.php'),path.join(site,'dev/configure-np.php'));
 copyFileSync(path.join(root,'shop/np-lib.php'),path.join(site,'shop/np-lib.php'));
 writeFileSync(path.join(site,'api/lib.php'),`<?php function cfg($key=null){$c=require __DIR__.'/config.php';return $key===null?$c:($c[$key]??null);}`);
 const config=path.join(site,'api/config.php');writeFileSync(config,`<?php return ['db_pass'=>'private-db-fixture','mono_token'=>'private-mono-fixture','nova_poshta_api_key'=>'private-np-fixture','supplier_contacts'=>['m_vin'=>['enabled'=>false]],'np_cod_contract_confirmed'=>true,'np_cod_service'=>'afterpayment'];`);
 const transport=path.join(parent,'transport.php');
 writeFileSync(transport,`<?php
 define('RUBIZH_NP_TESTS',true);
 $GLOBALS['np_setup_test_pause']=function($seconds){};
 function fixtureRef($n){return sprintf('00000000-0000-0000-0000-%012d',$n);}
 $GLOBALS['np_test_transport']=function($model,$method,$properties){
  if($model==='Counterparty'&&$method==='getCounterparties')return [['Ref'=>fixtureRef(1),'Description'=>'Fixture sender']];
  if($model==='Counterparty'&&$method==='getCounterpartyContactPersons')return [['Ref'=>fixtureRef(2),'Description'=>'Fixture contact','Phones'=>'0671234567']${mode==='contacts' ? ",['Ref'=>fixtureRef(3),'Description'=>'Other contact','Phones'=>'0671234568']" : ''}];
  $known=['Ксаверівка'=>[10,'Вінницька',['1']],'Хмельницький'=>[20,'Хмельницька',['8']],'Чернівці'=>[30,'Чернівецька',['32']],'Березань'=>[40,'Київська',['2']],'Вінниця'=>[50,'Вінницька',['9','36']]];
  if($model==='Address'&&$method==='getCities'){$city=$properties['FindByString'];[$id,$area]=$known[$city];return [['Ref'=>fixtureRef($id),'Description'=>$city==='Ксаверівка'?$city.' (Вінницька обл.)':$city,'AreaDescription'=>$area]];}
  if($model==='Address'&&$method==='getWarehouses'){
   $city=null;foreach($known as $name=>$info)if(fixtureRef($info[0])===$properties['CityRef'])$city=$name;[$id,$area,$branches]=$known[$city];$rows=[];
   foreach($branches as $branch)$rows[]=['Number'=>$branch,'Description'=>'Відділення №'.$branch,'CityDescription'=>$city==='Ксаверівка'?$city.' (Вінницька обл.)':$city,'SettlementAreaDescription'=>$area,'CityRef'=>fixtureRef($id),'Ref'=>fixtureRef($id*100+(int)$branch)];
   ${mode==='ambiguous' ? "if($city==='Березань'){$other=$rows[0];$other['Ref']=fixtureRef(9999);$rows[]=$other;}" : ''}
   ${mode==='missing_cargo' ? "if($city==='Вінниця')$rows=array_values(array_filter($rows,fn($r)=>$r['Number']!=='36'));" : ''}
   return $rows;
  }
  throw new RuntimeException('Unexpected API operation; writes are forbidden');
 };
 `);
 const run=args=>spawnSync(php,[...options,'-d','auto_prepend_file='+transport,path.join(site,'dev/configure-np.php'),...args],{env,encoding:'utf8',timeout:8000});
 const saved=()=>JSON.parse(spawnSync(php,[...options,'-r',`echo json_encode(require '${config}');`],{env,encoding:'utf8'}).stdout);
 return {parent,site,config,run,saved,close:()=>rmSync(parent,{recursive:true,force:true})};
}
test('NP setup dry run resolves directories and sender without changing private configuration',()=>{
 const f=fixture();try{const original=readFileSync(f.config,'utf8');const r=f.run([]);assert.equal(r.status,0,r.stderr);assert.equal(readFileSync(f.config,'utf8'),original);assert.match(r.stdout,/"waybills_created":0/);assert.match(r.stdout,/"cargo_origins_ready":\["kiborg"\]/);assert.equal(r.stdout.includes('private-np-fixture'),false);}finally{f.close();}
});
test('NP setup preserves credentials, backs up configuration, adds manager and both Kiborg origins, and disables COD',()=>{
 const f=fixture();try{
  const r=f.run(['--apply','--manager-email=owner@example.com']);assert.equal(r.status,0,r.stderr);const c=f.saved();
  assert.equal(c.db_pass,'private-db-fixture');assert.equal(c.mono_token,'private-mono-fixture');assert.equal(c.nova_poshta_api_key,'private-np-fixture');assert.deepEqual(c.supplier_contacts,{m_vin:{enabled:false}});
  assert.equal(c.np_sender.phone,'380671234567');assert.equal(c.np_sender.confirmed,true);assert.equal(c.np_ttn_enabled,true);assert.equal(c.np_cod_contract_confirmed,false);assert.equal(c.np_cod_service,'');assert.deepEqual(c.np_manager_emails,['owner@example.com']);
  assert.equal(c.np_origin_refs.kiborg.warehouse_ref.endsWith('005009'),true);assert.equal(c.np_origin_refs.kiborg.cargo_warehouse_ref.endsWith('005036'),true);assert.equal(c.np_origin_refs.kiborg.cargo_confirmed,true);assert.equal(statSync(f.config).mode&0o777,0o600);assert.ok(existsSync(path.join(f.parent,'rubizh-private-backups')));
  const senderCheck=spawnSync(php,[...options,'-r',`require '${path.join(f.parent,'transport.php')}';require '${f.site}/api/lib.php';require '${f.site}/shop/np-lib.php';class DummyPDO extends PDO{public function __construct(){}}echo json_encode(npVerifiedSender(new DummyPDO));`],{env,encoding:'utf8'});
  assert.equal(senderCheck.status,0,senderCheck.stderr||senderCheck.stdout);assert.equal(JSON.parse(senderCheck.stdout).phone,'380671234567');
  const repeated=f.run(['--apply']);assert.equal(repeated.status,0,repeated.stderr);assert.deepEqual(f.saved(),c);
 }finally{f.close();}
});
test('Ambiguous contacts and invalid manager identity leave hosting configuration unchanged',()=>{
 for(const mode of ['contacts','normal']){const f=fixture(mode);try{const before=readFileSync(f.config,'utf8');const r=f.run(['--apply','--manager-email='+ (mode==='normal'?'invalid':'owner@example.com')]);assert.notEqual(r.status,0);assert.equal(readFileSync(f.config,'utf8'),before);assert.match(r.stderr,mode==='contacts'?/interactive/:/email/);}finally{f.close();}}
});
test('Ambiguous depots and missing cargo branches remain unavailable rather than guessing',()=>{
 for(const mode of ['ambiguous','missing_cargo']){const f=fixture(mode);try{const r=f.run(['--apply','--manager-email=owner@example.com']);assert.equal(r.status,0,r.stderr);const c=f.saved();if(mode==='ambiguous')assert.equal(c.np_origin_refs.tactical_belt.confirmed,false);else assert.equal(c.np_origin_refs.kiborg.cargo_confirmed,false);}finally{f.close();}}
});
test('Kiborg shipment payload uses branch 9 through 30 kg and branch 36 above 30 kg, with no COD',()=>{
 const source=`
 define('RUBIZH_NP_TESTS',true);function fixtureRef($n){return sprintf('00000000-0000-0000-0000-%012d',$n);}
 $GLOBALS['fixture_config']=['np_origin_refs'=>['kiborg'=>['city_ref'=>fixtureRef(50),'warehouse_ref'=>fixtureRef(5009),'cargo_warehouse_ref'=>fixtureRef(5036),'expected_area'=>'Вінницька','confirmed'=>true,'cargo_confirmed'=>true]]];
 function cfg($key){return $GLOBALS['fixture_config'][$key]??null;}
 $GLOBALS['np_test_transport']=function($model,$method,$p){$ref=$p['Ref'];return [['Ref'=>$ref,'CityRef'=>fixtureRef(50),'Description'=>'Відділення','CityDescription'=>'Вінниця','Number'=>$ref===fixtureRef(5036)?'36':'9','SettlementAreaDescription'=>'Вінницька','WarehouseStatus'=>'Working']];};
 class FixtureStatement extends PDOStatement{public function execute(?array $p=null):bool{return true;}public function fetchColumn(int $n=0):mixed{return false;}}
 class FixturePDO extends PDO{public function __construct(){}public function prepare(string $q,array $o=[]):PDOStatement|false{return new FixtureStatement;}public function exec(string $q):int|false{return 0;}}
 require '${root}/shop/np-fulfillment.php';$db=new FixturePDO;$results=[];
 foreach([29.999,30,30.001] as $weight){$package=['places'=>[['weight'=>$weight,'length'=>20,'width'=>20,'height'=>20]]];$origin=npVerifiedOrigin($db,'kiborg',npPackage($package)['weight']);$props=npSaveProperties(['package_json'=>json_encode($package),'declared_value'=>100,'operation_key'=>'fixture'],$origin,['ref'=>fixtureRef(1),'contact_ref'=>fixtureRef(2),'phone'=>'380671234567'],['type'=>'branch','city_ref'=>fixtureRef(60)],['payment'=>'card','phone'=>'380671234568'],fixtureRef(3),fixtureRef(4),fixtureRef(5));$results[]=['branch'=>$origin['branch'],'sender_address'=>$props['SenderAddress'],'type'=>$props['CargoType'],'cod'=>isset($props['AfterpaymentOnGoodsCost'])];}
 $GLOBALS['fixture_config']['np_origin_refs']['kiborg']['cargo_confirmed']=false;$blocked=false;try{npVerifiedOrigin($db,'kiborg',31);}catch(RuntimeException $e){$blocked=true;}
 echo json_encode(['shipments'=>$results,'missing_cargo_blocked'=>$blocked,'supplier'=>npSupplierCode('sku','product','Кіборг')]);`;
 const r=spawnSync(php,[...options,'-r',source],{env,encoding:'utf8',timeout:8000});assert.equal(r.status,0,r.stderr||r.stdout);const result=JSON.parse(r.stdout);
 assert.deepEqual(result.shipments.map(s=>s.branch),['9','9','36']);assert.deepEqual(result.shipments.map(s=>s.type),['Parcel','Parcel','Cargo']);assert.equal(result.shipments[2].sender_address.endsWith('005036'),true);assert.ok(result.shipments.every(s=>!s.cod));assert.equal(result.missing_cargo_blocked,true);assert.equal(result.supplier,'kiborg');
});
test('NP setup retries bounded rate-limited reads, caches duplicate lookups, and never retries document writes or other rejections',()=>{
 const source=`
 define('RUBIZH_NP_TESTS',true);define('RUBIZH_NP_SETUP_READS',true);require '${root}/shop/np-lib.php';
 $calls=[];$pauses=[];$GLOBALS['np_setup_test_pause']=function($s)use(&$pauses){$pauses[]=$s;};
 $GLOBALS['np_test_transport']=function($model,$method,$p)use(&$calls){$key=$model.'.'.$method;$calls[$key]=($calls[$key]??0)+1;
  if($key==='Address.getCities'){if($calls[$key]<3)throw new NpRateLimited('Too many requests');return [['Ref'=>'city-fixture']];}
  if($key==='Address.getWarehouses'||$key==='InternetDocument.save')throw new NpRateLimited('Too many requests');
  throw new NpRejected('Invalid sender');
 };
 $first=npApiCall('Address','getCities',['FindByString'=>'fixture']);$cached=npApiCall('Address','getCities',['FindByString'=>'fixture']);
 foreach([['Address','getWarehouses'],['InternetDocument','save'],['Counterparty','getCounterparties']] as [$model,$method]){try{npApiCall($model,$method);}catch(NpRejected $e){}}
 echo json_encode(['calls'=>$calls,'cached'=>$first===$cached,'backoff'=>array_values(array_filter($pauses,fn($s)=>$s>=10))]);`;
 const r=spawnSync(php,[...options,'-r',source],{env,encoding:'utf8',timeout:8000});assert.equal(r.status,0,r.stderr||r.stdout);const result=JSON.parse(r.stdout.trim().split('\n').at(-1));
 assert.equal(result.calls['Address.getCities'],3);assert.equal(result.cached,true);assert.equal(result.calls['Address.getWarehouses'],4);assert.equal(result.calls['InternetDocument.save'],1);assert.equal(result.calls['Counterparty.getCounterparties'],1);assert.deepEqual(result.backoff,[10,20,10,20,40]);
});
test('Checkout survives only transient directory reads; unverified delivery blocks TTN until server verification',()=>{
 const source=`
 define('RUBIZH_NP_TESTS',true);function cfg($key){return $key==='np_ttn_enabled';}function fixtureRef($n){return sprintf('00000000-0000-0000-0000-%012d',$n);}
 class FixtureStatement extends PDOStatement{public function execute(?array $p=null):bool{return true;}public function fetchColumn(int $n=0):mixed{return false;}}
 class FixturePDO extends PDO{public function __construct(){}public function prepare(string $q,array $o=[]):PDOStatement|false{return new FixtureStatement;}public function exec(string $q):int|false{return 0;}}
 require '${root}/shop/np-fulfillment.php';$db=new FixturePDO;$calls=[];$mode='healthy';$failure='';
 $GLOBALS['np_test_transport']=function($model,$method,$p)use(&$calls,&$mode,&$failure){$calls[]=$model.'.'.$method;if($model!=='Address')throw new LogicException('Provider writes forbidden');
  if($method===$failure){if($mode==='unknown')throw new NpUnknownResult('timeout');if($mode==='rate')throw new NpRateLimited('limit');if($mode==='rejected')throw new NpRejected('invalid key');}
  if($method==='getCities')return $mode==='notfound'?[]:[['Ref'=>fixtureRef(10),'Description'=>'Київ']];
  if($method==='getWarehouses')return [['Ref'=>fixtureRef(20),'CityRef'=>fixtureRef($mode==='mismatch'?99:10),'Description'=>$mode==='postomat'?'Поштомат №1':'Відділення №1']];
  if($method==='getStreet')return [['Ref'=>fixtureRef(30),'Description'=>'Хрещатик']];throw new LogicException('Unexpected directory');};
 $contact=['city'=>'Київ','address'=>'Відділення №1','np_delivery'=>['city_ref'=>fixtureRef(10),'warehouse_ref'=>fixtureRef(20)]];
 $results=[];foreach(['unknown','rate'] as $mode)foreach(['getCities','getWarehouses','getStreet'] as $failure){$c=$contact;$type='branch';if($failure==='getStreet'){$type='courier';$c['address']='Хрещатик, 1';$c['np_delivery']=['city_ref'=>fixtureRef(10),'street_ref'=>fixtureRef(30),'building'=>'1','flat'=>'2'];}$before=count($calls);try{$results[]=npValidateDelivery($db,$c,$type)+['read_count'=>count($calls)-$before];}catch(Throwable $e){$results[]=['error'=>get_class($e)];}}
 $missing=[];foreach(['unknown','rate','healthy'] as $mode){$failure='getCities';try{$missing[$mode]=npValidateDelivery($db,['city'=>'Київ','address'=>'Відділення №1','np_delivery'=>[]],'branch');}catch(Throwable $e){$missing[$mode]=['error'=>get_class($e)];}}
 foreach(['branch','courier'] as $type){$mode='unknown';$failure=$type==='courier'?'getStreet':'getWarehouses';$missing[$type]=npValidateDelivery($db,['city'=>'Київ','address'=>'Місце отримання','np_delivery'=>['city_ref'=>fixtureRef(10)]],$type);}
 $rejections=[];foreach(['invalid_city','invalid_point','invalid_building','missing_point','notfound','mismatch','postomat','rejected','no_text'] as $case){$c=$contact;$type='branch';$mode='healthy';$failure='getCities';
  if($case==='invalid_city'||$case==='invalid_point'){$mode='unknown';$c['np_delivery'][$case==='invalid_city'?'city_ref':'warehouse_ref']='bad-ref';}
  elseif($case==='invalid_building'){$mode='unknown';$type='courier';$c['np_delivery']=['city_ref'=>fixtureRef(10),'street_ref'=>fixtureRef(30),'building'=>'<bad>'];}
  elseif($case==='missing_point')unset($c['np_delivery']['warehouse_ref']);elseif($case==='no_text'){$mode='unknown';unset($c['city'],$c['address']);}else $mode=$case;
  try{npValidateDelivery($db,$c,$type);$rejections[$case]=false;}catch(Throwable $e){$rejections[$case]=true;}}
 $mode='healthy';$failure='';$verified=npValidateDelivery($db,['np_delivery'=>$contact['np_delivery']],'branch');
 $order=['status'=>'confirmed','payment_status'=>'paid','contact'=>['payment'=>'invoice','recipient'=>'Тест Покупець','delivery_type'=>'branch']];$shipment=['supplier_code'=>'m_vin','status'=>'draft','package_json'=>'{"places":[{"weight":1,"length":20,"width":20,"height":20}]}','declared_value'=>100];$readiness=[];
 foreach([$results[0],['manual'=>true,'city_ref'=>fixtureRef(10),'warehouse_ref'=>fixtureRef(20)],['city_ref'=>fixtureRef(10)],$verified] as $delivery){$order['contact']['np_delivery']=$delivery;try{npAssertReady($order,['availability_confirmed'=>1],[],[$shipment],$shipment);$readiness[]=true;}catch(Throwable $e){$readiness[]=false;}}
 echo json_encode(compact('results','missing','rejections','verified','readiness','calls'));`;
 const r=spawnSync(php,[...options,'-r',source],{env,encoding:'utf8',timeout:8000});assert.equal(r.status,0,r.stderr||r.stdout);const result=JSON.parse(r.stdout);
 for(const delivery of result.results){assert.equal(delivery.manual,true,JSON.stringify(delivery));assert.ok(delivery.unverified_refs);assert.equal('city_ref' in delivery,false);assert.equal('warehouse_ref' in delivery,false);assert.equal('verified_at' in delivery,false);assert.equal(delivery.city,'Київ');assert.ok(delivery.address);assert.ok(delivery.read_count<=2);}
 for(const mode of ['unknown','rate'])assert.equal(result.missing[mode].manual,true);assert.ok(result.missing.healthy.error);
 for(const type of ['branch','courier'])assert.equal(result.missing[type].manual,true);
 assert.ok(Object.values(result.rejections).every(Boolean),JSON.stringify(result.rejections));assert.deepEqual(result.readiness,[false,false,false,true]);assert.ok(result.verified.verified_at);assert.ok(result.calls.every(call=>call.startsWith('Address.')));
});
test('LOG01: transient read outages save one real checkout with manual address; healthy missing refs still reject',{skip:!process.env.RUBIZH_TEST_MYSQL_SOCKET,timeout:120000},async()=>{
 const s=await startSite({enableV3:false,extraConfig:",'nova_poshta_api_key'=>'fixture-only-np-key'"});
 try{
  const modeFile=s.dir+'/np-mode';writeFileSync(modeFile,'unknown');
  writeFileSync(s.site+'/router.php',`<?php define('RUBIZH_NP_TESTS',true);$GLOBALS['np_test_transport']=function($model,$method,$p){if($model!=='Address'||!in_array($method,['getCities','getWarehouses','getStreet'],true))throw new LogicException('No provider writes allowed');$mode=trim(file_get_contents('${modeFile}'));if($mode==='unknown')throw new NpUnknownResult('timeout');if($mode==='rate')throw new NpRateLimited('rate limited');return [];};return false;`);
  const product={id:'log01-fixture',name:'Тест логістики',brand:'QA',canonical_category_id:'clothing_headwear',category:'Одяг та форма / Головні убори',category_path:['Одяг та форма','Головні убори'],photos:['https://img.test/log01.png'],variants:[{sku:'LOG01-M',size:'M',size_display:'M',color:'Олива',price:1000,stock:20,availability:'in'}]};
  sitePhp(`require '${s.site}/api/lib.php';save_product(db(),json_decode(${JSON.stringify(JSON.stringify(product))},true));`);
  const buyer=await s.get('/shop/customer.php'),headers={Cookie:buyer.headers.get('set-cookie').split(';')[0]},lines=[{product_id:product.id,sku:'LOG01-M',qty:1}];
  const quote=await s.post('/shop/checkout-quote.php',{csrf:buyer.data.csrf,lines,payment:'invoice'},headers);assert.equal(quote.status,200,JSON.stringify(quote.data));
  const contact={name:'Тест Покупець',recipient:'Тест Покупець',phone:'+380671234567',city:'Київ',address:'Відділення №1',delivery_type:'branch',np_delivery:{}};
  for(const [index,mode] of ['unknown','rate'].entries()){
   writeFileSync(modeFile,mode);const directory=await s.get('/shop/np-directory.php?kind=cities&q='+encodeURIComponent(contact.city));assert.equal(directory.status,503);
   const input={csrf:buyer.data.csrf,request_id:String(index+1).padStart(32,'0'),contact,payment:'invoice',lines,expected_total:quote.data.quote.total,catalog_version:quote.data.quote.catalog_version};
   const first=await s.post('/shop/order.php',input,headers);assert.equal(first.status,200,JSON.stringify(first.data));const again=await s.post('/shop/order.php',input,headers);assert.equal(again.status,200,JSON.stringify(again.data));assert.equal(again.data.order.id,first.data.order.id);
   const saved=JSON.parse(s.sql('SELECT contact_json FROM rubizh_order_details WHERE order_id='+first.data.order.id)[0].contact_json);assert.equal(saved.np_delivery.manual,true);assert.deepEqual(saved.np_delivery.unverified_refs,[]);assert.equal(saved.city,contact.city);assert.equal(saved.address,contact.address);assert.equal(saved.np_delivery.type,'branch');assert.equal('verified_at' in saved.np_delivery,false);
  }
  assert.equal(+s.sql('SELECT COUNT(*) n FROM rubizh_customer_orders')[0].n,2);
  writeFileSync(modeFile,'healthy');const rejected=await s.post('/shop/order.php',{csrf:buyer.data.csrf,request_id:'3'.repeat(32),contact:{...contact,np_delivery:{manual:true}},payment:'invoice',lines,expected_total:quote.data.quote.total,catalog_version:quote.data.quote.catalog_version},headers);assert.equal(rejected.status,400,JSON.stringify(rejected.data));assert.equal(+s.sql('SELECT COUNT(*) n FROM rubizh_customer_orders')[0].n,2);
 }finally{s.stop();}
});
test('Only current directory 503 enables free text, and input edits preserve no verified refs',async()=>{
 const source=readFileSync(path.join(root,'assets/shop-client.2026101101.js'),'utf8');
 function method(name,context){const from=source.lastIndexOf('\n        '+name+'=')+('\n        '+name+'=').length;const next=source.slice(from).search(/\n        [a-zA-Z_]\w*[=(]/);return runInNewContext('(function(){return ('+source.slice(from,from+next).trim().replace(/;$/,'')+');})',{setTimeout,clearTimeout,document:{querySelector:()=>null},storeCheckoutPay:()=> 'invoice',storeAttemptKey:()=> 'fixture-key'}).call(context);}
 for(const status of [503,400,429,401,undefined]){const c={state:{npEnabled:true,npManual:true,npCityRef:'',delivery:'np',cityQ:'Київ',pointQ:'',npCities:[]},setState(p){Object.assign(this.state,p);},storeRequest:async()=>{throw Object.assign(new Error('fixture'),{status});}};
  c.npSearch=method('npSearch',c);c.npSearch('cities','Київ');await new Promise(resolve=>setTimeout(resolve,320));assert.equal(c.state.npManual===true,status===503,String(status));
  if(status===503){c.state.npWarehouseRef='old';method('npPointInput',c)({target:{value:'Відділення №1'}});assert.equal(c.state.point,'Відділення №1');assert.equal(c.state.npWarehouseRef,'');method('npCityInput',c)({target:{value:'Львів'}});assert.equal(c.state.city,'Львів');clearTimeout(c._npTimer);}
 }
 const c={state:{npEnabled:true,npCityRef:'',delivery:'np',cityQ:'Київ',pointQ:''},setState(p){Object.assign(this.state,p);},storeRequest:async()=>{throw Object.assign(new Error('stale'),{status:503});}};method('npSearch',c)('cities','Київ');c.state.delivery='courier';await new Promise(resolve=>setTimeout(resolve,320));assert.notEqual(c.state.npManual,true);
 for(const manual of [true,false]){let submitted;const c={state:{npEnabled:true,npManual:manual,delivery:'courier',cityQ:'Київ',pointQ:'Хрещатик',npBuilding:'1',npFlat:'2',checkoutName:'Тест Покупець',checkoutPhone:'0671234567',cart:[]},setState(p){Object.assign(this.state,p);},storePricingLines:()=>[],renderVals:()=>({storeTotal:1000}),storeRequest:async(url,input)=>{submitted=input;throw new Error('Recorded request');}};await method('submitOrder',c)([]);assert.equal(Boolean(submitted),manual);if(manual){assert.equal(submitted.contact.address,'Хрещатик, 1, кв. 2');assert.equal(submitted.contact.np_delivery.city_ref,'');assert.equal('manual' in submitted.contact.np_delivery,false);}}
});
