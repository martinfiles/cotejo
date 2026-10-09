import { config } from '../config'
import { normalize, sameCode } from '../text'
import type { ExtractedDoc, Fact, Line, Located, MatchResult } from '../types'

// Cruce determinista de lo entregado (las líneas de todos los albaranes del
// caso) con lo facturado. Aquí no hay modelo: si dos líneas se casan, se puede
// explicar por qué.

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

const round3 = (n: number) => Math.round(n * 1000) / 1000

// Mismo producto, misma unidad y mismo precio: es la misma línea partida en
// dos entregas, o repetida en la factura una vez por albarán.
const sameProduct = (a: Line, b: Line) =>
  (a.code && b.code ? sameCode(a.code, b.code) : !a.code && !b.code && normalize(a.description) === normalize(b.description)) &&
  normalize(a.unit ?? '') === normalize(b.unit ?? '') &&
  a.unitPrice.value === b.unitPrice.value &&
  (a.discount ?? 0) === (b.discount ?? 0)

// Se compara lo entregado en total con lo facturado en total: las líneas del
// mismo producto se suman a cada lado antes de casar. La línea sumada guarda
// sus partes, que es donde están las cajas para señalar cada número.
function mergeSameProduct(lines: Line[]): Line[] {
  const groups: Line[][] = []
  for (const line of lines) {
    const group = groups.find(([first]) => sameProduct(first!, line))
    if (group) group.push(line)
    else groups.push([line])
  }
  return groups.map((parts) => {
    if (parts.length === 1) return parts[0]!
    // Con una parte sin leer no hay suma: de eso avisa unreadable-amount.
    const sum = (field: 'quantity' | 'total'): Located => ({
      value: parts.some((p) => p[field].value === null) ? null : round3(parts.reduce((acc, p) => acc + p[field].value!, 0)),
      confidence: Math.min(...parts.map((p) => p[field].confidence)),
      bbox: null,
    })
    return { ...parts[0]!, quantity: sum('quantity'), total: sum('total'), parts }
  })
}

// Las claves de una línea y de las líneas que suma.
export const keysOf = (line: Line) => line.parts?.map((p) => p.key) ?? [line.key]

// `facts` son los hechos vigentes del proveedor de estos documentos; filtrar
// por proveedor y por revocados es cosa de quien llama.
export function match(albaranes: ExtractedDoc[], factura: ExtractedDoc, facts: Fact[]): MatchResult {
  const pairs: MatchResult['pairs'] = []
  const delivered = mergeSameProduct(albaranes.flatMap((albaran) => albaran.lines))
  const freeA = new Set(delivered)
  const freeF = new Set(mergeSameProduct(factura.lines))
  const pair = (a: Line, f: Line, by: MatchResult['pairs'][number]['by'], score: number) => {
    pairs.push({ albaran: a, factura: f, by, score })
    freeA.delete(a)
    freeF.delete(f)
  }

  // 1. Por código de producto, que es lo único inequívoco.
  for (const a of delivered) {
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
