// Layer 3, step 1d — real-browser pass for brands without an approved logo: find the official site
// (registry website, else a DuckDuckGo search restricted to domains containing the brand name), open it
// in a real Chromium that passes Cloudflare (puppeteer-real-browser, from the chrome-perso MCP), and save
// the header logo (inline SVG, SVG file, or the image bytes). Writes .cache/logos/browse/<key>.<ext> and
// .cache/logos/browse/summary.json. Nothing reaches data/ before visual review.
// Usage: node scripts/logos/browse.mjs <type> [maxBrands]
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { brandKeyOf, norm } from './brand.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = join(ROOT, '.cache/logos/browse')
mkdirSync(OUT, { recursive: true })
// Optional tool, not a registry dependency: reuse the chrome-perso MCP's install.
const MCP = process.env.CHROME_PERSO_DIR ?? join(process.env.HOME, 'Bureau/js-project/mcp-chrome-personalized')
const { connect } = createRequire(join(MCP, 'package.json'))('puppeteer-real-browser')

const [type = 'mobile_money', max = '999'] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
// --relaxed: second pass — retry brands with no logo yet, other search phrasings, leftmost header image.
const RELAXED = process.argv.includes('--relaxed')
const results = JSON.parse(readFileSync(join(ROOT, '.cache/logos/results.json'), 'utf8'))
const { countries } = JSON.parse(readFileSync(join(ROOT, 'data/countries.json'), 'utf8'))
const countryName = Object.fromEntries(countries.map((c) => [c.iso2, c.name.en]))
const summaryPath = join(OUT, 'summary.json')
const summary = existsSync(summaryPath) ? JSON.parse(readFileSync(summaryPath, 'utf8')) : {}

// Brands of this type still without an approved logo, from the current data.
const brands = new Map()
for (const f of readdirSync(join(ROOT, 'data/operators')).filter((x) => x.endsWith('.json'))) {
  const doc = JSON.parse(readFileSync(join(ROOT, 'data/operators', f), 'utf8'))
  for (const op of doc.operators) {
    if (op.type !== type || op.status === 'defunct') continue
    const key = brandKeyOf(op, doc.country)
    if (results[key]?.review === 'approved' || (summary[key] && (!RELAXED || summary[key].logo))) continue
    const b = brands.get(key) ?? { key, name: op.name, aliases: op.aliases ?? [], countries: [], sites: new Set() }
    b.countries.push(doc.country)
    if (op.website) b.sites.add(op.website)
    brands.set(key, b)
  }
}
const todo = [...brands.values()].slice(0, Number(max))
console.log(`${todo.length} ${type} brands to browse`)

const tokens = (b) => [...new Set([b.name, ...b.aliases].flatMap((n) => norm(n).split(' ')).filter((t) => t.length >= 4 && !/^(money|mobile|cash|bank|wallet|pay|services|financial|africa|digital)$/.test(t)))]
const BAD_HOST = /(facebook|instagram|linkedin|twitter|x\.com|youtube|wikipedia|google|apple|play\.|crunchbase|bloomberg|reuters|gsma|duckduckgo|tiktok|pinterest)/

const { browser, page } = await connect({ headless: false, turnstile: true, connectOption: { defaultViewport: { width: 1366, height: 900 } } })
page.setDefaultNavigationTimeout(30000)

async function findSite(b) {
  const want = tokens(b)
  if (!want.length) return null
  const queries = RELAXED
    ? [`${b.name}`, `${b.name} app ${countryName[b.countries[0]] ?? ''}`]
    : [`${b.name} ${countryName[b.countries[0]] ?? ''} ${type === 'mobile_money' ? 'mobile money' : ''}`]
  for (const q of queries) try {
    await page.goto(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, { waitUntil: 'domcontentloaded' })
    const links = await page.$$eval('a.result__a', (as) => as.map((a) => a.href))
    for (const l of links) {
      const u = new URL(l, 'https://duckduckgo.com')
      const target = u.searchParams.get('uddg') ?? l
      const host = new URL(target).hostname.replace(/^www\./, '')
      if (BAD_HOST.test(host)) continue
      if (want.some((t) => host.replace(/[^a-z0-9]/g, '').includes(t.replace(/[^a-z0-9]/g, '')))) return new URL(target).origin
    }
  } catch { /* search failed */ }
  return null
}

async function extract(site, key) {
  await page.goto(site, { waitUntil: 'networkidle2' }).catch(() => {})
  await new Promise((r) => setTimeout(r, 1500))
  const found = await page.evaluate(async (relaxed) => {
    const near = (el) => { const r = el.getBoundingClientRect(); return r.top + scrollY < 220 && r.width > 30 && r.height > 12 }
    const logoish = (el) => relaxed || /logo|brand/i.test((el.outerHTML || '').slice(0, 400) + ' ' + (el.closest('a,div,header,span')?.className?.toString() ?? ''))
    const svgs = [...document.querySelectorAll('svg')].filter((s) => near(s) && logoish(s) && !/<image/i.test(s.outerHTML) && s.outerHTML.length > 300 && s.outerHTML.length < 60000)
    if (svgs[0]) { const s = svgs[0].cloneNode(true); if (!s.getAttribute('xmlns')) s.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); return { kind: 'svg', how: 'inline', data: s.outerHTML } }
    const imgs = [...document.querySelectorAll('img')].filter((i) => near(i) && logoish(i)).sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)
    for (const i of imgs) {
      const src = i.currentSrc || i.src
      try {
        const res = await fetch(src)
        const buf = new Uint8Array(await res.arrayBuffer())
        let bin = ''; for (const c of buf) bin += String.fromCharCode(c)
        const isSvg = /svg/i.test(res.headers.get('content-type') ?? '') || /\.svg(\?|$)/i.test(src)
        return { kind: isSvg ? 'svg' : 'raster', how: 'img', src, data: isSvg ? new TextDecoder().decode(buf) : btoa(bin), w: i.naturalWidth, h: i.naturalHeight }
      } catch { /* cross-origin, try next */ }
    }
    return null
  }, RELAXED)
  if (!found) return null
  const file = join(OUT, `${key.replace(/[^a-z0-9-]+/gi, '-')}.${found.kind === 'svg' ? 'svg' : 'img'}`)
  writeFileSync(file, found.kind === 'svg' ? found.data : Buffer.from(found.data, 'base64'))
  return { file, kind: found.kind, how: found.how, src: found.src ?? site, w: found.w, h: found.h }
}

for (const b of todo) {
  let site = (RELAXED && summary[b.key]?.site) || [...b.sites][0] || null
  let via = site ? 'registry' : 'search'
  if (!site) site = await findSite(b)
  let logo = null
  if (site) logo = await extract(site, b.key).catch(() => null)
  summary[b.key] = { name: b.name, countries: b.countries, site, via, logo }
  writeFileSync(summaryPath, JSON.stringify(summary, null, 1))
  console.log(`${b.key.padEnd(36)} ${site ?? '— no site'} ${logo ? `→ ${logo.kind} (${logo.how})` : ''}`)
}
await browser.close()
