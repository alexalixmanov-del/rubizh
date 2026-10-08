<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require __DIR__.'/../api/lib.php';
require_once __DIR__.'/../api/photo-storage.php';
echo json_encode(repair_photo_permissions(),JSON_THROW_ON_ERROR)."\n";
