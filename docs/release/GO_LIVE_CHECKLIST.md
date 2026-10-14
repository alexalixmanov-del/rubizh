# GO-LIVE CHECKLIST — SITE RC1

Для владельца. Выполнять **только после отдельного решения владельца о выкладке** и после закрытия [PRE_LAUNCH_BLOCKERS](PRE_LAUNCH_BLOCKERS.md). Этап 3 этот чек-лист на production не выполнял. Шаги 6–8 и откат отрепетированы на изолированной копии production-версии автотестом `tests/rc1-upgrade-rollback.test.mjs` (обновление, работа сайта между шагами 7 и 8, повтор, откат — без потери данных). Не репетировались: `reconcile-order-states.php --plan` (только чтение) и сжатый `.sql.gz` (в тесте — несжатый дамп того же `mysqldump`).

Обозначения (пути взяты из действующего runbook `docs/CATALOG-RESET-20261010.md`, проверьте на хостинге):

```bash
SITE=/home/xk589064/rubizh.shop/www          # корень сайта
PHP=/usr/local/php82/bin/php                  # PHP хостинга
PRIV=/home/xk589064/rubizh-private-backups    # приватная папка вне webroot (chmod 700)
RC1_COMMIT=<SHA тега rubizh-rc1>              # git rev-parse 'rubizh-rc1^{}' или STAGE_CHECKPOINT.md, этап 3
export PATH="$(dirname "$PHP"):$PATH"         # deploy-update.sh вызывает просто `php` — нужен PHP 8.x хостинга
set -o pipefail                               # чтобы `| tee` не скрывал ошибку команды
RC1_SHA256=7a63d9eb8fd93c0d19c3b6b20dd5340a7549b1bd7b4c976cdae2fbe59abec516
```

**STOP-правило:** любая проверка не прошла → не продолжать, выполнить откат текущего шага (пункт «Откат») и сообщить разработчику. Секреты в команды не вписывать и не печатать.

---

## Шаги

### 1. Определить фактическую версию на production (read-only) — PL-4.6

```bash
cd "$SITE" && grep -o 'shop-client\.[0-9]*\.js' index.html | head -1
sha256sum shop/order.php api/lib.php index.html storefront.php
```
На своём компьютере сравнить с тем же файлом в кандидатах (`git show 9788a9e:shop/order.php | sha256sum`, то же для `b1662de`, `b442eb7`). Совпало — версия определена (обновление с неё отрепетировано). Не совпало ни с одним — **STOP**, нужна дополнительная репетиция на этой версии.

Также проверить, что параметры БД задаются только в `api/config.php`: файла `rubizh-private/database.php` рядом с корнем сайта быть не должно (`ls "$SITE/../rubizh-private/database.php"` → «No such file»). Если он есть — **STOP**: шаги 2 и 6 должны читать те же параметры, что и сайт; согласовать с разработчиком.
*Откат:* не нужен (только чтение).

### 2. Бэкап SITE и PIM

```bash
mkdir -p "$PRIV" && chmod 700 "$PRIV"
B="$PRIV/site-before-rc1-$(date -u +%Y%m%d-%H%M%S).sql.gz"
# параметры БД читаются из конфига во временный файл 0600 и не печатаются (как в runbook STEP 3–4)
$PHP -r '$c=require "'"$SITE"'/api/config.php";$f=tempnam("/tmp","my");chmod($f,0600);file_put_contents($f,"[client]\nuser=".$c["db_user"]."\npassword=".$c["db_pass"]."\nhost=".$c["db_host"]."\n");echo $f," ",$c["db_name"],"\n";' > /tmp/.rz; read MYCNF DBNAME < /tmp/.rz; rm -f /tmp/.rz
mysqldump --defaults-extra-file="$MYCNF" --single-transaction --routines --triggers "$DBNAME" | gzip > "$B"
test -s "$B" && gzip -t "$B" && zcat "$B" | tail -1 | grep -q "Dump completed" && sha256sum "$B" | tee "$B.sha256"
tar -C "$SITE/.." -czf "$PRIV/site-files-before-rc1.tgz" "$(basename "$SITE")" && sha256sum "$PRIV/site-files-before-rc1.tgz"
printf 'B=%q\nDBNAME=%q\n' "$B" "$DBNAME" > "$PRIV/rc1-session.env"   # без пароля; после обрыва SSH: source "$PRIV/rc1-session.env" и снова создать $MYCNF этой же командой
```
`$MYCNF` (временный файл с паролем, 0600) нужен до конца выкладки и для отката БД; удалить в конце (`rm -f "$MYCNF"`), после обрыва сессии — создать заново строкой `$PHP -r …` выше. PIM: в браузере владельца «BACKUP → Скачать полную копию» → файл в приватную папку, `gzip -t` и `sha256sum`.
*Откат:* не нужен.

### 3. Проверка восстановимости бэкапа — PL-4.1

Во **временную отдельную** БД на хостинге (создать в панели и **выдать доступ тому же пользователю БД**, что у сайта — на хостинге у каждой БД часто свой пользователь) или локально, если владелец передаст файл (файл не коммитится и удаляется после проверки):
```bash
TMPDB=rubizh_restore_check     # заменить на имя созданной временной БД
zcat "$B" | mysql --defaults-extra-file="$MYCNF" "$TMPDB"
for t in rubizh_customer_orders rubizh_order_shipments rubizh_mono_invoices rubizh_stock_reservations rubizh_accounts products variants; do
  echo "$t $(mysql --defaults-extra-file="$MYCNF" -N -e "SELECT COUNT(*) FROM $t" "$DBNAME") $(mysql --defaults-extra-file="$MYCNF" -N -e "SELECT COUNT(*) FROM $t" "$TMPDB")"; done
```
Счётчики в двух колонках совпадают, список таблиц (`SHOW TABLES`) одинаковый → бэкап пригоден. Временную БД удалить.
*Откат:* удалить временную БД.

### 4. Подготовка: остановить фоновые задачи на время миграций

`crontab -l > "$PRIV/crontab-before-rc1.txt"`, затем закомментировать строки воркеров сайта (оплаты, письма, НП, кеш).
*Откат:* `crontab "$PRIV/crontab-before-rc1.txt"`.

### 5. Загрузка пакета RC1

```bash
cd "$PRIV" && curl -fsSL -o Rubizh-rc1.zip "https://raw.githubusercontent.com/lieverifying/rubizh/$RC1_COMMIT/downloads/Rubizh-rc1.zip"
echo "$RC1_SHA256  Rubizh-rc1.zip" | sha256sum -c -
mkdir -p "$PRIV/rc1-pkg" && unzip -q -o Rubizh-rc1.zip -d "$PRIV/rc1-pkg"
```
*Откат:* удалить `$PRIV/rc1-pkg` и архив.

### 6. Миграция заказов P0 (из пакета, до замены кода)

```bash
$PHP "$PRIV/rc1-pkg/rubizh/dev/migrate-order-p0.php" --plan --config="$SITE/api/config.php"
$PHP "$PRIV/rc1-pkg/rubizh/dev/migrate-order-p0.php" --apply --config="$SITE/api/config.php" --database="$DBNAME" --backup-file="$B" --backup-sha256="$(cut -d' ' -f1 "$B.sha256")"
```
Ожидается JSON `"mode":"APPLY"`; повторный `--plan` показывает все шаги `exists:true`.
*Откат:* изменения аддитивные (колонки резервов, таблица аудита с триггерами); старый код работает на этой схеме. При необходимости — восстановить `$B` (раздел «Откат»).

### 7. Замена кода

```bash
bash "$PRIV/rc1-pkg/rubizh/dev/deploy-update.sh" "$SITE" "$PRIV/Rubizh-rc1.zip" "$RC1_SHA256" | tee "$PRIV/deploy-rc1.log"
```
Сохранить строку `Rollback command: …` из вывода (копия для отката создаётся в `$(dirname "$SITE")/rubizh-private-backups/release-…`, вне webroot). Сразу переходить к шагу 8: между шагами 7 и 8 витрина и кабинет работают (отрепетировано), CRM отвечает 503 до своей миграции. Приватные `api/config.php`, `auth/config.php`, `api/site-settings.json`, `media/`, `cache/` не перезаписываются.
*Откат:* `Rollback command` из лога (раздел «Откат»).

### 8. Миграции схемы

```bash
cd "$SITE"; BK=(--backup-file="$B" --backup-sha256="$(cut -d' ' -f1 "$B.sha256")")
$PHP dev/prepare-runtime.php
$PHP dev/migrate-pim-v3.php --site-config --plan && $PHP dev/migrate-pim-v3.php --site-config --apply --database="$DBNAME" "${BK[@]}"
$PHP dev/migrate-crm.php --plan && $PHP dev/migrate-crm.php --apply --database="$DBNAME" "${BK[@]}"
$PHP dev/migrate-np-recovery.php --plan && $PHP dev/migrate-np-recovery.php --apply --database="$DBNAME" "${BK[@]}"
$PHP dev/reconcile-reservations.php --site-config --plan && $PHP dev/reconcile-reservations.php --site-config --apply --database="$DBNAME" "${BK[@]}"
$PHP dev/reconcile-order-states.php --plan > "$PRIV/order-states-plan.json"
$PHP dev/backfill-crm-order-states.php --plan > "$PRIV/crm-backfill-plan.json"   # просмотреть; ambiguous/conflicts не применяются
$PHP dev/backfill-crm-order-states.php --apply --database="$DBNAME" --plan-sha256="<plan_sha256 из плана>" "${BK[@]}"
```
Каждая команда — код выхода 0. Повторный запуск ничего не меняет (проверено). `pim_v3_sync` **не включается** (приём v3 — этап 5). Схема меняется аддитивно, кроме одного изменения типа: цены `products`/`variants` переводятся из целых в `DECIMAL(14,2)` (значения сохраняются; выполняет `prepare-runtime.php` / первый запрос новой версии).
*Откат:* код — раздел «Откат»; данные — `$B`.

### 9. Ключи — PL-3

Новые `pim_key` и `cron_key` в `api/config.php` (`chmod 600`), обновить PIM и строки cron. Проверить: старый ключ → 401, новый → 200 (`/api/pim/status`). Подробно — [PL-3](PRE_LAUNCH_BLOCKERS.md#pl-3).
*Откат:* не возвращать старые ключи; при откате кода см. примечание в разделе «Откат».

### 10. `trusted_proxies` — PL-1

Только по письменному ответу хостинга: `'trusted_proxies' => [...]` в `api/config.php`; проверка — [PL-1](PRE_LAUNCH_BLOCKERS.md#pl-1).
*Откат:* `'trusted_proxies' => []`.

### 11. Владелец CRM

```bash
stty -echo; $PHP dev/staff-user.php --email=<email владельца> --name="<Имя>" --role=OWNER --reason="RC1 initial owner"; stty echo
# набрать пароль (12–72 символа), Enter, Ctrl+D — пароль не попадает в историю shell и не отображается
```
*Откат:* отключить пользователя в CRM (`Настройки → Персонал`, `enabled=false`).

### 12. Флаги — по одному, после каждого smoke (шаг 13)

Перед каждым изменением: `cp -p api/config.php "$PRIV/config.php.$(date +%s).bak"`. Порядок: (a) вернуть cron (шаг 4); (b) `pim_legacy_sync=false`, `pim_v3_sync` не задан — без изменений; (c) живые интеграции (`mono_activation_confirmed`, `np_ttn_enabled`, `np_card_payment_verified`, `sms_enabled`, `google_enabled`) — **только на этапе 6** после живых проверок, по одному. Смысл и значения — [CONFIG](CONFIG.md).
*Откат:* вернуть копию конфига, сделанную перед изменением флага.

### 13. Smoke-проверки (после шагов 7, 8 и каждого флага)

- `curl -s -o /dev/null -w '%{http_code}\n'` для `https://rubizh.shop/`, `/shop/catalog.php`, `/sitemap.php` → 200;
- `https://rubizh.shop/RELEASE-MANIFEST.json`, `/dev/migrate-crm.php`, `/contracts/pim-v3/1/manifest.json`, `/.htaccess` → 403;
- браузер 390 px и 1440 px: главная, каталог, поиск, карточка (цвет → фото → размер → цена), корзина, оформление **без реальной оплаты**; кабинет — старые заказы видны владельцу заказа; CRM `/crm/` — вход владельца, список и карточки старых заказов открываются;
- JS-ошибок 0, битых ресурсов 0, горизонтального скролла 0.

---

## Откат (общий)

| Что | Как |
|---|---|
| Код | `bash "$SITE/dev/rollback-update.sh" <BACKUP_DIR из лога шага 7> "$SITE"` — возвращает заменённые файлы и удаляет добавленные |
| `api/config.php` после отката кода | `rollback-update.sh` восстанавливает **копию конфига до выкладки** — со старыми ключами и флагами. Если шаг 9/10 уже выполнены: сразу снова вписать **новые** `pim_key`/`cron_key` и `trusted_proxies`, затем `chmod 600 api/config.php` |
| БД | только если данные испорчены (прежний код работает и на мигрированной БД — проверено): **пересоздать** БД (в панели хостинга удалить и создать с тем же именем и пользователем; или `mysql --defaults-extra-file="$MYCNF" -e "DROP DATABASE \`$DBNAME\`; CREATE DATABASE \`$DBNAME\` CHARACTER SET utf8mb4"`, если у пользователя есть права), затем `zcat "$B" \| mysql --defaults-extra-file="$MYCNF" "$DBNAME"`. Восстановление поверх мигрированной БД без пересоздания оставит новые таблицы и триггеры RC1 — так не делать |
| cron | `crontab "$PRIV/crontab-before-rc1.txt"` |
| Проверка | smoke шага 13; заказы и кабинет на старом коде |

Отрепетировано: откат кода + пересоздание БД и восстановление дампа возвращают исходные файлы (475 файлов, байт-в-байт) и все 46 таблиц к состоянию до обновления; старый код работает и на мигрированной схеме (`tests/rc1-upgrade-rollback.test.mjs`).

---

## Этапы 4–6 (не входят в выкладку RC1)

| Этап | Что | Предусловие |
|---|---|---|
| 4 — CRM | решения и исправления CRM-SEC-FRESH-01, CRM-PHP-01, CRM-FE-01, кандидат R-C1; доступ персонала к `/crm/` | решения владельца ([KNOWN_ISSUES](KNOWN_ISSUES.md)) |
| 5 — импорт поставщиков | PIM: релиз с PIMC-P1 (`pim.rubizh@5fd46cb`, `releases/pim-10.9.3/rubizh-pim-10.9.3-final-workflow.zip`, SHA-256 `53e8175711f5969f2724c10815a2b14bc9d39fabc1f3acc167dd8913343f96c0` — заменяет `0605054…` из runbook 10.10) через `tools/install-production.py`; сброс каталога SITE (`dev/pim-v3-catalog-reset.php`), включение приёма v3 (`dev/pim-v3-enable.php`), импорт пяти поставщиков, публикация | runbook `docs/CATALOG-RESET-20261010.md` шаги 11–33 с этим SHA; решения владельца |
| 6 — живые проверки | MonoPay (sandbox → боевой), НП (тестовая ТТН), TurboSMS, почта, OAuth; затем флаги шага 12(c) по одному | доступы и тестовые контакты |
