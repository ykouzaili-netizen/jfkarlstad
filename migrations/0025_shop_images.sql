-- Butiken: obegränsat antal bilder per produkt (i stället för de fasta fälten Foto 2–4).
-- Huvudbilden ligger kvar i shop_products.image_key; övriga bilder ligger här i den ordning de visas.
-- Bilderna finns i bildbanken (media) och raderas inte när de tas bort från en produkt.

CREATE TABLE IF NOT EXISTS shop_product_images (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL,
  image_key   TEXT NOT NULL,
  caption     TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS shop_product_images_product ON shop_product_images (product_id, sort_order, id);

-- Flytta över bilder som redan ligger i Foto 2–4.
INSERT INTO shop_product_images (product_id, image_key, caption, sort_order)
  SELECT id, image2_key, image2_caption, 10 FROM shop_products WHERE image2_key IS NOT NULL AND image2_key <> '';
INSERT INTO shop_product_images (product_id, image_key, caption, sort_order)
  SELECT id, image3_key, image3_caption, 20 FROM shop_products WHERE image3_key IS NOT NULL AND image3_key <> '';
INSERT INTO shop_product_images (product_id, image_key, caption, sort_order)
  SELECT id, image4_key, image4_caption, 30 FROM shop_products WHERE image4_key IS NOT NULL AND image4_key <> '';

ALTER TABLE shop_products DROP COLUMN image2_key;
ALTER TABLE shop_products DROP COLUMN image2_caption;
ALTER TABLE shop_products DROP COLUMN image3_key;
ALTER TABLE shop_products DROP COLUMN image3_caption;
ALTER TABLE shop_products DROP COLUMN image4_key;
ALTER TABLE shop_products DROP COLUMN image4_caption;
