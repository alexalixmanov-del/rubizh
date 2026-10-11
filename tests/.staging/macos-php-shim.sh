#!/bin/bash
# Local macOS shim for the CI php8.4 runtime layout: Homebrew php@8.2 has every extension the tests
# load compiled in, so explicit "-d extension=<path>.so" arguments are dropped; everything else is passed through.
args=(); skip=0
for a in "$@"; do
  if [ $skip = 1 ]; then skip=0
    case "$a" in extension=*) ;; *) args+=("-d" "$a");; esac
    continue
  fi
  case "$a" in -d) skip=1;; *) args+=("$a");; esac
done
[ -n "${RZ_DISABLE_CURL:-}" ] && args=("-d" "disable_functions=curl_init" "${args[@]}")
exec /opt/homebrew/opt/php@8.2/bin/php "${args[@]}"
