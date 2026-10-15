# SESSION HANDOFF — RUBIZH SITE release hardening

> Актуальный checkpoint — глобальный этап 3 (RC1), приведён первым. Блоки этапа 2-B и ранее ниже — история.

<!-- STAGE4_PROGRESS_BEGIN -->

## Этап 4 — решения владельца и текущее состояние (обновлено 2026-10-15)

> После автосжатия контекста — сверяться с этим разделом. Ветки: SITE `hardening/stage-4-crm` (от `rubizh-stage-3-verified` = `6c0b15c`), CRM `~/Projects/crm.rubizh` `hardening/stage-4-crm` (от `b0e2f93`, push в remote `ci` = alexalixmanov-del/crm.rubizh, `origin` = lieverifying). PIM `5fd46cb` — только чтение (тесты PIM гонять на копии `git archive` во временном каталоге). Стенд: `source $SCRATCH/env.sh`; отладка `RUBIZH_CRM_DEBUG=1 RUBIZH_PRINT_SERVER_ERRORS=1`.

### Поправки владельца в этой сессии (обязательны)

| Поправка | Что значит | Где реализовано |
|---|---|---|
| Блок 4-SITE (D-50…D-54) до финального гейта | D-50 CSP страниц оплаты/настроек/НП; D-51 счёт ФОП: `invoice_grace_workdays` (по умолчанию 3 рабочих дня) звірки виписки после `payment_due`, приём оплаты по выписке OWNER/ACCOUNTANT; D-52 `direct_pay_max_qty` (по умолчанию 3 шт. на SKU) при наличии без количества, больше — подтверждение менеджера; D-53 тексты процесса оплаты; D-54 серверная заявка «Запит на прорахунок» (OPSEC, согласие, ЄДРПОУ/РНОКПП) | коммиты 6ead690, defee86, 16ddac6, 624e28c, d9c80eb (+CRM 6f0b63b); настройки — CONFIG §16 |
| Нумерация дефектов этапа после 4-SITE | D-55 карточка падала после «Створити відправлення»; D-56 частичный возврат в кабинете; D-57 отмена с открытым счётом; D-58 CLI сотрудников и восстановление 2FA; D-59 скорость списков на 50 000; D-60 фильтр сегмента; A5-01 остатки наложенного платежа; R4-01…R4-24 — независимое ревью и поправки владельца по правам (в формулировке владельца «D-50…D-63» — это D-50…D-60 + A5-01 + DEP-01 + R4-*) | `03-DEFECT_REGISTER.md`, раздел «Глобальный этап 4» |
| Логотип на фото первого экрана главной | НЕ менять — так задумано владельцем | не трогался |
| Финансы по ролям (§8 + поправки 2026-10-15) | Финансы — OWNER и ACCOUNTANT (ACCOUNTANT — просмотр/аналитика/экспорт). MANAGER — суммы заказа, ссылки на оплату, рахунки MonoPay; **без денег возврата, прибыли, сотрудников**. SUPPORT — **только «Разом» и статус оплаты** (оплачено/очікує/неуспішно/прострочено); не видит возвраты и суммы, прибыль/маржу/себестоимость, аналитику, реквизиты, события MonoPay, ссылки на оплату, финансовые действия. WAREHOUSE — комплектация/доставка/ТТН, **без сумм и статуса оплаты**; объявленная стоимость — только как поле формы ТТН | контракт: `order.amount.view` (OWNER, MANAGER, SUPPORT, ACCOUNTANT), `order.finance.view` (OWNER, MANAGER, ACCOUNTANT), `refund.view` (OWNER, ACCOUNTANT), `field_visibility` → таблица «Поля × роли» в `docs/crm/03-RBAC_MATRIX.md`; сервер `crmRedactOrder` и др.; тест `tests/crm-stage4-fields.test.mjs` (каждое поле × каждая роль) |
| Правило тестов | Если тест падает — по умолчанию неверен **код**, не тест. Ожидания менять только если они противоречат ТЗ; каждое такое изменение — в итоговый отчёт отдельной таблицей (тест, было/стало, пункт ТЗ, почему). Ослаблять тест под текущее поведение недопустимо | ниже — список изменённых тестов |
| Условия замеров производительности (поправка владельца) | Замеры при низком заряде ноутбука (троттлинг CPU) недействительны. Повторять при питании от сети и заряде > 30 %, 3 прогона, медиана; в итоговом отчёте указать питание, заряд, машину | перф 50k, Lighthouse — повторить при заряде > 30 % |
| Агенты ECC | разрешены по списку поручения; `ecc:database-reviewer` НЕ использовать (Postgres) | использованы code-reviewer, security-reviewer (2 прохода), payments-review |

### Фазы

| Фаза | Статус |
|---|---|
| 0–1 gap-анализ, документы 00–05 | DONE |
| 2–4 SITE, Staff API, адаптеры, cron | DONE |
| 5 фронтенд crm.rubizh | DONE (CSP без unsafe-inline, мобильные карточки, Lighthouse mobile 97–98 со сжатием) |
| 4-SITE D-50…D-54 | DONE |
| 6 тесты: 12 E2E, синтетика ≥500, 50 000 ≤0,5 с, матрица 3 движка × 7 ширин × 2 темы, axe 0, клавиатура, обновление поверх RC1 + 3 кандидатов | DONE (перф 50k перепроверяется после поправок поиска) |
| 7 независимое ревью + слепой повтор security/payments | DONE; R4-01…R4-24 исправлены (28eccec, CRM 1f9b108) |
| 8 Quality Gate: полная регрессия SITE + PIM (на копии), CI на точных SHA, push, теги, чекпоинт, итоговый отчёт | ОСТАЛОСЬ |

**В работе:** D-61 — запас скорости на 50 000 (индексы поиска, список клиентов); затем повтор замеров при заряде > 30 %. **Осталось:** полная регрессия SITE, PIM 684 на копии, обновить SHA CRM в `.github/workflows/ci.yml` (уже: Firefox/WebKit, таймаут 150 мин), push SITE (`origin`) и CRM (`ci`) без --force, CI зелёный, `STAGE_CHECKPOINT`, README (SHA CRM), `08-RELEASE_READINESS`, теги `rubizh-stage-4-verified` / `crm-stage-4-verified`, итоговый отчёт §14.

### Изменённые ранее существовавшие тесты (для таблицы итогового отчёта)

| Тест | Было → стало | Пункт ТЗ | Почему |
|---|---|---|---|
| `p0-unit` финансовые пресеты | LOGISTICS/READ_ONLY: `payment.view` → нет финансов; ACCOUNTANT добавлен | §8 | строже: склад и поддержка без финансов |
| `crm-security` sort | `sort=total;DROP…` 200 → 400 | §9, CRM-PHP-01 | строже: неизвестная сортировка отклоняется контрактом |
| `crm-security`, `stage2-r8-limits` | доказательство работы 16 → 18 бит | R8, ревью R4-01 | строже |
| `crm-domain`, `crm-security` суммы возвратов | 100 → 10000 и т. п. | A8 | эквивалентно: API в копейках |
| `crm-performance` | число SQL на страницу 8 → 13 | §9 | **ослабление границы**: +5 пакетных запросов данных этапа 4 (сроки, флаги, проверки строк, оплаты ФОП, открытые разборы) — константа на страницу, не зависит от размера; скорость отдельно ≤0,5 с на 50 000 |
| `stage2-r9-critical-gate` | роль проверяется до версии; LOGISTICS получает PERMISSION_DENIED на шагах не для склада; READ_ONLY хранится как SUPPORT | A7 (роль → версия), OD-4.2 | строже |
| `crm-shipping` | + SUPPORT 403 на посылки; WAREHOUSE не получает declared_value (сумма проверяется в БД) | §8 | строже |
| `crm-browser` | старый UI-тест заменён проверкой всех разделов × 5 ролей × 1440/390 × темы | §10 | старого UI нет; сценарий возврата перенесён в E2E 6 |
| `release-hardening` (COD) | упоминание полей наложенного платежа допускается **только** в охранной проверке, которая их отклоняет; наличие охраны проверяется | A5 | ослабление по букве ради требования A5 (проверка перед вызовом НП) |
| `rc1-upgrade-rollback` | добавлен базис RC1; перед входом в CRM — шаги C5/C7 чек-листа; столбцы статуса резерва R4 исключены из общего сравнения «без потерь» (сверяются точной таблицей R4); пароль из фикстуры (политика) | §12, R4 | столбцы R4 меняются по правилу и проверяются отдельной точной проверкой |
| `runtime-http` | + CSP всех HTML-страниц | D-50 | строже |
| E2E 1 (новый тест) | «Завершити» нажимается, только если доступно; проверяется итог «завершене» | §6 vs §10.1 | SITE RC1 (`np-fulfillment.php`) сам завершает оплаченный заказ v3 при доставке всех посылок; ручное «Завершити» — для остальных; OWNER DECISION OD-4.8 |
| `crm-stage4-review` R4-16 (новый) | ослабление под SUPPORT (declared_value) было сделано и **отменено** по поправке владельца | §8 | итог: строгая проверка |

<!-- STAGE4_PROGRESS_END -->

<!-- STAGE3_RC1_CHECKPOINT_BEGIN -->

## Глобальный этап 3 — стабильный RC1, checkpoint 2026-10-14

Статус: **GO этапа 3** (production — **NO-GO** до закрытия `docs/release/PRE_LAUNCH_BLOCKERS.md`, PL-1…PL-4). Ветка `release/rc1` от `rubizh-stage-2-verified`; PR #2 `release/rc1 → main` открыт **без merge**. Теги `rubizh-stage-3-verified` и `rubizh-rc1` — на одном doc-only checkpoint-коммите после SUCCESS его CI (SHA/CI коммита-checkpoint фиксируются в аннотации тегов и итоговом отчёте — свой SHA коммит содержать не может).

| Объект RC1 | SHA |
|---|---|
| SITE код приложения / пакет | `24e27c41fd42dea736515308ce0b31412c2be64b` (после него меняются только `tests/`, `docs/`, `downloads/`) |
| SITE финальный код+тесты | `92c827e9d233b02f925bbeccfa48c16d04d583c3` |
| PIM (read-only) | `fix/pimc-p1` = `5fd46cb6fcd32fe628e8ccd0c9ebe4f4c998b055` |
| CRM frontend (read-only) | `b0e2f9359a05ec835a83d64bb9bcdc2c97487a50` |
| Пакет | `downloads/Rubizh-rc1.zip`, SHA-256 `7a63d9eb8fd93c0d19c3b6b20dd5340a7549b1bd7b4c976cdae2fbe59abec516`, 430 файлов, воспроизводим байт-в-байт |

Синхронизация: SITE `2a338da` → `6311e40` (fast-forward), `rubizh-stage-2-verified^{}` = `6311e40`, `rubizh-stage-1-verified^{}` = `51c83d8`; PIM `claude/amazing-meitner-e6572n@2119846` → `fix/pimc-p1@5fd46cb`. Базовая линия на `6311e40` (macOS): 497 тестов, 491 pass, 3 skip (Linux-only: scheduler/flock, 2 × deploy GNU), 3 fail — 2 среды (Homebrew PHP со встроенным curl: `audit-fixes` проходит с `RZ_DISABLE_CURL=1`, `SEC-01` — только Linux) и 1 таймаут под параллельной нагрузкой (`order-idempotency`, в изоляции PASS); на Linux CI этапа 2 — 497/497.

Изменения кода этапа 3 (без новой функциональности): `847d4c0` RC3-01 (дефект 4.5: архив содержал `.github/`, `.gitignore`, `*.mjs`; `contracts/`, `cache/`, `RELEASE-MANIFEST.json`, `*.tmp` читались по HTTP) — regression-first (RED на `6311e40`), Apache 2.4-проба, независимое ревью `ecc:code-reviewer` APPROVE + `ecc:security-reviewer` без блокеров; `24e27c4`, `92c827e` — тест 4.4 (ревью APPROVE).

| Пункт | Статус | Файл / коммит |
|---|---|---|
| 1 Синхронизация | DONE | выше |
| 2 PRE_LAUNCH_BLOCKERS | DONE (PL-1…PL-4 OPEN — решения владельца) | `docs/release/PRE_LAUNCH_BLOCKERS.md` |
| 4.1 Манифест | DONE | `docs/release/RC1_MANIFEST.md` |
| 4.2 Контракты | DONE | `docs/release/CONTRACTS.md` |
| 4.3 Конфигурация | DONE | `docs/release/CONFIG.md` |
| 4.4 Обновление поверх production и откат | DONE; точная версия production — BLOCKED(owner) PL-4.6/4.7, отрепетированы все 3 кандидата | `tests/rc1-upgrade-rollback.test.mjs` |
| 4.5 Пакет | DONE (дефект RC3-01 исправлен) | `847d4c0`, `downloads/Rubizh-rc1.zip` |
| 4.6 Go-live | DONE | `docs/release/GO_LIVE_CHECKLIST.md` |
| 4.7 Бэкапы | DONE (процедура); production-бэкап не передавался → PL-4.1 | чек-лист шаги 2–3 |
| 4.8 Known issues | DONE | `docs/release/KNOWN_ISSUES.md` |
| 4.9 Changelog | DONE | `docs/release/CHANGELOG_RC1.md` |
| 4.10 Main | DONE: автодеплоя нет → PR #2 без merge | https://github.com/lieverifying/rubizh/pull/2 |
| 4.11 Документы | DONE | `docs/README.md`, этот файл, `SESSION_HANDOFF.md`, `08-RELEASE_READINESS.md` |

**Обновление и откат (4.4)** — для каждого кандидата production `b442eb7`, `b1662de`, `9788a9e` (архив установщика `0e7dafa` = дерево `9788a9e`, 337 файлов): 46 таблиц, 17 заказов во всех состояниях заказа/оплаты/отправки/резерва/счёта, 2 клиента + гость, менеджер из конфига; бэкап `mysqldump` (≈128 КБ); P0 из пакета → `deploy-update.sh` (430 файлов, хеши = манифест) → окно между заменой кода и миграциями (витрина/sitemap/кабинет 200, Staff API 503) → prepare-runtime, PIM v3, CRM, NP recovery, R4 reconcile (2 освобождены), backfill CRM (17 legacy: 13 safe, 3 ambiguous, 1 conflict — неоднозначные не применяются). Сверка: 45 таблиц — 0 потерянных/изменённых строк (единственное изменение типа — цены `int`→`DECIMAL(14,2)`, значения равны; `meta.schema` 3→4); добавлена 1 строка timeline при открытии legacy-заказа в кабинете; +26 таблиц, 6 триггеров. R4: 1007/1008/1009 RELEASED, оплаченные COMMITTED, открытые ACTIVE. R5: попытка без id → failure/failed, известный счёт → created/pending, `success` банка → awaiting_webhook (не paid). Кабинет: 3 своих старых заказа открываются, чужой — нет; CRM: 17/17 старых заказов. Повтор миграций: 71 таблица, 0 изменений. Откат: дерево кода = исходное (475 файлов байт-в-байт), старый код работает на мигрированной схеме, после пересоздания БД и восстановления дампа 46/46 таблиц равны исходным.

| Quality Gate (финальный код) | Результат | Этап 2 для сравнения |
|---|---|---|
| CI на точном SHA | `92c827e`: push [38625368576](https://github.com/lieverifying/rubizh/actions/runs/38625368576) и PR [38625487655](https://github.com/lieverifying/rubizh/actions/runs/38625487655) SUCCESS, PHP 8.2/8.3, **501/501, fail 0, skip 0**; `24e27c4`: [38620244608](https://github.com/lieverifying/rubizh/actions/runs/38620244608) SUCCESS 501/501 | 497/497 |
| Полный SITE локально (macOS, `24e27c4`) | 501: 496 pass, 3 skip (Linux-only), 2 среды (curl) — те же, что в базовой линии; тест 4.4 PASS на macOS с GNU coreutils | — |
| PIM `5fd46cb` | 684/684 + dry-run 49/49; сборка `rubizh_pim.html` и wire-фикстура байт-в-байт; архив 10.9.3 пересобран идентично (`53e81757…`) | 684/684 |
| Contract-тесты | в составе 501 (PIM v3 sync/foundation/checkout/enable, legacy R1, CRM, MonoPay, НП) — `docs/release/CONTRACTS.md` §4 | — |
| Браузерная матрица (05) | Chromium/Firefox/WebKit × 360/390/430/768/1024/1280/1440: 315 загрузок, 0 JS-ошибок, 0 overflow, 0 битых изображений, 21 ожидаемых 404 (страница 404); покупка до MonoPay-заглушки 21/21; COD нигде (единственное совпадение — фраза «Післяплати немає» в оферте) | 336 загрузок / 21 покупок |
| Кабинет / ADDENDUM | кабинет 12/12 (3 движка × 4 ширины; чужой заказ 404, утечки нет; Firefox 768/1280 сначала получили 428 — лимит R8 на одном адресе 127.0.0.1 в общем прогоне, повтор на свежем стенде 4/4; см. PL-1); ADDENDUM 211 проверок, 0 ошибок/overflow | 21/21, 210/210 |
| axe | 30 проверок, **0 нарушений** WCAG 2.1 A/AA; 140 inventory-флагов и 29 «dead-click» кандидатов — информативно, не сертификация | 32 / 0 / 109 |
| Lighthouse | Код приложения идентичен runtime-SHA этапа 2 `f2264c6` (отличаются только `.htaccess` и `dev/package-release.py`) → парные сжатые замеры этапа 2 действуют без изменений (mobile 54/51/57/51, LCP 5,75–7,42 с). Справочно локально (macOS, PHP dev-сервер **без сжатия**, не сравнимо с этапом 2): mobile perf 62–63, LCP 10,7–12,1 с; desktop 88–91, LCP 1,9–2,1 с; a11y 99–100, SEO 100 | PL-2 |
| RBAC/IDOR/CSRF | в составе 501: `q5-manager-rbac`, `idor-orders`, `crm-security`, `crm-domain`, `stage2-r9-auth-csrf`, `stage2-r9-critical-gate`, `stage2-r8-limits` — PASS | R9 24 686/24 686 |
| gitleaks | 2 коммита этапа 3: 0; рабочее дерево: 3 известные синтетические фикстуры тестов (как на этапе 2), реальных секретов 0 | 0 подтверждённых |
| npm audit | SITE 0; PIM 1 moderate (ajv, без изменений); composer не используется | то же |
| Обновление/откат | PASS ×3 кандидата (выше) | синтетическая репетиция |
| Независимое ECC-ревью | `ecc:code-reviewer` APPROVE ×3 (пакет, тест 4.4, окно); `ecc:security-reviewer` — 0 CRITICAL/HIGH, MEDIUM RC3-01 исправлен, прочее → RC3-02…07; `ecc:architect` — сверка документов, исправления внесены | — |

GO этапа 3 выполнен: синхронизация, PRE_LAUNCH_BLOCKERS, манифест/контракты/конфигурация/чек-лист, обновление и откат без потери данных, воспроизводимый пакет, Quality Gate зелёный, CI success. Открыты (допустимо): PL-1…PL-4. К этапу 4 без указания владельца не переходить.

<!-- STAGE3_RC1_CHECKPOINT_END -->

**Продолжение после этапа 3.** Ветка `release/rc1` (push в origin, PR #2 без merge). Локальный стенд и команды — `docs/README.md`. Порядок чтения: этот блок → `docs/release/RC1_MANIFEST.md` → `PRE_LAUNCH_BLOCKERS.md` → `KNOWN_ISSUES.md`. Следующий глобальный этап — 4 (CRM) — **только по указанию владельца**. Ждут владельца: PL-1 (ответ хостинга), PL-2 (B/C), PL-3, PL-4.1–4.9 (бэкап, баннеры, версия SITE/PIM на хостинге, права БД, приватные значения конфигурации), решения по CRM-SEC-FRESH-01/CRM-PHP-01/CRM-FE-01/R-C1. Локальное окружение macOS — Homebrew `php@8.2`, `mariadb@11.4`, `coreutils`, `findutils`, `bash`; Playwright Chromium/Firefox/WebKit; MariaDB только через сокет без сети. Production, PIM, CRM не изменялись.


> Актуальный checkpoint этапа2-B приведён первым. Предыдущие результаты ниже сохранены как история; решения владельца меняются только в утверждённом R1–R11 scope.

<!-- STAGE2B_FINAL_CHECKPOINT_BEGIN -->

Все кодовые gates завершены. Решение **GO этапа 2** вступает в силу после SUCCESS CI самого doc-only checkpoint на его точном SHA; окончательные SHA/CI и опубликованный тег подтверждаются внешней metadata и итоговым ответом.

Код приложения f2264c6 и177efa9 идентичен: проверены SHA256 всех517 tracked regular files вне docs/tests; между ними добавлен только файл трёх регрессионных тестов R9. Поэтому browser/R9/Lighthouse сохраняют фактический runtime SHA f2264c6, а полный SITE/CI —177efa9; исходные SHA не переименованы.

## Этап 2-B — итоговый checkpoint 2026-10-14

Статус этапа 2-B: **GO_STAGE2_ONLY**. Код: `177efa9f5dea4e5ba1b0f16781ba41db582f86ad`; ветка `hardening/stage-2-audit-fixes`. Эти результаты относятся только к указанному финальному коду; прежние разделы сохраняют исторический статус и не заменяют новые gates.

Предварительный CI38415388496 на ebc5e83 завершился FAILED: PHP8.2/8.3, 488/487/1. Причина — реальный native-form `Origin:null` при `Referrer-Policy:no-referrer`, а не SMS fixture. Проверенное исправление2e78b98 сохраняет CSRF и допускает opaque origin только при `same-origin/navigate/document`; historical exact code CI38459393928 SUCCESS не заменяет CI окончательного SHA. Дополнительный R5 follow-up bcb3c2f прошёл независимое review и регрессии исходного срока оплаты; финальные gates приведены в таблице. Детали неразрешённых HIGH не публикуются.

| Решение владельца | Финальный статус | Реализация | Регрессии | Независимое review |
|---|---|---|---|---|
| R1 | FIXED | `4a28331,9e8dc28` | legacy opt-in/v3/atomicity regressions; Apache HTTPS/dot-file8/8 | stage2b_payments |
| R2 | FIXED | `17adae4` | two-SKU gap-lock + exactly one bounded transaction retry | stage2b_logistics |
| R3 | FIXED | `c946be4` | nonwaiting quote/order + version-race PRICE_CHANGED | stage2b_logistics |
| R4 | FIXED | `4775903,56f5c40,a2d577f,62518b9` | new feed/no double count; terminal/full-refund release; timezone boundaries | stage2b_logistics,stage2b_performance |
| R5 | FIXED | `6c3818c,1722bed,62518b9,bcb3c2f` | bank mock recovery/expiry/original deadline; unpaid confirmation2RED→2GREEN quantity reserves; independent compatibility10/10 | stage2b_performance,stage2b_blind_payments |
| R6 | FIXED | `4c58f8b` | OWNER unknown-TTN recovery/late-match race/14digits/monotonic tracking | stage2b_database |
| R7 | FIXED | `PIM5fd46cb6fcd32fe628e8ccd0c9ebe4f4c998b055` | 2new regressions RED on2119846; full684/684 PASS; release hash chain; exactCI38329162970 SUCCESS | stage2b_payments |
| R8 | FIXED; trusted_proxies hosting value BLOCKED(owner) | `43df5e9,c90d06d,f2264c6` | identity/proof/verified success-only order count/failed-only staff; local-font CSP1RED→1GREEN; target19/19 | stage2b_performance,stage2b_blind_security |
| R9 | FIXED | `ebc5e83,2e78b98,177efa9` | 24,686uniquecriticalboundarycells:10,704freshf226+13,982independentlycompatible;52justifiedNAs; native48/48; externalportable3/3 | stage2b_payments,r9_final_runtime_review,r9_resume_review |
| R10 | ACCEPTED(owner), nonblocking | `final checkpoint documentation` | history unchanged; future pim_key/cron_key rotation in16/08; R1 mitigation | owner decision |
| R11 | FIXED (approved variant A); measured mixed deltas; B/C deferred | `e150e43` | CSSdeterministic3/3;8visualpairs; CSSgzip−29.8%;32pairedLHactualcompleted0runtimeerrors; mobilemedianshome49→54,catalog50→51,product54→57,kit54→51 | root independent source/visual review; final_checkpoint_review raw32LHmetrics |

R5 включает независимо проверенное исправление BLIND-PAY-02: повторное подтверждение неоплаченного заказа сохраняет исходные payment_due/remind_at и срок резерва; новые будущий/истёкший сценарии прошли regression-first. R10 остаётся owner-accepted историческим риском, а не исправленной историей.

| Финальный gate | Фактический результат / привязка |
|---|---|
| R9 critical guards | PASS; source `f2264c6fc16deac69118bbfbfa760099fd0c4bdb`; contracts 120; applicable 24686, executed 24686, passed 24686, failed 0, missing 0, extra 0, duplicates 0; independent review r9_resume_review; APPROVED_FINAL_R9_CRITICAL_COVERAGE; r9/final-f226-runtime-consolidation.json + resume-independent-final-runtime-review.json; historicalcompatible13982/fresh10704/52justifiedNAs/census155PHP; all22modulesactualcomplete |
| Полный SITE | PASS на `177efa9f5dea4e5ba1b0f16781ba41db582f86ad`; total 497, pass 497, fail 0, skip 0, cancelled 0; stage2b-site-final-execution.json + actualTAP497/497/0FAIL/SKIP/CANCEL; all*.test.mjs; portable3persisted |
| Три browser engines | PASS на `f2264c6fc16deac69118bbfbfa760099fd0c4bdb`; Chromium / Firefox / WebKit × 360/390/430/768/1024/1280/1440; pages 336, purchase flows 21, native auth PASS48/48 (39raw+9actualChromium/Firefox/WebKit; realserverFetchMetadata; noEffect/noLeak); runtime errors 0, overflow 0, broken images 0; stage2b-browser-final/validation.json + source-binding;336pages+21actualnew1250orders/mockbankhandoffs,zeroerrors;14expected404consoleentries;purchaseoraclecorrectedwithindreview;capturedexits0;cabinet21/addendum210separatePASS |
| Кабинет / addendum | 21/21 и 210/210 PASS; Chromium/Firefox/WebKit ×7 widths; фактический source f2264c6; source-binding/validation/captured exit0 сохранены |
| axe | PASS на `f2264c6fc16deac69118bbfbfa760099fd0c4bdb`; checks 32, violations 0, inventory flags 109; stage2b-axe-final/validation.json + source-binding + captured exit0 |
| Lighthouse A | MEASURED_MIXED_DELTAS; baseline `d1dbfde5af7ea1e95e218f960a192faf985e7665` → final `f2264c6fc16deac69118bbfbfa760099fd0c4bdb`; paired runs 32, runtime errors 0; mobile home: score 49→54, LCP 7.36→7.42s, TBT 1021→712ms; catalog: score 50→51, LCP 7.12→7.01s, TBT 1021→923ms; product: score 54→57, LCP 6.37→5.75s, TBT 765→749ms; kit: score 54→51, LCP 6.82→7.37s, TBT 738→876ms; desktop home: score 78→90, LCP 1.66→1.50s, TBT 290→139ms; catalog: score 90→92, LCP 1.56→1.49s, TBT 165→142ms; product: score 93→95, LCP 1.34→1.25s, TBT 136→122ms; kit: score 93→94, LCP 1.49→1.35s, TBT 118→108ms; deltas CSS gzip44107→30974bytes (−29.8%); mobileLCP home+0.89%,catalog−1.58%,product−9.77%,kit+7.99%; mixed measurements, no numeric80 gate/CWV certification; B/C deferred; r11-compressed-performance-d1/results.json,validation.json,32rawLHJSON; capturedexit0; independentrawmetrics/settingsreview;8gzipdecoded-valid/6staticbyte-equivalent; imageprobeobservations retained |
| Integrity / restore | npm audit Fresh SITE0(exit0); PIM1unchangedMODERATE(exit1),0HIGH/CRITICAL; manifests/locks/source unchanged; PIMdeps outsideauthorizedR7scope; gitleaks Raw1/exit1,0confirmed secrets; exact independentlyreviewed syntheticpricingfixture; no rule suppression; PHP syntax 155/155 PHP syntax PASS at exact code177efa9; synthetic restore Fresh current fullsuite synthetic rehearsal:61tables+2triggers fullyrestored, additiveCLI/safe-onlybackfill/oldcode rollbackPASS;productionwrites0 |

R9 считает уникальные предварительно объявленные applicable cell IDs. План итогового ledger содержит 10 704 обязательных свежих cell IDs на f2264c6 и 13 982 historically compatible cell IDs с независимо подтверждённой применимостью неизменённых guard/business predicates. Фактически завершённые свежие клетки: 10704; required-fresh denominator сам по себе не означает executed/PASS. Финальная сверка R9 завершена: PASS; независимое review — r9_resume_review; APPROVED_FINAL_R9_CRITICAL_COVERAGE. Исторические SHA сохранены и не переименованы в финальный SHA. Planned, подготовленные, пересекающиеся supporting checks и skipped не считаются PASS. Все 52 N/A имеют source rationale; диагностический ответ сам по себе не доказывает авторизацию. Expected404 отделены от runtime JS failures. axe покрывает выполненные WCAG 2.1 A/AA проверки; 109 inventory flags учитываются отдельно от 0 violations и не являются WCAG 2.2 certificate или dead-click PASS. Lighthouse — попарное измерение same host/data/compression/cache/throttling, mixed deltas не превращаются в безусловный performance PASS.

Финальный code CI: [38595759822](https://github.com/lieverifying/rubizh/actions/runs/38595759822), статус **SUCCESS** на точном `177efa9f5dea4e5ba1b0f16781ba41db582f86ad`. Независимое финальное review: root code-gate validation; r9_resume_review final runtime; independent PAYMENTS/SECURITY/R1–R11 reviews; final_checkpoint_review raw32LH metrics; final document approval retained separately. Verified tag: `rubizh-stage-2-verified`; создание и публикация подтверждаются внешней metadata, не планом. Создание локального annotated tag и его обычный push разрешены владельцем в этапе2-B; выполняются только после SUCCESS CI точного doc-only checkpoint. Старые запреты на push ниже относятся к историческим этапам и не отменяют это разрешение. Собственный SHA doc-only checkpoint и его exact CI нельзя встроить в тот же commit: окончательные checkpoint SHA/CI/tag target фиксируются в независимой retained metadata и final response. Пока этих подтверждений нет, их успешность не заявляется этим документом.

Production **NO-GO** сохраняется: завершение этапа 2 не разрешает deploy или этапы3–6. Живые bank/НП/SMS/mail/OAuth и сквозной provider E2E — **DEFERRED → этап6**, а не PASS. Все локальные деньги/заказы/сессии и ответы провайдеров синтетические; production данные, импорты, поставщики и AUTOPRICES не использовались.

R8: default `trusted_proxies=[]` проверяется кодом; только значение хостинга остаётся **BLOCKED(owner)** до ответа хостинга. Прочие OWNER DECISION не изменены. QA-20 исторический риск принят владельцем (**ACCEPTED, nonblocking**); current redaction не исправляет уже опубликованную историю, force/history rewrite не выполнялись. Перед production обязательна отдельная смена `pim_key`/`cron_key` и проверка отказа старым ключам.

CRM dependency `b0e2f9359a05ec835a83d64bb9bcdc2c97487a50` read-only; CRM-SEC-FRESH-01/CRM-PHP-01/CRM-FE-01 остаются на этапе4. PIM: только утверждённый R7/PIMC-P1 на `5fd46cb6fcd32fe628e8ccd0c9ebe4f4c998b055`, exact PIM CI38329162970 SUCCESS на неизменённом PIM SHA; прочие PIM предложения/зависимости не менялись. PIM baseline682 и final684 не взаимозаменяемы. Варианты performance B/C не реализованы; production CWV/p75/capacity и настоящие мобильные устройства не сертифицированы.

Продолжение: сначала проверить точный reviewed code SHA и независимый R9 census/manifest, затем запускать изолированные DB/browser gates последовательно. Не выдавать старые source pin/CI/counts за новый прогон. Cloud setup использует существующий checkout и private runtime helpers; сохранённые процессы после восстановления не считаются работающими.

<!-- STAGE2B_FINAL_CHECKPOINT_END -->


## Исторические результаты до этапа 2-B


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
