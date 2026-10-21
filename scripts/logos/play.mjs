// Layer 3, step 1b — add the Google Play app icon as a candidate for brands that have no approved
// logo yet. The customer app's icon is the most recognizable mark for a wallet. Picks the first search
// result whose title matches the brand, skipping agent/merchant/business apps.
// Usage: node scripts/logos/play.mjs [type...]
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const C = join(ROOT, '.cache/logos')
const TYPES = process.argv.slice(2).length ? process.argv.slice(2) : ['mobile_money', 'fintech', 'bank']
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36'
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const SKIP = /\b(business|merchant|marchand|agent|pro|pdv|distributor|distributeur|dealer|partner|partenaire|commercant|cashier|pos|staff|admin|retailer)\b/

async function get(url) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000)
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': UA, 'Accept-Language': 'en' } })
    return r.ok ? await r.text() : null
  } catch { return null } finally { clearTimeout(t) }
}

async function playIcon(brand) {
  const names = [...new Set([brand.name, ...brand.aliases])].filter((n) => n && n.length > 2).slice(0, 3)
  for (const name of names) {
    const want = norm(name)
    const gl = brand.countries[0]
    const html = await get(`https://play.google.com/store/search?q=${encodeURIComponent(name)}&c=apps&hl=en&gl=${gl}`)
    if (!html) continue
    const ids = [...new Set([...html.matchAll(/details\?id=([a-zA-Z0-9._]+)/g)].map((m) => m[1]))]
      .filter((id) => !/^com\.(google|facebook|whatsapp|instagram)\./.test(id)).slice(0, 6)
    for (const id of ids) {
      const page = await get(`https://play.google.com/store/apps/details?id=${id}&hl=en&gl=${gl}`)
      if (!page) continue
      const title = (page.match(/<title[^>]*>([^<]*?) - Apps on Google Play/) ?? [])[1]
      const icon = (page.match(/property="og:image" content="([^"]+)"/) ?? [])[1]
      if (!title || !icon) continue
      const t = norm(title.replace(/&amp;/g, '&').replace(/&#39;/g, "'"))
      if (SKIP.test(t) && !SKIP.test(want)) continue
      if (t === want || t.startsWith(`${want} `) || t.includes(want)) {
        return { url: icon.replace(/=s\d+[^"]*$|=w\d+[^"]*$/, '') + '=s512', kind: 'raster', via: `play:${id}`, score: 75, title }
      }
    }
  }
  return null
}

const candPath = join(C, 'candidates.json')
const cands = JSON.parse(readFileSync(candPath, 'utf8'))
const results = existsSync(join(C, 'results.json')) ? JSON.parse(readFileSync(join(C, 'results.json'), 'utf8')) : {}
const todo = Object.values(cands).filter((b) => TYPES.includes(b.type) && results[b.key]?.review !== 'approved' && !b.candidates.some((c) => c.via?.startsWith('play:')) && !b.playTried)
console.log(`${todo.length} brands to look up on Google Play`)
let found = 0, n = 0
async function worker() {
  for (let b; (b = todo.shift()); ) {
    const c = await playIcon(b)
    b.playTried = true
    if (c) { b.candidates.push(c); b.candidates.sort((x, y) => y.score - x.score); found++ }
    if (++n % 20 === 0) { writeFileSync(candPath, JSON.stringify(cands, null, 1)); console.log(`  ${n} looked up, ${found} found`) }
  }
}
await Promise.all(Array.from({ length: 4 }, worker))
writeFileSync(candPath, JSON.stringify(cands, null, 1))
console.log(`OK — ${found} app icons found`)
