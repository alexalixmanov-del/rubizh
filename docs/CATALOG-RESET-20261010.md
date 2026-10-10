# Полный сброс каталога PIM + SITE — репетиция на staging (10.10.2026)

Статус: **отрепетировано на staging на реальных данных. Production не тронут (PRODUCTION_WRITES = 0).
Production reset — только после отдельного OWNER GO.**

Данные: backup PIM `6311d34d…7792a` (3113 товаров, 8734 SKU), дамп SITE `35a2a4e2…a67fda5`
(3103 товара, 8682 SKU), оригинальные файлы 5 поставщиков. Всё приватное хранится вне Git и webroot.

## Итог

| Поле | Значение |
|---|---|
| PIM после сброса | PRODUCTS 0 · SKU 0 · очередь 0 · контент 0 |
| Сохранено в PIM | 143 категории, правила категорий, 5 поставщиков с правилами разбора, словари, цены 30/25/20 + 15%, политики наличия, счётчик SKU (17459) |
| PIM_PRODUCTS (после импорта 5 поставщиков) | 4231 карточка (4 объединены в модели по цвету → архив), 8187 SKU |
| READY / MODERATION / REJECTED | **1528 / 2670 / 29** |
| DUPLICATES | SKU 0 · привязок поставщика к нескольким SKU 0 · SKU без offer 0 · offers не из файлов 0 |
| SITE_MODELS / SITE_SKU | **1528 / 2820** |
| SITE после публикации | legacy 0 · URL с `-N` 0 · старых mappings 0 · дублей названий 0 · 143 категории |
| E2E | **14/14 PASS** |
| SQL (только v3, 1528) | каталог 0.24 s · `availability=in` 0.27 s · поиск 0.23 s · REGEXP/JSON нет |

МОДЕРАЦИЯ после сброса: grouping 2191 (кандидаты «одна модель в разных цветах» — без сильных
доказательств PIM не объединяет), category 843, color 95, photo_ownership 3. НЕ ПРОХОДИТ: RESTRICTED 16,
NO_DESCRIPTION 13. 15 позиций остались в очереди импорта без товара.

Наличие SKU: IN_STOCK 4695 · OUT_OF_STOCK 928 · UNKNOWN 1349 (Тактикал Белт, политика не подтверждена) ·
нужно подтвердить размер 1215. Один SKU READY-модели без цены (`price_ready:false`) — заказать нельзя.

## Что исправлено по ходу репетиции

1. **Ложные «нет фото».** Проверка новых позиций искала фото по ключу контента, который вырезает размер
   иначе, чем ключ группы; 580 позиций с фото отклонялись. Теперь берутся и фото самих offers.
2. **MODEL → COLOR не работал в production.** Флаг `model_colors_version` никогда не был включён, поэтому
   автоматические (сильные) объединения цветов не выполнялись. Сброс включает этап для нового каталога.
3. **Объединённые карточки «оживали».** Обёртка импорта возвращала прежние флаги публикации и снимала
   архив с поглощённых карточек. Исправлено.
4. **group_id поставщика** (варианты одного товара по YML) объединяет позиции в одну модель, только если
   каждая остаётся отдельной ячейкой цвет/размер; иначе — раздельно, без догадок.
5. Попытка читать селектор «ОБЕРІТЬ РОЗМІР СІТКИ» отменена: утверждённые правила размеров не
   подтверждают размеры сеток, и это делало 728 SKU M-WIN недоступными для заказа.

## E2E (реальные модели после сброса)

Браузер 390 / 768 / 1440: модель → цвет → галерея → размер → реальный SKU → цена → «В наявності» →
корзина. Оформление из корзины → CONFIRMED (цена из PIM) → invoice (mock bank) → подписанный webhook →
PAID. UNKNOWN → отказ; OUT_OF_STOCK → отказ; PREORDER → подтверждение менеджера; размер без SKU →
заявка без fake SKU, оплата запрещена; смешанная корзина → один заказ WAITING_CONFIRMATION.

## Команды ADM.TOOLS — только после OWNER GO

Порядок: backup → обновить код (если ещё не установлен) → сброс PIM → импорт поставщиков → МОДЕРАЦИЯ →
сброс SITE → одна публикация.

```bash
# 1. Backup БД SITE вне webroot (как в docs/PIM-V3-RELEASE-REPORT-20261009.md, шаг 1) → $B
# 2. Код: SITE — install-pim-v3.sh (коммит 752451d5ba3acb6f5b2866a85626df0cfec23c1a); PIM — архив ниже
curl -fsSL -o /tmp/install-pim-v3.sh https://raw.githubusercontent.com/alexalixmanov-del/rubizh/752451d5ba3acb6f5b2866a85626df0cfec23c1a/dev/install-pim-v3.sh
echo '4e48080a90f97e6da2686002c7351a8d948ef8510ee82b152e70a4a416b885c7  /tmp/install-pim-v3.sh' | sha256sum -c -
bash /tmp/install-pim-v3.sh /home/xk589064/rubizh.shop/www "$B" "$(sha256sum "$B" | cut -d' ' -f1)"
mkdir -p /home/xk589064/.pim-release && cd /home/xk589064/.pim-release
curl -fsSL -o pim.zip https://raw.githubusercontent.com/alexalixmanov-del/pim.rubizh/6117c97c1623adeaf939dd9275200e87799e0a70/releases/pim-10.9.3/rubizh-pim-10.9.3-final-workflow.zip
echo 'd05711fedd9cb7a705db9a2f65c021b758abe1355e5a068d5703dbcfcba76427  pim.zip' | sha256sum -c -
unzip -o -q pim.zip tools/install-production.py
python3 tools/install-production.py install --archive pim.zip --target /home/xk589064/rubizh.shop/pim \
  --data-backup /home/xk589064/.pim-deploy-backups/input/<ПОЛНЫЙ_BACKUP>.json.gz --backup-root /home/xk589064/.pim-deploy-backups
# 3. PIM в браузере: migration → «НА САЙТ» → «Проверить/Применить правила цен» →
#    BACKUP → «Предпросмотр сброса» → «СБРОСИТЬ КАТАЛОГ» (сохранить предложенный файл копии)
# 4. PIM: ИМПОРТ — свежие файлы всех 5 поставщиков; МОДЕРАЦИЯ — решения владельца
# 5. SITE: включить приём v3 (шаг 4 основного отчёта), затем сброс каталога сайта:
cd /home/xk589064/rubizh.shop/www
/usr/local/php82/bin/php dev/pim-v3-catalog-reset.php --plan --out=/home/xk589064/rubizh-private-backups/catalog-reset-plan.json
/usr/local/php82/bin/php dev/pim-v3-catalog-reset.php --apply --plan-file=/home/xk589064/rubizh-private-backups/catalog-reset-plan.json \
  --plan-sha256=<plan_sha256 из плана> --backup-file="$B" --backup-sha256="$(sha256sum "$B" | cut -d' ' -f1)"
# 6. PIM: «НА САЙТ» → «Отправить на сайт» (одна публикация READY; при обрыве — нажать ещё раз)
```

Откат: PIM — восстановить файл копии, сохранённый на шаге 3 (BACKUP → восстановление / release-recovery);
SITE — восстановить `$B`; файлы — команды rollback из основного отчёта.
