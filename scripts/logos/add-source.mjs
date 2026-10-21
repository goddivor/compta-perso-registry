// Adds an official logo URL found by hand (e.g. through a browser that passes Cloudflare) as the
// top candidate of a brand, and clears a previous rejection so process.mjs tries it next.
// Usage: node scripts/logos/add-source.mjs <brandKey> <url> [note]
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const C = join(ROOT, '.cache/logos')
const [key, url, note = 'manual'] = process.argv.slice(2)
const cands = JSON.parse(readFileSync(join(C, 'candidates.json'), 'utf8'))
const results = JSON.parse(readFileSync(join(C, 'results.json'), 'utf8'))
const TYPE = { mm: 'mobile_money', bank: 'bank', fintech: 'fintech', microfinance: 'microfinance' }
if (!cands[key]) cands[key] = { key, name: key.split(':')[1], type: TYPE[key.split(':')[0]], aliases: [], countries: [], operators: [], websites: [], hints: [], candidates: [] }
cands[key].candidates = [{ url, kind: /\.svg(\?|$)/i.test(url) ? 'svg' : 'raster', via: `official-site:${note}`, score: 200 }, ...cands[key].candidates.filter((c) => c.url !== url)]
if (results[key] && results[key].review !== 'approved') {
  const banned = new Set([...(results[key].rejectedSources ?? []), ...(results[key].source ? [results[key].source] : [])])
  banned.delete(url)
  results[key] = { review: 'rejected', rejectedSources: [...banned] }
}
writeFileSync(join(C, 'candidates.json'), JSON.stringify(cands, null, 1))
writeFileSync(join(C, 'results.json'), JSON.stringify(results, null, 1))
console.log(`OK — ${key} ← ${url}`)
