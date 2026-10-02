import { z } from 'zod'

// El contrato con el modelo. Su forma la condiciona la salida estructurada de
// Anthropic, que compila el esquema a una gramática con dos límites:
// - Como mucho 16 campos anulables. Se gastan en los datos que pueden faltar
//   o no leerse y cambian la decisión; los textos que todo documento trae van
//   sin null. Ahora hay 13.
// - Tamaño de la gramática. Con las cajas como objetos de cuatro campos no
//   compila; como listas de números sí.

// [x1, y1, x2, y2] en píxeles de la imagen enviada, que es como el modelo
// sitúa bien las cosas. extract.ts las convierte a BBox en fracciones.
const box = z.array(z.number())

const field = <T extends z.ZodType>(value: T) =>
  z.object({ value: value.nullable(), confidence: z.number() })

const text = z.object({ value: z.string(), confidence: z.number() })

const located = z.object({
  value: z.number().nullable(),
  confidence: z.number(),
  bbox: box.nullable(),
})

export const ModelDocSchema = z.object({
  supplier: text,
  supplierTaxId: field(z.string()),
  number: text,
  date: text,
  lines: z.array(
    z.object({
      code: field(z.string()),
      description: text,
      quantity: located,
      unit: field(z.string()),
      unitPrice: located,
      vatRate: field(z.number()),
      total: located,
      bbox: box,
    }),
  ),
  totals: z.object({
    base: field(z.number()),
    vat: field(z.number()),
    total: field(z.number()),
    bbox: box,
  }),
})

export type ModelDoc = z.infer<typeof ModelDocSchema>
