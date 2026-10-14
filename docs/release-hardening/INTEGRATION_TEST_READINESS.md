# INTEGRATION & ACCESS TEST READINESS

Дата: 2026-10-11. SITE `hardening/site-release-20261011` (`3122d72`), PIM `21198461f8eb…` (read-only). Ключи — только в `~/Projects/rubizh-test-secrets/` (вне Git, права 700/600); значения нигде не выводились. Production, PIM и CRM не изменялись; реальных платежей, ТТН и SMS не было.

## Как подключены ключи

| Ключ владельца (`.env.testing.local`) | Переменная SITE | Тип по факту | Режим |
|---|---|---|---|
| `MONOBANK_TEST_TOKEN` (44) | `RUBIZH_MONO_TOKEN` | **sandbox**: `merchant/details` → тестовый мерчант «Test Caption» | `sandbox` — запись разрешена только в тестовой среде monobank |
| `NOVA_POSHTA_TEST_KEY` (32 hex) | `RUBIZH_NP_API_KEY` | **реальный аккаунт** (у НП нет sandbox) | `readonly` — только справочники |
| `TURBOSMS_TEST_TOKEN` (40 hex) | `RUBIZH_TURBOSMS_TOKEN` | **реальный аккаунт** (у TurboSMS нет sandbox), баланс 10.42 | `readonly` — только баланс; отправка — mock |

Защита: `run-testing.sh` передаёт ключ **одного** провайдера **одной** команде и отказывается запускать тест-сьюты; тестовый fixture не пропускает ключи в PHP-серверы, кроме явного запуска monobank `sandbox` или НП `readonly`; webhook/redirect monobank в изолированной среде указывают на недоступный `https://sandbox.rubizh.invalid` (production в любом случае — `rubizh.shop`).

## ACCESS & TEST READINESS CHECKLIST

| Компонент | Статус | Что проверено фактически | Что нужно |
|---|---|---|---|
| SITE и тестовая БД | **READY** | MariaDB 11.4 (как CI), изолированные схемы, PHP 8.2; `npm test` 325 → 321 (4 — окружение macOS) | — |
| PIM v3 | **PARTIAL** | контракт PIM↔SITE по фикстуре `contracts/pim-v3/2/wire.exact.json`, pim-v3-* тесты зелёные; PIM прочитан | живая публикация из PIM в изолированный SITE — по шагу В-6 |
| MonoPay | **READY (mock/contract)**; live — **DEFERRED → этап 6** | sandbox через код SITE 6/6 (до этапа 1); этап 1: контрактные тесты webhook на собственной паре ключей — валидная/поддельная подпись, повтор, сумма, валюта, чужой invoiceId, истёкший счёт, поздний/ранний webhook, ошибка закрытия, неизвестный статус + pull-сверка (mock) — ни один негативный случай не даёт «оплачено» | оплата тестовой картой и HTTPS webhook (В-1, В-2) — этап 6 |
| Nova Poshta | **READY (readonly + mock)**; ТТН — **DEFERRED → этап 6** | readonly через код SITE 5/5 (до этапа 1); несколько посылок/ТТН на заказ — фикстуры и схема (`rubizh_order_shipments`: строка на посылку) | одна тестовая ТТН (В-3) — этап 6 |
| TurboSMS | **READY (mock)**; реальная SMS — **DEFERRED → этап 6** | readonly: баланс 200/OK (до этапа 1); отправка — только mock | имя отправителя (В-4), одна SMS — этап 6 |
| SMS-авторизация | **READY (mock)** | Q-6 реализован и проверен (`8afd937`, CI success): лимит на адрес, бюджет неверных кодов (номер, адрес), резерв 30% для клиентов, проверка при подозрительной активности (PoW ≤ 20 бит), email-резерв, единый текст отказа | реальная SMS — этап 6 |
| Тестовые покупатели | **READY** | синтетические A/B в фикстурах; чужой заказ → 404 (3 движка × 4 ширины); повтор заказа только своего | — |
| Тестовые менеджеры | **READY** | роли OWNER/MANAGER/LOGISTICS/READ_ONLY; Q-5: RBAC, повторный вход ≤ 15 мин, версия заказа (409), аудит, CSRF — q5-manager-rbac, p0-integration, crm-* | — |
| Администратор | **READY** | `shop/settings.php`: OWNER + повторный вход (реквизиты, поставщики, пожертвування); D-41 (500 на GET) исправлен | — |
| Браузерное тестирование | **READY** | Chromium, WebKit, Firefox (Playwright 1.62.1), axe, Lighthouse; 540 + 140 + 12 загрузок | реальные устройства iOS/Android — не тестировались |
| HTTPS webhook endpoint | **DEFERRED → этап 6** | контракт webhook проверен локально (подписи собственной пары ключей) | В-1 — этап 6 |
| GitHub CI | **READY** | `gh` авторизован; CI на каждый SHA этапа 1 (см. STAGE_CHECKPOINT) | — |
| CRM compatibility | **PARTIAL** | crm-domain/security/confirmation/shipping/browser зелёные (фронтенд CRM собран из `b0e2f93`); crm-migration падает локально и на `59b4685` (зелёный в CI) | сам репозиторий CRM не тестировался (вне scope) |
| Файлы поставщиков | **NOT TESTED** | в PIM только запросы поставщикам и релизные артефакты; импорт заморожен правилами | вне scope SITE; по В-6 при живой проверке PIM |
| Баннеры категорий | **BLOCKED** | на Drive те же 49 файлов, все использованы | 19 изображений по `11-BANNER_PROMPTS.md` (В-5) |

## Что нужно от владельца (по шагам, без передачи секретов в переписке)

**В-1. HTTPS endpoint для webhook monobank (sandbox).** Вариант А (рекомендую, временно, без аккаунта): разрешить мне запустить на время теста `cloudflared tunnel --url http://127.0.0.1:<порт изолированного SITE>` (Homebrew `cloudflared`) — выдаёт одноразовый `https://*.trycloudflare.com`, который пропишется как `public_base_url` только в изолированной копии; после теста туннель закрывается. Вариант Б: поддомен стейджинга на хостинге (например, `staging.rubizh.shop`) с TLS и отдельной копией SITE+БД — это настройка хостинга владельцем. После этого: оплата тестовой картой на `pay.monobank.ua` (тестовые карты из документации monobank) → проверка реального подписанного webhook, повторного webhook, неуспешной оплаты.

**В-2. Тестовые карты monobank.** Ничего вводить не нужно — используются официальные тестовые номера из документации; нужно только разрешение на оплату тестовых счетов в sandbox (деньги не списываются).

**В-3. ТТН Nova Poshta.** Песочницы нет: любая ТТН — настоящая. Для проверки: (1) личный кабинет НП → «Налаштування» → «Безпека» → убедиться, что ключ API относится к нужному контрагенту-отправителю; (2) дать разрешение на создание **одной** ТТН с немедленным удалением (`InternetDocument.delete`, пока посылка не сдана) или оставить проверку на mock. Без разрешения создание ТТН не выполняется.

**В-4. TurboSMS.** (1) Кабинет turbosms.ua → «Відправники» → альфа-имя (например, `RUBIZH`) в статусе «Активний»; (2) внести его командой `~/Projects/rubizh-test-secrets/set-secret.sh turbosms` (поле отправителя — не секрет); (3) отдельное разрешение на **одну** SMS на ваш номер (≈0.5–1 грн).

**В-5. Баннеры.** Файлы по `docs/release-hardening/11-BANNER_PROMPTS.md` в ту же папку Drive.

**В-6. PIM (по желанию).** Если нужна живая проверка «PIM → изолированный SITE»: разрешить запуск PIM локально в режиме read-only с публикацией только в изолированную тестовую копию SITE (без изменения репозитория PIM).

Новые ключи вносить только так: `~/Projects/rubizh-test-secrets/set-secret.sh <provider>` (скрытый ввод) или правкой вашего `.env.testing.local` в редакторе. `./status.sh` показывает только наличие и длину.

## Результаты (2026-10-11)

- Connectivity (`tests/.staging/qa-connectivity.mjs`): monobank 200/200, Nova Poshta 200 (25 областей), TurboSMS 200 (баланс).
- monobank sandbox через SITE (`tests/.staging/qa-provider-sandbox.mjs`): 6/6 PASS; тестовый счёт деактивирован (`invoice/remove` → `expired`).
- Nova Poshta readonly через SITE: 5/5 PASS после исправления D-40.
- Только mock/contract: webhook (подпись, дубль, порядок), успешная/неуспешная оплата, возвраты, reconciliation; ТТН (payload, дубли, отмена); SMS-отправка.
- Регрессия: release-hardening, p0-integration, pim-v3-checkout и NP-связанные наборы — зелёные.

## Этап 1 (2026-10-11): живые проверки

Решение владельца: живые внешние проверки (HTTPS webhook / cloudflared, оплата тестовой картой, реальная SMS, тестовая ТТН, В-1…В-4) — **DEFERRED → этап 6**, не PASS и не BLOCKED. Реальные API на этапе 1 не вызывались; всё — через mock и контрактные тесты. Единственное обращение к production — один read-only HEAD/GET заголовков `https://rubizh.shop/` (разрешение владельца): `content-encoding: br`, `cache-control: no-cache` (HTML), `server: nginx`, HSTS.

## Следующие шаги

1. Этап 1 (Q-6 → Q-7 → Q-5 → Q-4, Quality Gate) — выполнен, см. STAGE_CHECKPOINT.
2. Этап 6: по разрешениям В-1…В-4 — живые sandbox-сценарии monobank, одна ТТН и одна SMS.
3. Финальный multi-agent аудит SITE + PIM после всех изменений SITE.
