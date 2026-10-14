# Проверка pricing policy v1, 8 октября 2026

Ветка: `feature/shop-pricing-policy-v1`. Результат: **116 passed, 0 failed, 0 skipped** — 103 существующих проверки и 13 новых. Все сценарии используют локальные fixtures, изолированную MariaDB и браузер Chromium. Рабочий магазин, настоящие счета, сообщения и ТТН не изменялись/не создавались.

Команда после добавления новых тестов в Git:

```sh
RUBIZH_TEST_MYSQL_SOCKET=/tmp/rubizh-mariadb/mysql.sock node --test --test-concurrency=1 $(git ls-files 'tests/*.test.mjs')
```

Этот запуск намеренно включает только файлы данной ветки. Девять ранее существовавших локальных проверок MODEL-migration не входят в ценовой commit. Ранее полный рабочий каталог дал 125 passed без пропусков.

Дополнительно: PHP syntax для всех 12 изменённых PHP файлов, `node --check` активного клиента и `git diff --cached --check` прошли. PHP runtime тестов — 8.4, хостинг ранее сообщал 8.2; production acceptance не выполнялась. Изолированная MariaDB успешно остановлена, перезапущена и дважды проверена через PDO `SELECT 1`. Это не сертификация нагрузки рабочего хостинга.

Новые тесты:

- `tests/pricing-policy.test.mjs`: 10 проверок переданных PIM цен, ограничения РРЦ, null/malformed floor, точных копеек, запрета self-approved wholesale/stacking, количества плит и состава готового комплекта, закрытых полей.
- `tests/pricing-database.test.mjs`: один HTTP сценарий с множеством проверок — capabilities/ACK, decimal prices и фильтры, replay синхронизации, rollback всего пакета, реальная блокировка версии против конкурентного sync, подмена цены/порога, выбранный SKU, stale quote, идемпотентность заказа, заявка с нулевым остатком без фиктивного резерва.
- `tests/pricing-browser.test.mjs`: два мобильных сценария — цены/опт выбранного SKU и точная сумма комплекта с копейками, отсутствие обещаний старой процентной лестницы.

Полный фактический журнал заключительного запуска:

```text
✔ Production account view fits both themes, all main tabs, and phone/tablet/desktop widths (4427.645135ms)
✔ Phone badge reflects verification and profile/delivery keep their POST fields and CSRF token (735.179919ms)
✔ Existing orders retain links and do not show the empty-order illustration (485.838193ms)
✔ Empty checkout hides recipient, delivery and submit; comparison survives reload and can be cleared (2262.109137ms)
✔ Real unknown stock has no false scarcity; confirmed sizes sort logically even with native fallback (761.916693ms)
✔ Canonical size matching combines heights, variants and footwear without guessing missing sizes (18.258121ms)
✔ New-order email waits for confirmation; confirmed card email has a payment link and no premature bank details (18.325958ms)
✔ Database availability matches buy buttons; missing local originals and duplicate copies are repaired (68.143583ms)
✔ Private authentication config remains usable when environment overrides are absent (15.299876ms)
✔ Explicit environment flags disable SMS and Google even with enabled private config (56.195729ms)
✔ SMS requires the token, sender, explicit enablement and a long application secret (60.436169ms)
✔ Environment credentials override private values and mailbox password spacing is preserved (10.110799ms)
✔ Empty environment stubs preserve Monobank and Nova Poshta keys stored on hosting (21.029291ms)
✔ Phone normalization and code hashes bind verification to the phone and challenge (11.466872ms)
✔ TurboSMS success requires an accepted result for the exact recipient and a message ID (14.484201ms)
✔ Hosting secret initializer preserves settings, uses private permissions and is safe to repeat (24.874213ms)
✔ Private hosting credential merge preserves the database and supplier settings and guards activation (51.714683ms)
✔ Cart mail has escaped real variants, quantities and a limited recovery link; order stages include one tracking section (24.123491ms)
✔ Reminder eligibility uses UTC, checks deadline and expiry and never re-sends terminal carts (13.039714ms)
✔ Real MySQL queue: consent, validated catalogue, debounce, delivery, conversion, retries, locks and parcel dedupe (95.901287ms)
✔ Scheduler runs each worker once, respects its interval, isolates failures and prevents concurrent overlap (236.511309ms)
✔ Read-only launch report distinguishes fresh, failed and missing workers without printing private credentials (12.17491ms)
✔ Cache cron preserves private existing tasks, is idempotent and does not overwrite unreadable schedules (85.334738ms)
✔ Automation cron replaces cache-only scheduling, preserves unrelated jobs, is idempotent and handles hosting denial (77.362858ms)
✔ Cart reminders require a valid email and explicit opt-in; quantity updates, reload and opt-out remain consistent (3925.484125ms)
✔ Returning from a reminder restores a real available variant and keeps its kit group without creating an order (1259.726044ms)
✔ Description attributes use labelled source values and preserve confirmed fields (25.121387ms)
✔ Misclassified clothing moves out of camouflage while genuine camouflage remains (11.537023ms)
✔ PHP size facets retain native sizes, heights, footwear halves and canonical order (12.70343ms)
✔ Stale public cache returns promptly, queues refresh, then worker replaces it; GC retains fallback (71.702426ms)
✔ A stalled refresh stops serving stale data after the five-minute grace period (34.138575ms)
✔ Long branches keep equal compact cards; native dialog scrolls and closes with keyboard (1648.6206ms)
✔ Catalog category pages have two short rows, correct arrows, and no generic glove fallback (1315.409148ms)
✔ Directory and product grid fit narrow and wide screens in both themes (9813.780718ms)
✔ All supplied banners have optimized assets and exact category assignments (2.527095ms)
✔ Deployment preserves private configs, media and legacy provider keys; invalid checksum changes nothing (105.106127ms)
✔ Small patch without api files still backs up private config and installs successfully (94.929001ms)
✔ Custom brigade is validated; old and empty orders retain the previous destination (13.298101ms)
✔ Receipt and email use the saved brigade and HTML escapes its name (16.503844ms)
✔ Donation batching rejects mixed brigades before writing a transfer (11.181698ms)
✔ Brigade is the first field in the donation block, updates the summary, and reaches the order payload (4092.379702ms)
✔ A cold kit page reserves bandwidth for equipment instead of downloading homepage hero artwork (1342.716372ms)
✔ Homepage switches exact supplied artwork on both screen sizes, persists theme, and survives SPA navigation (2219.931343ms)
✔ Two blank clothing variants never become one-size SKU buttons or buyable products (685.149458ms)
✔ Confirmed letter sizes and native fallback stay available; unconfirmed sibling is hidden (867.889759ms)
✔ Only confirmed sibling is displayed as its actual size (692.746954ms)
✔ Backend rejects blank clothing and footwear sizes but preserves native sizes and one-size accessories (16.427173ms)
✔ Catalog API recovers native/database size labels and marks blank clothing variants unavailable (16.315078ms)
✔ Repeated sizes across colours are shown once, and the chosen colour/size adds its own SKU (864.791718ms)
✔ A single size for the chosen colour remains one size despite other colours and duplicate offers (733.22459ms)
✔ All picker slots, pagination, combined filters, stock and source sizes work against MySQL (70.27594ms)
✔ Picker immediately shows preloaded products, exposes API failure and retries; reopening reuses the response (2895.287475ms)
✔ Search displays loading before a real empty result, reset restores products, and confirmed sizes can add to a slot (2698.845339ms)
✔ Instructions and selection buttons are highlighted in both themes without mobile overflow (793.948969ms)
✔ Mobile category controls, product actions and checkout actions stay centered and usable (13034.478121ms)
✔ Account order tabs and catalog action remain centered on mobile (349.088677ms)
✔ NP setup dry run resolves directories and sender without changing private configuration (16.373449ms)
✔ NP setup preserves credentials, backs up configuration, adds manager and both Kiborg origins, and disables COD (58.303278ms)
✔ Ambiguous contacts and invalid manager identity leave hosting configuration unchanged (25.494588ms)
✔ Ambiguous depots and missing cargo branches remain unavailable rather than guessing (46.39524ms)
✔ Kiborg shipment payload uses branch 9 through 30 kg and branch 36 above 30 kg, with no COD (12.290762ms)
✔ NP setup retries bounded rate-limited reads, caches duplicate lookups, and never retries document writes or other rejections (10.984695ms)
✔ Public WebP and thumbnails are readable under private cron umask; permission repair never touches private files or symlinks (483.936018ms)
✔ Overlapping photo processors skip without changing queue state or waiting for a download (23.672689ms)
✔ First catalogue images have priority while later cards stay lazy on mobile and desktop (1595.849004ms)
✔ Selected SKU changes retail and actual wholesale amounts without exposing a private floor (1217.797308ms)
✔ Mobile kit total sums exact selected PIM kit prices instead of a quantity percentage (2242.567381ms)
✔ HTTP PIM pricing sync, private projection, atomic failure, checkout replay, stale quote and reservations (490.086548ms)
✔ PIM retail, both wholesale levels and kit values are authoritative, percentage cannot change them (16.947956ms)
✔ Expensive SKU uses passed 14710/13340/13700 without guessing the supplier payout (12.509838ms)
✔ RRP/manual restrictions can raise every price and are never recalculated by shop (12.079146ms)
✔ Missing floor, malformed floor and legacy pricing disable special discounts (10.140871ms)
✔ Null kit price refuses special kit while retail remains available (10.422338ms)
✔ Money rejects NaN, negative, subkopeck and boolean; fractional quantity is exact (9.656938ms)
✔ Wholesale cannot be self-approved or stack with promo; retail promo obeys exact floor (10.322797ms)
✔ Two separate plates are charged twice, packaged pair once; no duplicate size inference (12.686455ms)
✔ Ready kit membership, exact SKU/color and complete quantity are checked (10.473135ms)
✔ Public line quote never contains the margin floor, supplier constraints or wholesale grant (10.502289ms)
✔ Semantic parsing resolves relations and complete phrases, while real primary-type conflicts remain for review (40.020503ms)
✔ 360 labelled real products across 18 roots retain their independently specified categories (42.823631ms)
✔ V2 dry-run is read-only; reviewed apply preserves data, manual locks and PIM authority across imports (194.269397ms)
✔ Real HTTP: nonce CSP, banner loading, bounded reads, duplicate checkout and concurrent stock reservation (8772.965923ms)
✔ Catalogue rejects malformed and excessive filters before SQL, while normalizing pagination (13.679859ms)
✔ Supplier image downloader blocks private IPv4/IPv6, credentials, unusual ports and unsafe redirect destinations (11.150691ms)
✔ Rate quota counts, expires, isolates identities and has a fixed number of disk shards (68.345258ms)
✔ Independent processes cannot exceed the work pool; completion releases all slots (1228.407464ms)
✔ Same-version cache growth is pruned and nested stripe collisions do not deadlock (55.953017ms)
✔ Every numbered banner has an existing image, exact category ID and the corrected 7/8 assignment (3.325425ms)
✔ External database configuration requires certificate verification and rejects DSN injection (11.774335ms)
✔ A missing, failed or stale cache worker heartbeat fails readiness without revealing customer information (41.640119ms)
✔ Home images load, categories navigate, and layout fits desktop (1843.200851ms)
✔ Direct product links load correct product and preserve its URL (716.238409ms)
✔ Selected size and cart survive reload, with accurate totals (1303.721758ms)
✔ Disabled payment methods and donation claims are absent at checkout (981.228071ms)
✔ Card and COD options appear when the server enables them (1025.763875ms)
✔ Cart quantity cannot exceed the known stock (1258.308941ms)
✔ Keyboard favourite activation happens once and persists (1230.769958ms)
✔ Search returns matching product and zero-result recovery (1041.013909ms)
✔ Mobile menu closes with Escape and home fits small screens (951.617444ms)
✔ Theme preference persists and reduced motion is supported (1181.117051ms)
✔ Mobile catalog, product and checkout fit the viewport (3327.381167ms)
✔ Catalog server errors surface without pretending to succeed (823.837191ms)
✔ Preview rejects real order/payment writes and private file requests (48.138794ms)
✔ Mobile kit selection preserves sizes and uses retail when PIM has not confirmed special prices (2236.134873ms)
✔ Seller settings do not recursively copy mounted React elements when reopening the kit selector (1335.075764ms)
✔ Catalogue cards stay separate and controls fit at phone, tablet and desktop widths in both themes (1809.863509ms)
✔ Kit mobile parameters expand and selectors close with Escape without layout overlap (2191.867348ms)
✔ Responsive hero uses distinct images and places the extra logo only on desktop (811.521249ms)
✔ Real anonymous PHP login renders accessibly without overflow and preview rejects login writes (792.252908ms)
✔ Mobile price and size filters combine, clear, and preserve a usable result grid (1134.433472ms)
✔ Kit colour filters with no matches remain responsive and all-category links work on mobile (1401.675189ms)
✔ Light theme keeps header text, icons and the logo readable across storefront pages and login (7451.676894ms)
✔ Compact mobile login keeps email, phone and SMS confirmation actions in the first screen (2850.582866ms)
✔ Kit recommendations filter before limiting, prioritise proper clothing and avoid eight facet requests (979.872913ms)
✔ Category migration is reversible, preserves full rows/media, filters old URLs and rejects unknown PIM IDs (217.752748ms)
✔ Canonical categories navigate with stable IDs and their own banners on phone and desktop in both themes (3959.873015ms)
ℹ tests 116
ℹ suites 0
ℹ pass 116
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 124544.206585
```
