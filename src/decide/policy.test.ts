import assert from 'node:assert/strict'
import { test } from 'node:test'
import { config } from '../config'
import type { Finding, Signal } from '../types'
import { decide } from './policy'

const finding = (signal: Signal, impactEur: number | null = null): Finding =>
  ({ ruleId: 'test', signal, lineKey: 'F1', message: '', impactEur, evidence: [] })

const route = (...findings: Finding[]) => {
  const { outcome, reason } = decide(findings)
  return `${outcome} ${reason}`
}

const limit = config.decide.escalateFromEur

test('sin findings pasa sin molestar a nadie', () => {
  assert.equal(route(), 'pass all_matched')
})

test('una discrepancia real escala solo a partir del umbral', () => {
  assert.equal(route(finding('discrepancy', limit)), 'escalate overcharge')
  assert.equal(route(finding('discrepancy', limit - 0.01)), 'ask minor_discrepancy')
})

test('varias discrepancias pequeñas suman', () => {
  const half = limit / 2
  assert.equal(route(finding('discrepancy', half), finding('discrepancy', half)), 'escalate overcharge')
})

test('lo que va a favor se pregunta y no compensa un cobro de más', () => {
  assert.equal(route(finding('discrepancy', -50)), 'ask undercharge')
  const mixed = decide([finding('discrepancy', limit + 10), finding('discrepancy', -50)])
  assert.deepEqual([mixed.outcome, mixed.overchargeEur], ['escalate', limit + 10])
})

test('una discrepancia sin importe conocido se pregunta', () => {
  assert.equal(route(finding('discrepancy', null)), 'ask minor_discrepancy')
})

test('un fallo de lectura nunca escala, por grande que sea la discrepancia', () => {
  assert.equal(route(finding('discrepancy', 500), finding('read-doubt')), 'ask low_confidence_read')
})

test('un documento que se contradice se pregunta, pero se guarda cuánto habría que reclamar', () => {
  const decision = decide([finding('discrepancy', 31.2), finding('inconsistency')])
  assert.deepEqual(decision, { outcome: 'ask', reason: 'document_ambiguous', overchargeEur: 31.2 })
})

test('si falta saber algo del proveedor, se pregunta eso', () => {
  assert.equal(route(finding('missing-knowledge', 34), finding('missing-knowledge', -34)), 'ask missing_knowledge')
})

test('con varias dudas a la vez manda la lectura, luego el documento, luego el conocimiento', () => {
  assert.equal(route(finding('missing-knowledge'), finding('inconsistency'), finding('read-doubt')), 'ask low_confidence_read')
  assert.equal(route(finding('missing-knowledge'), finding('inconsistency')), 'ask document_ambiguous')
})
