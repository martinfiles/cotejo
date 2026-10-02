import { config } from '../config'
import { normalize, sameCode } from '../text'
import type { ExtractedDoc, Fact, Line, MatchResult } from '../types'

// Cruce determinista de las líneas del albarán con las de la factura. Aquí no
// hay modelo: si dos líneas se casan, se puede explicar por qué.

const STOPWORDS = new Set(['de', 'del', 'la', 'el', 'en', 'con'])

// Palabras y números de una descripción. "0,5" se queda entero para que no
// se confunda con "5", y las letras sueltas ("S/P", "24x33") se descartan.
function tokens(description: string) {
  const found = normalize(description).match(/\d+(?:[.,]\d+)?|[a-z]+/g) ?? []
  return found
    .map((t) => t.replace(',', '.'))
    .filter((t) => /\d/.test(t) || (t.length > 1 && !STOPWORDS.has(t)))
}

const numbersOf = (list: string[]) => list.filter((t) => /\d/.test(t)).sort().join(' ')

export function similarity(a: string, b: string) {
  const ta = new Set(tokens(a))
  const tb = new Set(tokens(b))
  // Los números de una descripción son el formato ("5 kg", "0,5 kg"). Si las
  // dos los traen y no coinciden, es otro producto por mucho que se parezca.
  const na = numbersOf([...ta])
  const nb = numbersOf([...tb])
  if (na && nb && na !== nb) return 0
  if (ta.size + tb.size === 0) return 0
  const shared = [...ta].filter((t) => tb.has(t)).length
  return (2 * shared) / (ta.size + tb.size)
}

// `facts` son los hechos vigentes del proveedor de estos documentos; filtrar
// por proveedor y por revocados es cosa de quien llama.
export function match(albaran: ExtractedDoc, factura: ExtractedDoc, facts: Fact[]): MatchResult {
  const pairs: MatchResult['pairs'] = []
  const freeA = new Set(albaran.lines)
  const freeF = new Set(factura.lines)
  const pair = (a: Line, f: Line, by: MatchResult['pairs'][number]['by'], score: number) => {
    pairs.push({ albaran: a, factura: f, by, score })
    freeA.delete(a)
    freeF.delete(f)
  }

  // 1. Por código de producto, que es lo único inequívoco.
  for (const a of albaran.lines) {
    const code = a.code
    const f = code && [...freeF].find((f) => f.code && sameCode(code, f.code))
    if (f) pair(a, f, 'code', 1)
  }

  // 2. Por alias aprendido del proveedor.
  for (const a of [...freeA]) {
    for (const fact of facts) {
      if (fact.kind !== 'product-alias' || normalize(fact.albaran) !== normalize(a.description)) continue
      const f = [...freeF].find((f) => normalize(f.description) === normalize(fact.factura))
      if (f) pair(a, f, 'alias', 1)
    }
  }

  // 3. Por parecido de la descripción, de la pareja más parecida a la menos.
  // Dos líneas que traen código cada una y no casaron en el paso 1 son
  // productos distintos: no se intenta por descripción.
  const candidates = [...freeA]
    .flatMap((a) => [...freeF].map((f) => ({ a, f, score: similarity(a.description, f.description) })))
    .filter((c) => !(c.a.code && c.f.code) && c.score >= config.match.minSimilarity)
    .sort((x, y) => y.score - x.score)
  for (const c of candidates) {
    if (freeA.has(c.a) && freeF.has(c.f)) pair(c.a, c.f, 'description', c.score)
  }

  return { pairs, onlyAlbaran: [...freeA], onlyFactura: [...freeF] }
}
