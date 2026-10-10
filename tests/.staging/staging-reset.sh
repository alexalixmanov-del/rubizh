#!/bin/bash
# Fresh production copy → runtime prep → v3 additive schema (operator CLI) → LOST_* compare.
set -e
S=/tmp/claude-0/staging; M=/tmp/claude-0/rt/mysql8; MY="$M/root/usr/bin/mysql --socket=$M/mysql.sock -uroot"; P="php -d pdo_mysql.default_socket=$M/mysql.sock"
$MY -e "DROP DATABASE IF EXISTS prodcopy; CREATE DATABASE prodcopy CHARACTER SET utf8mb4;"
zcat $S/private/backup-before.sql.gz | $MY prodcopy
rm -rf $S/cache/*; cd $S/www
$P dev/catalog-inventory.php > $S/private/inventory-before.json
$P dev/prepare-runtime.php >/dev/null
$P dev/migrate-pim-v3.php --site-config --apply --database=prodcopy --backup-file=$S/private/backup-before.sql.gz --backup-sha256=$(sha256sum $S/private/backup-before.sql.gz|cut -d' ' -f1) > $S/private/apply.json
$P dev/catalog-inventory.php --compare=$S/private/inventory-before.json > $S/private/inventory-after.json
python3 -c "import json;d=json.load(open('$S/private/inventory-after.json'));print('LOST_* all zero:',d['all_identical'])"
