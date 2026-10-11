// Read-only provider connectivity check (scratch tool, not shipped). Run ONLY through the secrets loader, one provider at a time:
//   ~/Projects/rubizh-test-secrets/run-testing.sh monobank -- node tests/.staging/qa-connectivity.mjs
// Hard allowlist of read-only requests; no payments, no TTN, no SMS can be made from here. Keys are never printed:
// every output line is passed through a redactor that removes the key value.
const provider=process.env.RUBIZH_INTEGRATION_PROVIDER,mode=process.env.RUBIZH_INTEGRATION_MODE||'readonly';
const keys=[process.env.RUBIZH_MONO_TOKEN,process.env.RUBIZH_NP_API_KEY,process.env.RUBIZH_TURBOSMS_TOKEN].filter(Boolean);
const say=(...a)=>{let s=a.join(' ');for(const k of keys)s=s.split(k).join('<redacted>');console.log(s);};
const get=async(url,headers={},body=null)=>{const r=await fetch(url,{method:body?'POST':'GET',headers:{...headers,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000),redirect:'error'});let j=null;try{j=await r.json();}catch{}return {status:r.status,json:j};};
if(!provider)throw new Error('Run through run-testing.sh (one provider per run).');
say(`provider=${provider} mode=${mode}`);
try{
 if(provider==='monobank'){
  const t=process.env.RUBIZH_MONO_TOKEN;if(!t)throw new Error('RUBIZH_MONO_TOKEN missing');
  const d=await get('https://api.monobank.ua/api/merchant/details',{'X-Token':t});
  say('merchant/details HTTP',d.status,d.json?`merchantName="${d.json.merchantName??''}" edrpou=${d.json.edrpou?'present':'absent'} error=${d.json.errCode??''}`:'');
  const k=await get('https://api.monobank.ua/api/merchant/pubkey',{'X-Token':t});
  say('merchant/pubkey HTTP',k.status,'key',k.json?.key?'received':'absent');
  say('Classify: a test token belongs to a test merchant (check merchantName); a real merchant token stays readonly.');
 }else if(provider==='novaposhta'){
  const key=process.env.RUBIZH_NP_API_KEY;if(!key)throw new Error('RUBIZH_NP_API_KEY missing');
  const r=await get('https://api.novaposhta.ua/v2.0/json/',{},{apiKey:key,modelName:'Address',calledMethod:'getAreas',methodProperties:{}});
  say('Address.getAreas HTTP',r.status,'success',r.json?.success,'items',(r.json?.data||[]).length,'errors',JSON.stringify(r.json?.errors||[]).slice(0,160));
  say('Nova Poshta has no sandbox: this key is a real account key — readonly lookups only, never InternetDocument.');
 }else if(provider==='turbosms'){
  const t=process.env.RUBIZH_TURBOSMS_TOKEN;if(!t)throw new Error('RUBIZH_TURBOSMS_TOKEN missing');
  const r=await get('https://api.turbosms.ua/user/balance.json',{Authorization:'Bearer '+t});
  say('user/balance HTTP',r.status,'response_code',r.json?.response_code,'status',r.json?.response_status,'balance',r.json?.response_result?.balance??'n/a');
  say('TurboSMS has no sandbox: real account — no message/send from this tool.');
 }else throw new Error('Unknown provider');
}catch(e){say('ERROR',e.name,String(e.message).slice(0,160));process.exitCode=1;}
