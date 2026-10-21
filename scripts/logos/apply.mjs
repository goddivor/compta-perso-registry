// Layer 3, step 4 — copy every APPROVED logo into svg/logos/<type>/<brand>.svg (one file per brand,
// shared by all its operators) and fill `logo` on each operator in data/operators/*.json.
// Only reviewed-and-approved logos ever reach data/. Usage: node scripts/logos/apply.mjs
import { readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, existsSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brandKeyOf } from './brand.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const C = join(ROOT, '.cache/logos')
const cands = JSON.parse(readFileSync(join(C, 'candidates.json'), 'utf8'))
const results = JSON.parse(readFileSync(join(C, 'results.json'), 'utf8'))
const DIR = { mobile_money: 'mobile-money', bank: 'bank', fintech: 'fintech', microfinance: 'microfinance' }

// Brand membership is recomputed from the CURRENT data, so a stale cache key can never assign a logo.
const approved = new Map()
for (const [key, r] of Object.entries(results)) {
  if (r?.review !== 'approved' || !r.file || !cands[key]) continue
  const rel = `svg/logos/${DIR[cands[key].type]}/${key.split(':')[1]}.svg`
  approved.set(key, { rel, r })
}
const wanted = new Set()
const logoOf = (op, iso2) => {
  const hit = approved.get(brandKeyOf(op, iso2))
  if (!hit) return null
  if (!wanted.has(hit.rel)) {
    mkdirSync(join(ROOT, dirname(hit.rel)), { recursive: true })
    copyFileSync(join(C, 'out', hit.r.file), join(ROOT, hit.rel))
    wanted.add(hit.rel)
  }
  return { svg: hit.rel, source: hit.r.source, method: hit.r.method, background: hit.r.onDark ? 'dark' : hit.r.onLight ? 'light' : null }
}

let set = 0, total = 0
for (const f of readdirSync(join(ROOT, 'data/operators')).filter((x) => x.endsWith('.json'))) {
  const p = join(ROOT, 'data/operators', f)
  const doc = JSON.parse(readFileSync(p, 'utf8'))
  for (const op of doc.operators) {
    total++
    const logo = op.status === 'defunct' ? null : logoOf(op, doc.country)
    if (logo) { op.logo = logo; set++ }
    else op.logo = { svg: null, source: op.logo?.svg ? null : (op.logo?.source ?? null), method: null, background: null }
  }
  writeFileSync(p, JSON.stringify(doc, null, 2) + '\n')
}
// Remove logo files no longer approved, so nothing stale ships.
for (const type of Object.values(DIR)) {
  const d = join(ROOT, 'svg/logos', type)
  if (!existsSync(d)) continue
  for (const f of readdirSync(d)) if (!wanted.has(`svg/logos/${type}/${f}`)) rmSync(join(d, f))
}

console.log(`OK — ${wanted.size} logo files, ${set}/${total} operators with a logo`)
