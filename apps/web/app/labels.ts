import type { Outcome, Reason, Signal } from '@cotejo/types'

// Textos de la interfaz para los valores internos del pipeline.

export const OUTCOME: Record<Outcome, string> = { pass: 'Pasa', ask: 'Pregunta', escalate: 'Escala' }

export const REASON: Record<Reason, string> = {
  all_matched: 'Todo cuadra entre albarán y factura.',
  overcharge: 'La factura cobra de más, por encima del umbral de reclamación.',
  minor_discrepancy: 'Hay una diferencia real, pero pequeña.',
  undercharge: 'La diferencia va a favor del restaurante.',
  document_ambiguous: 'Un documento se contradice consigo mismo.',
  low_confidence_read: 'Hay un importe que no se ha podido leer.',
  missing_knowledge: 'Falta saber algo de este proveedor para poder comparar.',
}

export const SIGNAL: Record<Signal, string> = {
  discrepancy: 'Discrepancia',
  inconsistency: 'Se contradice',
  'read-doubt': 'Lectura dudosa',
  'missing-knowledge': 'Falta conocimiento',
}

export const DOC = { albaran: 'Albarán', factura: 'Factura' }

export const BY = { code: 'por código', alias: 'por alias aprendido', description: 'por descripción' }

export const RESOLUTION = { accept: 'Aceptada', claim: 'Reclamada', rectify: 'Rectificativa pedida', learn: 'Aprendido' }

export const eur = (n: number) =>
  `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

export const num = (n: number | null) => (n === null ? '—' : n.toLocaleString('es-ES', { maximumFractionDigits: 3 }))

export function ago(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return 'hace un momento'
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  return `hace ${Math.round(hours / 24)} días`
}
