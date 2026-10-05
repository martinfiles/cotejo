// Lo primero que ejecuta el servidor de Next: enciende el envío de trazas a
// Langfuse para todo lo que se procese desde la interfaz.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startTracing } = await import('@cotejo/obs/langfuse')
    startTracing()
  }
}
