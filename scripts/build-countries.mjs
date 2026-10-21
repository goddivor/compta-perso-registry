// Layer 1 — countries and currencies of Africa, generated from Unicode CLDR (pinned in package.json)
// and flag-icons. Writes data/countries.json, data/currencies.json and svg/flags/{4x3,1x1}/<iso2>.svg.
// Never hand-edit those outputs: fix the source mapping here and re-run `npm run build:countries`.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const pkg = (name) => JSON.parse(readFileSync(join(ROOT, 'node_modules', name, 'package.json'), 'utf8')).version

const supplemental = (file) => require(`cldr-core/supplemental/${file}.json`).supplemental
const { territoryContainment } = supplemental('territoryContainment')
const { currencyData } = supplemental('currencyData')
const { codeMappings } = supplemental('codeMappings')
const { territoryInfo } = supplemental('territoryInfo')

const territoryNames = (lang) =>
  require(`cldr-localenames-full/main/${lang}/territories.json`).main[lang].localeDisplayNames.territories

// Currency names/symbols for a locale, or null when CLDR has no such locale.
const currencyCache = new Map()
function currenciesOf(locale) {
  if (currencyCache.has(locale)) return currencyCache.get(locale)
  let value = null
  try {
    value = require(`cldr-numbers-full/main/${locale}/currencies.json`).main[locale].numbers.currencies
  } catch { /* locale not in CLDR */ }
  currencyCache.set(locale, value)
  return value
}

// Africa = UN M49 regions 015 (North), 011 (West), 017 (Middle), 014 (East), 018 (Southern).
// CLDR lists 62 territories there; the registry covers the 54 sovereign UN member states.
const NOT_SOVEREIGN = new Set(['EA', 'IC', 'EH', 'IO', 'RE', 'SH', 'TF', 'YT'])
const REGIONS = { '015': 'north', '011': 'west', '017': 'central', '014': 'east', '018': 'southern' }

const today = new Date().toISOString().slice(0, 10)
const isCurrent = (entry) => !entry._to && entry._tender !== 'false'

const namesEn = territoryNames('en')
const namesFr = territoryNames('fr')

const countries = []
const currencyUsers = new Map() // code -> [{ iso2, locales }]

for (const [m49, region] of Object.entries(REGIONS)) {
  for (const iso2 of territoryContainment[m49]._contains) {
    if (NOT_SOVEREIGN.has(iso2)) continue
    const codes = codeMappings[iso2]
    const officialLanguages = Object.entries(territoryInfo[iso2]?.languagePopulation ?? {})
      .filter(([, v]) => v._officialStatus)
      .sort((a, b) => Number(b[1]._populationPercent) - Number(a[1]._populationPercent))
      .map(([lang]) => lang.replace('_', '-'))
    const locales = officialLanguages.flatMap((l) => [`${l}-${iso2}`, l])
    const currencies = (currencyData.region[iso2] ?? [])
      .map((e) => Object.entries(e)[0])
      .filter(([, info]) => isCurrent(info))
      .map(([code]) => code)
    for (const code of currencies) {
      if (!currencyUsers.has(code)) currencyUsers.set(code, [])
      currencyUsers.get(code).push({ iso2, locales })
    }
    countries.push({
      iso2,
      iso3: codes._alpha3,
      numeric: codes._numeric,
      name: { en: namesEn[iso2], fr: namesFr[iso2] },
      region,
      flag: {
        emoji: String.fromCodePoint(...[...iso2].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)),
        svg: `svg/flags/4x3/${iso2.toLowerCase()}.svg`,
        svgSquare: `svg/flags/1x1/${iso2.toLowerCase()}.svg`,
      },
      officialLanguages,
      currencies,
    })
  }
}
countries.sort((a, b) => a.name.en.localeCompare(b.name.en, 'en'))

const en = currenciesOf('en')
const fr = currenciesOf('fr')
const currencies = [...currencyUsers.keys()].sort().map((code) => {
  const fraction = currencyData.fractions[code] ?? currencyData.fractions.DEFAULT
  // Symbol as written locally: first official-language locale of a country using it that CLDR knows.
  const localSymbols = {}
  for (const { iso2, locales } of currencyUsers.get(code)) {
    for (const locale of locales) {
      const symbol = currenciesOf(locale)?.[code]?.symbol
      if (symbol) { localSymbols[iso2] = symbol; break }
    }
  }
  return {
    code,
    numeric: codeMappings[code]?._numeric ?? null,
    name: { en: en[code].displayName, fr: fr[code].displayName },
    plural: {
      en: { one: en[code]['displayName-count-one'], other: en[code]['displayName-count-other'] },
      fr: { one: fr[code]['displayName-count-one'], other: fr[code]['displayName-count-other'] },
    },
    symbol: en[code].symbol,
    narrowSymbol: en[code]['symbol-alt-narrow'] ?? null,
    localSymbols,
    decimals: Number(fraction._digits),
    cashDecimals: fraction._cashDigits != null ? Number(fraction._cashDigits) : null,
    sign: null, // filled by build-signs.mjs
    countries: currencyUsers.get(code).map((u) => u.iso2).sort(),
  }
})

// Flags: copied as-is from flag-icons (MIT), both ratios.
for (const ratio of ['4x3', '1x1']) {
  const dir = join(ROOT, 'svg/flags', ratio)
  mkdirSync(dir, { recursive: true })
  for (const c of countries) {
    const src = join(ROOT, 'node_modules/flag-icons/flags', ratio, `${c.iso2.toLowerCase()}.svg`)
    if (!existsSync(src)) throw new Error(`missing flag ${ratio}/${c.iso2}`)
    copyFileSync(src, join(dir, `${c.iso2.toLowerCase()}.svg`))
  }
}

const sources = {
  generatedAt: today,
  cldr: pkg('cldr-core'),
  flagIcons: pkg('flag-icons'),
}
mkdirSync(join(ROOT, 'data'), { recursive: true })
writeFileSync(join(ROOT, 'data/countries.json'), JSON.stringify({ sources, countries }, null, 2) + '\n')
writeFileSync(join(ROOT, 'data/currencies.json'), JSON.stringify({ sources, currencies }, null, 2) + '\n')
console.log(`OK — ${countries.length} countries, ${currencies.length} currencies, ${countries.length * 2} flag SVGs`)
