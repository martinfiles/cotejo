import type { Ref, Rule } from '../types'
import { finding } from './shared'

// La fecha se dice como está en el papel: "2026-09-10" es "10/09/2026".
const cited = (ref: Ref) =>
  [ref.number, ref.date && `del ${ref.date.split('-').reverse().join('/')}`].filter(Boolean).join(' ')

// Antes de comparar líneas hay que tener los papeles que la factura dice
// cobrar. Sin un albarán citado, sus líneas parecerían cobradas y no
// entregadas; con uno que la factura no cita, entregadas y sin cobrar.
export const albaranLink: Rule = {
  id: 'albaran-link',
  signal: 'missing-document',
  description: 'Los albaranes del caso no son los que cita la factura.',
  check({ albaranes, links }) {
    // Sin evidencia: las citas se leen sin caja.
    return [
      ...links.missing.map((ref) =>
        finding(albaranLink, {
          lineKey: null,
          message: `La factura cita el albarán ${cited(ref)} y no está entre los albaranes del caso.`,
          impactEur: null,
          evidence: [],
        }),
      ),
      ...links.uncited.map((index) =>
        finding(albaranLink, {
          lineKey: null,
          message: `El albarán ${albaranes[index]!.number} está en el caso y la factura no lo cita.`,
          impactEur: null,
          evidence: [],
        }),
      ),
    ]
  },
}
