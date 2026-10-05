<?php
declare(strict_types=1);
// Configure the key in the hosting environment.
return ['nova_poshta_api_key' => (string)(getenv('RUBIZH_NP_API_KEY') ?: '')];
