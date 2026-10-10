#!/bin/bash
# Staging webroot from an exact SITE commit + staging-only configs (no production secrets).
# Usage: bash tests/.staging/setup-staging.sh <SITE_COMMIT_SHA>   (repo root as cwd)
set -euo pipefail
S=/tmp/claude-0/staging; SHA=${1:?SITE commit SHA}
mkdir -p $S/www $S/cache $S/media $S/private && chmod 700 $S/private
git archive "$SHA" | tar -x -C $S/www
cp tests/.staging/config.staging.php $S/www/api/config.php
cp tests/.staging/auth-config.staging.php $S/www/auth/config.php
echo "staging webroot = $SHA"
