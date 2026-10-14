// Release-hardening audit (scratch tool, not shipped) on the shared QA fixture (qa-fixture.mjs):
//  1. interaction inventory: every visible control has a name and keyboard access, no empty links, ≥24px targets;
//  2. dead-click check: each non-link button on key pages must react (DOM change, navigation or request);
//  3. axe-core WCAG 2.1 A/AA at 390 and 1280 px;
//  4. Lighthouse (mobile + desktop) on key pages.
// Usage: node tests/.staging/qa-audit.mjs OUT_DIR TOOLS_DIR   (TOOLS_DIR has node_modules/axe-core and lighthouse)
import {chromium} from '/Users/l/Projects/rubizh/node_modules/playwright/index.mjs';
import {startQaSite,png} from './qa-fixture.mjs';
import {writeFileSync,mkdirSync,readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
const [out,tools]=process.argv.slice(2);mkdirSync(out,{recursive:true});
const axeSrc=readFileSync(tools+'/node_modules/axe-core/axe.min.js','utf8');
const {site,pages}=await startQaSite();
const report={started:new Date().toISOString(),inventory:[],dead:[],axe:[],lighthouse:[]};
// Same enumeration on every load so an index identifies the same control after a reload.
const enumerate=()=>{const vis=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&!e.closest('[aria-hidden="true"],[inert]');};
 return [...document.querySelectorAll('a,button,[role=button],[role=link],[role=tab],[role=checkbox],input:not([type=hidden]),select,textarea,summary')].filter(vis);};
const describe=`(${enumerate})().map((e,i)=>{const r=e.getBoundingClientRect(),name=(e.getAttribute('aria-label')||e.getAttribute('title')||e.innerText||e.value||[...e.querySelectorAll('img[alt],svg title')].map(x=>x.getAttribute('alt')||x.textContent).join(' ')||(e.labels&&[...e.labels].map(l=>l.innerText).join(' '))||e.getAttribute('placeholder')||'').trim();
 const tag=e.tagName.toLowerCase(),role=e.getAttribute('role'),native=['a','button','input','select','textarea','summary'].includes(tag);
 return {i,tag,role,name:name.slice(0,60),href:e.getAttribute('href'),w:Math.round(r.width),h:Math.round(r.height),
  noName:!name,noKeyboard:!native&&!(e.tabIndex>=0),emptyLink:tag==='a'&&(!e.getAttribute('href')||/^#?$|^javascript:/i.test(e.getAttribute('href'))),
  small:(r.width<24||r.height<24)&&!(tag==='a'&&getComputedStyle(e).display==='inline'),clickable:(tag==='button'||role==='button'||role==='tab'||tag==='summary')&&!e.disabled&&e.getAttribute('aria-disabled')!=='true'};})`;
try{
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
try{
 for(const width of [390,1280]){
  const mobile=width<768,context=await browser.newContext({viewport:{width,height:mobile?844:900},bypassCSP:true,...(mobile?{isMobile:true,hasTouch:true}:{})});
  await context.route('https://img.test/**',r=>r.fulfill({contentType:'image/png',body:png}));
  const load=async(page,path)=>{await page.goto(site.base+path,{waitUntil:'load'});await page.waitForTimeout(500);};
  for(const [name,path] of pages){
   const page=await context.newPage();page.setDefaultTimeout(20000);await load(page,path);
   const items=await page.evaluate(describe);
   for(const it of items)if(it.noName||it.noKeyboard||it.emptyLink||it.small)report.inventory.push({width,page:name,...it});
   await page.evaluate(axeSrc);
   const violations=await page.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}})).violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.length,help:v.help,targets:v.nodes.slice(0,4).map(n=>n.target.join(' '))})));
   report.axe.push({width,page:name,violations});
   // Dead-click check on the pages with the most controls; a fresh load per control keeps clicks independent.
   if(['home','catalog','product','product-preorder','kit'].includes(name)){
    const targets=items.filter(it=>it.clickable).slice(0,40);
    for(const t of targets){
     const probe=await context.newPage();probe.setDefaultTimeout(15000);let res;
     try{await load(probe,path);
     // A click may block (dialog, endless request): give up after 8 s and report it instead of hanging the audit.
     res=await Promise.race([new Promise(r=>setTimeout(()=>r({error:'no result in 8 s'}),8000)),probe.evaluate(async([i,src])=>{const el=eval(src)()[i];if(!el)return {missing:true};
      let mutations=0;const mo=new MutationObserver(l=>{mutations+=l.length;});mo.observe(document.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});
      const before=location.href;el.click();await new Promise(r=>setTimeout(r,500));mo.disconnect();
      return {mutations,navigated:location.href!==before,text:(el.innerText||el.getAttribute('aria-label')||'').trim().slice(0,50)};},[t.i,`(${enumerate})`]).catch(e=>/context was destroyed|navigat/i.test(e.message)?{navigated:true,mutations:0}:({error:e.message.slice(0,100)}))]);
     }catch(e){res={error:'load: '+e.message.split('\n')[0].slice(0,100)};}finally{await Promise.race([probe.close().catch(()=>{}),new Promise(r=>setTimeout(r,5000))]);}// close() can stall after a navigation to /auth/
     if(res.missing||res.error||(!res.navigated&&res.mutations===0))report.dead.push({width,page:name,index:t.i,name:t.name,...res});
    }
   }
   await Promise.race([page.close().catch(()=>{}),new Promise(r=>setTimeout(r,5000))]);console.error(new Date().toISOString().slice(11,19),'audited',width,name);writeFileSync(out+'/audit.partial.json',JSON.stringify(report));
  }
  await context.close();
 }
}finally{await browser.close();}
// Lighthouse uses its own Chrome; img.test photos cannot resolve there, so image-loading audits are not meaningful.
 for(const [name,path] of pages.filter(([n])=>['home','catalog','subcategory','product','kit'].includes(n)))for(const preset of ['mobile','desktop']){
  const file=`${out}/lh-${name}-${preset}.json`;
  // Lighthouse can stall on a page; its whole process group is killed after 3 minutes so the audit always finishes.
  const r=await new Promise(res=>{const p=spawn(tools+'/node_modules/.bin/lighthouse',[site.base+path,'--quiet','--output=json','--output-path='+file,'--only-categories=performance,accessibility,best-practices,seo','--max-wait-for-load=30000','--chrome-flags=--headless=new --no-sandbox',...(preset==='desktop'?['--preset=desktop']:[])],{env:{...process.env,CHROME_PATH:process.env.CHROMIUM_PATH},detached:true,stdio:['ignore','ignore','pipe']});let err='';p.stderr.on('data',d=>err+=d);
   const t=setTimeout(()=>{try{process.kill(-p.pid,'SIGKILL');}catch{}res({status:-1,stderr:'timeout after 180 s'});},180000);p.on('exit',c=>{clearTimeout(t);res({status:c,stderr:err});});});
  if(r.status!==0){report.lighthouse.push({page:name,preset,error:(r.stderr||'').slice(-300)});continue;}
  const j=JSON.parse(readFileSync(file,'utf8')),a=j.audits;
  report.lighthouse.push({page:name,preset,scores:Object.fromEntries(Object.entries(j.categories).map(([k,c])=>[k,Math.round(c.score*100)])),
   lcp:a['largest-contentful-paint']?.displayValue,cls:a['cumulative-layout-shift']?.displayValue,tbt:a['total-blocking-time']?.displayValue,fcp:a['first-contentful-paint']?.displayValue,
   failed:Object.values(a).filter(x=>x.score!==null&&x.score<0.9&&['binary','numeric'].includes(x.scoreDisplayMode)).map(x=>x.id).slice(0,25)});
 }
}finally{site.stop();report.finished=new Date().toISOString();writeFileSync(out+'/audit.json',JSON.stringify(report,null,1));}
