// PIM contract 3 MODEL on the storefront: one card per MODEL; COLOR switches gallery, real sizes,
// SKU, price, availability and permissions. Size options without SKU become a confirmation request.
// The server re-validates every selection; nothing here grants payment.
(function(){
'use strict';
const money=n=>new Intl.NumberFormat('uk-UA',{maximumFractionDigits:2}).format(Math.round(Number(n||0)*100)/100)+'\u00a0₴';
const AV={IN_STOCK:'В наявності',PREORDER:'Передзамовлення',ORDER_ON_REQUEST:'Під замовлення',SIZE_CONFIRMATION_REQUIRED:'Розмір за запитом',UNKNOWN:'Наявність уточнюється',OUT_OF_STOCK:'Немає в наявності'};
function availability(v){return v.payment_allowed?'in_stock':v.order_submission_allowed?'preorder':'out_of_stock';}
// Map the public MODEL DTO into the client product shape; keys are SKU (or option id), never a size label.
window.storeV3Map=function(t,a){
 a.v3=true;a.colors=(t.colors||[]).map(c=>({...c,photos:(c.photos||[]).filter(p=>p&&/^(https?:\/\/|\/)/.test(p.url||''))}));a.modelPhotoData=a.photoData;
 a.variants={};a.stock={};
 for(const v of t.variants||[]){const color=a.colors.find(c=>c.id===v.color_id);
  a.stock[v.sku]=null;a.variants[v.sku]={...v,variant_id:v.sku,color:color?color.label:(v.color||''),price:v.price??0,stock:null,stockKnown:false,availability:availability(v),published:true,size_type:'other',size_display:v.size_display||'',size_native:v.size_display||'',size_unconfirmed:false,kit_price:v.pricing_policy_version===1?v.kit_price:null,kit_discount_pct:v.pricing_policy_version===1?(v.kit_discount_pct||0):0};}
 for(const o of t.size_options||[]){const key='opt:'+o.option_id+(o.color_id?'':'');a.stock[key]=null;
  a.variants[key]={sku:'',option_id:o.option_id,variant_id:'opt:'+o.option_id,color_id:o.color_id,option_scope:o.scope,color:'',price:0,price_pending:true,stock:null,stockKnown:false,availability:'preorder',availability_v3:'SIZE_CONFIRMATION_REQUIRED',payment_allowed:false,order_submission_allowed:true,requires_order_confirmation:true,published:true,size_type:'other',size_display:o.size,size_native:o.size,size_unconfirmed:false,kit_price:null,kit_discount_pct:0};}
 const priced=Object.values(a.variants).filter(v=>v.price>0&&v.order_submission_allowed);a.price=priced.length?Math.min(...priced.map(v=>v.price)):(t.price_min||0);
 a.sku=(t.variants||[])[0]?.sku||t.id;
 return a;
};
function colorOf(s,e){
 const fromUrl=typeof location!=='undefined'?new URLSearchParams(location.search).get('color'):null;
 const wanted=e.productColorId||fromUrl;if(wanted&&s.colors.some(c=>c.id===wanted))return wanted;
 const buyable=s.colors.find(c=>c.skus.some(k=>s.variants[k]?.payment_allowed))||s.colors.find(c=>c.skus.some(k=>s.variants[k]?.order_submission_allowed))||s.colors[0];
 return buyable?buyable.id:null;
}
// Keys offered for the current color: real SKU of that color, then request-only sizes without a SKU.
function keysFor(s,colorId){
 const real=Object.keys(s.variants).filter(k=>!s.variants[k].option_id&&s.variants[k].color_id===colorId);
 const realSizes=new Set(real.map(k=>s.variants[k].size_display).filter(Boolean));
 const options=Object.keys(s.variants).filter(k=>{const v=s.variants[k];return v.option_id&&(v.option_scope==='MODEL'||v.color_id===colorId)&&!realSizes.has(v.size_display);});
 return {real,options,all:real.concat(options)};
}
window.storeV3ProductVm=function(app,t,e,s){
 if(!s||!s.v3)return;
 const colorId=colorOf(s,e),color=s.colors.find(c=>c.id===colorId),k=keysFor(s,colorId);
 const selectable=k.all.filter(x=>s.variants[x].order_submission_allowed||!s.variants[x].option_id);
 const noSize=k.real.length>0&&k.real.every(x=>s.variants[x].size_status==='NO_SIZE_REQUIRED')&&!k.options.length;
 const chosen=e.size&&k.all.includes(e.size)?e.size:(selectable.filter(x=>s.variants[x].order_submission_allowed).length===1&&k.all.length===1?k.all[0]:noSize&&k.real.length===1?k.real[0]:null);
 const v=chosen?s.variants[chosen]:null,qty=Math.max(1,Math.floor(Number(e.qty)||1));
 // Gallery belongs to the color; never borrow another color's photos.
 const photos=color&&color.photos.length?color.photos:(s.colors.length<=1?s.modelPhotoData:[]);
 s.photoData=photos;
 if(t.gal){const idx=Math.min(e.galIdx||0,Math.max(0,photos.length-1));
  t.gal.slides=photos.length?photos.map((p,i)=>({slot:'img-'+s.id+'-'+colorId+'-'+i,ph:s.name,src:p.url,hasSrc:true,eager:i===0})):[{slot:'img-'+s.id,ph:'Фото кольору готується',hasSrc:false}];
  const thumb=t.gal.thumbs&&t.gal.thumbs[0]||{style:{}};
  t.gal.thumbs=photos.map((p,i)=>({...thumb,style:{...thumb.style,border:'1px solid '+(i===idx?'var(--legacy-f2a33c)':'var(--legacy-2a322b)')},slot:'img-'+s.id+'-'+colorId+'-'+i,src:p.thumb||p.url,hasSrc:true,pick:()=>app.galTo(i)}));
  t.gal.counter=(idx+1)+' / '+Math.max(1,photos.length);t.gal.next=()=>app.galTo(Math.min(Math.max(0,photos.length-1),idx+1));t.gal.prev=()=>app.galTo(Math.max(0,idx-1));
  t.gal.dots=photos.map((p,i)=>({style:{width:'6px',height:'6px',borderRadius:'50%',background:i===idx?'var(--legacy-f2a33c)':'var(--legacy-99a398)'}}));}
 t.productColors=s.colors.map(c=>({name:c.label,colorId:c.id,pick:()=>{app.setState({productColorId:c.id,size:null,qty:1,addErr:'',galIdx:0},()=>{try{const u=new URL(location.href);u.searchParams.set('color',c.id);history.replaceState({...(history.state||{}),route:{...(history.state?.route||{}),productColorId:c.id}},'',u.pathname+u.search+u.hash);}catch{}});},
  style:{padding:'10px 12px',minHeight:'44px',border:'1px solid '+(c.id===colorId?'var(--legacy-f2a33c)':'var(--legacy-3a423b)'),background:'transparent',color:'var(--legacy-edefea)',cursor:'pointer'}}));
 t.hasProductColors=s.colors.length>1;
 const row=t.item&&t.item.sizes&&t.item.sizes[0]||{style:{},qtyStyle:{}};
 t.item.sizes=k.all.map(key=>{const x=s.variants[key],sel=key===chosen,out=!x.order_submission_allowed,req=!x.payment_allowed&&!out;
  return {...row,variantKey:key,label:x.size_display||'—',qtyLabel:x.option_id?'запит':out?(x.availability_v3==='UNKNOWN'?'уточнюється':'немає'):req?'під замовлення':'',pick:()=>app.setState({size:key,notify:false,addErr:''}),
   style:{...row.style,border:'1px '+(req&&!sel?'dashed var(--legacy-4e4524)':'solid '+(sel?'var(--legacy-f2a33c)':'var(--legacy-2a322b)')),background:sel?(out?'var(--legacy-231a17)':'var(--legacy-f2a33c)'):'var(--legacy-0f120f)',color:out?'var(--legacy-5c6659)':sel?'var(--button-text)':req?'var(--legacy-d8be62)':'var(--legacy-edefea)',textDecoration:out?'line-through':'none'}};});
 t.sizeButtons=!noSize&&k.all.length>1;t.sizeOneRow=!noSize&&k.all.length===1;t.sizeOneText=t.sizeOneRow?'Розмір: '+(s.variants[k.all[0]].size_display||''):'';t.sizeHead='Розмір';
 const price=v?(v.option_id?null:v.price):null;
 t.item.priceFmt=price!=null?money(price):v&&v.option_id?'Ціну підтвердить менеджер':money(s.price);t.item.sku=v&&!v.option_id?v.sku:'';
 const state=!v?null:v.payment_allowed?'pay':v.order_submission_allowed?'request':'blocked';
 t.sizeNote=e.addErr||(!v?(noSize?'':'Оберіть розмір'):v.option_id?'Розмір доступний за запитом. Без оплати до підтвердження менеджером.':(AV[v.availability_v3]||'')+(v.delivery_lead_time_days?' · орієнтовно '+v.delivery_lead_time_days+' дн.':'')+(state==='request'?' · оплата після підтвердження':''));
 t.qtyLabel='Кількість';
 t.buyOn=state==='pay'||state==='request';t.buyOff=!t.buyOn;
 t.addLabel=!v?'Оберіть розмір':state==='pay'?'До кошика · '+money(price*qty):state==='request'?'Надіслати заявку':(v.availability_v3==='UNKNOWN'?'Наявність уточнюється':'Немає в наявності');
 t.mobBuyLabel=!v?'Оберіть розмір':state==='pay'?'До кошика':state==='request'?'Надіслати заявку':'Недоступно';t.mobSizeLabel=v?'Розмір: '+(v.size_display||'—'):'Оберіть розмір';
 const add=()=>v&&state!=='blocked'&&app.add(s.id,chosen,qty);
 t.addProduct=add;t.oneClick=()=>add()?app.go('cart'):app.setState({addErr:'Оберіть розмір'});t.mobBuy=()=>v?add():document.querySelector('[data-product-sizes]')?.scrollIntoView({block:'center',behavior:'smooth'});
};
// Cart → server: exact MODEL/COLOR/SKU or a size request without SKU. Prices/flags are never sent as authority.
window.storeV3PricingLine=function(l,p,v){
 if(!p||!p.v3||!v)return null;
 return v.option_id?{product_id:l.id,color_id:v.color_id||l.colorId||undefined,option_id:v.option_id,size:v.size_display,qty:l.qty,price_mode:'retail'}:{product_id:l.id,color_id:v.color_id,sku:v.sku,qty:l.qty,price_mode:l.wh?'wholesale':'retail'};
};
})();
