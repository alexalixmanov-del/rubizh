// Stage 5, 5-6 (CRM-5.1): why WebKit reports Staff API loads cancelled by a navigation as page errors. A page with no CRM
// code at all — one same-origin fetch whose rejection IS handled, then a navigation — is driven in WebKit, Chromium and
// Firefox. Playwright's WebKit backend turns every console message of level «error» from source «javascript» into a
// page error; WebKit (Linux network stack) logs a navigation-cancelled load that way. So the message is not an uncaught
// exception of the CRM and cannot be removed in the CRM; the matrix exemption stays narrow (WebKit, during page.goto, own
// origin /api/staff/, that message). The counts per engine are written to the reports for the release evidence.
import {test} from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {writeFileSync,mkdirSync,readFileSync} from 'node:fs';import path from 'node:path';
import {chromium,firefox,webkit} from 'playwright';

const html=`<!doctype html><title>probe</title><h1>probe</h1><script>
fetch('/api/staff/slow').then(r=>r.text()).catch(()=>{});
const c=new AbortController();addEventListener('pagehide',()=>c.abort());fetch('/api/staff/slow?abort=1',{signal:c.signal}).catch(()=>{});
</script>`;

test('CRM-5.1: a handled, navigation-cancelled same-origin fetch is a WebKit console message, not a page exception',{timeout:300000},async()=>{
 const server=http.createServer((req,res)=>{if(req.url.startsWith('/api/staff/slow')){const t=setTimeout(()=>res.end('ok'),2500);req.on('close',()=>clearTimeout(t));return;}res.setHeader('Content-Type','text/html');res.end(html);}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const report={platform:process.platform,engines:{}};
 try{
  for(const [name,engine] of [['webkit',webkit],['chromium',chromium],['firefox',firefox]]){
   const browser=name==='chromium'?await engine.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']}):await engine.launch();
   try{
    const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    for(let i=0;i<20;i++){await page.goto(base+'/a');await page.waitForTimeout(100);await page.goto(base+'/b');}
    report.engines[name]={navigations:20,page_errors:errors.length,sample:errors.slice(0,2)};
    // Whatever appears is only the cancelled-load console message for this origin's /api/staff/ — never anything else.
    for(const m of errors){assert.equal(name,'webkit',name+' reported '+m);assert.match(m,/due to access control checks/);assert.ok(m.includes(base+'/api/staff/slow'),m);}
   }finally{await browser.close();}
  }
  // The mechanism itself: Playwright's WebKit backend maps console errors from source «javascript» to page errors.
  const bundle=readFileSync(path.join(path.dirname(new URL(import.meta.resolve('playwright-core/package.json')).pathname),'lib/coreBundle.js'),'utf8');
  assert.match(bundle,/if \(level === "error" && source\d* === "javascript"\) \{[\s\S]{0,1500}this\._page\.addPageError\(error/,'Playwright WebKit: console error (javascript) → page error');
 }finally{
  server.close();
  const dir=process.env.RUBIZH_TEST_REPORTS||'/workspace/reports';try{mkdirSync(dir,{recursive:true});writeFileSync(path.join(dir,'crm51-webkit.json'),JSON.stringify(report,null,1));}catch{}
 }
});
