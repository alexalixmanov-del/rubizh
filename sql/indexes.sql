-- РУБІЖ · індекси для швидких фільтрів і підрахунків. Виконати один раз у phpMyAdmin (adm.tools → Бази даних).
-- Якщо індекс з таким іменем уже існує, MySQL поверне помилку для цього рядка — її можна пропустити.
ALTER TABLE products ADD INDEX idx_catpath (category_path(191));
ALTER TABLE products ADD INDEX idx_vis_cat_price (visible, category_path(120), price_min);
ALTER TABLE products ADD INDEX idx_vis_avail_price (visible, availability, price_min);
ALTER TABLE variants ADD INDEX idx_prod_avail_price (product_id, availability, price);
ALTER TABLE photos ADD INDEX idx_updated (updated_at);
