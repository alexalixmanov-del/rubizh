# 02 — FULL AUDIT (фаза A, статический аудит)

Метод: чтение кода SITE @59b4685 и PIM @2119846, четыре параллельных read-only аудита (ECC `code-explorer`, `php-reviewer`, `security-reviewer`, `Explore`) с повторной проверкой ключевых утверждений по коду. **Ничего не запускалось в браузере и не тестировалось на БД** (блокер B-1). Находки — в 03-DEFECT_REGISTER.

| Раздел ТЗ | Статус | Итог |
|---|---|---|
| §4 Архитектура | проверено по коду | 01-SOURCE_OF_TRUTH |
| §5 Галерея цвета | root cause найден | D-01, D-05, D-17 |
| §6 Recently viewed | root cause найден | D-06, D-07 |
| §7 Мобильная карусель категорий | root cause найден | D-08 |
| §8 Баннеры | Drive доступен публично (49 PNG, всё уже сопоставлено 08.10) | D-09, D-23 |
| §9 Карточка товара | частично (галерея, выбор размера v3/legacy) | остальное — этап 5 |
| §10 Каталог/поиск/фильтры | **не проверено** | этап 5 |
| §11 Корзина | серверная часть проверена: цена, сумма и количество не доверяются клиенту | без дефектов P0/P1 |
| §12 Checkout | серверная часть проверена; идемпотентность по `request_id` | D-02, D-18 |
| §13 MonoPay | проверено по коду; live не проверялся и не будет без разрешения | D-03, D-04, D-12, D-13, D-19, D-20 |
| §14 NP/ТТН | создание ТТН защищено от дублей; склады в `npOrigins()` | D-10; refs складов — runtime config, не проверено |
| §15 Кабинет | IDOR не найден (`customerOrder` по `customer_id`, `shopMayReadOrder`) | D-10, D-15 |
| §16 Статусы | матрица в 01 | противоречивые состояния: D-03, D-04, D-12, D-19 |
| §17 PIM v3 | контракт совпадает; расхождения латентные | D-14, D-21, PIM-1, PIM-2 |
| §18–20 UI, responsive, браузер | **не проверено** | этап 5 |
| §21 Security | сессии, CSRF, SQL, XSS, SSRF, path traversal, секреты — без критичных находок | D-15, D-16, D-24 |
| §22 Performance | **не измерено** | этап 5 (baseline до правок) |
| §23 SEO | `storefront.php`: canonical, noindex при фильтрах, JSON-LD Product/Offer | остальное — этап 5 |
| §24 Стабильность | `health.php` отдаёт только `{ready}`; 503 + Retry-After при ошибке каталога | этап 5 |
| §25 Тесты/CI | 45 файлов `tests/*.test.mjs`, CI зелёный | локальный baseline — B-1 |

## Ограничения
- Production не проверялся: ни smoke, ни бэкапы (`site-before-final-20261010-225434.sql.gz`, PIM JSON) — нет доступа к хосту из этой сессии.
- Утверждения о поведении monobank (D-13) — предположения до сверки с документацией.

## Глобальный этап 2 — дополнение 2026-10-12 UTC (checkpoint)

Этот раздел дополняет исторический аудит этапа 1. Независимые направления сначала читали закреплённый SITE `51c83d808228a26328081b02211b4e3605353755`, PIM `21198461f8ebb2eadef6dcd6fb77a50a8a038ea9` и карту системы; проверки исправлений и финальное ревью относятся к более позднему коду. Итоговый проверяемый код — `e9ce24dffb41751b8e08b13b4dff5a5c6056d203`; doc-only checkpoint не меняет application/test tree. Общий статус этапа NO-GO, без verified tag.

Стенд: Linux, PHP 8.4, MariaDB, Playwright Chromium/WebKit/Firefox; синтетические данные, отдельные fixture-схемы, локальные mock-транспорты. Production PHP 8.2, реальные провайдеры, данные покупателей и устройства iOS/Android этим стендом не проверены. PIM и отдельный репозиторий CRM только читались; их код не менялся. Полные доказательства и подробности неразрешённых HIGH хранятся вне репозитория.

| Направление | Что установлено на этапе 2 | Граница вывода |
|---|---|---|
| Архитектура, PHP, БД | Проверены точки входа, статусы, подтверждение сохранённого оплаченного заказа, блокировки и резервирование | Не все статические предположения воспроизведены; общая политика резервов и источника остатков требует решения |
| Платежи и security | Выполнены независимые синтетические проверки подписи, порядка событий, конкуренции, версий и прав; после основного исправления найдены дополнительные пункты | Финальное независимое security-ревью **INCOMPLETE**; успешные тесты не заменяют его заключение |
| Доставка | Проверен локальный отказ справочника и продолжение оформления с ручным адресом; непроверенный адрес не становится подтверждённым | Реальная НП, ТТН и политика нескольких отправлений не подтверждены |
| SITE ↔ PIM | Проверены контракт, исходные SKU, валютная граница и элементы галереи модели; SITE-валидация уточнена | PIM-предложения не применены; данные UNKNOWN/OUT_OF_STOCK не удалялись |
| Q-8 | Правила K1–K6 реализованы в SITE; отдельное ревью обнаружило позднюю проблему восстановления корзины | Коррекция qty/N/retail mode e7de3ea зафиксирована и независимо проверена; размещённые заказы не пересчитываются |
| Frontend, accessibility | Украинская ошибка сети, клавиатурные границы диалогов, восстановление фокуса, семантика мобильных фильтров, выбранный размер, контраст фокуса | Локальная проверка не является сертификатом WCAG или проверкой всех assistive technologies |
| SEO | Проверены единое описание, полный Product/Offer, соответствие SKU/цены/остатка, robots/breadcrumbs при SPA-переходах и canonical пагинации | Живая индексация и rich results не проверялись |
| Performance | Подтверждены зависимость первого экрана от runtime, тяжёлые холодные запросы и дубли владения CSS | Архитектура не менялась; production p75, CDN/сжатие и фактическая ёмкость неизвестны |
| Release / ops | Проверены отказы installer по артефакту/схеме, HTTP smoke и синтетическое восстановление БД/исходников | Исторический артефакт намеренно отвергается; нового production-релиза и восстановления production не было |

### Проверенная база доказательств

| Проверка | Результат | Привязка |
|---|---|---|
| Linux baseline SITE | **351/351 pass; 0 fail, 0 skipped** | Закреплённый исходный код; `baseline-compatible.tap` вне репозитория |
| Первый полный прогон исправлений SITE | **435/435 pass; 0 fail, 0 skipped** | `final-regression.tap`; до поздних коррекций и финального checkpoint |
| PIM, без изменений | **682/682 pass; 0 fail, 0 skipped** | `pim-tests.log`; не означает применения предложений |
| Полная browser matrix | **315 загрузок + 21 поток покупки** | Повтор на final application tree; 3 движка × 360/390/430/768/1024/1280/1440 |

В matrix нет JS pageerror, горизонтального overflow и битых синтетических изображений; сообщения console о предусмотренном HTTP 404 на `product-404` сохранены отдельно, а не объявлены JavaScript-сбоями. Финальный повтор после поздних app-изменений завершён:315/315+21/21, ADDENDUM210/210, cabinet21/21; позднейшие QA-only commits app bytes не меняли.

### Состояние checkpoint

**INCOMPLETE; production NO-GO.** Неразрешённые HIGH публикуются только как ID и severity в итоговом реестре; эта оценка не превращает неподтверждённое предположение в production-факт. Остаются решения владельца и оставшиеся dynamic coverage/privacy условия; exact code CI success, doc-only checkpoint CI проверяется после push. Текущие исправления и checkpointи не дают права на merge, deploy, миграции, активацию провайдеров, изменение PIM/CRM или удаление assets.

Итоговая привязка: `e9ce24dffb41751b8e08b13b4dff5a5c6056d203`, `450/450 PASS;0FAIL/SKIP/CANCELLED;626167ms, tested1fcca317, identical app/tests in e9ce24d`, `Scoped payment/changes/QA review approved; fresh whole SECURITY source review COMPLETED;15 selected checks+1 bounded probe`, `[38307425169](https://github.com/lieverifying/rubizh/actions/runs/38307425169) SUCCESS on e9ce24d, PHP8.2/8.3; exact final doc-only checkpoint CI checked after push`. Живой сквозной E2E сохраняет статус **DEFERRED → глобальный этап 6**, а не PASS.


**Ограничение приватности:** GitHub repository visibility проверено как public. Унаследованный commit2a338da содержит исходные HIGH raw; обычный push сохранил эти версии в истории. Текущие документы редактированы, новые полные доказательства остаются local/private, но обещать приватность исторических raw нельзя. История не переписывалась: force-push запрещён владельцем. QA-20 MEDIUM / OWNER DECISION фиксирует процессный дефект; cleanup требует отдельного решения и не отменяет уже случившуюся публикацию. Технические подробности неразрешённых HIGH здесь не повторяются.

Final endpoint Quality Gate:132inventory rows,1920HTTP requests;831/831explicit expectations,2697/2697overlapping semantic checks,975snapshots+2A↔B whole-domain comparisons;0final assertion failures. ANY232/232 and narrowaction36/36; all inventory endpoints requested, full state/role/token combinations remainPARTIAL. Details and limits:stage-2/endpoint-quality-gate.md. Fresh SECURITY source review COMPLETED(15checks+1probe), no newHIGH/CRITICAL; MEDIUM SEC-FRESH-01 unapplied CRM proposal. OverallNO-GO: exhaustive dynamic certification and historical privacy requirement unmet, noStage2verifiedtag/Stage3.
