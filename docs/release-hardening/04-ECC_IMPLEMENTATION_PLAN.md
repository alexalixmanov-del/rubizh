# 04 — ECC IMPLEMENTATION PLAN (фактическое состояние)

Обновлено 2026-10-11 (сессия 2). Утверждено владельцем; работа в `hardening/site-release-20261011` (от `59b4685`).

## Выполнено

| Этап | Содержание | Состояние |
|---|---|---|
| 0 Стенд | PHP 8.2 + MariaDB 11.4 (как CI) + GNU findutils + Playwright Chromium/WebKit/Firefox; тесты переносимы через env | готово |
| 1 Деньги | D-02 COD, D-03, D-04, D-13, D-25 | FIXED, regression-first |
| 2 Галерея | D-01, D-05, D-17, D-26 | FIXED, regression-first |
| 3 UI | D-06, D-07, D-08 | FIXED; D-09 заблокирован (нет файлов) |
| 3b Кабинет | D-10 + браузерный QA кабинета (3 движка × 4 ширины, IDOR, ТТН) | готово, всё зелёное |
| 5a CI | GitHub Actions `SITE CI` на `fcc73e9`: success | готово |
| 4 P2/P3 | D-14, D-18, D-20, D-21 (v3 + legacy), D-27, D-28 — FIXED regression-first; D-24 NO-DEFECT; D-11 → Q-8; D-22 → Q-9 | готово, кроме решений владельца |
| 5b Browser QA | матрица 3 движка × 12 ширин × 15 страниц (540/540) + покупка до заказа 9/9 (`qa-matrix`), кабинет 12/12 (`qa-cabinet`) → `05-BROWSER_QA_MATRIX.md` | готово |
| 5c Audit | interaction inventory + dead-click, axe WCAG 2.1 AA, Lighthouse (`qa-audit`) → `07-SECURITY_PERFORMANCE_REVIEW.md`; найдено и исправлено D-29…D-33; D-34 → ТЗ главной | готово |

## Осталось (по порядку)

1. Разрешение на push → CI для итогового SHA → теги `rubizh-stage-1…6-verified` (сейчас INCOMPLETE, см. `STAGE_CHECKPOINT.md`).
2. Q-6 SMS-защита → Q-7 прямая MonoPay при подтверждённом наличии → Q-5 step-up/RBAC/аудит → Q-4 v3 под заказ: каждый — отдельный этап с checkpoint.
3. Решения владельца: Q-8 (`10-KIT_RULES_PROPOSAL.md`), Q-9 (`09-ASSET_INVENTORY.md`), баннеры D-09 (`11-BANNER_PROMPTS.md`), sandbox monobank/НП (RV-4, live-проверки).
4. Повтор gate и `08-RELEASE_READINESS.md` → GO/NO-GO перед любым deploy (deploy — только с отдельного подтверждения).

## ADDENDUM №2 — сверка (Phase 1, 2026-10-11)

Источник: «ECC ADDENDUM №2» владельца. Сверено с кодом на `3326514` (CI success) и реестром 03. Статусы: NEW / EXTEND / DONE / CONFLICT.

| # | Требование | Существующее | Статус | Файлы | Тесты |
|---|---|---|---|---|---|
| A-1 | Hero: одна CTA «Обрати спорядження», крупнее | 2 CTA (`index.html` hero), `.rz-btn` 13px/500 | NEW | `index.html`, новый `ui-addendum.*.css` | addendum-home |
| A-2 | Кнопка «Зібрати комплект» во 2-м блоке заметнее, «Допомогти з вибором» вторична | `.rz-btn-primary` + `.rz-text-link` уже есть | EXTEND | CSS | addendum-home |
| A-3 | Единые Primary/Secondary/Text link, focus, 44×44 | `.rz-btn`, inline-стили, D-34 | EXTEND (+D-34) | CSS | addendum-home, a11y |
| A-4 | Шапка/поиск (D-34: пустой поиск, 2.5.3, 24px) | D-34 OPEN | EXTEND | `index.html`, client | addendum-home |
| K-1 | Onboarding «ЗБЕРИ СВІЙ КОМПЛЕКТ ЗА 4 КРОКИ», «Почати збір»/«Пропустити», «Як це працює?», localStorage с версией, Esc, focus trap, без scroll lock | нет | NEW | `index.html`, client | addendum-kit |
| K-2 | Параметры = предпочтения; обувь «Оберіть розмір» вместо «—»; изменение не меняет добавленный SKU молча | «Мої параметри», шаг 01; поведение при смене — проверить | EXTEND | client | addendum-kit |
| K-3 | Статус слота «Не обрано» / «Обрано: N товар» / «Необов'язково» | «Додано ✓» / «Необов’язково» | EXTEND | client | addendum-kit |
| K-4 | Карточки выбора: фото, имя, цена, размер/цвет, наличие, disabled | модальный picker с размерами/цветом/примечаниями | DONE (проверить disabled) | — | kit-* существующие |
| K-5 | Summary: «Вартість товарів / Знижка на комплект / Разом», без зачёркивания при 0 | «Разом окремо» (зачёркнуто только при экономии) / «Ціна комплектом» | EXTEND (подписи, строка скидки) | `index.html`, client | addendum-kit |
| K-6 | CTA «ДОДАТИ КОМПЛЕКТ ДО КОШИКА»; пустой — «Спочатку додайте хоча б один товар» | `kitToCart`, `kitCantLabel` «Додайте щонайменше N позиції» | EXTEND (тексты; правило ≥N не меняем — Q-8) | client | addendum-kit |
| K-7 | Проверки при добавлении в корзину, список проблем, не удалять доступное | `needsSize`, `isOut`+«Замінити», `kitPriceUpd` | DONE/проверить | — | существующие + addendum-kit |
| K-8 | Черновик между сессиями, перепроверка на сервере | «Ми зберегли вашу збірку», цены перечитываются | DONE | — | существующие |
| K-9 | Mobile sticky summary-бар не перекрывает safe area | `data-kit-bar` с `env(safe-area-inset-bottom)` | DONE/проверить 360 | — | browser QA |
| K-10 | «Потрібна допомога з вибором?» → реальный сценарий | `goPicker` (подбор за 6 вопросов) + менеджер | EXTEND (заметная вторичная ссылка) | `index.html` | addendum-kit |
| K-11 | Не менять SKU/цены/скидки/корзину/заказ | frozen | DONE (ограничение) | — | весь suite |
| C-1 | Навигация каталога, «Каталог → Категорія → Підкатегорія» на mobile | D-08 карусель, хлебные крошки, D-28 | EXTEND (аудит переходов) | — | addendum-catalog |
| C-2 | Карточки: единые пропорции, цена диапазоном | 4:5, D-21 | DONE/проверить диапазон | — | addendum-catalog |
| C-3 | Фильтры совместно, reset, сортировка/пагинация не теряют выбор, мобильные «Фільтри/Показати/Скинути», без scroll lock | фильтры есть | EXTEND (аудит + исправления) | client | addendum-catalog |
| C-4 | Поиск: кириллица/латиница/пробелы/пусто/длинный/нет результатов с полезным сообщением | `noResults` | EXTEND | client | addendum-catalog |
| C-5 | Одна товарная модель для каталога/конструктора/корзины | общие `Z`, `storeV3Map` | DONE | — | — |
| P-1 | Кабинет: «Огляд» (активный заказ + одна CTA, пустое состояние) | вкладка overview отключена (redirect → orders) | EXTEND | `auth/account-view.php`, `index.php` | addendum-account |
| P-2 | История: карточки, 1–3 превью, пагинация | есть (20/стр., превью, Активні/Історія) | DONE (+ кол-во товаров, сумма — проверить) | — | qa-cabinet |
| P-3 | Страница заказа: товары, оплата, доставка, история | есть (timeline, товары, ТТН) | EXTEND (раздельные статусы заказ/оплата/доставка) | `order-detail.php` | addendum-account |
| P-4 | Несколько отправлений «Посилка 1 із 2» | схема поддерживает N shipments (`rubizh_order_shipments`) | EXTEND (подписи; без миграций) | `order-detail.php` | addendum-account |
| P-5 | Человеческие статусы, без `awaiting_webhook` | `shopCustomerStatus`, `customerPayment` | DONE/проверить маппинг | — | addendum-account |
| P-6 | Повторить заказ с перерасчётом | `shop/repeat-order.php` + `storeRepeatOrder` (владелец, текущие цены/варианты, список недоступных) | DONE; EXTEND: не дублировать строки корзины, ссылка на товар для недоступных | client | addendum-account |
| P-7 | Обране | `tab=favorites` | DONE (проверить актуальные цены, удаление, слияние гостя) | — | addendum-account |
| P-8 | Мої дані без обхода SMS | телефон readonly после подтверждения | DONE | — | существующие |
| P-9 | Поддержка с номером заказа | mailto с темой «Замовлення №» | DONE | — | — |
| S-1 | Footer «Ми в соцмережах», Instagram/TikTok из настроек (`instagram_url`, `tiktok_url`), валидация https+host, скрытие пустых | нет | NEW | `shop/settings-lib.php`, `settings.php`, `index.html`, client | addendum-social |
| Q-4 | v3 «під замовлення»: подтверждение менеджера до оплаты, серверная проверка, без изменения PIM | v3 требует `payment_allowed` из PIM (D-25 legacy fixed) | EXTEND / возможен CONFLICT с контрактом PIM → предложение | `order-validation.php` | release-hardening |
| Q-5 | Step-up, RBAC, audit для денежных действий менеджера (в SITE) | менеджер на клиентской сессии (D-16) | NEW | `shop/np-*.php`, auth | новый |
| Q-6 | SMS: rate limit, cooldown, лимиты, CAPTCHA при подозрительной активности, атомарно | глобальные лимиты (D-15) | NEW | `auth/phone.php` | новый |
| Q-7 | Legacy «в наличии» → прямая MonoPay при подтверждённом остатке; иначе менеджер | всё legacy через менеджера | NEW (финансовый поток) | `order.php`, validation | новый |
| Q-8 | Правила комплекта: исследование + предложение, расчёты не менять | D-11 | NEW (документ) | — | — |
| Q-9 | Инвентаризация assets, удаление отдельным этапом | D-22 | NEW (документ) | — | — |
| B-1 | Баннеры из Drive для категорий без баннера; перечень + промпты, без генерации | D-09/D-23 | EXTEND | — | — |

Порядок: Phase 2 (A-1…A-4) → Phase 7 (S-1) → Phase 3 (K-1) → Phase 4 (K-2…K-10) → Phase 5 (C-*) → Phase 6 (P-*) → Q-6 → Q-7 → Q-5 → Q-4 → Q-8/Q-9 (документы) → B-1 → Phase 8 (регрессия, browser QA, документы) → финальный `/ecc:code-review` → `08-RELEASE_READINESS.md`.

## VERIFIED CHECKPOINT после каждого этапа (требование владельца 2026-10-11)

Этапы (сопоставление, на подтверждение владельца): ADDENDUM №2 Phase 2 → **этап 1** (главная), Phase 3 → **2** (онбординг конструктора), Phase 4 → **3** (удобство конструктора), Phase 5 → **4** (каталог), Phase 6 → **5** (кабинет), Phase 7 → **6** (соцсети).

**Definition of Done этапа** — все пункты выполнены на одном и том же HEAD:
1. Полный `npm test` (известные macOS-ограничения окружения перечислены и совпадают с исходным `59b4685`).
2. Полная Browser QA Matrix (`qa-matrix`, `qa-cabinet`, `qa-addendum`) + снимки изменённых экранов.
3. SITE ↔ PIM ↔ CRM в пределах изменений (pim-v3-*, crm-*, release-hardening).
4. Security, SEO, accessibility, performance (`qa-audit`: axe, Lighthouse; seo/a11y тесты).
5. CI GitHub для **точного SHA** (требует push — только с разрешения владельца).
6. Независимый ECC code review (агент `ecc:code-reviewer`) и исправление находок.
7. Нет открытых P0 и блокирующих P1.

**Checkpoint:** обновить 03/05/08 → `STAGE_CHECKPOINT.md` (SHA SITE и PIM, дата, результаты, восстановление) → отдельный commit → annotated tag `rubizh-stage-N-verified` (только если пункты 1–7 зелёные) → чистое дерево. Push коммитов и тегов — только с явного разрешения. Если чего-то нет (например, CI без push) — статус **INCOMPLETE**, без тега `verified`, обычный commit и перечень недостающего. Изменение кода после checkpoint отменяет его подтверждение для нового HEAD.

## Не входит без отдельного разрешения
Production deploy, production migrations, включение v3, PIM-патчи, реальные платежи/invoice, реальные ТТН, reset/импорт каталога, изменения CRM, merge в main.
