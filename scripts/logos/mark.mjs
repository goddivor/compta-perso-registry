// Records the visual review of one contact-sheet page (same order as review.mjs, pending logos only).
// Usage: node scripts/logos/mark.mjs <type> <page> reject=1,5 dark=3 light=7   (everything else = approved)
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const C = join(ROOT, '.cache/logos')
const [type, page, ...opts] = process.argv.slice(2)
const set = (name) => new Set((opts.find((o) => o.startsWith(`${name}=`)) ?? '').slice(name.length + 1).split(',').filter(Boolean).map(Number))
const [reject, dark, light] = ['reject', 'dark', 'light'].map(set)
const cands = JSON.parse(readFileSync(join(C, 'candidates.json'), 'utf8'))
const path = join(C, 'results.json')
const results = JSON.parse(readFileSync(path, 'utf8'))
// Rebuild the same ordering review.mjs used when the page was rendered (snapshot kept in review-order.json).
const order = JSON.parse(readFileSync(join(C, `review-order-${type}.json`), 'utf8'))
const PER = 60
const keys = order.slice((page - 1) * PER, page * PER)
let a = 0, r = 0
keys.forEach((k, i) => {
  const n = (page - 1) * PER + i + 1
  const res = results[k]
  res.review = reject.has(n) ? 'rejected' : 'approved'
  if (dark.has(n)) res.onDark = true
  if (light.has(n)) res.onLight = true
  res.review === 'approved' ? a++ : r++
})
writeFileSync(path, JSON.stringify(results, null, 1))
console.log(`${type} page ${page}: ${a} approved, ${r} rejected`)
