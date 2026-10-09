import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inCase } from '../link/link'
import { doc, fact } from '../testing'
import type { ExtractedDoc, Fact } from '../types'
import { match, similarity } from './match'

// El cruce recibe la lista de albaranes del caso; aquí casi siempre hay uno.
const cross = (albaran: ExtractedDoc, factura: ExtractedDoc, facts: Fact[] = []) => match([albaran], factura, facts)

const keys = (result: ReturnType<typeof match>) => result.pairs.map((p) => `${p.albaran.key}-${p.factura.key}:${p.by}`).sort()

test('casa por código aunque la descripción no se parezca', () => {
  const albaran = doc('albaran', [{ code: 'C-1040', description: 'ARR. BOMBA' }])
  const factura = doc('factura', [{ code: 'C-1040', description: 'Arroz bomba saco 5 kg' }])
  assert.deepEqual(keys(cross(albaran, factura)), ['A1-F1:code'])
})

test('sin código, casa abreviaturas por parecido y no depende del orden', () => {
  const albaran = doc('albaran', [{ description: 'MEJILLON ROCA' }, { description: 'RAPE COLA S/P' }, { description: 'MERLUZA PINCHO 2/3' }])
  const factura = doc('factura', [{ description: 'Merluza de pincho 2-3 kg' }, { description: 'Rape cola sin piel' }, { description: 'Mejillón de roca' }])
  assert.deepEqual(keys(cross(albaran, factura)), ['A1-F3:description', 'A2-F2:description', 'A3-F1:description'])
})

test('un nombre distinto no casa hasta que se aprende el alias', () => {
  const albaran = doc('albaran', [{ description: 'BOCARTE' }])
  const factura = doc('factura', [{ description: 'Boquerón fresco' }])
  const without = cross(albaran, factura)
  assert.equal(without.pairs.length, 0)
  assert.deepEqual([without.onlyAlbaran.length, without.onlyFactura.length], [1, 1])

  const alias = fact({ kind: 'product-alias', albaran: 'BOCARTE', factura: 'Boquerón fresco' })
  assert.deepEqual(keys(cross(albaran, factura, [alias])), ['A1-F1:alias'])
})

test('el mismo producto en otro formato es otro producto', () => {
  const albaran = doc('albaran', [{ description: 'BERBERECHO MALLA 0,5 KG' }, { description: 'BERBERECHO MALLA 5 KG' }])
  const factura = doc('factura', [{ description: 'Berberecho malla 5 kg' }, { description: 'Berberecho malla 0,5 kg' }])
  assert.deepEqual(keys(cross(albaran, factura)), ['A1-F2:description', 'A2-F1:description'])

  // Aunque solo haya uno a cada lado: mejor dos líneas sueltas que un cruce falso.
  const lone = cross(doc('albaran', [{ description: 'BERBERECHO MALLA 5 KG' }]), doc('factura', [{ description: 'Berberecho malla 0,5 kg' }]))
  assert.equal(lone.pairs.length, 0)
})

test('dos líneas con códigos distintos no se casan por descripción', () => {
  const albaran = doc('albaran', [{ code: 'C-1', description: 'Vino tinto Mencía' }])
  const factura = doc('factura', [{ code: 'C-2', description: 'Vino tinto Mencía' }])
  assert.equal(cross(albaran, factura).pairs.length, 0)
})

test('los ejemplos que justifican el umbral de config.ts', () => {
  assert.equal(similarity('RAPE COLA S/P', 'Rape cola sin piel').toFixed(2), '0.67')
  assert.equal(similarity('Tomate pera', 'Tomate triturado lata 2,5 kg').toFixed(2), '0.29')
})

test('el mismo producto en dos albaranes se suma antes de casar', () => {
  const arroz = { code: 'C-1040', description: 'Arroz bomba', unitPrice: 14.5 }
  const albaranes = [doc('albaran', [{ ...arroz, quantity: 2 }]), doc('albaran', [{ ...arroz, quantity: 1 }])].map(inCase)
  const result = match(albaranes, doc('factura', [{ ...arroz, quantity: 3 }]), [])
  assert.deepEqual(keys(result), ['A1.1-F1:code'])
  const delivered = result.pairs[0]!.albaran
  assert.equal(delivered.quantity.value, 3)
  assert.equal(delivered.total.value, 43.5)
  assert.deepEqual(delivered.parts?.map((p) => p.key), ['A1.1', 'A2.1'])
})

test('una factura que repite el producto por albarán también se suma', () => {
  const arroz = { code: 'C-1040', description: 'Arroz bomba', unitPrice: 14.5 }
  const albaranes = [doc('albaran', [{ ...arroz, quantity: 2 }]), doc('albaran', [{ ...arroz, quantity: 1 }])].map(inCase)
  const result = match(albaranes, doc('factura', [{ ...arroz, quantity: 2 }, { ...arroz, quantity: 1 }]), [])
  assert.deepEqual(keys(result), ['A1.1-F1:code'])
  assert.deepEqual([result.onlyAlbaran.length, result.onlyFactura.length], [0, 0])
  assert.equal(result.pairs[0]!.factura.quantity.value, 3)
})

test('el mismo producto a otro precio no se suma', () => {
  const albaran = doc('albaran', [{ code: 'C-1', description: 'Vino', unitPrice: 5 }, { code: 'C-1', description: 'Vino', unitPrice: 6 }])
  const result = cross(albaran, doc('factura', [{ code: 'C-1', description: 'Vino', unitPrice: 5 }]))
  assert.deepEqual(keys(result), ['A1-F1:code'])
  assert.equal(result.onlyAlbaran.length, 1)
})
