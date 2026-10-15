<?php
declare(strict_types=1);
// Staff API entry point. Routes, permissions, step-up, versions and schemas: contracts/crm/crm-api.json (stage 4).
require_once dirname(__DIR__,2).'/staff/bootstrap.php';
crmDispatch();
