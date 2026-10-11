# STAGE CHECKPOINT — история этапов

Правило владельца (2026-10-11): после каждого этапа — проверенная контрольная точка; тег `rubizh-stage-N-verified` только если все обязательные проверки зелёные на одном HEAD, включая CI для точного SHA. Push коммитов и тегов — только с явного разрешения.

Сопоставление этапов (на подтверждение владельца): этапы 1–6 = фазы 2–7 ADDENDUM №2. Правило получено, когда все шесть уже были реализованы, поэтому общий quality gate выполнен на одном итоговом HEAD для всех шести.

## Сводка

| Этап | Содержание | Коммит реализации | Статус | Тег |
|---|---|---|---|---|
| 1 | Главная: одна CTA, кнопки, пустой поиск (A-1…A-4) | `7b4aa86` | INCOMPLETE (нет CI для SHA) | — |
| 2 | Инструкция конструктора (K-1) | `a33613e` | INCOMPLETE (нет CI для SHA) | — |
| 3 | Удобство конструктора (K-2…K-10) | `1998ef0` | INCOMPLETE (нет CI для SHA) | — |
| 4 | Каталог: поиск, пустые результаты (C-1…C-4) | `f032253` | INCOMPLETE (нет CI для SHA) | — |
| 5 | Кабинет 2.0 (P-1…P-7) | `41786ac` | INCOMPLETE (нет CI для SHA) | — |
| 6 | Соцсети в футере (S-1) | `7b4aa86` | INCOMPLETE (нет CI для SHA) | — |
| gate | Исправления по независимому ревью и QA | `62d7d52`, `0a8dc24`, `98ef261` | — | — |

**Проверенный код всех шести этапов: `98ef261`** (дата 2026-10-11). PIM: `21198461f8ebb2eadef6dcd6fb77a50a8a038ea9` (без изменений, чистое дерево). CRM: не подключён; код CRM не менялся.

Последний CI: `3326514` — success (до ADDENDUM). Для `98ef261` CI не запускался: требуется push.

## Результаты gate на `98ef261`

- Unit/integration/regression: `npm test` 325 → 321 pass, 4 fail (ограничения окружения macOS, идентичны `59b4685`).
- Browser QA: витрина 540/540 + покупка 9/9 (3 движка); кабинет 12/12; экраны ADDENDUM 140/140 (Chromium + WebKit, 360–1440).
- Security: независимый ECC code review — P0/P1 нет; RV-1 (P2), RV-2 (P3), RV-3 (P3), RV-4 (P2) исправлены regression-first.
- Accessibility: axe — 0 нарушений (30 проверок). SEO: Lighthouse 100. Performance: desktop 82–85, mobile 55–59 (php -S без сжатия).
- Интеграции: PIM v3 тесты зелёные (PIM не менялся); CRM-тесты SITE зелёные кроме migration (окружение).
- Исправлено в ходе этапов: D-36…D-39, RV-1…RV-4 (см. 03).
- Ограничения: live MonoPay/НП/SMS не проверялись; RV-4 требует sandbox monobank.
- Не проверено: реальные устройства, реальные пользователи, production-подобный сервер.

## Решение по этапам 1–6: **INCOMPLETE** (без тега `verified`)

Единственный невыполненный обязательный пункт — CI для точного SHA. После разрешения на push: `git push origin hardening/site-release-20261011` → CI для итогового SHA → при success создать annotated теги `rubizh-stage-1-verified` … `rubizh-stage-6-verified` на проверенном коммите и (с отдельного разрешения) отправить теги.

## Восстановление этого состояния

```sh
cd ~/Projects/rubizh && git fetch origin
git switch hardening/site-release-20261011
git checkout 98ef261            # проверенный код этапов 1–6 (detached HEAD)
# окружение тестов и QA: docs/release-hardening/SESSION_HANDOFF.md, раздел «Восстановление стенда»
cd ~/Projects/pim.rubizh && git checkout 21198461f8ebb2eadef6dcd6fb77a50a8a038ea9   # PIM той же точки (read-only)
```
