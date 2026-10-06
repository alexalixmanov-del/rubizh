#!/usr/bin/env bash
# Install a pinned, verified release; prepare queues; authenticate SMTP without sending mail.
set -euo pipefail
umask 077
RUBIZH_ROOT=${1:-/home/xk589064/rubizh.shop/www}
[[ "$RUBIZH_ROOT" = /* && -f "$RUBIZH_ROOT/api/config.php" && ! -L "$RUBIZH_ROOT" ]] || { echo 'Shop root unavailable' >&2; exit 2; }
RUBIZH_TEMP=$(mktemp -d /tmp/rubizh-mobile.XXXXXX)
trap 'command rm -rf -- "$RUBIZH_TEMP"' EXIT
RUBIZH_SHA=be1d3cfa2254b0542cc31c89310dac0086f4c7440a25095de4ec0be0411d4a69
curl -fsSL https://raw.githubusercontent.com/alexalixmanov-del/rubizh/50beb4730a625efd9192347bdbd88da28118b55b/downloads/Rubizh-mobile-polish-update.zip -o "$RUBIZH_TEMP/update.zip"
printf '%s  %s\n' "$RUBIZH_SHA" "$RUBIZH_TEMP/update.zip" | sha256sum -c -
unzip -p "$RUBIZH_TEMP/update.zip" rubizh/dev/deploy-update.sh > "$RUBIZH_TEMP/deploy.sh"
bash "$RUBIZH_TEMP/deploy.sh" "$RUBIZH_ROOT" "$RUBIZH_TEMP/update.zip" "$RUBIZH_SHA"
cd "$RUBIZH_ROOT"
RUBIZH_PHP=${RUBIZH_PHP_BIN:-/usr/local/php82/bin/php}
"$RUBIZH_PHP" dev/prepare-automation.php
"$RUBIZH_PHP" dev/check-launch.php --smtp || {
 RUBIZH_CHECK_EXIT=$?
 [[ "$RUBIZH_CHECK_EXIT" = 2 ]] || exit "$RUBIZH_CHECK_EXIT"
 echo 'Check requires attention. Missing worker heartbeats are expected before cron is configured.'
}
echo 'Files installed. No emails, payments or waybills were sent by this installer.'
echo 'Replace the old cache cron task with this command; keep the schedule every minute:'
printf 'RUBIZH_PHP_BIN=%s bash %s/shop/automation-worker.sh\n' "$RUBIZH_PHP" "$RUBIZH_ROOT"
