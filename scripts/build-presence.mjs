// Derives `presence` on every operator: the number of countries in which its brand operates, so the app
// can list the most widespread operators first. Never hand-edit the field; run `npm run build`.
//
// Operators are clustered (union-find) by:
//   1. the brand key of scripts/logos/brand.mjs (one logo per brand, shared across countries);
//   2. an identical logo file within one family (same SVG bytes under two brand keys, e.g. Stanbic and
//      Standard Bank); families are banks, microfinance, and wallets (mobile money and fintech);
//   3. the same `group` among banks, among microfinance institutions, or among mobile money services
//      (MoMo PSB joins MTN MoMo, Flooz joins Moov Money).
//      A fintech joins its group's mobile money services only when it carries the group's name (Wave in
//      Uganda joins Wave elsewhere); SnapScan, FlexiPay, and BlueWallet are separate apps of Standard Bank,
//      not one brand present in its 19 countries.
// Links never cross families.
// PER_COUNTRY namesakes (same name, different institutions) never join a cluster and count 1.
// Defunct operators do not count and do not link clusters. `presence` = distinct countries of the
// cluster's non-defunct members plus the operator's own country.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brandKey, brandKeyOf, PER_COUNTRY, norm } from './logos/brand.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIR = join(ROOT, 'data/operators')
const files = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()
const docs = files.map((f) => ({ path: join(DIR, f), doc: JSON.parse(readFileSync(join(DIR, f), 'utf8')) }))

const parent = new Map()
const find = (x) => {
  if (!parent.has(x)) parent.set(x, x)
  while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x) }
  return x
}
const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb) }

const isPerCountry = (key) => [...PER_COUNTRY].some((p) => key.startsWith(`${p}-`))
const FAMILY = { bank: 'bank', microfinance: 'microfinance', mobile_money: 'wallet', fintech: 'wallet' }
const hashes = new Map()
const hashOf = (rel) => {
  if (!hashes.has(rel)) {
    const p = join(ROOT, rel)
    hashes.set(rel, existsSync(p) ? createHash('sha1').update(readFileSync(p)).digest('hex') : null)
  }
  return hashes.get(rel)
}

for (const { doc } of docs) {
  for (const op of doc.operators) {
    if (op.status === 'defunct') continue
    const key = `brand:${brandKeyOf(op, doc.country)}`
    find(key)
    if (isPerCountry(brandKeyOf(op, doc.country))) continue
    const h = op.logo?.svg ? hashOf(op.logo.svg) : null
    if (h) union(key, `logo:${FAMILY[op.type]}:${h}`)
    if (!op.group) continue
    const g = norm(op.group)
    if (op.type !== 'fintech') union(key, `group:${op.type}:${g}`)
    else if (brandKey(op, doc.country) === g.replace(/ /g, '-')) union(key, `group:mobile_money:${g}`)
  }
}

const countriesOf = new Map()
for (const { doc } of docs) {
  for (const op of doc.operators) {
    if (op.status === 'defunct') continue
    const root = find(`brand:${brandKeyOf(op, doc.country)}`)
    if (!countriesOf.has(root)) countriesOf.set(root, new Set())
    countriesOf.get(root).add(doc.country)
  }
}

let changed = 0
for (const { path, doc } of docs) {
  const before = JSON.stringify(doc)
  doc.operators = doc.operators.map((op) => {
    const key = `brand:${brandKeyOf(op, doc.country)}`
    const set = new Set(parent.has(key) ? countriesOf.get(find(key)) ?? [] : [])
    set.add(doc.country)
    // Keep the documented key order: `presence` sits right after `group`.
    const out = {}
    for (const [k, v] of Object.entries(op)) {
      if (k === 'presence') continue
      out[k] = v
      if (k === 'group') out.presence = set.size
    }
    if (!('presence' in out)) out.presence = set.size
    return out
  })
  if (JSON.stringify(doc) !== before) { writeFileSync(path, JSON.stringify(doc, null, 2) + '\n'); changed++ }
}
console.log(`OK — presence on ${docs.reduce((n, d) => n + d.doc.operators.length, 0)} operators, ${changed} file(s) rewritten`)
