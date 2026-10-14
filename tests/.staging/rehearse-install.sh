#!/bin/bash
# Install + rollback rehearsal on a copy of the current production site (/tmp/claude-0/orig) and the production dump:
# pinned installer → archive SHA → files → additive migration → LOST_* → smoke; then rollback files, restore the DB
# copy, and prove the site boots with the original tree. Usage: ARCHIVE=<zip> bash tests/.staging/rehearse-install.sh
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
RUBIZH_PHP_BIN=$H/php RUBIZH_ARCHIVE_URL=file://${ARCHIVE:-/home/user/rubizh/downloads/Rubizh-pim-v3-20261009.zip} RUBIZH_SMOKE_BASE=http://127.0.0.1:18767 bash /home/user/rubizh/dev/install-pim-v3.sh $H/www $H/private/db-backup.sql.gz $(sha256sum $H/private/db-backup.sql.gz|cut -d' ' -f1) 2>&1 | tee $H/install.log | tail -32
echo "== after install: / $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18767/) catalog $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18767/shop/catalog.php)"
# Rollback: files from the installer's private backup, DB from the verified dump.
RB=$(grep -o 'Rollback command: .*' $H/install.log | tail -1 | sed 's/^Rollback command: //')
[ -n "$RB" ] || { echo 'NO ROLLBACK COMMAND'; kill $SRV; exit 1; }
eval "$RB"
$MY -e "DROP DATABASE prodcopy; CREATE DATABASE prodcopy CHARACTER SET utf8mb4;"; zcat $H/private/db-backup.sql.gz | $MY prodcopy
( cd $H/www && find . -type f ! -path './cache/*' ! -name zz-router.php -print0 | sort -z | xargs -0 sha256sum > $H/tree-after-rollback.txt )
grep -v ' ./zz-router.php$' $H/tree-before.txt > $H/tree-before.cmp
if cmp -s $H/tree-before.cmp $H/tree-after-rollback.txt; then echo 'ROLLBACK_FILES=IDENTICAL'; else echo 'ROLLBACK_FILES=DIFF'; diff $H/tree-before.cmp $H/tree-after-rollback.txt | head -20; fi
echo "== after rollback: / $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18767/) catalog $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18767/shop/catalog.php)"
kill $SRV
