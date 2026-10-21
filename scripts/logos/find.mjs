// Layer 3, step 1 — find logo candidates per BRAND (one logo serves every country of a pan-African
// brand). Sources, best first: Wikidata P154 (Commons file), then the operators' own websites.
// Writes .cache/logos/candidates.json. Read-only on data/. Usage: node scripts/logos/find.mjs [type...]
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = join(ROOT, '.cache/logos')
mkdirSync(OUT, { recursive: true })
const UA = 'compta-perso-registry/0.1 (https://github.com/goddivor/compta-perso-registry)'
const TYPES = process.argv.slice(2).length ? process.argv.slice(2) : ['mobile_money', 'bank', 'fintech', 'microfinance']

import { norm, brandKeyOf } from './brand.mjs'

async function get(url, { json = false, timeout = 15000 } = {}) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), timeout)
  try {
    const res = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: { 'User-Agent': json ? UA : 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36', Accept: json ? 'application/json' : 'text/html,*/*' } })
    if (!res.ok) return null
    return json ? await res.json() : { url: res.url, text: await res.text() }
  } catch { return null } finally { clearTimeout(t) }
}

// ISO2 -> Wikidata QID, once.
async function countryQids() {
  const q = 'SELECT ?c ?iso WHERE { ?c wdt:P297 ?iso }'
  const r = await get(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, { json: true, timeout: 60000 })
  return Object.fromEntries((r?.results.bindings ?? []).map((b) => [b.iso.value, b.c.value.split('/').pop()]))
}

async function wikidata(brand, qids) {
  const names = [...new Set([brand.name, ...brand.aliases].filter(Boolean))].slice(0, 4)
  const want = new Set(brand.countries.map((c) => qids[c]).filter(Boolean))
  const out = []
  for (const name of names) {
    for (const lang of ['en', 'fr']) {
      const s = await get(`https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&type=item&limit=7&language=${lang}&search=${encodeURIComponent(name)}`, { json: true })
      const ids = (s?.search ?? []).filter((e) => norm(e.label ?? '') === norm(name) || (e.aliases ?? []).some((a) => norm(a) === norm(name)) || norm(e.match?.text ?? '') === norm(name)).map((e) => e.id)
      if (!ids.length) continue
      const ents = await get(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims&ids=${ids.join('|')}`, { json: true })
      for (const [id, e] of Object.entries(ents?.entities ?? {})) {
        const claim = (p) => (e.claims?.[p] ?? []).map((c) => c.mainsnak?.datavalue?.value).filter(Boolean)
        const p17 = claim('P17').map((v) => v.id)
        const countryOk = !p17.length || p17.some((q) => want.has(q)) || p17.length > 1
        for (const file of claim('P154')) {
          if (!countryOk) continue
          const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/ /g, '_'))}`
          const svg = /\.svg$/i.test(file)
          out.push({ url, kind: svg ? 'svg' : 'raster', via: `wikidata:${id}`, score: (svg ? 100 : 60) + (p17.some((q) => want.has(q)) ? 5 : 0) })
        }
      }
      if (out.length) return out
    }
  }
  return out
}

const abs = (u, base) => { try { return new URL(u.replace(/&amp;/g, '&'), base).href } catch { return null } }
function siteCandidates(html, base) {
  const out = []
  const attr = (tag, a) => (tag.match(new RegExp(`${a}\\s*=\\s*["']([^"']+)["']`, 'i')) ?? [])[1]
  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const src = attr(tag, 'src') ?? attr(tag, 'data-src')
    if (!src || src.startsWith('data:')) continue
    const hint = /logo/i.test(tag)
    const url = abs(src, base)
    if (!url || !hint) continue
    const svg = /\.svg(\?|$)/i.test(url)
    out.push({ url, kind: svg ? 'svg' : 'raster', via: 'site:img', score: svg ? 90 : 55 })
  }
  // Inline <svg> whose own tag or an ancestor-ish wrapper mentions "logo"
  const inline = html.match(/<(a|div|span|header)[^>]*logo[^>]*>\s*(<svg\b[\s\S]*?<\/svg>)/i)
  if (inline) out.push({ url: null, inline: inline[2], kind: 'svg', via: 'site:inline', score: 88 })
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = attr(tag, 'rel') ?? ''
    const href = attr(tag, 'href')
    if (!href) continue
    const url = abs(href, base)
    if (/apple-touch-icon/i.test(rel)) out.push({ url, kind: 'raster', via: 'site:apple-touch-icon', score: 50 })
    else if (/icon/i.test(rel) && /\.svg(\?|$)/i.test(href)) out.push({ url, kind: 'svg', via: 'site:icon-svg', score: 70 })
  }
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]*>/i)
  if (og) { const u = abs(attr(og[0], 'content') ?? '', base); if (u) out.push({ url: u, kind: 'raster', via: 'site:og-image', score: 25 }) }
  return out
}

// Build brands
const brands = new Map()
for (const f of readdirSync(join(ROOT, 'data/operators')).filter((x) => x.endsWith('.json'))) {
  const doc = JSON.parse(readFileSync(join(ROOT, 'data/operators', f), 'utf8'))
  for (const op of doc.operators) {
    if (!TYPES.includes(op.type) || op.status === 'defunct') continue
    const key = brandKeyOf(op, doc.country)
    if (!brands.has(key)) brands.set(key, { key, name: op.group && brandKeyOf(op, doc.country).endsWith(`:${norm(op.group).replace(/ /g, '-')}`) ? op.group : op.name, type: op.type, aliases: [], countries: [], operators: [], websites: [], hints: [] })
    const b = brands.get(key)
    b.operators.push(op.id); b.countries.push(doc.country); b.aliases.push(...op.aliases)
    if (op.website) b.websites.push(op.website)
    if (op.logo?.source) b.hints.push(op.logo.source)
  }
}

const prevPath = join(OUT, 'candidates.json')
const prev = existsSync(prevPath) ? JSON.parse(readFileSync(prevPath, 'utf8')) : {}
const qids = await countryQids()
console.log(`${brands.size} brands for ${TYPES.join(', ')}; ${Object.keys(qids).length} country QIDs`)

let done = 0
const list = [...brands.values()].sort((a, b) => b.operators.length - a.operators.length)
async function worker() {
  for (let b; (b = list.shift()); ) {
    if (prev[b.key]?.candidates?.length) { prev[b.key] = { ...b, candidates: prev[b.key].candidates }; done++; continue }
    const cands = b.hints.map((url) => ({ url, kind: /\.svg/i.test(url) ? 'svg' : 'raster', via: 'research-hint', score: 80 }))
    cands.push(...(await wikidata(b, qids)))
    for (const w of [...new Set(b.websites)].slice(0, 3)) {
      const page = await get(w)
      if (page) cands.push(...siteCandidates(page.text, page.url))
    }
    cands.sort((x, y) => y.score - x.score)
    prev[b.key] = { ...b, candidates: cands }
    if (++done % 25 === 0) { writeFileSync(prevPath, JSON.stringify(prev, null, 1)); console.log(`  ${done} brands…`) }
  }
}
await Promise.all(Array.from({ length: 6 }, worker))
writeFileSync(prevPath, JSON.stringify(prev, null, 1))
const found = Object.values(prev).filter((b) => TYPES.includes(b.type))
const svg = found.filter((b) => b.candidates.some((c) => c.kind === 'svg')).length
const any = found.filter((b) => b.candidates.length).length
console.log(`OK — ${found.length} brands: ${svg} with an SVG candidate, ${any - svg} raster only, ${found.length - any} nothing`)
