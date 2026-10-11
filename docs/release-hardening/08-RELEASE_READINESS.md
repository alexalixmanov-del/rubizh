# 08 — RELEASE READINESS

Дата: 2026-10-11. Ветка `hardening/site-release-20261011`. Проверенный код: **`98ef261`** (SITE); PIM `21198461f8ebb2eadef6dcd6fb77a50a8a038ea9` (не изменялся); CRM — не подключён к этой проверке (код CRM не менялся, проверены CRM-тесты SITE).

## Решение: **NO-GO для production** (на сейчас)

Код ветки готов к финальной проверке, но выпуск в production блокируют пункты ниже. Ни один из них не требует переделки уже сделанного.

| # | Блокер | Что нужно | От кого |
|---|---|---|---|
| B-1 | ~~CI для точного SHA~~ — **закрыт** для `bbc989a` (run 38149516196 success); повторяется для каждого нового HEAD | push по разрешению | — |
| B-2 | Решения Q-4…Q-7 приняты, но не реализованы: SMS-защита (Q-6), прямая MonoPay для подтверждённого наличия legacy (Q-7), step-up/RBAC/аудит менеджера (Q-5), v3 «під замовлення» (Q-4) | реализация по этапам с checkpoint | работа + решения |
| B-3 | Правила комплекта (Q-8) | согласование `10-KIT_RULES_PROPOSAL.md` | владелец |
| B-4 | Live-проверка MonoPay и Nova Poshta (всё проверено только на mock), включая реакцию `invoice/remove` на `failure` (RV-4) | sandbox monobank и тестовый ключ НП | владелец |
| B-5 | Баннеры 19 категорий (D-09) | файлы по `11-BANNER_PROMPTS.md` | владелец |

Не блокеры (решение владельца, можно после релиза): D-22/Q-9 удаление 38 неиспользуемых файлов (`09-ASSET_INVENTORY.md`), D-23 разрешение баннеров, D-34 (б, в) шапка, D-35 логирование ошибки кабинета, минификация JS (07 §5).

## Что подтверждено на `98ef261`

| Проверка | Результат |
|---|---|
| Полный `npm test` (325) | 321 pass; 4 fail — те же ограничения окружения macOS, что и на исходном `59b4685` (`Deployment preserves…`, `Scheduler…`, `Small patch…` — Linux-скрипты; `fixture migration rehearsal` — CRM, в CI зелёный) |
| Витрина (`qa-matrix`) | 540/540 загрузок (Chromium, WebKit, Firefox × 12 ширин × 15 страниц) без ошибок/overflow; покупка до заказа 9/9 |
| Кабинет (`qa-cabinet`) | 12/12 (3 движка × 4 ширины), IDOR нет, отменённая ТТН скрыта |
| Изменённые экраны ADDENDUM (`qa-addendum`) | 140/140 (Chromium + WebKit × 7 ширин × 10 экранов), включая распознавание экрана ошибки |
| Accessibility (axe WCAG 2.1 AA) | 0 нарушений на 30 проверках |
| SEO | Lighthouse 100; robots, canonical, JSON-LD Product/Offer/BreadcrumbList — тесты |
| Performance | Lighthouse desktop 82–85 / mobile 55–59 на `php -S` без gzip (production сжимает и кеширует) |
| Security | независимый ECC code review: P0/P1 нет; RV-1…RV-4 исправлены; новых endpoint’ов нет |
| SITE ↔ PIM | pim-v3-* тесты зелёные; PIM прочитан, не изменён |
| SITE ↔ CRM | crm-domain/security/confirmation/shipping/browser зелёные (кроме migration — окружение) |
| P0 / блокирующие P1 | открытых нет |

## Не проверено

- Реальные устройства iOS/Android (только движки Playwright).
- Live MonoPay / Nova Poshta / SMS-провайдер.
- Реальный каталог и фото на стейджинге за Apache (Lighthouse на production-подобном сервере).
- Пользовательское тестирование конструктора на реальных участниках (только сценарная экспертная проверка).
