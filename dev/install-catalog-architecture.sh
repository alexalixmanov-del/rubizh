#!/usr/bin/env bash
# Pinned source update, reversible category migration, and kit cache warmup.
set -euo pipefail
umask 077
RUBIZH_ROOT=${1:-/home/xk589064/rubizh.shop/www}
[[ "$RUBIZH_ROOT" = /* && -f "$RUBIZH_ROOT/api/config.php" && ! -L "$RUBIZH_ROOT" ]] || { echo 'Shop root unavailable' >&2; exit 2; }
RUBIZH_PHP=${RUBIZH_PHP_BIN:-/usr/local/php82/bin/php}
[[ -x "$RUBIZH_PHP" ]] || RUBIZH_PHP=$(command -v php)
[[ -x "$RUBIZH_PHP" ]] || { echo 'PHP unavailable' >&2; exit 2; }
export PATH="$(dirname "$RUBIZH_PHP"):$PATH"
RUBIZH_TEMP=$(mktemp -d /tmp/rubizh-catalog.XXXXXX)
trap 'command rm -rf -- "$RUBIZH_TEMP"' EXIT
RUBIZH_SHA=5f018f3585e67c51798b9c86e4e54789cfc35523cda73e1be5089140e3fcf2d0
curl -fsSL https://raw.githubusercontent.com/alexalixmanov-del/rubizh/b442eb7bf96823843d2522a223cd8c6506f9e84a/downloads/Rubizh-catalog-architecture-update.zip -o "$RUBIZH_TEMP/update.zip"
printf '%s  %s\n' "$RUBIZH_SHA" "$RUBIZH_TEMP/update.zip" | sha256sum -c -
unzip -p "$RUBIZH_TEMP/update.zip" rubizh/dev/deploy-update.sh > "$RUBIZH_TEMP/deploy.sh"
bash "$RUBIZH_TEMP/deploy.sh" "$RUBIZH_ROOT" "$RUBIZH_TEMP/update.zip" "$RUBIZH_SHA"
cd "$RUBIZH_ROOT"
RUBIZH_REPORT="$(dirname "$RUBIZH_ROOT")/rubizh-private-backups/category-report-$(date -u +%Y%m%d-%H%M%S)-$$"
echo 'Preparing catalog indexes (product values are not changed)...'
"$RUBIZH_PHP" dev/install-catalog-indexes.php
echo 'Dry run: every existing product must have a category or an internal review assignment...'
"$RUBIZH_PHP" dev/migrate-categories.php --report="$RUBIZH_REPORT/dry-run"
echo 'Creating private database and media backup, then applying category relations...'
"$RUBIZH_PHP" dev/migrate-categories.php --apply --report="$RUBIZH_REPORT/after"
echo 'Warming the catalog and equipment selectors...'
"$RUBIZH_PHP" shop/cache-worker.php
echo 'Checking all eight equipment slots against the installed database...'
"$RUBIZH_PHP" dev/check-kit-catalog.php
echo "Catalog update installed. Full migration report: $RUBIZH_REPORT"
echo 'Existing cron, private service settings, product IDs, variants, prices and media were preserved.'
echo 'No orders, messages, bank invoices or waybills were created by this installer.'
