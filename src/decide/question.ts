import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'
import { readCache, sha256, writeCache } from '../cache'
import { config, costUsd, type Usage } from '../config'
import { generation } from '../obs/langfuse'
import { eur } from '../rules/shared'
import type { Finding, MatchResult, Reason } from '../types'

// La pregunta al humano la redacta el modelo a partir de los findings, y el
// código comprueba que no se inventa cifras. Si se inventa alguna, la
// pregunta no se publica: se usa una plantilla hecha con los findings.

const SYSTEM = `Escribe, en dos o tres frases, de tú y sin saludos, la pregunta para la persona que ha recibido la mercancía en un restaurante: qué dicen los hallazgos, con sus productos y sus cifras, y qué hacemos.

Usa solo los datos de los hallazgos, escritos como aparecen en ellos. No añadas ninguna cifra, cantidad, producto ni nombre que no esté. Si hay "ademas", menciónalo con su importe. Texto plano.`

export type Question = {
  text: string
  // true si el texto del modelo traía cifras que no están en los findings.
  fromTemplate: boolean
  invented: string[]
  model: string
  usage: Usage
  costUsd: number
  latencyMs: number
  cached: boolean
}

type CacheEntry = { text: string; model: string; usage: Usage; latencyMs: number }

// --- Comprobación de cifras -------------------------------------------------

// "1.234,56" es 1234.56, "5,20" es 5.2, "24" es 24.
function toNumber(token: string) {
  if (token.includes(',')) return Number(token.replace(/\./g, '').replace(',', '.'))
  if (/^\d{1,3}(\.\d{3})+$/.test(token)) return Number(token.replace(/\./g, ''))
  return Number(token)
}

const NUMBER_WORDS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7,
  ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, quince: 15, veinte: 20, media: 0.5,
}

// En singular: al comparar se le quita la "s" o "es" final a la palabra.
const UNITS = ['botella', 'caja', 'kg', 'kilo', 'gramo', 'litro', 'ud', 'unidad', 'lata', 'saco', 'malla', 'garrafa', 'paquete', 'docena', 'pieza', 'bandeja']

// Las cifras de un texto: las escritas con dígitos y las escritas con letra
// delante de una unidad que sale en los findings ("una botella"). Un "una"
// suelto es un artículo, no una cantidad.
function numbersIn(text: string, units: Set<string>) {
  const found = (text.match(/\d+(?:[.,]\d+)*/g) ?? []).map((t) => ({ token: t, value: toNumber(t) }))
  // La segunda palabra va en un lookahead: así cada palabra se mira como unidad
  // de la anterior y como número de la siguiente.
  for (const [, word, unit] of text.toLowerCase().matchAll(/(?<!\p{L})(\p{L}+)\s+(?=(\p{L}+))/gu)) {
    const value = NUMBER_WORDS[word!]
    if (value !== undefined && units.has(unit!.replace(/(es|s)$/, ''))) found.push({ token: `${word} ${unit}`, value })
  }
  return found
}

// Las cifras del texto que no aparecen en ningún finding ni en su evidencia.
export function inventedNumbers(text: string, findings: Finding[]) {
  const sources = findings.map((f) => f.message).join(' ')
  // Unidades: las habituales en un albarán y las palabras que siguen a una
  // cifra en los findings ("18 botella", "36 kg"). Así "una botella" cuenta
  // como cantidad aunque el finding no hable de botellas.
  const units = new Set([
    ...UNITS,
    ...[...sources.toLowerCase().matchAll(/\d[\d.,]*\s+([a-záéíóúñ]+)/g)].map((m) => m[1]!.replace(/(es|s)$/, '')),
  ])
  const allowed = [
    ...numbersIn(sources, units).map((n) => n.value),
    ...findings.flatMap((f) => [f.impactEur, f.impactEur === null ? null : -f.impactEur, ...f.evidence.map((e) => e.value)]),
  ].filter((n): n is number => n !== null)
  return numbersIn(text, units)
    .filter((n) => !allowed.some((a) => Math.abs(a - n.value) < 0.005))
    .map((n) => n.token)
}

// --- Plantilla --------------------------------------------------------------

const ASK: Partial<Record<Reason, string>> = {
  minor_discrepancy: '¿Lo reclamamos o damos la factura por buena?',
  undercharge: '¿Avisamos al proveedor o damos la factura por buena?',
  document_ambiguous: 'Mira el papel: ¿qué es lo correcto?',
  low_confidence_read: 'Mira el documento: ¿se puede leer bien, o pedimos otro?',
  missing_knowledge: '¿Nos lo aclaras para la próxima vez?',
}

export function templateQuestion(reason: Reason, findings: Finding[]) {
  return [...findings.map((f) => f.message), ASK[reason] ?? '¿Qué hacemos?'].join(' ')
}

// --- Redacción --------------------------------------------------------------

// Una duda bloquea el caso entero, pero un cobro de más claro en otra línea no
// debe perderse de vista. "Claro" es que ni su línea ni su pareja en el otro
// documento tengan ninguna duda.
function firmOvercharges(findings: Finding[], match: MatchResult) {
  const doubtful = new Set(findings.filter((f) => f.signal !== 'discrepancy' && f.lineKey).map((f) => f.lineKey!))
  for (const { albaran, factura } of match.pairs) {
    if (doubtful.has(albaran.key) || doubtful.has(factura.key)) [albaran.key, factura.key].forEach((k) => doubtful.add(k))
  }
  return findings.filter(
    (f) => f.signal === 'discrepancy' && (f.impactEur ?? 0) > 0 && f.lineKey && !doubtful.has(f.lineKey),
  )
}

export async function draftQuestion(
  reason: Reason,
  findings: Finding[],
  match: MatchResult,
  opts: { cacheOnly?: boolean; refresh?: boolean } = {},
): Promise<Question> {
  const model = config.models.question
  const isDoubt = findings.some((f) => f.signal !== 'discrepancy')
  const firm = isDoubt ? firmOvercharges(findings, match) : []
  const prompt = JSON.stringify(
    {
      hallazgos: findings.filter((f) => !firm.includes(f)).map((f) => f.message),
      ...(firm.length ? { ademas: firm.map((f) => `${f.message} Son ${eur(f.impactEur!)} de más.`) } : {}),
    },
    null,
    2,
  )
  // Mismos hallazgos, misma pregunta: los evals y la demo no vuelven a pagar.
  const key = sha256([model, SYSTEM, prompt].join('\n'))

  let entry = opts.refresh ? null : await readCache<CacheEntry>('question', key)
  let cached = entry !== null
  if (!entry) {
    if (opts.cacheOnly) throw new Error('No hay pregunta en caché para estos hallazgos.')
    const started = Date.now()
    const { output: text, usage } = await generation('redactar pregunta', model, prompt, async () => {
      const result = await generateText({ model: anthropic(model), maxOutputTokens: config.question.maxOutputTokens, system: SYSTEM, prompt })
      return {
        output: result.text.trim(),
        usage: { inputTokens: result.usage.inputTokens ?? 0, outputTokens: result.usage.outputTokens ?? 0 },
      }
    })
    entry = { text, model, usage, latencyMs: Date.now() - started }
    await writeCache('question', key, entry)
    cached = false
  }

  // La caché guarda lo que escribió el modelo; la comprobación se hace siempre al usarlo.
  const invented = inventedNumbers(entry.text, findings)
  return {
    ...entry,
    text: invented.length ? templateQuestion(reason, findings) : entry.text,
    fromTemplate: invented.length > 0,
    invented,
    costUsd: costUsd(entry.model, entry.usage),
    cached,
  }
}
