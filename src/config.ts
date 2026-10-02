// Todos los números del proyecto viven aquí. Son un punto de partida sin
// calibrar: cada uno lleva al lado por qué tiene ese valor.

export const config = {
  models: {
    // No es el más barato. Haiku 4.5 lee bien los valores pero sitúa las
    // cajas muy lejos de su sitio (probado en la factura limpia), y sin
    // cajas no se puede señalar el número en disputa. Sonnet 5.5 las clava,
    // también en la foto torcida.
    extract: 'claude-sonnet-5-5',
  },

  // USD por millón de tokens. Precios de lista de Anthropic consultados el
  // 2026-10-01. Solo se usan para la tabla de coste por documento.
  pricesPerMTok: {
    'claude-haiku-4-5': { input: 1, output: 5 },
    'claude-sonnet-5-5': { input: 2, output: 10 },
  } as Record<string, { input: number; output: number }>,

  raster: {
    // Lado largo de la página en píxeles. Sonnet 5.5 admite hasta 2576, pero
    // a 1568 un A4 se lee sin problema y la imagen cuesta menos tokens.
    longEdgePx: 1568,
  },

  extract: {
    // Sonnet 5.5 siempre razona antes de responder; el esfuerzo regula
    // cuánto. Transcribir una tabla no necesita deliberar.
    effort: 'low',
    // Incluye el razonamiento. Margen para una página con decenas de líneas;
    // si se queda corto la salida se corta y la validación falla, no pasa
    // en silencio.
    maxOutputTokens: 8000,
  },
} as const

export type Usage = { inputTokens: number; outputTokens: number }

export function costUsd(model: string, usage: Usage) {
  const price = config.pricesPerMTok[model]
  if (!price) throw new Error(`Falta el precio de ${model} en config.ts`)
  return (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000
}
