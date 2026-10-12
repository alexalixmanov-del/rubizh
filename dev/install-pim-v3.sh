#!/usr/bin/env bash
# PIM contract 3 SITE update. Pinned archive + SHA256, private source backup with rollback command,
# guarded order (P0) migration, runtime schema, additive PIM v3 schema (only with a verified off-webroot DB backup), LOST_* identity
# compare and smoke checks. It never enables PIM v3 sync, payments or cron: those are separate commands.
# Usage: install-pim-v3.sh SITE_ROOT DB_BACKUP_FILE DB_BACKUP_SHA256
set -euo pipefail
# Read-only release gates.
rubizh_verify_release() (
 local archive=$1 php=$2 check
 check=$(mktemp -d)
 trap 'command rm -rf -- "$check"' EXIT
 if ! unzip -p "$archive" rubizh/RELEASE-MANIFEST.json > "$check/manifest.json"; then
  echo 'Reviewed release artifact mismatch; no source installed.' >&2; return 2
 fi
 for file in shop/mono-lib.php shop/mono-webhook.php shop/financial-permissions.php shop/order-validation.php; do
  mkdir -p "$check/$(dirname "$file")"
  if ! unzip -p "$archive" "rubizh/$file" > "$check/$file"; then
   echo 'Reviewed release artifact mismatch; no source installed.' >&2; return 2
  fi
 done
 if ! "$php" -r '
  $m=json_decode(file_get_contents($argv[1]."/manifest.json"),true);
  if(!is_array($m)||($m["commit"]??null)!=="51c83d808228a26328081b02211b4e3605353755")exit(2);
  $required=["shop/mono-lib.php"=>["monoInvalidateFailed(\$db,\$orderId);","MONO_WEBHOOK_GRACE_SECONDS"],"shop/mono-webhook.php"=>["catch(MonoEventRejected"],"shop/financial-permissions.php"=>["staff_stepup_seconds"],"shop/order-validation.php"=>["INVOICE_OPEN"]];
  foreach($required as $f=>$markers){$text=file_get_contents($argv[1]."/".$f);$hash=$m["files"][$f]??"";if(!is_string($hash)||!hash_equals(hash("sha256",$text),$hash))exit(2);foreach($markers as $marker)if(!str_contains($text,$marker))exit(2);}
 ' "$check"; then
  echo 'Reviewed release artifact mismatch; no source installed.' >&2; return 2
 fi
)
if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then return 0; fi
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
RUBIZH_SHA=cc8ac3b7c0f0224b8af5559c9ad9be6fc126254d9f18ee8b2b637193f32b0c3c
curl -fsSL "${RUBIZH_ARCHIVE_URL:-https://raw.githubusercontent.com/alexalixmanov-del/rubizh/6616e42dc9341eae04cc26fd7f1542d4ac4e0ee4/downloads/Rubizh-pim-v3-20261009.zip}" -o "$RUBIZH_TEMP/update.zip"
printf '%s  %s\n' "$RUBIZH_SHA" "$RUBIZH_TEMP/update.zip" | sha256sum -c -
rubizh_verify_release "$RUBIZH_TEMP/update.zip" "$RUBIZH_PHP"
RUBIZH_REPORTS="$(dirname "$RUBIZH_ROOT")/rubizh-private-backups/pim-v3-$(date -u +%Y%m%d-%H%M%S)"
mkdir -p "$RUBIZH_REPORTS"
# Identity inventory BEFORE any schema change (read-only; never runs migrations).
RUBIZH_INVENTORY="$RUBIZH_ROOT/dev/.pim-v3-inventory-$$.php"
unzip -p "$RUBIZH_TEMP/update.zip" rubizh/dev/catalog-inventory.php > "$RUBIZH_INVENTORY"
( cd "$RUBIZH_ROOT" && "$RUBIZH_PHP" "$RUBIZH_INVENTORY" > "$RUBIZH_REPORTS/inventory-before.json" ); rm -f -- "$RUBIZH_INVENTORY"
unzip -p "$RUBIZH_TEMP/update.zip" rubizh/dev/deploy-update.sh > "$RUBIZH_TEMP/deploy.sh"
bash "$RUBIZH_TEMP/deploy.sh" "$RUBIZH_ROOT" "$RUBIZH_TEMP/update.zip" "$RUBIZH_SHA" | tee "$RUBIZH_REPORTS/deploy.log"
cd "$RUBIZH_ROOT"
# Existing orders need the guarded order (P0) migration before runtime preparation; same verified backup.
"$RUBIZH_PHP" dev/migrate-order-p0.php --plan > "$RUBIZH_REPORTS/order-p0-plan.json"
RUBIZH_P0_DB=$("$RUBIZH_PHP" -r 'echo json_decode(file_get_contents($argv[1]),true)["database"];' "$RUBIZH_REPORTS/order-p0-plan.json")
"$RUBIZH_PHP" dev/migrate-order-p0.php --apply --database="$RUBIZH_P0_DB" --backup-file="$RUBIZH_DB_REAL" --backup-sha256="$RUBIZH_DB_SHA" > "$RUBIZH_REPORTS/order-p0-apply.json"
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
