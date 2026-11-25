CREATE TABLE products (
  id             TEXT PRIMARY KEY,
  slug           TEXT NOT NULL UNIQUE,
  name_ar        TEXT NOT NULL,
  name_en        TEXT NOT NULL,
  description_ar TEXT NOT NULL DEFAULT '',
  description_en TEXT NOT NULL DEFAULT '',
  price_egp      INTEGER NOT NULL,
  code           TEXT,
  sizes          TEXT NOT NULL,              -- JSON string[]
  colors         TEXT NOT NULL,              -- JSON Color[]
  sold_out       TEXT NOT NULL DEFAULT '[]', -- JSON {color,size}[]
  size_chart     TEXT,                       -- JSON Photo or NULL
  published      INTEGER NOT NULL DEFAULT 0, -- 0/1
  sort_order     INTEGER NOT NULL,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX products_catalog ON products (published, sort_order);

CREATE TABLE settings (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  store_name      TEXT NOT NULL DEFAULT '9k Store',
  whatsapp_number TEXT NOT NULL DEFAULT '',
  greeting_ar     TEXT NOT NULL DEFAULT 'أهلاً 9k Store، حابب أطلب:',
  greeting_en     TEXT NOT NULL DEFAULT 'Hi 9k Store, I''d like to order:',
  instagram_url   TEXT NOT NULL DEFAULT '',
  logo            TEXT,                      -- JSON Photo or NULL
  updated_at      TEXT NOT NULL
);
INSERT INTO settings (id, updated_at) VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
