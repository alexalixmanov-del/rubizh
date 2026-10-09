# PIM contract 3 → SITE: release report (09.10.2026)

Статус: **подготовлено и проверено на staging-копии production SITE с реальным экспортом PIM.
Production не тронут (PRODUCTION_WRITES = 0). Установка — только после отдельного OWNER PRODUCTION GO.**

PRODUCTION_READY = **NO**. Остались два решения владельца (раздел «Решения владельца»).

## Что сделано (SITE)

| Шаг | Результат |
|---|---|
| Приём contract 3 | `POST /api/pim/sync` с `contract_version:3` → `shop/pim-v3-sync.php`: chunked batches (`batch_id`, sha256 replay, `409 BATCH_HASH_CONFLICT`), валидация всего batch до записи, одна транзакция, ACK `COMMITTED` с `results[]` и точными `hidden_ids`. Скрытие — только явное `hide_ids`; отсутствие модели ≠ скрытие. После включения v3 legacy-sync отвечает 409. |
| Устойчивость к таймауту | Финальная часть пакета дописывается даже при обрыве клиента (`ignore_user_abort`, `set_time_limit(300)`); повтор того же пакета после обрыва получает сохранённый ACK (`replayed:true`), без повторной записи. Проверено на staging. |
| Capability gate | `GET /api/pim/status` объявляет contract 3 только при `'pim_v3_sync'=>true` **и** применённой схеме (`meta pim_v3_schema=2`). PIM без этого не отправляет. |
| Хранение | `products` = MODEL, `variants` = реальный SKU. Цвета, фото по цветам/модели, size catalogs/options, категории PIM (143 ID), pricing v1, private fulfillment, история. Без декартовых SKU: размер «под заказ» — size option без SKU. |
| Без переклассификации | Для v3-моделей SITE не выводит категорию/slot/наличие из текста; kit slot — `pim_kit_slot`; related — только из PIM. Ручная категория SITE (lock) уважается. |
| Одно правило фото | `shopUsablePhotoSql()` — каталог, карточка, sitemap, feed, kit, storefront. |
| Карточка | DTO-whitelist: цвета с собственными галереями и SKU, размеры, typed availability, 3 permission flags, публичные цены. Цвет меняет галерею, размеры и SKU; deep link `?color=`. |
| Заказ/оплата | 3 флага; mixed cart → весь заказ `WAITING_CONFIRMATION`, затем одна оплата; `UNKNOWN` → заказ/оплата запрещены; подтверждённый IN_STOCK → немедленная оплата; ревалидация цены перед invoice; `PAID` — только подписанный ECDSA webhook; нет 48h stale gate. Состояния order/payment/fulfillment раздельные. |
| Миграция | Только аддитивная (76 шагов + журнал), оператором CLI и только с проверенным backup БД вне webroot. |
| Legacy-карточки | `dev/pim-v3-legacy-hide.php` — явная команда владельца: plan (read-only, SHA256, URL-последствия) → apply только точного плана с проверенным backup (иначе `STALE_PLAN`) → restore. Меняется только видимость; ничего не удаляется. **В production не выполнять до решения по URL (ниже).** |

## Доказательства (staging = production-копия SITE)

Дамп SITE 09.10.2026, SHA256 `35a2a4e269763b239b367d146c2840d07790e45f05f0b1a6354fd9ae3a67fda5`,
изолированный MySQL 8.0.46. Дамп, backup PIM, wire и отчёты — только приватно (не в Git, не в webroot).

**Миграция SITE:** 3103 products · 8682 SKU · 19025 photos · 348 categories · 137 canonical · 3 orders.
LOST_* (identity digests, 20 сущностей) = **0**; повторный apply — no-op.

**Реальный экспорт PIM → SITE** (backup PIM `6311d34d…7792a`, утверждённая политика цен применена
владельческим путём на изолированной копии): 2071 модель · 5938 SKU · 143 категории.
- Первая попытка: SITE отклонил весь пакет (fail-closed, ничего не записано) — 34 модели слали
  `size_normalized` числом. Исправлено в экспорте PIM (текст), повтор — `COMMITTED`.
- ACK: 2071 результатов (1184 updated, 887 created), hidden 0; replay последнего пакета — stored ACK.
- После записи: 2071 v3-моделей, 5938 активных SKU, 3051 цветов, 834 size options, 143 категорий;
  приватных полей в DTO нет.
- Коммит первой полной публикации: 58 → 39–41 s (многострочные INSERT). Последующие публикации
  отправляют только изменённые модели.

**SQL-профиль каталога (без кэша, production-копия):**

| Запрос | Исходный код | Смешанный (legacy + v3) | Только v3 (2071) |
|---|---|---|---|
| каталог | 6.4 s | 1.67 s | **0.49 s** |
| `availability=in` | 126 s | 10.4 s | **0.96 s** |
| `q=куртка` | 0.5 s | 1.56 s | **0.22 s** |
| `sort=cheap` | 1.5 s | 1.64 s | **0.37 s** |

Только v3: `buyable` без REGEXP и без JSON-предикатов. Смешанный режим — пока видимы legacy-карточки.

**Staging E2E** (финальный код): 18/18 PASS — capability; legacy до sync; exact wire COMMITTED; v3 DTO;
IN_STOCK → CONFIRMED → invoice (mock bank) → подписанный webhook → PAID; UNKNOWN/OUT → отказ; размер
без SKU → заявка без fake SKU; PREORDER → подтверждение; mixed cart → один заказ WAITING_CONFIRMATION;
браузер 390/768/1440. **На реальных моделях** (6, 4 и 2 цвета; 390/768/1440): 9/9 — клик по цвету меняет
галерею, URL получает `?color=`, deep link открывает нужный цвет, без overflow и JS errors.

**Таймаут:** клиент оборван через 5 s → повтор: `503 CATALOG_BUSY`, затем `COMMITTED` `replayed:true`.

**Установка:** `install-pim-v3.sh` (новый архив `1fc494d6…2769`) на копии текущего сайта: LOST_* = 0,
smoke 200; rollback — байт-идентичное дерево (520 файлов).

**Тесты:** 195/196. Единственный — `runtime-http` (8 клиентов, 1 из 96 ответов 503 load-shed); на
исходном `093f591` падает так же (2 из 3 прогонов в этом контейнере) — не регрессия.

## Решения владельца (до production)

1. **Legacy-карточки и URL.** После первой публикации видимы 1919 legacy-карточек (1204 — старое
   поколение каталога, которого нет в текущей PIM; 715 — есть в PIM, но не READY). 861 v3-модель
   получила адрес `…-2`, потому что канонический URL занят старой карточкой того же товара.
   Скрытие без переноса URL сделает эти старые адреса 404 (редиректов товаров на сайте нет).
   Нужно решение: перенос URL (старый адрес → новая модель) и только потом скрытие, либо иное.
2. **Цены.** Экспорт v3 требует утверждённой политики 30 / 25 / 20, пол скидок 15%. В PIM она
   применяется только владельцем: «НА САЙТ» → «Проверить правила цен» → «Применить» (полная копия,
   safety-копия, проверка записи). На реальном backup это поднимает 8693 из 8734 цен SKU, снижений 0.

## Команды ADM.TOOLS (только после OWNER PRODUCTION GO)

Секреты в командах не показываются. Backup — вне webroot.

```bash
# 0. Пути и PHP
cd /home/xk589064/rubizh.shop && ls -d www pim && /usr/local/php82/bin/php -v | head -1

# 1. Свежий backup БД SITE вне webroot (пароль из конфига, на экран не выводится)
mkdir -p /home/xk589064/rubizh-private-backups && chmod 700 /home/xk589064/rubizh-private-backups
B=/home/xk589064/rubizh-private-backups/site-before-pim-v3-$(date -u +%Y%m%d-%H%M%S).sql.gz
/usr/local/php82/bin/php -r '$c=require "www/api/config.php";$f=tempnam("/tmp","my");chmod($f,0600);file_put_contents($f,"[client]\nuser=".$c["db_user"]."\npassword=".$c["db_pass"]."\nhost=".$c["db_host"]."\n");echo $f," ",$c["db_name"];' > /tmp/.rubizh-my
read MYCNF DBNAME < /tmp/.rubizh-my; rm -f /tmp/.rubizh-my
mysqldump --defaults-extra-file="$MYCNF" --single-transaction --routines --triggers "$DBNAME" | gzip > "$B"; rm -f "$MYCNF"
gzip -t "$B" && sha256sum "$B"
#   альтернатива: дамп из панели adm.tools — положить в тот же каталог и указать как $B

# 2. SITE: pinned installer (коммит c24305195a48df44e740b8aac69285d003852b7b) + pinned архив внутри
curl -fsSL -o /tmp/install-pim-v3.sh https://raw.githubusercontent.com/alexalixmanov-del/rubizh/c24305195a48df44e740b8aac69285d003852b7b/dev/install-pim-v3.sh
echo '429abe3cc6ba1018ee7cb1586df30d39c14a86f72d46b0103b155fa2a9de56d8  /tmp/install-pim-v3.sh' | sha256sum -c -
bash /tmp/install-pim-v3.sh /home/xk589064/rubizh.shop/www "$B" "$(sha256sum "$B" | cut -d' ' -f1)"
#   ожидается: все LOST_* OK, smoke 200; сохранить строку "Rollback command: ..."

# 3. PIM 10.9.3 final-workflow (сначала полный backup в прежней PIM → файл вне webroot)
mkdir -p /home/xk589064/.pim-release && cd /home/xk589064/.pim-release
curl -fsSL -o pim.zip https://raw.githubusercontent.com/alexalixmanov-del/pim.rubizh/6872654912a09c2dae7235b34e0b0c84fc7c54a1/releases/pim-10.9.3/rubizh-pim-10.9.3-final-workflow.zip
echo '00edd2e1e2ba93d03d405a5c69810d36b8c01f554d2e676ba66a2df716fbfadb  pim.zip' | sha256sum -c -
unzip -o -q pim.zip tools/install-production.py
python3 tools/install-production.py install --archive pim.zip --target /home/xk589064/rubizh.shop/pim \
  --data-backup /home/xk589064/.pim-deploy-backups/input/<ПОЛНЫЙ_BACKUP>.json.gz \
  --backup-root /home/xk589064/.pim-deploy-backups
#   браузер: migration dry-run → «Повна копія файлом + застосувати»;
#   затем «НА САЙТ» → «Проверить правила цен» → «Применить» (решение владельца №2)

# 4. Отдельная команда владельца: включить приём contract 3
cd /home/xk589064/rubizh.shop/www
cp -p api/config.php /home/xk589064/rubizh-private-backups/config.php.before-pim-v3
/usr/local/php82/bin/php -r '$f="api/config.php";$c=require $f;$c["pim_v3_sync"]=true;file_put_contents($f.".new","<?php return ".var_export($c,true).";\n");'
/usr/local/php82/bin/php -l api/config.php.new && chmod --reference=api/config.php api/config.php.new && mv api/config.php.new api/config.php
curl -s -H "Authorization: Bearer $(/usr/local/php82/bin/php -r '$c=require "api/config.php";echo $c["pim_key"]??"";')" https://rubizh.shop/api/pim/status | head -c 400; echo
#   затем в PIM: «НА САЙТ» → «Отправить на сайт». Если первый пакет оборвался по таймауту —
#   нажать ещё раз: тот же пакет вернёт сохранённый ACK.

# 5. Legacy-карточки — ТОЛЬКО после решения владельца №1 (сначала только план, read-only)
/usr/local/php82/bin/php dev/pim-v3-legacy-hide.php --plan --out=/home/xk589064/rubizh-private-backups/legacy-hide-plan.json
#   apply: --apply --plan-file=<план> --plan-sha256=<из плана> --backup-file="$B" --backup-sha256=<sha $B>
```

### Rollback

```bash
# Файлы SITE: команда "Rollback command: ..." из шага 2
# Выключить приём v3:
cp -p /home/xk589064/rubizh-private-backups/config.php.before-pim-v3 /home/xk589064/rubizh.shop/www/api/config.php
# Legacy-карточки: /usr/local/php82/bin/php dev/pim-v3-legacy-hide.php --restore=<план> --plan-sha256=<sha>
# Схема аддитивная; старый код работает на мигрированной БД. Полный откат БД — из $B.
# Файлы PIM:
python3 /home/xk589064/.pim-deploy-backups/<BACKUP_PATH>/install-production.py rollback --backup /home/xk589064/.pim-deploy-backups/<BACKUP_PATH>
```
