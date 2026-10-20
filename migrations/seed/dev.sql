-- Development seed: one published product for building the customer pages.
-- Local only (`pnpm db:seed:local`); never run it against staging or
-- production. Safe to re-run: the row is replaced, keeping its id.
INSERT OR REPLACE INTO products (
  id, slug, name_ar, name_en, description_ar, description_en, price_egp, code,
  sizes, colors, sold_out, size_chart, published, sort_order, created_at, updated_at
) VALUES (
  'seed-oversized-tee',
  'oversized-tee',
  'تيشيرت أوفر سايز',
  'Oversized Tee',
  '',
  '',
  850,
  'TEE-01',
  '["S","M","L","XL"]',
  '[{"key":"grey","nameAr":"رمادي","nameEn":"Grey","swatch":"#8a8a8a","photos":[]},{"key":"black","nameAr":"أسود","nameEn":"Black","swatch":"#0a0a0a","photos":[]},{"key":"green","nameAr":"أخضر","nameEn":"Green","swatch":"#1f4f34","photos":[]},{"key":"cream","nameAr":"كريمي","nameEn":"Cream","swatch":"#f1ede7","photos":[]}]',
  '[{"color":"black","size":"S"}]',
  NULL,
  1,
  0,
  '2026-10-19T00:00:00.000Z',
  '2026-10-19T00:00:00.000Z'
);
