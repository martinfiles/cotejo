import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import type { CaseResult } from './pipeline'
import type { Fact, Knowledge, Resolution } from './types'

// Toda la persistencia está detrás de este fichero: casos y hechos aprendidos
// son JSON en data/. Nadie más lee ni escribe ahí, así que pasar a Postgres
// es reescribir estas funciones (el esquema de tablas está en DECISIONS.md).

const DIR = 'data'
const FACTS = `${DIR}/facts.json`

export type StoredCase = CaseResult & {
  createdAt: string
  files: { albaran: string; factura: string }
  // Lo que respondió el humano. null mientras el caso sigue abierto.
  resolution: (Resolution & { at: string; amountEur: number | null }) | null
}

const readJson = async <T>(path: string, fallback: T): Promise<T> => {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return fallback
  }
}

async function writeJson(path: string, value: unknown) {
  await mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true })
  await writeFile(path, JSON.stringify(value, null, 2) + '\n')
}

export const saveCase = (c: StoredCase) => writeJson(`${DIR}/cases/${c.id}.json`, c)

export const getCase = (id: string) => readJson<StoredCase | null>(`${DIR}/cases/${id}.json`, null)

export async function listCases(): Promise<StoredCase[]> {
  const files = await readdir(`${DIR}/cases`).catch(() => [])
  const cases = await Promise.all(files.map((f) => readJson<StoredCase | null>(`${DIR}/cases/${f}`, null)))
  return cases.filter((c) => c !== null).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

// Incluye los revocados: la interfaz los enseña tachados. Quien los aplica
// (el pipeline) descarta los que tienen revokedAt.
export const listFacts = () => readJson<Fact[]>(FACTS, [])

export async function addFact(knowledge: Knowledge, fromCase: string): Promise<Fact> {
  const fact: Fact = { ...knowledge, id: randomUUID(), learnedAt: new Date().toISOString(), fromCase, revokedAt: null }
  await writeJson(FACTS, [...(await listFacts()), fact])
  return fact
}

export async function revokeFact(id: string): Promise<Fact | null> {
  const facts = await listFacts()
  const fact = facts.find((f) => f.id === id && !f.revokedAt)
  if (!fact) return null
  fact.revokedAt = new Date().toISOString()
  await writeJson(FACTS, facts)
  return fact
}

export const clearStore = () => rm(DIR, { recursive: true, force: true })
