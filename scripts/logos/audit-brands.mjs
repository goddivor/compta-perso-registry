// Audits brand grouping (one logo per brand) so a logo can never land on the wrong operator.
// Prints: same-country collisions (two different operators sharing a brand in one country) and every
// multi-country brand whose operators have different names. Usage: node scripts/logos/audit-brands.mjs
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brandKeyOf, norm } from './brand.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const groups = new Map()
for (const f of readdirSync(join(ROOT, 'data/operators')).filter((x) => x.endsWith('.json'))) {
  const doc = JSON.parse(readFileSync(join(ROOT, 'data/operators', f), 'utf8'))
  for (const op of doc.operators) {
    if (op.status === 'defunct') continue
    const k = brandKeyOf(op, doc.country)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push({ country: doc.country, name: op.name, id: op.id, status: op.status, group: op.group })
  }
}
let collisions = 0
console.log('== Same-country collisions')
for (const [k, ops] of groups) {
  const byCountry = {}
  for (const o of ops) (byCountry[o.country] ??= []).push(o)
  for (const [c, list] of Object.entries(byCountry)) {
    const names = new Set(list.map((o) => norm(o.name)))
    if (list.length > 1 && names.size > 1) { collisions++; console.log(`  ${k} [${c}] ${list.map((o) => `${o.name} (${o.status})`).join(' | ')}`) }
  }
}
console.log(`  → ${collisions}`)
console.log('== Multi-name brands')
let n = 0
for (const [k, ops] of [...groups].sort()) {
  const names = [...new Set(ops.map((o) => o.name))]
  if (names.length > 1) { n++; console.log(`  ${k}: ${names.join(' | ')}`) }
}
console.log(`  → ${n}`)

// The same SVG on two brands is almost always a wrong assignment (legitimate only within one group).
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
console.log('== Same logo file on several brands (check each is one group)')
const byHash = {}
const LOGOS = join(ROOT, 'svg/logos')
if (existsSync(LOGOS)) for (const t of readdirSync(LOGOS)) for (const f of readdirSync(join(LOGOS, t))) {
  const h = createHash('sha1').update(readFileSync(join(LOGOS, t, f))).digest('hex')
  ;(byHash[h] ??= []).push(`${t}/${f}`)
}
const dups = Object.values(byHash).filter((v) => v.length > 1)
for (const d of dups) console.log(`  ${d.join('  |  ')}`)
console.log(`  → ${dups.length}`)
