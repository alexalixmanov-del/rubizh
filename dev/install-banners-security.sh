#!/usr/bin/env bash
# Pinned source-only update: numbered banners, admission control and cache warmup.
set -euo pipefail
umask 077
RUBIZH_ROOT=${1:-/home/xk589064/rubizh.shop/www}
[[ "$RUBIZH_ROOT" = /* && -f "$RUBIZH_ROOT/api/config.php" && ! -L "$RUBIZH_ROOT" ]] || { echo 'Shop root unavailable' >&2; exit 2; }
RUBIZH_PHP=${RUBIZH_PHP_BIN:-/usr/local/php82/bin/php}
[[ -x "$RUBIZH_PHP" ]] || RUBIZH_PHP=$(command -v php)
[[ -x "$RUBIZH_PHP" ]] || { echo 'PHP unavailable' >&2; exit 2; }
"$RUBIZH_PHP" -r 'if(version_compare(PHP_VERSION,"8.1","<"))exit(2);foreach(["pdo_mysql","curl","mbstring","openssl","gd","fileinfo"] as $name)if(!extension_loaded($name)){fwrite(STDERR,"Missing PHP extension: ".$name."\n");exit(2);}'
export PATH="$(dirname "$RUBIZH_PHP"):$PATH"
RUBIZH_TEMP=$(mktemp -d /tmp/rubizh-banners-security.XXXXXX)
trap 'command rm -rf -- "$RUBIZH_TEMP"' EXIT
RUBIZH_SHA=f94ac66f19da0aba8f117873ab7ad8e6f634528db5a60e967230b394f813ca3f
curl -fsSL https://raw.githubusercontent.com/alexalixmanov-del/rubizh/b1662debc5f21a0d464019ee86dd945fcf899bcb/downloads/Rubizh-banners-security-update.zip -o "$RUBIZH_TEMP/update.zip"
printf '%s  %s\n' "$RUBIZH_SHA" "$RUBIZH_TEMP/update.zip" | sha256sum -c -
unzip -p "$RUBIZH_TEMP/update.zip" rubizh/dev/deploy-update.sh > "$RUBIZH_TEMP/deploy.sh"
bash "$RUBIZH_TEMP/deploy.sh" "$RUBIZH_ROOT" "$RUBIZH_TEMP/update.zip" "$RUBIZH_SHA"
cd "$RUBIZH_ROOT"
echo 'Preparing runtime schema and catalog indexes...'
"$RUBIZH_PHP" dev/prepare-runtime.php
"$RUBIZH_PHP" dev/install-catalog-indexes.php
echo 'Warming catalog and equipment choices; recording worker heartbeat...'
"$RUBIZH_PHP" shop/cache-worker.php
"$RUBIZH_PHP" dev/check-kit-catalog.php
echo 'Read-only capacity report (not a hosting load test)...'
"$RUBIZH_PHP" dev/check-capacity.php
echo 'Banners and security update installed. Existing product/category relations, private service settings, customer data, media and cron were preserved.'
echo 'No orders, messages, bank invoices or waybills were created by this installer.'
echo 'External database, backup storage and Telegram/email monitoring are not activated by this update.'
echo 'Readiness URL for an external monitor: https://rubizh.shop/health.php'
