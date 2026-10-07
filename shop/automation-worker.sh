#!/usr/bin/env bash
# One cron entry; each queue has its own interval, lock and private log.
set -euo pipefail
RUBIZH_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
RUBIZH_PHP=${RUBIZH_PHP_BIN:-$(command -v php)}
RUBIZH_STATE="$(dirname "$RUBIZH_ROOT")/rubizh-automation"
[[ -x "$RUBIZH_PHP" && ! -L "$RUBIZH_STATE" ]] || exit 2
command -v flock >/dev/null || { echo 'flock unavailable' >&2; exit 2; }
umask 077
mkdir -p "$RUBIZH_STATE"
chmod 700 "$RUBIZH_STATE"
cd "$RUBIZH_ROOT"
rubizh_job() (
 local name=$1 interval=$2 file=$3 started=0 previous_exit=0 success=0 now result temp
 exec 9>"$RUBIZH_STATE/$name.lock"
 flock -n 9 || exit 0
 if [[ -f "$RUBIZH_STATE/$name.state" ]]; then
  read -r started previous_exit success < "$RUBIZH_STATE/$name.state" || true
 fi
 [[ "$started" =~ ^[0-9]+$ && "$success" =~ ^[0-9]+$ ]] || { started=0; success=0; }
 now=$(date -u +%s)
 (( now-started >= interval )) || exit 0
 temp="$RUBIZH_STATE/$name.state.$BASHPID"
 printf '%s -1 %s\n' "$now" "$success" > "$temp"
 mv -f "$temp" "$RUBIZH_STATE/$name.state"
 if [[ -f "$RUBIZH_STATE/$name.log" ]] && (( $(wc -c < "$RUBIZH_STATE/$name.log") > 2097152 )); then
  mv -f "$RUBIZH_STATE/$name.log" "$RUBIZH_STATE/$name.previous.log"
 fi
 if "$RUBIZH_PHP" "$file" >> "$RUBIZH_STATE/$name.log" 2>&1; then
  result=0; success=$(date -u +%s)
 else result=$?; fi
 printf '%s %s %s\n' "$now" "$result" "$success" > "$temp"
 mv -f "$temp" "$RUBIZH_STATE/$name.state"
 exit "$result"
)
rubizh_job cache 60 shop/cache-worker.php & RUBIZH_CACHE_PID=$!
rubizh_job notifications 60 shop/notification-worker.php & RUBIZH_MAIL_PID=$!
rubizh_job payments 180 shop/mono-worker.php & RUBIZH_MONO_PID=$!
rubizh_job delivery 900 shop/np-worker.php & RUBIZH_NP_PID=$!
rubizh_job photos 60 shop/photo-worker.php & RUBIZH_PHOTO_PID=$!
RUBIZH_RESULT=0
for RUBIZH_JOB_PID in "$RUBIZH_CACHE_PID" "$RUBIZH_MAIL_PID" "$RUBIZH_MONO_PID" "$RUBIZH_NP_PID" "$RUBIZH_PHOTO_PID"; do
 wait "$RUBIZH_JOB_PID" || RUBIZH_RESULT=1
done
exit "$RUBIZH_RESULT"
