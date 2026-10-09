// Constructores de documentos para los tests. No los usa el pipeline.

import { inCase, link } from './link/link'
import { match } from './match/match'
import type { Amount, DocType, ExtractedDoc, Fact, Knowledge, Line, RuleContext } from './types'

const box = { x: 0, y: 0, w: 1, h: 1 }

type LineSpec = {
  code?: string | null
  description: string
  quantity?: number | Amount
  unit?: string | null
  unitPrice?: number | Amount
  vatRate?: number | null
  discount?: number | null
  // Si se omite, el importe sale de cantidad × precio × (1 − descuento).
  total?: number | Amount
}

const amount = (v: number | Amount): Amount => (typeof v === 'number' ? { value: v, confidence: 1 } : v)

export const unread: Amount = { value: null, confidence: 0 }

export function doc(docType: DocType, specs: LineSpec[], totals: Partial<ExtractedDoc['totals']> = {}): ExtractedDoc {
  const lines = specs.map((spec, i): Line => {
    const quantity = amount(spec.quantity ?? 1)
    const unitPrice = amount(spec.unitPrice ?? 1)
    const computed = (quantity.value ?? 0) * (unitPrice.value ?? 0) * (1 - (spec.discount ?? 0) / 100)
    return {
      key: `${docType === 'albaran' ? 'A' : 'F'}${i + 1}`,
      source: 0,
      code: spec.code ?? null,
      description: spec.description,
      quantity: { ...quantity, bbox: null },
      unit: spec.unit === undefined ? 'ud' : spec.unit,
      unitPrice: { ...unitPrice, bbox: null },
      vatRate: spec.vatRate === undefined ? 10 : spec.vatRate,
      discount: spec.discount ?? null,
      total: { ...amount(spec.total ?? computed), bbox: null },
      bbox: box,
    }
  })

  const base = lines.reduce((sum, l) => sum + (l.total.value ?? 0), 0)
  const vat = lines.reduce((sum, l) => sum + ((l.total.value ?? 0) * (l.vatRate ?? 0)) / 100, 0)
  const absent: Amount = { value: null, confidence: 1 }
  return {
    docType,
    supplier: 'Proveedor de prueba',
    supplierTaxId: 'B00000000',
    number: '1',
    date: '2026-09-01',
    refs: [],
    lines,
    totals: {
      base: amount(base),
      vat: docType === 'factura' ? amount(vat) : absent,
      total: docType === 'factura' ? amount(base + vat) : absent,
      bbox: box,
      ...totals,
    },
  }
}

// Omit sobre una unión se queda solo con los campos comunes; así se aplica a cada variante.
type Without<T, K extends string> = T extends unknown ? Omit<T, K> : never

export const fact = (knowledge: Without<Knowledge, 'supplierTaxId'>): Fact =>
  ({ ...knowledge, supplierTaxId: 'B00000000', id: 'f1', learnedAt: '2026-10-01T00:00:00Z', fromCase: 'c1', revokedAt: null }) as Fact

// Uno o varios albaranes, numerados como los numera el pipeline: "A1.1", "A2.1".
export function context(albaran: ExtractedDoc | ExtractedDoc[], factura: ExtractedDoc, facts: Fact[] = []): RuleContext {
  const albaranes = [albaran].flat().map(inCase)
  return { albaranes, factura, links: link(albaranes, factura), match: match(albaranes, factura, facts), facts }
}
