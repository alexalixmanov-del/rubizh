// Stage 4 CRM browser smoke against the real Staff API: every visible section for every role, desktop and mobile,
// light and dark — no JS errors, no CSP violations, no server errors, no horizontal page scroll, menu by permission.
import {test} from 'node:test';import assert from 'node:assert/strict';import {chromium} from 'playwright';import {mkdirSync,writeFileSync} from 'node:fs';
import {startCrm,line,password,roles5,staffEmail} from './helpers/crm-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;const artifacts=(process.env.RUBIZH_TEST_REPORTS||'/workspace/reports')+'/crm-browser';mkdirSync(artifacts,{recursive:true});
const SECTIONS=[['Огляд','/'],['Замовлення','/orders'],['Клієнти','/customers'],['Завдання','/tasks'],['Аналітика','/analytics'],['Платежі','/payments'],['Повернення','/returns'],['Товари','/products'],['Постачальники','/suppliers'],['Доставка','/delivery'],['Співробітники','/staff'],['Активність','/activity'],['Сповіщення','/notifications'],['Налаштування','/settings']];
const VISIBLE={OWNER:SECTIONS.map(s=>s[0]),MANAGER:['Огляд','Замовлення','Клієнти','Завдання','Платежі','Повернення','Товари','Постачальники','Доставка','Активність','Сповіщення','Налаштування'],WAREHOUSE:['Огляд','Замовлення','Завдання','Повернення','Товари','Постачальники','Доставка','Сповіщення','Налаштування'],SUPPORT:['Огляд','Замовлення','Клієнти','Завдання','Повернення','Товари','Доставка','Сповіщення','Налаштування'],ACCOUNTANT:['Огляд','Замовлення','Клієнти','Завдання','Аналітика','Платежі','Повернення','Товари','Активність','Сповіщення','Налаштування']};
export async function crmLogin(page,base,email){await page.goto(base+'/crm/');await page.getByLabel('Email').fill(email);await page.getByLabel('Пароль',{exact:true}).fill(password);await page.getByRole('button',{name:'Увійти'}).click();await page.getByRole('navigation',{name:'Основне'}).waitFor();}
test('CRM sections for every role: desktop/mobile, light/dark, no errors, no overflow, menu by permission',{skip,timeout:900000},async()=>{
 const s=await startCrm({frontend:true}),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const report=[];
 try{
  await s.checkout([line()]);
  for(const role of roles5)for(const [width,height] of [[1440,900],[390,844]])for(const theme of width===1440?['light','dark']:['light']){
   const ctx=await browser.newContext({viewport:{width,height}});const page=await ctx.newPage();const errors=[],server=[],csp=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errors.push(m.text());});
   page.on('response',r=>{if(r.url().includes('/api/staff/')&&r.status()>=500)server.push(r.status()+' '+new URL(r.url()).pathname);});
   await page.addInitScript(t=>{try{localStorage.setItem('crm.theme',t);}catch{}document.addEventListener('securitypolicyviolation',e=>{window.__csp=(window.__csp||[]).concat(e.violatedDirective);});},theme);
   await crmLogin(page,s.base,staffEmail(role));
   if(width<1024){await page.getByRole('button',{name:'Відкрити меню'}).click();}
   const nav=(await page.locator('.sidebar .nav-link span').allInnerTexts()).map(x=>x.trim());
   assert.deepEqual(nav,VISIBLE[role],role+' menu');
   if(width<1024)await page.keyboard.press('Escape');
   for(const [name,path] of SECTIONS.filter(x=>VISIBLE[role].includes(x[0]))){
    await page.goto(s.base+'/crm'+path);await page.getByRole('heading',{level:1}).first().waitFor({timeout:15000});await page.waitForLoadState('networkidle');
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    report.push({role,width,theme,name,overflow});
    assert.ok(overflow<=1,`${role} ${width} ${name}: horizontal overflow ${overflow}px`);
    if(role==='OWNER'&&theme==='light')await page.screenshot({path:`${artifacts}/${width}-${path.replace(/\//g,'_')||'_overview'}.png`,fullPage:width===1440});
   }
   csp.push(...await page.evaluate(()=>window.__csp||[]));
   assert.deepEqual(errors,[],`${role} ${width} ${theme} JS errors`);assert.deepEqual(server,[],`${role} ${width} server errors`);assert.deepEqual(csp,[],'CSP violations');
   await ctx.close();
  }
  writeFileSync(artifacts+'/sections.json',JSON.stringify(report,null,1));
 }finally{await browser.close();s.stop();}
});
