<?php
declare(strict_types=1);
// Configure the key in the hosting environment.
$key = trim((string)(getenv('RUBIZH_NP_API_KEY') ?: ''));
return $key === '' ? [] : ['nova_poshta_api_key' => $key];
