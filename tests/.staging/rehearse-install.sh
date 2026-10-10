#!/bin/bash
set -e
H=/tmp/claude-0/hosting; M=/tmp/claude-0/rt/mysql8; MY="$M/root/usr/bin/mysql --socket=$M/mysql.sock -uroot"
$MY -e "DROP DATABASE IF EXISTS prodcopy; CREATE DATABASE prodcopy CHARACTER SET utf8mb4;"; zcat /tmp/claude-0/private/site-db.sql.gz | $MY prodcopy
rm -rf $H && mkdir -p $H/private && cp -a /tmp/claude-0/orig $H/www && cp /tmp/claude-0/private/site-db.sql.gz $H/private/db-backup.sql.gz
( cd $H/www && find . -type f ! -path './cache/*' -print0 | sort -z | xargs -0 sha256sum > $H/tree-before.txt )
cat > $H/php <<PHP
#!/bin/bash
exec php -d pdo_mysql.default_socket=$M/mysql.sock "\$@"
PHP
chmod +x $H/php
printf '<?php $p=parse_url($_SERVER["REQUEST_URI"],PHP_URL_PATH);if(str_starts_with($p,"/api/")){require __DIR__."/api/index.php";return;}if(preg_match("~^/product/~",$p)||$p==="/"){require __DIR__."/storefront.php";return;}return false;' > $H/router.php
cp $H/router.php /tmp/claude-0/router-src.php
cp /tmp/claude-0/router-src.php $H/www/zz-router.php; php -d pdo_mysql.default_socket=$M/mysql.sock -S 127.0.0.1:18767 -t $H/www $H/www/zz-router.php >/dev/null 2>&1 & SRV=$!
sleep 1
RUBIZH_PHP_BIN=$H/php RUBIZH_ARCHIVE_URL=file:///home/user/rubizh/downloads/Rubizh-pim-v3-20261009.zip RUBIZH_SMOKE_BASE=http://127.0.0.1:18767 bash /home/user/rubizh/dev/install-pim-v3.sh $H/www $H/private/db-backup.sql.gz $(sha256sum $H/private/db-backup.sql.gz|cut -d' ' -f1) 2>&1 | tail -32
kill $SRV
