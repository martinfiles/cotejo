import { config } from '../config'
import type { Decision, Finding, Signal } from '../types'

// La política de enrutado. Función pura: de los findings sale la decisión, y
// nada más. El orden de las ramas es la tesis del proyecto: antes de reclamar
// una discrepancia hay que estar seguro de que es del proveedor y no mía.

type Routing = Pick<Decision, 'outcome' | 'reason' | 'overchargeEur'>

export function decide(findings: Finding[]): Routing {
  const has = (signal: Signal) => findings.some((f) => f.signal === signal)
  const discrepancies = findings.filter((f) => f.signal === 'discrepancy')
  // Lo que la factura cobra de más. Lo que va a favor no compensa: un cobro
  // de más en una línea no se tapa con un despiste a favor en otra.
  const overchargeEur =
    Math.round(discrepancies.reduce((sum, f) => sum + Math.max(f.impactEur ?? 0, 0), 0) * 100) / 100

  if (findings.length === 0) return { outcome: 'pass', reason: 'all_matched', overchargeEur }

  // --- Dudas: el problema puede ser mío, no del proveedor. Nunca escalan. ---

  // Faltan papeles: los albaranes del caso no son los que cita la factura.
  // Va la primera porque sin ellos lo demás que se haya visto no es fiable.
  if (has('missing-document')) return { outcome: 'ask', reason: 'missing_document', overchargeEur }

  // Fallo de lectura: hay un importe que no he podido leer.
  if (has('read-doubt')) return { outcome: 'ask', reason: 'low_confidence_read', overchargeEur }

  // Documento ambiguo: lo leído no cuadra consigo mismo (una línea que no
  // multiplica, un total que no suma). O leí mal o el papel se contradice; no
  // lo arregla un OCR mejor, lo sabe quien tiene el papel delante.
  if (has('inconsistency')) return { outcome: 'ask', reason: 'document_ambiguous', overchargeEur }

  // Falta conocimiento del proveedor: no puedo comparar hasta que me lo digan.
  if (has('missing-knowledge')) return { outcome: 'ask', reason: 'missing_knowledge', overchargeEur }

  // --- Discrepancia real: bien leído en los dos documentos y no cuadra. ---

  if (overchargeEur >= config.decide.escalateFromEur) return { outcome: 'escalate', reason: 'overcharge', overchargeEur }

  const allInOurFavour = discrepancies.every((f) => f.impactEur !== null && f.impactEur <= 0)
  return { outcome: 'ask', reason: allInOurFavour ? 'undercharge' : 'minor_discrepancy', overchargeEur }
}
