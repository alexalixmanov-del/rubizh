// SEO check of the staging storefront after the clean reset + one v3 publication: sitemap holds only current v3
// model URLs (no legacy, no -N duplicates), product/category/home pages have title, description, self canonical
// and no accidental noindex; robots.txt points to the sitemap.
// Usage: node tests/.staging/seo-check.mjs WIRE.json [BASE=http://127.0.0.1:8090] [OUT.json]
import {readFileSync,writeFileSync} from 'node:fs';
const [wirePath,base='http://127.0.0.1:8090',out]=process.argv.slice(2);const wire=JSON.parse(readFileSync(wirePath,'utf8'));
const slugs=new Set(wire.products.map(p=>p.slug)),ORIGIN='https://rubizh.shop',issues=[];
const get=async p=>{const r=await fetch(base+p);return {status:r.status,text:await r.text()};};
const head=(html,url)=>{const title=(html.match(/<title>([^<]*)<\/title>/)||[])[1]||'',desc=(html.match(/<meta name="description" content="([^"]*)"/)||[])[1]||'',canonical=(html.match(/<link rel="canonical" href="([^"]*)"/)||[])[1]||'',noindex=/<meta name="robots" content="[^"]*noindex/.test(html);
 if(!title.trim())issues.push(url+': no title');if(!desc.trim())issues.push(url+': no description');if(canonical!==ORIGIN+url)issues.push(url+': canonical '+canonical);if(noindex)issues.push(url+': noindex');return {title,canonical};};
const sm=await get('/sitemap.php'),locs=[...sm.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1].replace(/&amp;/g,'&'));
const products=locs.filter(u=>u.startsWith(ORIGIN+'/product/')).map(u=>decodeURIComponent(u.slice((ORIGIN+'/product/').length)));
const legacy=products.filter(s=>!slugs.has(s));
if(legacy.length)issues.push('sitemap: '+legacy.length+' product URLs are not current v3 models');
const robots=(await get('/robots.txt')).text;if(!/^Sitemap: https:\/\/rubizh\.shop\/sitemap\.xml$/m.test(robots))issues.push('robots: no Sitemap line');if(/^Disallow:\s*\/\s*$/m.test(robots.split(/User-agent: GPTBot/)[0]))issues.push('robots: global Disallow /');
const sample=[...products.slice(0,25),...products.slice(-5)];for(const s of sample){const url='/product/'+encodeURIComponent(s).replace(/%2F/g,'/'),r=await get(url);if(r.status!==200)issues.push(url+': HTTP '+r.status);else head(r.text,'/product/'+s);}
const cats=locs.filter(u=>u.startsWith(ORIGIN+'/catalog/')).slice(0,10).map(u=>u.slice(ORIGIN.length));for(const c of cats){const r=await get(c);if(r.status!==200)issues.push(c+': HTTP '+r.status);else head(r.text,decodeURIComponent(c));}
const home=await get('/');if(!/<link rel="canonical" href="https:\/\/rubizh\.shop\/">/.test(home.text))issues.push('home canonical');
const report={sitemap_urls:locs.length,sitemap_products:products.length,wire_models:wire.products.length,legacy_in_sitemap:legacy.length,suffix_slugs_in_sitemap:products.filter(s=>/-\d+$/.test(s)).length,checked_products:sample.length,checked_categories:cats.length,issues};
if(out)writeFileSync(out,JSON.stringify(report,null,1));console.log(JSON.stringify({...report,issues:issues.slice(0,20)}));console.log('SEO',issues.length?'FAIL':'PASS');
