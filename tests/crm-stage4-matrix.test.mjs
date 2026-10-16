// Stage 4 (ТЗ §10): CRM browser matrix — Chromium/Firefox/WebKit × 360/390/430/768/1024/1280/1440 × light/dark, every
// section and the order card with stand data: no horizontal scroll, no JS/CSP/server errors. axe-core WCAG 2.1 AA = 0 on
// every screen (Chromium, both themes, mobile and desktop); keyboard-only work: sign in, navigate, open and close an action.
import {test} from 'node:test';import assert from 'node:assert/strict';import {chromium,firefox,webkit} from 'playwright';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {createRequire} from 'node:module';
import {startCrm,password,staffEmail} from './helpers/crm-fixture.mjs';import {php} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const reports=(process.env.RUBIZH_TEST_REPORTS||'/workspace/reports')+'/crm-matrix';mkdirSync(reports,{recursive:true});
const axeSource=readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'),'utf8');
const WIDTHS=[360,390,430,768,1024,1280,1440];
const SECTIONS=['/','/orders','/customers','/customers?segment=WHOLESALE','/tasks','/analytics','/payments','/payments?view=review','/returns','/products','/suppliers','/delivery','/staff','/audit','/notifications','/settings','/orders/new'];
const ENGINES={chromium:()=>chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']}),firefox:()=>firefox.launch(),webkit:()=>webkit.launch()};

async function seeded(){
 const s=await startCrm({frontend:true,stock:1000,extraConfig:",'np_mock'=>true"});
 const r=JSON.parse(php(`require '${s.site}/dev/crm-synthetic.php';echo json_encode(synRun(['orders'=>40,'seed'=>5]));`,{timeout:900000}).stdout);
 assert.deepEqual(r.errors,[]);s.orderId=+s.sql('SELECT MAX(id) id FROM rubizh_customer_orders')[0].id;return s;
}
async function signIn(page,base,role='OWNER'){await page.goto(base+'/crm/');await page.getByLabel('Email').fill(staffEmail(role));await page.getByLabel('Пароль',{exact:true}).fill(password);await page.getByRole('button',{name:'Увійти'}).click();await page.getByRole('navigation',{name:'Основне'}).first().waitFor({state:'attached'});}
// CRM-5.1 fixed in stage 5: the CRM starts no Staff API read while the page is being left (crm.rubizh src/lib.ts), so
// navigations are not timed around background polls and no page error is set aside — every engine, every error counts
// (root cause and proof: stage5-crm51-webkit).
async function visit(page,url){await page.goto(url);await page.getByRole('heading',{level:1}).first().waitFor({timeout:20000});await page.waitForLoadState('networkidle');}

for(const engine of Object.keys(ENGINES))test(`CRM matrix ${engine}: 7 widths × light/dark × every section: no overflow, no JS/CSP/server errors`,{skip,timeout:3600000},async()=>{
 const s=await seeded();const browser=await ENGINES[engine]();const report=[];
 try{
  for(const width of WIDTHS)for(const theme of ['light','dark']){
   const ctx=await browser.newContext({viewport:{width,height:width<768?844:900}});const page=await ctx.newPage();const errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('/api/staff/')&&r.status()>=500)errors.push(r.status()+' '+r.url());});
   await page.addInitScript(t=>{try{localStorage.setItem('crm.theme',t);}catch{}document.addEventListener('securitypolicyviolation',e=>{(window.__csp=window.__csp||[]).push(e.violatedDirective+' '+e.blockedURI);});},theme);
   await signIn(page,s.base);
   for(const path of [...SECTIONS,'/orders/'+s.orderId]){
    await visit(page,s.base+'/crm'+path);
    const m=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,csp:window.__csp||[]}));
    report.push({engine,width,theme,path,overflow:m.overflow});
    assert.ok(m.overflow<=1,`${engine} ${width} ${theme} ${path}: horizontal overflow ${m.overflow}px`);assert.deepEqual(m.csp,[],`${engine} ${width} ${path} CSP`);
   }
   assert.deepEqual(errors,[],`${engine} ${width} ${theme} errors`);await ctx.close();
  }
  writeFileSync(`${reports}/${engine}.json`,JSON.stringify(report,null,1));
 }finally{await browser.close();s.stop();}
});

test('CRM accessibility: axe-core WCAG 2.1 AA — 0 violations on every screen, light and dark, 390 and 1440',{skip,timeout:3600000},async()=>{
 const s=await seeded();const browser=await ENGINES.chromium();const found=[];
 try{
  for(const width of [390,1440])for(const theme of ['light','dark']){
   // axe is injected through the test channel only (bypassCSP); the CSP itself is verified by the matrix above.
   const ctx=await browser.newContext({viewport:{width,height:900},bypassCSP:true});const page=await ctx.newPage();
   await page.addInitScript(t=>{try{localStorage.setItem('crm.theme',t);}catch{}},theme);
   await page.goto(s.base+'/crm/');await page.waitForLoadState('networkidle');
   const scan=async where=>{await page.evaluate(axeSource);const v=await page.evaluate(async()=>(await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}})).violations.map(x=>({id:x.id,impact:x.impact,nodes:x.nodes.length,target:x.nodes[0]?.target?.join(' ')})));for(const x of v)found.push({width,theme,where,...x});};
   await scan('login');
   await signIn(page,s.base);
   for(const path of [...SECTIONS,'/orders/'+s.orderId]){await visit(page,s.base+'/crm'+path);await scan(path);}
   await ctx.close();
  }
  writeFileSync(reports+'/axe.json',JSON.stringify(found,null,1));
  assert.deepEqual(found,[],'axe violations: '+JSON.stringify(found.slice(0,10)));
 }finally{await browser.close();s.stop();}
});

test('CRM keyboard only: sign in, skip link, navigate to an order, open an action dialog and close it with Escape; mobile menu',{skip,timeout:600000},async()=>{
 const s=await seeded();const browser=await ENGINES.chromium();
 try{
  for(const width of [1440,390]){
   const page=await browser.newPage({viewport:{width,height:900}});await page.goto(s.base+'/crm/');
   await page.getByLabel('Email').focus();await page.keyboard.type(staffEmail('OWNER'));await page.keyboard.press('Tab');await page.keyboard.type(password);await page.keyboard.press('Enter');
   await page.getByRole('navigation',{name:'Основне'}).first().waitFor({state:'attached'});
   await page.keyboard.press('Tab');assert.match(await page.evaluate(()=>document.activeElement?.textContent||''),/До основного вмісту/,'first Tab lands on the skip link');
   if(width<1024){const menu=page.getByRole('button',{name:'Відкрити меню'});await menu.focus();await page.keyboard.press('Enter');await page.getByRole('link',{name:'Замовлення'}).first().waitFor();await page.keyboard.press('Escape');}
   await visit(page,s.base+'/crm/orders');
   const link=page.getByRole('link',{name:/^RB-/}).first();await link.focus();await page.keyboard.press('Enter');await page.getByRole('heading',{level:1,name:/^RB-/}).waitFor();
   const action=page.locator('.actions-bar button').first();await action.focus();await page.keyboard.press('Enter');
   const d=page.getByRole('dialog');await d.waitFor();assert.ok(await d.evaluate(el=>el.contains(document.activeElement)),'focus moves into the dialog');
   await page.keyboard.press('Escape');await d.waitFor({state:'detached'});
   assert.equal(await page.evaluate(()=>document.activeElement?.closest('.actions-bar')!==null),true,'focus returns to the action');
   await page.close();
  }
 }finally{await browser.close();s.stop();}
});

// SITE pages changed in stage 4 (D-53 texts, D-54 wholesale form, A5 COD cleanup, cabinet partial refund):
// 3 engines × 7 widths — no horizontal overflow, no JS errors, no CSP violations, the wholesale form fits.
const SITE_PAGES=['/','/product/kurtka-fixture-softshell','/auth/','/offer.html','/privacy.html'];
for(const engine of Object.keys(ENGINES))test(`SITE matrix ${engine}: stage-4 pages × 7 widths: no overflow, no JS/CSP errors`,{skip,timeout:1800000},async()=>{
 const s=await startCrm({stock:100});const browser=await ENGINES[engine]();const report=[];
 try{
  for(const width of WIDTHS){
   const ctx=await browser.newContext({viewport:{width,height:width<768?844:900}});const page=await ctx.newPage();const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>{document.addEventListener('securitypolicyviolation',e=>{(window.__csp=window.__csp||[]).push(e.violatedDirective+' '+e.blockedURI);});});
   for(const path of SITE_PAGES){
    const r=await page.goto(s.base+path);assert.ok(r&&r.status()<400,`${engine} ${width} ${path}: HTTP ${r?.status()}`);await page.waitForLoadState('networkidle');
    if(path==='/')await page.locator('#b2b-form').scrollIntoViewIfNeeded();
    const m=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,csp:window.__csp||[]}));
    report.push({engine,width,path,overflow:m.overflow});
    assert.ok(m.overflow<=1,`${engine} ${width} ${path}: horizontal overflow ${m.overflow}px`);assert.deepEqual(m.csp,[],`${engine} ${width} ${path} CSP`);
   }
   assert.deepEqual(errors,[],`${engine} ${width} JS errors`);await ctx.close();
  }
  writeFileSync(`${reports}/site-${engine}.json`,JSON.stringify(report,null,1));
 }finally{await browser.close();s.stop();}
});
