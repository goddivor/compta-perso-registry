// Layer 4 — currency signs as SVG outlines, generated after build-countries.mjs.
// The sign is the shortest Latin/currency-script symbol CLDR gives (narrow, local, international),
// else the ISO code. Drawn in Poppins Bold (the app's font) when it has every glyph, else entirely in
// Noto Sans Bold — never two fonts in one sign. Paths use currentColor so the app can tint them.
// Writes svg/currencies/<CODE>.svg and fills `sign` in data/currencies.json.
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { optimize } from 'svgo'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FONTS = [
  { name: 'Poppins Bold', file: 'fonts/Poppins-Bold.ttf', from: join(ROOT, '../mobile/node_modules/@expo-google-fonts/poppins/700Bold/Poppins_700Bold.ttf') },
  { name: 'Noto Sans Bold', file: 'fonts/NotoSans-Bold.ttf', from: '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf' },
]
// Fonts are vendored in fonts/ (both SIL OFL 1.1) so the build is reproducible on any machine.
mkdirSync(join(ROOT, 'fonts'), { recursive: true })
const fonts = FONTS.map((f) => {
  const path = join(ROOT, f.file)
  if (!existsSync(path)) copyFileSync(f.from, path)
  return { ...f, path }
})
// Outlines come from fontTools (scripts/glyph-outline.py) — opentype.js 2.0 produced NaN and
// mis-oriented contours on Poppins. Returns null when the font lacks a glyph.
const PY = join(ROOT, '.cache/venv/bin/python')
function outline(font, text) {
  try {
    return JSON.parse(execFileSync(PY, ['-I', join(ROOT, 'scripts/glyph-outline.py'), font.path, text], { stdio: ['ignore', 'pipe', 'ignore'] }).toString())
  } catch { return null }
}

const LATIN = /^[\p{Script=Latin}\p{Sc}\s.]+$/u
const pickSign = (c) =>
  [c.narrowSymbol, ...Object.values(c.localSymbols), c.symbol].filter((s) => s && LATIN.test(s)).sort((a, b) => a.length - b.length)[0] ?? c.code

// Currencies whose issuer has an emblem used as the currency's symbol: the sign is that emblem, not the
// typographic symbol (which stays in `text` for amounts). Art lives in art/currency-emblems/, extracted
// from the issuer's own vector documents: <CODE>.svg one-colour (currentColor), <CODE>-color.svg official colours.
const EMBLEMS = {
  XOF: {
    name: 'BCEAO sawfish (Akan gold weight)',
    source: 'https://www.bceao.int/sites/default/files/2023-07/Rapport%20sur%20la%20politique%20mone%CC%81taire%20-%20Juin%202023.pdf',
  },
}

const path = join(ROOT, 'data/currencies.json')
const doc = JSON.parse(readFileSync(path, 'utf8'))
mkdirSync(join(ROOT, 'svg/currencies'), { recursive: true })
for (const c of doc.currencies) {
  const text = pickSign(c)
  const emblem = EMBLEMS[c.code]
  if (emblem) {
    for (const suffix of ['', '-color']) {
      const raw = readFileSync(join(ROOT, `art/currency-emblems/${c.code}${suffix}.svg`), 'utf8')
      writeFileSync(join(ROOT, `svg/currencies/${c.code}${suffix}.svg`), optimize(raw, { multipass: true, plugins: ['preset-default'] }).data + '\n')
    }
    c.sign = { text, svg: `svg/currencies/${c.code}.svg`, svgColor: `svg/currencies/${c.code}-color.svg`, font: null, emblem: emblem.name, source: emblem.source }
    continue
  }
  const draw = text.replace(/[\u00A0\u202F]/g, ' ') // CLDR uses (narrow) no-break spaces
  // First font that has every glyph wins: Poppins (the app font), else Noto Sans — never both in one sign.
  let f = null, o = null
  for (const font of fonts) { o = outline(font, draw); if (o) { f = font; break } }
  if (!o) throw new Error(`no font covers ${c.code} "${draw}"`)
  const pad = 4
  const [bx1, by1, bx2, by2] = o.bbox
  const [x, y, w, h] = [bx1 - pad, by1 - pad, bx2 - bx1 + 2 * pad, by2 - by1 + 2 * pad].map((n) => Math.round(n * 100) / 100)
  const d = o.d
  if (/NaN|undefined/.test(d)) throw new Error(`broken outline for ${c.code}`)
  const raw = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}"><path fill="currentColor" d="${d}"/></svg>`
  const svg = optimize(raw, { multipass: true, plugins: ['preset-default'] }).data + '\n'
  writeFileSync(join(ROOT, `svg/currencies/${c.code}.svg`), svg)
  c.sign = { text, svg: `svg/currencies/${c.code}.svg`, font: f.name }
}
writeFileSync(path, JSON.stringify(doc, null, 2) + '\n')
console.log(`OK — ${doc.currencies.length} currency signs (${doc.currencies.filter((c) => c.sign.font?.startsWith('Noto')).map((c) => c.code).join(', ')} in Noto Sans)`)
