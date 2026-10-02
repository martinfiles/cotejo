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

## Extracción con Claude Sonnet 5.5, no con Haiku
- Qué: `claude-sonnet-5-5` con esfuerzo `low`. En los 38 documentos del seed lee bien todas las líneas, cantidades, códigos y descripciones, y deja a null el precio tapado por el sello.
- Descartado: Haiku 4.5. Lee bien los valores, pero las cajas que devuelve caen lejos de su sitio (comprobado dibujándolas sobre la factura limpia).
- Por qué: sin cajas fiables no se puede señalar el número en disputa. Cuesta el doble por token; el coste real por documento lo dará el eval. Sin confirmar.

## Las cajas se piden en píxeles [por defecto]
- Qué: el modelo recibe el tamaño de la imagen y devuelve `[x1, y1, x2, y2]` en píxeles; `extract.ts` las pasa a fracciones de página, que es lo que usa el resto.
- Descartado: pedirlas directamente en fracciones 0..1.
- Por qué: en píxeles Sonnet 5.5 las ajusta al número, también en la foto torcida. En fracciones solo se probó con Haiku, que fallaba de las dos formas. Sin confirmar.

## El esquema del modelo está separado de los tipos de dominio [por defecto]
- Qué: `extract/schema.ts` es el contrato con el modelo y `types.ts` lo que usa el resto; `normalize()` en `extract.ts` traduce de uno a otro.
- Descartado: un solo esquema del que se infieren los tipos, que es como estaba en la Fase 1.
- Por qué: la salida estructurada de Anthropic rechazó el esquema original dos veces: admite 16 campos anulables como mucho (ahora hay 13) y la gramática no compila con las cajas como objetos, sí como listas. Sin confirmar.

## La caché recuerda con qué se extrajo [por defecto]
- Qué: cada entrada va por hash del fichero y guarda una huella del modelo, el esfuerzo, el prompt y el esquema. Si la huella no coincide, la entrada no vale.
- Descartado: clave solo por hash del fichero.
- Por qué: al cambiar el prompt devolvería resultados viejos sin avisar. Sin confirmar.

## El tipo de documento lo da quien lo sube [por defecto]
- Qué: `extract(path, docType)` recibe si es albarán o factura; el modelo no lo decide.
- Descartado: que el modelo clasifique el documento.
- Por qué: en la interfaz se suben en dos huecos distintos, así que ya se sabe. Sin confirmar.

## El PDF se convierte a PNG una vez y todo lo demás trabaja sobre la imagen [por defecto, aprobada]
- Qué: se rasteriza la primera página; el modelo y los recortes usan ese PNG.
- Descartado: mandar el PDF al modelo y recortar aparte; documentos de varias páginas.
- Por qué: un solo sistema de coordenadas. Además, el PDF del seed conserva en su capa de texto el número que tapa el sello; solo la imagen lo oculta de verdad.

## Un solo `package.json` en la raíz [por defecto, aprobada]
- Qué: `src`, `evals`, `seed` y `apps/web` comparten dependencias y tsconfig.
- Descartado: workspaces con un paquete por carpeta.
- Por qué: menos configuración.

## zod solo en la salida del modelo [por defecto]
- Qué: `ModelDocSchema` (en `extract/schema.ts`) valida lo que devuelve el modelo; `Finding`, `Fact`, `Rule` y el resto son tipos de TypeScript.
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

## El esperado depende de lo que el sistema sabe [borrador]
- Qué: cada caso lleva dos esperados, sin el hecho y con él. El eval corre en los dos estados y reporta el acierto de decisión dado el estado (debe ser alto en ambos) y el % de casos resueltos solos, que es la métrica de cabecera.
- Descartado: un único esperado `pass` para los casos de cajas y alias, que contaba como fallo preguntar sin tener la información.
- Por qué: preguntar cuando falta el dato es la respuesta correcta. Lo que mejora al aprender es la autonomía, no la corrección.

## Los findings esperados también son dos [por defecto]
- Qué: sin el hecho se espera `unit-incompatible` o `missing-line`; con él, ninguno o la discrepancia real que estaba oculta.
- Descartado: condicionar solo la decisión, que es lo que pidió Martín literalmente.
- Por qué: sin el hecho esos findings son correctos y no deben contar como falsos positivos. Sin confirmar.

## En el dataset las líneas se identifican por id de producto [borrador]
- Qué: el seed emite el id de catálogo de cada línea. En el eval, un resolvedor propio y generoso (código de producto; si no hay, descripción normalizada más cantidad) asigna cada línea extraída a su producto. Las líneas esperadas sin resolver son una métrica aparte.
- Descartado: clave por posición (un salto de línea penalizaba N veces); usar el matcher de producción para resolver (es el componente bajo prueba).
- Por qué: un salto de línea tiene que costar exactamente uno y verse como fallo de alineamiento.

## Generación determinista del seed [borrador]
- Qué: generar dos veces da los mismos bytes (verificado sobre los 52 ficheros). `seed/out/` va al repo y la caché de extracción irá también. `npm run seed` avisa antes de sobrescribir y pide `--force`.
- Descartado: ejecutar el seed una sola vez y no tocarlo.
- Por qué: que la demo funcione en cualquier máquina. Lo único que variaba era la hora de creación que Chromium escribe en el PDF; se fija al generar. No hay aleatoriedad en el seed.

## El determinismo es por máquina [por defecto]
- Qué: los bytes son idénticos con la misma versión de Chromium y la misma fuente Arial del sistema. En otra máquina pueden salir distintos.
- Descartado: incluir un fichero de fuente en el repo.
- Por qué: los documentos ya van versionados, así que nadie necesita regenerarlos. Sin confirmar.

## Casos frontera fuera de la métrica principal [borrador]
- Qué: los casos normales tienen impacto de menos de 5 € o de más de 25 €. Dos casos marcados `boundary: true` caen a 18,90 € y 20,40 €; su decisión se reporta aparte.
- Descartado: meter los casos frontera en la métrica principal.
- Por qué: el eval prueba el enrutado, no el ajuste del umbral, pero la respuesta a "qué pasa en 20 €" tiene que estar en el repo.

## Umbral de escalado en 20 € [por defecto]
- Qué: los dos casos frontera asumen que se escala a partir de 20 € de impacto.
- Descartado: no se ha hablado de otro valor.
- Por qué: es la cifra que mencionó Martín al pedir los casos. Sin calibrar y sin confirmar; se fija en `config.ts` en la fase de decisión.

## Lo que el informe del eval tiene que decir [borrador]
- Qué: número de casos por regla junto a cada métrica, y los casos holdout marcados aparte.
- Descartado: no se ha hablado de alternativas.
- Por qué: con 26 casos hay señales, no estadística. La mejora en holdout es el único número que demuestra generalización.

## Casos sucios en el seed antes de seguir [borrador]
- Qué: cinco casos más: mancha sobre el total de la factura, cantidad tachada y corregida a boli, foto mala (oscura, desenfocada, con sombra) con y sin discrepancia, y albarán de talonario escrito a mano.
- Descartado: seguir con las fases siguientes probando solo contra documentos limpios.
- Por qué: Martín pidió ensuciarlos para que fuera más realista. Con el seed limpio, la rama de fallo de lectura solo la ejercitaba el sello.

## Una corrección a mano se pregunta, no se escala [por defecto]
- Qué: en `carballo-corregido-a-mano` la discrepancia es de 31,20 €, por encima del umbral de escalado, pero el esperado es `ask`.
- Descartado: esperar `escalate` por impacto.
- Por qué: la cantidad sale de una corrección a boli y el importe impreso de esa línea ya no cuadra con ella, que es una de las señales de fallo de lectura. Sin confirmar.

## Hallazgo: ninguna lectura equivocada con confianza alta [borrador]
- Qué: se añadieron dos casos limpios con trampa estructural (kilos en formato de báscula "1.250" y "3.000", dos productos que solo difieren en "5 kg" y "0,5 kg", líneas en orden inverso, columna de descuento, descripción que salta de línea, precio e importe iguales). El modelo leyó bien los cuatro documentos.
- Descartado: degradar más los documentos hasta forzar un fallo.
- Por qué: que en 26 casos sintéticos no haya aparecido dice más del generador que del modelo. El fallo que importa sigue sin estar cubierto por el eval, y es mejor decirlo que inventarlo.

## Hallazgo: el descuento rompe la comprobación aritmética [por defecto]
- Qué: en `carballo-trampa-columnas` el modelo lee bien precio e importe, pero cantidad × precio no da el importe porque hay un 10 % de descuento y el esquema no tiene ese campo.
- Descartado: nada todavía; está sin resolver.
- Por qué: la trampa no engañó al modelo, sino a nuestra señal de fallo de lectura, que mandaría a preguntar un documento que cuadra. Pendiente de que Martín decida si se añade el campo o se deja como fallo conocido.
