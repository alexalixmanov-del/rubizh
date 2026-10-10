# Полный сброс каталога PIM + SITE — репетиция на staging (10.10.2026)

Статус: **отрепетировано на staging на реальных данных. Production не тронут (PRODUCTION_WRITES = 0).
Production reset — только после отдельного OWNER GO.**

Данные: backup PIM `6311d34d…7792a` (3113 товаров, 8734 SKU), дамп SITE `35a2a4e2…a67fda5`
(3103 товара, 8682 SKU), оригинальные файлы 5 поставщиков. Всё приватное хранится вне Git и webroot.

## Итог

| Поле | Значение |
|---|---|
| PIM после сброса | PRODUCTS 0 · SKU 0 · очередь 0 · контент 0 |
| Сохранено в PIM | 143 категории, правила категорий, 5 поставщиков с правилами разбора, словари, цены 30/25/20 + 15%, политики наличия, счётчик SKU (17459) |
| PIM_PRODUCTS (после импорта 5 поставщиков) | 4231 карточка (4 объединены в модели по цвету → архив), 8187 SKU |
| READY / MODERATION / REJECTED | **1528 / 2670 / 29** |
| DUPLICATES | SKU 0 · привязок поставщика к нескольким SKU 0 · SKU без offer 0 · offers не из файлов 0 |
| SITE_MODELS / SITE_SKU | **1528 / 2820** |
| SITE после публикации | legacy 0 · URL с `-N` 0 · старых mappings 0 · дублей названий 0 · 143 категории |
| E2E | **14/14 PASS** |
| SQL (только v3, 1528) | каталог 0.24 s · `availability=in` 0.27 s · поиск 0.23 s · REGEXP/JSON нет |

МОДЕРАЦИЯ после сброса: grouping 2191 (кандидаты «одна модель в разных цветах» — без сильных
доказательств PIM не объединяет), category 843, color 95, photo_ownership 3. НЕ ПРОХОДИТ: RESTRICTED 16,
NO_DESCRIPTION 13. 15 позиций остались в очереди импорта без товара.

Наличие SKU: IN_STOCK 4695 · OUT_OF_STOCK 928 · UNKNOWN 1349 (Тактикал Белт, политика не подтверждена) ·
нужно подтвердить размер 1215. Один SKU READY-модели без цены (`price_ready:false`) — заказать нельзя.

## Обновление: clean import hardening (финальный прогон r5)

Тот же сброс и импорт, PIM `82e4fb2` (отчёт: PIM `releases/pim-10.9.3/CLEAN-IMPORT-HARDENING-REPORT.md`),
SITE `d40ec38` (QA: `docs/SITE-QA-20261010.md`).

| Поле | Было | Стало |
|---|---|---|
| READY / MODERATION / REJECTED / ARCHIVED | 1528 / 2670 / 29 | **1698 / 2393 / 31 / 110** |
| Модерация grouping / category / color / photo | 2191 / 843 / 95 / 3 | 2046 / 520 / 72 / 3 (+ price_unit 47, variant_cell 39) |
| SIZE_CONFIRMATION_REQUIRED | 1215 | 1112 |
| SITE_MODELS / SITE_SKU | 1528 / 2820 | **1698 / 3458** |
| legacy · URL `-N` · дубли названий | 0 · 0 · 0 | 0 · 0 · 0 |
| E2E | 14/14 | **14/14 PASS** |

## Что исправлено по ходу репетиции

1. **Ложные «нет фото».** Проверка новых позиций искала фото по ключу контента, который вырезает размер
   иначе, чем ключ группы; 580 позиций с фото отклонялись. Теперь берутся и фото самих offers.
2. **MODEL → COLOR не работал в production.** Флаг `model_colors_version` никогда не был включён, поэтому
   автоматические (сильные) объединения цветов не выполнялись. Сброс включает этап для нового каталога.
3. **Объединённые карточки «оживали».** Обёртка импорта возвращала прежние флаги публикации и снимала
   архив с поглощённых карточек. Исправлено.
4. **group_id поставщика** (варианты одного товара по YML) объединяет позиции в одну модель, только если
   каждая остаётся отдельной ячейкой цвет/размер; иначе — раздельно, без догадок.
5. Селектор «ОБЕРІТЬ РОЗМІР СІТКИ» — по решению владельца 10.10 точный размер SKU только для сеток M-WIN
   (правило `m-win-net-grid-v1`, см. отчёт PIM).

## E2E (реальные модели после сброса)

Браузер 390 / 768 / 1440: модель → цвет → галерея → размер → реальный SKU → цена → «В наявності» →
корзина. Оформление из корзины → CONFIRMED (цена из PIM) → invoice (mock bank) → подписанный webhook →
PAID. UNKNOWN → отказ; OUT_OF_STOCK → отказ; PREORDER → подтверждение менеджера; размер без SKU →
заявка без fake SKU, оплата запрещена; смешанная корзина → один заказ WAITING_CONFIRMATION.

## Финальный релиз (10.10.2026, вечер) — чистые клоны точных SHA

PIM `21198461` (код = `6f3afcf`), SITE `47848fd` (архив `6616e42`). PIM backup `6311d34d…` проверен; reset → 5 фидов →
wire **1476 моделей / 3444 SKU**; staging: свежая копия production SITE → установка → P0 + v3 миграции → LOST_* = 0 →
сброс каталога SITE → включение v3 командой `dev/pim-v3-enable.php` → одна публикация (COMMITTED, повтор
финального пакета — тот же ACK) → SITE = wire, legacy 0, URL `-N` 0, дубли названий 0 → **E2E 15/15 PASS** (цвет →
галерея → размер → SKU = корзина → цена, IN_STOCK → заказ → invoice → подписанный webhook → PAID, OUT_OF_STOCK
→ отказ 409, PREORDER → подтверждение, размер без SKU → заявка без fake SKU, смешанная корзина → один
WAITING_CONFIRMATION). Браузерная QA 10 ширин: 0 проблем. SEO: PASS. Репетиция установки и отката: PASS.

## PRODUCTION RUNBOOK — финальный релиз (единственная действующая процедура)

`docs/PIM-V3-RELEASE-REPORT-20261009.md` — SUPERSEDED, не использовать. Все шаги — по порядку, без пропусков.
Секреты в командах не печатаются. Любое STOP-условие (§ «Стоп») — прекратить и оценить откат.

Финальные артефакты (воспроизводимы из Git SHA; CI проверяет пересборку байт-в-байт):

| Что | Коммит | Файл | SHA256 |
|---|---|---|---|
| SITE release archive | `6616e42dc9341eae04cc26fd7f1542d4ac4e0ee4` | `downloads/Rubizh-pim-v3-20261009.zip` | `cc8ac3b7c0f0224b8af5559c9ad9be6fc126254d9f18ee8b2b637193f32b0c3c` |
| SITE installer | `47848fdb00dd61332eb164cafc7b6ef264253730` | `dev/install-pim-v3.sh` | `753a01dbfbf7c8a928d921d4819a42945c05cb53f1c53158363b7999c9f6d6a8` |
| PIM release archive | `21198461f8ebb2eadef6dcd6fb77a50a8a038ea9` | `releases/pim-10.9.3/rubizh-pim-10.9.3-final-workflow.zip` | `060505402190176765ebaeaa0da9237782edb2055157bcbf005fa75a3c5649d5` |

```bash
# STEP 0. Пути, PHP, каталоги вне webroot
cd /home/xk589064/rubizh.shop && ls -d www pim && /usr/local/php82/bin/php -v | head -1
mkdir -p /home/xk589064/rubizh-private-backups /home/xk589064/.pim-deploy-backups/input && chmod 700 /home/xk589064/rubizh-private-backups /home/xk589064/.pim-deploy-backups

# STEP 3–4. Свежий backup БД SITE вне webroot + проверка (пароль берётся из конфига и не печатается)
B=/home/xk589064/rubizh-private-backups/site-before-final-$(date -u +%Y%m%d-%H%M%S).sql.gz
/usr/local/php82/bin/php -r '$c=require "www/api/config.php";$f=tempnam("/tmp","my");chmod($f,0600);file_put_contents($f,"[client]\nuser=".$c["db_user"]."\npassword=".$c["db_pass"]."\nhost=".$c["db_host"]."\n");echo $f," ",$c["db_name"];' > /tmp/.rubizh-my
read MYCNF DBNAME < /tmp/.rubizh-my; rm -f /tmp/.rubizh-my
mysqldump --defaults-extra-file="$MYCNF" --single-transaction --routines --triggers "$DBNAME" | gzip > "$B"; rm -f "$MYCNF"
test -s "$B" && gzip -t "$B" && zcat "$B" | tail -1 | grep -q "Dump completed" && sha256sum "$B" | tee "$B.sha256"
#   STOP, если любая проверка не прошла.

# STEP 5–6. PIM (в браузере владельца): BACKUP → «Скачать полную копию» → файл в /home/xk589064/.pim-deploy-backups/input/
#   проверить: файл открывается (gzip -t / python3 -m json.tool), sha256sum записан.
P=/home/xk589064/.pim-deploy-backups/input/<ПОЛНЫЙ_BACKUP>.json.gz; gzip -t "$P" && sha256sum "$P" | tee "$P.sha256"

# STEP 7. Откат подготовлен заранее (см. «Откат» ниже); записать пути $B, $P и вывод установщиков.

# STEP 8–10. SITE: закреплённый установщик → архив по SHA → файлы → аддитивная миграция → LOST_* (STOP при LOST_* ≠ 0)
curl -fsSL -o /tmp/install-pim-v3.sh https://raw.githubusercontent.com/alexalixmanov-del/rubizh/47848fdb00dd61332eb164cafc7b6ef264253730/dev/install-pim-v3.sh
echo '753a01dbfbf7c8a928d921d4819a42945c05cb53f1c53158363b7999c9f6d6a8  /tmp/install-pim-v3.sh' | sha256sum -c -
bash /tmp/install-pim-v3.sh /home/xk589064/rubizh.shop/www "$B" "$(cut -d' ' -f1 "$B.sha256")"
#   установщик сам выполняет защищённую миграцию заказов (P0) по тому же backup, затем runtime и схему v3.
#   ожидается: все LOST_* OK, smoke 200; сохранить строку «Rollback command: …»
#   CRM (staff API) — отдельная процедура docs/CRM-MIGRATIONS.md, в этот rollout не входит; витрина от неё не зависит.

# STEP 11–14. PIM: архив по SHA → установка (прежние файлы и data backup сохраняются вне webroot)
mkdir -p /home/xk589064/.pim-release && cd /home/xk589064/.pim-release
curl -fsSL -o pim.zip https://raw.githubusercontent.com/alexalixmanov-del/pim.rubizh/21198461f8ebb2eadef6dcd6fb77a50a8a038ea9/releases/pim-10.9.3/rubizh-pim-10.9.3-final-workflow.zip
echo '060505402190176765ebaeaa0da9237782edb2055157bcbf005fa75a3c5649d5  pim.zip' | sha256sum -c -
unzip -o -q pim.zip tools/install-production.py
python3 tools/install-production.py install --archive pim.zip --target /home/xk589064/rubizh.shop/pim \
  --data-backup "$P" --backup-root /home/xk589064/.pim-deploy-backups
#   браузер: migration preview → «Повна копія файлом + застосувати» (safety backup обязателен)

# STEP 15. PIM «НА САЙТ» → «Проверить правила цен» → «Применить»: 30 / 25 / 20, пол 15%. AUTOPRICES остаются OFF.

# STEP 16–18. PIM: BACKUP → «Предпросмотр сброса» → ввести «СБРОСИТЬ КАТАЛОГ» → сохранить предложенный файл копии →
#   «Сбросить каталог». Проверить: товаров 0, SKU 0, очередь 0; 143 категории, поставщики, правила, цены — на месте.

# STEP 19–22. PIM: ИМПОРТ — СВЕЖИЕ файлы M-WIN, Tactical Belt, UKR-TEC, Киборг, Армолайн (по одному: preview →
#   при желании «Предпросмотр цен (CSV)» = AUTOPRICES PREVIEW, ничего не пишет → «применить»).
#   Проверить гейты в отчёте импорта/НА САЙТ: дубли SKU 0, fake SKU 0, Cartesian 0, привязки без источника 0. STOP при нарушении.
#   MODERATION > 0 — нормально; неоднозначные товары не одобрять массово.

# STEP 23–26. SITE: план сброса каталога → проверить → применить (требует проверенный backup $B)
cd /home/xk589064/rubizh.shop/www
/usr/local/php82/bin/php dev/pim-v3-catalog-reset.php --plan --out=/home/xk589064/rubizh-private-backups/catalog-reset-plan.json
/usr/local/php82/bin/php dev/pim-v3-catalog-reset.php --apply --plan-file=/home/xk589064/rubizh-private-backups/catalog-reset-plan.json \
  --plan-sha256=<plan_sha256 из плана> --backup-file="$B" --backup-sha256="$(cut -d' ' -f1 "$B.sha256")"
#   ожидается: products 0, variants 0, legacy 0

# STEP 27–28. SITE: включить приём contract 3 ТОЛЬКО guarded-командой (одна настройка, backup конфига вне webroot)
/usr/local/php82/bin/php dev/pim-v3-enable.php --plan
/usr/local/php82/bin/php dev/pim-v3-enable.php --apply --expect-sha256=<config_sha256 из --plan>
sleep 3   # OPcache перечитывает config.php раз в ~2 с
curl -s -H "Authorization: Bearer $(/usr/local/php82/bin/php -r '$c=require "api/config.php";echo $c["pim_key"]??"";')" https://rubizh.shop/api/pim/status | grep -o '"contract_version":3'

# STEP 29–32. PIM «НА САЙТ» → «Отправить на сайт» (одна публикация READY, пакеты по 100, каждый — ACK COMMITTED;
#   при обрыве — нажать ещё раз: повтор возвращает сохранённый ACK, дублей нет).
#   Проверить: SITE_MODELS == WIRE_MODELS, SITE_SKU == WIRE_SKU, legacy 0, URL -N 0:
/usr/local/php82/bin/php dev/catalog-inventory.php | head -c 600

# STEP 33. Smoke (390 и 1440 px): главная, каталог, категории, поиск, фильтры, сортировка, товар (цвет → галерея →
#   размер → SKU → цена → наличие), корзина, checkout без реальной оплаты; JS errors 0, битых ассетов 0, overflow 0.
```

### Стоп

Backup невалиден / SHA не совпал · ошибка миграции · LOST_* ≠ 0 · счётчики сброса не те · fake SKU / дубли SKU /
Cartesian > 0 · нарушение источника · контракт не прошёл валидацию · публикация без COMMITTED · SITE ≠ wire ·
регрессия checkout/оплаты · сайт недоступен · критическая JS/серверная ошибка → не продолжать, оценить откат.

### Откат

- SITE файлы: команда «Rollback command: …» из STEP 8–10 (`dev/rollback-update.sh`).
- SITE приём v3: `php dev/pim-v3-enable.php --plan --disable` → `--apply --disable --expect-sha256=…`
  (или вернуть сохранённый `config.php.*.bak`).
- SITE БД: восстановить `$B` (схема аддитивная — прежний код работает и на мигрированной БД).
- PIM файлы: `python3 /home/xk589064/.pim-deploy-backups/<BACKUP_PATH>/install-production.py rollback --backup /home/xk589064/.pim-deploy-backups/<BACKUP_PATH>`.
- PIM данные: файл копии из STEP 16–18 (BACKUP → восстановление / `release-recovery.html`), либо `$P`.
- После отката AUTOPRICES остаются OFF.

### Внешние фото — проверка из сети с доступом к хостам поставщиков

```bash
git clone https://github.com/alexalixmanov-del/pim.rubizh && cd pim.rubizh && git checkout 21198461f8ebb2eadef6dcd6fb77a50a8a038ea9
node audit/image-preflight.mjs <wire.json из «НА САЙТ» → экспорт> image-preflight.json 16 10000
```
