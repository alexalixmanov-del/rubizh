<?php
declare(strict_types=1);
// Run only from the hosting terminal: php shop/np-check.php
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__.'/../api/lib.php';
require_once __DIR__.'/np-lib.php';

try {
    foreach (npOrigins() as $code=>$origin) {
        echo $origin['name'].' ('.$code.'): '.$origin['city'].' / №'.$origin['branch']."\n";
        $matches = npOriginWarehouseCandidates($origin);
        if (!$matches) { echo "  Немає збігу. Перевірте населений пункт у довіднику НП.\n"; continue; }
        foreach ($matches as $match) {
            echo '  '.$match['description'].' | '.$match['city'].' | '.$match['area'].' | '.$match['region']."\n";
            echo '  city_ref='.$match['city_ref'].' warehouse_ref='.$match['warehouse_ref']."\n";
        }
        if (count($matches)!==1) echo "  Збіг неоднозначний: перевірте область і адресу вручну.\n";
    }
} catch (Throwable $e) {
    fwrite(STDERR,$e->getMessage()."\n"); exit(1);
}
