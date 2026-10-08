#!/usr/bin/env bash
# CLI deployment: checksum verified, source backup, private configs/media preserved.
set -euo pipefail
RUBIZH_SITE_ROOT=${1:?Usage: deploy-update.sh SITE_ROOT ARCHIVE SHA256}
RUBIZH_ARCHIVE=${2:?Archive required}
RUBIZH_EXPECTED_SHA=${3:?Checksum required}
[[ "$RUBIZH_SITE_ROOT" = /* && -f "$RUBIZH_SITE_ROOT/api/config.php" && ! -L "$RUBIZH_SITE_ROOT" ]] || { echo 'Shop root unavailable' >&2; exit 2; }
[[ "$RUBIZH_EXPECTED_SHA" =~ ^[a-f0-9]{64}$ ]] || exit 2
printf '%s  %s\n' "$RUBIZH_EXPECTED_SHA" "$RUBIZH_ARCHIVE" | sha256sum -c -
RUBIZH_RELEASE=$(mktemp -d)
RUBIZH_BACKUP="$(dirname "$RUBIZH_SITE_ROOT")/rubizh-private-backups/release-$(date -u +%Y%m%d-%H%M%S)-$$"
mkdir -p "$RUBIZH_BACKUP"
chmod 700 "$(dirname "$RUBIZH_BACKUP")" "$RUBIZH_BACKUP"
trap 'rm -rf "$RUBIZH_RELEASE"' EXIT
unzip -q "$RUBIZH_ARCHIVE" -d "$RUBIZH_RELEASE"
[[ -f "$RUBIZH_RELEASE/rubizh/index.html" && -f "$RUBIZH_RELEASE/rubizh/storefront.php" ]] || exit 2
RUBIZH_LIST="$RUBIZH_BACKUP/files.txt"
find "$RUBIZH_RELEASE/rubizh" -type f -printf '%P\n' > "$RUBIZH_LIST"
# New dependencies first, then reusable libraries, entry points and the HTML
# shell. Each individual file is replaced atomically on the same filesystem.
RUBIZH_ORDERED="$RUBIZH_BACKUP/install-order.txt"
for RUBIZH_EARLY in shop/runtime.php api/database.php api/http-download.php api/perf.php; do
 if [[ -f "$RUBIZH_RELEASE/rubizh/$RUBIZH_EARLY" ]]; then printf '%s\n' "$RUBIZH_EARLY" >> "$RUBIZH_ORDERED"; fi
done
while IFS= read -r RUBIZH_RELATIVE; do
 case "$RUBIZH_RELATIVE" in shop/runtime.php|api/database.php|api/http-download.php|api/perf.php|index.html|storefront.php|shop/order.php|shop/mono-webhook.php|auth/bootstrap.php|api/index.php) continue ;; esac
 printf '%s\n' "$RUBIZH_RELATIVE" >> "$RUBIZH_ORDERED"
done < "$RUBIZH_LIST"
for RUBIZH_LATE in auth/bootstrap.php api/index.php shop/order.php shop/mono-webhook.php storefront.php index.html; do
 if [[ -f "$RUBIZH_RELEASE/rubizh/$RUBIZH_LATE" ]]; then printf '%s\n' "$RUBIZH_LATE" >> "$RUBIZH_ORDERED"; fi
done
mv "$RUBIZH_ORDERED" "$RUBIZH_LIST"
# Validate against the hosting PHP version before touching the running site.
while IFS= read -r RUBIZH_RELATIVE; do [[ "$RUBIZH_RELATIVE" != *.php ]] || php -l "$RUBIZH_RELEASE/rubizh/$RUBIZH_RELATIVE" >/dev/null; done < "$RUBIZH_LIST"
while IFS= read -r RUBIZH_RELATIVE; do
 case "$RUBIZH_RELATIVE" in api/config.php|auth/config.php|api/site-settings.json|api/site-settings.lock|media/*|cache/*|.env*) continue ;; esac
 [[ "$RUBIZH_RELATIVE" != /* && "$RUBIZH_RELATIVE" != *'..'* && ! -L "$RUBIZH_SITE_ROOT/$RUBIZH_RELATIVE" ]] || exit 2
 RUBIZH_TARGET_PARENT=$(dirname "$RUBIZH_SITE_ROOT/$RUBIZH_RELATIVE")
 [[ "$(realpath -m "$RUBIZH_TARGET_PARENT")" = "$RUBIZH_SITE_ROOT" || "$(realpath -m "$RUBIZH_TARGET_PARENT")" = "$RUBIZH_SITE_ROOT/"* ]] || exit 2
 if [[ -e "$RUBIZH_SITE_ROOT/$RUBIZH_RELATIVE" ]]; then
  mkdir -p "$RUBIZH_BACKUP/$(dirname "$RUBIZH_RELATIVE")"
  cp -a "$RUBIZH_SITE_ROOT/$RUBIZH_RELATIVE" "$RUBIZH_BACKUP/$RUBIZH_RELATIVE"
 else
  printf '%s\n' "$RUBIZH_RELATIVE" >> "$RUBIZH_BACKUP/new-files.txt"
 fi
done < "$RUBIZH_LIST"
# Preserve old hard-coded provider files in the main private config before replacing stubs.
mkdir -p "$RUBIZH_BACKUP/api"
cp -a "$RUBIZH_SITE_ROOT/api/config.php" "$RUBIZH_BACKUP/api/config.php"
php -r '$r=$argv[1];define("RUBIZH_PRIVATE_CONFIG",true);$c=require $r."/api/config.php";foreach(["mono-private.php","np-private.php"] as $f){if(!is_file($r."/api/".$f))continue;$a=require $r."/api/".$f;foreach(["mono_token","nova_poshta_api_key"] as $k)if(isset($a[$k])&&trim((string)$a[$k])!=="")$c[$k]=$a[$k];}$m=umask(0077);$f=$r."/api/config.php";$t=$f.".deploy.tmp";if(file_put_contents($t,"<?php\nreturn ".var_export($c,true).";\n")===false||!rename($t,$f))exit(2);chmod($f,0600);umask($m);' "$RUBIZH_SITE_ROOT"
RUBIZH_SUCCESS=false
rollback() {
 if [[ "$RUBIZH_SUCCESS" = true ]]; then return; fi
 echo 'Update failed; restoring previous source files.' >&2
 while IFS= read -r RUBIZH_RELATIVE; do
  if [[ -f "$RUBIZH_BACKUP/$RUBIZH_RELATIVE" ]]; then cp -a "$RUBIZH_BACKUP/$RUBIZH_RELATIVE" "$RUBIZH_SITE_ROOT/$RUBIZH_RELATIVE"; fi
 done < "$RUBIZH_LIST"
 if [[ -f "$RUBIZH_BACKUP/new-files.txt" ]]; then while IFS= read -r RUBIZH_RELATIVE; do rm -f "$RUBIZH_SITE_ROOT/$RUBIZH_RELATIVE"; done < "$RUBIZH_BACKUP/new-files.txt"; fi
 cp -a "$RUBIZH_BACKUP/api/config.php" "$RUBIZH_SITE_ROOT/api/config.php"
}
trap 'rollback; rm -rf "$RUBIZH_RELEASE"' EXIT
while IFS= read -r RUBIZH_RELATIVE; do
 case "$RUBIZH_RELATIVE" in api/config.php|auth/config.php|api/site-settings.json|api/site-settings.lock|media/*|cache/*|.env*) continue ;; esac
 install -d -m 755 "$(dirname "$RUBIZH_SITE_ROOT/$RUBIZH_RELATIVE")"
 RUBIZH_ATOMIC="$RUBIZH_SITE_ROOT/$RUBIZH_RELATIVE.deploy-$$.tmp"
 install -m 644 "$RUBIZH_RELEASE/rubizh/$RUBIZH_RELATIVE" "$RUBIZH_ATOMIC"
 mv -f -- "$RUBIZH_ATOMIC" "$RUBIZH_SITE_ROOT/$RUBIZH_RELATIVE"
done < "$RUBIZH_LIST"
while IFS= read -r RUBIZH_RELATIVE; do [[ "$RUBIZH_RELATIVE" != *.php ]] || php -l "$RUBIZH_SITE_ROOT/$RUBIZH_RELATIVE" >/dev/null; done < "$RUBIZH_LIST"
RUBIZH_SUCCESS=true
echo "Source update installed. Private rollback backup: $RUBIZH_BACKUP"
echo 'Database repair, service activation and cron setup are separate commands.'
