// Validates every registry file against SCHEMA.md and writes index.json. Exits 1 on any error.
// Dependency-free on purpose: run it before every commit (`npm run validate`).
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'))
const errors = []
const fail = (where, msg) => errors.push(`${where}: ${msg}`)

const TYPES = new Set(['bank', 'mobile_money', 'microfinance', 'fintech'])
const STATUSES = new Set(['active', 'rebranded', 'merged', 'defunct'])
const COVERAGE = new Set(['complete', 'partial', 'none'])
const METHODS = new Set(['official-svg', 'wikimedia-svg', 'vectorized', 'redrawn'])
const URL_RE = /^https?:\/\/\S+$/

const { countries } = read('data/countries.json')
const { currencies } = read('data/currencies.json')
const iso2s = new Set(countries.map((c) => c.iso2))
const codes = new Set(currencies.map((c) => c.code))

for (const c of countries) {
  for (const code of c.currencies) if (!codes.has(code)) fail(c.iso2, `unknown currency ${code}`)
  for (const f of [c.flag.svg, c.flag.svgSquare]) if (!existsSync(join(ROOT, f))) fail(c.iso2, `missing ${f}`)
  if (!c.name.en || !c.name.fr) fail(c.iso2, 'missing name')
}
for (const cur of currencies) {
  if (!cur.sign?.svg || !existsSync(join(ROOT, cur.sign.svg))) fail(cur.code, `missing sign svg`)
}

const ids = new Map()
const counts = { bank: 0, mobile_money: 0, microfinance: 0, fintech: 0 }
let logos = 0
const opDir = join(ROOT, 'data/operators')
const files = existsSync(opDir) ? readdirSync(opDir).filter((f) => f.endsWith('.json')) : []
for (const file of files) {
  const where = `operators/${file}`
  const doc = read(`data/operators/${file}`)
  if (`${doc.country}.json` !== file) fail(where, `country "${doc.country}" does not match file name`)
  if (!iso2s.has(doc.country)) fail(where, `unknown country ${doc.country}`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(doc.verifiedAt ?? '')) fail(where, 'verifiedAt must be YYYY-MM-DD')
  for (const [type, value] of Object.entries(doc.coverage ?? {})) {
    if (!TYPES.has(type)) fail(where, `coverage: unknown type ${type}`)
    if (!COVERAGE.has(value)) fail(where, `coverage.${type}: ${value}`)
  }
  for (const op of doc.operators ?? []) {
    const at = `${where} › ${op.id}`
    const prefix = `${doc.country.toLowerCase()}-`
    if (!op.id?.startsWith(prefix) || !/^[a-z0-9-]+$/.test(op.id)) fail(at, `id must be ${prefix}<slug>`)
    if (ids.has(op.id)) fail(at, `duplicate id (also in ${ids.get(op.id)})`)
    ids.set(op.id, file)
    if (!op.name) fail(at, 'missing name')
    if (!Array.isArray(op.aliases)) fail(at, 'aliases must be an array')
    if (!TYPES.has(op.type)) fail(at, `type ${op.type}`)
    else counts[op.type]++
    if (!STATUSES.has(op.status)) fail(at, `status ${op.status}`)
    if (op.website && !URL_RE.test(op.website)) fail(at, 'website is not a URL')
    if (!op.sources?.length || !op.sources.every((u) => URL_RE.test(u))) fail(at, 'needs at least one source URL')
    if (op.logo?.svg) {
      logos++
      if (!existsSync(join(ROOT, op.logo.svg))) fail(at, `missing ${op.logo.svg}`)
      if (!METHODS.has(op.logo.method)) fail(at, `logo.method ${op.logo.method}`)
      if (!URL_RE.test(op.logo.source ?? '')) fail(at, 'logo.source must be the original URL')
      if (!/\.svg$/.test(op.logo.svg)) fail(at, 'logo must be SVG')
      else if (/<image\b|data:image\/(png|jpe?g|webp)/i.test(readFileSync(join(ROOT, op.logo.svg), 'utf8'))) fail(at, 'logo SVG embeds a bitmap')
      if (![null, undefined, 'dark', 'light'].includes(op.logo.background)) fail(at, `logo.background ${op.logo.background}`)
    }
  }
}
for (const file of files) {
  for (const op of read(`data/operators/${file}`).operators ?? []) {
    if (op.successor && !ids.has(op.successor)) fail(`${file} › ${op.id}`, `successor ${op.successor} not found`)
  }
}

if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join('\n'))
  console.error(`\n${errors.length} error(s)`)
  process.exit(1)
}

const index = {
  countries: countries.length,
  currencies: currencies.length,
  countriesWithOperators: files.length,
  operators: { total: ids.size, ...counts },
  logos,
}
writeFileSync(join(ROOT, 'index.json'), JSON.stringify(index, null, 2) + '\n')
console.log(`OK — ${JSON.stringify(index)}`)
