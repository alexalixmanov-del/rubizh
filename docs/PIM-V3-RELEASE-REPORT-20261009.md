# PIM contract 3 → SITE: release report (09.10.2026)

Статус: **подготовлено и проверено на staging-копии production SITE. Production не тронут
(PRODUCTION_WRITES = 0). Установка — только после отдельного OWNER PRODUCTION GO.**

## Что сделано

| Шаг | Результат |
|---|---|
| Приём contract 3 | `POST /api/pim/sync` с `contract_version:3` → `shop/pim-v3-sync.php`: chunked batches (`batch_id`, sha256 replay, `409 BATCH_HASH_CONFLICT`), валидация всего batch до записи, одна транзакция, ACK `COMMITTED` с `results[]` и точными `hidden_ids`. Скрытие — только явное `hide_ids`; отсутствие модели ≠ скрытие (legacy `all_ids` absence-hide удалён). После включения v3 legacy-sync отвечает 409. |
| Capability gate | `GET /api/pim/status` объявляет contract 3 только при `'pim_v3_sync'=>true` **и** применённой схеме (`meta pim_v3_schema=2`). PIM без этого не отправляет. |
| Хранение | `products` = MODEL, `variants` = реальный SKU. Цвета, фото по цветам/модели, size catalogs/options, категории PIM (143 ID), pricing v1, private fulfillment, история. Никаких SKU-декартовых произведений: request-only размер хранится как size option без SKU. |
| Без переклассификации | Для v3-моделей SITE не выводит категорию/slot/наличие из текста; kit slot — из `pim_kit_slot`; related — только из PIM. Ручная категория SITE (lock) уважается. |
| Одно правило фото | `shopUsablePhotoSql()` (`status='ok'` или `pending` с `https://`/`/` URL) — каталог, карточка, sitemap, feed, kit, storefront. |
| Карточка | DTO-whitelist (`shop/pim-v3-read.php`): цвета с собственными галереями и SKU, размеры, typed availability, 3 permission flags, публичные цены. Переключение цвета меняет галерею, размеры и SKU; deep link `?color=`. |
| Заказ/оплата | 3 флага (`order_submission_allowed`, `payment_allowed`, `manager_confirmation_required`). Mixed cart → весь заказ `WAITING_CONFIRMATION`, затем одна оплата. `UNKNOWN` → заказ/оплата запрещены. Подтверждённый IN_STOCK → немедленная оплата. Перед invoice — ревалидация цены (`PRICE_CHANGED` 409). `PAID` — только из подписанного ECDSA webhook. Нет 48h stale gate (только `expires_at`). Состояния: order NEW/WAITING_CONFIRMATION/CONFIRMED/CANCELLED/COMPLETED; payment UNPAID/PAYMENT_PENDING/PAID/PARTIALLY_REFUNDED/REFUNDED; fulfillment отдельно. |
| Миграция | Только аддитивная (`shop/pim-v3-schema.php`, 76 шагов + журнал), применяется оператором CLI и только с проверенным backup БД вне webroot. Request-time код схему не меняет. |
| Инструменты | `dev/catalog-inventory.php` (read-only, LOST_* compare), `dev/catalog-sql-profile.php`, `dev/install-pim-v3.sh`, `dev/rollback-update.sh`, `dev/package-release.py`. |

## Доказательства (staging)

Источник: production-дамп SITE от 09.10.2026, SHA256
`35a2a4e269763b239b367d146c2840d07790e45f05f0b1a6354fd9ae3a67fda5`, импортирован в изолированный
MySQL 8.0.46. Дамп и отчёты хранятся только приватно (не в Git, не в webroot).

Данные: 3103 products · 8682 SKU · 19025 photos · 348 categories · 137 canonical · 3 orders.

**LOST_\*** (identity digests до/после миграции, все identical): PRODUCTS 3103, URLS 3103, SKU 8682,
VARIANTS 8682, PRICES 8682, STOCK 8682, PHOTOS 19025, CATEGORIES 348, CANONICAL_CATEGORIES 137,
CATEGORY_BINDINGS 3103, CATEGORY_ALIASES 348, ORDERS 3, ORDER_ITEMS 3, ACCOUNTS 4, ACCOUNT_ORDERS 2,
FAVORITES 0, FULFILLMENT 0, MONO_INVOICES 1, SHIPMENTS 0, HISTORY 0 → **LOST_* = 0**.
Повторный apply — no-op.

**Staging E2E** на финальном коде (18/18 PASS): capability; legacy каталог до sync; exact PIM wire
COMMITTED; каталог = legacy + 4 модели (2226 → 2230, одна карточка на модель); v3 DTO; legacy карточка
без изменений; IN_STOCK → CONFIRMED → invoice (staging mock bank) → подписанный webhook → PAID;
UNKNOWN → отказ; OUT_OF_STOCK → отказ; размер без SKU → заявка без fake SKU; PREORDER → подтверждение;
mixed cart → один заказ WAITING_CONFIRMATION; браузер 390/768/1440 — смена цвета меняет галерею,
без overflow и JS errors.

**Rehearsal установки** `install-pim-v3.sh` на копии текущего сайта: LOST_* = 0, smoke 200;
`rollback-update.sh` вернул байт-идентичное дерево. Старый код на мигрированной БД работает.

**Тесты репозитория:** 194/195. Единственный нестабильный — `runtime-http` (нагрузка 8 клиентов, 1 из 96
ответов 503 load-shed); на исходном коммите `093f591` он так же падает 2 из 3 прогонов в этом
контейнере — не регрессия.

**Slow SQL** (production-копия, без кэша, одинаковые total; было → стало):

| Запрос | Было | Стало |
|---|---|---|
| каталог по умолчанию | 6.4 s / 602k rows | 1.8 s / 173k rows |
| `availability=in` | 126 s / 11.7M rows | 13.7 s / 1.04M rows |
| `q=куртка` | 0.5 s / 110k rows | 1.9 s / 383k rows |
| `sort=cheap` | 1.5 s | 1.7 s |

Это смешанный legacy-каталог (legacy-предикаты с regexp остаются для не-v3 товаров). Чистый
v3-каталог на реальном объёме не измерен — нужен реальный экспорт PIM (см. блокеры).

## Блокеры (PRODUCTION_READY = NO)

1. **PIM backup** (Drive, 87 MB) недоступен из контейнера (proxy 403; лимит Drive-коннектора).
   Нет: SOURCE_BACKUP_SHA256, контрольной миграции PIM, реальных READY/MODERATION/REJECTED,
   реального экспорта → staging ingestion → SQL-профиля чистого v3.
2. **GitHub push** — 403 (Claude GitHub App не имеет доступа). Коммиты локальные; pinned raw URL
   установщика заработает только после push.
3. **Автопрайсы** — нет оригиналов прайсов поставщиков; остаются OFF.

## Команды ADM.TOOLS (только после OWNER PRODUCTION GO)

Выполнять по порядку; секреты в командах не показываются. Backup — вне webroot.

```bash
# 0. Пути и PHP
cd /home/xk589064/rubizh.shop && ls -d www pim && /usr/local/php82/bin/php -v | head -1

# 1. Свежий backup БД SITE вне webroot (пароль берётся из конфига, на экран не выводится)
mkdir -p /home/xk589064/rubizh-private-backups && chmod 700 /home/xk589064/rubizh-private-backups
B=/home/xk589064/rubizh-private-backups/site-before-pim-v3-$(date -u +%Y%m%d-%H%M%S).sql.gz
/usr/local/php82/bin/php -r '$c=require "www/api/config.php";$f=tempnam("/tmp","my");chmod($f,0600);file_put_contents($f,"[client]\nuser=".$c["db_user"]."\npassword=".$c["db_pass"]."\nhost=".$c["db_host"]."\n");echo $f," ",$c["db_name"];' > /tmp/.rubizh-my
read MYCNF DBNAME < /tmp/.rubizh-my; rm -f /tmp/.rubizh-my
mysqldump --defaults-extra-file="$MYCNF" --single-transaction --routines --triggers "$DBNAME" | gzip > "$B"; rm -f "$MYCNF"
gzip -t "$B" && sha256sum "$B"
#   альтернатива: дамп из панели adm.tools (как присланный 09.10) — положить в тот же каталог и указать как $B

# 2. Установка SITE (pinned архив + SHA256; схема только аддитивная; LOST_* compare; sync остаётся OFF)
curl -fsSL https://raw.githubusercontent.com/alexalixmanov-del/rubizh/claude/amazing-meitner-e6572n/dev/install-pim-v3.sh -o /tmp/install-pim-v3.sh
bash /tmp/install-pim-v3.sh /home/xk589064/rubizh.shop/www "$B" "$(sha256sum "$B" | cut -d' ' -f1)"
#   ожидается: все LOST_* OK, smoke 200; запомнить строку "Rollback command: ..."

# 3. Установка PIM 10.9.3 final-workflow (сначала полный backup в прежней PIM → файл вне webroot)
mkdir -p /home/xk589064/.pim-release && cd /home/xk589064/.pim-release
curl -fsSL -o pim.zip https://raw.githubusercontent.com/alexalixmanov-del/pim.rubizh/5a34d828930accb86af492629c81a5de9ea07d40/releases/pim-10.9.3/rubizh-pim-10.9.3-final-workflow.zip
echo '3351991f6ae6918bc4f8041e3221504bb0821ddaf382676fc99e4c4a1690adfd  pim.zip' | sha256sum -c -
unzip -o -q pim.zip tools/install-production.py
python3 tools/install-production.py install --archive pim.zip --target /home/xk589064/rubizh.shop/pim \
  --data-backup /home/xk589064/.pim-deploy-backups/input/<ПОЛНЫЙ_BACKUP>.json.gz \
  --backup-root /home/xk589064/.pim-deploy-backups
#   затем в браузере: migration dry-run → «Повна копія файлом + застосувати»

# 4. Отдельная команда владельца: включить приём contract 3 (бэкап конфига вне webroot)
cd /home/xk589064/rubizh.shop/www
cp -p api/config.php /home/xk589064/rubizh-private-backups/config.php.before-pim-v3
/usr/local/php82/bin/php -r '$f="api/config.php";$c=require $f;$c["pim_v3_sync"]=true;file_put_contents($f.".new","<?php return ".var_export($c,true).";\n");'
/usr/local/php82/bin/php -l api/config.php.new && chmod --reference=api/config.php api/config.php.new && mv api/config.php.new api/config.php
curl -s -H "Authorization: Bearer $(/usr/local/php82/bin/php -r '$c=require "api/config.php";echo $c["pim_key"]??"";')" https://rubizh.shop/api/pim/status | head -c 400; echo
#   затем в PIM: экран «НА САЙТ» → публикация (пакеты по 100, ACK COMMITTED)
```

### Rollback

```bash
# Файлы SITE: команда, напечатанная install-pim-v3.sh ("Rollback command: ...")
# Выключить приём v3:
cp -p /home/xk589064/rubizh-private-backups/config.php.before-pim-v3 /home/xk589064/rubizh.shop/www/api/config.php
# Схема аддитивная; старый код работает на мигрированной БД. Полный откат БД — из $B:
#   gunzip -c "$B" | mysql --defaults-extra-file=<приватный cnf> <db_name>
# Файлы PIM:
python3 /home/xk589064/.pim-deploy-backups/<BACKUP_PATH>/install-production.py rollback --backup /home/xk589064/.pim-deploy-backups/<BACKUP_PATH>
```

Пункт 2 использует installer с ветки; после merge в main ссылку заменить на коммит main.
Ключ `pim_key` — тот же, что в настройках подключения PIM; значение на экран не выводится.
