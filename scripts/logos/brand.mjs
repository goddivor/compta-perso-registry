// Brand grouping shared by the logo scripts: one logo per brand, reused across countries.
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const { countries } = JSON.parse(readFileSync(join(ROOT, 'data/countries.json'), 'utf8'))
// Country names as operators write them: English, French, Portuguese, Spanish (CLDR), plus common short
// forms. Missing one splits a brand ("Orabank Burkina", "Orabank Guiné-Bissau" stood apart from "Orabank").
const cldrNames = (lang) => JSON.parse(readFileSync(join(ROOT, `node_modules/cldr-localenames-full/main/${lang}/territories.json`), 'utf8')).main[lang].localeDisplayNames.territories
const LOCALIZED = ['pt', 'es'].map(cldrNames)
const SHORT = ['burkina', 'rdc', 'rd congo', 'drc', 'rca', 'ci', 'cote divoire', 'guinee bissau', 'guinea bissau', 'sao tome', 'eswatini', 'swaziland', 'cabo verde', 'cap vert', 'tchad', 'centrafrique', 'mauritanie', 'gambie', 'egypte', 'congo brazzaville', 'congo kinshasa', 'tanzanie']
const countryWords = [...new Set([...countries.flatMap((c) => [c.name.en, c.name.fr, ...LOCALIZED.map((t) => t[c.iso2])]).filter(Boolean).map((n) => norm(n)), ...SHORT])].sort((a, b) => b.length - a.length)

export function norm(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim()
}
const LEGAL = /\b(s ?a|sa|plc|ltd|limited|sarl|s a r l|inc|corp|corporation|company|co|cie|group|groupe|holding|bank limited)\b/g
// Words that make the country part of the NAME: "Crédit du Maroc" ≠ "Crédit du Congo".
const CONNECTOR = /\b(du|de|des|d|of|the|la|le|les|del|do|da|dos|das|al|el)$/
const SHORT_OF = { BF: ['burkina'], CD: ['rdc', 'rd congo', 'drc', 'congo kinshasa'], CF: ['rca', 'centrafrique'], CI: ['ci', 'cote divoire'], GW: ['guinee bissau', 'guinea bissau'], ST: ['sao tome'], SZ: ['eswatini', 'swaziland'], CV: ['cabo verde', 'cap vert'], TD: ['tchad'], MR: ['mauritanie'], GM: ['gambie'], EG: ['egypte'], CG: ['congo brazzaville'], TZ: ['tanzanie'] }
const NAMES_OF = Object.fromEntries(countries.map((c) => [c.iso2, [c.name.en, c.name.fr, ...LOCALIZED.map((t) => t[c.iso2])].filter(Boolean).map((n) => norm(n)).concat(SHORT_OF[c.iso2] ?? [])]))

export function brandKey(op, iso2) {
  let n = norm(op.name)
  // Banks of a pan-African group share the group logo; mobile money brands keep their own name.
  if (op.group && op.type !== 'mobile_money') {
    const g = norm(op.group)
    if (n.startsWith(g)) return g.replace(/ /g, '-')
  }
  // Drop the operator's OWN country only when it is appended to the brand ("Orabank Togo", "CBAO Burkina",
  // "FNB Moçambique"); never when the name needs it ("Crédit du Maroc", "Banque Commerciale du Niger", "e-Mali").
  const own = iso2 ? NAMES_OF[iso2] ?? [] : countryWords
  for (const w of [...own].sort((a, b) => b.length - a.length)) {
    if (!n.endsWith(` ${w}`)) continue
    const stem = n.slice(0, -w.length - 1).trim()
    if (stem.length >= 3 && !CONNECTOR.test(stem)) n = stem
    break
  }
  n = n.replace(LEGAL, ' ').replace(/\s+/g, ' ').trim()
  return (n.length > 2 ? n : norm(op.name)).replace(/ /g, '-')
}


// Same name or acronym, DIFFERENT institutions per country (found by scripts/logos/audit-brands.mjs):
// never share a logo across countries — the key gets the country code.
export const PER_COUNTRY = new Set(['bank:bci', 'bank:bia', 'bank:bni', 'bank:bdm', 'bank:trust-bank', 'bank:fidelity-bank',
  'bank:international-commercial-bank', 'bank:al-salam-bank', 'bank:first-atlantic-bank',
  'microfinance:coopec-ad', 'microfinance:finam'])
export const brandKeyOf = (op, iso2) => {
  const key = `${op.type === 'mobile_money' ? 'mm' : op.type}:${brandKey(op, iso2)}`
  return PER_COUNTRY.has(key) && iso2 ? `${key}-${iso2.toLowerCase()}` : key
}
