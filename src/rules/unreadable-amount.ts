import { config } from '../config'
import type { Amount, Evidence, Rule } from '../types'
import { evidence, finding } from './shared'

const NAMES = { quantity: 'la cantidad', unitPrice: 'el precio', total: 'el importe', base: 'la base', vat: 'la cuota de IVA' }

// El único sitio donde se mira la confianza que declara el modelo, y solo en
// el extremo. Un null con confianza alta no entra aquí: es un dato que el
// documento no trae (un albarán sin IVA), no uno que no se pudo leer.
const unread = (amount: Amount) => amount.confidence < config.rules.minReadConfidence

export const unreadableAmount: Rule = {
  id: 'unreadable-amount',
  severity: 'medium',
  signal: 'read-doubt',
  description: 'Un importe está en el documento pero no se ha podido leer.',
  check({ albaran, factura }) {
    return [albaran, factura].flatMap((doc) => {
      const where = doc.docType === 'albaran' ? 'el albarán' : 'la factura'

      const inLines = doc.lines.flatMap((line) =>
        (['quantity', 'unitPrice', 'total'] as const)
          .filter((field) => unread(line[field]))
          .map((field) =>
            finding(unreadableAmount, {
              lineKey: line.key,
              message: `${line.description}: no se puede leer ${NAMES[field]} en ${where}.`,
              impactEur: null,
              evidence: [evidence(doc.docType, line, field)],
            }),
          ),
      )

      const inTotals = (['base', 'vat', 'total'] as const)
        .filter((field) => unread(doc.totals[field]))
        .map((field) => {
          const amount = doc.totals[field]
          const at: Evidence = { doc: doc.docType, field, value: amount.value, confidence: amount.confidence, bbox: doc.totals.bbox }
          return finding(unreadableAmount, {
            lineKey: null,
            message: `No se puede leer ${field === 'total' ? 'el total' : NAMES[field]} de ${where}.`,
            impactEur: null,
            evidence: [at],
          })
        })

      return [...inLines, ...inTotals]
    })
  },
}
