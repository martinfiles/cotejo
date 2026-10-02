import assert from 'node:assert/strict'
import { test } from 'node:test'
import { doc, fact } from '../testing'
import { match, similarity } from './match'

const keys = (result: ReturnType<typeof match>) => result.pairs.map((p) => `${p.albaran.key}-${p.factura.key}:${p.by}`).sort()

test('casa por código aunque la descripción no se parezca', () => {
  const albaran = doc('albaran', [{ code: 'C-1040', description: 'ARR. BOMBA' }])
  const factura = doc('factura', [{ code: 'C-1040', description: 'Arroz bomba saco 5 kg' }])
  assert.deepEqual(keys(match(albaran, factura, [])), ['A1-F1:code'])
})

test('sin código, casa abreviaturas por parecido y no depende del orden', () => {
  const albaran = doc('albaran', [{ description: 'MEJILLON ROCA' }, { description: 'RAPE COLA S/P' }, { description: 'MERLUZA PINCHO 2/3' }])
  const factura = doc('factura', [{ description: 'Merluza de pincho 2-3 kg' }, { description: 'Rape cola sin piel' }, { description: 'Mejillón de roca' }])
  assert.deepEqual(keys(match(albaran, factura, [])), ['A1-F3:description', 'A2-F2:description', 'A3-F1:description'])
})

test('un nombre distinto no casa hasta que se aprende el alias', () => {
  const albaran = doc('albaran', [{ description: 'BOCARTE' }])
  const factura = doc('factura', [{ description: 'Boquerón fresco' }])
  const without = match(albaran, factura, [])
  assert.equal(without.pairs.length, 0)
  assert.deepEqual([without.onlyAlbaran.length, without.onlyFactura.length], [1, 1])

  const alias = fact({ kind: 'product-alias', albaran: 'BOCARTE', factura: 'Boquerón fresco' })
  assert.deepEqual(keys(match(albaran, factura, [alias])), ['A1-F1:alias'])
})

test('el mismo producto en otro formato es otro producto', () => {
  const albaran = doc('albaran', [{ description: 'BERBERECHO MALLA 0,5 KG' }, { description: 'BERBERECHO MALLA 5 KG' }])
  const factura = doc('factura', [{ description: 'Berberecho malla 5 kg' }, { description: 'Berberecho malla 0,5 kg' }])
  assert.deepEqual(keys(match(albaran, factura, [])), ['A1-F2:description', 'A2-F1:description'])

  // Aunque solo haya uno a cada lado: mejor dos líneas sueltas que un cruce falso.
  const lone = match(doc('albaran', [{ description: 'BERBERECHO MALLA 5 KG' }]), doc('factura', [{ description: 'Berberecho malla 0,5 kg' }]), [])
  assert.equal(lone.pairs.length, 0)
})

test('dos líneas con códigos distintos no se casan por descripción', () => {
  const albaran = doc('albaran', [{ code: 'C-1', description: 'Vino tinto Mencía' }])
  const factura = doc('factura', [{ code: 'C-2', description: 'Vino tinto Mencía' }])
  assert.equal(match(albaran, factura, []).pairs.length, 0)
})

test('los ejemplos que justifican el umbral de config.ts', () => {
  assert.equal(similarity('RAPE COLA S/P', 'Rape cola sin piel').toFixed(2), '0.67')
  assert.equal(similarity('Tomate pera', 'Tomate triturado lata 2,5 kg').toFixed(2), '0.29')
})
