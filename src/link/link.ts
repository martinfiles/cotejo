import { sameCode } from '../text'
import type { ExtractedDoc, LinkResult } from '../types'

// Qué une cada albarán del caso con su factura. Los albaranes llegan con la
// factura; aquí no se busca ninguno, se comprueba que son los que la factura
// cita y se deja dicho por qué. Sin modelo.

// Cada documento se extrae por separado y numera sus líneas desde A1. Dentro
// del caso, la línea dice además de qué albarán es: "A2.3".
export const inCase = (albaran: ExtractedDoc, index: number): ExtractedDoc => ({
  ...albaran,
  lines: albaran.lines.map((line, i) => ({ ...line, key: `A${index + 1}.${i + 1}`, source: index })),
})

export function link(albaranes: ExtractedDoc[], factura: ExtractedDoc): LinkResult {
  // Cada cita de la factura vale para un solo albarán.
  const free = new Set(factura.refs.filter((r) => r.kind === 'albaran'))
  const orders = factura.refs.filter((r) => r.kind === 'pedido').map((r) => r.number)
  const by: LinkResult['links'][number]['by'][] = albaranes.map(() => null)

  // 1. Por número de albarán, que es lo único inequívoco.
  albaranes.forEach((albaran, i) => {
    const ref = [...free].find((r) => r.number && sameCode(r.number, albaran.number))
    if (!ref) return
    free.delete(ref)
    by[i] = 'number'
  })

  // 2. Por fecha, solo contra las citas que no traen número ("entregas del
  // 03/09"). Una cita con otro número y la misma fecha es otro albarán.
  albaranes.forEach((albaran, i) => {
    if (by[i]) return
    const ref = [...free].find((r) => !r.number && r.date === albaran.date)
    if (!ref) return
    free.delete(ref)
    by[i] = 'date'
  })

  // 3. Por pedido: el albarán cita el mismo pedido que la factura.
  albaranes.forEach((albaran, i) => {
    if (by[i]) return
    const same = albaran.refs.some((r) => r.kind === 'pedido' && r.number && orders.some((o) => o && sameCode(o, r.number!)))
    if (same) by[i] = 'order'
  })

  return {
    links: by.map((how, albaran) => ({ albaran, by: how })),
    missing: [...free],
    // Si la factura no cita nada no hay con qué comprobar: no se dice nada.
    uncited: factura.refs.length === 0 ? [] : by.flatMap((how, i) => (how ? [] : [i])),
  }
}
