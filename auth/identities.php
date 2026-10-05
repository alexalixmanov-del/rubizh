<?php
declare(strict_types=1);
if (!defined('RUBIZH_AUTH')) { http_response_code(404); exit; }

function authConfig(): array {
    static $config;
    if ($config === null) { $config = is_file(__DIR__.'/config.php') ? (require __DIR__.'/config.php') : []; }
    return is_array($config) ? $config : [];
}
function smsEnabled(): bool {
    $c = authConfig();
    return ($c['sms_enabled'] ?? false) === true && strlen((string)($c['auth_secret'] ?? '')) >= 40
        && ($c['turbosms_token'] ?? '') !== '' && ($c['turbosms_sender'] ?? '') !== '';
}
function googleEnabled(): bool {
    $c = authConfig();
    return ($c['google_enabled'] ?? false) === true && smsEnabled()
        && preg_match('/^[0-9]+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/D', (string)($c['google_client_id'] ?? ''))
        && ($c['google_client_secret'] ?? '') !== '';
}
function identityDatabase(): PDO {
    $db = database();
    static $ready = false;
    if (!$ready) {
        $db->exec("CREATE TABLE IF NOT EXISTS rubizh_accounts (
            id CHAR(32) PRIMARY KEY, email VARCHAR(254) NULL,
            first_name VARCHAR(80) NOT NULL DEFAULT '', last_name VARCHAR(80) NOT NULL DEFAULT '',
            phone VARCHAR(20) NOT NULL DEFAULT '', delivery_type VARCHAR(12) NOT NULL DEFAULT 'branch',
            city VARCHAR(120) NOT NULL DEFAULT '', delivery_address VARCHAR(240) NOT NULL DEFAULT '',
            created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        $db->exec("CREATE TABLE IF NOT EXISTS rubizh_customer_identities (
            provider VARCHAR(12) NOT NULL, subject VARCHAR(254) NOT NULL,
            customer_id CHAR(32) NOT NULL, contact_email VARCHAR(254) NOT NULL DEFAULT '',
            created_at DATETIME NOT NULL, PRIMARY KEY(provider,subject), INDEX(customer_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin");
        $db->exec("CREATE TABLE IF NOT EXISTS rubizh_account_orders (
            order_id BIGINT UNSIGNED PRIMARY KEY, customer_id CHAR(32) NOT NULL, INDEX(customer_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        $db->exec("CREATE TABLE IF NOT EXISTS rubizh_account_redirects (
            old_id CHAR(32) PRIMARY KEY, customer_id CHAR(32) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        $db->exec("CREATE TABLE IF NOT EXISTS rubizh_auth_link_targets (
            token_hash CHAR(64) PRIMARY KEY, customer_id CHAR(32) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        $ready = true;
    }
    return $db;
}
// All identity writes are serialized, then committed as one transaction.
// Schema creation happens before the transaction (MySQL DDL implicitly commits).
function identityTransaction(callable $work): mixed {
    customerDatabase(); $db = identityDatabase();
    if(function_exists('shopStoreDatabase'))shopStoreDatabase();
    $got = (int)$db->query("SELECT GET_LOCK('rubizh_identity_write',5)")->fetchColumn();
    if ($got !== 1) { throw new RuntimeException('Спробуйте ще раз за кілька секунд.'); }
    try {
        $db->beginTransaction(); $result = $work($db); $db->commit(); return $result;
    } catch (Throwable $e) { if ($db->inTransaction()) { $db->rollBack(); } throw $e; }
    finally { $db->query("SELECT RELEASE_LOCK('rubizh_identity_write')"); }
}
function identityFind(string $provider, string $subject): ?string {
    $q = identityDatabase()->prepare('SELECT customer_id FROM rubizh_customer_identities WHERE provider=? AND subject=?');
    $q->execute([$provider,$subject]); $id = $q->fetchColumn(); return $id === false ? null : (string)$id;
}
function identityCanonical(string $id): string {
    for ($i=0;$i<32;$i++) {
        $q = identityDatabase()->prepare('SELECT customer_id FROM rubizh_account_redirects WHERE old_id=?');
        $q->execute([$id]); $next=$q->fetchColumn(); if ($next === false) { return $id; } $id=(string)$next;
    }
    throw new RuntimeException('Не вдалося відкрити кабінет.');
}
function identityCreate(PDO $db, array $profile = []): string {
    $id = bin2hex(random_bytes(16));
    $q = $db->prepare('INSERT INTO rubizh_accounts(id,email,first_name,last_name,phone,delivery_type,city,delivery_address,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())');
    $q->execute([$id,$profile['email'] ?? null,$profile['first_name'] ?? '',$profile['last_name'] ?? '',
        $profile['phone'] ?? '',$profile['delivery_type'] ?? 'branch',$profile['city'] ?? '',$profile['delivery_address'] ?? '']);
    return $id;
}
function identityAttach(PDO $db, string $id, string $provider, string $subject, string $email = ''): void {
    $owner=identityFind($provider,$subject);
    if ($owner !== null && $owner !== $id) { throw new RuntimeException('Цей спосіб входу вже привʼязано до іншого кабінету. Увійдіть у нього та підтвердьте свій телефон.'); }
    if ($owner === null) {
        $db->prepare('INSERT INTO rubizh_customer_identities(provider,subject,customer_id,contact_email,created_at) VALUES(?,?,?,?,UTC_TIMESTAMP())')->execute([$provider,$subject,$id,$email]);
    }
    if ($provider === 'phone') { $db->prepare('UPDATE rubizh_accounts SET phone=?,updated_at=UTC_TIMESTAMP() WHERE id=?')->execute([$subject,$id]); }
    if ($provider === 'email') { $db->prepare('UPDATE rubizh_accounts SET email=COALESCE(email,?),updated_at=UTC_TIMESTAMP() WHERE id=?')->execute([$subject,$id]); }
}
// Legacy profiles were created only after confirmed email login. A contact phone
// in the legacy profile is copied as contact data, NEVER as a phone identity.
function identityLegacyEmail(PDO $db, string $email, bool $create = false): ?string {
    $owner=identityFind('email',$email); if ($owner !== null) { return $owner; }
    $q=$db->prepare('SELECT * FROM rubizh_customers WHERE email=?'); $q->execute([$email]); $old=$q->fetch(PDO::FETCH_ASSOC);
    if (!$old && !$create) { return null; }
    $id=identityCreate($db,$old ?: ['email'=>$email]); identityAttach($db,$id,'email',$email); return $id;
}
function customerResolve(string $key): string {
    if (preg_match('/^[a-f0-9]{32}$/D',$key)) { return identityCanonical($key); }
    if (!filter_var($key,FILTER_VALIDATE_EMAIL)) { throw new RuntimeException('Увійдіть до кабінету.'); }
    return identityTransaction(fn(PDO $db)=>identityLegacyEmail($db,strtolower($key),true));
}
function customerId(): ?string {
    if (isset($_SESSION['customer_id'])) { return $_SESSION['customer_id']=identityCanonical((string)$_SESSION['customer_id']); }
    if (isset($_SESSION['email'])) { return $_SESSION['customer_id']=customerResolve((string)$_SESSION['email']); }
    return null;
}
function customerLogin(string $id, string $method): void {
    $id=identityCanonical($id); $p=customerProfile($id);
    session_regenerate_id(true);
    $_SESSION = ['customer_id'=>$id,'login_time'=>time(),'login_method'=>$method,'csrf'=>bin2hex(random_bytes(32))];
    if ($p['email'] !== null) { $_SESSION['email']=$p['email']; }
}
function customerIdentities(string $id): array {
    $q=identityDatabase()->prepare('SELECT provider,subject,contact_email FROM rubizh_customer_identities WHERE customer_id=? ORDER BY created_at');
    $q->execute([identityCanonical($id)]); return $q->fetchAll(PDO::FETCH_ASSOC);
}
function customerVerifiedPhone(string $id): string {
    $p=customerProfile($id); foreach (customerIdentities($id) as $i) { if ($i['provider']==='phone' && $i['subject']===$p['phone']) { return $i['subject']; } } return '';
}
function customerOwnOrders(string $id): void {
    // Transitional import of historical orders by CONFIRMED email identities.
    // Future checkout must write the ownership map using the signed-in customer_id.
    $q=identityDatabase()->prepare("INSERT IGNORE INTO rubizh_account_orders(order_id,customer_id)
        SELECT o.id,i.customer_id FROM rubizh_customer_orders o
        JOIN rubizh_customer_identities i ON i.provider='email' AND i.subject=o.email WHERE i.customer_id=?");
    $q->execute([$id]);
}
function identityMerge(PDO $db, string $source, string $target): void {
    if ($source === $target) { return; }
    customerOwnOrders($source); customerOwnOrders($target);
    $q=$db->prepare('SELECT * FROM rubizh_accounts WHERE id=?'); $q->execute([$source]); $old=$q->fetch(PDO::FETCH_ASSOC);
    $q->execute([$target]); $new=$q->fetch(PDO::FETCH_ASSOC);
    if (!$old || !$new) { throw new RuntimeException('Кабінет змінився. Почніть вхід ще раз.'); }
    foreach (['email','first_name','last_name','city','delivery_address'] as $field) {
        if (($new[$field] ?? '') === '' || $new[$field] === null) { $new[$field]=$old[$field]; if ($field==='delivery_address') { $new['delivery_type']=$old['delivery_type']; } }
    }
    $db->prepare('UPDATE rubizh_accounts SET email=?,first_name=?,last_name=?,city=?,delivery_address=?,delivery_type=?,updated_at=UTC_TIMESTAMP() WHERE id=?')->execute([$new['email'],$new['first_name'],$new['last_name'],$new['city'],$new['delivery_address'],$new['delivery_type'],$target]);
    $db->prepare('UPDATE rubizh_customer_identities SET customer_id=? WHERE customer_id=?')->execute([$target,$source]);
    $db->prepare('UPDATE rubizh_account_orders SET customer_id=? WHERE customer_id=?')->execute([$target,$source]);
    $db->prepare('INSERT IGNORE INTO rubizh_favorites(customer_id,product_id,created_at) SELECT ?,product_id,created_at FROM rubizh_favorites WHERE customer_id=?')->execute([$target,$source]);
    $db->prepare('DELETE FROM rubizh_favorites WHERE customer_id=?')->execute([$source]);
    $db->prepare('UPDATE rubizh_account_redirects SET customer_id=? WHERE customer_id=?')->execute([$target,$source]);
    $db->prepare('INSERT INTO rubizh_account_redirects(old_id,customer_id) VALUES(?,?)')->execute([$source,$target]);
    // Keep the old row as a recoverable record; only the canonical account is used.
}
function authPending(): ?array {
    $p=$_SESSION['identity_pending'] ?? null;
    if (!is_array($p) || (int)($p['expires'] ?? 0) <= time()) { unset($_SESSION['identity_pending']); return null; }
    if (($p['actor'] ?? null) !== null && customerId() !== $p['actor']) { unset($_SESSION['identity_pending']); return null; }
    return $p;
}
function authPendingSet(array $data): void {
    unset($_SESSION['sms_challenge'],$_SESSION['identity_merge']);
    $_SESSION['identity_pending']=$data+['flow'=>bin2hex(random_bytes(16)),'expires'=>time()+900,'actor'=>customerId()];
}
function identityFinishEmail(string $actor, string $email, bool $approveMerge = false): array {
    return identityTransaction(function(PDO $db) use($actor,$email,$approveMerge): array {
        $actor=identityCanonical($actor); $owner=identityLegacyEmail($db,$email,false);
        if ($owner!==null && $owner!==$actor && !$approveMerge) { return ['merge'=>true,'kind'=>'email_link','actor'=>$actor,'source'=>$owner,'target'=>$actor,'email'=>$email]; }
        if ($owner!==null && $owner!==$actor) { identityMerge($db,$owner,$actor); }
        identityAttach($db,$actor,'email',$email); return ['merge'=>false,'id'=>$actor,'method'=>'email'];
    });
}
// Called only with a one-use server-side SMS proof. An unverified form phone is
// never passed here. If two proven accounts exist, ask before consolidating them.
function identityFinishPhone(string $phone, bool $approveMerge = false): array {
    $pending=authPending(); if ($pending === null) { $pending=['kind'=>'phone','actor'=>customerId()]; }
    return identityTransaction(function(PDO $db) use($phone,$pending,$approveMerge): array {
        $phoneOwner=identityFind('phone',$phone); $source=$pending['actor'] ?? null;
        if (($pending['kind'] ?? '')==='email') { $source=identityLegacyEmail($db,$pending['email'],false); }
        if (($pending['kind'] ?? '')==='google') {
            $googleOwner=identityFind('google',$pending['sub']);
            if ($googleOwner !== null) { $source=$googleOwner; }
            elseif ($source === null && ($pending['email_trusted'] ?? false)) { $source=identityLegacyEmail($db,$pending['email'],false); }
        }
        if ($phoneOwner !== null && $source !== null && $phoneOwner !== $source && !$approveMerge) {
            return ['merge'=>true,'source'=>$source,'target'=>$phoneOwner,'phone'=>$phone];
        }
        $id=$phoneOwner ?? $source ?? identityCreate($db);
        if ($source !== null && $source !== $id) { identityMerge($db,$source,$id); }
        identityAttach($db,$id,'phone',$phone);
        if (($pending['kind'] ?? '')==='email') { identityAttach($db,$id,'email',$pending['email']); }
        if (($pending['kind'] ?? '')==='google') {
            identityAttach($db,$id,'google',$pending['sub'],$pending['email']);
            // A Gmail/Workspace address is authoritative only under Google's rules.
            // Other Google contact emails are NOT attached as email login identities.
            if (($pending['email_trusted'] ?? false) && (identityFind('email',$pending['email']) === null || identityFind('email',$pending['email'])===$id)) {
                identityAttach($db,$id,'email',$pending['email']);
            }
            $q=$db->prepare("UPDATE rubizh_accounts SET first_name=IF(first_name='',?,first_name),last_name=IF(last_name='',?,last_name) WHERE id=?");
            $q->execute([$pending['first_name'] ?? '',$pending['last_name'] ?? '',$id]);
        }
        return ['merge'=>false,'id'=>$id,'method'=>$pending['kind'] ?? 'phone'];
    });
}
