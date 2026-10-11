# SESSION HANDOFF — RUBIZH SITE release hardening

Обновлено: 2026-10-11, сессия 2 (P2/P3, браузерная матрица, a11y/SEO/Lighthouse). Продолжать с этого документа.

## Репозитории и ветки

| | SITE | PIM (READ-ONLY) |
|---|---|---|
| Локально | `/Users/l/Projects/rubizh` | `/Users/l/Projects/pim.rubizh` |
| Рабочая ветка | `hardening/site-release-20261011` (push в origin) | `claude/amazing-meitner-e6572n`, `2119846`, не изменялся |
| База ветки | `59b46857ea7c58c95212c94a0674d3ed1f934d7a` | — |
| Последний коммит | см. `git log -1` (коммит «Release hardening: docs, handoff…» поверх `77d3a8f`) | — |

Merge в main не выполнялся. Production, CRM, PIM не изменялись.

## Frozen rules (действуют)

PIM — только чтение; CRM не менять и не разворачивать; PIM→SITE sync OFF; AUTOPRICES OFF; никаких reset/импортов каталога; v3 на production не включать; не публиковать каталог; не менять реальные суммы/остатки/заказы/оплаты; никаких production migrations, destructive SQL, deploy — только после явного подтверждения владельца; без секретов/PII; без force push/hard reset/переписывания истории. COD полностью запрещён (решение владельца 2026-10-11). Реальные платежи и ТТН — запрещены.

## Выполнено (коммиты на ветке)

1. `366d8ff` тесты переносимы: `RUBIZH_PHP_RUNTIME`, `CHROMIUM_PATH`, `RUBIZH_TEST_REPORTS`, `RUBIZH_CRM_DIR` (дефолты CI прежние).
2. `d3804ae` COD удалён (сервер/клиент/NP/конфиг; дефолт оплаты больше не `cod`); D-03 потерянный вебхук MonoPay; D-04 `INVOICE_OPEN`.
3. `bf66500` D-13 `invoice/remove` перед повторным счётом.
4. `2f04aac` D-25 legacy «під замовлення» → подтверждение менеджером → счёт.
5. `4c4c299` P0 галерея цвета (D-01, D-05, D-17), кеш `product-v2-`.
6. `cc0473a` D-10 ТТН в кабинете.
7. `793cc70` D-06/D-07 недавно просмотренные; D-08 мобильные карусели категорий.
8. `77d3a8f` D-26 мобильная кнопка «Оберіть розмір».
9. Финальный коммит: документы `docs/release-hardening/*`, QA-инструменты `tests/.staging/qa-matrix.mjs`, `qa-cabinet.mjs`, `macos-php-shim.sh`.
10. Сессия 2 (коммит после `fcc73e9`): D-14, D-18, D-20, D-21 (legacy + v3), D-27, D-28, D-29…D-33 — regression-first; D-24 NO-DEFECT; D-11 → Q-8; D-22 → Q-9 (удаление файлов заблокировано классификатором, нужно разрешение). Документы 05 и 07. QA-инструменты `qa-fixture.mjs` (общий стенд) и `qa-audit.mjs` (кнопки, axe, Lighthouse).


Полный реестр: `03-DEFECT_REGISTER.md`. План: `04-ECC_IMPLEMENTATION_PLAN.md`. Интеграции: `06-INTEGRATION_AUDIT.md`.

Новые версии ассетов (подключены в `index.html`): `shop-client.2026101101.js`, `pim-v3-product.2026101101.js`, `site-qa.2026101101.{js,css}`, `recently-viewed.2026101101.css`, `category-carousel.2026101101.css`. Старые версии не удалены.

## Тесты

Сессия 2: `tests/seo-hardening.test.mjs`, `tests/a11y-hardening.test.mjs`, тесты D-18/D-20 в `release-hardening`, D-14 в `pim-v3-sync`, D-21 в `pim-v3-browser` и `color-gallery`.

Добавлены (сессия 1): `tests/release-hardening.test.mjs` (COD ×3, D-03, D-04, D-13, D-25, D-10), `tests/color-gallery.test.mjs` (PHP + desktop + mobile), `tests/ui-hardening.test.mjs` (recently viewed ×2, карусель 360/390/430, desktop). Изменены осознанно (новые требования владельца): `storefront.test.mjs` (COD никогда не показывается), `category-directory.test.mjs` (карусель вместо 4/стр).

Regression-first: каждый новый тест сначала красный на старом коде (для галереи/UI — проверено в worktree `59b4685`).

Последний полный локальный прогон (MariaDB 11.4, PHP 8.2, macOS): **281 тест, 276 pass, 5 fail** — все 5 падают так же на чистом `59b4685` и являются окружением macOS (в CI зелёные):
- `Database availability…` — тест переопределяет `curl_init`; проходит с `RZ_DISABLE_CURL=1` (shim) на старом и новом коде.
- `Scheduler runs each worker once…`, `Deployment preserves…`, `Small patch…` — Linux-скрипты (`flock`/`find -printf`/bash 4).
- `fixture migration rehearsal` (CRM) — локально не воспроизводится, вне scope.

Браузерный QA:
- Кабинет (`qa-cabinet`): Chromium/WebKit/Firefox × 360/390/768/1280 — 12/12 OK: свой список, чужой заказ 404 (IDOR нет), отменённая ТТН скрыта, без overflow.
- Матрица витрины (`qa-matrix`): 540/540 загрузок без ошибок/overflow, покупка до заказа 9/9 в 3 движках — см. `05-BROWSER_QA_MATRIX.md`.
- Аудит (`qa-audit`): axe 4 serious → исправлены; Lighthouse SEO 100, a11y 98–100 — см. `07-SECURITY_PERFORMANCE_REVIEW.md`.
- CI GitHub: `fcc73e9` — success; после нового push проверить снова.

## Сессия 2, продолжение (ADDENDUM №2 и checkpoint)

- Push `3326514` выполнен по разрешению, CI success. Дальнейшие коммиты (`7b4aa86` … `98ef261` и checkpoint) **не отправлены** — новое правило: push только с явного разрешения.
- ADDENDUM №2: этапы 1–6 (фазы 2–7) реализованы regression-first; сверка — `04` (A-*, K-*, C-*, P-*, S-*).
- Независимый ECC code review: P0/P1 нет; RV-1…RV-4 исправлены. Gate на `98ef261` зелёный, кроме CI → `STAGE_CHECKPOINT.md`: **INCOMPLETE**, тегов `verified` нет.
- Документы: `08-RELEASE_READINESS.md` (NO-GO для production, блокеры B-1…B-5), `09-ASSET_INVENTORY.md` (Q-9), `10-KIT_RULES_PROPOSAL.md` (Q-8), `11-BANNER_PROMPTS.md` (D-09).
- Следующее по решениям владельца: Q-6 (SMS), Q-7 (прямая MonoPay при подтверждённом наличии), Q-5 (step-up/RBAC/аудит), Q-4 (v3 под заказ) — каждый этапом с checkpoint; ждут разрешения/решения владельца по CI-push и этапам.
- Новые QA-инструменты: `tests/.staging/qa-addendum.mjs` (экраны ADDENDUM), `qa-audit.mjs` (Lighthouse с жёстким таймаутом).

## Сессия 2, продолжение (интеграции и Q-6)

- Checkpoint ADDENDUM: тег `rubizh-addendum2-phases2-7-verified` → `bbc989a` (CI success), локальный, не отправлен.
- Ключи провайдеров: `~/Projects/rubizh-test-secrets/` (вне Git). monobank — sandbox (тестовый мерчант), НП и TurboSMS — реальные аккаунты, только readonly. Запуск: `run-testing.sh <provider> -- node tests/.staging/qa-connectivity.mjs` и `qa-provider-sandbox.mjs`. Подробно — `INTEGRATION_TEST_READINESS.md`.
- Q-6 (SMS) реализован и прошёл локальный gate; **INCOMPLETE** до CI (push по разрешению). Q-7 → Q-5 → Q-4 — после решения владельца.

## Не начато / в работе

- Ждёт владельца: Q-4…Q-9 (03), файлы баннеров D-09/D-23, **дополнительное ТЗ** (главная, конструктор комплектов, каталог, кабинет 2.0, Instagram/TikTok) — сопоставить с 04, добавить только новое.
- Не начато: D-34 (шапка/поиск — вместе с ТЗ главной), `08-RELEASE_READINESS.md`, финальный `/ecc:code-review`.
- Не объявлять проект завершённым до обработки дополнительного ТЗ.

## Требует дополнительной проверки

- Доля legacy-товаров, у которых цвета получат placeholder: зависит от реальных `variants.data.photos` в production — нужен read-only запрос на копии БД (не на production без разрешения).
- MonoPay/НП — только mock; live не проверялись.
- Версия MariaDB на хостинге (риск R-1).
- Кеш `product-*` на production: новые ключи `product-v2-*`, старые истекут сами.

## Локальное окружение (без секретов)

- Homebrew: `php@8.2`, `mariadb@11.4` (+`mariadb` 13, не используется), `findutils`. Playwright браузеры в `~/Library/Caches/ms-playwright`.
- Тестовая MariaDB 11.4: `--no-defaults --skip-networking`, сокет `/tmp/rzdb/mysqld.sock`, данные в scratchpad сессии (временные; при новой сессии создать заново). Пароль root пустой, только локальный сокет, только fixture-схемы.
- CRM frontend для тестов: клон `crm.rubizh@b0e2f93` в scratchpad, `npm run build` (CRM не изменялся).

## ECC выполнено

`/ecc:plan` (фазы A–C), параллельные read-only аудиты (`ecc:code-explorer`, `ecc:php-reviewer`, `ecc:security-reviewer`, `Explore`), regression-first реализация. **Не выполнено:** финальный `/ecc:code-review`.

## Как продолжить (новая сессия Claude Code)

```sh
cd ~/Projects/rubizh && git fetch origin && git switch hardening/site-release-20261011 && git pull --ff-only
claude --add-dir ../pim.rubizh
```

Первое сообщение: «Продолжи RUBIZH SITE release hardening по docs/release-hardening/SESSION_HANDOFF.md».

Восстановление стенда:

```sh
W=$TMPDIR/rz; mkdir -p $W/rt/usr/bin /tmp/rzdb
cp tests/.staging/macos-php-shim.sh $W/rt/usr/bin/php8.4 && chmod +x $W/rt/usr/bin/php8.4
/opt/homebrew/opt/mariadb@11.4/bin/mariadb-install-db --no-defaults --datadir=$W/db --auth-root-authentication-method=normal
/opt/homebrew/opt/mariadb@11.4/bin/mariadbd --no-defaults --datadir=$W/db --socket=/tmp/rzdb/mysqld.sock --skip-networking --pid-file=/tmp/rzdb/mysqld.pid &
git clone https://github.com/alexalixmanov-del/crm.rubizh.git $W/crm && (cd $W/crm && git checkout b0e2f9359a05ec835a83d64bb9bcdc2c97487a50 && npm ci --ignore-scripts && npm run build)
export RUBIZH_PHP_RUNTIME=$W/rt/usr RUBIZH_TEST_MYSQL_SOCKET=/tmp/rzdb/mysqld.sock RUBIZH_TEST_REPORTS=$W/reports RUBIZH_CRM_DIR=$W/crm PHP_PATH=$W/rt/usr/bin/php8.4
export CHROMIUM_PATH="$HOME/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
export PATH=$W/rt/usr/bin:/opt/homebrew/opt/findutils/libexec/gnubin:/opt/homebrew/opt/mariadb@11.4/bin:$PATH
npm test
node tests/.staging/qa-matrix.mjs $W/qa && node tests/.staging/qa-cabinet.mjs $W/qa
# axe + Lighthouse: npm i axe-core@4.10.3 lighthouse@12.6.1 в отдельной папке $W/tools, затем
node tests/.staging/qa-audit.mjs $W/qa/audit $W/tools
```

## Порядок следующих действий

1. Проверить CI ветки на GitHub.
2. Перезапустить `qa-matrix`, заполнить `05-BROWSER_QA_MATRIX.md`, исправить найденное (regression-first).
3. Получить ответы Q-4…Q-7 и файлы для D-09.
4. P2/P3 из реестра.
5. 07 и 08 документы, финальный `/ecc:code-review`, повтор тестов, GO/NO-GO.
6. Deploy — только по отдельному подтверждению владельца.
