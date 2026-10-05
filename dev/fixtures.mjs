// Demonstration data; never imported by the production PHP application.
const rows = [
  ['uniform', 'Демо · Тактичний костюм ММ14', 'Одяг та форма / Костюми', 3200, 'category-uniform.95312bde6e13.webp', ['M', 'L', 'XL'], 'body'],
  ['pants', 'Демо · Тактичні штани Ripstop', 'Одяг та форма / Штани', 1800, 'category-uniform.95312bde6e13.webp', ['M', 'L', 'XL'], 'legs'],
  ['boots', 'Демо · Берці демісезонні', 'Взуття / Берці', 2900, 'category-boots.8c675db9bc54.webp', ['42', '43', '44'], 'boots'],
  ['armor', 'Демо · Плитоноска', 'Бронезахист / Плитоноски', 4200, 'category-armor.7c36c18e379c.webp', ['Один розмір'], 'armor'],
  ['backpack', 'Демо · Тактичний рюкзак 35 л', 'Рюкзаки, сумки та баули / Рюкзаки', 2100, 'category-gear.c56b57d557de.webp', ['Один розмір'], 'gear'],
  ['camo', 'Демо · Маскувальна сітка', 'Маскування / Сітки', 1400, 'category-camo.b7dc97473855.webp', ['Один розмір'], 'small'],
  ['med', 'Демо · Аптечка IFAK', 'Тактична медицина / Аптечки', 1700, 'category-med.a8f960dde519.webp', ['Один розмір'], 'med'],
];
const alphabet = {а:'a',б:'b',в:'v',г:'h',ґ:'g',д:'d',е:'e',є:'ie',ж:'zh',з:'z',и:'y',і:'i',ї:'i',й:'i',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ь:'',ю:'iu',я:'ia'};
export const slug = text => text.toLowerCase().split('').map(c=>alphabet[c]??c).join('').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
export const products = rows.map(([id, name, category, price, photo, sizes, slot]) => ({
  id:'demo-'+id,slug:'demo-'+id,name,category,slot,brand:'Демонстраційний товар',description:'Демонстраційна картка для перевірки дизайну. Ціна, залишки та характеристики є прикладами. Замовлення та оплата в цьому режимі вимкнені.',
  price_min:price,availability:'in',has_docs:false,docs_note:'',attributes:{'Сезон':'Демісезон','Країна':'Демо'},
  photos:[{url:'/assets/'+photo,thumb:'/assets/'+photo,width:800,height:1000}],
  variants:sizes.map((size,i)=>({sku:'DEMO-'+id.toUpperCase()+'-'+size,variant_id:'demo-'+id+'-'+i,size_display:size,size_native:size,size_type:slot==='boots'?'footwear':sizes.length>1?'clothing':'other',color:slot==='body'||slot==='legs'?'Піксель':'Олива',price,kit_price:slot==='armor'?price:Math.round(price*.87),kit_discount_pct:slot==='armor'?0:13,stock:5,availability:'in',lead_time:''}))
}));
const paths = [...new Set(products.flatMap(p => [p.category.split(' / ')[0],p.category]))];
export const categories = paths.map(path => ({path,name:path.split(' / ').at(-1),url_path:path.split(' / ').map(slug).join('/'),product_count:products.filter(p=>p.category===path||p.category.startsWith(path+' / ')).length}));
export function catalog(query) {
  let items=products;
  const q=(query.get('q')||'').toLocaleLowerCase('uk');
  if(q)items=items.filter(p=>p.name.toLocaleLowerCase('uk').includes(q)||p.variants.some(v=>v.sku.toLowerCase().includes(q)));
  const category=categories.find(c=>c.url_path===query.get('category'));
  if(category)items=items.filter(p=>p.category===category.path||p.category.startsWith(category.path+' / '));
  if(query.has('roots')) {try {const roots=JSON.parse(query.get('roots'));items=items.filter(p=>roots.some(r=>p.category===r||p.category.startsWith(r+' / ')))}catch{items=[]}}
  if(query.has('slot'))items=items.filter(p=>p.slot===query.get('slot'));
  if(query.has('brands'))items=items.filter(p=>query.get('brands').split('|').includes(p.brand));
  if(query.has('camo'))items=items.filter(p=>p.variants.some(v=>query.get('camo').split('|').includes(v.color)));
  if(query.has('sizes'))items=items.filter(p=>p.variants.some(v=>query.get('sizes').split('|').some(s=>s.split(':').at(-1)===v.size_display)));
  if(query.has('price_from'))items=items.filter(p=>p.price_min>=Number(query.get('price_from')));
  if(query.has('price_to'))items=items.filter(p=>p.price_min<=Number(query.get('price_to')));
  if(query.get('sort')==='cheap')items=[...items].sort((a,b)=>a.price_min-b.price_min);
  if(query.get('sort')==='exp')items=[...items].sort((a,b)=>b.price_min-a.price_min);
  return {ok:true,items,total:items.length,page:1,pages:items.length?1:0,facets:{brands:['Демонстраційний товар'],camo:['Піксель','Олива'],sizes:['M','L','XL','42','43','44'],size_groups:[{kind:'clothing',label:'Розмір одягу',values:['M','L','XL']},{kind:'footwear',label:'Розмір взуття',values:['42','43','44']}],attrs:{},leaves:[],price:{min:1400,max:4200,distinct:7,ranges:[]}}};
}
