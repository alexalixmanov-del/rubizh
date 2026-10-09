#!/usr/bin/env bash
# PIM contract 3 SITE update. Pinned archive + SHA256, private source backup with rollback command,
# runtime schema, additive PIM v3 schema (only with a verified off-webroot DB backup), LOST_* identity
# compare and smoke checks. It never enables PIM v3 sync, payments or cron: those are separate commands.
# Usage: install-pim-v3.sh SITE_ROOT DB_BACKUP_FILE DB_BACKUP_SHA256
set -euo pipefail
umask 077
RUBIZH_ROOT=${1:?Usage: install-pim-v3.sh SITE_ROOT DB_BACKUP_FILE DB_BACKUP_SHA256}
RUBIZH_DB_BACKUP=${2:?Database backup file required}
RUBIZH_DB_SHA=${3:?Database backup SHA256 required}
[[ "$RUBIZH_ROOT" = /* && -f "$RUBIZH_ROOT/api/config.php" && ! -L "$RUBIZH_ROOT" ]] || { echo 'Shop root unavailable' >&2; exit 2; }
RUBIZH_PHP=${RUBIZH_PHP_BIN:-/usr/local/php82/bin/php}
[[ -x "$RUBIZH_PHP" ]] || RUBIZH_PHP=$(command -v php)
"$RUBIZH_PHP" -r 'if(version_compare(PHP_VERSION,"8.1","<"))exit(2);foreach(["pdo_mysql","curl","mbstring","openssl","gd","fileinfo"] as $name)if(!extension_loaded($name)){fwrite(STDERR,"Missing PHP extension: ".$name."\n");exit(2);}'
# The DB backup must exist outside the web root and match its checksum before anything changes.
RUBIZH_DB_REAL=$(realpath "$RUBIZH_DB_BACKUP")
[[ -f "$RUBIZH_DB_REAL" && "$RUBIZH_DB_REAL" != "$RUBIZH_ROOT"/* ]] || { echo 'DB backup must be a file outside the web root' >&2; exit 2; }
printf '%s  %s\n' "$RUBIZH_DB_SHA" "$RUBIZH_DB_REAL" | sha256sum -c -
RUBIZH_TEMP=$(mktemp -d /tmp/rubizh-pim-v3.XXXXXX)
trap 'command rm -rf -- "$RUBIZH_TEMP"' EXIT
RUBIZH_SHA=7f0bc08892331c8c0d11b7d8b7af8568f08ddbb3e998c47c3f0685cbc2bf9f59
curl -fsSL "${RUBIZH_ARCHIVE_URL:-https://raw.githubusercontent.com/alexalixmanov-del/rubizh/671618493c1193c89cccb3e566f880dbea9d748f/downloads/Rubizh-pim-v3-20261009.zip}" -o "$RUBIZH_TEMP/update.zip"
printf '%s  %s\n' "$RUBIZH_SHA" "$RUBIZH_TEMP/update.zip" | sha256sum -c -
RUBIZH_REPORTS="$(dirname "$RUBIZH_ROOT")/rubizh-private-backups/pim-v3-$(date -u +%Y%m%d-%H%M%S)"
mkdir -p "$RUBIZH_REPORTS"
# Identity inventory BEFORE any schema change (read-only; never runs migrations).
RUBIZH_INVENTORY="$RUBIZH_ROOT/dev/.pim-v3-inventory-$$.php"
unzip -p "$RUBIZH_TEMP/update.zip" rubizh/dev/catalog-inventory.php > "$RUBIZH_INVENTORY"
( cd "$RUBIZH_ROOT" && "$RUBIZH_PHP" "$RUBIZH_INVENTORY" > "$RUBIZH_REPORTS/inventory-before.json" ); rm -f -- "$RUBIZH_INVENTORY"
unzip -p "$RUBIZH_TEMP/update.zip" rubizh/dev/deploy-update.sh > "$RUBIZH_TEMP/deploy.sh"
bash "$RUBIZH_TEMP/deploy.sh" "$RUBIZH_ROOT" "$RUBIZH_TEMP/update.zip" "$RUBIZH_SHA" | tee "$RUBIZH_REPORTS/deploy.log"
cd "$RUBIZH_ROOT"
"$RUBIZH_PHP" dev/prepare-runtime.php
"$RUBIZH_PHP" dev/migrate-pim-v3.php --site-config --plan > "$RUBIZH_REPORTS/pim-v3-plan.json"
RUBIZH_DB_NAME=$("$RUBIZH_PHP" -r 'echo json_decode(file_get_contents($argv[1]),true)["database"];' "$RUBIZH_REPORTS/pim-v3-plan.json")
"$RUBIZH_PHP" dev/migrate-pim-v3.php --site-config --apply --database="$RUBIZH_DB_NAME" --backup-file="$RUBIZH_DB_REAL" --backup-sha256="$RUBIZH_DB_SHA" > "$RUBIZH_REPORTS/pim-v3-apply.json"
"$RUBIZH_PHP" dev/catalog-inventory.php --compare="$RUBIZH_REPORTS/inventory-before.json" > "$RUBIZH_REPORTS/inventory-after.json"
"$RUBIZH_PHP" -r '$d=json_decode(file_get_contents($argv[1]),true);foreach($d["compare"] as $k=>$v)echo $k," ",$v["before"]," → ",$v["after"],$v["identical"]?" OK":" CHANGED","\n";exit($d["all_identical"]?0:3);' "$RUBIZH_REPORTS/inventory-after.json"
echo 'Smoke checks:'
for RUBIZH_URL in / /shop/catalog.php /sitemap.php; do printf '%s ' "$RUBIZH_URL"; curl -s -o /dev/null -w '%{http_code}\n' "${RUBIZH_SMOKE_BASE:-https://rubizh.shop}$RUBIZH_URL"; done
echo "Reports: $RUBIZH_REPORTS"
echo 'PIM v3 schema applied with LOST_* = 0. PIM v3 sync is still OFF: enable it only with the separate owner command.'
grep -o 'Rollback command: .*' "$RUBIZH_REPORTS/deploy.log" || true
