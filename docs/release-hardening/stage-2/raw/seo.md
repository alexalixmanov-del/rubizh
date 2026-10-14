# Stage 2 independent audit — SEO (6.12)

Baseline: SITE `51c83d808228a26328081b02211b4e3605353755`. Source references are relative to /workspace/onboarding/audit-source/site at that SHA. Export lacks .git; supplied snapshot provenance comes from the coordinator/system map. Blind read scope: baseline code plus its 01-SOURCE_OF_TRUTH.md and stage-2/00-SYSTEM_MAP.md only. No register, Stage 1 reports or other raw domains. No application/test changes or commits.

Method: synthetic isolated PHP/MariaDB legacy fixtures, Playwright loopback-only with all outbound browser requests aborted. Six routes × JS on/off (12 responses), plus client navigation from filtered catalog to product. All 12 responded 200, all expected visible H1s were present and there were no pageerror events. Raw local evidence is private at /workspace/onboarding/stage2-private/performance-seo-local.json and seo-nav-local.txt. Product photographs reference a synthetic blocked host: schema/image-presence findings concern DOM fields, not actual image-download success.

No CRITICAL/HIGH finding is confirmed. Four MEDIUM and one LOW findings remain.

## SEO-01 — Hydration reasserts InStock without known stock (MEDIUM, high confidence)

- SHA: pinned baseline above.
- Source: storefront.php:32-34 deliberately removes Offer availability when product availability is in but no variant has known positive stock. shop/catalog-lib.php:55 records unknown stock as null. assets/shop-client.2026101101.js:5886-5901 replaces Product JSON-LD and sets InStock from availability flags through allOut/allPre, without the server stock check.
- Scenario/evidence: synthetic jacket AUDIT-unknown, price 1500 UAH, availability=in, omitted stock. Direct HTML/no-JS Offer has no availability; JS-rendered Offer says https://schema.org/InStock. A second jacket with stock=2 consistently says InStock.
- Impact: rendered structured data asserts stock more strongly than server evidence; crawlers obtain inconsistent Offer availability.
- Fix: one authoritative stock-aware schema projection shared by SSR and SPA; do not regenerate availability from permissive display/buyability flags. Verify zero, null, positive and mixed-variant inventory. Unknown stock should not become known stock during hydration.

## SEO-02 — Client replaces richer Product schema with an image-less model offer (MEDIUM, high confidence)

- SHA: pinned baseline above.
- Source: storefront.php:34,36-37 emits Product image, brand, description, variant SKU and Offer URL/seller; assets/shop-client.2026101101.js:5888-5901 overwrites it with name, model id as sku, url and price/currency/availability only.
- Scenario/evidence: both synthetic jackets have server image=[https://img.test/a.webp], brand Audit, SKU AUDIT-known/unknown and seller. After hydration image/brand/description/seller/Offer URL disappear; sku becomes audit-known/unknown. Price stays numeric 1500 with currency UAH.
- Impact: JS-rendered markup loses image needed for Product merchant-listing eligibility and loses descriptive/identity parity. Rich-result appearance is not guaranteed or tested against a live search provider.
- Fix: preserve complete authoritative Product markup on initial hydration; generate the same full schema on SPA product transitions. Use stable product/variant identity and a price that belongs to the stated offer; consider AggregateOffer or explicit variant offers for ranges. Do not infer rich-result eligibility merely from a Product type.

## SEO-03 — Two meta descriptions on non-home storefront responses (MEDIUM, high confidence)

- SHA: pinned baseline above.
- Source: index.html:34 contains generic description; storefront.php:35,45-47,57 appends route-specific description at :74. :73 removes old title only. assets/shop-client.2026101101.js:5857-5867 modifies first matching description and leaves the second.
- Scenario/evidence: no-JS product/catalog emits generic home description plus route description. JS product emits generic fallback “Розміри, ціна та доставка по Україні.” plus route-specific source description. Catalog similarly contains two descriptions; home has one.
- Impact: ambiguous snippet metadata and inconsistent route description before/after runtime.
- Fix: replace the template description when adding route metadata; ensure exactly one description per direct response and SPA state. Client should use the same public description field as SSR.

## SEO-04 — SPA product inherits catalog noindex and breadcrumbs (MEDIUM, high confidence)

- SHA: pinned baseline above.
- Source: storefront.php:58 emits noindex,follow for non-page catalog query parameters; :37,59 emits server BreadcrumbList. assets/shop-client.2026101101.js:5849-5903 updates canonical/title/Product but neither robots nor BreadcrumbList.
- Scenario/evidence: open /catalog?sort=cheap then click a real product card link. Browser path becomes /product/audit-nav; Product schema and canonical update, but robots remains noindex,follow and BreadcrumbList remains only home→catalog. Direct product requests have no noindex and the full category→product trail.
- Impact: rendered SEO state depends on entry route. A crawler or renderer following client navigation may retain a noindex declaration or irrelevant breadcrumb data.
- Fix: centrally own route robots and breadcrumb metadata; remove/replace it on every screen transition, including private/shared kit routes. Verify transitions in both directions and direct URL behavior.

## SEO-05 — Out-of-range pagination canonical disagrees after hydration (LOW, high confidence)

- SHA: pinned baseline above.
- Source: shop/catalog-lib.php:153 clamps requested page to available pages; storefront.php:56 canonicalizes using the clamped result; assets/shop-client.2026101101.js:5864 uses t.catPg.
- Scenario/evidence: two-product fixture /catalog?page=2. Direct HTML canonical is /catalog (actual page=1); after JS canonical is /catalog?page=2.
- Impact: duplicate/out-of-range listing URLs are canonicalized inconsistently. Genuine second-page behavior with more than 24 products was not tested here.
- Fix: normalize client pagination state to authoritative boot result before computing canonical; optionally redirect out-of-range page requests consistently.

## Checklist evidence and limits

| Check | Outcome |
|---|---|
| JS/no-JS visible content | Direct product has name/description/price and catalog link, catalog has product links/pagination, home root-category links, categories/guide SSR fallbacks in storefront.php:38,45-47,60-65,75. Product no-JS fallback omits images, detailed variant/spec/stock data; richer visible content requires runtime. |
| Canonical | HTTPS apex product/category/home and page-aware catalog canonical in storefront.php:35,45-47,56-57,63,65; filtered query pages canonicalize to clean category and emit noindex. SPA has the pagination/state issues above. |
| Robots / sitemap | robots.txt:1-8 excludes account/internal APIs and shared-kit URLs, allows catalog data/analytics endpoint and exact public kit root; :37 advertises sitemap. sitemap.php:5-9 emits static pages, guides, published categories, visible usable-photo in/order products with a buyable variant. Both synthetic known/unknown-stock jackets included. No live robots override, indexing, sitemap submission or hosting rewrite behavior tested. |
| Language / hreflang | index.html:2 and legal HTML use lang=uk; storefront.php:69 uses uk on 404. No hreflang in storefront.php/index/sitemap. Code exposes a single Ukrainian locale, so no confirmed alternate-language defect; add reciprocal hreflang only if real translated canonical URLs exist. |
| Metadata / OG | Route title, canonical and OG fields are server-present before scripts (storefront.php:31-37); duplicate descriptions and client field parity findings above. Legal offer/privacy documents have their own titles/descriptions/canonicals and real visible content. |
| Product / Offer / availability | Positive numeric UAH prices match the two fixtures; server suppresses unknown InStock, client regresses it. Out/PreOrder branches exist. Mixed variants, decimal policy prices, all PIM-v3 stock states and provider truth are not fully validated by these fixtures. DTO/schema should share money/inventory decisions rather than infer them independently. |
| Breadcrumbs | Direct catalog home→catalog and product home→catalog→Одяг та форма→Куртки→product confirmed. storefront.php:13-19 omits URL on final item. SPA trail remains stale as documented above. |
| HTTP missing/deleted pages | storefront.php:27-29,44,55,64,69 explicitly returns 404 for missing product/guide/category; exception path :66-68 returns noindex and 503/Retry-After. These branches were statically inspected, not all dynamically exercised. |

The 01-SOURCE_OF_TRUTH document describes an older discovery SHA; it is context only. Findings are derived from the supplied current baseline files and synthetic execution. Search-engine behavior, live inventory/provider values, hosting redirects, HTTP compression, real traffic and rich-results validation remain UNCLEAR.
