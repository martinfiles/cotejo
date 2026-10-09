import assert from 'node:assert/strict'
import { test } from 'node:test'
import { doc } from '../testing'
import type { ExtractedDoc, Ref } from '../types'
import { link } from './link'

const albaran = (number: string, date: string, refs: Ref[] = []): ExtractedDoc => ({ ...doc('albaran', []), number, date, refs })
const factura = (refs: Ref[]): ExtractedDoc => ({ ...doc('factura', []), refs })

const cita = (number: string | null, date: string | null = null): Ref => ({ kind: 'albaran', number, date })
const pedido = (number: string): Ref => ({ kind: 'pedido', number, date: null })

const how = (result: ReturnType<typeof link>) => result.links.map((l) => l.by)

test('vincula por número aunque esté escrito de otra forma', () => {
  const result = link([albaran('ALB-26-4100', '2026-09-01'), albaran('ALB-26-4101', '2026-09-08')], factura([cita('ALB 26/4101'), cita('alb-26-4100')]))
  assert.deepEqual(how(result), ['number', 'number'])
  assert.deepEqual([result.missing, result.uncited], [[], []])
})

test('vincula por fecha cuando la factura solo cita el día de la entrega', () => {
  const result = link([albaran('T-51', '2026-09-03'), albaran('T-58', '2026-09-10')], factura([cita(null, '2026-09-03'), cita(null, '2026-09-10')]))
  assert.deepEqual(how(result), ['date', 'date'])
})

test('una cita con otro número y la misma fecha es otro albarán', () => {
  const result = link([albaran('ALB-1', '2026-09-03')], factura([cita('ALB-2', '2026-09-03')]))
  assert.deepEqual(how(result), [null])
  assert.deepEqual(result.missing, [cita('ALB-2', '2026-09-03')])
  assert.deepEqual(result.uncited, [0])
})

test('vincula por pedido cuando el albarán cita el mismo que la factura', () => {
  const albaranes = [albaran('ALB-1', '2026-09-03', [pedido('PED-26-330')]), albaran('ALB-2', '2026-09-10', [pedido('PED-26-999')])]
  const result = link(albaranes, factura([pedido('PED-26-330')]))
  assert.deepEqual(how(result), ['order', null])
  assert.deepEqual(result.uncited, [1])
})

test('un albarán citado que no está en el caso queda como pendiente', () => {
  const result = link([albaran('ALB-1', '2026-09-03')], factura([cita('ALB-1'), cita('ALB-2', '2026-09-10')]))
  assert.deepEqual(how(result), ['number'])
  assert.deepEqual(result.missing, [cita('ALB-2', '2026-09-10')])
  assert.deepEqual(result.uncited, [])
})

test('si la factura no cita nada no hay con qué comprobar', () => {
  const result = link([albaran('ALB-1', '2026-09-03')], factura([]))
  assert.deepEqual(how(result), [null])
  assert.deepEqual([result.missing, result.uncited], [[], []])
})
