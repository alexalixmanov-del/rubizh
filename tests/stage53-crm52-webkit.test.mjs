// Stage 5.3, CRM-5.2: in 1 of 4 CI runs the strict CRM matrix got the WebKit page error «Importing a module script
// failed.». A CRM section is a separate chunk loaded by React.lazy; when the page is left while that chunk is still
// loading, WebKit rejects the import while the old page's scripts still run, and React 19 reports the render error as
// uncaught. The CRM now holds such a failure back while the page is being left (crm.rubizh src/lib.ts holdWhileLeaving)
// and releases it unchanged if the page is not left after all.
// 1) A page with no CRM code: a slow module import cut off by a navigation — reported as is, through React-style
//    reportError, and held like the CRM does — in WebKit, Chromium and Firefox. Counts go to the reports (Linux CI evidence).
// 2) The real CRM build: ≥ 20 navigations per engine away from a section whose chunk is still loading — 0 page errors.
import {test} from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {writeFileSync,mkdirSync,readFileSync} from 'node:fs';import path from 'node:path';
import {chromium,firefox,webkit} from 'playwright';
import {startCrm,password,staffEmail} from './helpers/crm-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const reports=process.env.RUBIZH_TEST_REPORTS||'/workspace/reports';
const ENGINES=[['webkit',()=>webkit.launch()],['chromium',()=>chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']})],['firefox',()=>firefox.launch()]];
const save=(name,data)=>{try{mkdirSync(reports,{recursive:true});writeFileSync(path.join(reports,name),JSON.stringify(data,null,1));}catch{}};

// reported: the rejection reaches reportError (what React 19 does with an uncaught render error);
// held: the CRM way — while beforeunload/pagehide fired the failure is not reported.
const html=mode=>`<!doctype html><title>m</title><h1>m</h1><script>
const mode=${JSON.stringify(mode)};let leaving=false;addEventListener('beforeunload',()=>leaving=true);addEventListener('pagehide',()=>leaving=true);
const load=()=>import('/slow.mjs?'+Math.random());
const report=e=>{if(mode==='held'&&leaving)return;reportError(e);};
if(mode!=='none'){load().catch(report);setInterval(()=>load().catch(report),20);}
</script>`;

test('CRM-5.2: a module import cut off by a navigation — reported vs held (WebKit, Chromium, Firefox)',{timeout:300000},async()=>{
 const server=http.createServer((req,res)=>{if(req.url.startsWith('/slow.mjs')){res.setHeader('Content-Type','text/javascript');const t=setTimeout(()=>res.end('export default 1;'),2500);req.on('close',()=>clearTimeout(t));return;}res.setHeader('Content-Type','text/html');res.end(html(new URL(req.url,'http://x').searchParams.get('m')||'none'));}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;const report={platform:process.platform,engines:{}};
 try{
  for(const [name,launch] of ENGINES){const browser=await launch();report.engines[name]={};
   try{for(const mode of ['reported','held']){const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    // Pending imports hold the load event: navigate on commit, like a user who leaves while the page still loads.
    for(let i=0;i<20;i++){await page.goto(base+'/a?m='+mode,{waitUntil:'commit'});await page.waitForTimeout(300);await page.goto(base+'/b?m=none');}
    await page.close();report.engines[name][mode]={navigations:20,page_errors:errors.length,sample:[...new Set(errors)].slice(0,3)};
    if(mode==='held')assert.deepEqual(errors,[],name+': a held failure is never reported');
   }}finally{await browser.close();}
  }
 }finally{server.close();save('crm52-module-probe.json',report);}
});

test('CRM-5.2: the CRM build — 24 navigations per engine away from a section whose chunk is still loading, 0 page errors',{skip,timeout:900000},async()=>{
 const s=await startCrm({frontend:true});const result={platform:process.platform,engines:{}};
 const entry=readFileSync(path.join(s.site,'crm/index.html'),'utf8').match(/src="(\/crm\/assets\/index-[^"]+\.js)"/)[1];
 const sections=['/orders','/customers','/payments','/products','/tasks','/staff','/settings','/analytics'];
 try{
  for(const [name,launch] of ENGINES){const browser=await launch();
   try{
    const ctx=await browser.newContext({viewport:{width:430,height:900}});const page=await ctx.newPage();const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(s.base+'/crm/');await page.getByLabel('Email').fill(staffEmail('OWNER'));await page.getByLabel('Пароль',{exact:true}).fill(password);
    await page.getByRole('button',{name:'Увійти'}).click();await page.getByRole('navigation',{name:'Основне'}).first().waitFor({state:'attached'});
    // Section chunks (everything but the entry) answer slowly, so the next navigation always cuts a section load.
    let delayed=0;const slow=/\/crm\/assets\/[^/]+\.js$/;
    await page.route(slow,async route=>{if(new URL(route.request().url()).pathname!==entry){delayed++;await new Promise(r=>setTimeout(r,1500));}try{await route.continue();}catch{}});
    for(let i=0;i<24;i++){await page.goto(s.base+'/crm'+sections[i%sections.length]);await page.waitForTimeout(250);}
    // Last stop: let a section finish loading — the app still works.
    await page.unroute(slow);await page.goto(s.base+'/crm/orders');await page.getByRole('heading',{level:1}).first().waitFor({timeout:20000});
    result.engines[name]={navigations:24,delayed_chunk_requests:delayed,page_errors:errors.length,sample:errors.slice(0,3)};
    assert.ok(delayed>=10,name+': section loads were really cut ('+delayed+')');
    assert.deepEqual(errors,[],name+' page errors');await ctx.close();
   }finally{await browser.close();}
  }
 }finally{s.stop();save('crm52-crm.json',result);}
});
