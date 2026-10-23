// Prints the release manifest: schema, tag, commit, generation time and the sha256 of every data/**/*.json.
//   node .github/scripts/manifest.mjs <tag> <commit> > index.json
// Dependency-free on purpose (node:fs, node:path, node:crypto only).
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { createHash } from 'node:crypto'

const [tag, commit] = process.argv.slice(2)
if (!/^v\d+\.\d+\.\d+$/.test(tag ?? '') || !/^[0-9a-f]{40}$/.test(commit ?? '')) {
  console.error('usage: node .github/scripts/manifest.mjs <vX.Y.Z> <40-hex commit>')
  process.exit(2)
}
const ROOT = join(import.meta.dirname, '..', '..')
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const p = join(dir, name)
  return statSync(p).isDirectory() ? walk(p) : [p]
})
const files = Object.fromEntries(
  walk(join(ROOT, 'data'))
    .filter((p) => p.endsWith('.json'))
    .map((p) => relative(ROOT, p).split(sep).join('/'))
    .sort()
    .map((path) => [path, createHash('sha256').update(readFileSync(join(ROOT, path))).digest('hex')]),
)
const manifest = { schema: 1, tag, commit, generated: new Date().toISOString(), files }
process.stdout.write(JSON.stringify(manifest, null, 2) + '\n')
