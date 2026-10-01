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
// Solo sirve para que un finding señale una línea de esta extracción. No es
// la identidad del producto: el eval resuelve eso por su cuenta.
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

// Lo que se aprende de un proveedor. `product` es el código del producto.
// Siempre va ligado a un NIF: no hay hechos globales.
export type Knowledge = { supplierTaxId: string } & (
  | { kind: 'unit-equivalence'; product: string; from: string; to: string; factor: number }
  | { kind: 'product-alias'; albaran: string; factura: string }
)

export type Fact = Knowledge & {
  id: string
  learnedAt: string
  fromCase: string
  revokedAt: string | null
}

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

// En el dataset las líneas se identifican por el id de producto del catálogo,
// no por posición ni por el texto del documento.
export type Expected = {
  findings: { ruleId: string; productId: string | null }[]
  decision: Outcome
}

// Lo que cada documento dice de verdad. El eval lo usa para saber a qué
// producto corresponde cada línea extraída, sin pasar por el matcher.
export type TruthLine = {
  productId: string
  code: string | null
  description: string
  quantity: number
}

export type DatasetCase = {
  id: string
  albaran: string
  factura: string
  lines: { albaran: TruthLine[]; factura: TruthLine[] }
  // Hechos sin los que el caso no se puede resolver solo. Con todos activos
  // se compara contra `withKnowledge`; si falta alguno, contra `withoutKnowledge`.
  requires: Knowledge[]
  expected: { withoutKnowledge: Expected; withKnowledge: Expected }
  // Holdout: comparte hecho con un caso de la demo pero nadie lo corrige a mano.
  holdout: boolean
  // Frontera: impacto pegado al umbral de escalado. Se reporta aparte.
  boundary: boolean
  source: 'seed' | 'correction'
  note: string
}
