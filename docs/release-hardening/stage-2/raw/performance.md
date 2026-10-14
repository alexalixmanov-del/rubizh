# Stage 2 independent audit — PERFORMANCE (6.11)

Baseline: SITE `51c83d808228a26328081b02211b4e3605353755`. Every source reference below belongs to that pinned exported snapshot at `/workspace/onboarding/audit-source/site`; the export has no .git, so SHA provenance is supplied by the coordinator/system map rather than independently established by git. Read scope: baseline code, its 01-SOURCE_OF_TRUTH.md and stage-2/00-SYSTEM_MAP.md only. No register, prior reports, other domain raw reports, provider calls or production access. No application/test edits, commits or architecture implementation.

Method: isolated copies using baseline tests/helpers/site-fixture.mjs, loopback PHP/MariaDB, Playwright from /workspace/rubizh/node_modules; environment sourced from /workspace/onboarding/rubizh/environment.sh. Outbound browser requests aborted. Synthetic stock and images only; external product images intentionally fail, so product-image LCP is not measured. Chromium 390×844. Private evidence: performance-seo-local.json, performance-sql-local.json, performance-mobile-local.json under /workspace/onboarding/stage2-private. Routing intercept disables normal browser HTTP caching; payload/request totals therefore are cold diagnostic evidence, not normal repeat-visit totals. No real hosting compression/CDN/cache/traffic assumptions.

No CRITICAL/HIGH finding is confirmed. Three MEDIUM findings remain; hosting-specific capacity and real-user CWV are UNCLEAR.

## PERF-01 — First visible storefront depends on runtime compilation (MEDIUM, high confidence)

- SHA: pinned baseline above.
- Source: index.html:4 hides every x-dc template; index.html:9-14 defers React, ReactDOM, shop-client and store-runtime; assets/store-runtime.4b6bbf46ca4c.js:1 extracts the template, replaces it with dc-root, compiles/adopts it and renders through React; storefront.php:75 only exposes the fallback inside noscript.
- Scenario: cold mobile JS-enabled homepage, or a slow/failing runtime dependency.
- Evidence: index.html 286,139 bytes; shop-client 475,940; ReactDOM 128,933; store-runtime 36,311, before other scripts/CSS/fonts/boot. Unthrottled synthetic home TTFB 33.3 ms, DOMContentLoaded 294.1 ms, hero LCP 592 ms; long tasks 89/250/56 ms. Three throttled 390×844 runs (6x CPU, 150 ms latency, 200 kB/s) recorded DOMContentLoaded 9.39–11.02 seconds and individual long tasks up to 3.41 seconds, but ended before content paint. A settled follow-up using 200 synthetic products recorded FCP and mobile hero LCP both at 12,460 ms, TTFB 1,514.2 ms and DOMContentLoaded 8,974.9 ms; long task 2,583 ms. This is one simulated, uncompressed loopback sample, with local resource contention and browser routing disabling HTTP cache; it is not production p75. No-JS response instead displays the server fallback H1 and category links.
- Impact: usable first-screen content waits for network/parse/compile/render despite early hero preload. Dependency failure with JS enabled leaves the template hidden and the noscript fallback unavailable.
- Proposed fix: OWNER DECISION on first-screen delivery below; keep route metadata/data authoritative on the server and measure cold mobile before/after. Do not merely hide the delay with a loader.

## PERF-02 — Cold catalogs still perform broad JSON/REGEXP/facet work before HTML (MEDIUM, high confidence on code/local evidence; production magnitude unverified)

- SHA: pinned baseline above.
- Source: storefront.php:25,53,65 synchronously obtains categories/full catalog before returning HTML, including homepage. shop/catalog-lib.php:83-89 scans visible products into an IN list; :135-137 scans size candidates; :152-168 computes count, list, brand/camo/leaf/size/attribute and price facets. shop/units.php:51-57 retains JSON and REGEXP buyability predicates. api/perf.php:60-106 performs an inline build for genuinely cold cache keys; only an existing previous snapshot gets bounded stale/background refresh (:79-83). api/lib.php:41-44 limits each SQL statement to 6 seconds, not aggregate request time.
- Scenario: new filter/search key or catalog cache invalidation with no usable previous snapshot on a legacy catalog.
- Evidence: baseline dev/catalog-sql-profile.php executed on 200 synthetic visible jacket products, 1 variant and pending usable photo each, default runtime indexes. Default: 674.3 ms/108,055 handler reads; availability=in: 843.0 ms/149,000; q=куртка: 1,166.3 ms/168,730; sort=cheap: 1,355.2 ms/127,425. EXPLAIN COUNT scans all 200 variants (ALL; no chosen key), uses products PK and photos prodpos. Generated predicate has both REGEXP and JSON. A separate 2,000-product invocation exceeded the helper's 60-second process timeout; that run produced no completed timings and is a failed profiling check, not a measured request latency.
- Impact: cache warmth masks substantial request work; the cold homepage computes facets the first screen does not need. Scale/timeouts and pool contention remain risks. Fixtures lack real distributions/extra hosting indexes; other auditors share local DB resources, so timings are diagnostic, not production estimates.
- Proposed fix: profile cold/warm requests with representative synthetic cardinality and explicit installed indexes; decide whether homepage needs a separate compact dataset or facets can load after the visible list. Review materialized category/size/buyability data and indexed predicates only in a separately authorized implementation.

## PERF-03 — Blocking CSS includes duplicate template styles and below-screen rules (MEDIUM, high confidence)

- SHA: pinned baseline above.
- Source: index.html:2,5,30 links theme.css, store CSS and 128,376-byte head-bundle as blocking stylesheets; :59-65 repeats store CSS and adds more styles inside helmet. assets/head-bundle.2026101201.css:1-4 describes its concatenated sources, including mobile.40ec4f813ab1.css, also present at index.html:63.
- Scenario: cold small-screen home/product/catalog navigation over restricted bandwidth.
- Evidence: theme.css 18,025 + base store CSS 12,986 + bundle 128,376 = 159,387 bytes initially linked. Fixture resource entries also show helmet styles (mobile, experience, ui-addendum, store variants) discovered from the template and again during runtime processing. Duplicate entries under Playwright routing are not proof of duplicate transfer with a normal HTTP cache.
- Impact: first render waits for a broad stylesheet set; bundled and individually linked overlapping sources add parse/transfer pressure, while hero preload competes with required CSS/scripts.
- Proposed fix: map final cascade and eliminate duplicate ownership; isolate measured first-screen rules and defer unrelated rules only after a visual parity check. Preserve theme initialization to avoid a flash.

## Images / reviewed safeguards

Hero uses responsive picture selection, explicit 1860×845 dimensions, WebP, high fetch priority and no lazy loading (index.html:303-304); hero-theme.2026100801.js:7-13 preloads only on home and :19 avoids other-route hidden hero downloads. Mobile dark/light artwork is 55,064/68,962 bytes; desktop dark is 136,346. Category, kit and guide art has dimensions and lazy/async decoding (index.html:342,358,434,2074). Product cards reserve 480×600 and first four become eager/first two high priority (index.html:592,631; shop-client:7071). Main product gallery reserves a positioned container; first slide eager (:788); some thumbnails omit intrinsic attributes but fixed/aspect-ratio containers reserve layout space. Processed product media is WebP with default 1600px full/480px thumbnail (api/photo-storage.php:29-52); pending/missing local files return external supplier originals (api/lib.php:412-414), so their dimensions, transfer size and provider latency remain unbounded by the local thumbnail conversion. No AVIF requirement is inferred.

## OWNER DECISION — first-screen options (proposal only)

| Option | Expected impact | Risk | Effort | SEO consequence |
|---|---|---|---|---|
| A. Retain client UI; slim/serve compressed assets, deduplicate CSS, compact homepage boot, postpone nonessential recommendations | Reduces transfer/blocking work; runtime remains on visible-content path | Low–medium; cascade and delayed UI behavior need parity checks | Small–medium | Keeps server metadata/noscript; must repair server/client metadata consistency |
| B. Server-render a real visible header/hero and product/category first screen; attach existing interactions progressively | Removes runtime as prerequisite for first meaningful content; protects JS-failure paths | Medium; clear DOM ownership and data parity needed | Medium–large | Best direct crawlable-content parity when canonical, schema, stock and money share the DTO |
| C. Replace template compiler with precompiled route UI / broader rendering migration | Larger sustained CPU/payload improvement possible | High; touches navigation/state/checkout integration | Large | Requires full route/indexing regression coverage; poor migration can regress currently correct server metadata |

Recommendation: B for robust first-screen content, staged after A's low-risk payload/cascade work, subject to OWNER DECISION. This audit does not choose or implement architecture. Acceptance should compare warm/cold mobile FCP/LCP/long tasks, same content with JS off/failed, stock/money/schema consistency and visual parity on home/catalog/product. Real production p75 LCP and capacity remain unmeasured.
