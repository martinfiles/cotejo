import { config } from '../config'
import type { Rule } from '../types'
import { close, eur, evidence, expectedTotal, finding, num } from './shared'

// Comprueba cada documento contra sí mismo. Si cantidad × precio no da el
// importe, o leí mal alguno de los tres o el papel se contradice (una
// cantidad corregida a boli con el importe sin tocar). Desde aquí no se
// distingue: en los dos casos hay que preguntar antes de reclamar nada.
export const lineArithmetic: Rule = {
  id: 'line-arithmetic',
  signal: 'inconsistency',
  description: 'En una línea, cantidad por precio (menos descuento) no da el importe.',
  check({ albaran, factura }) {
    return [albaran, factura].flatMap((doc) =>
      doc.lines.flatMap((line) => {
        const expected = expectedTotal(line)
        const printed = line.total.value
        if (expected === null || printed === null) return []
        if (close(expected, printed, config.rules.amountToleranceEur)) return []

        const discount = line.discount ? ` con ${num(line.discount)} % de descuento` : ''
        const where = doc.docType === 'albaran' ? 'el albarán' : 'la factura'
        return finding(lineArithmetic, {
          lineKey: line.key,
          message: `${line.description}: en ${where}, ${num(line.quantity.value ?? 0)} × ${eur(line.unitPrice.value ?? 0)}${discount} son ${eur(expected)}, pero el importe dice ${eur(printed)}.`,
          impactEur: null,
          evidence: [
            evidence(doc.docType, line, 'quantity'),
            evidence(doc.docType, line, 'unitPrice'),
            evidence(doc.docType, line, 'total'),
          ],
        })
      }),
    )
  },
}
