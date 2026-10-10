# Deploy CRM on existing PHP hosting

No persistent Node process is required. Build the separate `crm.rubizh` repository with Node >=22: `npm ci --ignore-scripts`, `npm run build`. Copy its complete `dist/` content, including `.htaccess`, into the SITE webroot `/crm/` directory. Deploy this SITE release, including `staff/`, `api/staff/`, shared domain files and existing root/API rewrite rules. Preserve private hosting configuration; never overwrite it with fixture config.

Requirements: PHP 8.2 with PDO MySQL, mbstring, curl, OpenSSL and sessions; existing MySQL with InnoDB, JSON and the already used named locks; Apache compatible AllowOverride for rewrite/headers/access; real HTTPS; existing private SITE/PIM settings. Confirm the actual production MySQL/Apache versions and directory override permissions before rollout. This environment tests PHP 8.2.34 and MariaDB 10.11.18; actual hosting deployment is not claimed.

Run the guarded migration workflow in [CRM-MIGRATIONS.md](CRM-MIGRATIONS.md), provision OWNER via stdin and verify Secure/HttpOnly/SameSite cookies over real TLS. `/api/staff/*` has no permissive CORS and no-store responses. `/crm/.htaccess` serves the SPA fallback, noindex, self-hosted fonts and CSP; `staff/.htaccess` denies direct module access. Existing root rules deny dev/tests/docs/private files. Verify those rules on the actual host, not just PHP's development server. Do not deploy test fixtures, development scripts or node_modules as publicly readable artifacts.

Preserve existing worker schedules. Existing payment, inventory and NP automation remains the domain worker path. Staff create/cancel/refresh/reconcile calls use the same NP adapter. Verify real sender refs, merchant cancellation behavior and private tokens on approved staging before activation; an incomplete sender blocks TTN creation.

Local verification:

```
export PATH=/workspace/php-runtime/root/usr/bin:$PATH
export RUBIZH_TEST_MYSQL_SOCKET=/workspace/php-runtime/mysql/mysql.sock
bash /workspace/cloud-setup/start-mysql.sh
cd /workspace/crm.rubizh
npm ci --ignore-scripts
npm run build
cd /workspace/rubizh
npm test
```

No production rollout is authorized by implementation work. Production write count stays zero until the owner gives a final rollout instruction after hosting, provider and production-copy checks.
