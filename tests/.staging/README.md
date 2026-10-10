# Staging rehearsals (PIM contract 3 → SITE)

Isolated staging only; production is never touched. Private inputs are **not** in Git and must be
supplied out of band into `/tmp/claude-0/private` (mode 700):

| Input | SHA256 |
|---|---|
| SITE production dump 2026-10-09 → `staging/private/backup-before.sql.gz` | `35a2a4e269763b239b367d146c2840d07790e45f05f0b1a6354fd9ae3a67fda5` |
| PIM backup `rubizh-pim-backup-2026-10-09-01-21.json` | `6311d34d9f89f5ba1066cb925883213a765cb1f57febab29357d869cc7c7792a` |
| M-WIN feed | `786a52829fefabc459f8ecce5853a15905c06e41f1d7d88ee827b104dcda7884` |
| Тактикал Белт feed | `93e52881c8944b5183698c0ec969893c02c2a5b5952393ca582d5b680475a233` |
| УКР-ТЕК Prom xlsx | `65f56d13417270a4cc1cf86bab56a19950f10bbf8809728a57cb8c9888479d3d` |
| Киборг feed | `5c013e08591ab093df25c8eb22951db42dfbb58de66a058f09fbe332b227c296` |
| Армолайн feed | `cd3be8859c300537a6b88fe4c43c2cf3b6c4391dd779f5b514cec01a92d1797a` |

Runtime: MySQL 8.0.46 socket `/tmp/claude-0/rt/mysql8/mysql.sock`, PHP 8.3 CLI, Chromium (Playwright).
Staging configs here contain staging-only values (mock bank, test PIM key, empty local root password).

## Full catalog reset rehearsal (docs/CATALOG-RESET-20261010.md)

```bash
# PIM (pim.rubizh checkout at the PIM commit): reset → 5 imports → checks → wire
node --max-old-space-size=11000 audit/catalog-reset-rehearsal.cjs PIM_BACKUP.json sources.json report.json wire-reset.json
#   sources.json: [{"supplier_id":"sf0t3l7jegf9","file":"…m-win.xml"},{"supplier_id":"s4p9slmnn0ki","file":"…tb.yml.xml"},
#                  {"supplier_id":"s2akya7xoafn","file":"…ukr-tec.xlsx"},{"supplier_id":"s2bggyi42dhh","file":"…kiborg.xml"},
#                  {"supplier_id":"s2hjvaqgnp29","file":"…armoline.xml"}]
# SITE (this repo at the SITE commit):
bash tests/.staging/setup-staging.sh <SITE_SHA>
bash tests/.staging/staging-reset.sh            # fresh production copy + additive v3 schema + LOST_* compare
node tests/.staging/reset-flow.mjs wire-reset.json   # SITE reset → one publication → checks → E2E
```

## Other runs

- `staging-e2e.mjs` — contract-3 E2E with the exact synthetic wire (`contracts/pim-v3/2/wire.exact.json`).
- `real-ingest.mjs` / `ingest-only.mjs` — real PIM export into the migrated production copy, SQL profile,
  timeout/replay recovery (`ABORT_FINAL=1`).
- `real-browser.mjs` — colour switch / gallery / `?color=` on real models.
- `rehearse-install.sh` — `dev/install-pim-v3.sh` on a copy of the current site (`/tmp/claude-0/orig` =
  `git archive 093f591`), LOST_* compare and smoke; then `dev/rollback-update.sh`.

Do not run the PIM rehearsal next to the databases on a 15 GB host: it needs ~11 GB.
