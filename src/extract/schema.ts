import { z } from 'zod'

// El contrato con el modelo. Su forma la condiciona la salida estructurada de
// Anthropic, que compila el esquema a una gramática con dos límites, los dos
// encontrados a base de errores de la API:
// - Tamaño de la gramática. No compila con las cajas como objetos de cuatro
//   campos (como listas sí), ni con confianza en todos los campos. Por eso la
//   confianza va solo en los números que se disputan y en los totales.
// - Como mucho 16 campos anulables. Ahora hay 14: quedan 2. Un campo nuevo
//   que no admita null no cuenta para este límite.

// [x1, y1, x2, y2] en píxeles de la imagen enviada, que es como el modelo
// sitúa bien las cosas. extract.ts las convierte a BBox en fracciones.
const box = z.array(z.number())

const amount = z.object({ value: z.number().nullable(), confidence: z.number() })

const located = z.object({
  value: z.number().nullable(),
  confidence: z.number(),
  bbox: box.nullable(),
})

export const ModelDocSchema = z.object({
  supplier: z.string(),
  supplierTaxId: z.string().nullable(),
  number: z.string(),
  date: z.string(),
  lines: z.array(
    z.object({
      code: z.string().nullable(),
      description: z.string(),
      quantity: located,
      unit: z.string().nullable(),
      unitPrice: located,
      vatRate: z.number().nullable(),
      discount: z.number().nullable(),
      total: located,
      bbox: box,
    }),
  ),
  totals: z.object({
    base: amount,
    vat: amount,
    total: amount,
    bbox: box,
  }),
})

export type ModelDoc = z.infer<typeof ModelDocSchema>
