# 11 — BANNERS: categories without an image and prompts (D-09)

Дата: 2026-10-11. Источник готовых изображений — папка владельца на Google Drive (`1OT5EuclIYmvBlthf4YNCUAr1ayZC6NOY`). Повторная проверка 2026-10-11: в папке те же 49 файлов, что и 08.10; все уже сопоставлены (`docs/category-banners*.json`). Существующие корректные баннеры **не заменялись**. Изображения **не генерировались** — ниже только перечень и промпты для владельца/дизайнера.

## Требования к файлу

- Формат: PNG/JPG исходник или WebP; итог на сайте — WebP **768×960** (4:5), до ~150 КБ.
- Имя: `<category_id>.png` из таблицы (сопоставление без ручных догадок).
- Без текста, логотипов брендов, людей, флагов, оружия; товар — главный объект, целиком в кадре, свободный край ~8%.
- Положить в ту же папку Drive; после этого баннеры подключаются кодом без изменения категорий.

## Общий стиль (добавлять к каждому промпту)

> Studio product photograph, vertical 4:5, a single hero object centred on a dark rough concrete plinth, deep charcoal background with soft vignette, warm orange rim light from the upper right, cool dim fill from the left, realistic materials (Cordura nylon, matte polymer, brushed metal), olive / coyote / black colourways, sharp focus, shallow depth of field, no text, no logos, no people, no weapons, no blood, photorealistic, consistent with a premium tactical-gear catalogue.

## 19 категорий

| # | category_id | Категория (как на сайте) | Файл | Промпт (объект) |
|---|---|---|---|---|
| 1 | `helmets_accessories` | Шоломи та захист голови / Аксесуари для шоломів | `helmets_accessories.png` | Helmet accessories laid out together: a set of helmet side rails, a cable-free NVG shroud mount, velcro panel and a helmet cover in multicam, arranged on the plinth without a helmet |
| 2 | `communications_radios` | Тактичний зв'язок та слух / Рації | `communications_radios.png` | One compact handheld two-way radio in matte black with a short antenna, standing upright, plus a coiled PTT cable beside it; no visible brand marks |
| 3 | `pouches_panels` | Підсумки / Панелі та платформи | `pouches_panels.png` | A MOLLE chest placard / front panel in coyote with three empty magazine sleeves and an admin pocket, lying at a slight angle |
| 4 | `load_bearing_systems` | РПС та розвантаження / Розвантажувальні системи | `load_bearing_systems.png` | A complete load-bearing chest rig in olive with harness straps and several pouches attached, standing on a low mannequin form without a head |
| 5 | `load_bearing_components` | РПС та розвантаження / Компоненти та аксесуари | `load_bearing_components.png` | Load-bearing components arranged in a neat flat-lay on the plinth: padded shoulder straps, a modular belt sleeve, buckles and MOLLE clips in black and coyote |
| 6 | `medical_hemostatics` | Тактична медицина / Гемостатики | `medical_hemostatics.png` | Two sealed vacuum-packed haemostatic gauze packages in olive and tan foil, one standing and one lying, with no text visible |
| 7 | `medical_bandages` | Тактична медицина / Бандажі | `medical_bandages.png` | A rolled tactical pressure bandage in an olive vacuum pouch next to a partially unrolled elastic bandage with a pressure bar |
| 8 | `medical_kits` | Тактична медицина / Аптечки | `medical_kits.png` | A closed rip-away IFAK pouch in coyote with a plain red tab (no symbol, no text), with a tourniquet strapped to its side |
| 9 | `medical_shears` | Тактична медицина / Медичні ножиці | `medical_shears.png` | One pair of trauma shears with black handles and an angled blade, displayed open at an angle, with a soft reflection on the steel |
| 10 | `medical_occlusive` | Тактична медицина / Оклюзійні засоби | `medical_occlusive.png` | Two chest seal packages (one vented, one non-vented) in sealed foil wrappers, one wrapper opened to show the clear round seal |
| 11 | `medical_other` | Тактична медицина / Інші медичні засоби | `medical_other.png` | A small arrangement: a nasopharyngeal airway in its sleeve, nitrile gloves folded, a thermal survival blanket folded in silver, and medical tape |
| 12 | `electronics_monoculars` | Електроніка та спостереження / Монокуляри | `electronics_monoculars.png` | One compact matte-black observation monocular standing on its end with the eyepiece cup visible, lens catching a faint orange reflection |
| 13 | `electronics_accessories` | Електроніка та спостереження / Аксесуари | `electronics_accessories.png` | Optics accessories: a padded lens case, a rubber eyecup, a lens cleaning cloth and a short tripod adapter laid out neatly |
| 14 | `lighting_headlamps` | Освітлення / Налобні ліхтарі | `lighting_headlamps.png` | One rugged headlamp with an olive elastic headband, lamp switched on with a soft warm beam glowing towards the viewer |
| 15 | `power_accessories` | Автономне живлення / Аксесуари живлення | `power_accessories.png` | A rugged power bank in black, two coiled braided charging cables and a compact solar panel folded, arranged on the plinth |
| 16 | `weapon_accessories_bipods` | Збройові аксесуари / Сошки | `weapon_accessories_bipods.png` | A standalone folding bipod in matte black with legs extended, mounted only on a short separate rail section; no firearm anywhere in the frame |
| 17 | `eye_protection_masks` | Захист очей та обличчя / Захисні маски | `eye_protection_masks.png` | Ballistic goggles with a smoke lens and an olive strap resting against a folded mesh lower-face protection mask |
| 18 | `eye_protection_accessories` | Захист очей та обличчя / Аксесуари | `eye_protection_accessories.png` | Eyewear accessories: a hard zip case, interchangeable clear and amber lenses, a retention cord and a microfiber pouch |
| 19 | `tools_accessories` | Інструменти та ножі / Аксесуари | `tools_accessories.png` | Knife and tool accessories: an empty kydex sheath, a small sharpening stone, a paracord lanyard and a belt clip, neatly arranged |

## Связанное: D-23 (разрешение)

96 существующих баннеров имеют 384×480 при цели 768×960. Если исходники на Drive крупнее, их можно пересохранить в 768×960 **тем же изображением** (не замена содержания) — только по отдельному решению владельца, так как формально файлы баннеров меняются.
