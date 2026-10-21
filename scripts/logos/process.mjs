// Layer 3, step 2 — turn the best candidate of each brand into a clean SVG in .cache/logos/out/<brand>.svg.
// SVG candidates are sanitized; rasters (PNG/JPEG/WebP/ICO, or SVGs that merely wrap a bitmap) are
// normalized with ImageMagick and vectorized with vtracer, then everything goes through svgo.
// Writes .cache/logos/results.json. Usage: node scripts/logos/process.mjs [type...] [--force]
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { optimize } from 'svgo'
import { readdirSync } from 'node:fs'
import { brandKeyOf } from './brand.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const C = join(ROOT, '.cache/logos')
const RAW = join(C, 'raw'), OUTD = join(C, 'out')
mkdirSync(RAW, { recursive: true }); mkdirSync(OUTD, { recursive: true })
const VT = join(ROOT, '.cache/vtracer/bin/vtracer')
const args = process.argv.slice(2)
const FORCE = args.includes('--force')
const TYPES = args.filter((a) => !a.startsWith('--'))
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36'

const cands = JSON.parse(readFileSync(join(C, 'candidates.json'), 'utf8'))
const resPath = join(C, 'results.json')
const results = existsSync(resPath) ? JSON.parse(readFileSync(resPath, 'utf8')) : {}
const slug = (k) => k.replace(/[^a-z0-9-]+/gi, '-')

async function download(url) {
  // Local file captured through a browser (sites that block scripts); the official URL is kept as `source`.
  if (url.startsWith('file://')) { try { return readFileSync(fileURLToPath(url)) } catch { return null } }
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000)
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': UA } })
    if (!r.ok) return null
    const buf = Buffer.from(await r.arrayBuffer())
    return buf.length > 200 && buf.length < 8e6 ? buf : null
  } catch { return null } finally { clearTimeout(t) }
}

const svgo = (svg) => optimize(svg, {
  multipass: true,
  plugins: ['preset-default', 'removeDimensions', { name: 'removeAttrs', params: { attrs: ['data-.*', 'class'] } }],
}).data

// An SVG is acceptable only if it is real vector art: no scripts, no external refs, no embedded bitmap.
function cleanSvg(text) {
  if (!/<svg[\s>]/i.test(text)) return null
  if (/<image\b/i.test(text)) return 'bitmap'
  const s = text.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+="[^"]*"/gi, '').replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
  if (/(href|src)="(https?:)?\/\//i.test(s)) return 'external'
  const out = svgo(s)
  return /<(path|rect|circle|ellipse|polygon|polyline|text|use)\b/i.test(out) ? out : null
}

function vectorize(buf, base) {
  const src = join(RAW, `${base}.src`), png = join(RAW, `${base}.png`), out = join(RAW, `${base}.vt.svg`)
  writeFileSync(src, buf)
  // Largest frame (ICO), flatten nothing (keep alpha), trim, pad, upscale small art to >= 512 px.
  // Largest frame (ICO), keep alpha, trim, fit in 512 px, quantize to 16 colours (logos are flat art).
  execFileSync('convert', [`${src}[0]`, '-background', 'none', '-trim', '+repage', '-resize', '512x512>', '-resize', '512x512<', '-dither', 'None', '-colors', '16', '-bordercolor', 'none', '-border', '8', png], { stdio: 'ignore' })
  const dims = execFileSync('identify', ['-format', '%w %h', `${png}[0]`]).toString().split(' ').map(Number)
  if (Math.min(...dims) < 24) throw new Error('raster too small')
  execFileSync(VT, ['--input', png, '--output', out, '--colormode', 'color', '--hierarchical', 'stacked', '--mode', 'spline', '--filter_speckle', '8', '--color_precision', '6', '--gradient_step', '32', '--corner_threshold', '60', '--segment_length', '4', '--splice_threshold', '45', '--path_precision', '2'], { stdio: 'ignore' })
  const svg = svgo(readFileSync(out, 'utf8'))
  if (svg.length > 120000) throw new Error('too complex — photo or banner, not a logo')
  return svg
}

// Only brands that exist in the CURRENT data (stale cache keys from older groupings are skipped).
const LIVE = new Set(readdirSync(join(ROOT, 'data/operators')).filter((f) => f.endsWith('.json')).flatMap((f) => JSON.parse(readFileSync(join(ROOT, 'data/operators', f), 'utf8')).operators.map((o) => brandKeyOf(o, f.slice(0, 2)))))
// Re-process anything not yet approved or awaiting review; never re-propose a rejected source.
const keys = Object.keys(cands).filter((k) => LIVE.has(k) && (!TYPES.length || TYPES.includes(cands[k].type)) &&
  (FORCE ? results[k]?.review !== 'approved' : !results[k] || results[k].review === 'rejected' || (!results[k].file && cands[k].candidates.length > (results[k].tried ?? 0))))
console.log(`${keys.length} brands to process`)
let ok = 0
for (const key of keys) {
  const b = cands[key]
  const base = slug(key)
  const prev = results[key] ?? {}
  const banned = new Set([...(prev.rejectedSources ?? []), ...(prev.review === 'rejected' && prev.source ? [prev.source] : [])])
  let done = null
  for (const c of b.candidates) {
    if (c.url && banned.has(c.url)) continue
    try {
      if (c.inline) {
        const svg = cleanSvg(c.inline)
        if (svg && svg !== 'bitmap' && svg !== 'external') { done = { svg, source: b.websites[0] ?? null, method: 'official-svg', via: c.via }; break }
        continue
      }
      const buf = await download(c.url)
      if (!buf) continue
      const text = buf.subarray(0, 4000).toString('utf8')
      if (/<svg[\s>]/i.test(text) || c.kind === 'svg') {
        const svg = cleanSvg(buf.toString('utf8'))
        if (svg && svg !== 'bitmap' && svg !== 'external') { done = { svg, source: c.url, method: c.via.startsWith('wikidata') ? 'wikimedia-svg' : 'official-svg', via: c.via }; break }
        if (svg !== 'bitmap') continue
      }
      const svg = vectorize(buf, base)
      done = { svg, source: c.url, method: 'vectorized', via: c.via }
      break
    } catch { /* try next candidate */ }
  }
  if (done) {
    writeFileSync(join(OUTD, `${base}.svg`), done.svg)
    results[key] = { file: `${base}.svg`, source: done.source, method: done.method, via: done.via, bytes: done.svg.length, review: 'pending', rejectedSources: [...banned] }
    ok++
  } else {
    results[key] = { file: null, review: 'no-candidate-worked', tried: b.candidates.length, rejectedSources: [...banned] }
    if (existsSync(join(OUTD, `${base}.svg`))) rmSync(join(OUTD, `${base}.svg`))
  }
  writeFileSync(resPath, JSON.stringify(results, null, 1))
}
console.log(`OK — ${ok}/${keys.length} logos produced`)
