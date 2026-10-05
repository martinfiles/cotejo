// Todos los números del proyecto viven aquí. Son un punto de partida sin
// calibrar: cada uno lleva al lado por qué tiene ese valor.

export const config = {
  models: {
    // No es el más barato. Haiku 4.5 lee bien los valores pero sitúa las
    // cajas muy lejos de su sitio (probado en la factura limpia), y sin
    // cajas no se puede señalar el número en disputa. Sonnet 5.5 las clava,
    // también en la foto torcida.
    extract: 'claude-sonnet-5-5',
    // Redactar una pregunta corta a partir de datos ya estructurados no
    // necesita visión ni mucho modelo: aquí sí va el más barato.
    question: 'claude-haiku-4-5',
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

  match: {
    // Parecido mínimo entre dos descripciones (Dice sobre palabras, de 0 a 1)
    // para casarlas cuando no hay código. Con 0,6 casa "RAPE COLA S/P" con
    // "Rape cola sin piel" (0,67) y no casa "Tomate pera" con "Tomate
    // triturado lata 2,5 kg" (0,29).
    minSimilarity: 0.6,
  },

  rules: {
    // Diferencia por debajo de la cual dos precios unitarios son el mismo:
    // medio céntimo, para absorber el redondeo al céntimo.
    priceToleranceEur: 0.005,
    // Lo mismo para importes y sumas, donde el redondeo de varias líneas
    // puede acumular algún céntimo.
    amountToleranceEur: 0.05,
    // Las básculas dan tres decimales; por debajo de un gramo es la misma
    // cantidad.
    quantityTolerance: 0.001,
    // Un precio que se multiplica o divide por más de esto entre albarán y
    // factura se trata como lectura dudosa (una coma mal leída), no como
    // subida de precio. Ningún caso del seed llega; valor sin calibrar.
    maxPriceRatio: 5,
    // Único uso de la confianza que declara el modelo. Solo en el extremo:
    // el modelo devuelve 0 cuando no puede leer un importe. La confianza NO
    // es estable entre ejecuciones y no sirve como umbral fino: con el mismo
    // prompt se movió hasta 0,07 en una segunda lectura, y al cambiar el
    // prompt la misma cantidad pasó de 0,6 a 0,8 (ver
    // evals/experiments/self-consistency.md). Este corte solo separa "no
    // leído" de todo lo demás. La duda sobre una lectura la dan las reglas
    // deterministas (aritmética de línea, sumas, IVA, rango de precio).
    minReadConfidence: 0.5,
  },

  decide: {
    // Euros de cobro de más a partir de los que una discrepancia real se
    // escala en vez de preguntarse. Es la cifra que salió al diseñar los
    // casos frontera (18,90 € pregunta, 20,40 € escala). Sin calibrar: el
    // valor bueno depende de cuánto cuesta una reclamación al proveedor.
    escalateFromEur: 20,
  },

  question: {
    // Una pregunta de dos o tres frases. Si se corta, se nota al leerla.
    maxOutputTokens: 400,
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
