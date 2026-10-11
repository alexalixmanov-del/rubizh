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
| MonoPay | **PARTIAL** | **sandbox через код SITE: 6/6** — invoice/create (страница `pay.monobank.ua`), повторный payment-start не создаёт второй счёт, invoice/status без изменения денег, заказ не оплачивается без подписанного webhook, invoice/remove → `expired`; подписи webhook, повторы, порядок, истечение, reconciliation, двойная оплата — mock/contract тесты | успешная/неуспешная оплата тестовой картой и **реальная доставка webhook** — нужен HTTPS endpoint (В-1) |
| Nova Poshta | **PARTIAL** | **readonly через код SITE: 5/5** — поиск городов, отделений, пустой результат, неверный ref и длинный запрос → 400 (D-40 исправлен); отображение доставки, несколько отправлений, отменённые ТТН — фикстуры/браузер | создание ТТН — только с разрешения (В-3); профиль отправителя `np_origin_refs` не проверен |
| TurboSMS | **PARTIAL** | readonly: баланс 200/OK; отправка — только mock | имя отправителя `RUBIZH_TURBOSMS_SENDER` (В-4); одна тестовая SMS — с разрешения |
| SMS-авторизация | **PARTIAL** | коды (хеш, 5 мин, 5 попыток), cooldown, лимиты, конкурентные запросы — существующий код; Q-6 (резерв бюджета, проверка при подозрительной активности, лимит неверных кодов) — тесты написаны, реализация в работе | — (идёт работа) |
| Тестовые покупатели | **READY** | синтетические A/B в фикстурах; чужой заказ → 404 (3 движка × 4 ширины); повтор заказа только своего | — |
| Тестовые менеджеры | **PARTIAL** | роли `staff_roles` (OWNER) в фикстурах; CRM-домен (подтверждение, счёт, отгрузка) — crm-* тесты | повторная аутентификация для денежных действий — Q-5 (в плане) |
| Администратор | **PARTIAL** | `shop/settings.php` по праву `payment.manual_reconcile` | step-up — Q-5 |
| Браузерное тестирование | **READY** | Chromium, WebKit, Firefox (Playwright 1.62.1), axe, Lighthouse; 540 + 140 + 12 загрузок | реальные устройства iOS/Android — не тестировались |
| HTTPS webhook endpoint | **BLOCKED** | — | В-1 |
| GitHub CI | **READY** | `gh` авторизован; `bbc989a` — success | push — с разрешения |
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

## Следующие шаги

1. Q-6 (SMS-защита) → Q-7 → Q-5 → Q-4 по плану, с full-system gate после каждого.
2. По разрешениям В-1…В-4 — живые sandbox-сценарии monobank, одна ТТН и одна SMS.
3. Финальный multi-agent аудит SITE + PIM после всех изменений SITE.
