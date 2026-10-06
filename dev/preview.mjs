import http from 'node:http';
import {readFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {categories,products,catalog} from './fixtures.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.webp':'image/webp','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2','.woff':'font/woff'};
export function startPreview(port=4173) {
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
    const json=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
    try {
      const url=new URL(req.url,'http://localhost');const name=decodeURIComponent(url.pathname);
      // Read-only preview: no form can create an order or send money/messages.
      if(!['GET','HEAD'].includes(req.method))return json({ok:false,error:'Демо-режим: замовлення, оплата та надсилання даних вимкнені.'},403);
      if(name==='/shop/catalog.php') {
        switch(url.searchParams.get('action')) {
          case 'categories':return json({ok:true,categories});
          case 'storefront':return json({ok:true,products,kits:[]});
          case 'product': {const product=products.find(p=>p.slug===url.searchParams.get('slug')||p.id===url.searchParams.get('id'));return json(product?{ok:true,product}:{ok:false,error:'Товар не знайдено.'},product?200:404)}
          case 'ids':return json({ok:true,items:products.filter(p=>(url.searchParams.get('ids')||'').split(',').includes(p.id))});
          case 'promo':return json({ok:false,error:'Промокоди не діють у демо-каталозі.'},400);
          default:return json(catalog(url.searchParams));
        }
      }
      if(name==='/shop/customer.php')return json({ok:true,csrf:'preview-only',authed:false,customer_id:null,profile:null,favorites:[],items:[],mono_enabled:false,np_enabled:false,np_cod_enabled:false});
      if(name==='/shop/preferences.php')return json({ok:true,csrf:'preview-only',authed:false,preferences:{theme:'dark'}});
      if(name==='/shop/analytics.php')return json({ok:true,ga4:'',meta:'',settings:{donation:{enabled:false,percent:0}}});
      if(name==='/auth/'||name==='/auth') {
        // Render the real anonymous PHP login template. No query tokens, cookies or POSTs are forwarded.
        const retained='/workspace/php-runtime/root/usr/bin/php8.4';
        const php=process.env.PHP_PATH||(existsSync(retained)?retained:'php');
        const demo=['phone','code','email-google'].includes(url.searchParams.get('preview'))?url.searchParams.get('preview'):'';
        const enabled=demo!=='';
        const authEnv={RUBIZH_SMS_ENABLED:enabled?'true':'false',RUBIZH_GOOGLE_ENABLED:enabled?'true':'false',RUBIZH_TURBOSMS_TOKEN:'design-preview-only',RUBIZH_TURBOSMS_SENDER:'RUBIZH',RUBIZH_AUTH_SECRET:'design-preview-only-secret-not-for-production-0000000000',RUBIZH_GOOGLE_CLIENT_ID:'123456789-designpreview.apps.googleusercontent.com',RUBIZH_GOOGLE_CLIENT_SECRET:'design-preview-only'};
        const result=spawnSync(php,['-n','-d','session.save_path=/tmp',path.join(root,'dev/render-login.php'),demo],{encoding:'utf8',timeout:5000,maxBuffer:1024*1024,env:{...process.env,...authEnv,LD_LIBRARY_PATH:process.env.LD_LIBRARY_PATH||'/workspace/php-runtime/root/usr/lib/x86_64-linux-gnu'}});
        if(result.error||result.status!==0||!result.stdout.includes('auth-shell'))return json({ok:false,error:'Для перегляду сторінки входу потрібен PHP. Вкажіть PHP_PATH.'},503);
        const html=result.stdout.replace('<body class="login-page">','<body class="login-page"><div class="rz-preview-notice" style="position:relative;z-index:5;background:#f0a144;color:#16190f;padding:8px 16px;text-align:center;font:600 11px/1.5 system-ui">ПЕРЕГЛЯД ДИЗАЙНУ · ВХІД ТА НАДСИЛАННЯ ЛИСТІВ ВИМКНЕНІ</div>');
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(req.method==='HEAD'?undefined:html);
      }
      const authAssets=new Set(['/auth/account.css','/auth/login-refresh.css','/auth/account-ui.js','/auth/login.js','/auth/google-g.png']);
      if(authAssets.has(name)) {
        const file=path.join(root,name.slice(1));const data=await readFile(file);
        res.writeHead(200,{'Content-Type':types[path.extname(file)]||'image/svg+xml'});return res.end(req.method==='HEAD'?undefined:data);
      }
      if(name.startsWith('/shop/')||name.startsWith('/api/')||name.startsWith('/auth/'))return json({ok:false,error:'Для цього сервісу потрібні PHP та конфігурація магазину. Демо-режим.'},503);
      if(name.startsWith('/assets/')||name==='/favicon.ico') {
        const file=path.resolve(root,'.'+name);
        if(!file.startsWith(root+path.sep)||!(await realpath(file)).startsWith(root+path.sep))return json({ok:false},403);
        const type=types[path.extname(file)];if(!type)return json({ok:false},404);
        const data=await readFile(file);res.writeHead(200,{'Content-Type':type});return res.end(req.method==='HEAD'?undefined:data);
      }
      const isStorefront=name==='/'||/^\/(catalog|product|categories|kit|porady)(\/|$)/.test(name);
      if(!isStorefront&&!['/offer','/privacy'].includes(name))return json({ok:false,error:'Сторінку не знайдено.'},404);
      let html=await readFile(path.join(root,isStorefront?'index.html':name.slice(1)+'.html'),'utf8');
      html=html.replace('<head>','<head><meta name="robots" content="noindex, nofollow"><script>window.RUBIZH_BOOT='+JSON.stringify({categories,settings:{donation:{enabled:false,percent:0}}})+';</script>');
      html=html.replace('<body>','<body><div style="background:#f0a144;color:#16190f;padding:8px 16px;text-align:center;font:600 11px/1.5 system-ui">ПЕРЕГЛЯД ДИЗАЙНУ · ДЕМО-ТОВАРИ · ЗАМОВЛЕННЯ ТА ОПЛАТА ВИМКНЕНІ</div>');
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(req.method==='HEAD'?undefined:html);
    }catch{json({ok:false,error:'Сторінку не знайдено.'},404)}
  });
  return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>resolve(server));});
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const port=Number(process.env.PORT||4173);
  startPreview(port).then(()=>console.log(`RUBIZH design preview listening on port ${port}. Orders and payments disabled.`));
}
