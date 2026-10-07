#!/usr/bin/env bash
# Preserve unrelated scheduled tasks; replace the old cache-only job with all shop queues.
set -euo pipefail
RUBIZH_ROOT=${1:?Usage: install-automation-cron.sh SITE_ROOT [--apply]}
RUBIZH_MODE=${2:---dry-run}
[[ "$RUBIZH_ROOT" = /* && -f "$RUBIZH_ROOT/shop/automation-worker.sh" && ! -L "$RUBIZH_ROOT" ]] || { echo 'Shop root unavailable' >&2; exit 2; }
[[ "$RUBIZH_MODE" = --apply || "$RUBIZH_MODE" = --dry-run ]] || exit 2
[[ "$RUBIZH_ROOT" != *$'\n'* && "$RUBIZH_ROOT" != *'%'* && "$RUBIZH_ROOT" != *"'"* ]] || exit 2
RUBIZH_PHP=${RUBIZH_PHP_BIN:-$(command -v php)}
[[ -x "$RUBIZH_PHP" ]] || exit 2
[[ "$RUBIZH_PHP" != *"'"* && "$RUBIZH_PHP" != *'%'* ]] || exit 2
RUBIZH_JOB="* * * * * RUBIZH_PHP_BIN='$RUBIZH_PHP' bash '$RUBIZH_ROOT/shop/automation-worker.sh' # rubizh-automation-worker"
echo "Automation task: $RUBIZH_JOB"
command -v crontab >/dev/null || { echo 'CLI crontab unavailable. Add the automation task in adm.tools: Розклад завдань (cron).' >&2; exit 2; }
umask 077
RUBIZH_PRIVATE="$(dirname "$RUBIZH_ROOT")/rubizh-private-backups"
[[ ! -L "$RUBIZH_PRIVATE" ]] || exit 2
mkdir -p "$RUBIZH_PRIVATE"
RUBIZH_TEMP=$(mktemp -d "$RUBIZH_PRIVATE/cron-setup.XXXXXX")
trap 'rm -rf "$RUBIZH_TEMP"' EXIT
if LC_ALL=C crontab -l > "$RUBIZH_TEMP/current" 2> "$RUBIZH_TEMP/error"; then
 :
else
 RUBIZH_STATUS=$?
 if [[ "$RUBIZH_STATUS" = 1 ]] && grep -qi 'no crontab for' "$RUBIZH_TEMP/error"; then
  : > "$RUBIZH_TEMP/current"
 else
  echo 'Cannot read existing cron tasks; no changes made. Use Розклад завдань (cron) in adm.tools.' >&2
  exit 2
 fi
fi
# No raw cron contents are printed: existing jobs can contain private credentials.
if awk -v job="$RUBIZH_JOB" -v root="$RUBIZH_ROOT" '$0==job {ready=1} index($0,root) && index($0,"shop/cache-worker.php") && $0 !~ /^[[:space:]]*#/ {old=1} END {exit !(ready && !old)}' "$RUBIZH_TEMP/current"; then
 echo 'Automation cron already configured; no changes made.'
 exit 0
fi
if [[ "$RUBIZH_MODE" != --apply ]]; then echo 'Automation cron needs updating. Run with --apply.'; exit 0; fi
RUBIZH_BACKUP="$RUBIZH_PRIVATE/crontab-$(date -u +%Y%m%d-%H%M%S)-$$.txt"
cp "$RUBIZH_TEMP/current" "$RUBIZH_BACKUP"
chmod 600 "$RUBIZH_BACKUP"
awk -v root="$RUBIZH_ROOT" '!($0 !~ /^[[:space:]]*#/ && index($0,root) && (index($0,"shop/cache-worker.php") || index($0,"shop/automation-worker.sh"))) {print}' "$RUBIZH_TEMP/current" > "$RUBIZH_TEMP/new"
printf '\n%s\n' "$RUBIZH_JOB" >> "$RUBIZH_TEMP/new"
# Refuse to overwrite tasks changed while preparing the update.
if LC_ALL=C crontab -l > "$RUBIZH_TEMP/latest" 2> "$RUBIZH_TEMP/error"; then
 :
else
 RUBIZH_STATUS=$?
 if [[ "$RUBIZH_STATUS" = 1 ]] && grep -qi 'no crontab for' "$RUBIZH_TEMP/error"; then : > "$RUBIZH_TEMP/latest";
 else echo 'Cron changed or became unavailable; no changes made.' >&2; exit 2; fi
fi
cmp -s "$RUBIZH_TEMP/current" "$RUBIZH_TEMP/latest" || { echo 'Cron changed concurrently; no changes made.' >&2; exit 2; }
if ! crontab "$RUBIZH_TEMP/new" 2> "$RUBIZH_TEMP/error"; then echo 'Cron installation rejected by hosting. Add the automation task in adm.tools.' >&2; exit 2; fi
echo "Automation cron installed (every minute). Unrelated tasks preserved. Private backup: $RUBIZH_BACKUP"
