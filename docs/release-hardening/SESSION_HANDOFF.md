# SESSION HANDOFF — RUBIZH SITE release hardening

Обновлено: 2026-10-11 — **глобальный этап 1 (SITE) завершён**, checkpoint `rubizh-stage-1-verified` (локальный тег). Продолжать с этого документа. **К глобальному этапу 2 без указания владельца не переходить.**

## Глобальные этапы проекта (терминология владельца)

1 — завершение SITE (**VERIFIED**, проверенный код `3327862`, тег `rubizh-stage-1-verified` на checkpoint-коммите (`git rev-parse rubizh-stage-1-verified`)); 2 — независимый multi-agent аудит SITE + PIM; 3 — стабильный release candidate; 4 — завершение CRM; 5 — импорт пяти поставщиков; 6 — финальный E2E (живые проверки В-1…В-4 — DEFERRED сюда). Этапы 2–6 не начаты. Фазы 2–7 ADDENDUM №2 — отдельная закрытая работа (`rubizh-addendum2-phases2-7-verified`), не этапы 1–6.

## Итог глобального этапа 1 (2026-10-11)

- Q-6 (SMS), Q-7 (подтверждённое наличие → MonoPay, контракт webhook, идемпотентность — ключ на попытку оформления), Q-5 (RBAC, повторный вход ≤ 15 мин, обязательная версия заказа для возврата/сверки, аудит, CSRF), Q-4 (предзаказ v3 только после подтверждения менеджера) — DONE; SHA и CI — `08-RELEASE_READINESS.md`, `STAGE_CHECKPOINT.md`.
- Дефекты и ревью этапа: Q-4…Q-7, D-41, RV-10…RV-17, PERF-1 — `03-DEFECT_REGISTER.md`.
- Задачи следующих этапов: CRM-4.1 (показ спорных событий MonoPay), CRM-4.2 (обязательная версия в CRM-возврате), PERF-2.1 (~200 КБ JS первого экрана) — `04`.
- Новые тесты: `q4-v3-preorder`, `q5-manager-rbac`, `q7-payment-readiness`, `mono-webhook-contract`, `order-idempotency`, `idor-orders`, `sms-protection`.
- Инструменты (scratch, вне репозитория): `lh-prod.mjs` (Lighthouse за прокси brotli/gzip + кеш по .htaccess), `gate-sum.mjs`, `lh-sum.mjs`; QA-матрица: `QA_WIDTHS=360,390,430,768,1024,1280,1440 QA_FLOW_ALL=1 node tests/.staging/qa-matrix.mjs OUT`, `QA_FIREFOX=1 node tests/.staging/qa-addendum.mjs OUT`.
- Production: один разрешённый запрос заголовков `https://rubizh.shop/` — `content-encoding: br`, `cache-control: no-cache`, nginx. Больше обращений не было.

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
- ADDENDUM №2: фазы 2–7 реализованы regression-first (это не глобальные этапы проекта; закрыты тегом `rubizh-addendum2-phases2-7-verified`); сверка — `04` (A-*, K-*, C-*, P-*, S-*).
- Независимый ECC code review: P0/P1 нет; RV-1…RV-4 исправлены. Gate на `98ef261` зелёный; после push CI success на `bbc989a` → тег `rubizh-addendum2-phases2-7-verified`.
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


## Глобальный этап2 — cloud resume (2026-10-12)

SITE `/workspace/rubizh`, branch `hardening/stage-2-audit-fixes`; baseline `rubizh-stage-1-verified` →51c83d808228a26328081b02211b4e3605353755. Main не использовать/не менять. PIM `/workspace/pim.rubizh` exact21198461f8ebb2eadef6dcd6fb77a50a8a038ea9, CRM dependency `/workspace/onboarding/dependencies/crm.rubizh` exactb0e2f9359a05ec835a83d64bb9bcdc2c97487a50; их source read-only.

`source /workspace/onboarding/rubizh/environment.sh`; `bash /workspace/onboarding/rubizh/start.sh`. Helpers и signed Debian PHP8.4/MariaDB11.8 extraction вне checkout; Node24.19, Playwright1.62.1, Chromium/system плюс downloaded Firefox/WebKit. MariaDB fixture-only private Unix socket/noTCP, innodb_snapshot_isolation=OFF соответствует CI11.4. PHP extensions pdo_mysql/mbstring/curl/gd/fileinfo; root/no-password допустим только для этого fixture. Start проверяет SELECT1 и функциональный Node/PHP preview; running processes после snapshot restoration запускаются заново. Full tests: `node --test --test-reporter=tap --test-concurrency=1 tests/*.test.mjs`. Не запускать много DB/browser suites параллельно: под перегрузкой подтверждены hard20s fixture timeouts; serial retries не ослабляли assertions.

Browser external runners `/workspace/onboarding/qa-tools`, artifact folders `/workspace/onboarding/rubizh/reports/checkpoint-*`; Firefox требует разрешённый tool sandbox escalation из-за user-namespace/proc startup, WebKit `executablePath=/workspace/onboarding/browsers/webkit-2336/pw_run.sh` с verified local libs bridge. Cookies ослабляются только generated HTTP QA fixture. Не выдавать localhost links и не запускать live MonoPay/NP/SMS/SMTP. Approved api.github.com/cdn.playwright.dev/playwright.download.prss.microsoft.com реально проверены; прежний network BLOCKED снят только для выполненных операций.

Слепые исходные13 raw: stage-2/raw, единый регистр03, новые артефакты только stage-2/. Unresolved HIGH детали в ignored mode700 private/ и `/workspace/onboarding/stage2-private`; их не добавлять в index/PR/public reports. Full PIM HIGH patch private; public PIMC-P1 — notice. Другие proposals не применены. Поздние findings финального review корректированы/перепроверяются; точные статусы03/checkpoint имеют приоритет над историческими raw.

Cloud install_script/start_skill обновлены, повторно исполнены и saved в draft; публикация/новая-session restoration не выполнены. Runtime network state unknown не означает отсутствие доступа: наблюдались успешные GitHub API, browser download и git push. Repository declarations после doc checkpoint должны сохранить exactHEAD + реальные mounts, не устаревший main. Не менять network fields при сохранении scripts/repositories.

Следующий шаг только по итоговому STAGE_CHECKPOINT. Нельзя считать этот checkpoint разрешением на Stage3 build/packaging/deploy, PIM sync/AUTOPRICES или tag publication. GO-tag допускается лишь при выполненном Stage2 gate; сейчас unresolved owner/external пункты требуют NO-GO.

Tmpfs hygiene: tests retain fixture copies after stop(), and this long audit exhausted17GB /tmp. 941 positively identified inactive synthetic SITE dirs were removed after stopping failed overlapping runners; all DB schemas/reports preserved. Do not count the ENOSPC/contended runs as green. Optional /workspace/onboarding/rubizh/cleanup-fixtures.py dry run/--apply only considers old (>1h), marker-verified, inactive copies. Run final DB/browser suites serially with capacity checks; no arbitrary /tmp or DB deletion.

Финализация: codee9ce24dffb41751b8e08b13b4dff5a5c6056d203; prior code1fcca CI38304082586SUCCESS; schedulinge9 and exactfinal checkpoint CI results retained separately. Full browser matrix/axe/Lighthouse repeated after app corrections; bound independent payment/changes/QA approval. Общий Stage2 NO-GO: historical privacy requirement unmet and dynamic/runtime coverage limits explicit; new whole SECURITY source pass completed; Stage3 STOP. Doc-only checkpoint exactCI verified after push in final response/retained metadata. Full numeric reportstage-2/FINAL_REPORT, register03; сохранять private HIGH confidentiality.


**Ограничение приватности:** GitHub repository visibility проверено как public. Унаследованный commit2a338da содержит исходные HIGH raw; обычный push сохранил эти версии в истории. Текущие документы редактированы, новые полные доказательства остаются local/private, но обещать приватность исторических raw нельзя. История не переписывалась: force-push запрещён владельцем. QA-20 MEDIUM / OWNER DECISION фиксирует процессный дефект; cleanup требует отдельного решения и не отменяет уже случившуюся публикацию. Технические подробности неразрешённых HIGH здесь не повторяются.

Final endpoint Quality Gate:132inventory rows,1920HTTP requests;831/831explicit expectations,2697/2697overlapping semantic checks,975snapshots+2A↔B whole-domain comparisons;0final assertion failures. ANY232/232 and narrowaction36/36; all inventory endpoints requested, full state/role/token combinations remainPARTIAL. Details and limits:stage-2/endpoint-quality-gate.md. Fresh SECURITY source review COMPLETED(15checks+1probe), no newHIGH/CRITICAL; MEDIUM SEC-FRESH-01 unapplied CRM proposal. OverallNO-GO: exhaustive dynamic certification and historical privacy requirement unmet, noStage2verifiedtag/Stage3.
