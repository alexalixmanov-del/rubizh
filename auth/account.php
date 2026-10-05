<?php
declare(strict_types=1);
if (!defined('RUBIZH_AUTH')) { http_response_code(404); exit; }

function customerDatabase(): PDO {
    $db = database();
    static $ready = false;
    if (!$ready) {
        $db->exec("CREATE TABLE IF NOT EXISTS rubizh_customers (
            email VARCHAR(254) PRIMARY KEY,
            first_name VARCHAR(80) NOT NULL DEFAULT '', last_name VARCHAR(80) NOT NULL DEFAULT '',
            phone VARCHAR(20) NOT NULL DEFAULT '', delivery_type VARCHAR(12) NOT NULL DEFAULT 'branch',
            city VARCHAR(120) NOT NULL DEFAULT '', delivery_address VARCHAR(240) NOT NULL DEFAULT '',
            created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        // Only real orders written by the store's future checkout/CRM integration belong here.
        // Neither the browser nor the PIM can create orders through this cabinet.
        $db->exec("CREATE TABLE IF NOT EXISTS rubizh_customer_orders (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, external_id VARCHAR(96) NOT NULL UNIQUE,
            email VARCHAR(254) NOT NULL, order_number VARCHAR(80) NOT NULL,
            status VARCHAR(32) NOT NULL DEFAULT 'new', payment_status VARCHAR(32) NOT NULL DEFAULT 'pending',
            total DECIMAL(12,2) NOT NULL, currency CHAR(3) NOT NULL DEFAULT 'UAH',
            items_json MEDIUMTEXT NOT NULL, delivery_label VARCHAR(500) NOT NULL DEFAULT '',
            tracking_number VARCHAR(32) NOT NULL DEFAULT '', created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
            INDEX customer_orders(email,created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        $ready = true;
    }
    return $db;
}

function customerProfile(string $key): array {
    $id=customerResolve($key);
    $q=identityDatabase()->prepare('SELECT * FROM rubizh_accounts WHERE id=?'); $q->execute([$id]);
    $profile=$q->fetch(PDO::FETCH_ASSOC);
    if (!$profile) { throw new RuntimeException('Кабінет не знайдено.'); }
    return $profile;
}

function customerField(array $input, string $key, int $max): string {
    $value = $input[$key] ?? '';
    if (!is_string($value) || !mb_check_encoding($value, 'UTF-8')) { throw new RuntimeException('Перевірте введені дані.'); }
    $value = trim($value);
    if (mb_strlen($value, 'UTF-8') > $max || preg_match('/[\x00-\x1F\x7F]/u', $value)) {
        throw new RuntimeException('Поле надто довге або містить недопустимі символи.');
    }
    return $value;
}

function customerSaveProfile(string $email, array $input): void {
    $first = customerField($input, 'first_name', 80);
    $last = customerField($input, 'last_name', 80);
    $phone = customerField($input, 'phone', 30);
    if ($first === '') { throw new RuntimeException('Вкажіть ваше імʼя.'); }
    if ($phone !== '') {
        if (!preg_match('/^[+0-9() .\-]+$/D', $phone)) { throw new RuntimeException('Вкажіть український номер у форматі +380XXXXXXXXX.'); }
        $phone = preg_replace('/[^0-9]/', '', $phone);
        if (preg_match('/^0\d{9}$/D', $phone)) { $phone = '38'.$phone; }
        if (!preg_match('/^380\d{9}$/D', $phone)) { throw new RuntimeException('Вкажіть український номер у форматі +380XXXXXXXXX.'); }
        $phone = '+'.$phone;
    }
    $id=customerResolve($email); $verified=customerVerifiedPhone($id);
    if ($verified !== '' && $phone !== $verified) { throw new RuntimeException('Змініть телефон у розділі «Вхід і безпека» та підтвердьте його кодом.'); }
    $q = identityDatabase()->prepare('UPDATE rubizh_accounts SET first_name=?,last_name=?,phone=?,updated_at=UTC_TIMESTAMP() WHERE id=?');
    $q->execute([$first,$last,$phone,$id]);
}

function customerSaveDelivery(string $email, array $input): void {
    $type = customerField($input, 'delivery_type', 12);
    if (!in_array($type, ['branch','postomat','courier'], true)) { throw new RuntimeException('Оберіть спосіб доставки.'); }
    $city = customerField($input, 'city', 120);
    $address = customerField($input, 'delivery_address', 240);
    if ($city === '' || $address === '') { throw new RuntimeException('Вкажіть місто та відділення, поштомат або адресу.'); }
    $id=customerResolve($email);
    $q = identityDatabase()->prepare('UPDATE rubizh_accounts SET delivery_type=?,city=?,delivery_address=?,updated_at=UTC_TIMESTAMP() WHERE id=?');
    $q->execute([$type,$city,$address,$id]);
}

function customerOrderStats(string $key): array {
    $id=customerResolve($key); customerOwnOrders($id);
    $q=identityDatabase()->prepare("SELECT COUNT(*) AS total,COALESCE(SUM(o.status IN ('new','confirmed','processing','shipped')),0) AS active FROM rubizh_customer_orders o JOIN rubizh_account_orders a ON a.order_id=o.id WHERE a.customer_id=?");
    $q->execute([$id]); return $q->fetch(PDO::FETCH_ASSOC);
}
function customerOrders(string $key, int $page=1,?string $view=null): array {
    $id=customerResolve($key); customerOwnOrders($id); $offset=(max(1,$page)-1)*20;
    $history="(o.status IN ('delivered','completed','cancelled','returned','partially_returned') OR o.payment_status='refunded')";$filter=$view==='history'?' AND '.$history:($view==='active'?' AND NOT '.$history:'');
    $q=identityDatabase()->prepare('SELECT o.* FROM rubizh_customer_orders o JOIN rubizh_account_orders a ON a.order_id=o.id WHERE a.customer_id=?'.$filter.' ORDER BY o.created_at DESC,o.id DESC LIMIT 20 OFFSET '.$offset);
    $q->execute([$id]); return $q->fetchAll(PDO::FETCH_ASSOC);
}
function customerOrdersCount(string $key,?string $view=null):int {$id=customerResolve($key);customerOwnOrders($id);$history="(o.status IN ('delivered','completed','cancelled','returned','partially_returned') OR o.payment_status='refunded')";$filter=$view==='history'?' AND '.$history:($view==='active'?' AND NOT '.$history:'');$q=identityDatabase()->prepare('SELECT COUNT(*) FROM rubizh_customer_orders o JOIN rubizh_account_orders a ON a.order_id=o.id WHERE a.customer_id=?'.$filter);$q->execute([$id]);return (int)$q->fetchColumn();}
function customerOrder(string $key, int $orderId): ?array {
    $id=customerResolve($key); customerOwnOrders($id);
    $q=identityDatabase()->prepare('SELECT o.* FROM rubizh_customer_orders o JOIN rubizh_account_orders a ON a.order_id=o.id WHERE a.customer_id=? AND o.id=?');
    $q->execute([$id,$orderId]); $order=$q->fetch(PDO::FETCH_ASSOC);
    if (!$order) { return null; }
    $lines=json_decode($order['items_json'],true);
    $order['lines']=is_array($lines) ? array_values(array_filter($lines,'is_array')) : [];
    $details=shopStoreDatabase()->prepare('SELECT contact_json,subtotal,discount_amount,shipping_amount FROM rubizh_order_details WHERE order_id=?');$details->execute([$orderId]);$amounts=$details->fetch(PDO::FETCH_ASSOC);if($amounts){$order=array_merge($order,$amounts);$contact=json_decode((string)$amounts['contact_json'],true)?:[];$order['shipping_paid_to_carrier']=!empty($contact['shipping_paid_to_carrier']);unset($order['contact_json']);}
    $shipments=shopStoreDatabase()->prepare("SELECT tracking_number,status FROM rubizh_order_shipments WHERE order_id=? AND tracking_number IS NOT NULL AND tracking_number<>'' ORDER BY id");
    $shipments->execute([$orderId]);$order['shipments']=$shipments->fetchAll(PDO::FETCH_ASSOC);
    return $order;
}

function customerStatus(string $status): string {
    return ['new'=>'Нове','confirmed'=>'Підтверджено','processing'=>'Готуємо до відправлення','partially_returned'=>'Часткове повернення','partially_shipped'=>'Частково відправлено','shipped'=>'Відправлено','delivered'=>'Отримано','completed'=>'Завершено','cancelled'=>'Скасовано','returned'=>'Повернено'][$status] ?? 'Уточнюється';
}
function customerPayment(string $status): string {
    return ['pending'=>'Очікує оплати','paid'=>'Оплачено','cod'=>'Оплата при отриманні','refunded'=>'Кошти повернено','failed'=>'Оплата не пройшла'][$status] ?? 'Уточнюється';
}
function customerMoney(mixed $amount, string $currency = 'UAH'): string {
    return number_format((float)$amount, 2, ',', ' ').' '.($currency === 'UAH' ? '₴' : $currency);
}
function customerDate(string $date): string {
    try { return (new DateTimeImmutable($date, new DateTimeZone('UTC')))->setTimezone(new DateTimeZone('Europe/Kyiv'))->format('d.m.Y'); }
    catch (Throwable $e) { return ''; }
}
