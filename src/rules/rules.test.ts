import assert from 'node:assert/strict'
import { test } from 'node:test'
import { context, doc, fact, unread } from '../testing'
import type { ExtractedDoc, Finding, Ref } from '../types'
import { albaranLink } from './albaran-link'
import { implausiblePrice } from './implausible-price'
import { runRules } from './index'
import { lineArithmetic } from './line-arithmetic'
import { missingLine } from './missing-line'
import { quantityMismatch } from './quantity-mismatch'
import { totalMismatch } from './total-mismatch'
import { unitIncompatible } from './unit-incompatible'
import { unitPriceMismatch } from './unit-price-mismatch'
import { unreadableAmount } from './unreadable-amount'
import { vatInconsistent } from './vat-inconsistent'

// Lo que importa de un finding en un test: qué regla, qué línea y cuánto dinero.
const brief = (findings: Finding[]) => findings.map((f) => `${f.ruleId} ${f.lineKey} ${f.impactEur}`)

const vino = { code: 'C-3105', description: 'Vino tinto Mencía', quantity: 24, unit: 'botella', unitPrice: 5.2, vatRate: 21 }
const tomateEnCajas = { code: 'V-101', description: 'Tomate pera', quantity: 2, unit: 'caja', unitPrice: 13.8 }
const tomateEnKilos = { code: 'V-101', description: 'Tomate pera', quantity: 12, unit: 'kg', unitPrice: 2.3 }
const cajaDeSeisKilos = fact({ kind: 'unit-equivalence', product: 'V-101', from: 'caja', to: 'kg', factor: 6 })

test('dos documentos que cuadran no dan ningún finding', () => {
  const ctx = context(doc('albaran', [vino]), doc('factura', [vino]))
  assert.deepEqual(runRules(ctx), [])
})

test('quantity-mismatch: se facturan más unidades de las entregadas', () => {
  const ctx = context(doc('albaran', [vino]), doc('factura', [{ ...vino, quantity: 30 }]))
  assert.deepEqual(brief(quantityMismatch.check(ctx)), ['quantity-mismatch F1 31.2'])
})

test('quantity-mismatch: compara en la unidad de la factura cuando se sabe la equivalencia', () => {
  const same = context(doc('albaran', [tomateEnCajas]), doc('factura', [tomateEnKilos]), [cajaDeSeisKilos])
  assert.deepEqual(quantityMismatch.check(same), [])

  const more = context(doc('albaran', [tomateEnCajas]), doc('factura', [{ ...tomateEnKilos, quantity: 18 }]), [cajaDeSeisKilos])
  assert.deepEqual(brief(quantityMismatch.check(more)), ['quantity-mismatch F1 13.8'])
})

test('unit-price-mismatch: la factura sube el precio', () => {
  const ctx = context(doc('albaran', [vino]), doc('factura', [{ ...vino, unitPrice: 6.7 }]))
  assert.deepEqual(brief(unitPriceMismatch.check(ctx)), ['unit-price-mismatch F1 36'])
})

test('unit-price-mismatch: un albarán sin valorar no se compara', () => {
  const ctx = context(doc('albaran', [{ ...vino, unitPrice: { value: null, confidence: 1 }, total: { value: null, confidence: 1 } }]), doc('factura', [vino]))
  assert.deepEqual(unitPriceMismatch.check(ctx), [])
})

test('unit-incompatible: cajas contra kilos sin equivalencia, y calla cuando se aprende', () => {
  const albaran = doc('albaran', [tomateEnCajas])
  const factura = doc('factura', [tomateEnKilos])
  assert.deepEqual(brief(unitIncompatible.check(context(albaran, factura))), ['unit-incompatible F1 null'])
  // Sin equivalencia tampoco se comparan cantidad ni precio: no hay base.
  assert.deepEqual(brief(runRules(context(albaran, factura))), ['unit-incompatible F1 null'])
  assert.deepEqual(runRules(context(albaran, factura, [cajaDeSeisKilos])), [])
})

test('missing-line: lo facturado sin entregar cuesta; lo entregado sin facturar va a favor', () => {
  const azucar = { code: 'C-4012', description: 'Azúcar', quantity: 2, unitPrice: 11.8 }
  const billed = context(doc('albaran', [vino]), doc('factura', [vino, azucar]))
  assert.deepEqual(brief(missingLine.check(billed)), ['missing-line F2 23.6'])

  const delivered = context(doc('albaran', [vino, azucar]), doc('factura', [vino]))
  assert.deepEqual(brief(missingLine.check(delivered)), ['missing-line A1.2 -23.6'])
})

test('line-arithmetic: una cantidad corregida deja la línea sin cuadrar', () => {
  const corrected = { ...vino, quantity: 18, total: 124.8 }
  const ctx = context(doc('albaran', [corrected]), doc('factura', [vino]))
  assert.deepEqual(brief(lineArithmetic.check(ctx)), ['line-arithmetic A1.1 null'])
})

test('line-arithmetic: el descuento cuenta, y una línea con descuento bien aplicado cuadra', () => {
  const discounted = { ...vino, discount: 10 }
  assert.deepEqual(lineArithmetic.check(context(doc('albaran', [discounted]), doc('factura', [discounted]))), [])

  const notApplied = { ...vino, discount: 10, total: 124.8 }
  const ctx = context(doc('albaran', [discounted]), doc('factura', [notApplied]))
  assert.deepEqual(brief(lineArithmetic.check(ctx)), ['line-arithmetic F1 null'])
})

test('total-mismatch: el total impreso no es base más IVA', () => {
  const factura = doc('factura', [vino], { total: { value: 181.01, confidence: 1 } })
  assert.deepEqual(brief(totalMismatch.check(context(doc('albaran', [vino]), factura))), ['total-mismatch null 30'])
})

test('total-mismatch: las líneas no suman la base', () => {
  const factura = doc('factura', [vino], { base: { value: 134.8, confidence: 1 }, total: { value: 161.01, confidence: 1 } })
  assert.deepEqual(brief(totalMismatch.check(context(doc('albaran', [vino]), factura))), ['total-mismatch null 10'])
})

test('vat-inconsistent: la cuota impresa no sale de los tipos de las líneas', () => {
  const factura = doc('factura', [vino], { vat: { value: 29.36, confidence: 1 } })
  assert.deepEqual(brief(vatInconsistent.check(context(doc('albaran', [vino]), factura))), ['vat-inconsistent null 3.15'])
})

test('unreadable-amount: un precio tapado, y un dato que el documento no trae no cuenta', () => {
  const stamped = doc('factura', [{ ...vino, unitPrice: unread, total: 124.8 }])
  const ctx = context(doc('albaran', [vino]), stamped)
  assert.deepEqual(brief(unreadableAmount.check(ctx)), ['unreadable-amount F1 null'])
  // El albarán no trae IVA ni total con IVA (null con confianza alta): no es ilegible.
  assert.deepEqual(unreadableAmount.check(context(doc('albaran', [vino]), doc('factura', [vino]))), [])
  // Y con el precio sin leer no se inventa una diferencia de precio.
  assert.deepEqual(unitPriceMismatch.check(ctx), [])
})

test('unreadable-amount: el total de la factura tapado', () => {
  const factura = doc('factura', [vino], { total: unread })
  assert.deepEqual(brief(unreadableAmount.check(context(doc('albaran', [vino]), factura))), ['unreadable-amount null null'])
})

test('implausible-price: un precio a otra escala es una coma mal leída, no una subida', () => {
  const ctx = context(doc('albaran', [vino]), doc('factura', [{ ...vino, unitPrice: 520 }]))
  assert.deepEqual(brief(implausiblePrice.check(ctx)), ['implausible-price F1 null'])
  const raised = context(doc('albaran', [vino]), doc('factura', [{ ...vino, unitPrice: 6.7 }]))
  assert.deepEqual(implausiblePrice.check(raised), [])
})

// --- Varios albaranes ---------------------------------------------------------

const arroz = { code: 'C-1040', description: 'Arroz bomba', quantity: 2, unitPrice: 14.5 }
const numbered = (number: string, lines: Parameters<typeof doc>[1]): ExtractedDoc => ({ ...doc('albaran', lines), number })
const citing = (factura: ExtractedDoc, ...numbers: string[]): ExtractedDoc =>
  ({ ...factura, refs: numbers.map((number): Ref => ({ kind: 'albaran', number, date: null })) })

test('quantity-mismatch: compara lo que suman los albaranes y señala cada uno', () => {
  const albaranes = [numbered('ALB-1', [arroz]), numbered('ALB-2', [{ ...arroz, quantity: 1 }])]
  const same = context(albaranes, doc('factura', [{ ...arroz, quantity: 3 }]))
  assert.deepEqual(runRules(same), [])

  const more = context(albaranes, doc('factura', [{ ...arroz, quantity: 5 }]))
  const [found] = quantityMismatch.check(more)
  assert.deepEqual(brief([found!]), ['quantity-mismatch F1 29'])
  assert.match(found!.message, /los albaranes suman 3 ud \(2 en ALB-1 y 1 en ALB-2\) y la factura 5 ud/)
  assert.deepEqual(found!.evidence.map((e) => `${e.doc}${e.source} ${e.value}`), ['albaran0 2', 'albaran1 1', 'factura0 5'])
})

test('albaran-link: la factura cita un albarán que no está en el caso', () => {
  const factura = citing(doc('factura', [vino, arroz]), 'ALB-1', 'ALB-2')
  const ctx = context(numbered('ALB-1', [vino]), factura)
  assert.deepEqual(brief(albaranLink.check(ctx)), ['albaran-link null null'])
  // Lo facturado sin pareja puede estar en el albarán que falta: no es un cobro de más.
  assert.deepEqual(missingLine.check(ctx).map((f) => f.signal), ['missing-document'])
})

test('albaran-link: en el caso hay un albarán que la factura no cita', () => {
  const factura = citing(doc('factura', [vino]), 'ALB-1')
  const ctx = context([numbered('ALB-1', [vino]), numbered('ALB-9', [arroz])], factura)
  assert.deepEqual(brief(albaranLink.check(ctx)), ['albaran-link null null'])
  assert.deepEqual(missingLine.check(ctx).map((f) => `${f.lineKey} ${f.signal}`), ['A2.1 missing-document'])
})

test('albaran-link: con todos los albaranes citados y presentes no dice nada', () => {
  const factura = citing(doc('factura', [vino, arroz]), 'ALB-1', 'ALB-2')
  assert.deepEqual(runRules(context([numbered('ALB-1', [vino]), numbered('ALB-2', [arroz])], factura)), [])
})
