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

1. Решения владельца: Q-4…Q-9 (03), файлы баннеров D-09/D-23.
2. Дополнительное ТЗ владельца (главная, конструктор комплектов, каталог, кабинет 2.0, Instagram/TikTok) — сопоставить с этим планом, исключить дубли, добавить только новое.
3. Финальный `/ecc:code-review` по диффу `59b4685..HEAD`, исправления, повтор тестов, `08-RELEASE_READINESS.md` (GO/NO-GO).
4. CI на GitHub после каждого push.

## Не входит без отдельного разрешения
Production deploy, production migrations, включение v3, PIM-патчи, реальные платежи/invoice, реальные ТТН, reset/импорт каталога, изменения CRM, merge в main.
