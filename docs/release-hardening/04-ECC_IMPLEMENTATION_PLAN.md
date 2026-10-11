# 04 — ECC IMPLEMENTATION PLAN (фактическое состояние)

Обновлено 2026-10-11 при паузе сессии. Утверждено владельцем; работа в `hardening/site-release-20261011` (от `59b4685`).

## Выполнено

| Этап | Содержание | Состояние |
|---|---|---|
| 0 Стенд | PHP 8.2 + MariaDB 11.4 (как CI) + GNU findutils + Playwright Chromium/WebKit/Firefox; тесты переносимы через env | готово |
| 1 Деньги | D-02 COD, D-03, D-04, D-13, D-25 | FIXED, regression-first |
| 2 Галерея | D-01, D-05, D-17, D-26 | FIXED, regression-first |
| 3 UI | D-06, D-07, D-08 | FIXED; D-09 заблокирован (нет файлов) |
| 3b Кабинет | D-10 + браузерный QA кабинета (3 движка × 4 ширины, IDOR, ТТН) | готово, всё зелёное |
| 5 (частично) | полный `npm test`; браузерная матрица QA запущена (см. handoff) | частично |

## Осталось (по порядку)

1. Дочитать результат браузерной матрицы (`qa-matrix`) и занести в `05-BROWSER_QA_MATRIX.md`; исправить найденное.
2. Решения владельца Q-4…Q-7 (см. 03) и D-09 (файлы баннеров).
3. P2/P3: D-11, D-14, D-18, D-20, D-21, D-22, D-24, D-27, D-28 — каждый regression-first.
4. Interaction inventory (no dead buttons), Lighthouse baseline/after, SEO-проверка `tests/.staging/seo-check.mjs` на fixture.
5. `07-SECURITY_PERFORMANCE_REVIEW.md`, `08-RELEASE_READINESS.md`.
6. Финальный `/ecc:code-review` по диффу `59b4685..HEAD`, исправления, повтор тестов.
7. CI на GitHub для ветки (после push проверяется автоматически).

## Не входит без отдельного разрешения
Production deploy, production migrations, включение v3, PIM-патчи, реальные платежи/invoice, реальные ТТН, reset/импорт каталога, изменения CRM, merge в main.
