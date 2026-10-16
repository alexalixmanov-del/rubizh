# RUBIZH — документация для разработчиков

Интернет-магазин тактического снаряжения **РУБІЖ** (`rubizh.shop`). Этот файл — точка входа: что где лежит, в каком порядке читать, как поднять стенд и запустить тесты, какие правила действуют. Корневой `README.md` — историческая страница архивов для владельца; актуальный релиз — RC1 (`docs/release/`).

## Система

| Часть | Репозиторий | Что делает | Режим в этой работе |
|---|---|---|---|
| **SITE** (этот репозиторий) | github.com/lieverifying/rubizh | витрина, корзина, оформление, оплата (MonoPay), доставка (Нова пошта), кабинет покупателя, домен заказов, Staff API для CRM | разработка — только через ветки и PR |
| **PIM** | github.com/alexalixmanov-del/pim.rubizh | каталог, поставщики, цены; публикует каталог в SITE (контракт 3) | **только чтение** |
| **CRM frontend** | github.com/alexalixmanov-del/crm.rubizh (ветка `hardening/stage-5`, закреплён `dd91d2b` в CI) | SPA для персонала поверх Staff API SITE (`/crm/`); документация — [`docs/crm/`](crm/) (00…08, 16) | этап 4: разработка в ветке этапа; CI SITE закрепляет SHA `57e9ef4` |

Технологии SITE: plain PHP 8.2+ без фреймворка и Composer, PDO MySQL/MariaDB, Apache + `.htaccess`; фронтенд — `index.html` с шаблонами + `assets/*.js` (React 18, без сборщика, версия в имени файла). Тесты — Node `node:test` + Playwright.

## Где что лежит

| Путь | Содержимое |
|---|---|
| `storefront.php`, `index.html`, `assets/` | SEO-оболочка и витрина (SPA) |
| `shop/` | корзина, оформление, цены, оплата (`mono-*`), НП (`np-*`), резервы, PIM v3 (`pim-v3-*`), воркеры |
| `api/` | `/api/*`: синхронизация PIM, health, Staff API (`api/staff/index.php`) |
| `auth/` | вход покупателя (email, SMS, Google), кабинет |
| `staff/` | домен CRM: авторизация персонала, права, операции, возвраты, отчёты, схема |
| `dev/` | CLI-инструменты: миграции, пакет релиза, выкладка/откат, сверки (закрыты от HTTP) |
| `contracts/pim-v3/` | закреплённые схемы контракта PIM → SITE |
| `tests/` | регрессия (`*.test.mjs`), хелперы фикстур (`tests/helpers/`), QA-инструменты (`tests/.staging/`) |
| `docs/release/` | **RC1**: манифест, контракты, конфигурация, go-live, известные проблемы, блокеры запуска, changelog |
| `docs/release-hardening/` | история hardening: реестр дефектов (03), план (04), готовность (08), checkpoint этапов, handoff |
| `docs/*.md` (прочие) | отчёты и runbook прежних выпусков (история; действующая процедура — `docs/release/GO_LIVE_CHECKLIST.md`) |
| `downloads/` | архивы выпусков (не входят в пакет хостинга) |

## Порядок чтения

1. `docs/release-hardening/SESSION_HANDOFF.md` — где остановились, правила.
2. `docs/release-hardening/STAGE_CHECKPOINT.md` — результаты этапов и Quality Gate.
3. `docs/release/RC1_MANIFEST.md` → `PRE_LAUNCH_BLOCKERS.md` → `KNOWN_ISSUES.md`.
4. `docs/release/CONTRACTS.md` и `docs/release/CONFIG.md` — интерфейсы и настройки по коду.
5. `docs/release-hardening/03-DEFECT_REGISTER.md` (реестр) и `04-ECC_IMPLEMENTATION_PLAN.md` (единый план, только EXTEND).
6. `docs/release/GO_LIVE_CHECKLIST.md` — выкладка и откат.

## Стенд и тесты

Тесты поднимают изолированные копии SITE на отдельных схемах MariaDB через Unix-сокет, без сети и без настоящих провайдеров (моки MonoPay/НП/SMS).

### Linux (как CI, `.github/workflows/ci.yml`)

```bash
# PHP 8.2/8.3 с pdo_mysql mbstring gd curl openssl fileinfo intl zip sodium; MariaDB 11.4 с сокетом; Node 22; Python 3
npm ci
git clone https://github.com/alexalixmanov-del/crm.rubizh ../crm && (cd ../crm && git checkout dd91d2b8a28b87e2dd49944d14988b957520a69c && npm ci --ignore-scripts && npm run build)
npx playwright install --with-deps chromium firefox webkit   # Firefox/WebKit — матрица CRM/SITE этапа 4
export CHROMIUM_PATH="$(find ~/.cache/ms-playwright -path '*chrome-linux*/chrome' -type f | head -1)"   # CI: symlink в /usr/bin/chromium
sudo mkdir -p /workspace/php-runtime/root/usr/bin /workspace/reports && sudo chown "$(id -u):$(id -g)" /workspace/reports
sudo install -m755 tests/helpers/php-runtime-shim.sh /workspace/php-runtime/root/usr/bin/php8.4
# MariaDB: пользователь root без пароля, только через локальный сокет (как MARIADB_ALLOW_EMPTY_ROOT_PASSWORD в CI) — только для тестового сервера
export RUBIZH_TEST_MYSQL_SOCKET=/run/mysqld/mysqld.sock RUBIZH_CRM_DIR=$PWD/../crm RUBIZH_TEST_REPORTS=/workspace/reports
node --test --test-reporter=tap --test-concurrency=1 tests/*.test.mjs   # ожидается fail 0, skipped 0
```
Тест обновления/отката `tests/rc1-upgrade-rollback.test.mjs` требует полной истории Git (`fetch-depth: 0`) и клиентов `mysqldump`/`mysql` (или `mariadb-dump`/`mariadb`).

### macOS (Homebrew)

```bash
brew install php@8.2 mariadb@11.4 findutils coreutils bash
W=$TMPDIR/rz; mkdir -p $W/rt/usr/bin /tmp/rzdb $W/reports
export PATH=$W/rt/usr/bin:/opt/homebrew/opt/coreutils/libexec/gnubin:/opt/homebrew/opt/findutils/libexec/gnubin:/opt/homebrew/opt/mariadb@11.4/bin:$PATH   # mariadb@11.4 — keg-only
cp tests/.staging/macos-php-shim.sh $W/rt/usr/bin/php8.4 && chmod +x $W/rt/usr/bin/php8.4
mariadb-install-db --no-defaults --datadir=$W/db --auth-root-authentication-method=normal
mariadbd --no-defaults --datadir=$W/db --socket=/tmp/rzdb/mysqld.sock --skip-networking --innodb-snapshot-isolation=OFF &
npm ci && npx playwright install chromium firefox webkit
# CRM frontend: как в Linux, в $W/crm
export RUBIZH_PHP_RUNTIME=$W/rt/usr RUBIZH_TEST_MYSQL_SOCKET=/tmp/rzdb/mysqld.sock RUBIZH_TEST_REPORTS=$W/reports RUBIZH_CRM_DIR=$W/crm PHP_PATH=$W/rt/usr/bin/php8.4
export CHROMIUM_PATH="$HOME/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
node --test --test-reporter=tap --test-concurrency=1 tests/*.test.mjs
```

Обоснованные отличия macOS от Linux (на Linux CI все зелёные, `skipped 0`):
- **skip (3):** `Scheduler runs each worker once…` (нужен `flock`), `Deployment preserves private configs…`, `Small patch without api files…` (скрипты выкладки рассчитаны на GNU/Linux хостинга; проверяются в CI).
- **Homebrew PHP со встроенным curl (2 теста):** `Database availability matches buy buttons…` проходит с `RZ_DISABLE_CURL=1`; `stage-2 SEC-01: public media health…` подменяет `curl_*` в PHP без расширения curl — на macOS не воспроизводим, проверяется в CI.
- Параллельная нагрузка (другие тесты или браузеры одновременно) даёт таймауты браузерных тестов — запускать `--test-concurrency=1` и не параллельно с другими DB/browser-прогонами.

### Браузерная матрица, axe, Lighthouse

`tests/.staging/qa-matrix.mjs` (Chromium/Firefox/WebKit × 360/390/430/768/1024/1280/1440), `qa-cabinet.mjs`, `qa-addendum.mjs`, `qa-audit.mjs` (axe + Lighthouse; инструменты ставить в отдельную папку). Команды — `docs/release-hardening/SESSION_HANDOFF.md` и `05-BROWSER_QA_MATRIX.md`.

### Пакет релиза

`python3 dev/package-release.py out.zip` — детерминированный архив tracked-файлов без тестов, документов и dot-файлов (кроме `.htaccess`); печатает SHA-256. Проверки — `tests/release-archive-safety.test.mjs`.

## Правила (обязательны)

1. **PIM — только чтение; CRM — только в ветке этапа** (`hardening/stage-4-crm`, push без --force по разрешению владельца). В PIM никаких коммитов и push; изменения — только как предложения (`docs/release-hardening/stage-2/proposals/`) после решения владельца.
2. **Production не трогать:** никаких запросов к `rubizh.shop`, выкладок, миграций, PIM sync, AUTOPRICES, сброса каталога, реальных платежей/ТТН/SMS — только по отдельному решению владельца и по `docs/release/GO_LIVE_CHECKLIST.md`.
3. **Regression-first:** любой дефект — сначала тест, который падает на текущем коде (RED), затем исправление (GREEN), затем независимое ревью тем, кто исправление не делал.
4. **Новая функциональность и финансовые правила** — только по явному решению владельца.
5. **Git:** без force push, rebase опубликованных веток, merge в `main` и удаления веток/ассетов без разрешения владельца; теги этапов — только при зелёном Quality Gate и CI на точном SHA.
6. **Публичный репозиторий:** не публиковать секреты, персональные данные, дампы и **детали неисправленных уязвимостей** (в отчётах — только ID и severity). Полные доказательства — приватно, вне Git.
7. Единый план — `docs/release-hardening/04-ECC_IMPLEMENTATION_PLAN.md` (только EXTEND); единый реестр — `03-DEFECT_REGISTER.md`.
