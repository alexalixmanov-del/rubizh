#!/usr/bin/env bash
# Restores the source files replaced by dev/deploy-update.sh from its private backup and removes files
# that update added. Database changes are additive and are not touched here.
set -euo pipefail
RUBIZH_BACKUP=${1:?Usage: rollback-update.sh BACKUP_DIR SITE_ROOT}
RUBIZH_SITE_ROOT=${2:?Site root required}
[[ "$RUBIZH_SITE_ROOT" = /* && -f "$RUBIZH_SITE_ROOT/api/config.php" && ! -L "$RUBIZH_SITE_ROOT" ]] || { echo 'Shop root unavailable' >&2; exit 2; }
[[ -f "$RUBIZH_BACKUP/files.txt" && -f "$RUBIZH_BACKUP/api/config.php" ]] || { echo 'Backup incomplete' >&2; exit 2; }
while IFS= read -r RUBIZH_RELATIVE; do
 case "$RUBIZH_RELATIVE" in api/config.php|auth/config.php|api/site-settings.json|api/site-settings.lock|media/*|cache/*|.env*) continue ;; esac
 [[ "$RUBIZH_RELATIVE" != /* && "$RUBIZH_RELATIVE" != *'..'* ]] || exit 2
 if [[ -f "$RUBIZH_BACKUP/$RUBIZH_RELATIVE" ]]; then
  RUBIZH_ATOMIC="$RUBIZH_SITE_ROOT/$RUBIZH_RELATIVE.rollback-$$.tmp"
  cp -a "$RUBIZH_BACKUP/$RUBIZH_RELATIVE" "$RUBIZH_ATOMIC" && mv -f -- "$RUBIZH_ATOMIC" "$RUBIZH_SITE_ROOT/$RUBIZH_RELATIVE"
 fi
done < "$RUBIZH_BACKUP/files.txt"
if [[ -f "$RUBIZH_BACKUP/new-files.txt" ]]; then while IFS= read -r RUBIZH_RELATIVE; do [[ "$RUBIZH_RELATIVE" != *'..'* ]] && rm -f -- "$RUBIZH_SITE_ROOT/$RUBIZH_RELATIVE"; done < "$RUBIZH_BACKUP/new-files.txt"; fi
cp -a "$RUBIZH_BACKUP/api/config.php" "$RUBIZH_SITE_ROOT/api/config.php"
echo "Source files restored from $RUBIZH_BACKUP"
