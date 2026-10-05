<?php
declare(strict_types=1);require __DIR__.'/catalog-lib.php';
$ga=(string)cfg('ga4_id');$meta=(string)cfg('meta_pixel_id');header('Cache-Control: public, max-age=300');require_once __DIR__.'/settings-lib.php';shopJson(['settings'=>shopPublicSettings(),'ga4'=>preg_match('/^G-[A-Z0-9]{5,20}$/D',$ga)?$ga:'','meta'=>preg_match('/^\d{5,30}$/D',$meta)?$meta:'']);
