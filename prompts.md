Añade uno o dos casos así: documento limpio y legible, pero con una trampa estructural.
Son los que producen lecturas equivocadas con confianza alta, que es el fallo que importa.

- Columna de descuento que no hay que sumar, en un documento por lo demás normal.
- Precio unitario y total en columnas de magnitud parecida y cabeceras ambiguas.
- Separador decimal tramposo: "1.250" que significa 1,250 kg y no 1250.
- Una descripción que desborda a dos líneas, de modo que la cantidad de una fila queda
visualmente alineada con la descripción de la siguiente.
- Dos productos con descripción casi idéntica que solo difieren en el formato (5 kg y 0,5 kg).

Si pese a esto el modelo no se equivoca con confianza alta, no lo fuerces: anótalo en
DECISIONS.md como hallazgo. Que en 24 casos sintéticos no haya aparecido dice más de mi
generador que del modelo, y prefiero decir eso que inventarme un fallo.

---

1. Identificación de líneas: cambia a clave semántica. Por posición no vale, porque si el
modelo se salta una línea el desalineamiento penaliza N veces el mismo error y deja de
distinguirse "se dejó una línea" de "leyó mal todo lo demás". Como el seed genera las
líneas, conoce la verdad: que emita en el dataset un identificador estable por línea
(el id canónico de producto del catálogo, no el texto del documento).

En el eval, la resolución de línea extraída a línea esperada la hace un resolvedor propio
de evals, deliberadamente generoso (código de producto, y si no hay, descripción
normalizada más cantidad). NO uses el matcher de producción para esto: es componente bajo
prueba y me montarías una circularidad.

Y añade una métrica propia: líneas esperadas que no se pudieron resolver. Así un salto de
línea aparece como lo que es, un fallo de alineamiento, y cuesta exactamente uno.

---

Dos decisiones.

**1. Descuento: añade el campo `discount` al esquema ahora.** Motivo: la comprobación
aritmética es la señal con la que distingo fallo de lectura de discrepancia real, y no
quiero que nazca con un falso positivo conocido. Rehaz la caché, el gasto es asumible.

Tres cosas con esto:
- El caso carballo-trampa-columnas se queda en el eval como test de regresión, no lo
  retires.
- En DECISIONS.md, el hallazgo se queda escrito tal como está y añades debajo qué hiciste
  con él. Quiero poder contar que el análisis de errores encontró un fallo en mi propia
  señal aritmética, no solo que el esquema tiene un campo más.
- Anota como "lo siguiente, sin implementar": con el descuento modelado se abre una regla
  nueva que sí vale dinero, "descuento pactado que la factura no aplica", apoyada en la
  memoria de proveedor. No la hagas ahora.

**2. La corrección a mano se queda en `ask`, pero cambia el motivo.** No es un fallo de
lectura: el modelo leyó bien, leyó el 18 del boli. Es que el documento se contradice
consigo mismo, y eso no lo arregla ningún OCR mejor, solo lo sabe quien recibió la
mercancía. Necesita su propio motivo, `document_ambiguous`, distinto de
`low_confidence_read`, porque ese texto acaba en la interfaz y en el eval.

Y cuando llegues a la fase de decisión: las opciones de resolución de esa pregunta tienen
que incluir el camino a reclamación. Si el humano responde "recibí 18", el caso pasa a
escalate con 31,20 € de cobro de más. Es un `ask` que se convierte en dinero y quiero
poder enseñarlo.

**prompts.md:** no lo toques y no lo commitees. Lo reviso yo.

Arranca la Fase 3 con el cruce de líneas en paralelo, que no depende de esto.

---

Las tres confirmadas, y una cuarta cosa.

**1. `signal` en el contrato de regla: sí, y me parece mejor que lo que yo pedí.** Que la
semántica viva en la regla y no en una tabla de la política mantiene la propiedad que más
me importa: añadir una regla sigue siendo un fichero y una línea.

**2. Total que no suma y IVA incoherente a `ask`: confirmado.** Es `inconsistency`, el mismo
caso que la corrección a mano. Pero cuando llegues a las opciones de resolución, añade una
que no es obvia: además de confirmar el importe, **pedir factura rectificativa**. Una
factura que no cuadra está mal emitida, y en hostelería eso se resuelve pidiéndola de nuevo,
no solo aceptando el número. Quiero esa opción en la interfaz.

**3. Tests de reglas en un fichero: confirmado.** Y además encaja mejor con el live-coding:
añadir regla y test es abrir dos ficheros, no cuatro. Si el fichero pasa de unas 400
líneas, pártelo por tipo de signal, no antes.

**4. `severity`: quítalo.** Lo pedí yo y no lo usa nada, así que es peso muerto y contradice
lo que te dije de no añadir abstracciones por si acaso. Si la interfaz necesita jerarquía
visual, la deriva de `signal` más `impactEur`, que son datos reales, y no de una etiqueta
que yo asigné a mano. Anótalo en DECISIONS.md con ese motivo: lo pedí, no servía, fuera.

**Y una cosa de ritmo:** no hagas la observabilidad como fase aparte. Instrumenta con
Langfuse mientras construyes la Fase 5, en el mismo paso. Me quedan cuatro días y necesito
llegar al frontend y al informe del eval con tiempo, que es lo único que van a ver.

Adelante con la Fase 5.

---

│ Plan: una factura contra varios albaranes                                                     │
│                                                                                               │
│ Contexto                                                                                      │
│                                                                                               │
│ Hoy un caso de cotejo es un albarán y una factura, y eso está asumido en tipos, pipeline, dataset, eval e interfaz. En la práctica una factura suele cubrir varias entregas: cita sus albaranes por número o por fecha, o cita un código de pedido que también aparece en cada albarán. Se quiere que un caso sea una factura y una lista de albaranes (1, 2 o más), y casos nuevos en el seed para evaluarlo.                                                             │
│                                                                                               │
│ Decidido con Martín:                                                                          │
│ - Los albaranes llegan con la rencias sirven para verificar y    │explicar el vínculo, no para buscar albaranes.                                              - Señal nueva missing-documentent (ask).                         │
│ - Aceptado releer toda la caché (unos 80 documentos, alrededor de 1,5 USD estimados).         │
│                                                                                               │
│ Con un solo albarán y sin productos repetidos, lo nuevo no hace nada: los 26 casos actuales   tienen que decidir igual y sir                                   │
│                                                                                               │
│ Diseño                                                                                        │
│                                                                                               │
│ 1. Extracción: leer qué cita cada documento                                                   │
│                                                                                               │
│ - src/extract/schema.ts: campo de documento refs: { kind: 'albaran' | 'pedido', number: string | null, date: string | null }[]. Usa los 2 anulables que quedaban (16 de 16); actualizar el comentario del límite.                                                        │
│ - src/extract/prompt.ts: qué es refs (la factura cita albaranes o un pedido; el albarán cita su pedido; lista vacía si no cita nada) y que una fila de cabecera de sección ("Albarán X del …") no es una línea de producto.                                                        │
│ - Primer paso, antes de nada más: una llamada de prueba con readDocument desde el scratchpad para comprobar que la gramática compila. Si no compila, date pasa a texto vacío en vez de null.                                                                                       │
│                                                                                               2. Tipos (src/types.ts)                                          │                                                                  │
│ - Ref y ExtractedDoc.refs.                                                                    │
│ - Line.source: number (qué albarán del caso, por índice; 0 en la factura) y Line.parts?: Line[] (solo en líneas sumadas).                                                            - Evidence.source: number, parfichero correcto.                  │
│ - Signal + 'missing-document'; Reason + 'missing_document'.                                   │
│ - RuleContext: albaranes: ExtractedDoc[] en vez de albaran, más links.                        │
│ - DatasetCase: albaranes: string[] en vez de albaran. lines.albaran sigue siendo una lista plana con las líneas de todos.                                                              │
│                                                                                               │
│ 3. Vincular (nuevo src/link/link.ts + link.test.ts)                                           │
│                                                                                               │
│ Función pura link(albaranes, factura) que devuelve:                                           │
│ - links: por cada albarán, cómo se vinculó: 'number' (con sameCode de src/text.ts), 'date', 'order' (el pedido del albarán es el de la factura) o null.                                 │
│ - missing: referencias de la factura a albaranes que no están en el caso.                     │
│ - uncited: albaranes que la factura no cita. Solo si la factura cita algo; si no trae ninguna referencia no se puede verificar y no se dice nada.                                         │
│                                                                                               4. Cruce (src/match/match.ts)                                    │
│                                                                                               │
│ - Firma match(albaranes: ExtractedDoc[], factura, facts).                                     │
│ - Antes de casar, mergeSameProduct suma a cada lado las líneas del mismo producto (mismo        código, o misma descripción unidad y mismo precio). La línea   │sumada guarda sus parts; si alguna parte no se leyó, la suma es null y las reglas de comparación callan, como ya hacen.                                                          │
│ - Los tres pasos de casado (código, alias, parecido) no cambian.                              │
│ - Exporta keysOf(line) (clave propia y las de sus partes) para question.ts, cases.ts y la interfaz.                                                                                   │
│                                                                                               │
│ 5. Pipeline (src/pipeline.ts)                                                                 │
│                                                                                               │
│ - Entrada { id, albaranes: string[], factura }. Un span extraer albarán N por albarán.        │
│ - Tras extraer, numera las líneas de cada albarán (A2.3) y les pone source. La caché sigue siendo por fichero.                                                                         - Span nuevo vincular entre ex                                   │
│ - CaseResult: albaranes: Extraction[] y links. Coste: suma. Latencia: el máximo de las extracciones más la pregunta.                                                                                                                                │
│ 6. Reglas (src/rules/)                                                                        │
│                                                                                               │
│ - Nuevo albaran-link.ts (señal missing-document), registrado en index.ts: un finding por cada referencia en missing ("La factura cita el albarán X y no está en el caso") y por cada albarán en uncited. Sin importe y sin evidencia: las referencias no llevan caja.            - shared.ts: evidence() devuel por parte de la línea. En las     │reglas que la usan el cambio es mecánico ([...evidence(a), ...evidence(f)]).                │
│ - line-arithmetic y unreadable-amount recorren [...albaranes, factura] en vez de [albaran,      factura], sobre las líneas o                                   │
│ - quantity-mismatch: cuando hay partes, el mensaje dice el reparto.                                                                                            │
│ 7. Decisión (src/decide/)                                                                     │
│                                                                                               │
│ - policy.ts: rama missing-document → ask / missing_document, la primera de las dudas: sin todos los papeles, lo demás no es fiable. Decisión por defecto, se anota como tal.          - options.ts: no hay botones nde más, y dar por buena).          │askWhatArrived deja de leer la evidencia por posición y usa las cantidades del par.         │
│ - question.ts: plantilla para missing_document; firmOvercharges usa keysOf.                   │
│                                                                                               │
│ 8. Lo que solo cambia de albaran a albaranes                                                  │
│                                                                                               │
│ src/cases.ts (tipo Files, addToDataset), src/testing.ts (source, refs, context acepta varios albaranes), scripts/reset.ts, evals/experiments/self-consistency.ts.                          │
│                                                                                               │
│ 9. Seed (seed/)                                                                               │
│                                                                                               │
│ - orders.ts: SeedCase gana deliveries (cómo se reparte el pedido en albaranes; cada entrega admite Tweaks, un pedido distinto u omitirse del caso) y cites ('sections' | 'list' | 'dates' | 'order'). Los casos nuevos van al final.                                          │
│ - generate.ts: un fichero por entrega (albaran-1.pdf, …). Los casos de un solo albarán siguen en albaran.pdf, con el mismo número y fecha que hoy, para no cambiar sus bytes.             │
│ - template.ts: línea "Pedido …" en cabecera, lista "Albaranes: …", "Entregas del …", y filas de sección por albarán en la factura.                                                       │
│                                                                                               │
│ Casos nuevos (esperado propuesto; el resultado lo dirá el eval):                                                                                               │
│ ┌─────────────────────────────────┬─────────────────────────────────────┬──────────────────────┐                                                                                           │
│ │              Caso               │             Qué prueba              │       Esperado       │                                                               │
│ - question.ts: plantilla para missing_document; firmOvercharges usa keysOf.                   │
│                                                                                               │
│ 8. Lo que solo cambia de albaran a albaranes                                                  │
│                                                                                               │
│ src/cases.ts (tipo Files, addToDataset), src/testing.ts (source, refs, context acepta varios albaranes), scripts/reset.ts, evals/experiments/self-consistency.ts.                          │
│                                                                                               │
│ 9. Seed (seed/)                                                                               │
│                                                                                               │
│ - orders.ts: SeedCase gana deliveries (cómo se reparte el pedido en albaranes; cada entrega admite Tweaks, un pedido distinto u omitirse del caso) y cites ('sections' | 'list' | 'dates' | 'order'). Los casos nuevos van al final.                                          │
│ - generate.ts: un fichero por entrega (albaran-1.pdf, …). Los casos de un solo albarán siguen en albaran.pdf, con el mismo número y fecha que hoy, para no cambiar sus bytes.             - template.ts: línea "Pedido …es: …", "Entregas del …", y filas  │   de sección por albarán en la                                   │
│                                                                                               │
│ Casos nuevos (esperado propuesto; el resultado lo dirá el eval):                              │
│                                                                                               ┌──────────────────────────────────────────┬──────────────────── │──┐                                                                                           │
│ │              Caso               │             Qué prueba              │       Esperado       │                                                                                            │
│ ├─────────────────────────────────┼─────────────────────────────────────┼──────────────────────┤                                                                                           │
│ │ carballo-3-albaranes            │ factura por secciones (número y     │ pass                 │                                                                                            │
│ │                                 │ fecha), 3 albaranes                 │                      │                                                                                            │
│ ├─────────────────────────────────┼─────────────────────────────────────┼──────────────────────┤                                                                                           │
│ │ carballo-3-albaranes-cantidad   │ igual; un albarán entrega menos de  │ escalate /           │                                                               │
│ │                                 │ lo facturado, más de 20 €           │ overcharge           │                                                                                            │
│ ├─────────────────────────────────┼─────────────────────────────────────┼──────────────────────┤                                                                                           │
│ │                                 │ mismo producto en 2 albaranes, una  │                      │                                                                                            │ carballo-2-albaranes-parcialsta en       │ pass                │  │                                                                                            │
│ │                                 │ cabecera                            │                      │                                                               │
│ ├─────────────────────────────────┼─────────────────────────────────────┼──────────────────── │
│ ──┤                                                              │
│ │ carballo-pedido                 │ solo código de pedido; 3 albaranes  │ pass                 │                                                                                            │
│ │                                 │ lo citan                            │                      │                                                                                            │
│ ├──────────────────────────────────────────┼──────────────────── │──┤                                                                                           │
│ │ carballo-pedido-precio          │ por pedido, con subida de precio    │ escalate /           │                                                                                            │
│ │                                 │                                     │ overcharge           │                                                                                            │
│ ├─────────────────────────────────┼─────────────────────────────────────┼──────────────────────┤                                                                                           │
│ │ carballo-albaran-no-aportado    │ la factura cita 3, el caso trae 2   │ ask /                │                                                                                            │
│ │                                 │                                     │ missing_document     │                                                                                            │
│ ├─────────────────────────────────┼─────────────────────────────────────┼──────────────────────┤                                                                                           │
│ │ carballo-albaran-de-otro-pedido │ un albarán que la factura no cita   │ ask /                │                                                                                            │
│ │                                 │                                     │ missing_document     │                                                                                            │
│ ├─────────────────────────────────┼─────────────────────────────────────┼──────────────────────┤                                                                                           │
│ │ vidal-2-albaranes-cajas         │ varios albaranes más la             │ ask sin el hecho,   │
│  │                                                               │
│ │ (holdout)                       │ equivalencia caja/kg                │ pass con él         │
│  │                                                               │
│ ├─────────────────────────────────┼─────────────────────────────────────┼──────────────────────┤                                                                                           │
│ │ rianorte-fechas                 │ cita solo por fecha; un albarán en  │ pass                 │                                                                                            │
│ │                                          │                     │  │                                                                                            │
│ └─────────────────────────────────┴─────────────────────────────────────┴──────────────────────┘                                                                                           │
│                                                                                               │
│ 10. Eval (evals/)                                                                             │
│                                                                                               │
│ - metrics.ts: resolveLines recibe líneas en vez de un documento; CaseRecord guarda cuántos albaranes tiene el caso; el coste cuenta todos los documentos.                              │
│ - run.ts y report.ts: tabla nueva "Por número de albaranes" (1, 2, 3 o más) con casos, pass/ask/escalate y acierto de decisión. La cabecera no cambia de forma.                    │
│                                                                                               │
│ 11. Interfaz (apps/web/app/)                                                                  │
│                                                                                               │
│ - casos/[id]/page.tsx: cabecera con todos los albaranes y cómo se vinculó cada uno; una figura por documento; el recorte elige fichero por Evidence.source; el mapa partner usa keysOf.                                                                                     │
│ - labels.ts: etiquetas de la señal, el motivo y el tipo de vínculo. globals.css solo si la    │
│   fila de documentos no cabe.                                    │
│                                                                                               │
│ 12. Documentación                                                │
│                                                                                               │
│ - README.md: número de casos.                                                                 │
│ - DECISIONS.md: una sección por decisión al cerrar cada fase, tres líneas, marcando las que   │
│   son por defecto. Entre ellasumar por producto, un albarán con  │1 de menos y otro con 1 de más se compensan.                                                │
│                                                                                               │
│ Orden y paradas                                                                               │
│                                                                                               │
│ Se para al final de cada fase con el cierre de cinco líneas. No se hace ningún commit.        │
│                                                                                               │
│ 1. Esquema, tipos y extracción: llamada de prueba, puntos 1, 2 y 5, y los renombrados del punto 8 para que compile.                                                                  │
│ 2. Vínculo, cruce, reglas y decisión: puntos 3, 4, 6 y 7, con sus tests.                      │
│ 3. Seed y relectura: punto 9; npm run seed -- --force; npm run eval -- --refresh en segundo plano (llama al modelo para todos los documentos); npm run reset.                          │
│ 4. Eval, interfaz y documentación: puntos 10, 11 y 12.                                        │
│                                                                                               │
│ Verificación                                                                                  │
│                                                                  │
│ - npm run typecheck y npm test al cerrar cada fase. Tests nuevos: link.test.ts; suma por producto en match.test.ts; albaran-link y cantidad con partes en rules.test.ts; la rama nueva en policy.test.ts.                                                                    │
│ - Tras npm run seed -- --force mostrar cambios en los 26 casos   │antiguos. Si los muestra, paro y lo cuento.                                                 │
│ - Regresión: comparar decisión y motivo de los 26 casos antiguos con los de evals/results/latest.json actual (se guarda una copia en el scratchpad antes de empezar).   │
│ - npm run eval: revisar fallos, líneas sin alinear y la tabla por número de albaranes. Los números del informe salen de ahí, no se escriben a mano.                                    │
│ - npm run web: abrir carballo-3-albaranes-cantidad y carballo-albaran-no-aportado y comprobar que cada recorte sale del albarán correcto y que se ve cómo se vinculó cada uno.            │
│                                                                                               │
│ Avisos                                                                                        │
│                                                                                               │
│ - npm run reset borra data/. Andidos ni correcciones en el       │dataset.                                                                                    │
│ - evals/results/demo-antes.* y demo-despues.* quedan desfasados (26 casos frente a 35). No se tocan salvo que Martín lo pi                                   │
│ - Fuera de alcance: detalle por albarán en las diferencias de cantidad, un albarán facturado en dos facturas, y aportar el albarán que falta desde la interfaz (no hay pantalla de subida).