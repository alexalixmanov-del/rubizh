<?php
// РУБІЖ · API магазина: база, приём товаров из PIM, фото.
declare(strict_types=1);

const API_VERSION = '1.3.0';
const SCHEMA_VERSION = 3;
require_once __DIR__ . '/perf.php';

function cfg(string $k = null) {
  static $c = null;
  if ($c === null) {
    $f = __DIR__ . '/config.php';
    if (!is_file($f)) fail(500, 'Нет файла api/config.php — скопируйте config.sample.php и заполните');
    $c = require $f;
    $private=__DIR__.'/np-private.php';if(is_file($private))$c=array_replace($c,require $private);
    $monoPrivate=__DIR__.'/mono-private.php';if(is_file($monoPrivate)){if(!defined('RUBIZH_PRIVATE_CONFIG'))define('RUBIZH_PRIVATE_CONFIG',true);$c=array_replace($c,require $monoPrivate);}
    require_once __DIR__.'/../shop/settings-lib.php';$settings=shopSettingsRead();if(isset($settings['seller']))$settings['seller']=array_replace(is_array($c['seller']??null)?$c['seller']:[],$settings['seller']);$c=array_replace($c,$settings);
  }
  return $k === null ? $c : ($c[$k] ?? null);
}

function db(): PDO {
  static $pdo = null;
  if ($pdo) return $pdo;
  try {
    shopPerfStart(); $pdoClass = shopPerfOn() ? 'RubizhPDO' : 'PDO';
    $pdo = new $pdoClass('mysql:host=' . cfg('db_host') . ';dbname=' . cfg('db_name') . ';charset=utf8mb4', cfg('db_user'), cfg('db_pass'), [
      PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
      PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
      PDO::ATTR_EMULATE_PREPARES => false,
    ]);
  } catch (Throwable $e) {
    fail(500, 'Нет подключения к базе MySQL: проверьте данные в config.php');
  }
  if (shopPerfOn()) $pdo->setAttribute(PDO::ATTR_STATEMENT_CLASS, ['RubizhStatement', []]);
  migrate($pdo);
  return $pdo;
}

// Таблицы создаются сами при первом обращении
function migrate(PDO $pdo): void {
  $pdo->exec("CREATE TABLE IF NOT EXISTS meta (k VARCHAR(64) PRIMARY KEY, v TEXT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  $v = (int)($pdo->query("SELECT v FROM meta WHERE k='schema'")->fetchColumn() ?: 0);
  if ($v >= SCHEMA_VERSION) return;
  $pdo->exec("CREATE TABLE IF NOT EXISTS categories (
    id CHAR(40) PRIMARY KEY, path VARCHAR(600) NOT NULL, name VARCHAR(255) NOT NULL, slug VARCHAR(255) NOT NULL,
    url_path VARCHAR(700) NOT NULL, parent_id CHAR(40) NULL, depth TINYINT NOT NULL, sort INT NOT NULL DEFAULT 0,
    product_count INT NOT NULL DEFAULT 0, updated_at DATETIME NOT NULL,
    KEY parent (parent_id), KEY url (url_path(191))
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  $pdo->exec("CREATE TABLE IF NOT EXISTS products (
    id VARCHAR(64) PRIMARY KEY, slug VARCHAR(191) NOT NULL, name VARCHAR(500) NOT NULL, brand VARCHAR(191) NOT NULL DEFAULT '',
    category_id CHAR(40) NULL, category_path VARCHAR(600) NOT NULL DEFAULT '', description MEDIUMTEXT, attributes MEDIUMTEXT,
    links TEXT, has_docs TINYINT NOT NULL DEFAULT 0, docs_note VARCHAR(255) NOT NULL DEFAULT '',
    price_min INT NULL, price_max INT NULL, availability VARCHAR(10) NOT NULL DEFAULT 'out', variants_count INT NOT NULL DEFAULT 0,
    visible TINYINT NOT NULL DEFAULT 1, hash CHAR(40) NOT NULL DEFAULT '', data MEDIUMTEXT,
    created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, synced_at DATETIME NOT NULL,
    UNIQUE KEY slug (slug), KEY cat (category_id), KEY vis (visible, availability), KEY price (price_min)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  $pdo->exec("CREATE TABLE IF NOT EXISTS variants (
    sku VARCHAR(64) PRIMARY KEY, product_id VARCHAR(64) NOT NULL, size VARCHAR(120) NOT NULL DEFAULT '', color VARCHAR(120) NOT NULL DEFAULT '',
    barcode VARCHAR(64) NOT NULL DEFAULT '', price INT NULL, kit_price INT NULL, availability VARCHAR(10) NOT NULL DEFAULT 'out',
    lead_time VARCHAR(60) NOT NULL DEFAULT '', sort INT NOT NULL DEFAULT 0, data TEXT,
    KEY prod (product_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  $pdo->exec("CREATE TABLE IF NOT EXISTS photos (
    id INT AUTO_INCREMENT PRIMARY KEY, product_id VARCHAR(64) NOT NULL, pos INT NOT NULL, src_url TEXT NOT NULL, src_hash CHAR(40) NOT NULL,
    file VARCHAR(255) NOT NULL DEFAULT '', thumb VARCHAR(255) NOT NULL DEFAULT '', width INT NOT NULL DEFAULT 0, height INT NOT NULL DEFAULT 0,
    status VARCHAR(10) NOT NULL DEFAULT 'pending', error VARCHAR(255) NOT NULL DEFAULT '', tries INT NOT NULL DEFAULT 0, updated_at DATETIME NOT NULL,
    UNIQUE KEY prodpos (product_id, pos), KEY st (status), KEY src (src_hash)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  $pdo->exec("CREATE TABLE IF NOT EXISTS sync_log (
    id INT AUTO_INCREMENT PRIMARY KEY, at DATETIME NOT NULL, mode VARCHAR(10) NOT NULL, received INT NOT NULL, saved INT NOT NULL,
    unchanged INT NOT NULL, hidden INT NOT NULL, errors INT NOT NULL, note VARCHAR(255) NOT NULL DEFAULT ''
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  // Private fulfillment data: never included in product cards or public API responses.
  $pdo->exec("CREATE TABLE IF NOT EXISTS rubizh_catalog_fulfillment (
    sku VARCHAR(64) PRIMARY KEY, product_id VARCHAR(64) NOT NULL,
    supplier_name VARCHAR(191) NOT NULL, updated_at DATETIME NOT NULL,
    KEY product_id (product_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  $pdo->exec("CREATE TABLE IF NOT EXISTS rubizh_catalog_supplier_articles (
    sku VARCHAR(64) PRIMARY KEY, product_id VARCHAR(64) NOT NULL,
    supplier_name VARCHAR(191) NOT NULL, supplier_sku VARCHAR(120) NOT NULL,
    updated_at DATETIME NOT NULL, KEY product_id(product_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  $pdo->exec("INSERT INTO meta (k,v) VALUES ('schema','" . SCHEMA_VERSION . "') ON DUPLICATE KEY UPDATE v=VALUES(v)");
}

/* ---------- HTTP ---------- */
function out($data, int $code = 200): void {
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}
function fail(int $code, string $msg): void { out(['ok' => false, 'error' => $msg], $code); }
function now(): string { return gmdate('Y-m-d H:i:s'); }
function body(): array {
  $raw = file_get_contents('php://input') ?: '';
  $j = json_decode($raw, true);
  if (!is_array($j)) fail(400, 'Тело запроса не JSON');
  return $j;
}
function cors(bool $pim): void {
  $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
  if ($pim) {
    $allowed = cfg('pim_origins') ?: [];
    if ($origin && (in_array($origin, $allowed, true) || in_array('*', $allowed, true))) header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Headers: Authorization, Content-Type');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Vary: Origin');
  } else {
    header('Access-Control-Allow-Origin: *');
  }
  if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }
}
function require_pim(): void {
  $h = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
  if (!$h && function_exists('getallheaders')) { foreach (getallheaders() as $k => $v) if (strtolower($k) === 'authorization') $h = $v; }
  $key = (string)cfg('pim_key');
  if (strlen($key) < 24 || str_contains($key, 'ЗАМЕНИТЕ')) fail(500, 'В config.php не задан pim_key (минимум 24 символа)');
  if (!hash_equals('Bearer ' . $key, trim($h))) fail(401, 'Неверный ключ PIM');
}

/* ---------- приём товаров ---------- */
function slugify(string $s): string {
  static $tr = ['а'=>'a','б'=>'b','в'=>'v','г'=>'h','ґ'=>'g','д'=>'d','е'=>'e','є'=>'ie','ж'=>'zh','з'=>'z','и'=>'y','і'=>'i','ї'=>'i','й'=>'i','к'=>'k','л'=>'l','м'=>'m','н'=>'n','о'=>'o','п'=>'p','р'=>'r','с'=>'s','т'=>'t','у'=>'u','ф'=>'f','х'=>'kh','ц'=>'ts','ч'=>'ch','ш'=>'sh','щ'=>'shch','ь'=>'','ю'=>'iu','я'=>'ia','’'=>'',"'"=>'','ʼ'=>'','ы'=>'y','э'=>'e','ё'=>'e','ъ'=>''];
  $s = mb_strtolower($s, 'UTF-8'); $o = '';
  foreach (preg_split('//u', $s, -1, PREG_SPLIT_NO_EMPTY) as $ch) $o .= $tr[$ch] ?? $ch;
  return trim(preg_replace('/[^a-z0-9]+/', '-', $o), '-');
}
const AVAIL = ['in' => 3, 'order' => 2, 'out' => 1];
function clean_avail($a): string {
  $a = (string)$a;
  $map = ['in_stock' => 'in', 'available' => 'in', 'backorder' => 'order', 'preorder' => 'order', 'out_of_stock' => 'out'];
  $a = $map[$a] ?? $a;
  return isset(AVAIL[$a]) ? $a : 'out';
}

function sync_categories(PDO $pdo, array $cats): void {
  $st = $pdo->prepare("INSERT INTO categories (id,path,name,slug,url_path,parent_id,depth,sort,product_count,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE name=VALUES(name), slug=VALUES(slug), url_path=VALUES(url_path), parent_id=VALUES(parent_id), depth=VALUES(depth), sort=VALUES(sort), updated_at=VALUES(updated_at)");
  $seen = [];
  foreach ($cats as $i => $c) {
    $path = trim((string)($c['path'] ?? '')); if ($path === '') continue;
    $parts = array_values(array_filter(array_map('trim', explode(' / ', $path)), 'strlen'));
    $path = implode(' / ', $parts);
    $id = sha1($path); $seen[] = $id;
    $parent = count($parts) > 1 ? sha1(implode(' / ', array_slice($parts, 0, -1))) : null;
    $url = implode('/', array_map('slugify', $parts));
    $st->execute([$id, $path, end($parts), slugify(end($parts)), $url, $parent, count($parts), $i, 0, now()]);
  }
  // Ветки, которых больше нет в дереве PIM, удаляем (товары в них станут без категории до следующей отправки)
  if ($seen) {
    $in = implode(',', array_fill(0, count($seen), '?'));
    $pdo->prepare("DELETE FROM categories WHERE id NOT IN ($in)")->execute($seen);
  }
}

function recount_categories(PDO $pdo): void {
  $pdo->exec("UPDATE categories SET product_count=0");
  $rows = $pdo->query("SELECT category_path, COUNT(*) n FROM products WHERE visible=1 GROUP BY category_path")->fetchAll();
  $add = [];
  foreach ($rows as $r) {
    $parts = array_values(array_filter(explode(' / ', (string)$r['category_path']), 'strlen'));
    for ($i = 1; $i <= count($parts); $i++) { $k = sha1(implode(' / ', array_slice($parts, 0, $i))); $add[$k] = ($add[$k] ?? 0) + (int)$r['n']; }
  }
  $st = $pdo->prepare("UPDATE categories SET product_count=? WHERE id=?");
  foreach ($add as $id => $n) $st->execute([$n, $id]);
}

function unique_slug(PDO $pdo, string $slug, string $id): string {
  $slug = $slug !== '' ? mb_substr($slug, 0, 180) : 'tovar';
  $st = $pdo->prepare("SELECT id FROM products WHERE slug=? AND id<>?");
  $base = $slug; $n = 2;
  while (true) { $st->execute([$slug, $id]); if (!$st->fetchColumn()) return $slug; $slug = $base . '-' . $n++; }
}

function catalog_public_data(array $data): array {
  foreach($data as $key=>$value){
    if(is_string($key) && in_array(strtolower($key),['fulfillment_supplier','fulfillment_supplier_sku','supplier','suppliers','supplier_code','supplier_name','supplier_sku','cost','purchase_price','procurement_price','documents','docs','supplier_description'],true)){unset($data[$key]);continue;}
    if(is_array($value))$data[$key]=catalog_public_data($value);
  }
  return $data;
}
function sync_product_fulfillment(PDO $pdo, string $productId, array $rows): void {
  $pdo->prepare('DELETE FROM rubizh_catalog_fulfillment WHERE product_id=?')->execute([$productId]);
  $insert = $pdo->prepare('INSERT INTO rubizh_catalog_fulfillment(sku,product_id,supplier_name,updated_at) VALUES(?,?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE product_id=VALUES(product_id),supplier_name=VALUES(supplier_name),updated_at=VALUES(updated_at)');
  foreach ($rows as $sku=>$supplier) if ($supplier !== '') $insert->execute([$sku,$productId,$supplier]);
}
function sync_product_supplier_articles(PDO $pdo,string $id,array $rows): void {
 $pdo->prepare('DELETE FROM rubizh_catalog_supplier_articles WHERE product_id=?')->execute([$id]);
 $q=$pdo->prepare('INSERT INTO rubizh_catalog_supplier_articles(sku,product_id,supplier_name,supplier_sku,updated_at) VALUES(?,?,?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE product_id=VALUES(product_id),supplier_name=VALUES(supplier_name),supplier_sku=VALUES(supplier_sku),updated_at=VALUES(updated_at)');
 foreach($rows as $sku=>$r)if($r['supplier_name']!==''&&$r['supplier_sku']!=='')$q->execute([$sku,$id,$r['supplier_name'],$r['supplier_sku']]);
}
function catalog_order_articles(PDO $pdo,array $lines): array {
 $q=$pdo->prepare('SELECT supplier_name,supplier_sku FROM rubizh_catalog_supplier_articles WHERE sku=? AND product_id=?');$out=[];
 foreach($lines as $no=>$line){$q->execute([$line['sku'],$line['product_id']]);$r=$q->fetch(PDO::FETCH_ASSOC);if($r)$out[$no]=$r;}
 return $out;
}

function save_product(PDO $pdo, array $p): array {
  $id = trim((string)($p['id'] ?? ''));
  if ($id === '' || strlen($id) > 64) return ['id' => $id, 'status' => 'error', 'error' => 'нет id'];
  $name = trim((string)($p['name'] ?? ''));
  $vars = is_array($p['variants'] ?? null) ? $p['variants'] : [];
  if ($name === '') return ['id' => $id, 'status' => 'error', 'error' => 'нет названия'];
  if (!$vars) return ['id' => $id, 'status' => 'error', 'error' => 'нет вариантов'];
  $seen=[];
  foreach($vars as $row){$sku=is_array($row)?trim((string)($row['sku']??'')):'';
    if($sku==='' || strlen($sku)>64 || isset($seen[$sku]))return ['id'=>$id,'status'=>'error','error'=>'Невірний або повторений SKU'];
    $seen[$sku]=true;
  }
  // A protected PIM sync may carry the chosen supplier for each variant.
  // Store it separately, then remove all private fields before hashing and saving public data.
  $hasFulfillment = false; $fulfillment = []; $hasArticles=false; $articles=[];
  foreach ($vars as &$v) {
    if (array_key_exists('fulfillment_supplier',$v) || array_key_exists('supplier',$v)) $hasFulfillment = true;
    $sku = trim((string)($v['sku'] ?? ''));
    $supplier = $v['fulfillment_supplier'] ?? $v['supplier'] ?? '';
    if ($sku !== '' && is_string($supplier)) $fulfillment[$sku] = mb_substr(trim($supplier),0,191);
    if(array_key_exists('fulfillment_supplier_sku',$v)){$hasArticles=true;$native=$v['fulfillment_supplier_sku'];if(!is_string($native)||mb_strlen($native)>120||preg_match('/[\x00-\x1f\x7f]/u',$native))return ['id'=>$id,'status'=>'error','error'=>'Невірний артикул постачальника'];$articles[$sku]=['supplier_name'=>$fulfillment[$sku]??'','supplier_sku'=>trim($native)];}
    unset($v['fulfillment_supplier'], $v['fulfillment_supplier_sku'], $v['supplier'], $v['supplier_code'], $v['cost'], $v['supplier_sku']);
  } unset($v);
  unset($p['fulfillment_supplier'], $p['supplier_code'], $p['supplier'], $p['suppliers'], $p['cost'], $p['docs'], $p['documents']);
  $p['variants'] = $vars;
  $p = catalog_public_data($p); $vars=$p['variants'];

  $hash = sha1(json_encode($p, JSON_UNESCAPED_UNICODE));
  $old = $pdo->prepare("SELECT hash, visible FROM products WHERE id=?"); $old->execute([$id]); $o = $old->fetch();
  if ($o && $o['hash'] === $hash && (int)$o['visible'] === 1) {
    try {
      $pdo->beginTransaction();
      if ($hasFulfillment) sync_product_fulfillment($pdo,$id,$fulfillment);
      if($hasArticles)sync_product_supplier_articles($pdo,$id,$articles);
      $pdo->prepare("UPDATE products SET synced_at=? WHERE id=?")->execute([now(), $id]);
      $pdo->commit();
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) $pdo->rollBack();
      return ['id'=>$id,'status'=>'error','error'=>'Не вдалося оновити відправника товару.'];
    }
    return ['id' => $id, 'status' => 'unchanged'];
  }
  $path = implode(' / ', array_values(array_filter(array_map('trim', explode(' / ', (string)($p['category'] ?? ''))), 'strlen')));
  $prices = []; $best = 'out';
  foreach ($vars as $v) { $pr = (int)round((float)($v['price'] ?? 0)); if ($pr > 0) $prices[] = $pr; $a = clean_avail($v['availability'] ?? 'out'); if (AVAIL[$a] > AVAIL[$best]) $best = $a; }
  $slug = unique_slug($pdo, slugify((string)($p['slug'] ?? '')) ?: slugify($name), $id);
  $p['slug'] = $slug;
  $pdo->beginTransaction();
  try {
    $pdo->prepare("INSERT INTO products (id,slug,name,brand,category_id,category_path,description,attributes,links,has_docs,docs_note,price_min,price_max,availability,variants_count,visible,hash,data,created_at,updated_at,synced_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE slug=VALUES(slug), name=VALUES(name), brand=VALUES(brand), category_id=VALUES(category_id), category_path=VALUES(category_path),
      description=VALUES(description), attributes=VALUES(attributes), links=VALUES(links), has_docs=VALUES(has_docs), docs_note=VALUES(docs_note),
      price_min=VALUES(price_min), price_max=VALUES(price_max), availability=VALUES(availability), variants_count=VALUES(variants_count), visible=1,
      hash=VALUES(hash), data=VALUES(data), updated_at=VALUES(updated_at), synced_at=VALUES(synced_at)")
      ->execute([$id, $slug, mb_substr($name, 0, 500), mb_substr((string)($p['brand'] ?? ''), 0, 191), $path ? sha1($path) : null, $path,
        (string)($p['description'] ?? ''), json_encode($p['attributes'] ?? new stdClass, JSON_UNESCAPED_UNICODE), json_encode($p['links'] ?? new stdClass, JSON_UNESCAPED_UNICODE),
        !empty($p['has_docs']) ? 1 : 0, mb_substr((string)($p['docs_note'] ?? ''), 0, 255), $prices ? min($prices) : null, $prices ? max($prices) : null, $best, count($vars),
        $hash, json_encode($p, JSON_UNESCAPED_UNICODE), now(), now(), now()]);
    $pdo->prepare("DELETE FROM variants WHERE product_id=?")->execute([$id]);
    $vs = $pdo->prepare("INSERT INTO variants (sku,product_id,size,color,barcode,price,kit_price,availability,lead_time,sort,data) VALUES (?,?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE product_id=VALUES(product_id), size=VALUES(size), color=VALUES(color), barcode=VALUES(barcode), price=VALUES(price), kit_price=VALUES(kit_price), availability=VALUES(availability), lead_time=VALUES(lead_time), sort=VALUES(sort), data=VALUES(data)");
    foreach ($vars as $i => $v) {
      $sku = trim((string)($v['sku'] ?? '')); if ($sku === '') continue;
      $vs->execute([$sku, $id, mb_substr((string)($v['size_display'] ?? $v['size'] ?? ''), 0, 120), mb_substr((string)($v['color'] ?? ''), 0, 120), mb_substr((string)($v['barcode'] ?? ''), 0, 64),
        ($v['price'] ?? null) !== null ? (int)round((float)$v['price']) : null, ($v['kit_price'] ?? null) !== null ? (int)round((float)$v['kit_price']) : null,
        clean_avail($v['availability'] ?? 'out'), mb_substr((string)($v['lead_time'] ?? ''), 0, 60), $i, json_encode($v, JSON_UNESCAPED_UNICODE)]);
    }
    if ($hasFulfillment) sync_product_fulfillment($pdo,$id,$fulfillment);
      if($hasArticles)sync_product_supplier_articles($pdo,$id,$articles);
    $pdo->prepare('DELETE f FROM rubizh_catalog_fulfillment f LEFT JOIN variants v ON v.sku=f.sku AND v.product_id=f.product_id WHERE f.product_id=? AND v.sku IS NULL')->execute([$id]);
    // Фото: новая ссылка или другой порядок → в очередь на скачивание; совпадающие не трогаем
    $photos = array_values(array_filter(array_map('strval', is_array($p['photos'] ?? null) ? $p['photos'] : []), fn($u) => preg_match('~^https?://~i', $u)));
    $cur = $pdo->prepare("SELECT pos, src_hash FROM photos WHERE product_id=?"); $cur->execute([$id]);
    $have = []; foreach ($cur->fetchAll() as $r) $have[(int)$r['pos']] = $r['src_hash'];
    $ins = $pdo->prepare("INSERT INTO photos (product_id,pos,src_url,src_hash,status,updated_at) VALUES (?,?,?,?, 'pending', ?)
      ON DUPLICATE KEY UPDATE src_url=VALUES(src_url), src_hash=VALUES(src_hash), file='', thumb='', status='pending', error='', tries=0, updated_at=VALUES(updated_at)");
    foreach ($photos as $pos => $u) { $h = sha1($u); if (($have[$pos] ?? null) !== $h) $ins->execute([$id, $pos, $u, $h, now()]); }
    $pdo->prepare("DELETE FROM photos WHERE product_id=? AND pos>=?")->execute([$id, count($photos)]);
    $pdo->commit();
  } catch (Throwable $e) {
    $pdo->rollBack();
    return ['id' => $id, 'status' => 'error', 'error' => mb_substr($e->getMessage(), 0, 200)];
  }
  return ['id' => $id, 'status' => $o ? 'updated' : 'created', 'slug' => $slug];
}

function hide_products(PDO $pdo, array $ids): int {
  $ids = array_values(array_filter(array_map('strval', $ids), 'strlen'));
  if (!$ids) return 0;
  $n = 0;
  foreach (array_chunk($ids, 500) as $chunk) {
    $in = implode(',', array_fill(0, count($chunk), '?'));
    $st = $pdo->prepare("UPDATE products SET visible=0, updated_at=? WHERE visible=1 AND id IN ($in)");
    $st->execute(array_merge([now()], $chunk)); $n += $st->rowCount();
  }
  return $n;
}

/* ---------- фото: скачать, сжать в WebP, сохранить у себя ---------- */
function process_photos(PDO $pdo, int $limit = 40, float $budget = 20.0): array {
  $t0 = microtime(true); $done = 0; $err = 0;
  $dir = rtrim((string)cfg('media_dir'), '/') . '/p';
  if (!is_dir($dir) && !@mkdir($dir, 0755, true)) fail(500, 'Нет прав на создание папки media/p');
  $rows = $pdo->query("SELECT id, product_id, pos, src_url, src_hash FROM photos WHERE status='pending' OR (status='error' AND tries<3 AND updated_at < (UTC_TIMESTAMP() - INTERVAL 1 HOUR)) ORDER BY pos, id LIMIT " . (int)$limit)->fetchAll();
  $upd = $pdo->prepare("UPDATE photos SET status=?, file=?, thumb=?, width=?, height=?, error=?, tries=tries+1, updated_at=? WHERE id=?");
  $same = $pdo->prepare("SELECT file, thumb, width, height FROM photos WHERE src_hash=? AND status='ok' LIMIT 1");
  foreach ($rows as $r) {
    if (microtime(true) - $t0 > $budget) break;
    $same->execute([$r['src_hash']]);
    if ($s = $same->fetch()) { $upd->execute(['ok', $s['file'], $s['thumb'], $s['width'], $s['height'], '', now(), $r['id']]); $done++; continue; }
    try {
      [$file, $thumb, $w, $h] = fetch_to_webp($r['src_url'], $r['src_hash'], $dir);
      $upd->execute(['ok', $file, $thumb, $w, $h, '', now(), $r['id']]); $done++;
    } catch (Throwable $e) {
      $upd->execute(['error', '', '', 0, 0, mb_substr($e->getMessage(), 0, 250), now(), $r['id']]); $err++;
    }
  }
  $pending = (int)$pdo->query("SELECT COUNT(*) FROM photos WHERE status='pending'")->fetchColumn();
  $failed = (int)$pdo->query("SELECT COUNT(*) FROM photos WHERE status='error'")->fetchColumn();
  if($done>0)$pdo->prepare("INSERT INTO meta(k,v) VALUES('photos_last_progress',?) ON DUPLICATE KEY UPDATE v=VALUES(v)")->execute([now()]);
  return ['processed' => $done, 'errors' => $err, 'pending' => $pending, 'failed' => $failed];
}
function fetch_to_webp(string $url, string $hash, string $dir): array {
  $ch = curl_init($url);
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 4, CURLOPT_CONNECTTIMEOUT => 8, CURLOPT_TIMEOUT => 20,
    CURLOPT_USERAGENT => 'RubizhShop/1.0 (+photo import)', CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS]);
  $bin = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $cerr = curl_error($ch); curl_close($ch);
  if ($bin === false || $code >= 400) throw new RuntimeException('не скачалось: ' . ($cerr ?: 'HTTP ' . $code));
  if (strlen($bin) > 15 * 1024 * 1024) throw new RuntimeException('файл больше 15 МБ');
  $img = @imagecreatefromstring($bin);
  if (!$img) throw new RuntimeException('это не картинка');
  $w = imagesx($img); $h = imagesy($img);
  $sub = substr($hash, 0, 2); if (!is_dir("$dir/$sub")) @mkdir("$dir/$sub", 0755, true);
  $save = function (int $max, string $suffix) use ($img, $w, $h, $dir, $sub, $hash) {
    $k = min(1, $max / max($w, $h)); $nw = max(1, (int)round($w * $k)); $nh = max(1, (int)round($h * $k));
    $dst = imagecreatetruecolor($nw, $nh);
    imagealphablending($dst, false); imagesavealpha($dst, true);
    imagefill($dst, 0, 0, imagecolorallocatealpha($dst, 255, 255, 255, 127));
    imagecopyresampled($dst, $img, 0, 0, 0, 0, $nw, $nh, $w, $h);
    $rel = "p/$sub/$hash$suffix.webp";
    if (!imagewebp($dst, rtrim(dirname($dir), '/') . '/' . $rel, (int)cfg('webp_quality'))) throw new RuntimeException('не удалось сохранить WebP');
    imagedestroy($dst);
    return [$rel, $nw, $nh];
  };
  [$file, $fw, $fh] = $save((int)cfg('photo_max'), '');
  [$thumb] = $save((int)cfg('thumb_max'), '-t');
  imagedestroy($img);
  return [$file, $thumb, $fw, $fh];
}

/* ---------- отдача каталога сайту ---------- */
function media_url(string $rel): string { return rtrim((string)cfg('media_url'), '/') . '/' . ltrim($rel, '/'); }
function product_photos(PDO $pdo, array $ids): array {
  if (!$ids) return [];
  $in = implode(',', array_fill(0, count($ids), '?'));
  $st = $pdo->prepare("SELECT product_id, pos, src_url, file, thumb, width, height, status FROM photos WHERE product_id IN ($in) ORDER BY product_id, pos");
  $st->execute($ids); $out = [];
  foreach ($st->fetchAll() as $r) {
    $ok = $r['status'] === 'ok' && $r['file'];
    // Пока фото не обработано, отдаём ссылку поставщика — сайт не остаётся без картинок
    $out[$r['product_id']][] = ['url' => $ok ? media_url($r['file']) : $r['src_url'], 'thumb' => $ok ? media_url($r['thumb']) : $r['src_url'], 'width' => (int)$r['width'], 'height' => (int)$r['height'], 'local' => $ok];
  }
  return $out;
}
function card_row(array $r, array $photos): array {
  return ['id' => $r['id'], 'slug' => $r['slug'], 'name' => $r['name'], 'brand' => $r['brand'], 'category' => $r['category_path'],
    'price_min' => $r['price_min'] !== null ? (int)$r['price_min'] : null, 'price_max' => $r['price_max'] !== null ? (int)$r['price_max'] : null,
    'availability' => $r['availability'], 'variants_count' => (int)$r['variants_count'], 'has_docs' => (bool)$r['has_docs'],
    'photo' => $photos[$r['id']][0] ?? null];
}
