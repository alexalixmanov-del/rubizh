# SITE catalog performance baseline — 2026-10-09

## Scope and decision

This commit records diagnostics only. No SITE runtime, PIM contract, checkout,
pricing, taxonomy, URLs, capability advertisement or production database was
changed. No indexes were added to the application schema.

The final post-G02 exact wire fixture is unavailable. The user confirmed that
PIM release `27fb26056563eb1fcf144ffdb2ba9ab264fa9313` is not the final wire
specification. Normalized-field ingestion/query changes remain deferred until
the real fixture is supplied. This is not an implementation or AFTER report.

## Evidence boundaries

- Production evidence: ADM.TOOLS screenshot of an October 6 COUNT query,
  six executions, 13,819,380 rows examined, six rows sent, about 216 seconds
  total. A COUNT returns one aggregate row per execution; six rows sent does
  not mean six matching products.
- The screenshot truncates the SQL. It does not supply the complete original
  statement/parameters, deployed source revision, EXPLAIN, table DDL or indexes.
  No production connection was used. Production EXPLAIN and SHOW INDEX remain
  unavailable; the artifacts below must not be described as production plans.
- Historical SQL was reconstructed from the actual generator at
  `1b88ab516031e23119b23e655278b3ea5bf81753`, with `slot=med`, hide-unavailable
  enabled, default first page/order and no additional filters. It matches the
  visible SQL fragment, including aliases, stock/date JSON rules and slot CASE.
  The unseen remainder of the production statement cannot be verified.
- Current code was traced at
  `ded3a70a0e18272b0e6ea92cc90bf566c64bd4cf`.
- The isolated fixture contains the supplied October 8 SITE snapshot:
  **3,103 products, 8,682 variants, 19,025 photos**, 3,103 canonical product
  relations, 137 canonical category definitions and 348 category aliases.
  Rows were copied as supplied, without reclassification, SKU merging,
  new mappings or supplier-stock confirmation.
- Database: local socket-only MariaDB 11.8.6, schema
  `fixture_catalog_perf_20261009`. Legacy table/index definitions were created
  from SITE schema code, not copied from production SHOW CREATE TABLE.
  Foundation/ingestion migrations were not applied.
- The snapshot does not include `canonical_taxonomy` activation metadata.
  Current handler traces therefore use the existing inactive-taxonomy path;
  activation was not guessed. The persisted canonical relation tables were
  preserved and their indexes inspected separately.
- Media files were not restored. Existing `product_photos()` fallback returned
  supplier URLs; no external images were fetched. Measurements concern SQL and
  PHP handler execution, not browser/image loading or concurrent traffic.
- Private snapshot, supplier data, local configuration and filesystem caches
  remain outside Git. Published evidence contains query structure, public
  product IDs in generated IN lists, aggregate metrics and schema metadata.

## Endpoint and source

`GET /shop/catalog.php?slot=med`

Historical path:

1. `shop/catalog.php` dispatches to `shopCatalog()`.
2. Historical `shop/catalog-lib.php:46` caches `shopCatalogBuild()`.
3. `shopCatalogBuild():51` adds the hide-unavailable variant predicate.
4. Lines 59–64 add slot CASE, photo EXISTS and another buyable variant EXISTS.
5. Lines 74–82 can add availability/size/color variant predicates again.
6. Line 94 builds COUNT; line 97 builds the paginated product SELECT.
7. Historical `shop/units.php::shopBuyableSql()` expands legacy variant JSON
   stock, size confirmation and expected-availability-date conditions.

The duplicate predicate has a concrete cause: each feature independently
appends its own correlated EXISTS. For `med`, the slot-specific predicate adds
no extra clothing/footwear size restriction, so it repeats the hide-unavailable
buyable condition under another alias. Explicit `availability=available` adds
another identical predicate; variant filters and facet queries add more copies.
An `availability=in` or size/color-specific condition has additional semantics
and must not simply be deleted as though every EXISTS were equivalent.

### Current runtime differs from the historical log

At the traced current revision, `shop/catalog.php:26` still dispatches to
`shopCatalog()`, but `shop/catalog-lib.php:55` routes a recognized slot to
`shopKitCatalog()`. `shop/kit-catalog.php:14` selects candidate products using
name REGEXP, photos and coarse variant availability, then PHP filters and
normalizes the candidate variants. It does **not** run the historical COUNT.

The ordinary catalog still uses `shopCatalogBuild()` and JSON-heavy
`shopBuyableSql()`. With hide-unavailable enabled and
`availability=available`, the current COUNT contains two identical `av`
EXISTS clauses (`shop/catalog-lib.php:74` and `:104`). Its generated SQL is
25,319 bytes because the cached PHP size classification is expanded into
literal product-ID IN lists as well as repeated JSON conditions.

## Measured baseline

Six serial executions per SQL, fetched to completion. Time is wall-clock PDO
execution plus fetch, in milliseconds. Rows examined/sent are **actual**
`mysql.slow_log` counters, matched by connection ID and full SQL text. EXPLAIN
row estimates and table-index cardinalities are reported separately and were
not substituted for rows examined. Buffer pool was not flushed; this is not a
six-run cold-cache or load test.

| Query | Median ms | Rows examined per run | Rows sent per run | Result |
| --- | ---: | ---: | ---: | --- |
| Historical reconstructed COUNT, `slot=med` | 221.817 | 15,221 | 1 | COUNT = 9 |
| Historical reconstructed catalog SELECT, `slot=med` | 218.526 | 15,239 | 9 | 9 products |
| Current kit candidate SELECT, `slot=med` | 16.473 | 11,810 | 5 | 5 candidates |
| Current ordinary COUNT, `availability=available` | 128.526 | 17,426 | 1 | COUNT = 2,226 |
| Current ordinary catalog SELECT, `availability=available` | 157.086 | 19,676 | 24 | 24 products |

The historical/current slot paths return different sets (9 versus 5), with
different eligibility logic. These numbers are **not** a semantics-preserving
BEFORE/AFTER comparison. They also cannot reproduce the October 6 production
duration: snapshot date, server, indexes, statistics, load and possibly unseen
filters differ.

Cold current handler calls, including facets and DTO work, took 31.338 ms for
the kit slot and 1,179.381 ms for the ordinary available catalog. These are
single local handler measurements, not endpoint p95 or browser latency.

## EXPLAIN and inspected indexes

The historical COUNT plan starts at `variants av` with **type ALL / key NULL**,
then joins products through PRIMARY, photos through `prodpos`, and the second
variant predicate through `prod`. The SELECT additionally uses a temporary
table/filesort. The current available COUNT also starts with an ALL scan of
`av`, despite the product relation index being present.

This demonstrates that missing relationship indexes alone do not explain the
local slow path. Expensive eligibility expressions are evaluated on a broad
variant scan. Exact production optimizer behavior is still unknown.

| Requested field / relationship | Isolated index inspected |
| --- | --- |
| `products.id` | `PRIMARY(id)` |
| `products.visible` | `vis(visible, availability)` |
| Legacy `products.category_id` | `cat(category_id)` |
| Public `canonical_category_id` | Stored through `rubizh_product_categories.category_id`; `category(category_id, product_id)` and `PRIMARY(product_id)` |
| `variants.product_id` | `prod(product_id)` |
| `variants.sku` | `PRIMARY(sku)` |
| `photos.product_id` | `prodpos(product_id, pos)`; unique |
| Product price/sort alternatives | `price(price_min)`, `slug(slug)` |
| Photo workflow alternatives | `st(status)`, `src(src_hash)` |
| Canonical category hierarchy | `rubizh_canonical_categories.parent(parent_id)` |

`canonical_category_id` is a DTO identity, not a physical column of this legacy
`products` table. It must not be confused with the old `products.category_id`.
Future normalized-field index choices require the final wire, populated
isolated foundation data, the exact new queries and their EXPLAIN. None were
invented or added here.

## Remaining runtime rediscovery inventory

| Source at current revision | Remaining behavior |
| --- | --- |
| `shop/units.php:19`, `:33`, `:39` | PHP slot/name/category matching, inferred size confirmation, JSON-derived quantity/date/order eligibility |
| `shop/units.php:44–50` | SQL JSON_VALID/EXTRACT/UNQUOTE, stock CAST and date REGEXP in buyable predicate |
| `shop/units.php:56–67` | SQL slot CASE and name/category/primary-item REGEXP |
| `shop/catalog-lib.php:62–69` | PHP classifies all visible products for size-required ID cache; IN list reused in SQL |
| `shop/catalog-lib.php:110–117`, `:136–140` | PHP size matching, repeated buyable facet predicates, JSON native-size facet |
| `shop/catalog-lib.php:18–40` | Legacy product/variant JSON parsing and inferred public display/availability fields |
| `shop/catalog-lib.php:187–197` | Related-product eligibility and name/category REGEXP |
| `shop/kit-catalog.php:10–24`, `:39` | SQL candidate REGEXP followed by PHP slot/variant/size discovery |
| `shop/normalization.php:31`, `:76–78` | JSON native sizes and attributes, material/hood regex normalization |
| `shop/normalization.php:5`, `:33–36` | Legacy SQL size/height generators still defined; not observed in the two current handler traces |

Generated historical SQL contains 19 REGEXP, 12 JSON_EXTRACT and three EXISTS
operations. Current available COUNT contains two REGEXP, 18 JSON_EXTRACT and
two EXISTS operations. Current kit SQL has two REGEXP and no JSON_EXTRACT,
but PHP still rediscovers PIM fields. Zero rediscovery is **not** achieved.

## Artifacts and verification

Evidence is in [catalog-performance-20261009](catalog-performance-20261009/):

- `before-count.sql`, `before-catalog.sql`: reconstructed historical statements.
- `baseline.json`: six runs, actual counters, EXPLAIN, SQL operation counts,
  hashes, snapshot hash and environment/source provenance.
- `indexes-before.json`: complete isolated SHOW INDEX output for products,
  variants, photos and canonical category/relation tables.
- `current-kit-med-1.sql`, `current-catalog-available-1.sql`,
  `current-catalog-available-2.sql`: captured current generator statements.
- `current-trace.json`: current handler inputs/results, selected query plans,
  six-run counters, read-only session settings and local-copy limitations.

Both current handler scenarios completed with `ok=true`; selected queries were
executed six times and their EXPLAIN captured. Current handler SQL connections
used `SET SESSION TRANSACTION READ ONLY`; local fixture setup occurred earlier
through explicit CLI. Artifact hashes, row counters and index references were
checked. No application regression suite was rerun for this evidence-only
commit; no claim of a new full-suite pass is made.

## Requested status

```text
CATALOG_QUERY_TIME_BEFORE = 218.526 ms (historical isolated median)
COUNT_QUERY_TIME_BEFORE = 221.817 ms (historical isolated median)
ROWS_EXAMINED_BEFORE = catalog 15,239 / count 15,221 per execution
ROWS_SENT_BEFORE = catalog 9 / count 1 per execution
EXPLAIN_BEFORE = captured on isolated DB; production unavailable
INDEXES_USED_BEFORE = PRIMARY, prodpos, prod; first av scan uses no index
CATALOG_QUERY_TIME_AFTER = NOT_RUN
COUNT_QUERY_TIME_AFTER = NOT_RUN
ROWS_EXAMINED_AFTER = NOT_RUN
ROWS_SENT_AFTER = NOT_RUN
EXPLAIN_AFTER = NOT_RUN
INDEXES_USED_AFTER = NOT_RUN
RUNTIME_CATEGORY_REGEXP = NONZERO
RUNTIME_PIM_FIELD_REDISCOVERY = NONZERO
RUNTIME_AVAILABILITY_JSON_REDISCOVERY = NONZERO
CAPABILITIES_ADVERTISED = []
PIM_SYNC_ENABLED = false
INGESTION_ENABLED = false
WIRE_CONTRACT_STATUS = UNCONFIRMED
PRODUCTION_WRITES = 0
PRODUCTION_CONNECTIONS = 0
APPLICATION_SCHEMA_INDEX_ADDITIONS = 0
```

The next dependent step is to pin the actual final G02 wire fixture, validate
its normalized publication/inventory/category/size fields and pricing v1,
then implement the agreed SITE integration on isolated data and repeat the
same filters with semantic result checks. Do not use old fixtures or guessed
mapping to manufacture an AFTER result.
