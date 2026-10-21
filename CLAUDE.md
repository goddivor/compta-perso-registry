# registry/ — scoped rules

Countries, currencies and financial operators of Africa, with SVG flags, logos and currency signs,
served to Compta Perso through jsDelivr. **`SCHEMA.md` is the contract — read it before any change.**

- Never hand-edit `data/countries.json`, `data/currencies.json` or `svg/flags/` — change
  `scripts/build-countries.mjs` and run `npm run build:countries`.
- Never add an operator, currency fact or logo without a source URL found by web search today.
  Nothing from memory.
- **SVG only.** No PNG, JPEG or WebP is ever committed. Rasters are vectorized first, and the
  original URL goes in `logo.source`.
- `coverage` stays honest: `complete` only when built from the full official list.
- After any logo or grouping change, run `node scripts/logos/audit-brands.mjs`: zero same-country
  collisions, and every shared logo file must belong to one group. Same name ≠ same bank (`PER_COUNTRY`).
- Done = `npm run build` exits 0 (`index.json` is rewritten by the validator).
