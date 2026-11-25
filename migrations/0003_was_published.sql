-- was_published: 1 once the product has ever been published; never reset (0/1).
-- A hidden product that was published shows "no longer available"; a draft
-- that never was stays a 404, so its name stays secret until launch.
ALTER TABLE products ADD COLUMN was_published INTEGER NOT NULL DEFAULT 0;

-- Backfill: a product hidden before this migration counts as never published.
UPDATE products SET was_published = 1 WHERE published = 1;
