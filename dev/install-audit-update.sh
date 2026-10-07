#!/usr/bin/env bash
# Install a pinned audit release; preserve private configuration and repair public data.
set -euo pipefail
umask 077
RUBIZH_ROOT=${1:-/home/xk589064/rubizh.shop/www}
[[ "$RUBIZH_ROOT" = /* && -f "$RUBIZH_ROOT/api/config.php" && ! -L "$RUBIZH_ROOT" ]] || { echo 'Shop root unavailable' >&2; exit 2; }
RUBIZH_PHP=${RUBIZH_PHP_BIN:-/usr/local/php82/bin/php}
[[ -x "$RUBIZH_PHP" ]] || RUBIZH_PHP=$(command -v php)
[[ -x "$RUBIZH_PHP" ]] || { echo 'PHP unavailable' >&2; exit 2; }
export PATH="$(dirname "$RUBIZH_PHP"):$PATH"
RUBIZH_TEMP=$(mktemp -d /tmp/rubizh-audit.XXXXXX)
trap 'command rm -rf -- "$RUBIZH_TEMP"' EXIT
RUBIZH_SHA=560f555164effb0b07d03df3afaaaddbd4da57b592f9bb21b825b1f264683b8a
curl -fsSL https://raw.githubusercontent.com/alexalixmanov-del/rubizh/dc82a9fe94b91797871f44f79dd1562fd6d02f6c/downloads/Rubizh-audit-fixes-update.zip -o "$RUBIZH_TEMP/update.zip"
printf '%s  %s\n' "$RUBIZH_SHA" "$RUBIZH_TEMP/update.zip" | sha256sum -c -
unzip -p "$RUBIZH_TEMP/update.zip" rubizh/dev/deploy-update.sh > "$RUBIZH_TEMP/deploy.sh"
bash "$RUBIZH_TEMP/deploy.sh" "$RUBIZH_ROOT" "$RUBIZH_TEMP/update.zip" "$RUBIZH_SHA"
cd "$RUBIZH_ROOT"
echo 'Preparing queues and repairing catalogue data...'
"$RUBIZH_PHP" dev/prepare-automation.php
"$RUBIZH_PHP" dev/install-catalog-indexes.php
"$RUBIZH_PHP" dev/repair-catalog.php --apply
"$RUBIZH_PHP" dev/repair-photo-files.php --retry-errors
echo 'Downloading the first photo batch; remaining files continue through cron...'
"$RUBIZH_PHP" shop/photo-worker.php || echo 'Photo worker needs attention; see the data report below.'
"$RUBIZH_PHP" shop/cache-worker.php
if RUBIZH_PHP_BIN="$RUBIZH_PHP" bash dev/install-automation-cron.sh "$RUBIZH_ROOT" --apply; then
 echo 'Automation schedule checked.'
else
 RUBIZH_CRON_EXIT=$?
 [[ "$RUBIZH_CRON_EXIT" = 2 ]] || exit "$RUBIZH_CRON_EXIT"
 echo 'adm.tools: replace the old cache task with this command, scheduled every minute:'
 printf 'RUBIZH_PHP_BIN=%s bash %s/shop/automation-worker.sh\n' "$RUBIZH_PHP" "$RUBIZH_ROOT"
fi
"$RUBIZH_PHP" dev/catalog-health.php
"$RUBIZH_PHP" dev/check-launch.php --smtp || {
 RUBIZH_CHECK_EXIT=$?
 [[ "$RUBIZH_CHECK_EXIT" = 2 ]] || exit "$RUBIZH_CHECK_EXIT"
 echo 'Some checks still need attention. New cron heartbeats appear after its first run.'
}
echo 'Audit update installed. Existing private settings and media were preserved.'
echo 'No new orders, bank invoices or waybills were created by this installer.'
echo 'Automation cron processes the existing shop queues; failed source photos require current supplier originals.'
