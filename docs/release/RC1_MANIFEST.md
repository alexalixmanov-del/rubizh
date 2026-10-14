# RC1 MANIFEST — стабильный release candidate 1

Глобальный этап 3. Дата: 2026-10-14. Ветка `release/rc1` от `rubizh-stage-2-verified`. Теги этапа: `rubizh-rc1` и `rubizh-stage-3-verified` — на одном checkpoint-коммите (SHA и CI — в `docs/release-hardening/STAGE_CHECKPOINT.md`, раздел «Глобальный этап 3», и в аннотации тегов). Production **NO-GO** до закрытия [PRE_LAUNCH_BLOCKERS](PRE_LAUNCH_BLOCKERS.md).

## 1. Состав (точные SHA)

| Компонент | Репозиторий | Ветка / тег | SHA | Режим |
|---|---|---|---|---|
| SITE — код RC1 | github.com/lieverifying/rubizh | `release/rc1` | `24e27c41fd42dea736515308ce0b31412c2be64b` | код приложения и пакет; после него — только `tests/`, `docs/` и архив в `downloads/` |
| SITE — база | то же | `rubizh-stage-2-verified` | `6311e40081a8c17d8981c5de454364d580fba718` | этап 2 |
| PIM | github.com/alexalixmanov-del/pim.rubizh | `fix/pimc-p1` | `5fd46cb6fcd32fe628e8ccd0c9ebe4f4c998b055` (база `21198461`, единственное изменение — PIMC-P1/R7) | только чтение |
| CRM frontend | github.com/lieverifying/crm.rubizh (ветка `work`); CI SITE берёт тот же SHA из `alexalixmanov-del/crm.rubizh` (`.github/workflows/ci.yml`) | `work` | `b0e2f9359a05ec835a83d64bb9bcdc2c97487a50` | только чтение; собирается Vite в `dist/`, обслуживается SITE по `/crm/` |

Изменения в этапе 3 (относительно `6311e40`): `847d4c0` (пакет релиза и веб-доступ к служебным путям — дефект, найденный проверкой 4.5, regression-first), `24e27c4` (тест обновления/отката 4.4), `92c827e` (тест: окно между заменой кода и миграциями). После `24e27c4` меняются только `tests/` и `docs/` — содержимое пакета идентично. Новой функциональности нет.

## 2. Пакет релиза (4.5)

| Поле | Значение |
|---|---|
| Сборка | `git checkout 24e27c41fd42dea736515308ce0b31412c2be64b && python3 dev/package-release.py Rubizh-rc1.zip` |
| Файл в репозитории | `downloads/Rubizh-rc1.zip` + `.sha256` (добавлены checkpoint-коммитом; `downloads/` в пакет не входит) |
| SHA-256 | `7a63d9eb8fd93c0d19c3b6b20dd5340a7549b1bd7b4c976cdae2fbe59abec516` |
| Размер / файлов | 10 121 429 байт / 430 файлов + `rubizh/RELEASE-MANIFEST.json` (commit `24e27c4`, SHA-256 каждого файла) |
| Воспроизводимость | две независимые сборки байт-в-байт идентичны (фиксированные дата/права в zip, сортировка, только tracked-файлы) |
| Не входит | `tests/`, `docs/`, `downloads/`, `preview/`, `.github/`, `.gitignore`, `*.md`, `*.mjs`, `package*.json`, приватные конфиги (`api/config.php`, `auth/config.php`, `api/*-private.php`, `api/site-settings.json`), `PIM-V3-GAP-MATRIX.json` |
| Dot-файлы | только `.htaccess` (обязательны для Apache) |
| Веб-доступ | `dev/`, `contracts/`, `cache/`, `RELEASE-MANIFEST.json`, `*.sql`, `*.tmp`, dot-файлы → 403 (проверено на Apache 2.4 и тестом `tests/release-archive-safety.test.mjs`) |
| Скрипты | установка `dev/deploy-update.sh <SITE_ROOT> <ARCHIVE> <SHA256>`; откат `dev/rollback-update.sh <BACKUP_DIR> <SITE_ROOT>` — реально выполнены на изолированной копии в `tests/rc1-upgrade-rollback.test.mjs` |

`dev/install-pim-v3.sh` для RC1 **не используется**: он закреплён на историческом архиве `6616e42` и намеренно отклоняет любой другой артефакт. Процедура RC1 — [GO_LIVE_CHECKLIST](GO_LIVE_CHECKLIST.md).

## 3. Окружение, на котором проверено

| | CI (Linux) | Локально (macOS) | Production (хостинг) |
|---|---|---|---|
| ОС | ubuntu-24.04 | macOS (Darwin 25) | Linux, ukraine.com.ua (adm.tools) |
| PHP | 8.2 и 8.3 (`shivammathur/setup-php`) | 8.2.34 (Homebrew) | `/usr/local/php82` по runbook — **версию подтвердить** (PL-4.8) |
| СУБД | MariaDB 11.4 (service) | MariaDB 11.4.13 | MySQL/MariaDB хостинга — **подтвердить** (PL-4.8); staging-копия production 09.10 проверялась на MySQL 8.0 |
| Node (только тесты и сборка CRM) | 22 | 24.21 | не используется |
| Python (сборка пакета) | 3.12 | 3.9.6 | 3.x (для PIM-установщика) |
| Браузеры тестов | Playwright 1.62.1 Chromium | Playwright 1.62.1: Chromium 1234, Firefox 1538, WebKit 2336 | — |

PHP-расширения: `pdo_mysql, mbstring, curl, openssl, gd, fileinfo` (+ `intl, zip, sodium` в CI). Apache 2.4 с `mod_rewrite` и `.htaccess`.

## 4. Схема БД

| Маркер (`meta`) | Значение после обновления до RC1 | Источник |
|---|---|---|
| `schema` | `4` (было `3` на production-версии; цены → `DECIMAL(14,2)`; выполняет `migrate()` при `prepare-runtime.php` или первом запросе новой версии) | `api/lib.php:7,105-106` |
| `rubizh_shop_schema` | `1` | `shop/store-lib.php` |
| `rubizh_np_schema` | `3` | `shop/np-fulfillment.php:5,17` |
| `runtime_schema` | `20261008-v1` | `dev/prepare-runtime.php` |
| `order_p0_schema` | `1` | `shop/order-p0-schema.php` |
| `pim_v3_schema` | `2` (приём v3 при этом **выключен**: `pim_v3_sync` не задан) | `shop/pim-v3-schema.php` |
| `crm_schema` | `1` | `staff/schema.php:3` |
| `canonical_taxonomy` | версия `shop/canonical-taxonomy.json` (`20261008-v2`) — уже есть на production | `shop/taxonomy-migration.php` |

Production-версия: 46 таблиц, 0 триггеров. После RC1: 72 таблицы (+26), 6 триггеров (append-only аудит заказов, внутренних заметок, аудит персонала). Все изменения аддитивные, кроме расширения типа цен (`int` → `DECIMAL(14,2)`): строки и значения исходных колонок не меняются, старый код работает на мигрированной схеме — доказано тестом 4.4.

## 5. Миграции — по порядку (как в GO_LIVE_CHECKLIST и в тесте 4.4)

| # | Команда | Что делает | Защита |
|---|---|---|---|
| 0 | `mysqldump --single-transaction --routines --triggers` | бэкап вне webroot + `sha256sum` | — |
| 1 | `php <пакет>/rubizh/dev/migrate-order-p0.php --plan --config=<SITE>/api/config.php` → `--apply --database=… --backup-file=… --backup-sha256=…` (из распакованного пакета **до** замены кода) | статусы резервов, `rubizh_order_audit` + 2 триггера | проверенный бэкап вне webroot, имя БД |
| 2 | `dev/deploy-update.sh <SITE_ROOT> Rubizh-rc1.zip <SHA256>` | замена кода; приватные конфиги/media/cache сохраняются; приватная копия для отката | SHA-256 архива, `php -l` до/после, авто-откат |
| 3 | `php dev/prepare-runtime.php` | runtime-схема, `schema`→4 (цены `DECIMAL(14,2)`), индекс лимитов | отказ при заказах без P0 |
| 4 | `php dev/migrate-pim-v3.php --site-config --plan` → `--apply --database … --backup-file … --backup-sha256 …` | аддитивная схема v3 (`pim_v3_schema`=2; требует `schema`=4 после шага 3); приём v3 не включается | бэкап, журнал |
| 5 | `php dev/migrate-crm.php --plan` → `--apply …` | таблицы CRM, права, триггеры | бэкап, имя БД |
| 6 | `php dev/migrate-np-recovery.php --plan` → `--apply …` | поля восстановления ТТН (R6) | бэкап |
| 7 | `php dev/reconcile-reservations.php --site-config --plan` → `--apply …` | R4: освобождение резервов отменённых/возвращённых/возвращённых деньгами заказов | бэкап |
| 8 | `php dev/backfill-crm-order-states.php --plan` → `--apply --plan-sha256 … …` | только безопасные пустые поля представления CRM; неоднозначные остаются помеченными | точный SHA плана, бэкап |
| 9 | `php dev/staff-user.php --email … --name … --role OWNER --reason …` (пароль через stdin) | первый владелец CRM | — |

Повторный запуск шагов 1, 3–8 ничего не меняет (тест 4.4: 71 сравнённая таблица, 0 изменений).

## 6. Зависимости

| Где | Пакет | Версия |
|---|---|---|
| SITE runtime (PHP) | сторонних PHP-библиотек нет (Composer не используется) | — |
| SITE frontend (вшито в `assets/`) | React / ReactDOM | 18.3.1 (`assets/react.5e73fabcd0d0.js`, `assets/react-dom.c5c970a9cf36.js`) |
| SITE dev/test | playwright, playwright-core | 1.62.1 (`package-lock.json`) |
| CRM frontend | react / react-dom | 19.1.1 |
| | @tanstack/react-query | 5.90.3 |
| | react-router-dom | 7.9.4 |
| | lucide-react | 0.468.0 |
| | @fontsource/inter | 5.2.6 |
| | vite / typescript / prettier / @vitejs/plugin-react | 7.1.7 / 5.9.3 / 3.6.2 / 5.0.4 |
| PIM | см. `pim.rubizh/package-lock.json` на `5fd46cb` (не менялся этапом 3) | — |

## 7. Production-версия (обновляемая) — 4.4

Точный SHA SITE на хостинге в репозитории не зафиксирован. Факты:
- Дамп production SITE от 2026-10-09 (`docs/PIM-V3-RELEASE-REPORT-20261009.md`): legacy-каталог (3103 товара, 8682 SKU), 348 категорий, канонические 137 (`canonical_taxonomy` применена), 3 заказа; v3/P0/CRM-схем нет.
- `origin/main` = `0e7dafa` — коммит, публикующий последний установщик исходников `dev/install-reclassification-v2.sh`; он ставит архив, лежащий в коммите `9788a9e` (`downloads/Rubizh-reclassification-v2-update.zip`, SHA-256 `11bb577e…`). Содержимое архива проверено: 337 файлов байт-в-байт совпадают с деревом `9788a9e` (2026-10-08).
- Кандидаты по закреплённым архивам, совместимые с дампом: `b442eb7` (архитектура каталога, 10-07), `b1662de` (баннеры/безопасность, 10-08), `9788a9e` (исходники/фото, 10-08). Наиболее вероятный — `9788a9e`.
- PIM на хостинге: публичный HTML 09.10 показывал **10.9.0**; релиз 10.9.3 подготовлен, но факт установки не подтверждён.

Обновление и откат отрепетированы для **всех трёх** кандидатов. Подтверждение фактической версии SITE и PIM — вопрос владельцу (BLOCKED(owner), [PL-4.6/4.7](PRE_LAUNCH_BLOCKERS.md#pl-4)), не блокирует GO этапа 3. Read-only способ проверки — [GO_LIVE_CHECKLIST](GO_LIVE_CHECKLIST.md) шаг 1.

## 8. Связанные документы

[CONTRACTS](CONTRACTS.md) · [CONFIG](CONFIG.md) · [GO_LIVE_CHECKLIST](GO_LIVE_CHECKLIST.md) · [KNOWN_ISSUES](KNOWN_ISSUES.md) · [CHANGELOG_RC1](CHANGELOG_RC1.md) · [PRE_LAUNCH_BLOCKERS](PRE_LAUNCH_BLOCKERS.md) · `docs/release-hardening/STAGE_CHECKPOINT.md` (Quality Gate этапа 3)
