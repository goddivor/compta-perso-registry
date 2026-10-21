# Registry schema

Four layers, built in order. Every file is UTF-8 JSON, 2-space indent, keys in the order shown.

| Layer | Content | Files | Produced by |
|---|---|---|---|
| 1 | Countries, currencies, flags | `data/countries.json`, `data/currencies.json`, `svg/flags/{4x3,1x1}/<iso2>.svg` | `scripts/build-countries.mjs` from CLDR + flag-icons — **never hand-edit** |
| 2 | Financial operators per country | `data/operators/<ISO2>.json` | research, hand-curated, every entry sourced |
| 3 | Operator logos | `svg/logos/<type>/<brand>.svg` (one file per brand, shared across countries) | `scripts/logos/*` — official SVG first, then vectorized raster, every logo visually reviewed |
| 4 | Currency signs | `svg/currencies/<CODE>.svg` (+ `<CODE>-color.svg` for emblems) | drawn from the CLDR local symbol, or the issuer's emblem (`art/currency-emblems/`) |

## Country (`data/countries.json` → `countries[]`)

```json
{
  "iso2": "TG", "iso3": "TGO", "numeric": "768",
  "name": { "en": "Togo", "fr": "Togo" },
  "region": "west",
  "flag": { "emoji": "🇹🇬", "svg": "svg/flags/4x3/tg.svg", "svgSquare": "svg/flags/1x1/tg.svg" },
  "officialLanguages": ["fr"],
  "currencies": ["XOF"]
}
```

`region` ∈ `north | west | central | east | southern`. `currencies` = current legal tender, main first.

## Currency (`data/currencies.json` → `currencies[]`)

```json
{
  "code": "XOF", "numeric": "952",
  "name": { "en": "West African CFA Franc", "fr": "franc CFA (BCEAO)" },
  "plural": { "en": { "one": "…", "other": "…" }, "fr": { "one": "…", "other": "…" } },
  "symbol": "F CFA", "narrowSymbol": null,
  "localSymbols": { "TG": "F CFA", "SN": "F CFA" },
  "decimals": 0, "cashDecimals": null,
  "sign": { "text": "F CFA", "svg": "svg/currencies/XOF.svg", "svgColor": "svg/currencies/XOF-color.svg",
            "font": null, "emblem": "BCEAO sawfish (Akan gold weight)", "source": "https://…" },
  "countries": ["BF", "BJ", "CI", "GW", "ML", "NE", "SN", "TG"]
}
```

`sign.text` is what amounts show; `sign.svg` is the currency's icon, one colour (`currentColor`). Most
signs outline `text` in `sign.font`. When the issuer has an emblem used as the currency's symbol (XOF:
the BCEAO sawfish, printed on its banknotes and struck on its coins), `sign.svg` is that emblem, `sign.svgColor` its official
colours, `font` is null and `source` is the issuer's vector document it was extracted from.

Display rule for the app: `localSymbols[country] ?? narrowSymbol ?? symbol`. Amounts are rounded to
`decimals`. There is **no conversion** between currencies anywhere.

## Operators (`data/operators/<ISO2>.json`)

```json
{
  "country": "TG",
  "verifiedAt": "2026-10-20",
  "coverage": { "bank": "complete", "mobile_money": "complete", "microfinance": "partial", "fintech": "partial" },
  "listSources": { "bank": "https://…official list of licensed banks…" },
  "operators": [
    {
      "id": "tg-tmoney",
      "name": "T-Money",
      "aliases": ["Tmoney", "TMoney", "Yas Money"],
      "type": "mobile_money",
      "group": "Yas",
      "status": "active",
      "successor": null,
      "website": "https://…",
      "logo": { "svg": "svg/logos/mobile-money/mixx-by-yas.svg", "source": "https://…", "method": "official-svg", "background": null },
      "sources": ["https://…"]
    }
  ]
}
```

- `id` = `<iso2 lowercase>-<slug>`, slug `[a-z0-9-]+`, unique across the registry.
- `type` ∈ `bank | mobile_money | microfinance | fintech`.
  - `bank` — licensed by the central bank / banking commission.
  - `mobile_money` — e-money / mobile wallet run by a telecom or e-money issuer.
  - `microfinance` — MFI / SFD / microfinance bank on the regulator's list.
  - `fintech` — wallets, neobanks, prepaid-card issuers not covered above.
- `aliases` — every spelling a user may type (old names, abbreviations, accents removed). Search
  matches `name` and `aliases`, case- and accent-insensitive.
- `status` ∈ `active | rebranded | merged | defunct`; `successor` = the `id` that replaced it.
- `coverage` per type: `complete` (whole official list), `partial`, or `none`.
- `sources` — at least one URL per operator (regulator list, official site, reputable press).
- `logo.method` ∈ `official-svg | wikimedia-svg | vectorized | redrawn`; `logo.source` = URL of the
  original. `logo.background` = `dark` when the mark is white and needs a dark tile, `light` when it is
  black and needs a light tile, `null` when it works on both. No logo → the app shows a monogram. Logos are trademarks of their owners, stored for identification only; any owner may ask
  for removal.

## Serving

The app reads files through jsDelivr from a tagged release, e.g.
`https://cdn.jsdelivr.net/gh/goddivor/compta-perso-registry@v1.0.0/data/countries.json`, caches them
and works offline afterwards. `index.json` lists versions and counts.
