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
- Por qué: la salida estructurada de Anthropic rechazó el esquema original dos veces: admite 16 campos anulables como mucho y la gramática no compila con las cajas como objetos, sí como listas. Sin confirmar.

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

## Una corrección a mano se pregunta con su propio motivo, `document_ambiguous` [borrador]
- Qué: en `carballo-corregido-a-mano` el esperado es `ask` con motivo `document_ambiguous`, distinto de `low_confidence_read`. Las opciones de la pregunta incluyen el camino a reclamación: si el humano responde "recibí 18", el caso pasa a `escalate` con 31,20 € de cobro de más.
- Descartado: `escalate` directo por impacto; tratarlo como fallo de lectura.
- Por qué: el modelo leyó bien el 18 del boli. Es el documento el que se contradice consigo mismo, y eso no lo arregla un OCR mejor: solo lo sabe quien recibió la mercancía. El motivo acaba en la interfaz y en el eval.

## Hallazgo: ninguna lectura equivocada con confianza alta [borrador]
- Qué: se añadieron dos casos limpios con trampa estructural (kilos en formato de báscula "1.250" y "3.000", dos productos que solo difieren en "5 kg" y "0,5 kg", líneas en orden inverso, columna de descuento, descripción que salta de línea, precio e importe iguales). El modelo leyó bien los cuatro documentos.
- Descartado: degradar más los documentos hasta forzar un fallo.
- Por qué: que en 26 casos sintéticos no haya aparecido dice más del generador que del modelo. El fallo que importa sigue sin estar cubierto por el eval, y es mejor decirlo que inventarlo.

## Hallazgo: el descuento rompe la comprobación aritmética [por defecto]
- Qué: en `carballo-trampa-columnas` el modelo lee bien precio e importe, pero cantidad × precio no da el importe porque hay un 10 % de descuento y el esquema no tiene ese campo.
- Descartado: nada todavía; está sin resolver.
- Por qué: la trampa no engañó al modelo, sino a nuestra señal de fallo de lectura, que mandaría a preguntar un documento que cuadra. Pendiente de que Martín decida si se añade el campo o se deja como fallo conocido.

## Qué se hizo con el hallazgo del descuento [borrador]
- Qué: se añadió `discount` al esquema y a los tipos, y la aritmética de línea pasa a ser cantidad × precio × (1 − descuento). Se rehízo la caché entera. `carballo-trampa-columnas` se queda en el eval como test de regresión.
- Descartado: dejarlo como fallo conocido para enseñarlo en la entrevista.
- Por qué: la comprobación aritmética es la señal que separa fallo de lectura de discrepancia real, y no debía nacer con un falso positivo conocido.

## Confianza solo en los importes [borrador, confirmada]
- Qué: llevan confianza cantidad, precio e importe de cada línea y los tres totales. Código, descripción, unidad, IVA, descuento y cabecera son valores sueltos.
- Descartado: confianza en todos los campos, que es lo que pedía el encargo y lo que había hasta ahora.
- Por qué: al añadir `discount` la gramática de la salida estructurada dejó de compilar; estaba justo en el límite. Así compila y quedan 2 campos anulables de margen (hay 14 de 16). Ninguna regla prevista usa la confianza de un texto. Si alguna acaba necesitando la de la unidad, es la primera que vuelve a entrar.

## Lo siguiente, sin implementar: descuento pactado que la factura no aplica [borrador]
- Qué: una regla nueva que compara el descuento de la factura con el pactado con ese proveedor, guardado en la memoria de proveedor.
- Descartado: hacerla ahora.
- Por qué: con el descuento modelado se abre una regla que sí vale dinero.

## Cruce por código, luego por alias, luego por parecido [por defecto]
- Qué: `match.ts` casa primero por código de producto, después por alias aprendido y por último por parecido de descripción (Dice sobre palabras, umbral en `config.ts`). Dos líneas con códigos distintos nunca se casan por descripción.
- Descartado: un único criterio de parecido para todo.
- Por qué: el código es lo único inequívoco y cada pareja queda con el motivo por el que se casó (`by`). Sin confirmar.

## Los números de la descripción son el formato [por defecto]
- Qué: si dos descripciones traen números y no coinciden ("5 kg" frente a "0,5 kg"), no se casan aunque el resto sea igual.
- Descartado: dejar que el parecido decida.
- Por qué: sin esta guarda, los dos berberechos de `rianorte-trampa-bascula` se cruzarían cuando solo hay uno a cada lado, y saldría una diferencia de precio falsa. Mejor dos líneas sueltas que un cruce falso. Sin confirmar.

## Tests también para el cruce [por defecto]
- Qué: `match.test.ts` con seis casos, incluidos los dos ejemplos que justifican el umbral.
- Descartado: probar el cruce solo a través del eval.
- Por qué: Martín pidió tests de reglas y de política; el cruce es igual de determinista y tiene casos límite. Sin confirmar.

## Limitación: el cruce está validado contra el propio seed [borrador]
- Qué: el cruce coincide con la verdad del seed en los 26 casos, pero esa verdad la escribió el mismo generador que escribe los documentos.
- Descartado: presentarlo como precisión del cruce.
- Por qué: mide si el cruce coincide con mis supuestos, no con la realidad.

## Hallazgo: la confianza cambia de una extracción a otra [por defecto]
- Qué: al rehacer la caché, la cantidad corregida a boli pasó de 0,6 a 0,8 y la foto mala de 0,88-0,93 a 0,80-0,85, con los mismos documentos y los valores igual de bien leídos.
- Descartado: fijar el umbral de confianza baja entre 0,6 y 0,88, que era la idea tras la primera extracción.
- Por qué: ya no hay un valor que separe la corrección a mano de la foto mala. Para decidir, la confianza solo sirve en los extremos (0 cuando no se lee); lo demás lo tiene que dar la aritmética. Se concreta en la fase de decisión. Sin confirmar.

## Corrección al hallazgo anterior: no era el muestreo [por defecto]
- Qué: entre aquellas dos tandas cambiaron el prompt y el esquema (se añadió el descuento y se reescribió el párrafo de la confianza). No eran las mismas condiciones, y el hallazgo no lo decía.
- Descartado: atribuir el salto de 0,6 a 0,8 a la variación entre ejecuciones.
- Por qué: con prompt y esquema idénticos, la confianza de esa cantidad salió 0,8 las dos veces. Lo que la movió fue el prompt.

## La temperatura no se puede fijar [borrador]
- Qué: ninguna tanda corrió a temperatura 0. Al pedir `temperature: 0` a `claude-sonnet-5-5`, la llamada responde y el AI SDK devuelve este aviso, copiado literal: `The feature "temperature" is not supported. temperature is not supported by claude-sonnet-5-5 and will be ignored`.
- Descartado: repetir la medida a temperatura 0, que era lo pedido.
- Por qué: no hay forma de separar por esa vía el muestreo del resto. Lo que sí se puede medir es cuánto cambia una segunda lectura en las mismas condiciones; es el experimento siguiente.

## Experimento de autoconsistencia [borrador]
- Qué: segunda lectura de los 52 documentos sin caché, comparada campo a campo con la primera. Difieren 0 de 2.240 valores. La confianza declarada cambia en 195 de 840 importes (23,2 %), nunca más de 0,07. Informe en `evals/experiments/self-consistency.md`.
- Descartado: meterlo en el pipeline. Si sobra tiempo, se cablea solo para los documentos que fallen una comprobación determinista.
- Por qué: la discrepancia entre lecturas es una medida de incertidumbre que no depende de lo que el modelo diga de sí mismo. Cero diferencias en 2.240 valores es, antes que un buen resultado del modelo, la prueba de que mi corpus es fácil.

## La duda de lectura se apoya en lo determinista [borrador]
- Qué: la confianza del modelo solo se usa en el extremo (`minReadConfidence`, que separa "no leído" de todo lo demás). El resto son reglas: aritmética de línea con descuento, suma de líneas contra el total, coherencia de IVA y rango plausible de precio.
- Descartado: un umbral fino de confianza.
- Por qué: la confianza se mueve entre lecturas y mucho más al cambiar el prompt.

## Cada regla declara qué significa su finding [borrador, confirmada]
- Qué: el contrato de regla lleva un campo más, `signal`: `discrepancy` (los dos documentos no dicen lo mismo), `inconsistency` (un documento se contradice), `read-doubt` (no me creo lo leído) o `missing-knowledge` (falta saber algo del proveedor). La política decidirá con eso y con el impacto.
- Descartado: una tabla en la política que diga qué regla es de qué tipo.
- Por qué: así añadir una regla sigue siendo un fichero y una línea en el index, sin un tercer sitio que tocar. Amplía el contrato que pidió Martín, que lo prefiere a lo que pidió.

## Nueve reglas, no seis [por defecto]
- Qué: a las seis del encargo se suman `line-arithmetic`, `unreadable-amount` e `implausible-price`, que son las señales de duda.
- Descartado: meter esas comprobaciones dentro de la política.
- Por qué: como reglas dejan un finding con su evidencia y su caja, que es lo que la interfaz enseña y lo que el modelo necesita para redactar la pregunta. Sin confirmar.

## Un total que no suma se pregunta, no se escala [borrador, confirmada]
- Qué: `total-mismatch` y `vat-inconsistent` son `inconsistency`. El esperado de `carballo-total-no-suma` pasa de `escalate` a `ask`, aunque sean 30 €.
- Descartado: tratarlos como discrepancia real y escalar por impacto, que es como estaba en el seed.
- Por qué: Martín puso la suma de líneas y la coherencia de IVA entre las señales de duda. Una factura que se contradice es el mismo caso que la corrección a mano: se pregunta, y la respuesta puede acabar en reclamación o en pedir factura rectificativa.

## Sin equivalencia de unidades no se compara nada de esa línea [por defecto]
- Qué: si albarán y factura van en unidades distintas y no se sabe convertir, solo salta `unit-incompatible`; las reglas de cantidad y precio se callan.
- Descartado: comparar los números tal cual.
- Por qué: 2 cajas contra 12 kg daría una diferencia de cantidad y otra de precio que no existen. Sin confirmar.

## Los tests de reglas van en un solo fichero [borrador, confirmada]
- Qué: `rules.test.ts` tiene al menos un test por regla; `src/testing.ts` construye los documentos de prueba.
- Descartado: un fichero de test por regla.
- Por qué: comparten los mismos documentos de ejemplo, y en el live-coding añadir regla y test es abrir dos ficheros, no cuatro. Si pasa de unas 400 líneas se parte por tipo de `signal`, no antes.

## `severity` fuera del contrato de regla [borrador]
- Qué: se quita `severity` de reglas y findings.
- Descartado: mantenerlo por si la interfaz lo necesita.
- Por qué: lo pedí, no servía, fuera. No lo usaba nada. Si la interfaz necesita jerarquía visual, la saca de `signal` e `impactEur`, que son datos reales, y no de una etiqueta puesta a mano.

## La política es una función pura con las ramas en orden [borrador, confirmada]
- Qué: `decide(findings)` mira por este orden: sin findings pasa; fallo de lectura, documento ambiguo y falta de conocimiento preguntan; y solo si no hay ninguna duda se mira el importe: 20 € o más de cobro de más escala, menos pregunta.
- Descartado: decidir línea a línea, de modo que una duda en una línea no frene la reclamación de otra.
- Por qué: una duda en cualquier parte del documento impide escalar, que es la regla de Martín llevada a su forma más simple. Coste: un sello en una línea retrasa una reclamación clara en otra; para que no se pierda de vista, la pregunta menciona ese cobro de más con su importe.

## Siete motivos de decisión, repasados [borrador]
- Qué: cada decisión lleva un `reason`: `all_matched`, `overcharge`, `minor_discrepancy`, `undercharge`, `document_ambiguous`, `low_confidence_read` o `missing_knowledge`. El esperado de cada caso del seed lo incluye.
- Descartado: solo los dos que nombró Martín.
- Por qué: un motivo se justifica si la persona hace algo distinto con él. Repasados con ese criterio, ninguno se fusiona:
  | Motivo | Botones | Qué hace la persona |
  |---|---|---|
  | `all_matched` | ninguno | nada |
  | `overcharge` | reclamar, aceptar | reclamar: el caso ya llega escalado |
  | `minor_discrepancy` | reclamar, aceptar | decidir si una diferencia pequeña merece reclamarse |
  | `undercharge` | aceptar, rectificativa | decidir si avisa al proveedor de lo que no cobró |
  | `low_confidence_read` | aceptar, rectificativa (y reclamar si hay cobro de más claro) | mirar el papel y leer lo que el sistema no pudo |
  | `document_ambiguous` | reclamar, aceptar, rectificativa | decir qué pasó de verdad, que solo sabe quien recibió |
  | `missing_knowledge` | enseñar el hecho, aceptar | enseñarle algo del proveedor |
  Los más parecidos son `low_confidence_read` y `document_ambiguous`: comparten botones, pero en uno la persona lee y en el otro recuerda. Además, Martín pidió que fueran motivos distintos.

## El cobro de más no se compensa con lo que va a favor [por defecto]
- Qué: el importe que decide si se escala es la suma de los cobros de más; una línea entregada y sin facturar no resta.
- Descartado: usar el neto.
- Por qué: un cobro de más en una línea no debe quedar tapado por un despiste a favor en otra. Sin confirmar.

## Líneas sueltas a los dos lados es falta de conocimiento [borrador, confirmada]
- Qué: si hay una línea sin pareja en el albarán y otra en la factura, `missing-line` marca sus findings como `missing-knowledge` y se pregunta si son el mismo producto. Si solo sobra a un lado, es discrepancia.
- Descartado: escalar directamente la línea facturada sin pareja.
- Por qué: es el caso del alias. Sin esto, BOCARTE contra Boquerón fresco escalaría como mercancía cobrada y no entregada. Y es el camino que alimenta la memoria de proveedor.

## Los botones los pone el código; el modelo solo redacta [por defecto]
- Qué: `options.ts` decide las opciones de cada caso y cuatro efectos posibles: aceptar, reclamar (con el importe), pedir factura rectificativa y enseñar un hecho. `question.ts` redacta la pregunta con Claude Haiku 4.5 a partir de los findings y de esas opciones.
- Descartado: que el modelo proponga las respuestas.
- Por qué: el efecto de un botón tiene que ser el mismo se redacte como se redacte la pregunta. Sin confirmar.

## Un `ask` que se convierte en dinero [borrador]
- Qué: la decisión guarda cuánto habría que reclamar aunque el caso se pregunte. En la corrección a mano las opciones son "Recibí 18: reclamar 31,20 €" y "Recibí 24: la factura está bien".
- Descartado: opciones genéricas de aceptar o rechazar.
- Por qué: Martín quiere enseñar que la respuesta a una pregunta acaba en reclamación.

## Pedir factura rectificativa [borrador]
- Qué: es una opción cuando la factura se contradice, no se puede leer o deja algo sin cobrar.
- Descartado: ofrecer solo confirmar el importe.
- Por qué: una factura que no cuadra está mal emitida, y en hostelería eso se resuelve pidiéndola de nuevo.

## No se teclea a mano un importe ilegible [borrador, confirmada]
- Qué: ante un importe ilegible las opciones son dar la factura por buena o pedir rectificativa; no hay un campo para escribir el valor correcto.
- Descartado: corregir el valor y volver a decidir.
- Por qué: son las dos salidas correctas. Si el total no se lee, en España se pide un duplicado; no se teclea un número a ojo.

## La pregunta también va en caché [por defecto]
- Qué: se guarda por hash del modelo, el prompt y los findings. Con los mismos findings no se vuelve a llamar al modelo.
- Descartado: redactarla en cada ejecución.
- Por qué: el eval y el reset de la demo corren sin red. Sin confirmar.

## Observabilidad dentro de la Fase 5 [borrador]
- Qué: una traza por caso con un span por etapa (extraer albarán, extraer factura, cruzar, reglas, decidir) y una generation por llamada real al modelo, con modelo, tokens y coste. La traza lleva el proveedor como etiqueta. `obs/langfuse.ts` es lo único que conoce Langfuse.
- Descartado: hacerla como fase aparte.
- Por qué: quedan cuatro días y hay que llegar al frontend y al informe del eval.

## Las extracciones de caché no cuentan como generation [por defecto]
- Qué: si la extracción sale de caché, su span lleva `cached: true` y lo que costó en su día, pero no se registra una llamada al modelo.
- Descartado: registrarla igualmente para ver coste por documento en Langfuse.
- Por qué: Langfuse sumaría un gasto que no se ha producido. Sin confirmar.

## El trazado se enciende a propósito [por defecto]
- Qué: si nadie llama a `startTracing()`, el pipeline corre igual y no envía nada. El eval y el reset no lo llaman.
- Descartado: trazar siempre.
- Por qué: el eval tiene que correr sin red. Sin confirmar.

## Enseñar un hecho vuelve a decidir los casos abiertos del proveedor [por defecto]
- Qué: al aprender un hecho se reprocesan los casos de ese proveedor que no pasaron solos; al revocarlo, los que se apoyaron en él. Lo que un humano ya cerró no se toca.
- Descartado: aplicar el hecho solo a los casos nuevos.
- Por qué: es lo que se ve en la demo: una respuesta resuelve los otros casos de ese proveedor. Sin confirmar.

## Toda respuesta entra en el dataset como corrección [borrador]
- Qué: cada resolución deja un score en Langfuse y un caso `source: 'correction'` con el efecto que tuvo. Aceptar etiqueta `pass`, reclamar y pedir rectificativa etiquetan `escalate`, y enseñar un hecho deja los dos esperados, antes y después. Solo los hechos cambian lo que hace el pipeline.
- Descartado: meter solo las respuestas que enseñan un hecho, que era mi propuesta.
- Por qué: aceptar cuando el sistema preguntó dice que debió pasar, y reclamar que debió escalar. Son etiquetas más ruidosas que un hecho, pero etiquetas. El eval las reporta aparte y nunca entran en la métrica de cabecera.

## `npm run reset` deja la cola de la demo montada [por defecto]
- Qué: borra `data/`, quita del dataset los casos de correcciones y procesa los 26 del seed desde caché, sin hechos.
- Descartado: dejar `data/` vacío.
- Por qué: el punto de partida de la demo es la cola con casos sin resolver. Sin confirmar.

## Lo siguiente, sin implementar: decidir línea a línea [borrador]
- Qué: que una duda en una línea no impida escalar un cobro de más claro en otra.
- Descartado: hacerlo antes de la entrevista.
- Por qué: es más correcto, pero no a tres días. Mientras tanto, la pregunta menciona los dos asuntos.

## El score de la resolución llega a Langfuse [borrador]
- Qué: comprobado que el score `resolucion_humana` (valor `accept`) está en la traza `2ec91ee58a5341004fe1ebd64668ab07`.
- Descartado: comprobarlo por la interfaz, que pidió Martín; queda para que lo mire él.
- Por qué: las API de lectura de trazas y scores devuelven 410 en cuentas creadas después del 16-09-2026. Se consultó con `GET /api/public/v2/metrics` (vista `scores-categorical`), que es la que funciona.

## El eval corre el dataset en dos estados [borrador]
- Qué: sin hechos y con los hechos vigentes en `data/facts.json`. Cada caso se compara con el esperado que le toca según tenga o no los hechos que necesita; un hecho con el factor equivocado cuenta como fallo.
- Descartado: un segundo estado con todos los hechos del seed.
- Por qué: con los hechos aprendidos de verdad, el eval enseña lo que ha cambiado por corregir a mano, que es lo que se quiere demostrar.

## `--refresh` rellena lo que falta, no vuelve a leer [por defecto]
- Qué: `npm run eval` corre solo de caché y falla si falta algo; con `--refresh` llama al modelo para lo que no esté en caché. No repite lo que ya está.
- Descartado: que `--refresh` vuelva a leer los 52 documentos.
- Por qué: costaría 1 USD cada vez y no aporta nada mientras no cambien modelo, prompt o esquema; si cambian, la caché ya invalida sola esas entradas. Sin confirmar.

## Qué separa el informe del eval [borrador]
- Qué: la cabecera es el % de casos resueltos solos en cada estado, junto al acierto de decisión y de motivo y al techo de autonomía del dataset. Aparte van el holdout (con cuántos pasan a escalar), los casos de frontera, las correcciones, la precisión y el recall por regla con su número de casos, las líneas sin alinear y el coste y la latencia por documento.
- Descartado: mezclar frontera o correcciones en la cabecera.
- Por qué: lo pidió Martín. El informe dice con esas palabras que lo que mejora al aprender es la autonomía, no la corrección.

## Los dos informes de la demo van al repo [borrador]
- Qué: `evals/results/demo-antes` (sin hechos: 25 % de casos resueltos solos, 6 de 24) y `demo-despues` (tras enseñar la caja de tomate y el alias del boquerón: 41,7 %, 10 de 24, que es el techo del dataset). Acierto de decisión del 100 % en los dos. En holdout se pasa de 0 a 2 casos resueltos solos, y los otros 2 pasan a escalar por discrepancias que antes no se veían.
- Descartado: generarlos solo en directo.
- Por qué: poder comparar aunque algo falle en la demo.

## Un acierto del 100 % no es una buena noticia sin más [borrador]
- Qué: el eval da 100 % de acierto de decisión y de motivo en los dos estados.
- Descartado: presentarlo como precisión del sistema.
- Por qué: el esperado lo escribió el mismo generador que los documentos, y las reglas se ajustaron mirando ese seed. Mide coherencia con mis supuestos; el informe lo dice.
