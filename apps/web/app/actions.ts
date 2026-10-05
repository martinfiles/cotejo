'use server'

import { resolveCase, revoke } from '@cotejo/cases'
import { flushTracing } from '@cotejo/obs/langfuse'
import { revalidatePath } from 'next/cache'

// Lo que hacen los botones. Toda la lógica está en src/cases.ts; aquí solo se
// leen los formularios y se refrescan las pantallas.

export async function resolveAction(form: FormData) {
  const id = String(form.get('caseId'))
  const factor = form.get('factor')
  await resolveCase(id, Number(form.get('option')), factor ? Number(String(factor).replace(',', '.')) : undefined)
  // Los spans de los casos reprocesados se envían antes de responder.
  await flushTracing()
  revalidatePath('/', 'layout')
}

export async function revokeAction(form: FormData) {
  await revoke(String(form.get('factId')))
  await flushTracing()
  revalidatePath('/', 'layout')
}
