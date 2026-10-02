import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

// Va al repo: es lo que permite correr el eval y la demo sin red ni tokens.
const DIR = 'cache'

export const sha256 = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex')

export async function readCache<T>(kind: string, key: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(`${DIR}/${kind}/${key}.json`, 'utf8'))
  } catch {
    return null
  }
}

export async function writeCache(kind: string, key: string, value: unknown) {
  await mkdir(`${DIR}/${kind}`, { recursive: true })
  await writeFile(`${DIR}/${kind}/${key}.json`, JSON.stringify(value, null, 2) + '\n')
}
