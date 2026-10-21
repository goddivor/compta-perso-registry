// Layer 3, step 3 — contact sheet for human/visual review of produced logos.
// Writes .cache/logos/review-<type>-<page>.html (60 tiles per page), each tile = logo on light + dark,
// brand key, method. Usage: node scripts/logos/review.mjs <type> [status=pending]
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const C = join(ROOT, '.cache/logos')
const [type, status = 'pending'] = process.argv.slice(2)
const cands = JSON.parse(readFileSync(join(C, 'candidates.json'), 'utf8'))
const results = JSON.parse(readFileSync(join(C, 'results.json'), 'utf8'))
const rows = Object.entries(results).filter(([k, r]) => r.file && cands[k]?.type === type && (status === 'all' || r.review === status))
const PER = 60
// Snapshot of the order, so mark.mjs maps tile numbers to brands even after results change.
writeFileSync(join(C, `review-order-${type}.json`), JSON.stringify(rows.map(([k]) => k)))
for (let p = 0; p * PER < rows.length; p++) {
  const tiles = rows.slice(p * PER, (p + 1) * PER).map(([k, r], i) => `
  <div class="t"><div class="n">${p * PER + i + 1}</div>
    <div class="pair"><div class="l"><img src="out/${r.file}"></div><div class="d"><img src="out/${r.file}"></div></div>
    <b>${cands[k].name}</b><small>${k} · ${r.method} · ${Math.round(r.bytes / 1024)} KB</small></div>`).join('')
  writeFileSync(join(C, `review-${type}-${p + 1}.html`), `<!doctype html><meta charset="utf-8"><style>
  body{margin:0;padding:12px;background:#ddd;font:12px system-ui;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}
  .t{background:#fff;border-radius:6px;padding:6px;position:relative}.n{position:absolute;top:2px;left:4px;font-weight:700;color:#c00}
  .pair{display:flex;gap:4px}.pair div{flex:1;height:80px;display:grid;place-items:center;border-radius:4px}
  .l{background:#fff;border:1px solid #eee}.d{background:#1a1714}img{max-width:90%;max-height:70px}
  b{display:block;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}small{color:#666;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  </style>${tiles}`)
}
console.log(`${rows.length} logos → ${Math.ceil(rows.length / PER)} page(s)`)
