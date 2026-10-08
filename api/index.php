<?php
// РУБІЖ · API магазина
//   PIM (по ключу):  POST /api/pim/sync · POST /api/pim/photos · GET /api/pim/status
//   Сайт (открыто):  GET /api/categories · GET /api/catalog · GET /api/product/{slug} · GET /api/health
//   Планировщик:     GET /api/cron/photos?key=...
declare(strict_types=1);
require __DIR__ . '/lib.php';
ini_set('display_errors', '0');
set_exception_handler(function (Throwable $e) { error_log('rubizh api: '.get_class($e).' code '.(string)$e->getCode());header('Cache-Control: no-store');if($e instanceof RubizhHttpException){if($e->retryAfter)header('Retry-After: '.$e->retryAfter);fail($e->status,$e->getMessage());}fail(500,'Ошибка сервера. Попробуйте позже.'); });
rubizhHeaders();

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$path = '/' . trim(preg_replace('~^.*?/api~', '', $path), '/');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$isPim = str_starts_with($path, '/pim/');
cors($isPim);
if(!$isPim){rubizhPublicGate('catalog');rubizhHttpWork('public-read',16);$GLOBALS['rubizh_public_query_budget']=true;}

/* ===================== PIM ===================== */
if ($isPim) {
  require_pim();
  $pdo = db();

  if($path==='/pim/categories'&&$method==='GET')out(['ok'=>true,'version'=>shopTaxonomySpec()['version'],'classifier_version'=>shopTaxonomySpec()['classifier_version'],'id_aliases'=>shopTaxonomySpec()['id_aliases'],'categories'=>shopTaxonomySpec()['categories']]);
  if ($path === '/pim/cache-clear') out(['ok' => true, 'removed' => shopCacheClear()]);
  if ($path === '/pim/sync' && $method === 'POST') {
    @set_time_limit(120);
    $b = body();
    if((int)$pdo->query("SELECT GET_LOCK('rubizh-category-migration',10)")->fetchColumn()!==1)fail(503,'Каталог оновлюється; повторіть синхронізацію пізніше.');
    register_shutdown_function(fn()=> $pdo->query("SELECT RELEASE_LOCK('rubizh-category-migration')"));
    if(isset($b['settings']['hide_unavailable']))$pdo->prepare("INSERT INTO meta(k,v) VALUES('hide_unavailable',?) ON DUPLICATE KEY UPDATE v=VALUES(v)")->execute([$b['settings']['hide_unavailable']===false?'0':'1']);
    $mode = ($b['mode'] ?? 'delta') === 'full' ? 'full' : 'delta';
    if (isset($b['categories']) && is_array($b['categories'])) sync_categories($pdo, $b['categories']);
    $results = []; $cnt = ['created' => 0, 'updated' => 0, 'unchanged' => 0, 'error' => 0];
    foreach ((is_array($b['products'] ?? null) ? $b['products'] : []) as $p) {
      $r = save_product($pdo, is_array($p) ? $p : []); $results[] = $r; $cnt[$r['status']] = ($cnt[$r['status']] ?? 0) + 1;
    }
    $hidden = hide_products($pdo, is_array($b['hide_ids'] ?? null) ? $b['hide_ids'] : []);
    // Полная синхронизация: всё, чего нет в списке PIM, скрываем (не удаляем — ссылки и заказы не ломаются)
    if ($mode === 'full' && !empty($b['finalize']) && is_array($b['all_ids'] ?? null)) {
      $keep = array_flip(array_map('strval', $b['all_ids']));
      if (count($keep) === 0) fail(400, 'Пустой список товаров при полной синхронизации — отменено, чтобы не скрыть весь каталог');
      $vis = $pdo->query("SELECT id FROM products WHERE visible=1")->fetchAll(PDO::FETCH_COLUMN);
      $hidden += hide_products($pdo, array_values(array_filter($vis, fn($id) => !isset($keep[$id]))));
    }
    $pdo->exec('DELETE a FROM rubizh_catalog_supplier_articles a LEFT JOIN variants v ON v.sku=a.sku AND v.product_id=a.product_id LEFT JOIN products p ON p.id=a.product_id WHERE v.sku IS NULL OR p.id IS NULL OR p.visible=0');
    $pdo->exec('DELETE f FROM rubizh_catalog_fulfillment f LEFT JOIN variants v ON v.sku=f.sku AND v.product_id=f.product_id LEFT JOIN products p ON p.id=f.product_id WHERE v.sku IS NULL OR p.id IS NULL OR p.visible=0');
    if(isset($b['kits'])){if(!is_array($b['kits']))fail(400,'Невірний склад комплектів');require_once __DIR__.'/kits.php';sync_kits($pdo,$b['kits']);}
    if ($cnt['created'] || $cnt['updated'] || $hidden || isset($b['categories'])) recount_categories($pdo);
    $pdo->prepare("INSERT INTO sync_log (at,mode,received,saved,unchanged,hidden,errors,note) VALUES (?,?,?,?,?,?,?,?)")
      ->execute([now(), $mode, count($results), $cnt['created'] + $cnt['updated'], $cnt['unchanged'], $hidden, $cnt['error'], mb_substr((string)($b['note'] ?? ''), 0, 255)]);
    $pdo->exec("INSERT INTO meta (k,v) VALUES ('catalog_updated','" . now() . "') ON DUPLICATE KEY UPDATE v=VALUES(v)");
    $pending = (int)$pdo->query("SELECT COUNT(*) FROM photos WHERE status='pending'")->fetchColumn();
    out(['ok' => true, 'mode' => $mode, 'counts' => $cnt, 'hidden' => $hidden, 'photos_pending' => $pending, 'results' => $results]);
  }

  if ($path === '/pim/photos' && $method === 'POST') {
    @set_time_limit(60);
    $b = json_decode(file_get_contents('php://input') ?: '{}', true) ?: [];
    out(['ok' => true] + process_photos($pdo, max(1, min(80, (int)($b['limit'] ?? 30))), 22.0));
  }

  if ($path === '/pim/status') {
    $q = fn($sql) => $pdo->query($sql)->fetchColumn();
    out(['ok' => true, 'api_version' => API_VERSION,
      'products' => ['visible' => (int)$q("SELECT COUNT(*) FROM products WHERE visible=1"), 'hidden' => (int)$q("SELECT COUNT(*) FROM products WHERE visible=0")],
      'variants' => (int)$q("SELECT COUNT(*) FROM variants v JOIN products p ON p.id=v.product_id WHERE p.visible=1"),
      'categories' => (int)$q("SELECT COUNT(*) FROM categories WHERE product_count>0"),
      'photos' => ['ok' => (int)$q("SELECT COUNT(*) FROM photos WHERE status='ok'"), 'pending' => (int)$q("SELECT COUNT(*) FROM photos WHERE status='pending'"), 'error' => (int)$q("SELECT COUNT(*) FROM photos WHERE status='error'")],
      'last_sync' => $pdo->query("SELECT at, mode, received, saved, unchanged, hidden, errors FROM sync_log ORDER BY id DESC LIMIT 1")->fetch() ?: null,
      'photo_progress' => (function()use($pdo){require_once __DIR__.'/photo-status.php';return photoProgress($pdo);})(),
      'photo_errors' => $pdo->query("SELECT product_id, src_url, error FROM photos WHERE status='error' ORDER BY updated_at DESC LIMIT 20")->fetchAll()]);
  }
  fail(404, 'Нет такого метода PIM');
}

/* ===================== планировщик ===================== */
if ($path === '/cron/photos') {
  $k = (string)cfg('cron_key');
  if (strlen($k) < 16 || !hash_equals($k, (string)($_GET['key'] ?? ''))) fail(401, 'Неверный ключ');
  @set_time_limit(60);
  out(['ok' => true] + process_photos(db(), 150, 50.0));
}

/* ===================== сайт ===================== */
if ($method !== 'GET') fail(405, 'Только GET');
$pdo = db();
header('Cache-Control: public, max-age=60');

if($path==='/storefront'){require_once __DIR__.'/../shop/kit-data.php';out(shopStorefront($pdo));}
if ($path === '/health') {
  // Перевірка для зовнішнього моніторингу (UptimeRobot): ok=false + HTTP 503 + причини.
  $problems = [];
  $updated = $pdo->query("SELECT v FROM meta WHERE k='catalog_updated'")->fetchColumn() ?: null;
  $files = $pdo->query("SELECT file FROM photos WHERE status='ok' AND file<>'' ORDER BY RAND() LIMIT 3")->fetchAll(PDO::FETCH_COLUMN);
  $checks = []; $dir = rtrim((string)cfg('media_dir'), '/');
  foreach ($files as $f) {
    $local = $dir . '/' . ltrim((string)$f, '/'); $okFile = $dir !== '' && is_file($local) && is_readable($local);
    $type = $okFile && function_exists('mime_content_type') ? (string)@mime_content_type($local) : '';
    $code = null; $url = media_url((string)$f); if (str_starts_with($url, '/')) $url = 'https://' . ($_SERVER['HTTP_HOST'] ?? 'rubizh.shop') . $url;
    if (function_exists('curl_init')) { $ch = curl_init($url); curl_setopt_array($ch, [CURLOPT_NOBODY => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_TIMEOUT => 5, CURLOPT_CONNECTTIMEOUT => 3]); curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $ctype = (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE); curl_close($ch); if ($type === '') $type = $ctype; }
    $good = $okFile && ($code === null || $code === 200) && ($type === '' || str_starts_with($type, 'image/'));
    $checks[] = ['file' => $f, 'ok' => $good, 'http' => $code, 'type' => $type];
  }
  $visible = (int)$pdo->query("SELECT COUNT(*) FROM products WHERE visible=1")->fetchColumn();
  if ($visible > 0 && !$files) $problems[] = 'фото недоступні: немає жодного обробленого фото';
  elseif ($checks && count(array_filter($checks, fn($c) => !$c['ok']))) $problems[] = 'фото недоступні';
  $queue = ['pending' => (int)$pdo->query("SELECT COUNT(*) FROM photos WHERE status='pending'")->fetchColumn(), 'error' => (int)$pdo->query("SELECT COUNT(*) FROM photos WHERE status='error'")->fetchColumn()];
  $oldest = $pdo->query("SELECT MIN(updated_at) FROM photos WHERE status='pending'")->fetchColumn() ?: null;
  $queue['oldest_pending'] = $oldest;
  if ($oldest && strtotime((string)$oldest . ' UTC') < time() - 6 * 3600) $problems[] = 'черга фото стоїть понад 6 годин';
  if ($queue['error'] > (int)(cfg('health_photo_errors_max') ?: 50)) $problems[] = 'забагато фото з помилкою: ' . $queue['error'];
  $maxHours = (int)(cfg('health_publish_max_hours') ?: 72);
  if (!$updated) $problems[] = 'немає жодної публікації з PIM';
  elseif (strtotime((string)$updated . ' UTC') < time() - $maxHours * 3600) $problems[] = 'остання публікація з PIM понад ' . $maxHours . ' год тому';
  out(['ok' => !$problems, 'reason' => $problems ? implode('; ', $problems) : null, 'api_version' => API_VERSION, 'catalog_updated' => $updated, 'photos_checked' => $checks, 'photo_queue' => $queue], $problems ? 503 : 200);
}

if ($path === '/categories') {
  if(shopTaxonomyActive($pdo)){require_once __DIR__.'/../shop/catalog-lib.php';out(['ok'=>true,'categories'=>array_map(fn($c)=>$c+['url'=>$c['url_path'],'count'=>$c['product_count'],'depth'=>$c['parent_id']===null?1:2],shopCategories($pdo))]);}
  $rows = $pdo->query("SELECT id, parent_id, path, name, slug, url_path, depth, product_count FROM categories WHERE product_count>0 ORDER BY sort")->fetchAll();
  out(['ok' => true, 'categories' => array_map(fn($r) => ['id' => $r['id'], 'parent_id' => $r['parent_id'], 'path' => $r['path'], 'name' => $r['name'], 'slug' => $r['slug'], 'url' => $r['url_path'], 'depth' => (int)$r['depth'], 'count' => (int)$r['product_count']], $rows)]);
}

if ($path === '/catalog'&&shopTaxonomyActive($pdo)){require_once __DIR__.'/../shop/catalog-lib.php';$input=$_GET;if(isset($input['brand']))$input['brands']=$input['brand'];$input['sort']=['price_asc'=>'cheap','price_desc'=>'exp'][$input['sort']??'']??($input['sort']??'');$catalog=shopCatalog($pdo,$input);foreach($catalog['items'] as &$card){$card['photo']=$card['photos'][0]??null;$card['variants_count']=count($card['variants']);$card['price_max']=$card['variants']?max(array_column($card['variants'],'price')):null;}unset($card);out($catalog);}
if ($path === '/catalog') {
  $where = ['p.visible=1']; $args = [];if($pdo->query("SELECT v FROM meta WHERE k='hide_unavailable'")->fetchColumn()!=='0')$where[]="EXISTS(SELECT 1 FROM variants av WHERE av.product_id=p.id AND av.availability IN ('in','order') AND av.price>0 AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(av.data,'$.size_unconfirmed')),'false') NOT IN ('true','1'))";
  if (($c = trim((string)($_GET['category'] ?? ''))) !== '') {   // url категории: odiah-ta-forma/cholovichyi-odiah
    $st = $pdo->prepare("SELECT path FROM categories WHERE url_path=?"); $st->execute([trim($c, '/')]); $cp = $st->fetchColumn();
    if (!$cp) out(['ok' => true, 'total' => 0, 'items' => []]);
    $where[] = '(p.category_path=? OR p.category_path LIKE ?)'; $args[] = $cp; $args[] = str_replace(['%', '_'], ['\%', '\_'], $cp) . ' / %';
  }
  if (($q = trim((string)($_GET['q'] ?? ''))) !== '') {
    foreach (array_slice(preg_split('/\s+/u', mb_strtolower($q)), 0, 6) as $w) { $where[] = '(LOWER(p.name) LIKE ? OR p.id IN (SELECT product_id FROM variants WHERE sku LIKE ?))'; $args[] = '%' . $w . '%'; $args[] = $w . '%'; }
  }
  if (($b = trim((string)($_GET['brand'] ?? ''))) !== '') { $where[] = 'p.brand=?'; $args[] = $b; }
  if (($a = (string)($_GET['availability'] ?? '')) === 'in') $where[] = "p.availability='in'";
  elseif ($a === 'available') $where[] = "p.availability IN ('in','order')";
  if (is_numeric($_GET['price_from'] ?? null)) { $where[] = 'p.price_min>=?'; $args[] = (int)$_GET['price_from']; }
  if (is_numeric($_GET['price_to'] ?? null)) { $where[] = 'p.price_min<=?'; $args[] = (int)$_GET['price_to']; }
  $sort = ['price_asc' => 'p.price_min IS NULL, p.price_min ASC', 'price_desc' => 'p.price_min DESC', 'new' => 'p.created_at DESC', 'name' => 'p.name ASC'][$_GET['sort'] ?? ''] ?? "FIELD(p.availability,'in','order','out'), p.updated_at DESC";
  $limit = max(1, min(100, (int)($_GET['limit'] ?? 24))); $page = max(1, (int)($_GET['page'] ?? 1));
  $w = implode(' AND ', $where);
  $st = $pdo->prepare("SELECT COUNT(*) FROM products p WHERE $w"); $st->execute($args); $total = (int)$st->fetchColumn();
  $st = $pdo->prepare("SELECT p.* FROM products p WHERE $w ORDER BY $sort LIMIT $limit OFFSET " . (($page - 1) * $limit)); $st->execute($args); $rows = $st->fetchAll();
  $ph = product_photos($pdo, array_column($rows, 'id'));
  out(['ok' => true, 'total' => $total, 'page' => $page, 'pages' => (int)ceil($total / $limit), 'items' => array_map(fn($r) => card_row($r, $ph), $rows)]);
}

if (preg_match('~^/product/([a-z0-9-]{1,191})$~', $path, $m)) {
  $st = $pdo->prepare("SELECT * FROM products WHERE slug=? AND visible=1"); $st->execute([$m[1]]); $r = $st->fetch();
  if (!$r) fail(404, 'Товар не найден');
  $taxonomy=shopTaxonomyProduct($pdo,$r);
  $d = json_decode((string)$r['data'], true) ?: [];
  $ph = product_photos($pdo, [$r['id']]);
  $vs = $pdo->prepare("SELECT data FROM variants WHERE product_id=? ORDER BY sort"); $vs->execute([$r['id']]);
  $variants = array_map(fn($x) => json_decode((string)$x['data'], true), $vs->fetchAll());
  // Связанные товары: только видимые; аналоги — только в наличии
  $links = [];
  foreach (['related', 'analogs', 'kit'] as $t) {
    $ids = array_values(array_filter(array_map(fn($x) => is_array($x) ? ($x['id'] ?? '') : (string)$x, $d['links'][$t] ?? [])));
    if (!$ids) { $links[$t] = []; continue; }
    $in = implode(',', array_fill(0, count($ids), '?'));
    $q = $pdo->prepare("SELECT * FROM products WHERE visible=1 AND id IN ($in)" . ($t === 'analogs' ? " AND availability='in'" : '')); $q->execute($ids);
    $byId = []; foreach ($q->fetchAll() as $x) $byId[$x['id']] = $x;
    $lp = product_photos($pdo, array_keys($byId));
    $links[$t] = array_values(array_map(fn($id) => card_row($byId[$id], $lp), array_filter($ids, fn($id) => isset($byId[$id]))));
  }
  out(['ok' => true, 'product' => [
    'id' => $r['id'], 'slug' => $r['slug'], 'name' => $r['name'], 'brand' => $r['brand'], 'category' => $taxonomy['category']??$r['category_path'],'canonical_category_id'=>$taxonomy['canonical_category_id']??null,
    'category_url' => $taxonomy['category_url']??implode('/', array_map('slugify', array_filter(explode(' / ', $r['category_path']), 'strlen'))),
    'description' => $r['description'], 'attributes' => (object)array_replace($taxonomy['derived_attributes']??[],json_decode((string)$r['attributes'],true)?:[]),
    'price_min' => $r['price_min'] !== null ? (int)$r['price_min'] : null, 'price_max' => $r['price_max'] !== null ? (int)$r['price_max'] : null,
    'availability' => $r['availability'], 'has_docs' => (bool)$r['has_docs'], 'docs_note' => $r['docs_note'],
    'size_scale' => $d['size_scale'] ?? '', 'photos' => $ph[$r['id']] ?? [], 'variants' => $variants, 'links' => $links]]);
}

fail(404, 'Нет такого адреса API');
