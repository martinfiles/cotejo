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