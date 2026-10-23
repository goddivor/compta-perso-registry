<div align="center">

# compta-perso-registry

[![JSON](https://img.shields.io/badge/JSON-000000?logo=json&logoColor=fff&style=flat)](https://www.json.org/)
[![SVG](https://img.shields.io/badge/SVG-FFB13B?logo=svg&logoColor=000&style=flat)](https://developer.mozilla.org/docs/Web/SVG)

The **countries, currencies, and financial operators of Africa** (banks, microfinance, mobile money,
digital banks, e-wallets, money transfer, and investment), plus the international services used there,
with **SVG flags, currency signs, and operator logos**, as plain JSON. Every merge to `main` is
published as a new release, which the Compta Perso app picks up without an app update.

</div>

## 📐 Data layout

| Path | Content | Who edits it |
|---|---|---|
| `data/operators/<ISO2>.json` | the operators of one country | contributors |
| `data/international.json` | services used across Africa, with the countries where each is available | contributors |
| `svg/logos/<type>/<brand>.svg` | operator logos, one file per brand, shared across countries | contributors |
| `data/countries.json` | 54 countries, generated from Unicode CLDR | maintainer only |
| `data/currencies.json` | 43 currencies, generated from Unicode CLDR | maintainer only |
| `svg/flags/`, `svg/currencies/` | country flags and currency signs | maintainer only |
| `index.json` | counts of the files above | maintainer only |

## 🤝 Contributing

### 📜 Rules

- **Pull requests only.** Nobody pushes to `main`; the owner reviews and merges every pull request.
- **The `validate` check must be green.** A bot checks every pull request against the rules below and
  marks each failure on the line that caused it.
- **Every fact needs a source URL** that you opened yourself: the regulator's list, the operator's
  official site, or reputable press. An operator without `sources` is rejected.
- **Edit JSON and SVG only.** Keep the files formatted as they are: 2-space indentation, one key or
  array item per line, and a final newline.
- **Leave out `presence`.** The maintainer computes it after the merge.

### ➕ Add an operator to a country

Add an entry to `operators` in `data/operators/<ISO2>.json`, formatted like the rest of the file
(here, Orabank in Togo):

```json
{
  "id": "tg-orabank-togo",
  "name": "Orabank Togo",
  "aliases": [
    "Orabank",
    "Ora Bank"
  ],
  "type": "bank",
  "group": "Oragroup",
  "status": "active",
  "successor": null,
  "website": "https://www.orabank.net",
  "logo": {
    "svg": "svg/logos/bank/orabank.svg",
    "source": "https://www.orabank.net/sites/default/files/2025-09/Oragroup_Logo_RVB%201110x400.jpg",
    "method": "redrawn",
    "background": null,
    "sha256": "e68f1cc4119dd8aee3530d47185eb61501481a9fcf9dd2e46184dc7ef1c67f55"
  },
  "sources": [
    "https://www.bceao.int/sites/default/files/inline-files/8%20-%20Liste%20Togo_2026.pdf"
  ]
}
```

- `id`: the country code in lowercase, a hyphen, then a slug of lowercase letters, digits, and
  hyphens. It must be unique across the whole registry.
- `type`: one of the following.

  | Type | For |
  |---|---|
  | `bank` | banks licensed by the central bank or banking commission |
  | `microfinance` | microfinance institutions, including savings and credit cooperatives |
  | `mobile_money` | e-money and mobile wallets run by a telecom or e-money issuer |
  | `digital_bank` | neobanks and digital banks with consumer accounts |
  | `wallet` | e-wallets, payment apps, prepaid cards, store credit, payment gateways |
  | `money_transfer` | remittance and money transfer operators |
  | `investment` | brokerage, savings and investment platforms, crypto exchanges |

- `consumer`: add `"consumer": false` for a merchant-only payment gateway, with no consumer account
  that holds a balance. Leave it out otherwise.
- `aliases`: every spelling a user may type (old names, abbreviations); `[]` when there are none.
- `group`: the parent group's name, or `null`.
- `status`: `active`, `rebranded`, `merged`, or `defunct`. For the last three, `successor` is the `id`
  of the operator that replaced it, or `null`.
- `logo`: `null` when there is no logo yet (the app shows a monogram); see below otherwise.

If you add the whole official list of a type for a country, also update `coverage` (`complete`,
`partial`, or `none`) and `listSources` (the URL of that list) at the top of the file, and set
`verifiedAt` to today's date (`YYYY-MM-DD`).

### 🌍 Add an international service

Add an entry to `operators` in `data/international.json`. It has the same fields, with an `id` that
starts with `intl-` and no `presence`, plus `availability` (here, PayPal):

```json
{
  "id": "intl-paypal",
  "name": "PayPal",
  "aliases": [
    "Paypal",
    "PayPal wallet"
  ],
  "type": "wallet",
  "group": null,
  "status": "active",
  "successor": null,
  "website": "https://www.paypal.com",
  "logo": {
    "svg": "svg/logos/wallet/paypal.svg",
    "source": "https://upload.wikimedia.org/wikipedia/commons/c/c6/PayPal_2024.svg",
    "method": "wikimedia-svg",
    "background": "light",
    "sha256": "e89b9e683ed1ca3a7e8f0de60a5e6dbd00f2704cda0a611cd6ec5cb591a3177c"
  },
  "sources": [
    "https://www.paypal.com/us/webapps/mpp/country-worldwide"
  ],
  "availability": {
    "mode": "except",
    "countries": [
      "CF",
      "GH",
      "GQ",
      "LR",
      "LY",
      "SD",
      "SS"
    ],
    "sources": [
      "https://www.paypal.com/us/webapps/mpp/country-worldwide"
    ]
  }
}
```

- `availability.mode`: `all` (every African country, `countries` stays empty), `only` (just the
  listed countries), or `except` (every African country but the listed ones).
- `availability.countries`: ISO 3166-1 alpha-2 codes. A country counts when a person living there can
  hold an account or receive money through the service.
- `availability.sources`: the service's own country list or help page. When the evidence is unclear,
  choose the narrower mode.

### 🖼️ Add a logo

- **SVG only.** No PNG, JPG, or WebP anywhere in the repository, and no bitmap embedded in an SVG.
  Take the official SVG first; otherwise vectorize or redraw the logo.
- **One brand, one file**, at `svg/logos/<type>/<brand>.svg`. `<type>` is the operator's type, with
  `-` instead of `_` (`mobile-money`, `digital-bank`, `money-transfer`); `<brand>` uses lowercase
  letters, digits, and hyphens. When the brand already has a file, point to it instead of adding a
  copy.
- **A clean file**: an `<svg>` root with `xmlns` and `viewBox`, shapes and gradients only, text
  converted to paths, no script, no event attribute, no link outside the file, 128 KB at most.
- **Reference it** from the operator's `logo`: `svg` is the path, `source` the URL of the original,
  `method` one of `official-svg`, `wikimedia-svg`, `vectorized`, or `redrawn`, and `background` is
  `"dark"` for a white mark, `"light"` for a black one, or `null` when it works on both, and `sha256`
  is the SHA-256 of the SVG file's bytes in lowercase hex, required: compute it with
  `sha256sum svg/logos/<type>/<brand>.svg` and update it whenever the file changes. A logo that no
  operator uses is rejected.

### 🚫 Out of scope

- Insurance companies and pension funds.
- Changes to `data/countries.json`, `data/currencies.json`, flags, or currency signs: open an issue
  instead.

## 📜 License

Data: MIT. Flags come from flag-icons (MIT). Currency signs are outlined from Poppins and
Noto Sans (SIL Open Font License 1.1); the Cape Verdean cifrão is built from a Noto Sans "S". The
XOF, XAF and MZN signs are the emblems of the BCEAO, the BEAC and the Banco de Moçambique, included
only to identify the currency. Operator logos are trademarks of their owners,
included only to identify them; an owner may ask for removal.
