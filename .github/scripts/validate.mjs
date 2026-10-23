// Checks a pull request against the contribution rules in README.md. Run from the repository root:
//   node .github/scripts/validate.mjs
// Dependency-free on purpose (node:fs, node:path, node:crypto only). On GitHub Actions every failure is
// printed as an annotation, so it shows on the line of the pull request diff that caused it.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { createHash } from 'node:crypto'

const ROOT = process.argv[2] ?? join(import.meta.dirname, '..', '..')
const CI = process.env.GITHUB_ACTIONS === 'true'

const TYPES = ['bank', 'microfinance', 'mobile_money', 'digital_bank', 'wallet', 'money_transfer', 'investment']
const STATUSES = ['active', 'rebranded', 'merged', 'defunct']
const COVERAGE = ['complete', 'partial', 'none']
const METHODS = ['official-svg', 'wikimedia-svg', 'vectorized', 'redrawn']
const BACKGROUNDS = [null, 'dark', 'light']
const MODES = ['all', 'only', 'except']
const REGIONS = ['north', 'west', 'central', 'east', 'southern']
const OPERATOR_KEYS = ['id', 'name', 'aliases', 'type', 'group', 'presence', 'consumer', 'status', 'successor', 'website', 'logo', 'sources']
const LOGO_KEYS = ['svg', 'source', 'method', 'background', 'sha256']
const AMOUNT_KEYS = ['locale', 'pattern', 'group', 'decimal', 'signPattern', 'alphaPattern']
const URL_RE = /^https?:\/\/[^\s/]+\.[^\s]+$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const SVG_MAX_BYTES = 128 * 1024 // the largest file on 2026-10-23 weighs 118 KB
const RASTER_RE = /\.(png|jpe?g|gif|webp|bmp|tiff?|ico|avif|heic|heif)$/i
const typeFolder = (type) => type.replace(/_/g, '-')

// ── reporting ────────────────────────────────────────────────────────────────────────────────────────
const errors = []
const fail = (file, line, msg) => errors.push({ file, line: line || 1, msg })
const esc = (s) => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
const escProp = (s) => esc(s).replace(/:/g, '%3A').replace(/,/g, '%2C')

// ── helpers ──────────────────────────────────────────────────────────────────────────────────────────
const isUrl = (u) => typeof u === 'string' && URL_RE.test(u)
const isStr = (s) => typeof s === 'string' && s.trim() !== ''
const lineAt = (text, offset) => text.slice(0, Math.max(0, offset)).split('\n').length
const json = new Map() // path → { data, text }

// The line of `"key": value` in a JSON text, searched from `from` (an offset) onwards.
function lineOf(path, needle, from = 0) {
  const text = json.get(path)?.text ?? ''
  const at = text.indexOf(needle, from)
  return at < 0 ? 1 : lineAt(text, at)
}
const idLine = (path, id) => lineOf(path, `"id": ${JSON.stringify(id)}`)

function readJson(path) {
  const text = readFileSync(join(ROOT, path), 'utf8')
  try {
    const data = JSON.parse(text)
    json.set(path, { data, text })
    if (text !== JSON.stringify(data, null, 2) + '\n') {
      fail(path, 1, 'format the file with 2-space indentation, one key or array item per line, and a final newline (as JSON.stringify(data, null, 2) writes it)')
    }
    return data
  } catch (e) {
    const m = /line (\d+)/.exec(e.message) ?? null
    const pos = /position (\d+)/.exec(e.message)
    fail(path, m ? Number(m[1]) : pos ? lineAt(text, Number(pos[1])) : 1, `invalid JSON: ${e.message}`)
    return null
  }
}

// ── 1. repository content: JSON data and SVG only ────────────────────────────────────────────────────
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (dir === ROOT && name === '.git') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(relative(ROOT, p).split(sep).join('/'))
  }
  return out
}
const allFiles = walk(ROOT)
const allowed = (f) =>
  ['README.md', 'LICENSE', 'index.json'].includes(f) ||
  f.startsWith('.github/') ||
  /^data\/(countries|currencies|international)\.json$/.test(f) ||
  /^data\/operators\/[A-Z]{2}\.json$/.test(f) ||
  /^svg\/flags\/(4x3|1x1)\/[a-z]{2}\.svg$/.test(f) ||
  /^svg\/currencies\/[A-Z]{3}(-color)?\.svg$/.test(f) ||
  new RegExp(`^svg/logos/(${TYPES.map(typeFolder).join('|')})/[a-z0-9]+(-[a-z0-9]+)*\\.svg$`).test(f)
for (const f of allFiles) {
  if (RASTER_RE.test(f)) fail(f, 1, 'raster images are not accepted: logos are SVG only (official SVG, or a vectorized trace)')
  else if (!allowed(f)) {
    fail(f, 1, f.startsWith('svg/logos/')
      ? `a logo lives at svg/logos/<type>/<brand>.svg, where <type> is one of ${TYPES.map(typeFolder).join(', ')} and <brand> is lowercase letters, digits and hyphens`
      : 'this repository holds data only: data/**/*.json, svg/**/*.svg, README.md and LICENSE')
  }
}

// ── 2. SVG sanity ────────────────────────────────────────────────────────────────────────────────────
const SVG_ELEMENTS = new Set(['svg', 'g', 'defs', 'symbol', 'use', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline',
  'polygon', 'clipPath', 'mask', 'pattern', 'linearGradient', 'radialGradient', 'stop', 'title', 'desc', 'metadata'])
const ENTITY_RE = /&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/y
const NAME_RE = /[A-Za-z_][\w.:-]*/y

// A small, strict XML reader: enough to prove a file is well-formed and to list its elements and attributes.
function parseXml(text) {
  const elements = []
  const stack = []
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0
  let rootSeen = false
  const err = (msg, at = i) => { throw Object.assign(new Error(msg), { line: lineAt(text, at) }) }
  const checkText = (s, at) => {
    for (let k = s.indexOf('&'); k >= 0; k = s.indexOf('&', k + 1)) {
      ENTITY_RE.lastIndex = k
      if (!ENTITY_RE.test(s)) err('unescaped "&" or unknown entity', at + k)
    }
  }
  while (i < text.length) {
    const lt = text.indexOf('<', i)
    const chunk = text.slice(i, lt < 0 ? text.length : lt)
    if (!stack.length && chunk.trim()) err('text outside the root element')
    checkText(chunk, i)
    if (lt < 0) break
    i = lt
    if (text.startsWith('<!--', i)) {
      const end = text.indexOf('-->', i + 4)
      if (end < 0) err('unclosed comment')
      i = end + 3
    } else if (text.startsWith('<![CDATA[', i)) {
      if (!stack.length) err('CDATA outside the root element')
      const end = text.indexOf(']]>', i)
      if (end < 0) err('unclosed CDATA section')
      i = end + 3
    } else if (text.startsWith('<!', i)) {
      err('DOCTYPE and entity declarations are not accepted')
    } else if (text.startsWith('<?', i)) {
      const end = text.indexOf('?>', i)
      if (end < 0) err('unclosed processing instruction')
      i = end + 2
    } else if (text.startsWith('</', i)) {
      NAME_RE.lastIndex = i + 2
      const m = NAME_RE.exec(text)
      if (!m || m.index !== i + 2) err('bad closing tag')
      const end = text.indexOf('>', i)
      if (end < 0 || text.slice(NAME_RE.lastIndex, end).trim()) err('bad closing tag')
      const open = stack.pop()
      if (open !== m[0]) err(open ? `</${m[0]}> closes <${open}>` : `</${m[0]}> closes nothing`)
      i = end + 1
    } else {
      NAME_RE.lastIndex = i + 1
      const m = NAME_RE.exec(text)
      if (!m || m.index !== i + 1) err('bad tag')
      if (!stack.length && rootSeen) err('more than one root element')
      const el = { name: m[0], attrs: {}, line: lineAt(text, i) }
      let j = NAME_RE.lastIndex
      for (;;) {
        const ws = /\s*/y; ws.lastIndex = j; ws.exec(text); const hadSpace = ws.lastIndex > j; j = ws.lastIndex
        if (text.startsWith('/>', j)) { j += 2; break }
        if (text[j] === '>') { j += 1; stack.push(el.name); break }
        if (!hadSpace) err(`bad attribute syntax in <${el.name}>`, j)
        const a = /([A-Za-z_][\w.:-]*)\s*=\s*("[^"<]*"|'[^'<]*')/y
        a.lastIndex = j
        const am = a.exec(text)
        if (!am) err(`bad attribute syntax in <${el.name}>`, j)
        if (am[1] in el.attrs) err(`duplicate attribute ${am[1]} in <${el.name}>`, j)
        checkText(am[2], j)
        el.attrs[am[1]] = am[2].slice(1, -1)
        j = a.lastIndex
      }
      if (!rootSeen) el.root = true
      rootSeen = true
      elements.push(el)
      i = j
    }
  }
  if (stack.length) err(`<${stack.at(-1)}> is never closed`)
  if (!rootSeen) err('no root element')
  return elements
}

function checkSvg(path) {
  const buf = readFileSync(join(ROOT, path))
  if (buf.length > SVG_MAX_BYTES) fail(path, 1, `SVG is ${Math.round(buf.length / 1024)} KB, the limit is ${SVG_MAX_BYTES / 1024} KB: simplify the paths`)
  const text = buf.toString('utf8')
  let elements
  try { elements = parseXml(text) } catch (e) { fail(path, e.line, `not a well-formed SVG: ${e.message}`); return }
  const root = elements[0]
  if (root.name !== 'svg') { fail(path, root.line, `the root element must be <svg>, not <${root.name}>`); return }
  if (root.attrs.xmlns !== 'http://www.w3.org/2000/svg') fail(path, root.line, 'the <svg> root needs xmlns="http://www.w3.org/2000/svg"')
  if (!root.attrs.viewBox) fail(path, root.line, 'the <svg> root needs a viewBox')
  for (const el of elements) {
    const local = el.name.replace(/^svg:/, '')
    if (local === 'script') fail(path, el.line, 'no <script> in an SVG')
    else if (local === 'image') fail(path, el.line, 'no <image>: a logo is vector paths only, never an embedded bitmap')
    else if (local === 'text' || local === 'tspan') fail(path, el.line, `no <${local}>: convert text to paths, the app has none of your fonts`)
    else if (!SVG_ELEMENTS.has(local)) fail(path, el.line, `<${el.name}> is not accepted in a logo (allowed: ${[...SVG_ELEMENTS].join(', ')})`)
    for (const [name, value] of Object.entries(el.attrs)) {
      if (/^on/i.test(name)) fail(path, el.line, `no event handler attribute (${name})`)
      if ((name === 'href' || name.endsWith(':href')) && !value.startsWith('#')) fail(path, el.line, `${name} may only point inside the file (#id), not to ${value.slice(0, 60)}`)
      if (/\b(?:javascript|data):/i.test(value)) fail(path, el.line, `no javascript: or data: URL in ${name}`)
      if (/url\(\s*['"]?(?!#)/i.test(value) || /@import/i.test(value)) fail(path, el.line, `${name} may only reference the file itself (url(#id))`)
    }
  }
}
const svgFiles = allFiles.filter((f) => f.startsWith('svg/') && f.endsWith('.svg'))
for (const f of svgFiles) checkSvg(f)

// ── 3. countries and currencies (generated by the maintainer; checked so nothing breaks) ────────────
for (const f of allFiles.filter((f) => f.endsWith('.json') && !f.startsWith('data/'))) readJson(f)
const countriesDoc = existsSync(join(ROOT, 'data/countries.json')) ? readJson('data/countries.json') : null
const currenciesDoc = existsSync(join(ROOT, 'data/currencies.json')) ? readJson('data/currencies.json') : null
if (!countriesDoc) fail('data/countries.json', 1, 'missing or unreadable')
if (!currenciesDoc) fail('data/currencies.json', 1, 'missing or unreadable')
const countries = Array.isArray(countriesDoc?.countries) ? countriesDoc.countries : []
const currencies = Array.isArray(currenciesDoc?.currencies) ? currenciesDoc.currencies : []
const iso2s = new Set(countries.map((c) => c.iso2))
const currencyCodes = new Set(currencies.map((c) => c.code))
const PATTERN_RE = /^(¤[   ]?#,##0|#,##0[   ]?¤)$/

for (const c of countries) {
  const F = 'data/countries.json'
  const line = lineOf(F, `"iso2": ${JSON.stringify(c.iso2)}`)
  const at = (msg) => fail(F, line, `${c.iso2}: ${msg}`)
  if (!/^[A-Z]{2}$/.test(c.iso2 ?? '')) at('iso2 must be two capital letters')
  if (!isStr(c.name?.en) || !isStr(c.name?.fr)) at('needs name.en and name.fr')
  if (!REGIONS.includes(c.region)) at(`region must be one of ${REGIONS.join(', ')}`)
  if (!Array.isArray(c.currencies) || !c.currencies.length) at('needs at least one currency')
  else for (const code of c.currencies) if (!currencyCodes.has(code)) at(`unknown currency ${code}`)
  for (const svg of [c.flag?.svg, c.flag?.svgSquare]) if (!svg || !existsSync(join(ROOT, svg))) at(`missing flag ${svg}`)
  const f = c.amountFormat
  if (f === undefined) continue
  const fl = lineOf(F, '"amountFormat"', json.get(F).text.indexOf(`"iso2": ${JSON.stringify(c.iso2)}`))
  const af = (msg) => fail(F, fl, `${c.iso2}.amountFormat: ${msg}`)
  if (!f || typeof f !== 'object' || Array.isArray(f)) { af('must be an object'); continue }
  for (const k of AMOUNT_KEYS) if (!(k in f)) af(`missing ${k}`)
  for (const k of Object.keys(f)) if (!AMOUNT_KEYS.includes(k) && k !== 'source') af(`unknown key ${k}`)
  if (!/^[a-z]{2,3}(-[A-Z][a-z]{3})?(-[A-Z]{2})?$/.test(f.locale ?? '')) af(`bad locale ${JSON.stringify(f.locale)}`)
  for (const k of ['pattern', 'signPattern', 'alphaPattern']) if (!PATTERN_RE.test(f[k] ?? '')) af(`bad ${k} ${JSON.stringify(f[k])}`)
  if (!/^[   .,'’]$/.test(f.group ?? '')) af(`bad group ${JSON.stringify(f.group)}`)
  if (!/^[.,$]$/.test(f.decimal ?? '') || f.decimal === f.group) af(`bad decimal ${JSON.stringify(f.decimal)}`)
  if ('source' in f && !isUrl(f.source)) af('source must be a URL')
}
for (const cur of currencies) {
  const line = lineOf('data/currencies.json', `"code": ${JSON.stringify(cur.code)}`)
  const at = (msg) => fail('data/currencies.json', line, `${cur.code}: ${msg}`)
  if (!/^[A-Z]{3}$/.test(cur.code ?? '')) at('code must be three capital letters')
  if (!Number.isInteger(cur.decimals) || cur.decimals < 0) at('decimals must be a whole number')
  if (!cur.sign?.svg || !existsSync(join(ROOT, cur.sign.svg))) at(`missing sign svg ${cur.sign?.svg}`)
  if (cur.sign?.svgColor && !existsSync(join(ROOT, cur.sign.svgColor))) at(`missing colour sign svg ${cur.sign.svgColor}`)
  for (const iso2 of cur.countries ?? []) if (!iso2s.has(iso2)) at(`unknown country ${iso2}`)
}

// ── 4. operators ─────────────────────────────────────────────────────────────────────────────────────
const ids = new Map() // id → file
const usedLogos = new Set()
const successors = [] // [file, op]

function checkOperator(file, op, { intl }) {
  const line = idLine(file, op.id)
  const at = (msg) => fail(file, line, `${op.id ?? 'operator'}: ${msg}`)
  for (const k of Object.keys(op)) {
    if (!OPERATOR_KEYS.includes(k) && !(intl && k === 'availability')) at(`unknown key ${k}`)
  }
  if (!isStr(op.name)) at('needs a name')
  if (!Array.isArray(op.aliases) || !op.aliases.every(isStr)) at('aliases must be an array of names ([] when there are none)')
  if (op.type === 'fintech') at('type fintech was retired: use digital_bank, wallet, money_transfer or investment')
  else if (!TYPES.includes(op.type)) at(`type must be one of ${TYPES.join(', ')} (insurance and pension funds are out of scope)`)
  if (op.group !== undefined && op.group !== null && !isStr(op.group)) at('group must be a name or null')
  if ('consumer' in op && typeof op.consumer !== 'boolean') at('consumer must be true or false')
  if (!STATUSES.includes(op.status)) at(`status must be one of ${STATUSES.join(', ')}`)
  if (op.successor !== undefined && op.successor !== null) {
    if (typeof op.successor !== 'string') at('successor must be an operator id or null')
    else if (op.successor === op.id) at('successor cannot be the operator itself')
    else successors.push([file, op])
  }
  if (op.website !== undefined && op.website !== null && !isUrl(op.website)) at('website must be a URL')
  if (!Array.isArray(op.sources) || !op.sources.length || !op.sources.every(isUrl)) at('sources must list at least one URL (regulator list, official site or reputable press)')
  if (intl && 'presence' in op) at('international services carry no presence')
  if (!intl && 'presence' in op && (!Number.isInteger(op.presence) || op.presence < 1)) at('presence must be a whole number of at least 1 (or leave it out: the maintainer computes it)')

  const logo = op.logo
  if (logo === undefined || logo === null) return
  if (typeof logo !== 'object' || Array.isArray(logo)) { at('logo must be an object or null'); return }
  for (const k of Object.keys(logo)) if (!LOGO_KEYS.includes(k)) at(`unknown logo key ${k}`)
  if (logo.svg === null || logo.svg === undefined) return
  const folder = TYPES.includes(op.type) ? `svg/logos/${typeFolder(op.type)}/` : null
  if (typeof logo.svg !== 'string' || !/^svg\/logos\/[a-z-]+\/[a-z0-9]+(-[a-z0-9]+)*\.svg$/.test(logo.svg)) at('logo.svg must be svg/logos/<type>/<brand>.svg')
  else {
    if (folder && !logo.svg.startsWith(folder)) at(`a ${op.type} logo lives in ${folder}`)
    const p = join(ROOT, logo.svg)
    if (!existsSync(p)) at(`logo file ${logo.svg} does not exist`)
    else if ('sha256' in logo && logo.sha256 !== createHash('sha256').update(readFileSync(p)).digest('hex')) at('logo.sha256 does not match the file')
    usedLogos.add(logo.svg)
  }
  if (!isUrl(logo.source)) at('logo.source must be the URL of the original logo')
  if (!METHODS.includes(logo.method)) at(`logo.method must be one of ${METHODS.join(', ')}`)
  if (!BACKGROUNDS.includes(logo.background ?? null)) at('logo.background must be "dark", "light" or null')
  if ('sha256' in logo && !/^[0-9a-f]{64}$/.test(logo.sha256 ?? '')) at('logo.sha256 must be 64 lowercase hex characters')
}

function checkCoverage(file, doc) {
  for (const key of ['coverage', 'listSources']) {
    const v = doc[key] ?? {}
    if (typeof v !== 'object' || Array.isArray(v)) { fail(file, lineOf(file, `"${key}"`), `${key} must be an object`); continue }
    for (const [type, value] of Object.entries(v)) {
      const line = lineOf(file, `"${key}"`)
      if (!TYPES.includes(type)) fail(file, line, `${key}: unknown type ${type}`)
      if (key === 'coverage' && !COVERAGE.includes(value)) fail(file, line, `coverage.${type} must be one of ${COVERAGE.join(', ')}`)
      if (key === 'listSources' && !isUrl(value)) fail(file, line, `listSources.${type} must be a URL`)
    }
  }
}

function checkIds(file, ops, prefix) {
  for (const op of ops) {
    const line = idLine(file, op.id)
    if (typeof op.id !== 'string' || !op.id.startsWith(prefix) || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(op.id)) {
      fail(file, line, `id ${JSON.stringify(op.id)} must be ${prefix}<slug> (lowercase letters, digits and hyphens)`)
    }
    if (ids.has(op.id)) {
      const text = json.get(file).text
      const dup = ids.get(op.id) === file ? lineAt(text, text.lastIndexOf(`"id": ${JSON.stringify(op.id)}`)) : line
      fail(file, dup, `duplicate id ${op.id} (also in ${ids.get(op.id)})`)
    }
    else ids.set(op.id, file)
  }
}

for (const file of allFiles.filter((f) => /^data\/operators\/[A-Z]{2}\.json$/.test(f)).sort()) {
  const doc = readJson(file)
  if (!doc) continue
  const iso2 = file.slice(-7, -5)
  if (doc.country !== iso2) fail(file, lineOf(file, '"country"'), `country must be "${iso2}", as the file name`)
  if (!iso2s.has(iso2)) fail(file, 1, `${iso2} is not a country of data/countries.json`)
  if (!DATE_RE.test(doc.verifiedAt ?? '')) fail(file, lineOf(file, '"verifiedAt"'), 'verifiedAt must be a date, YYYY-MM-DD')
  checkCoverage(file, doc)
  if (!Array.isArray(doc.operators)) { fail(file, 1, 'operators must be an array'); continue }
  checkIds(file, doc.operators, `${iso2.toLowerCase()}-`)
  for (const op of doc.operators) checkOperator(file, op, { intl: false })
}

const INTL = 'data/international.json'
if (existsSync(join(ROOT, INTL))) {
  const doc = readJson(INTL)
  if (doc) {
    if (!DATE_RE.test(doc.verifiedAt ?? '')) fail(INTL, lineOf(INTL, '"verifiedAt"'), 'verifiedAt must be a date, YYYY-MM-DD')
    if (!Array.isArray(doc.operators)) fail(INTL, 1, 'operators must be an array')
    else {
      checkIds(INTL, doc.operators, 'intl-')
      for (const op of doc.operators) {
        checkOperator(INTL, op, { intl: true })
        const line = idLine(INTL, op.id)
        const at = (msg) => fail(INTL, line, `${op.id}: ${msg}`)
        const av = op.availability
        if (!av || typeof av !== 'object') { at('needs an availability { mode, countries, sources }'); continue }
        for (const k of Object.keys(av)) if (!['mode', 'countries', 'sources'].includes(k)) at(`unknown availability key ${k}`)
        if (!MODES.includes(av.mode)) at(`availability.mode must be one of ${MODES.join(', ')}`)
        if (!Array.isArray(av.countries)) at('availability.countries must be an array')
        else {
          for (const c of av.countries) if (!iso2s.has(c)) at(`availability: ${c} is not a country of data/countries.json`)
          if (new Set(av.countries).size !== av.countries.length) at('availability: a country is listed twice')
          if (av.mode === 'all' && av.countries.length) at('availability: mode "all" takes an empty countries list')
          if (av.mode !== 'all' && !av.countries.length) at(`availability: mode "${av.mode}" needs countries`)
        }
        if (!Array.isArray(av.sources) || !av.sources.length || !av.sources.every(isUrl)) at("availability.sources must list at least one URL (the service's own country list)")
      }
    }
  }
}

for (const [file, op] of successors) {
  if (!ids.has(op.successor)) fail(file, idLine(file, op.id), `${op.id}: successor ${op.successor} is not an operator id`)
}
// Only when every data file parsed: otherwise the logos of an unreadable file would all look unused.
const unreadable = allFiles.some((f) => f.startsWith('data/') && f.endsWith('.json') && !json.has(f))
for (const f of unreadable ? [] : svgFiles.filter((f) => f.startsWith('svg/logos/'))) {
  if (!usedLogos.has(f)) fail(f, 1, 'no operator uses this logo: point an operator\'s logo.svg at it, or remove it')
}

// ── result ───────────────────────────────────────────────────────────────────────────────────────────
errors.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
for (const e of errors) {
  if (CI) console.log(`::error file=${escProp(e.file)},line=${e.line},title=Registry rules::${esc(e.msg)}`)
  else console.error(`✗ ${e.file}:${e.line}  ${e.msg}`)
}
if (errors.length) {
  console.error(`\n${errors.length} error(s). The rules are in README.md.`)
  process.exit(1)
}
console.log(`OK — ${countries.length} countries, ${currencies.length} currencies, ${ids.size} operators, ${svgFiles.length} SVG files`)
