#!/usr/bin/env bash
# Source, photo performance and a fresh read-only classification report.
# Mass category apply and the new kit engine are separate stages.
set -euo pipefail
umask 077
RUBIZH_ROOT=${1:-/home/xk589064/rubizh.shop/www}
[[ "$RUBIZH_ROOT" = /* && -f "$RUBIZH_ROOT/api/config.php" && ! -L "$RUBIZH_ROOT" ]] || { echo 'Shop root unavailable' >&2; exit 2; }
RUBIZH_PHP=${RUBIZH_PHP_BIN:-/usr/local/php82/bin/php}
[[ -x "$RUBIZH_PHP" ]] || RUBIZH_PHP=$(command -v php)
[[ -x "$RUBIZH_PHP" ]] || { echo 'PHP unavailable' >&2; exit 2; }
"$RUBIZH_PHP" -r 'if(version_compare(PHP_VERSION,"8.1","<"))exit(2);foreach(["pdo_mysql","curl","mbstring","openssl","gd","fileinfo"] as $name)if(!extension_loaded($name)){fwrite(STDERR,"Missing PHP extension: ".$name."\n");exit(2);}'
export PATH="$(dirname "$RUBIZH_PHP"):$PATH"
RUBIZH_TEMP=$(mktemp -d /tmp/rubizh-reclassification-v2.XXXXXX)
trap 'command rm -rf -- "$RUBIZH_TEMP"' EXIT
RUBIZH_SHA=11bb577e6f1e9a78d8ea71a28656c2ec66de88080f3161e563eb36ab79409334
curl -fsSL https://raw.githubusercontent.com/alexalixmanov-del/rubizh/9788a9eddd607f1738832ce2b4f657de6f887b6c/downloads/Rubizh-reclassification-v2-update.zip -o "$RUBIZH_TEMP/update.zip"
printf '%s  %s\n' "$RUBIZH_SHA" "$RUBIZH_TEMP/update.zip" | sha256sum -c -
unzip -p "$RUBIZH_TEMP/update.zip" rubizh/dev/deploy-update.sh > "$RUBIZH_TEMP/deploy.sh"
bash "$RUBIZH_TEMP/deploy.sh" "$RUBIZH_ROOT" "$RUBIZH_TEMP/update.zip" "$RUBIZH_SHA"
cd "$RUBIZH_ROOT"
"$RUBIZH_PHP" dev/prepare-runtime.php
"$RUBIZH_PHP" dev/install-catalog-indexes.php
echo 'Repairing public photo permissions and retrying failed photo jobs once...'
"$RUBIZH_PHP" dev/repair-photo-permissions.php
"$RUBIZH_PHP" dev/repair-photo-files.php --retry-errors
echo 'Running the bounded photo batch and warming catalogue caches...'
"$RUBIZH_PHP" shop/cache-worker.php
echo 'Reclassification v2: fresh dry-run only; no mass category apply...'
"$RUBIZH_PHP" dev/reclassify-catalog-v2.php
echo 'Source and photo performance update installed. Existing minute cron continues photo processing.'
echo 'Review the private dry-run CSV/JSON before the separate apply command. The new kit engine is not activated.'
echo 'No orders, messages, bank invoices or waybills were created. Customer data, provider settings and cron were preserved.'
