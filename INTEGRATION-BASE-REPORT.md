# Integration base — main + pricing v1

Дата: 2026-10-09. Ветка: `integration/site-pim-v3-foundation-2026-10-09`.

## Compare / conflicts

- SITE main, проверенный через `git fetch`: `0e7dafa39e632690220d5d93669e571254286388`.
- Pricing baseline: `bee58327e859efb618faea3631229de3fd3c1e39`.
- Принятый audit: `858faaffdcaaab62f644ca56fa2339c9e6fb3a5d`.
- `git merge-base main pricing` = `0e7dafa39e632690220d5d93669e571254286388`.
- Main является предком pricing; audit — потомок pricing и добавляет только четыре review-документа.
- Стороны не расходились: конфликтов **0**, conflict resolutions **0**, потерянных commits main **0**. Не создавался искусственный merge divergent branches.
- Integration branch создана от принятого audit, содержит весь main, pricing и audit. Application tree в этой базе побайтно соответствует pricing baseline; PIM-v3 логики нет.

## Изменения pricing относительно main

20 файлов, 7 586 добавленных / 103 удалённых строки:

```text
api/index.php
api/kits.php
api/lib.php
assets/shop-client.2026100803.js
docs/SHOP-PRICING-POLICY-V1.md
docs/SHOP-PRICING-VALIDATION-20261008.md
index.html
shop/catalog-lib.php
shop/checkout-quote.php
shop/kit-data.php
shop/order-lifecycle.php
shop/order.php
shop/pricing-policy.php
shop/pricing.php
shop/store-lib.php
shop/units.php
tests/pricing-browser.test.mjs
tests/pricing-database.test.mjs
tests/pricing-policy.test.mjs
tests/storefront.test.mjs
```

В integration-base commit добавляется только этот отчёт. Новая бизнес-логика, схема, capabilities, sync, checkout, MonoPay, NP, taxonomy или URLs не меняются. Все перечисленные pricing изменения уже находятся в истории bee5832 и сохраняются.

## Инварианты

Сохраняются schema4/DECIMAL prices, `shopMoney`/server validation, atomic sync/quote revisions, SKU ownership protection, private pricing storage, existing order/account/NP/MonoPay/storefront код. Live DB/production не открывались, реальный PIM sync не выполнялся.

Mixed cart решение владельца зафиксировано для будущего contract foundation: любой PREORDER/ORDER_ON_REQUEST/SIZE_CONFIRMATION_REQUIRED/manager-confirmation line → whole order WAITING_CONFIRMATION → один общий платёж после подтверждения. Автоматического split нет. В integration base и foundation исполняемый checkout не меняется.

## Regression gate

После этого commit и **до foundation** запускается весь существующий tracked regression suite на isolated локальной MariaDB и Chromium; тестовые schemas и contacts синтетические. Production credentials/config не используются. Девять ранее неотслеживаемых model-migration tests запускаются отдельно как дополнительные workspace checks, но не добавляются в этот commit.

Результаты текущего запуска, точный integration-base SHA и последующей foundation validation будут в `FOUNDATION-REPORT.md`. Исторический отчёт pricing116 не заменяет этот запуск.

## Воспроизведение compare

```sh
git merge-base 0e7dafa39e632690220d5d93669e571254286388 bee58327e859efb618faea3631229de3fd3c1e39
git merge-base --is-ancestor 0e7dafa39e632690220d5d93669e571254286388 HEAD
git merge-base --is-ancestor bee58327e859efb618faea3631229de3fd3c1e39 HEAD
git diff --stat 0e7dafa39e632690220d5d93669e571254286388 bee58327e859efb618faea3631229de3fd3c1e39
git diff --exit-code bee58327e859efb618faea3631229de3fd3c1e39 HEAD -- api shop auth assets index.html storefront.php .htaccess sitemap.php feeds
```

`PRODUCTION_WRITES = 0`; `PIM_SYNC_ENABLED = false` означает **v3 integration выключена**. Existing legacy `/api/pim/sync` остаётся в исходниках без изменений и проверяется только локальным fixture-тестом.
