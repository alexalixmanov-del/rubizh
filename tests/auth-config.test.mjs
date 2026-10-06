import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,copyFileSync,writeFileSync,rmSync,existsSync,mkdirSync,readFileSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
const php=process.env.PHP_PATH||(existsSync('/workspace/php-runtime/root/usr/bin/php8.4')?'/workspace/php-runtime/root/usr/bin/php8.4':'php');
function runPHP(source,environment={},privateConfig=null){
  const dir=mkdtempSync(path.join(tmpdir(),'rubizh-auth-check-'));
  try{
    for(const file of ['identities.php','phone.php'])copyFileSync(path.join(root,'auth',file),path.join(dir,file));
    for(const file of ['mono-private.php','np-private.php'])copyFileSync(path.join(root,'api',file),path.join(dir,file));
    if(privateConfig!==null)writeFileSync(path.join(dir,'config.php'),'<?php return '+privateConfig+';');
    writeFileSync(path.join(dir,'test.php'),`<?php define('RUBIZH_AUTH',true);define('RUBIZH_PRIVATE_CONFIG',true);require __DIR__.'/identities.php';require __DIR__.'/phone.php';function check($value,$message){if(!$value)throw new RuntimeException($message);}\n${source}\necho 'passed';`);
    const env={...process.env,LD_LIBRARY_PATH:process.env.LD_LIBRARY_PATH||'/workspace/php-runtime/root/usr/lib/x86_64-linux-gnu'};
    for(const name of Object.keys(env))if(name.startsWith('RUBIZH_'))delete env[name];
    Object.assign(env,environment);
    const result=spawnSync(php,['-n','-d','display_errors=0',path.join(dir,'test.php')],{encoding:'utf8',env,timeout:5000});
    assert.equal(result.status,0,result.stderr||result.error?.message);assert.equal(result.stdout,'passed');
  }finally{rmSync(dir,{recursive:true,force:true});}
}
const config="['sms_enabled'=>true,'turbosms_token'=>'fixture-token','turbosms_sender'=>'RUBIZH','auth_secret'=>str_repeat('a',48),'google_enabled'=>true,'google_client_id'=>'123456789-fixture.apps.googleusercontent.com','google_client_secret'=>'fixture-google','noreply_password'=>'fixture-mail']";
test('Private authentication config remains usable when environment overrides are absent',()=>runPHP("check(smsEnabled(),'SMS config should remain enabled');check(googleEnabled(),'Google config should remain enabled');check(authConfig()['noreply_password']==='fixture-mail','Mailbox password changed');",{},config));
test('Explicit environment flags disable SMS and Google even with enabled private config',()=>{
  for(const flag of ['false','0','invalid'])runPHP("check(!smsEnabled(),'Disabled SMS unexpectedly enabled');check(!googleEnabled(),'Google must require enabled phone verification');",{RUBIZH_SMS_ENABLED:flag},config);
  runPHP("check(smsEnabled(),'SMS unexpectedly disabled');check(!googleEnabled(),'Google explicit disable ignored');",{RUBIZH_GOOGLE_ENABLED:'false'},config);
});
test('SMS requires the token, sender, explicit enablement and a long application secret',()=>{
  const env={RUBIZH_SMS_ENABLED:'true',RUBIZH_TURBOSMS_TOKEN:'fixture-token',RUBIZH_TURBOSMS_SENDER:'RUBIZH',RUBIZH_AUTH_SECRET:'a'.repeat(48)};
  runPHP("check(smsEnabled(),'Complete SMS config should be enabled');",env);
  for(const name of Object.keys(env))runPHP("check(!smsEnabled(),'Incomplete SMS config must stay disabled');",{...env,[name]:name==='RUBIZH_AUTH_SECRET'?'short':''});
});
test('Environment credentials override private values and mailbox password spacing is preserved',()=>runPHP("$c=authConfig();check($c['turbosms_token']==='environment-fixture','Token override ignored');check($c['turbosms_sender']==='RUBIZH','Sender trim failed');check($c['noreply_password']===' fixture-mail ','Mailbox password was trimmed');",{RUBIZH_TURBOSMS_TOKEN:'environment-fixture',RUBIZH_TURBOSMS_SENDER:' RUBIZH ',RUBIZH_NOREPLY_PASSWORD:' fixture-mail '},config));
test('Empty environment stubs preserve Monobank and Nova Poshta keys stored on hosting',()=>{
  runPHP("$base=['mono_token'=>'saved-mono','nova_poshta_api_key'=>'saved-np'];$merged=array_replace($base,require __DIR__.'/mono-private.php',require __DIR__.'/np-private.php');check($merged===$base,'Empty stubs discarded private hosting keys');");
  runPHP("$merged=array_replace(['mono_token'=>'saved-mono','nova_poshta_api_key'=>'saved-np'],require __DIR__.'/mono-private.php',require __DIR__.'/np-private.php');check($merged['mono_token']==='environment-mono'&&$merged['nova_poshta_api_key']==='environment-np','Environment override ignored');",{RUBIZH_MONO_TOKEN:'environment-mono',RUBIZH_NP_API_KEY:'environment-np'});
});
test('Phone normalization and code hashes bind verification to the phone and challenge',()=>runPHP("check(authPhone('067 123 45 67')==='+380671234567','National phone normalization failed');check(authPhone('+38 (067) 123-45-67')==='+380671234567','Formatted phone normalization failed');try{authPhone('+441234567890');throw new LogicException('Invalid phone accepted');}catch(RuntimeException $expected){}$hash=phoneCodeHash('challenge-a','+380671234567','123456');check(strlen($hash)===64,'Hash length invalid');check($hash!==phoneCodeHash('challenge-b','+380671234567','123456'),'Code not bound to challenge');check($hash!==phoneCodeHash('challenge-a','+380671234568','123456'),'Code not bound to phone');",{},config));
test('TurboSMS success requires an accepted result for the exact recipient and a message ID',()=>runPHP("$item=['phone'=>'380671234567','response_code'=>0,'message_id'=>'fixture-message'];foreach([0,800,801,802,803,507] as $code){check(turboSmsAccepted(['response_code'=>$code,'response_result'=>[$item]],'+380671234567'),'Valid provider result rejected');}check(!turboSmsAccepted(['response_code'=>800,'response_result'=>[$item]],'+380671234568'),'Wrong recipient accepted');foreach([null,'malformed',[],[['phone'=>'380671234567','response_code'=>305,'message_id'=>'fixture-message']],[['phone'=>'380671234567','response_code'=>0,'message_id'=>'']]] as $items){check(!turboSmsAccepted(['response_code'=>800,'response_result'=>$items],'+380671234567'),'Rejected provider result accepted');}"));
test('Hosting secret initializer preserves settings, uses private permissions and is safe to repeat',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'rubizh-secret-initializer-'));
  try{
    mkdirSync(path.join(dir,'dev'));mkdirSync(path.join(dir,'auth'));
    copyFileSync(path.join(root,'dev/init-auth-secret.php'),path.join(dir,'dev/init-auth-secret.php'));
    const file=path.join(dir,'auth/config.php');writeFileSync(file,"<?php return ['noreply_password'=>'fixture-mail','turbosms_token'=>'fixture-token','sms_enabled'=>true];");
    const env={...process.env,LD_LIBRARY_PATH:process.env.LD_LIBRARY_PATH||'/workspace/php-runtime/root/usr/lib/x86_64-linux-gnu'};delete env.RUBIZH_AUTH_SECRET;
    const execute=()=>spawnSync(php,['-n',path.join(dir,'dev/init-auth-secret.php')],{encoding:'utf8',env,timeout:5000});
    const result=execute();assert.equal(result.status,0);const contents=readFileSync(file,'utf8');const match=contents.match(/'auth_secret'\s*=>\s*'([a-f0-9]{64})'/);
    assert.ok(match,'A long random application secret should be generated');assert.ok(contents.includes("'noreply_password' => 'fixture-mail'"));assert.ok(contents.includes("'turbosms_token' => 'fixture-token'"));assert.ok(contents.includes("'sms_enabled' => true"));assert.equal(statSync(file).mode&0o777,0o600);
    assert.equal(result.stdout.includes(match[1]),false,'Generated secret must not be printed');
    const repeated=execute();assert.equal(repeated.status,0);assert.equal(readFileSync(file,'utf8')===contents,true,'Repeating initializer must preserve the signing secret');
    assert.match(repeated.stdout,/no changes made/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('Private hosting credential merge preserves the database and supplier settings and guards activation',()=>{
 const parent=mkdtempSync(path.join(tmpdir(),'rubizh-hosting-'));
 const root=path.join(parent,'www');mkdirSync(path.join(root,'dev'),{recursive:true});mkdirSync(path.join(root,'api'));mkdirSync(path.join(root,'auth'));
 copyFileSync(path.join(import.meta.dirname,'../dev/configure-services.php'),path.join(root,'dev/configure-services.php'));
 const api=path.join(root,'api/config.php'),auth=path.join(root,'auth/config.php'),source=path.join(parent,'credentials.json');
 writeFileSync(api,"<?php return ['db_host'=>'localhost','db_name'=>'fixture-db','db_pass'=>'fixture-db-password','supplier_contacts'=>['fixture'=>'preserved'],'mono_activation_confirmed'=>false];");
 writeFileSync(auth,"<?php return ['noreply_password'=>'existing-mail','auth_secret'=>str_repeat('x',48),'sms_enabled'=>false];");
 writeFileSync(source,JSON.stringify({mono_token:'fixture-mono',nova_poshta_api_key:'fixture-np',google_client_id:'fixture-id',google_client_secret:'fixture-secret'}));
 const run=args=>spawnSync(php,['-n',path.join(root,'dev/configure-services.php'),'--file='+source,...args],{encoding:'utf8',env:{...process.env,LD_LIBRARY_PATH:'/workspace/php-runtime/root/usr/lib/x86_64-linux-gnu'}});
 try{
  const failed=run(['--enable-auth']);assert.notEqual(failed.status,0);assert.equal(readFileSync(api,'utf8').includes('fixture-mono'),false);
  const result=run([]);assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.includes('fixture-secret'),false);assert.equal(statSync(auth).mode&0o777,0o600);
  const saved=spawnSync(php,['-n','-r',`echo json_encode([require '${api}',require '${auth}']);`],{encoding:'utf8',env:{...process.env,LD_LIBRARY_PATH:'/workspace/php-runtime/root/usr/lib/x86_64-linux-gnu'}});const [a,b]=JSON.parse(saved.stdout);
  assert.equal(a.db_pass,'fixture-db-password');assert.deepEqual(a.supplier_contacts,{fixture:'preserved'});assert.equal(a.mono_token,'fixture-mono');assert.equal(a.mono_activation_confirmed,false);assert.equal(b.noreply_password,'existing-mail');assert.equal(b.sms_enabled,false);assert.equal(b.auth_secret,'x'.repeat(48));
  writeFileSync(source,JSON.stringify({turbosms_token:'fixture-sms',turbosms_sender:'RUBIZH'}));assert.equal(run(['--enable-auth']).status,0);
 }finally{rmSync(parent,{recursive:true,force:true});}
});
