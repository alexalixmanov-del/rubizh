#!/bin/bash
# Test shim for the retained PHP 8.4 runtime: honours -n and explicit "-d extension=<path>/<name>.so"
# by mapping them onto the system PHP's own shared modules. Under -n it also loads the modules the
# original runtime had compiled in (ctype, fileinfo, iconv, tokenizer, xml family, posix, phar).
args=(); skip=0; noini=0; declare -A seen
for a in "$@"; do
  if [ $skip = 1 ]; then skip=0
    case "$a" in extension=*) n=$(basename "${a#extension=}" .so); seen[$n]=1; args+=("-d" "extension=$n");; *) args+=("-d" "$a");; esac
    continue
  fi
  case "$a" in
    -d) skip=1;;
    -n) noini=1; args+=("$a");;
    *) args+=("$a");;
  esac
done
base=()
if [ $noini = 1 ]; then
  for n in ctype fileinfo iconv tokenizer xml dom simplexml xmlreader xmlwriter posix phar; do
    [ -z "${seen[$n]:-}" ] && base+=("-d" "extension=$n")
  done
fi
# -n must stay first; built-in baseline before the caller's explicit extensions.
if [ $noini = 1 ]; then rest=("${args[@]}"); args=("-n" "${base[@]}"); for a in "${rest[@]}"; do [ "$a" = "-n" ] || args+=("$a"); done; fi
exec /usr/bin/php "${args[@]}"
