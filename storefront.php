<?php
declare(strict_types=1);
require __DIR__.'/shop/catalog-lib.php';require_once __DIR__.'/shop/theme-bootstrap.php';require_once __DIR__.'/api/seller.php';
rubizhHeaders();$nonce=rubizhStorefrontCsp();$themeMarkup='';
$uri=parse_url($_SERVER['REQUEST_URI'] ?? '/',PHP_URL_PATH) ?: '/';
if(in_array($uri,['/offer','/offer/','/privacy','/privacy/'],true)){header('Cache-Control: no-cache');echo rubizhNonceHtml(str_replace('<head>','<head>'.shopThemeMarkup(),rubizhSellerHtml(file_get_contents(__DIR__.($uri[1]==='o'?'/offer.html':'/privacy.html')))),$nonce);exit;}
// Public datasets are cached with background refresh. Render the inexpensive HTML shell
// per request so settings, metadata and theme never come from a stale full-page snapshot.
require_once __DIR__.'/shop/settings-lib.php';
$boot=['kitSlots'=>shopKitSlotPatterns()];$head='';$fallback='';$status=200;
function storefrontEsc(string $s): string{return htmlspecialchars($s,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');}
// BreadcrumbList JSON-LD: home → catalog → each published ancestor of the category path → current page (no item URL).
function storefrontBreadcrumb(array $categories,string $path,?string $leaf=null): string{
    $urls=array_column($categories,'url_path','path');$parts=$path===''?[]:explode(' / ',$path);
    $items=[['РУБІЖ','https://rubizh.shop/'],['Каталог','https://rubizh.shop/catalog']];
    foreach($parts as $i=>$name){$branch=implode(' / ',array_slice($parts,0,$i+1));if(isset($urls[$branch]))$items[]=[$name,'https://rubizh.shop/catalog/'.$urls[$branch]];}
    if($leaf!==null)$items[]=[$leaf,null];else $items[count($items)-1][1]=null;
    $list=[];foreach($items as $i=>[$name,$url])$list[]=['@type'=>'ListItem','position'=>$i+1,'name'=>$name]+($url===null?[]:['item'=>$url]);
    return '<script type="application/ld+json">'.json_encode(['@context'=>'https://schema.org','@type'=>'BreadcrumbList','itemListElement'=>$list],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_HEX_TAG|JSON_HEX_AMP|JSON_HEX_APOS|JSON_HEX_QUOT).'</script>';
}
try{
    rubizhPublicGate('storefront',180);rubizhHttpWork('public-read',16);$GLOBALS['rubizh_public_query_budget']=true;$themeMarkup=shopThemeMarkup();
    $db=db();
    if(str_starts_with($uri,'/catalog/')&&($redirect=shopTaxonomyRedirect($db,trim(substr($uri,9),'/'),$_GET))!==null){header('Location: '.$redirect,true,301);exit;}
    $boot['categories']=shopCategories($db);
    if(shopTaxonomyActive($db))$boot['taxonomyVersion']=shopTaxonomySpec()['version'];
    if(preg_match('~^/product/([a-z0-9-]{1,191})/?$~',$uri,$m)){
        $q=$db->prepare('SELECT * FROM products p WHERE visible=1 AND '.shopUsablePhotoSql('p').' AND slug=?');$q->execute([$m[1]]);$row=$q->fetch(PDO::FETCH_ASSOC);
        if(!$row){$status=404;$fallback='<h1>Товар не знайдено</h1><p>Товар знято з публікації або адреса змінилася.</p><a href="/catalog">До каталогу</a>';}
        else{$p=shopCached('product-v2-'.md5($m[1].'|'),function()use($db,$row){$p=shopProduct($db,$row,product_photos($db,[$row['id']]));try{$p['related']=shopRelated($db,$row,$p);}catch(Throwable $e){error_log('rubizh related: '.get_class($e).' code '.(string)$e->getCode());$p['related']=[];}return $p;});$boot['product']=$p;$boot['slug']=$p['slug'];$canonical='https://rubizh.shop/product/'.$p['slug'];
            $title=$p['name'].' — РУБІЖ';$description=mb_substr($p['description'] ?: 'Замовити '.$p['name'].' у РУБІЖ. Розміри, ціна та доставка по Україні.',0,160);
            // The advertised SKU, price and stock must describe the same variant.
            $seoVariants=$p['variants'];usort($seoVariants,fn($a,$b)=>strcmp((string)$a['sku'],(string)$b['sku']));
            $seoVariant=null;foreach($seoVariants as $v)if($v['availability']!=='out'&&$v['price']!==null&&(float)$v['price']===(float)$p['price_min']){$seoVariant=$v;break;}
            if($seoVariant===null)foreach($seoVariants as $v)if($v['price']!==null&&(float)$v['price']===(float)$p['price_min']){$seoVariant=$v;break;}
            $structured=['@context'=>'https://schema.org','@type'=>'Product','name'=>$p['name'],'description'=>$description,'sku'=>($seoVariant['sku']??$p['variants'][0]['sku']??$p['id']),'url'=>$canonical];
            if($seoVariant!==null&&$seoVariant['price']>0){
                $offer=['@type'=>'Offer','url'=>$canonical,'priceCurrency'=>'UAH','price'=>(string)$seoVariant['price'],'seller'=>['@type'=>'Organization','name'=>rubizhSeller()['name']]];
                $availability=$seoVariant['availability'];$stock=$seoVariant['stock']??null;
                if($availability==='out'||($availability==='in'&&$stock!==null&&$stock<=0))$offer['availability']='https://schema.org/OutOfStock';
                elseif($availability==='order')$offer['availability']='https://schema.org/PreOrder';
                elseif($availability==='in'&&$stock!==null&&$stock>0)$offer['availability']='https://schema.org/InStock';
                $structured['offers']=$offer;
            }
            if($p['brand']!=='')$structured['brand']=['@type'=>'Brand','name'=>$p['brand']];if($p['photos'])$structured['image']=array_column($p['photos'],'url');
            $head='<title>'.storefrontEsc($title).'</title><meta name="description" content="'.storefrontEsc($description).'"><link rel="canonical" href="'.storefrontEsc($canonical).'"><meta property="og:title" content="'.storefrontEsc($title).'"><meta property="og:description" content="'.storefrontEsc($description).'"><meta property="og:url" content="'.storefrontEsc($canonical).'"><meta property="og:type" content="product">';
            if($p['photos'])$head.='<meta property="og:image" content="'.storefrontEsc(str_starts_with($p['photos'][0]['url'],'/')?'https://rubizh.shop'.$p['photos'][0]['url']:$p['photos'][0]['url']).'">';
            $head.='<script id="rubizh-product-schema" type="application/ld+json">'.json_encode($structured,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_HEX_TAG|JSON_HEX_AMP|JSON_HEX_APOS|JSON_HEX_QUOT).'</script>'.storefrontBreadcrumb($boot['categories'],(string)$p['category'],$p['name']);
            $fallback='<article><h1>'.storefrontEsc($p['name']).'</h1><p>'.storefrontEsc($p['description']).'</p><p>'.storefrontEsc((string)$p['price_min']).' ₴</p><a href="/catalog">До каталогу</a></article>';
        }
    }elseif($uri==='/porady'||str_starts_with($uri,'/porady/')){
        if(in_array($uri,['/porady/dohliad-rip-stop','/porady/rozkladka'],true)){header('Location: /porady',true,301);exit;}
        $guides=json_decode(file_get_contents(__DIR__.'/shop/guides.json'),true);$slug=rawurldecode(trim(substr($uri,7),'/'));$guide=null;foreach($guides as $g)if($g['slug']===$slug)$guide=$g;
        $aliases=['rozmir-formy'=>'g6','yak-obraty-plytonosku'=>'g2','rozmiry-bronepłyt'=>'g2','rozmir-bertsiv'=>'g1','zymovi-bertsi'=>'g1','ifak'=>'g5'];if(isset($aliases[$slug]))foreach($guides as $g)if($g['key']===$aliases[$slug]){header('Location: /porady/'.$g['slug'],true,301);exit;}
        if($slug!==''&&!$guide){$status=404;$fallback='<h1>Пораду не знайдено</h1><a href="/porady">Усі поради</a>';}
        elseif($guide){$boot['guideKey']=$guide['key'];$head='<title>'.storefrontEsc($guide['title']).' — Поради РУБІЖ</title><link rel="canonical" href="https://rubizh.shop/porady/'.storefrontEsc($guide['slug']).'"><meta name="description" content="'.storefrontEsc($guide['desc']).'">';$fallback='<article><h1>'.storefrontEsc($guide['title']).'</h1><p>'.storefrontEsc($guide['desc']).'</p>';foreach($guide['secs'] as $sec){$fallback.='<h2>'.storefrontEsc($sec['h']).'</h2><p>'.storefrontEsc($sec['p']??'').'</p>';if(isset($sec['table'])){$fallback.='<table>';foreach($sec['table'] as $row){$fallback.='<tr>';foreach($row as $cell)$fallback.='<td>'.storefrontEsc((string)$cell).'</td>';$fallback.='</tr>';}$fallback.='</table>';}if(isset($sec['warn']))$fallback.='<p>'.storefrontEsc($sec['warn']).'</p>';}$fallback.='</article>';}
        else{$head='<title>Поради — РУБІЖ</title><link rel="canonical" href="https://rubizh.shop/porady"><meta name="description" content="Поради РУБІЖ: як підібрати розмір форми й берців, обрати плитоноску, зібрати аптечку та доглядати за спорядженням.">';$fallback='<h1>Поради</h1>';foreach($guides as $g)$fallback.='<p><a href="/porady/'.storefrontEsc($g['slug']).'">'.storefrontEsc($g['title']).'</a></p>';}
    }elseif(in_array($uri,['/categories','/categories/'],true)){$head='<title>Усі категорії — РУБІЖ</title><link rel="canonical" href="https://rubizh.shop/categories"><meta name="description" content="Усі категорії тактичного одягу та спорядження РУБІЖ: форма, взуття, бронезахист, медицина, рюкзаки та аксесуари.">';$fallback='<h1>Усі категорії</h1>';foreach($boot['categories'] as $c)$fallback.='<p><a href="/catalog/'.storefrontEsc($c['url_path']).'">'.storefrontEsc($c['path']).'</a></p>';
    }elseif($uri==='/catalog'||str_starts_with($uri,'/catalog/')){
        $category=trim(substr($uri,8),'/');$args=$_GET;$args['category']=$category;
        foreach(['priceFrom'=>'price_from','priceTo'=>'price_to'] as $from=>$to)if(isset($_GET[$from]))$args[$to]=$_GET[$from];
        foreach(['brands','camo','sizes'] as $key){$selected=json_decode((string)($_GET[$key] ?? '[]'),true);if(is_array($selected))$args[$key]=implode('|',array_map(fn($v)=>$key==='sizes'?str_replace('|',':',(string)$v):(string)$v,$selected));}
        if(($_GET['inStock'] ?? '')==='1'||($_GET['quick'] ?? '')==='stock')$args['availability']='in';elseif(($_GET['withOrder'] ?? '')==='0')$args['availability']='available';if(($_GET['quick'] ?? '')==='new')$args['sort']='new';
$boot['catalog']=shopCatalog($db,$args);
        $boot['categoryPath']=[];foreach($boot['categories'] as $c)if($c['url_path']===$category)$boot['categoryPath']=explode(' / ',$c['path']);
        if($category!==''&&!$boot['categoryPath']){ $known=shopTaxonomyTarget($db,$category);if($known)$boot['categoryPath']=explode(' / ',$known['path']);else $status=404;}
        $title=$boot['categoryPath']?end($boot['categoryPath']).' — купити в РУБІЖ':'Каталог тактичного спорядження — РУБІЖ';$canonical='https://rubizh.shop/catalog'.($category!==''?'/'.$category:'');if($boot['catalog']['page']>1)$canonical.='?page='.$boot['catalog']['page'];
        $head='<title>'.storefrontEsc($title).'</title><link rel="canonical" href="'.storefrontEsc($canonical).'"><meta name="description" content="'.storefrontEsc($title.' — ціни, розміри та доставка по Україні.').'">';
        // The client always serializes its default sort; it does not make a clean catalog filtered.
        if(array_filter($_GET,fn($value,$key)=>$key!=='page'&&($key!=='sort'||$value!=='pop'),ARRAY_FILTER_USE_BOTH))$head.='<meta name="robots" content="noindex,follow">';
        if($status!==404)$head.=storefrontBreadcrumb($boot['categories'],implode(' / ',$boot['categoryPath']));
        $fallback='<h1>'.storefrontEsc($title).'</h1><ul>';foreach($boot['catalog']['items'] as $p)$fallback.='<li><a href="/product/'.storefrontEsc($p['slug']).'">'.storefrontEsc($p['name']).'</a> · '.storefrontEsc((string)$p['price_min']).' ₴</li>';$fallback.='</ul>';
        for($page=1;$page<=max(1,$boot['catalog']['pages']);$page++)$fallback.='<a href="'.storefrontEsc($uri.'?page='.$page).'">'.$page.'</a> ';
    }elseif(preg_match('~^/kit/([a-f0-9]{32})/?$~',$uri,$m)){$boot['kitCode']=$m[1];$head='<title>Комплект побратима — РУБІЖ</title><meta name="robots" content="noindex,follow">';}
    elseif(in_array($uri,['/kit','/kit/'],true)){$head='<title>Зібрати комплект — РУБІЖ</title><link rel="canonical" href="https://rubizh.shop/kit/"><meta name="description" content="Конструктор комплекту РУБІЖ: голова, тіло, ноги, взуття, бронезахист, спорядження й медицина. Оберіть речі щонайменше з двох різних розділів — отримаєте ціну комплекту.">';$fallback='<h1>Зібрати комплект</h1><p>Оберіть речі для кожного слоту. Оберіть речі щонайменше з двох різних розділів — отримаєте ціну комплекту.</p><a href="/catalog">До каталогу</a>';}
    elseif(preg_match('~^/(?:product|kit)(?:/|$)~',$uri)){$status=404;$fallback='<h1>Сторінку не знайдено</h1><p>Перевірте адресу або відкрийте каталог.</p><a href="/catalog">До каталогу</a>';}
    else{$boot['catalog']=shopCatalog($db,[]);$head='<link rel="canonical" href="https://rubizh.shop/">';$fallback='<h1>РУБІЖ — тактичний одяг та спорядження</h1><ul>';foreach($boot['categories'] as $c)if(!str_contains($c['path'],' / '))$fallback.='<li><a href="/catalog/'.storefrontEsc($c['url_path']).'">'.storefrontEsc($c['name']).'</a></li>';$fallback.='</ul>';}
}catch(Throwable $e){error_log('rubizh storefront: '.get_class($e).' code '.(string)$e->getCode());$status=$e instanceof RubizhHttpException?$e->status:503;$boot['error']=$e instanceof RubizhHttpException?$e->getMessage():'Каталог тимчасово недоступний. Спробуйте ще раз.';$head='<meta name="robots" content="noindex,follow">';if($e instanceof RubizhHttpException&&$e->retryAfter)header('Retry-After: '.$e->retryAfter);}
http_response_code($status);header('Content-Type: text/html; charset=utf-8');header('Cache-Control: '.($status>=400?'no-store':(!empty($_SESSION['customer_id'])?'private, no-store':'no-cache')));header('X-Content-Type-Options: nosniff');
if($status===503)header('Retry-After: 60');
if($status===404){echo '<!doctype html><html lang="uk"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Не знайдено — РУБІЖ</title><style>a{color:#F2A33C}</style><body style="background:#0B0D0B;color:#EDEFEA;font:18px Arial;padding:40px">'.$fallback.'</body></html>';exit;}
$boot['settings']=shopPublicSettings();
$html=rubizhSellerHtml(file_get_contents(__DIR__.'/index.html'));
// Real metadata belongs in the head, before the client runtime begins.
if(str_contains($head,'<title>'))$html=preg_replace('~<title>.*?</title>~s','',$html,1);
if(str_contains($head,'<meta name="description"'))$html=preg_replace('~<meta\b[^>]*\bname=["\']description["\'][^>]*>~i','',$html);
$html=str_replace('</head>',$head.'<script>window.RUBIZH_BOOT='.json_encode($boot,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_HEX_TAG|JSON_HEX_AMP|JSON_HEX_APOS|JSON_HEX_QUOT).';</script></head>',$html);
$html=str_replace('<body>','<body><noscript><div style="padding:24px;background:#0B0D0B;color:#EDEFEA">'.$fallback.'<p>Для оформлення замовлення увімкніть JavaScript або <a href="tel:+380976867892">зателефонуйте менеджеру</a>.</p></div></noscript>',$html);
echo rubizhNonceHtml(str_replace('<head>','<head>'.$themeMarkup,$html),$nonce);
