import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';
import {startPreview} from '../dev/preview.mjs';
let browser,server,base;
before(async()=>{
  server=await startPreview(0);base='http://127.0.0.1:'+server.address().port;
  const executable=process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
  browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox']});
});
after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve));});
async function withPage(run,viewport={width:1440,height:1000}) {
  const context=await browser.newContext({viewport});const page=await context.newPage();
  page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{await run(page);assert.deepEqual(errors,[],'No uncaught browser errors');}finally{await context.close();}
}
async function loaded(page,path='/'){await page.goto(base+path);await page.locator('[data-store-surface]').waitFor();}
async function addUniform(page){
  await loaded(page,'/product/demo-uniform');await page.getByRole('button',{name:'L',exact:true}).click();
  await page.getByRole('button',{name:/До кошика/}).first().click();
  await page.getByRole('button',{name:'Продовжити',exact:true}).click();
  await page.locator('header [aria-label="Кошик"]').click();
  await page.getByRole('heading',{name:'Оформлення замовлення'}).waitFor();
}
test('Home images load, categories navigate, and layout fits desktop',()=>withPage(async page=>{
  await loaded(page);await page.getByRole('heading',{name:/Твій рубіж/i}).waitFor();
  assert.equal(await page.locator('.rz-category').count(),6);
  for(let y=0;y<5200;y+=650){await page.evaluate(y=>scrollTo(0,y),y);await page.waitForTimeout(80);}
  await page.waitForFunction(()=>[...document.querySelectorAll('.rz-home img')].every(i=>i.complete&&i.naturalWidth>0));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('.rz-category').filter({hasText:'Взуття'}).click();
  await page.locator('[data-card-name]').filter({hasText:'Берці'}).waitFor();
  assert.equal(await page.locator('[data-cat-grid][data-hide="0"] [data-tile]').count(),1);
}));
test('Direct product links load correct product and preserve its URL',()=>withPage(async page=>{
  await loaded(page,'/product/demo-uniform');
  await page.getByRole('heading',{name:'Демо · Тактичний костюм ММ14'}).waitFor();
  assert.equal(new URL(page.url()).pathname,'/product/demo-uniform');
  assert.equal(await page.locator('[data-prod-section] img').count()>0,true);
}));
test('Selected size and cart survive reload, with accurate totals',()=>withPage(async page=>{
  await addUniform(page);
  assert.match(await page.locator('body').innerText(),/Розмір L · Піксель/);
  await page.reload();await page.getByRole('heading',{name:'Оформлення замовлення'}).waitFor();
  await page.getByText('DEMO-UNIFORM-L',{exact:true}).waitFor();
  assert.match(await page.locator('body').innerText(),/3\s*200\s*₴/);

}));
test('Disabled payment methods and donation claims are absent at checkout',()=>withPage(async page=>{
  await addUniform(page);
  await page.getByText('Оплата на рахунок ФОП',{exact:true}).waitFor();
  assert.equal(await page.getByText('Оплата карткою',{exact:true}).count(),0);
  assert.equal(await page.getByText('Післяплата',{exact:true}).count(),0);
  assert.equal(await page.getByText('Куди надіслати скрін донату',{exact:true}).count(),0);
  assert.equal(await page.locator('input[name="name"][aria-label]').count(),1);
}));
test('Card and COD options appear when the server enables them',()=>withPage(async page=>{
  await page.route('**/shop/customer.php',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,csrf:'preview-only',authed:false,customer_id:null,profile:null,favorites:[],items:[],mono_enabled:true,np_enabled:false,np_cod_enabled:true})}));
  await addUniform(page);
  await page.getByText('Оплата карткою',{exact:true}).waitFor();
  await page.getByText('Післяплата',{exact:true}).waitFor();
}));
test('Cart quantity cannot exceed the known stock',()=>withPage(async page=>{
  await addUniform(page);
  const plus=page.getByRole('button',{name:'+',exact:true});
  for(let i=0;i<6;i++)await plus.click();
  assert.equal((await page.locator('[data-header-count]').innerText()).trim(),'5');
  assert.match(await page.locator('body').innerText(),/16\s*000\s*₴/);
}));
test('Keyboard favourite activation happens once and persists',()=>withPage(async page=>{
  await loaded(page,'/catalog');const fav=page.locator('[data-fav]').first();
  await fav.focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelector('[data-fav]')?.getAttribute('aria-pressed')==='true');
  await page.reload();await page.waitForFunction(()=>document.querySelector('[data-fav]')?.getAttribute('aria-pressed')==='true');
  const control=page.locator('[data-fav]').first();await control.focus();await page.keyboard.press('Space');
  await page.waitForFunction(()=>document.querySelector('[data-fav]')?.getAttribute('aria-pressed')==='false');
}));
test('Search returns matching product and zero-result recovery',()=>withPage(async page=>{
  await loaded(page);const input=page.getByRole('searchbox',{name:'Пошук',exact:true});
  await input.fill('Берці');await input.press('Enter');
  await page.locator('[data-card-name]').filter({hasText:'Берці'}).waitFor();
  assert.equal(await page.locator('[data-cat-grid][data-hide="0"] [data-tile]').count(),1);
  await input.fill('Невідомийтовар777');await input.press('Enter');
  await page.getByText(/нічого не (знайдено|знайшли)/i).first().waitFor();
  assert.equal(await page.locator('[data-cat-grid][data-hide="0"] [data-tile]').count(),0);
}));
test('Mobile menu closes with Escape and home fits small screens',()=>withPage(async page=>{
  await loaded(page);const menu=page.getByRole('button',{name:'Меню і каталог'});
  await menu.click();await page.locator('#catalog-menu-mobile').waitFor();
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.getElementById('catalog-menu-mobile'));
  for(const width of [320,390,768]){
    await page.setViewportSize({width,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`No horizontal overflow at ${width}px`);
  }
  const question=page.locator('.rz-faq-question').nth(1);await question.click();assert.equal(await question.getAttribute('aria-expanded'),'true');
},{width:390,height:844}));
test('Theme preference persists and reduced motion is supported',()=>withPage(async page=>{
  await loaded(page);await page.locator('header [data-theme-toggle]').click();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
  await page.reload();assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('.rz-category').first().evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
}));
test('Mobile catalog, product and checkout fit the viewport',()=>withPage(async page=>{
  for(const width of [320,390,768]){
    await page.setViewportSize({width,height:844});
    await loaded(page,'/catalog');await page.locator('[data-card-name]').first().waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Catalog at ${width}px`);
    await loaded(page,'/product/demo-uniform');await page.getByRole('heading',{name:'Демо · Тактичний костюм ММ14'}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Product at ${width}px`);
  }
  await page.setViewportSize({width:390,height:844});await addUniform(page);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Mobile checkout');
},{width:390,height:844}));
test('Catalog server errors surface without pretending to succeed',()=>withPage(async page=>{
  await page.route('**/shop/catalog.php?*',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,error:'Тест: каталог тимчасово недоступний.'})}));
  await loaded(page,'/catalog');await page.getByRole('alert').filter({hasText:'Тест: каталог'}).waitFor();
  assert.equal(await page.locator('[data-cat-grid][data-hide="0"] [data-tile]').count(),0);
}));
test('Preview rejects real order/payment writes and private file requests',async()=>{
  for(const endpoint of ['/shop/order.php','/shop/payment-start.php','/shop/customer.php']){
    const response=await fetch(base+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    assert.equal(response.status,403);assert.equal((await response.json()).ok,false);
  }
  for(const file of ['/api/np-private.php','/api/config.php','/dev/fixtures.mjs'])assert.ok((await fetch(base+file)).status>=400);
});

function kitSlot(page,name){return page.locator('.rz-kit-slot').filter({has:page.locator('.rz-kit-slot-head',{hasText:name})});}
async function chooseKitItem(page,slot,product,size){
  await kitSlot(page,slot).getByRole('button',{name:'Обрати спорядження'}).click();
  await page.locator('.rz-kit-modal-card').filter({hasText:product}).getByRole('button',{name:size,exact:true}).click();
  await page.locator('.rz-kit-modal').waitFor({state:'detached'});
}
test('Mobile kit selection, replacement and checkout preserve sizes and calculated prices',()=>withPage(async page=>{
  await loaded(page,'/kit');await page.locator('.rz-kit-slot').first().waitFor();
  await chooseKitItem(page,'Тіло','Тактичний костюм','L');
  await chooseKitItem(page,'Взуття','Берці','43');
  await page.waitForFunction(()=>document.querySelector('.rz-kit-total')?.innerText.includes('5\u00a0917'));
  await page.waitForTimeout(500);
  assert.match(await page.locator('[data-kit-aside]').innerText(),/183\s*₴/);
  assert.equal(await page.locator('.rz-kit-item').count(),2);
  assert.equal(await page.getByText(/Донат бригаді:/).count(),0);
  await page.reload();await page.locator('.rz-kit-item').nth(1).waitFor();
  assert.match(await kitSlot(page,'Тіло').innerText(),/Розмір L/);
  assert.match(await kitSlot(page,'Взуття').innerText(),/Розмір 43/);
  await kitSlot(page,'Тіло').getByRole('button',{name:'Замінити',exact:true}).click();
  await page.locator('.rz-kit-modal-card').filter({hasText:'Тактичний костюм'}).getByRole('button',{name:'M',exact:true}).click();
  await page.locator('.rz-kit-modal').waitFor({state:'detached'});
  assert.match(await kitSlot(page,'Тіло').innerText(),/Розмір M/);
  assert.equal(await page.locator('.rz-kit-item').count(),2);
  await page.locator('[data-kit-bar]').getByRole('button',{name:'У кошик',exact:true}).click();
  await page.getByRole('heading',{name:'Оформлення замовлення'}).waitFor();
  await page.getByText('DEMO-UNIFORM-M',{exact:true}).waitFor();
  await page.getByText('DEMO-BOOTS-43',{exact:true}).waitFor();
  assert.match(await page.locator('body').innerText(),/5\s*917\s*₴/);
},{width:390,height:844}));
test('Seller settings do not recursively copy mounted React elements when reopening the kit selector',()=>withPage(async page=>{
  await page.route('**/shop/analytics.php',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,ga4:'',meta:'',settings:{seller:{name:'Демонстраційний продавець'},donation:{enabled:false,percent:0}}})}));
  await loaded(page,'/kit');await chooseKitItem(page,'Тіло','Тактичний костюм','L');
  await chooseKitItem(page,'Взуття','Берці','43');
  assert.equal(await page.locator('.rz-kit-item').count(),2);
  await kitSlot(page,'Тіло').getByRole('button',{name:'Прибрати',exact:true}).click();
  assert.equal(await page.locator('.rz-kit-item').count(),1);
  assert.equal(await page.locator('[data-kit-aside] .rz-kit-cart').count(),0);
}));
test('Catalogue cards stay separate and controls fit at phone, tablet and desktop widths in both themes',()=>withPage(async page=>{
  for(const theme of ['dark','light']){
    await loaded(page,'/catalog');await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    for(const width of [320,360,390,430,768,1024,1440]){
      await page.setViewportSize({width,height:900});await page.locator('[data-cat-grid][data-hide="0"] [data-tile]').first().waitFor();
      const problems=await page.evaluate(()=>{
        const bad=[];if(document.documentElement.scrollWidth>innerWidth)bad.push('page overflow');
        const cards=[...document.querySelectorAll('[data-cat-grid][data-hide="0"] [data-tile]')];
        for(const [i,card] of cards.entries()){
          const r=card.getBoundingClientRect();
          for(const control of card.querySelectorAll('[data-card-price],[data-card-cta],[data-card-size]')){
            const q=control.getBoundingClientRect();if(q.left<r.left-1||q.right>r.right+1||q.bottom>r.bottom+1)bad.push('control outside card '+i);
          }
          for(const other of cards.slice(i+1)){const q=other.getBoundingClientRect();if(Math.min(r.right,q.right)-Math.max(r.left,q.left)>1&&Math.min(r.bottom,q.bottom)-Math.max(r.top,q.top)>1)bad.push('cards overlap');}
        }
        return bad;
      });
      assert.deepEqual(problems,[],`${theme} catalogue at ${width}px`);
    }
  }
}));
test('Kit mobile parameters expand and selectors close with Escape without layout overlap',()=>withPage(async page=>{
  for(const width of [320,390,768]){
    await page.setViewportSize({width,height:900});await loaded(page,'/kit');
    await page.getByRole('button',{name:'змінити',exact:true}).click();
    await page.locator('.rz-kit-parameters').waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Kit parameters at ${width}`);
    await page.getByRole('button',{name:'Згорнути',exact:true}).click();
    await kitSlot(page,'Тіло').getByRole('button',{name:'Обрати спорядження'}).click();
    await page.locator('.rz-kit-modal-card').first().waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Kit modal at ${width}`);
    await page.keyboard.press('Escape');await page.locator('.rz-kit-modal').waitFor({state:'detached'});
  }
},{width:390,height:900}));
test('Responsive hero uses distinct images and places the extra logo only on desktop',()=>withPage(async page=>{
  await loaded(page);await page.waitForFunction(()=>document.querySelector('.rz-hero-image')?.complete);
  assert.match(await page.locator('.rz-hero-image').evaluate(e=>e.currentSrc),/hero-desktop/);
  const logo=await page.locator('.rz-hero-logo').boundingBox();const hero=await page.locator('.rz-hero').boundingBox();
  assert.ok(logo.x>hero.x+hero.width/2&&logo.y>hero.y+hero.height/2);
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>document.querySelector('.rz-hero-image')?.currentSrc.includes('hero-mobile')&&document.querySelector('.rz-hero-image')?.naturalWidth>0);
  assert.equal(await page.locator('.rz-hero-logo').isVisible(),false);
  await page.locator('.rz-footer-brand').scrollIntoViewIfNeeded();
  assert.ok(await page.locator('.rz-footer-brand img').evaluate(e=>e.complete&&e.naturalWidth>0));
}));
test('Real anonymous PHP login renders accessibly without overflow and preview rejects login writes',()=>withPage(async page=>{
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:900});await page.goto(base+'/auth/');
    await page.getByRole('heading',{name:'З поверненням'}).waitFor();
    assert.equal(await page.getByLabel('Ваш email').getAttribute('autocomplete'),'email');
    assert.equal(await page.locator('input[name="csrf"]').count(),1);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Login at ${width}`);
    assert.ok(await page.locator('.login-backdrop').evaluate(e=>e.complete&&e.naturalWidth>0));
    const form=await page.locator('.auth-card').boundingBox(),header=await page.locator('.account-header').boundingBox();
    assert.ok(form.y>=header.y+header.height,`Form below the header at ${width}`);
  }
  const response=await fetch(base+'/auth/',{method:'POST',body:'action=request&email=example@example.com'});
  assert.equal(response.status,403);
}));
test('Mobile price and size filters combine, clear, and preserve a usable result grid',()=>withPage(async page=>{
  await loaded(page,'/catalog');await page.locator('[data-mob-bar]').getByRole('button',{name:'Фільтри',exact:true}).click();
  const filters=page.locator('[data-cat-aside]');
  await filters.getByRole('button',{name:/^Розмір/}).click();
  await filters.getByRole('button',{name:'L',exact:true}).click();
  await filters.getByRole('button',{name:/^Ціна,/}).click();
  await filters.getByRole('textbox',{name:'Ціна до',exact:true}).fill('2000');
  await page.waitForFunction(()=>document.querySelectorAll('[data-cat-grid][data-hide="0"] [data-tile]').length===1);
  await filters.locator('[data-sheet-foot] [role="button"]').last().click();
  assert.match(await page.locator('[data-card-name]').first().innerText(),/штани/i);
  await page.locator('[data-active-filters]').getByRole('button',{name:'Скинути все',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('[data-cat-grid][data-hide="0"] [data-tile]').length===7);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
},{width:390,height:900}));
test('Kit colour filters with no matches remain responsive and all-category links work on mobile',()=>withPage(async page=>{
  await loaded(page,'/kit');await kitSlot(page,'Тіло').getByRole('button',{name:'Обрати спорядження'}).click();
  await page.locator('.rz-kit-modal-card').first().waitFor();
  await page.locator('.rz-kit-modal-head').getByRole('button',{name:'Олива',exact:true}).click();
  await page.getByText('Нічого не знайшли. Приберіть частину фільтрів.',{exact:true}).waitFor();
  await page.locator('.rz-kit-modal-head>div').last().getByRole('button',{name:'Усі',exact:true}).click();
  await page.locator('.rz-kit-modal-card').first().waitFor();await page.keyboard.press('Escape');
  await loaded(page,'/categories');await page.locator('.rz-directory-card').first().waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('.rz-directory-card').filter({hasText:'Взуття'}).locator('a').first().click();
  await page.locator('[data-card-name]').filter({hasText:'Берці'}).waitFor();
},{width:390,height:900}));

test('Light theme keeps header text, icons and the logo readable across storefront pages and login',()=>withPage(async page=>{
  await page.addInitScript(()=>localStorage.setItem('rubizh.theme','light'));
  for(const width of [320,390,1440]){
    await page.setViewportSize({width,height:1000});
    for(const path of ['/','/catalog','/kit','/categories','/product/demo-uniform','/porady','/auth/']){
      await page.goto(base+path);
      await page.locator(path==='/auth/'?'.auth-shell':'[data-header-brand]').waitFor();
      assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
      const problems=await page.evaluate(()=>{
        const rgb=value=>(value.match(/[\d.]+/g)||[]).map(Number);
        const luminance=color=>rgb(color).slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
        const background=e=>{for(;e;e=e.parentElement){const value=getComputedStyle(e).backgroundColor;if((rgb(value)[3]??1)===1)return value;}return 'rgb(255,255,255)';};
        const header=document.querySelector('header');const issues=[];
        if((rgb(getComputedStyle(header).backgroundColor)[3]??1)!==1)issues.push('Header must have an opaque surface');
        if(background(header)===background(document.body))issues.push('Header must stand apart from the page background');
        const selector='[data-header-wordmark],[data-header-tagline],[data-mainnav]>[role=button],[data-cm-trigger],[data-header-actions]>[role=button],[data-burger],[data-sbar] input,[data-sbar] [aria-label="Шукати"],.brand-word,.back-shop,[data-theme-toggle]';
        for(const element of header.querySelectorAll(selector)){
          if(!element.getBoundingClientRect().width)continue;
          const fg=luminance(getComputedStyle(element).color),bg=luminance(background(element));
          const contrast=(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05);
          if(contrast<4.5)issues.push(`${element.getAttribute('aria-label')||element.textContent.trim()}: contrast ${contrast.toFixed(2)}`);
        }
        const logo=header.querySelector('[data-header-brand]>img,.brand-logo');
        if(!logo?.complete||!logo.naturalWidth)issues.push('Logo did not load');
        if(logo&&luminance(background(logo))>.1)issues.push('Light logo needs a dark surface');
        return issues;
      });
      assert.deepEqual(problems,[],`${path} at ${width}px in the light theme`);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${path} fits ${width}px`);
    }
  }
}));
