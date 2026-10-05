import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { NextConfig } from 'next'

// La interfaz vive en apps/web, pero el código, los datos, la caché y el .env
// están en la raíz del repo. Se arranca desde la raíz (npm run web), así que
// las rutas relativas del pipeline siguen valiendo.
const root = resolve(__dirname, '..', '..')
if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'))

const nextConfig: NextConfig = {
  turbopack: { root },
  agentRules: false,
  // El icono de Next en la esquina sobra al compartir pantalla.
  devIndicators: false,
  // mupdf es WebAssembly y el SDK de Langfuse va sobre OpenTelemetry: mejor
  // cargarlos tal cual desde node_modules que empaquetarlos.
  serverExternalPackages: ['mupdf', '@langfuse/otel', '@langfuse/tracing', '@langfuse/client', '@opentelemetry/sdk-trace-node'],
}

export default nextConfig
