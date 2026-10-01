import { z } from 'zod'

// Solo lo que devuelve el modelo se valida con zod. El resto son tipos:
// lo produce nuestro propio código y no cruza ninguna frontera.

// Fracciones de la página (0..1), origen arriba a la izquierda.
export const BBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
})

// La confianza la declara el modelo: no es una probabilidad calibrada.
const field = <T extends z.ZodType>(value: T) =>
  z.object({ value: value.nullable(), confidence: z.number() })

// Solo los tres campos que se disputan llevan caja propia. Es opcional:
// si falta o no es creíble, se usa la caja de la línea.
const locatedField = <T extends z.ZodType>(value: T) =>
  z.object({
    value: value.nullable(),
    confidence: z.number(),
    bbox: BBoxSchema.nullable(),
  })

export const LineSchema = z.object({
  code: field(z.string()),
  description: field(z.string()),
  quantity: locatedField(z.number()),
  unit: field(z.string()),
  unitPrice: locatedField(z.number()),
  vatRate: field(z.number()),
  total: locatedField(z.number()),
  bbox: BBoxSchema,
})

export const ExtractedDocSchema = z.object({
  docType: z.enum(['albaran', 'factura']),
  supplier: field(z.string()),
  supplierTaxId: field(z.string()),
  number: field(z.string()),
  date: field(z.string()),
  lines: z.array(LineSchema),
  totals: z.object({
    base: field(z.number()),
    vat: field(z.number()),
    total: field(z.number()),
    bbox: BBoxSchema.nullable(),
  }),
})

export type BBox = z.infer<typeof BBoxSchema>
export type DocType = 'albaran' | 'factura'

// `key` no viene del modelo: se asigna por posición al extraer ("A1", "F3").
// Es lo que identifica una línea en los findings y en el dataset de evals.
export type Line = z.infer<typeof LineSchema> & { key: string }
export type ExtractedDoc = Omit<z.infer<typeof ExtractedDocSchema>, 'lines'> & {
  lines: Line[]
}

export type MatchResult = {
  pairs: { albaran: Line; factura: Line; score: number }[]
  onlyAlbaran: Line[]
  onlyFactura: Line[]
}

export type Severity = 'low' | 'medium' | 'high'

export type Evidence = {
  doc: DocType
  field: string
  value: string | number | null
  confidence: number
  bbox: BBox
}

export type Finding = {
  ruleId: string
  severity: Severity
  // Línea afectada: la de la factura si hay par, la del albarán si solo
  // existe allí, null si el finding es del documento entero.
  lineKey: string | null
  message: string
  impactEur: number | null
  confidence: number
  evidence: Evidence[]
}

// Un hecho pertenece siempre a un proveedor (por NIF). No hay hechos globales.
export type Fact = {
  id: string
  supplierTaxId: string
  learnedAt: string
  fromCase: string
  revokedAt: string | null
} & (
  | { kind: 'unit-equivalence'; product: string; from: string; to: string; factor: number }
  | { kind: 'product-alias'; albaran: string; factura: string }
)

export type RuleContext = {
  albaran: ExtractedDoc
  factura: ExtractedDoc
  match: MatchResult
  facts: Fact[]
}

export type Rule = {
  id: string
  severity: Severity
  description: string
  check(ctx: RuleContext): Finding[]
}

export type Outcome = 'pass' | 'ask' | 'escalate'

export type DatasetCase = {
  id: string
  albaran: string
  factura: string
  expected: {
    findings: { ruleId: string; lineKey: string | null }[]
    decision: Outcome
  }
  source: 'seed' | 'correction'
  note: string
}
