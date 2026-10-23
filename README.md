<div align="center">

# compta-perso-registry

[![JSON](https://img.shields.io/badge/JSON-000000?logo=json&logoColor=fff&style=flat)](https://www.json.org/)
[![SVG](https://img.shields.io/badge/SVG-FFB13B?logo=svg&logoColor=000&style=flat)](https://developer.mozilla.org/docs/Web/SVG)
[![Node.js](https://img.shields.io/badge/Node.js_22+-5FA04E?logo=nodedotjs&logoColor=fff&style=flat)](https://nodejs.org/)
[![Unicode CLDR](https://img.shields.io/badge/Unicode_CLDR_48.2-5B5B5B?style=flat)](https://cldr.unicode.org/)

[![flag-icons](https://img.shields.io/badge/flag--icons_7.6-2D2D2D?style=flat)](https://github.com/lipis/flag-icons)
[![jsDelivr](https://img.shields.io/badge/jsDelivr-E84D3D?logo=jsdelivr&logoColor=fff&style=flat)](https://www.jsdelivr.com/)

The **countries, currencies, and financial operators of Africa** (banks, mobile money, microfinance,
and fintech), with **SVG flags, SVG currency signs, and SVG operator logos**, as plain JSON. Built for
the Compta Perso app and served through jsDelivr; usable by any app that needs the same data.

</div>

## 🎖️ Features

- **54 countries** — the sovereign African states, with English and French names, ISO codes, official
  languages, and their legal-tender currencies, generated from Unicode CLDR
- **43 currencies** — names, plural forms, decimals, and the symbol as written locally (`F CFA`, `₦`,
  `GH₵`, `Ksh`, etc.), never converted into one another
- **Flags as SVG** — every country in 4:3 and square, from flag-icons
- **Currency signs as SVG** — each local symbol outlined into paths, tintable with `currentColor`; the
  West African CFA franc carries the sawfish emblem of the Central Bank of West African States (BCEAO),
  extracted from the bank's own vector art
- **~4,000 operators** — banks, mobile money, microfinance, and fintech, every entry carrying the URL of
  the official list or page it comes from, with old names as searchable aliases
- **Operator logos as SVG only** — official SVG first, otherwise vectorized, every logo reviewed by eye;
  no PNG ships
- **Honest coverage** — each country says, per operator type, whether its list is complete or partial

## 📦 Installation

Consuming the data requires no installation: fetch the files from a tagged release.

```
https://cdn.jsdelivr.net/gh/goddivor/compta-perso-registry@<tag>/data/countries.json
https://cdn.jsdelivr.net/gh/goddivor/compta-perso-registry@<tag>/data/operators/TG.json
https://cdn.jsdelivr.net/gh/goddivor/compta-perso-registry@<tag>/svg/flags/1x1/tg.svg
```

## ⚙️ Usage

### 📐 Data layout

| Path | Content |
|---|---|
| `data/countries.json` | 54 countries — generated, never hand-edited |
| `data/currencies.json` | 43 currencies — generated, never hand-edited |
| `data/operators/<ISO2>.json` | operators of one country, hand-curated and sourced |
| `svg/flags/{4x3,1x1}/` | country flags |
| `svg/currencies/` | currency signs |
| `svg/logos/<type>/` | operator logos, one file per brand |

## 📜 License

Data: MIT. Flags come from flag-icons (MIT). Currency signs are outlined from Poppins and
Noto Sans (SIL Open Font License 1.1). The XOF sign is the emblem of the BCEAO,
included only to identify the currency. Operator logos are trademarks of their owners,
included only to identify them; an owner may ask for removal.
