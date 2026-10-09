// Tipos de dominio: lo que circula entre las etapas del pipeline. El esquema
// zod de lo que devuelve el modelo está en extract/schema.ts.

// Fracciones de la página (0..1), origen arriba a la izquierda.
export type BBox = { x: number; y: number; w: number; h: number }
export type DocType = 'albaran' | 'factura'

// Un número con la confianza que declara el modelo, que no es una
// probabilidad calibrada. Solo la llevan los importes que se disputan.
export type Amount = { value: number | null; confidence: number }
// Los tres números de una línea llevan además caja propia. Es opcional: si
// es null se usa la caja de la línea.
export type Located = Amount & { bbox: BBox | null }

// Otro documento que este cita. Una factura cita sus albaranes, por número o
// por fecha, o un pedido; un albarán cita su pedido.
export type Ref = { kind: 'albaran' | 'pedido'; number: string | null; date: string | null }

export type Line = {
  // Se asigna por posición ("F3"; "A2.3" es la tercera línea del segundo
  // albarán del caso). Solo sirve para que un finding señale una línea de
  // esta extracción. No es la identidad del producto: el eval resuelve eso
  // por su cuenta.
  key: string
  // De qué albarán del caso viene, por posición en la lista. 0 en la factura.
  source: number
  code: string | null
  description: string
  quantity: Located
  unit: string | null
  unitPrice: Located
  vatRate: number | null
  // Descuento de la línea en %. El importe es cantidad × precio × (1 − descuento).
  discount: number | null
  total: Located
  bbox: BBox
  // Solo en una línea que suma varias del mismo producto (el mismo arroz en
  // dos albaranes): las líneas de las que sale.
  parts?: Line[]
}

export type ExtractedDoc = {
  // Lo sabe quien sube el documento, no lo decide el modelo.
  docType: DocType
  supplier: string
  supplierTaxId: string | null
  number: string
  date: string
  refs: Ref[]
  lines: Line[]
  totals: { base: Amount; vat: Amount; total: Amount; bbox: BBox }
}

// Cómo se sabe que cada albarán del caso es de esta factura.
export type LinkResult = {
  // Uno por albarán, en el orden del caso. null si nada los une.
  links: { albaran: number; by: 'number' | 'date' | 'order' | null }[]
  // Albaranes que la factura cita y no están en el caso.
  missing: Ref[]
  // Albaranes del caso (por posición) que la factura no cita.
  uncited: number[]
}

export type MatchResult = {
  // `by` dice con qué se casaron; `score` solo baja de 1 si fue por descripción.
  pairs: { albaran: Line; factura: Line; by: 'code' | 'alias' | 'description'; score: number }[]
  onlyAlbaran: Line[]
  onlyFactura: Line[]
}

// Qué le dice un finding a la política de decisión. Lo fija la regla:
// - discrepancy: los dos documentos, bien leídos, no dicen lo mismo.
// - inconsistency: un documento se contradice consigo mismo.
// - read-doubt: no me creo lo que he leído.
// - missing-knowledge: falta saber algo del proveedor para poder comparar.
// - missing-document: los papeles del caso no son los que cita la factura.
export type Signal = 'discrepancy' | 'inconsistency' | 'read-doubt' | 'missing-knowledge' | 'missing-document'

// El dato concreto del documento en que se apoya un finding, con la caja
// para recortarlo en la interfaz.
export type Evidence = {
  doc: DocType
  // Qué albarán del caso, por posición. 0 en la factura.
  source: number
  field: string
  value: number | null
  confidence: number
  bbox: BBox
}

export type Finding = {
  ruleId: string
  signal: Signal
  // Línea afectada: la de la factura si hay par, la del propio documento si
  // el finding es de uno solo, null si es del documento entero.
  lineKey: string | null
  message: string
  // Euros que la factura cobra de más (negativo si es a favor). null si el
  // finding no tiene importe.
  impactEur: number | null
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
  albaranes: ExtractedDoc[]
  factura: ExtractedDoc
  links: LinkResult
  match: MatchResult
  facts: Fact[]
}

export type Rule = {
  id: string
  // Qué significan sus findings. Una regla puede afinarlo en un finding concreto.
  signal: Signal
  description: string
  check(ctx: RuleContext): Finding[]
}

export type Outcome = 'pass' | 'ask' | 'escalate'

// Por qué se decide lo que se decide. Se ve en la interfaz y se comprueba en
// el eval.
export type Reason =
  | 'all_matched' // pass: no hay nada que decir
  | 'overcharge' // escalate: la factura cobra de más, por encima del umbral
  | 'minor_discrepancy' // ask: discrepancia real pero pequeña
  | 'undercharge' // ask: la diferencia va a favor del restaurante
  | 'document_ambiguous' // ask: un documento se contradice consigo mismo
  | 'low_confidence_read' // ask: hay un importe que no se pudo leer
  | 'missing_knowledge' // ask: falta saber algo del proveedor
  | 'missing_document' // ask: falta un albarán o sobra uno que la factura no cita

// Lo que el humano puede hacer con un caso. El efecto de cada botón lo fija
// el código; el modelo solo redacta la pregunta.
export type Resolution = {
  kind: 'accept' | 'claim' | 'rectify' | 'learn'
  label: string
  // Solo en learn: el hecho que se guardará.
  fact?: Knowledge
  // Solo en learn de una equivalencia: el factor lo escribe el humano.
  factorPrompt?: string
}

export type Decision = {
  outcome: Outcome
  reason: Reason
  // Lo que la factura cobra de más según las discrepancias entre documentos.
  overchargeEur: number
  options: Resolution[]
  // La pregunta al humano, redactada por el modelo. Solo en ask.
  question: string | null
}

// En el dataset las líneas se identifican por el id de producto del catálogo,
// no por posición ni por el texto del documento.
export type Expected = {
  findings: { ruleId: string; productId: string | null }[]
  decision: Outcome
  // null cuando la etiqueta viene de una respuesta humana que dice qué había
  // que decidir pero no por qué.
  reason: Reason | null
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
  albaranes: string[]
  factura: string
  // `albaran` son las líneas de todos los albaranes, seguidas.
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
  // Solo en las correcciones: qué respondió el humano y a qué caso.
  correction?: { effect: Resolution['kind']; label: string; fromCase: string; at: string }
  note: string
}
