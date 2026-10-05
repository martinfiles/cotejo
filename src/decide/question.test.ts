import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Finding } from '../types'
import { inventedNumbers, templateQuestion } from './question'

const box = { x: 0, y: 0, w: 1, h: 1 }

// Los findings reales del caso del sello y de la corrección a mano.
const stamp: Finding[] = [{
  ruleId: 'unreadable-amount', signal: 'read-doubt', lineKey: 'F3', impactEur: null,
  message: 'Vino tinto Mencía joven 75 cl: no se puede leer el precio en la factura.',
  evidence: [{ doc: 'factura', field: 'unitPrice', value: null, confidence: 0, bbox: box }],
}]
const corrected: Finding[] = [{
  ruleId: 'quantity-mismatch', signal: 'discrepancy', lineKey: 'F3', impactEur: 31.2,
  message: 'Vino tinto Mencía joven 75 cl: el albarán dice 18 botella y la factura 24 botella.',
  evidence: [
    { doc: 'albaran', field: 'quantity', value: 18, confidence: 0.8, bbox: box },
    { doc: 'factura', field: 'quantity', value: 24, confidence: 0.97, bbox: box },
  ],
}]

test('el texto que se publicó en el caso del sello se rechaza: "una botella" no sale de los findings', () => {
  const real =
    'En el albarán de Distribuciones Carballo aparece una botella de vino tinto Mencía joven de 75 cl, pero en la factura no se ve claro cuál es su precio.'
  assert.deepEqual(inventedNumbers(real, stamp), ['una botella'])
})

test('una cifra con dígitos que no está en ningún finding se rechaza', () => {
  assert.deepEqual(inventedNumbers('La factura cobra 30 botellas y el albarán dice 18.', corrected), ['30'])
})

test('las cifras de los findings y de su evidencia, escritas a la española, se aceptan', () => {
  const ok = 'El albarán dice 18 botellas de vino de 75 cl y la factura 24: son 31,20 € de más. ¿Pedimos una factura rectificativa?'
  assert.deepEqual(inventedNumbers(ok, corrected), [])
})

test('si el modelo se inventa algo, la plantilla se construye solo con los findings', () => {
  const text = templateQuestion('low_confidence_read', stamp)
  assert.ok(text.startsWith(stamp[0]!.message))
  assert.deepEqual(inventedNumbers(text, stamp), [])
})
