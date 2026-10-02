import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { DocType, ExtractedDoc, Fact, Line } from '../types'
import { match, similarity } from './match'

const box = { x: 0, y: 0, w: 1, h: 1 }
const amount = (value: number) => ({ value, confidence: 1, bbox: null })

function doc(docType: DocType, lines: [code: string | null, description: string][]): ExtractedDoc {
  return {
    docType,
    supplier: 'Proveedor',
    supplierTaxId: 'B00000000',
    number: '1',
    date: '2026-09-01',
    lines: lines.map(([code, description], i): Line => ({
      key: `${docType === 'albaran' ? 'A' : 'F'}${i + 1}`,
      code,
      description,
      quantity: amount(1),
      unit: 'ud',
      unitPrice: amount(1),
      vatRate: null,
      discount: null,
      total: amount(1),
      bbox: box,
    })),
    totals: { base: { value: 1, confidence: 1 }, vat: { value: null, confidence: 1 }, total: { value: null, confidence: 1 }, bbox: box },
  }
}

const keys = (result: ReturnType<typeof match>) => result.pairs.map((p) => `${p.albaran.key}-${p.factura.key}:${p.by}`).sort()

test('casa por código aunque la descripción no se parezca', () => {
  const result = match(doc('albaran', [['C-1040', 'ARR. BOMBA']]), doc('factura', [['C-1040', 'Arroz bomba saco 5 kg']]), [])
  assert.deepEqual(keys(result), ['A1-F1:code'])
})

test('sin código, casa abreviaturas por parecido y no depende del orden', () => {
  const albaran = doc('albaran', [[null, 'MEJILLON ROCA'], [null, 'RAPE COLA S/P'], [null, 'MERLUZA PINCHO 2/3']])
  const factura = doc('factura', [[null, 'Merluza de pincho 2-3 kg'], [null, 'Rape cola sin piel'], [null, 'Mejillón de roca']])
  assert.deepEqual(keys(match(albaran, factura, [])), ['A1-F3:description', 'A2-F2:description', 'A3-F1:description'])
})

test('un nombre distinto no casa hasta que se aprende el alias', () => {
  const albaran = doc('albaran', [[null, 'BOCARTE']])
  const factura = doc('factura', [[null, 'Boquerón fresco']])
  const without = match(albaran, factura, [])
  assert.equal(without.pairs.length, 0)
  assert.deepEqual([without.onlyAlbaran.length, without.onlyFactura.length], [1, 1])

  const alias: Fact = {
    id: 'f1', supplierTaxId: 'B00000000', kind: 'product-alias', albaran: 'BOCARTE', factura: 'Boquerón fresco',
    learnedAt: '2026-10-01T00:00:00Z', fromCase: 'c1', revokedAt: null,
  }
  assert.deepEqual(keys(match(albaran, factura, [alias])), ['A1-F1:alias'])
})

test('el mismo producto en otro formato es otro producto', () => {
  const albaran = doc('albaran', [[null, 'BERBERECHO MALLA 0,5 KG'], [null, 'BERBERECHO MALLA 5 KG']])
  const factura = doc('factura', [[null, 'Berberecho malla 5 kg'], [null, 'Berberecho malla 0,5 kg']])
  assert.deepEqual(keys(match(albaran, factura, [])), ['A1-F2:description', 'A2-F1:description'])

  // Aunque solo haya uno a cada lado: mejor dos líneas sueltas que un cruce falso.
  const lone = match(doc('albaran', [[null, 'BERBERECHO MALLA 5 KG']]), doc('factura', [[null, 'Berberecho malla 0,5 kg']]), [])
  assert.equal(lone.pairs.length, 0)
})

test('dos líneas con códigos distintos no se casan por descripción', () => {
  const result = match(doc('albaran', [['C-1', 'Vino tinto Mencía']]), doc('factura', [['C-2', 'Vino tinto Mencía']]), [])
  assert.equal(result.pairs.length, 0)
})

test('los ejemplos que justifican el umbral de config.ts', () => {
  assert.equal(similarity('RAPE COLA S/P', 'Rape cola sin piel').toFixed(2), '0.67')
  assert.equal(similarity('Tomate pera', 'Tomate triturado lata 2,5 kg').toFixed(2), '0.29')
})
