<?php
declare(strict_types=1);
if (!defined('RUBIZH_PRIVATE_CONFIG')) { http_response_code(404); exit; }
// Configure the key in the hosting environment; activation remains in api/config.php.
return ['mono_token' => (string)(getenv('RUBIZH_MONO_TOKEN') ?: '')];
