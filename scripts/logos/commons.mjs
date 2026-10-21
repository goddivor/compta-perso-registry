// Layer 3, step 1c — Wikimedia Commons file search ("<brand> logo") for brands without an approved
// logo. Only files whose name contains the brand name are kept. Usage: node scripts/logos/commons.mjs [type...]
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const C = join(ROOT, '.cache/logos')
const TYPES = process.argv.slice(2).length ? process.argv.slice(2) : ['mobile_money', 'bank', 'fintech']
const UA = 'compta-perso-registry/0.1 (https://github.com/goddivor/compta-perso-registry)'
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '')

const candPath = join(C, 'candidates.json')
const cands = JSON.parse(readFileSync(candPath, 'utf8'))
const results = existsSync(join(C, 'results.json')) ? JSON.parse(readFileSync(join(C, 'results.json'), 'utf8')) : {}
const todo = Object.values(cands).filter((b) => TYPES.includes(b.type) && results[b.key]?.review !== 'approved' && !b.commonsTried)
console.log(`${todo.length} brands to search on Commons`)
let found = 0
for (const b of todo) {
  b.commonsTried = true
  const want = norm(b.name)
  if (want.length < 3) continue
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srnamespace=6&srlimit=10&srsearch=${encodeURIComponent(`${b.name} logo`)}`
  const res = await fetch(url, { headers: { 'User-Agent': UA } }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  const hits = (res?.query?.search ?? []).map((h) => h.title.replace(/^File:/, ''))
    .filter((t) => norm(t).includes(want) && /logo/i.test(t) && /\.(svg|png)$/i.test(t))
    .sort((a, b) => /\.svg$/i.test(b) - /\.svg$/i.test(a))
  if (!hits.length) continue
  const file = hits[0]
  const svg = /\.svg$/i.test(file)
  b.candidates.push({ url: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/ /g, '_'))}`, kind: svg ? 'svg' : 'raster', via: `commons:${file}`, score: svg ? 95 : 58 })
  b.candidates.sort((x, y) => y.score - x.score)
  found++
}
writeFileSync(candPath, JSON.stringify(cands, null, 1))
console.log(`OK — ${found} Commons files found`)
