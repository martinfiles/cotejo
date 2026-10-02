import { LangfuseClient } from '@langfuse/client'
import { LangfuseSpanProcessor } from '@langfuse/otel'
import { getActiveTraceId, propagateAttributes, startActiveObservation } from '@langfuse/tracing'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { costUsd, type Usage } from '../config'

// Envoltorio fino de Langfuse. El resto del código solo conoce estas
// funciones. Si nadie llama a startTracing(), todas se ejecutan igual pero no
// envían nada: así los evals corren sin red.

let processor: LangfuseSpanProcessor | null = null

export function startTracing() {
  if (processor) return
  processor = new LangfuseSpanProcessor()
  new NodeTracerProvider({ spanProcessors: [processor] }).register()
}

// Los spans se envían por lotes: hay que vaciarlos antes de que acabe el proceso.
export const flushTracing = async () => processor?.forceFlush()

type Details = { input?: unknown; output?: unknown; metadata?: Record<string, unknown> }
type Span = { update(details: Details): unknown }

// Una etapa del pipeline. La primera que se abre es la traza del caso.
export const span = <T>(name: string, fn: (span: Span) => Promise<T>) => startActiveObservation(name, fn)

// Una llamada al modelo, con su modelo, tokens y coste.
export function generation<T>(name: string, model: string, input: unknown, call: () => Promise<{ output: T; usage: Usage }>) {
  return startActiveObservation(
    name,
    async (g) => {
      g.update({ model, input })
      const result = await call()
      g.update({
        output: result.output,
        usageDetails: { input: result.usage.inputTokens, output: result.usage.outputTokens },
        costDetails: { total: costUsd(model, result.usage) },
      })
      return result
    },
    { asType: 'generation' },
  )
}

// Etiqueta la traza con lo que se crea dentro de `fn`.
export const withTags = <T>(tags: string[], fn: () => Promise<T>) => propagateAttributes({ tags }, fn)

export const currentTraceId = () => (processor ? (getActiveTraceId() ?? null) : null)

// La respuesta del humano a un caso, colgada de la traza de ese caso.
export async function score(traceId: string, name: string, value: string, comment?: string) {
  const client = new LangfuseClient()
  client.score.create({ traceId, name, value, dataType: 'CATEGORICAL', comment })
  await client.score.flush()
}
