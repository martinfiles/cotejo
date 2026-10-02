import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'
import { readCache, sha256, writeCache } from '../cache'
import { config, costUsd, type Usage } from '../config'
import { generation } from '../obs/langfuse'
import type { Decision, Finding } from '../types'

// La pregunta al humano la redacta el modelo a partir de los findings. Es lo
// único que hace aquí: qué se pregunta y qué botones hay ya lo decidió el
// código.

const SYSTEM = `Redactas una pregunta para la persona que recibe la mercancía en un restaurante.

Un sistema ha comparado el albarán con la factura de un proveedor y ha encontrado algo que no puede resolver solo. Te paso lo que ha encontrado y las respuestas que esa persona podrá elegir. Escribe la pregunta que le harías.

Cómo tiene que ser:
- Dos o tres frases, en español de España, de tú, sin saludos ni despedidas.
- Primero qué pasa, con el producto y los números concretos de los hallazgos. Luego la pregunta.
- La persona tiene el papel delante y poco tiempo: di qué tiene que mirar o recordar.
- No uses nombres internos (ni "finding", ni identificadores de reglas o de líneas como "F3").
- No inventes datos ni propongas respuestas que no estén entre las opciones.
- Texto plano, sin listas ni negritas.`

export type Question = { text: string; model: string; usage: Usage; costUsd: number; latencyMs: number; cached: boolean }

type CacheEntry = Omit<Question, 'cached' | 'costUsd'>

export async function draftQuestion(
  decision: Pick<Decision, 'reason' | 'options'>,
  findings: Finding[],
  supplier: string,
  opts: { cacheOnly?: boolean; refresh?: boolean } = {},
): Promise<Question> {
  const model = config.models.question
  const prompt = JSON.stringify(
    {
      proveedor: supplier,
      motivo: decision.reason,
      hallazgos: findings.map((f) => f.message),
      opciones: decision.options.map((o) => o.factorPrompt ?? o.label),
    },
    null,
    2,
  )
  // Mismos hallazgos, misma pregunta: los evals y la demo no vuelven a pagar.
  const key = sha256([model, SYSTEM, prompt].join('\n'))

  const entry = opts.refresh ? null : await readCache<CacheEntry>('question', key)
  if (entry) return { ...entry, costUsd: costUsd(entry.model, entry.usage), cached: true }
  if (opts.cacheOnly) throw new Error('No hay pregunta en caché para estos hallazgos.')

  const started = Date.now()
  const { output: text, usage } = await generation('redactar pregunta', model, prompt, async () => {
    const result = await generateText({
      model: anthropic(model),
      maxOutputTokens: config.question.maxOutputTokens,
      system: SYSTEM,
      prompt,
    })
    return {
      output: result.text.trim(),
      usage: { inputTokens: result.usage.inputTokens ?? 0, outputTokens: result.usage.outputTokens ?? 0 },
    }
  })
  const fresh: CacheEntry = { text, model, usage, latencyMs: Date.now() - started }
  await writeCache('question', key, fresh)
  return { ...fresh, costUsd: costUsd(model, usage), cached: false }
}
