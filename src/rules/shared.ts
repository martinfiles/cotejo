import { normalize, sameCode } from '../text'
import type { DocType, Evidence, Fact, Finding, Line, Rule } from '../types'

// Lo que usan varias reglas. Cada regla vive en su fichero; aquí solo está lo
// que se repetiría entre ellas.

export const close = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance

export const round2 = (n: number) => Math.round(n * 100) / 100

export const num = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 3 })
export const eur = (n: number) =>
  `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

export function finding(
  rule: Rule,
  details: Pick<Finding, 'lineKey' | 'message' | 'impactEur' | 'evidence'>,
): Finding {
  return { ruleId: rule.id, severity: rule.severity, signal: rule.signal, ...details }
}

// El número de una línea como evidencia. Si el modelo no dio caja para ese
// campo, o no era creíble, se señala la fila entera.
export function evidence(doc: DocType, line: Line, field: 'quantity' | 'unitPrice' | 'total'): Evidence {
  const { value, confidence, bbox } = line[field]
  return { doc, field, value, confidence, bbox: bbox ?? line.bbox }
}

// Importe que debería tener una línea según su cantidad, precio y descuento.
export function expectedTotal(line: Line) {
  if (line.quantity.value === null || line.unitPrice.value === null) return null
  return line.quantity.value * line.unitPrice.value * (1 - (line.discount ?? 0) / 100)
}

// "Kg.", "kgs" y "kg" son la misma unidad.
const unitKey = (unit: string) => normalize(unit).replace(/\./g, '').replace(/s$/, '')

const isProduct = (product: string, line: Line) =>
  line.code ? sameCode(product, line.code) : normalize(product) === normalize(line.description)

// Cuántas unidades de la factura es una unidad del albarán: 1 si usan la
// misma, el factor aprendido si hay una equivalencia para ese producto, y
// null si son unidades distintas y no se sabe convertir.
export function unitFactor(albaran: Line, factura: Line, facts: Fact[]): number | null {
  if (!albaran.unit || !factura.unit) return 1
  const a = unitKey(albaran.unit)
  const f = unitKey(factura.unit)
  if (a === f) return 1
  for (const fact of facts) {
    if (fact.kind !== 'unit-equivalence') continue
    if (!isProduct(fact.product, factura) && !isProduct(fact.product, albaran)) continue
    if (unitKey(fact.from) === a && unitKey(fact.to) === f) return fact.factor
    if (unitKey(fact.from) === f && unitKey(fact.to) === a) return 1 / fact.factor
  }
  return null
}
