# CRM РУБІЖ — чек-лист запуска (этап 4)

Встроен в [docs/release/GO_LIVE_CHECKLIST.md](../release/GO_LIVE_CHECKLIST.md) как раздел «CRM». Выполняется **после** выкладки SITE (шаги 1–13 общего чек-листа) или вместе с ней. У каждого шага есть откат. Живые проверки внешних сервисов — **DEFERRED → этап 6**: на этапе 4 все `crm_*_live` остаются выключенными.

Обозначения: `$SITE` — корень сайта, `$PHP` — CLI PHP хостинга, `$PRIV` — приватный каталог вне webroot, `$B` — файл бэкапа шага C1, `$DBNAME` — имя БД.

| № | Шаг | Команда / действие | Проверка | Откат |
|---|---|---|---|---|
| C1 | Бэкап БД и файлов | Как шаг 2 общего чек-листа; `sha256sum "$B" > "$B.sha256"`; `cp -p api/config.php "$PRIV/config.php.crm-before.bak"`; копия `$SITE/crm/` | Восстановимость (шаг 3 общего чек-листа) | — |
| C2 | Деплой SITE (этап 4) | Шаги 5–7 общего чек-листа (пакет содержит `staff/*`, `api/staff/*`, `contracts/crm/*`) | `GET /api/staff/auth/session` → 503 `CRM_DISABLED` (флаг ещё выключен, `staff/router.php:33`) | `dev/rollback-update.sh` (раздел «Откат» общего чек-листа) |
| C3 | Деплой фронтенда CRM | Собрать `crm.rubizh` на SHA из чекпоинта этапа 4 (`npm ci && npm run build`), скопировать содержимое `dist/` (включая `dist/.htaccess`) в `$SITE/crm/` | `/crm/` отдаёт `index.html` с `Cache-Control: no-store`, CSP без `unsafe-inline`, `X-Robots-Tag: noindex` | Вернуть копию `$SITE/crm/` из C1 |
| C4 | Миграция CRM (схема v4: + индексируемая виртуальная колонка поиска `rubizh_order_details.crm_search`; оптовые заявки — `assigned_to`, `order_id`) | `cd "$SITE"; BK=(--backup-file="$B" --backup-sha256="$(cut -d' ' -f1 "$B.sha256")"); $PHP dev/migrate-crm.php --plan && $PHP dev/migrate-crm.php --apply --database="$DBNAME" "${BK[@]}"` (до этого: `SHOW TABLE STATUS LIKE 'rubizh_order_details'` → `Row_format` = `Dynamic`, иначе индекс 600 символов не создастся) | Код 0; повторный `--plan` — все шаги `exists: true`; `meta.crm_schema = 4` | Таблицы, индексы и виртуальная колонка только добавляются; прежний код SITE работает. Для прежней версии **CRM API** вернуть `UPDATE meta SET v='2' WHERE k='crm_schema'` (или значение той версии, к которой откатываетесь) (колонка ей не мешает). Порча данных → восстановление `$B` |
| C5 | Секреты | `php -r 'echo base64_encode(random_bytes(32)),PHP_EOL;'` → env `RUBIZH_CRM_SECRET_KEY` (предпочтительно) или `crm_secret_key` в `api/config.php` (0600); `crm_ip_salt` — случайная строка ≥32 | Нет ответа `CRM_SECRET_KEY_MISSING` | Удаление ключа делает TOTP недоступным — откатывать только вместе с C7 |
| C6 | Учётная запись OWNER | `stty -echo; $PHP dev/staff-user.php --email=<email> --name="<Имя>" --role=OWNER --reason="CRM initial owner"; stty echo` — пароль из stdin, ≥12 символов, не из списка слабых | Код 0 | До C7 — удалить строку; после — «Співробітники → Деактивувати» |
| C7 | `crm_enabled=true` | Перед изменением `cp -p api/config.php "$PRIV/config.php.$(date +%s).bak"` | Вход OWNER на `/crm/` → обязательное подключение TOTP → резервные коды сохранить офлайн. Затем C8 | Вернуть копию конфига → Staff API снова `CRM_DISABLED` |
| C8 | Smoke CRM | Браузер 390 и 1440 px: вход, «Огляд», «Замовлення» (список, фильтр, карточка старого заказа), «Клієнти» (маска телефона), «Платежі», «Доставка», «Налаштування»; выход. JS-ошибок 0, CSP-нарушений 0, горизонтального скролла 0 | На стенде то же проверяет `tests/crm-browser.test.mjs` | — |
| C9 | `crm_np_tracking_live=true` (этап 6) | Только после живой проверки чтения статусов НП | «Оновити статус» в отправлении возвращает статус НП | Вернуть копию конфига |
| C10 | `crm_sms_live=true` (этап 6) | После реальной SMS (TurboSMS, модерация отправителя) | Уведомление приходит SMS | Вернуть копию конфига |
| C11 | `crm_np_ttn_live=true` (этап 6) | Вместе с `np_ttn_enabled=true`, после тестовой ТТН и проверки профилей отправителей | ТТН создаётся, номер виден покупателю в кабинете | Вернуть копию конфига; тестовую ТТН удалить в карточке до передачи |
| C12 | `crm_refund_live=true` (этап 6) | Последним, после тестового возврата MonoPay | Частичный возврат 1 ₴ по тестовому заказу, статус «Кошти повернено» | Вернуть копию конфига |
| C13 | Smoke после каждого флага | C8 + сценарий этого флага | — | Откат флага |
| C14 | Приглашение сотрудников | OWNER: «Співробітники → Запросити» (MANAGER, WAREHOUSE, SUPPORT, ACCOUNTANT); ACCOUNTANT подключает TOTP при первом входе | Сотрудник видит меню своей роли | «Співробітники → Деактивувати» (сессии завершаются сразу) |

`crm_email_live` включается вместе с почтой сайта (этап 6) так же, как C10.

## Нельзя

- Включать live-флаги на этапе 4 и включать несколько флагов за раз.
- Запускать `dev/crm-synthetic.php` на production (скрипт сам отказывается без `environment=staging` и mock-ов).
- Оставлять `crm_totp_required=false` на production.

## Ссылки

Флаги и ключи — [CONFIG §16](../release/CONFIG.md); эксплуатация — [06-CRM_RUNBOOK](06-CRM_RUNBOOK.md); роли — [03-RBAC_MATRIX](03-RBAC_MATRIX.md).
