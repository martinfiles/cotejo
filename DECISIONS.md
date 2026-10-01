# DECISIONS

## El LLM solo extrae y redacta; cruzar, detectar y decidir es código
- Qué: `match`, `rules` y la política de `decide` son deterministas. El modelo se usa en la extracción y para redactar la pregunta al humano.
- Descartado: LLM en el cruce de líneas.
- Por qué: es la tesis del proyecto: extraer es lo fácil, lo difícil es decidir a quién creer y cuándo preguntar.

## Discrepancia real y fallo de lectura son ramas distintas
- Qué: si lo he leído bien en los dos documentos y no cuadra, es problema del proveedor y va a `escalate` según impacto. Si no me creo lo leído, es problema mío y va a `ask` o a reintento, nunca a `escalate`. La rama tiene nombre propio en `policy.ts`.
- Descartado: una sola rama "todo lo demás va a `ask`", que mezclaba las dos cosas.
- Por qué: es la distinción que quiero defender. Señales de fallo de lectura: confianza baja, aritmética de línea que no cuadra, número exagerado de findings.

## La confianza es autodeclarada y se complementa con aritmética 
- Qué: La confianza por campo es autodeclarada por el modelo, no una probabilidad calibrada. La complemento con una comprobación aritmética (cantidad × precio = total de línea) como señal de qué lectura creer.
- Descartado: no se ha hablado de alternativas.
- Por qué: Martín pidió dejar la frase tal cual; es lo que quiere poder explicar.

## Umbrales en un único fichero, comentados y sin calibrar
- Qué: cada número vive en `config.ts` con un comentario de por qué está ahí.
- Descartado: constantes repartidas por el código.
- Por qué: son un punto de partida sin calibrar y tiene que quedar dicho en el código.

## Una regla por fichero, registradas en un index
- Qué: cada regla es un fichero con `{ id, severity, description, check(ctx) }` y `rules/index.ts` las lista.
- Descartado: no se ha hablado de alternativas.
- Por qué: añadir una regla tiene que ser obvio y rápido en el live-coding.

## Memoria de proveedor para que una corrección cambie el resultado
- Qué: al resolver un `ask` se guarda un hecho (equivalencia de unidad, alias de producto) que `match` y `rules` leen. Cada hecho es de un proveedor concreto, guarda fecha y caso de origen, y se puede revocar desde la interfaz.
- Descartado: solo añadir el caso al dataset (no mejora ninguna métrica); few-shot en el prompt; hechos globales.
- Por qué: poder enseñar "esto lo aprendió hace dos minutos" y poder deshacer si el humano resolvió mal.

## Sin mastra
- Qué: dos llamadas al modelo con AI SDK y salida validada por zod.
- Descartado: mastra.
- Por qué: no es un agente, es un pipeline determinista con dos llamadas; un framework de agentes sería sobreingeniería.

## Lo que haría a continuación: mastra para el caso en `ask`
- Qué: sin implementar. El ciclo de vida de un caso que queda en `ask` es un workflow que se suspende esperando a un humano y se reanuda.
- Descartado: no aplica.
- Por qué: es lo único del proyecto que justificaría mastra.

## Una traza por caso, con las extracciones como spans anidados
- Qué: la traza es del caso (albarán + factura). Cada extracción es un span dentro, y la traza lleva el proveedor como etiqueta.
- Descartado: una traza por documento.
- Por qué: la decisión es sobre el par; los spans anidados conservan coste y latencia por documento y la etiqueta permite filtrar por proveedor.

## Caja por línea obligatoria y caja por campo opcional
- Qué: cada línea lleva su caja. Cantidad, precio unitario y total llevan además caja propia cuando el modelo la da; si falta o es absurda, se usa la de la línea.
- Descartado: solo caja por línea; caja en todos los campos.
- Por qué: señalar el número exacto en disputa es el momento fuerte de la demo. Que la caja por campo falle a veces es un matiz que Martín quiere contar.

## Caché de extracción por hash, y el eval corre solo de caché
- Qué: la extracción se guarda por hash del fichero. El eval usa solo caché por defecto y tiene una bandera para refrescar.
- Descartado: llamar al modelo en cada ejecución del eval.
- Por qué: poder ejecutarlo en directo sin gastar tokens y sin depender de la red.

## Las métricas del frontend leen el último informe
- Qué: la pantalla de métricas lee el informe que dejó el eval; no recalcula nada. Los dos informes de la demo (antes y después de aprender el hecho) se guardan en el repo.
- Descartado: recalcular en el frontend.
- Por qué: poder comparar aunque algo falle en vivo.

## `npm run reset`
- Qué: un comando devuelve `data/` y el dataset al estado inicial (casos sin resolver, sin hechos, dataset base).
- Descartado: no se ha hablado de alternativas.
- Por qué: ensayar la demo muchas veces desde el mismo punto de partida.

## Tests con `node:test`
- Qué: un test por regla y uno para `policy.ts`.
- Descartado: una librería de tests.
- Por qué: `policy.ts` es función pura y es donde más valen; `node:test` no añade dependencia.

## Node LTS para poder usar el AI SDK
- Qué: subir Node en vez de cambiar de SDK.
- Descartado: SDK de Anthropic directo con Node 20.
- Por qué: Martín prefiere no renunciar al AI SDK por una versión de Node.

## Modelo de visión: el más barato disponible [Martín, pendiente]
- Qué: modelo y precio por token en `config.ts`, para la tabla de coste por documento.
- Descartado: no se ha hablado de alternativas.
- Por qué: pendiente de saber qué API keys hay; sin eso no se puede elegir modelo.

## El PDF se convierte a PNG una vez y todo lo demás trabaja sobre la imagen [por defecto, aprobada]
- Qué: se rasteriza la primera página; el modelo y los recortes usan ese PNG.
- Descartado: mandar el PDF al modelo y recortar aparte; documentos de varias páginas.
- Por qué: un solo sistema de coordenadas. Además, el PDF del seed conserva en su capa de texto el número que tapa el sello; solo la imagen lo oculta de verdad.

## Un solo `package.json` en la raíz [por defecto, aprobada]
- Qué: `src`, `evals`, `seed` y `apps/web` comparten dependencias y tsconfig.
- Descartado: workspaces con un paquete por carpeta.
- Por qué: menos configuración.

## zod solo en la salida del modelo [por defecto]
- Qué: `ExtractedDocSchema` valida lo que devuelve el modelo; `Finding`, `Fact`, `Rule` y el resto son tipos de TypeScript.
- Descartado: esquemas zod para todo.
- Por qué: lo demás lo produce nuestro propio código. Sin confirmar.

## El proveedor se identifica por NIF [por defecto]
- Qué: los hechos aprendidos se guardan contra el NIF extraído del documento.
- Descartado: el nombre del proveedor.
- Por qué: suposición de que el NIF se lee de forma más estable que el nombre. Sin medir y sin confirmar.

## Seed: "escrito distinto" y "discrepancia sembrada" son cosas separadas [por defecto]
- Qué: en `seed/orders.ts`, `albaranAs` describe cómo el albarán escribe la misma línea (cajas, otro nombre) y `Tweaks` lo que se rompe a propósito. El esperado de cada caso está escrito a mano.
- Descartado: derivar el esperado automáticamente de las mutaciones.
- Por qué: se lee de un vistazo qué prueba cada caso. Sin confirmar.

## La decisión esperada es la de un humano que conoce al proveedor [por defecto]
- Qué: los casos de cajas y de alias tienen `pass` como esperado aunque sin memoria el sistema solo pueda llegar a `ask`.
- Descartado: poner como esperado lo mejor que puede hacer el sistema sin memoria.
- Por qué: así el eval sube cuando el sistema aprende el hecho. Las decisiones esperadas se revisan al fijar umbrales en la fase de decisión. Sin confirmar.