<?php
declare(strict_types=1);
// CLI-only setup: reads NP directories and saves configuration; never creates a waybill.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
define('RUBIZH_NP_SETUP_READS', true);
$root = dirname(__DIR__); $manager = '';
foreach ($argv as $argument) {
    if (str_starts_with($argument, '--root=')) $root = rtrim(substr($argument, 7), '/');
    if (str_starts_with($argument, '--manager-email=')) $manager = trim(substr($argument, 16));
}
$apply = in_array('--apply', $argv, true);
$interactive = in_array('--interactive', $argv, true);
function npSetupChoose(array $choices, string $label, bool $interactive): array {
    if (count($choices) === 1) return array_values($choices)[0];
    if (!$choices) throw new RuntimeException($label.': немає доступних даних у кабінеті НП.');
    foreach (array_values($choices) as $index => $choice) echo ($index + 1).'. '.$choice['label']."\n";
    if (!$interactive || !stream_isatty(STDIN)) throw new RuntimeException($label.': запустіть з --interactive для вибору.');
    fwrite(STDOUT, $label.' — номер зі списку: ');
    $value = trim((string)fgets(STDIN));
    if (!ctype_digit($value) || (int)$value < 1 || (int)$value > count($choices)) throw new RuntimeException('Вибір не збережено.');
    return array_values($choices)[(int)$value - 1];
}
function npSetupWarehouse(array $origin, array $previous = []): ?array {
    $matches = array_values(array_filter(npOriginWarehouseCandidates($origin), static fn($m)=>npRef($m['city_ref'] ?? '') && npRef($m['warehouse_ref'] ?? '') && npOriginCityMatches((string)$m['city'], $origin['city']) && trim((string)$m['area']) !== '' && (($origin['region'] ?? '') === '' || str_contains(npNormalize((string)$m['area']), npNormalize($origin['region'])))));
    $existing = array_values(array_filter($matches, fn($m)=>$m['city_ref'] === ($previous['city_ref'] ?? '') && $m['warehouse_ref'] === ($previous['warehouse_ref'] ?? '')));
    if (count($existing) === 1) return $existing[0];
    return count($matches) === 1 ? $matches[0] : null;
}
try {
    $root = realpath($root) ?: throw new RuntimeException('Папку магазину не знайдено.');
    $file = $root.'/api/config.php';
    if (!is_file($file) || is_link($file)) throw new RuntimeException('Приватний конфіг магазину не знайдено.');
    $originalHash = hash_file('sha256', $file);
    $config = require $file;
    if (!is_array($config)) throw new RuntimeException('Невірний формат конфігурації.');
    require_once $root.'/api/lib.php';
    require_once $root.'/shop/np-lib.php';
    if (!npConfigured()) throw new RuntimeException('Спочатку додайте ключ НП.');

    $senders = [];
    for ($page = 1; $page <= 10; $page++) {
        $rows = npApiCall('Counterparty', 'getCounterparties', ['CounterpartyProperty'=>'Sender', 'Page'=>(string)$page]);
        foreach ($rows as $row) if (npRef($row['Ref'] ?? '')) $senders[$row['Ref']] = ['ref'=>$row['Ref'], 'label'=>(string)($row['Description'] ?? 'Відправник')];
        if (count($rows) < 100) break;
    }
    $existing = is_array($config['np_sender'] ?? null) ? $config['np_sender'] : [];
    $matching = array_values(array_filter($senders, fn($s)=>$s['ref'] === ($existing['ref'] ?? '')));
    $sender = $matching ? $matching[0] : npSetupChoose($senders, 'Відправник', $interactive);
    $contacts = [];
    foreach (npApiCall('Counterparty', 'getCounterpartyContactPersons', ['Ref'=>$sender['ref']]) as $person) {
        if (!npRef($person['Ref'] ?? '')) continue;
        foreach (npContactPhones($person['Phones'] ?? '') as $phone) {
            $contacts[$person['Ref'].':'.$phone] = ['contact_ref'=>$person['Ref'], 'phone'=>$phone, 'label'=>(string)($person['Description'] ?? 'Контакт').' · телефон …'.substr($phone, -4)];
        }
    }
    $matching = array_values(array_filter($contacts, fn($c)=>$c['contact_ref'] === ($existing['contact_ref'] ?? '') && $c['phone'] === preg_replace('/\D/', '', (string)($existing['phone'] ?? ''))));
    $contact = $matching ? $matching[0] : npSetupChoose($contacts, 'Контакт відправника', $interactive);
    $config['np_sender'] = ['ref'=>$sender['ref'], 'contact_ref'=>$contact['contact_ref'], 'phone'=>$contact['phone'], 'confirmed'=>true];

    $refs = is_array($config['np_origin_refs'] ?? null) ? $config['np_origin_refs'] : [];
    $ready = []; $pending = []; $cargoReady = []; $cargoPending = [];
    foreach (npOrigins() as $code => $origin) {
        $previous = is_array($refs[$code] ?? null) ? $refs[$code] : [];
        $match = npSetupWarehouse($origin, $previous);
        if ($match === null) {
            $refs[$code] = array_replace(is_array($refs[$code] ?? null) ? $refs[$code] : [], ['confirmed'=>false]);
            $pending[] = $code;
            echo $origin['name'].": потрібне уточнення міста/відділення.\n";
            continue;
        }
        $refs[$code] = ['city_ref'=>$match['city_ref'], 'warehouse_ref'=>$match['warehouse_ref'], 'expected_area'=>$match['area'], 'confirmed'=>true];
        $ready[] = $code;
        echo $origin['name'].': '.$match['city'].' · '.$match['description'].' · '.$match['area']."\n";
        if (!empty($origin['cargo_branch'])) {
            $cargo = npSetupWarehouse(array_replace($origin, ['branch'=>$origin['cargo_branch']]), ['city_ref'=>$match['city_ref'], 'warehouse_ref'=>$previous['cargo_warehouse_ref'] ?? '']);
            if ($cargo !== null && $cargo['city_ref'] === $match['city_ref'] && npNormalize((string)$cargo['area']) === npNormalize((string)$match['area'])) {
                $refs[$code]['cargo_warehouse_ref'] = $cargo['warehouse_ref'];
                $refs[$code]['cargo_confirmed'] = true;
                $cargoReady[] = $code;
                echo $origin['name'].' понад 30 кг: '.$cargo['description']."\n";
            } else {
                $refs[$code]['cargo_confirmed'] = false;
                $cargoPending[] = $code;
                echo $origin['name'].": вантажне відділення потребує уточнення.\n";
            }
        }
    }
    if (!$ready) throw new RuntimeException('Не знайдено однозначного місця відправки; конфіг не змінено.');
    $config['np_origin_refs'] = $refs;
    $emails = is_array($config['np_manager_emails'] ?? null) ? $config['np_manager_emails'] : [];
    if ($apply && !$emails && $manager === '') {
        if (!$interactive || !stream_isatty(STDIN)) throw new RuntimeException('Вкажіть email менеджера через --manager-email= або --interactive.');
        fwrite(STDOUT, "Email, через який ти входитимеш для керування замовленнями: ");
        $manager = trim((string)fgets(STDIN));
    }
    if ($manager !== '') {
        if (strlen($manager) > 254 || !filter_var($manager, FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n]/', $manager)) throw new RuntimeException('Невірний email менеджера; конфіг не змінено.');
        $emails[] = strtolower($manager);
    }
    $config['np_manager_emails'] = array_values(array_unique($emails));
    $config['np_ttn_enabled'] = true;
    $config['np_cod_contract_confirmed'] = false;
    $config['np_cod_service'] = '';
    if ($apply) {
        $directory = dirname($root).'/rubizh-private-backups';
        if (is_link($directory)) throw new RuntimeException('Приватна папка не повинна бути посиланням.');
        $mask = umask(0077);
        try {
            if (!is_dir($directory) && !mkdir($directory, 0700, true)) throw new RuntimeException('Не вдалося створити приватну папку.');
            if (hash_file('sha256', $file) !== $originalHash) throw new RuntimeException('Конфіг змінився паралельно; запустіть налаштування ще раз.');
            $suffix = gmdate('Ymd-His').'-'.bin2hex(random_bytes(8));
            $backup = $directory.'/np-config-'.$suffix.'.php';
            if (!copy($file, $backup) || !chmod($backup, 0600)) throw new RuntimeException('Резервну копію не збережено.');
            $temporary = $directory.'/np-new-'.$suffix.'.php';
            if (file_put_contents($temporary, "<?php\nreturn ".var_export($config, true).";\n", LOCK_EX) === false || !chmod($temporary, 0600)) throw new RuntimeException('Конфіг не записано.');
            if (hash_file('sha256', $file) !== $originalHash || !rename($temporary, $file)) { unlink($temporary); throw new RuntimeException('Конфіг не замінено; попередні налаштування збережено.'); }
        } finally { umask($mask); }
    }
    echo json_encode(['mode'=>$apply?'apply':'dry_run', 'sender_verified'=>true, 'origins_ready'=>$ready, 'origins_need_details'=>$pending, 'cargo_origins_ready'=>$cargoReady, 'cargo_origins_need_details'=>$cargoPending, 'manager_access_configured'=>$emails!==[], 'waybills_enabled'=>$apply, 'cod_enabled'=>false, 'waybills_created'=>0], JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES)."\n";
} catch (Throwable $error) {
    fwrite(STDERR, "Налаштування НП не завершено; ТТН не створювалися. ".$error->getMessage()."\n");
    exit(2);
}
