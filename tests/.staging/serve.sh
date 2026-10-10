#!/bin/bash
# Staging storefront for manual/browser QA: MySQL 8 (prodcopy) + PHP built-in server on 127.0.0.1:${PORT:-8090}.
# The webroot is /tmp/claude-0/staging/www (setup-staging.sh); `SYNC=1` first copies this checkout's served files over it.
# Usage: bash tests/.staging/serve.sh [start|stop]
set -e
S=/tmp/claude-0/staging; M=/tmp/claude-0/rt/mysql8; PORT=${PORT:-8090}
if [ "${1:-start}" = stop ]; then
  [ -f $S/php.pid ] && kill "$(cat $S/php.pid)" 2>/dev/null || true; rm -f $S/php.pid
  [ -f $M/m.pid ] && kill "$(cat $M/m.pid)" 2>/dev/null || true; exit 0
fi
if [ "${SYNC:-0}" = 1 ]; then
  for f in index.html offer.html privacy.html storefront.php; do cp "$f" $S/www/$f; done
  cp -r assets shop api auth $S/www/
  cp tests/.staging/config.staging.php $S/www/api/config.php; cp tests/.staging/auth-config.staging.php $S/www/auth/config.php
fi
if ! $M/root/usr/bin/mysql --socket=$M/mysql.sock -uroot -e 'select 1' >/dev/null 2>&1; then
  rm -f $M/mysql.sock $M/mysql.sock.lock $M/m.pid
  (nohup $M/root/usr/sbin/mysqld --no-defaults --user=root --datadir=$M/data --socket=$M/mysql.sock --pid-file=$M/m.pid --log-error=$M/err.log \
    --skip-networking --secure-file-priv=NULL --innodb-redo-log-capacity=1G --innodb-buffer-pool-size=1G --lc-messages-dir=$M/root/usr/share/mysql >/dev/null 2>&1 &)
  for i in $(seq 60); do $M/root/usr/bin/mysql --socket=$M/mysql.sock -uroot -e 'select 1' >/dev/null 2>&1 && break; timeout 1 tail -f /dev/null || true; done
fi
cat > $S/www/router.php <<'PHP'
<?php $p=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);if(str_starts_with($p,'/api/')){require __DIR__.'/api/index.php';return;}if(preg_match('~^/product/~',$p)||$p==='/'){require __DIR__.'/storefront.php';return;}return false;
PHP
[ -f $S/php.pid ] && kill "$(cat $S/php.pid)" 2>/dev/null || true
(cd $S/www && PHP_CLI_SERVER_WORKERS=4 nohup php -d pdo_mysql.default_socket=$M/mysql.sock -d session.save_path=$S/cache -d memory_limit=2G -d max_execution_time=0 \
  -S 127.0.0.1:$PORT -t $S/www $S/www/router.php >$S/php.log 2>&1 & echo $! > $S/php.pid)
echo "staging: http://127.0.0.1:$PORT"
