Vamos a construir un proyecto para una entrevista técnica. Lee todo antes de escribir nada.

## Contexto
Soy ingeniero de IA. Presento este proyecto a haddock (YC W22), el back-office con IA
para restaurantes. Su stack es TypeScript, mastra, Langfuse, Postgres, GCP. La entrevista
tiene cuatro fases: presentación, demo en vivo, revisión de código conmigo explicando
decisiones, y un reto de live-coding de 40-60 minutos.

## El proyecto: "cotejo"
Conciliación de albarán contra factura de proveedor, con decisión explícita de cuándo
preguntar en vez de adivinar.

Flujo: subo el albarán y la factura de un mismo pedido → se extraen las líneas con
confianza por campo → se cruzan las líneas entre ambos documentos → se detectan
discrepancias → el sistema decide una de tres cosas por documento:
- `pass`: todo cuadra, no molesta a nadie
- `ask`: hay algo que no puede resolver solo y formula una pregunta concreta al humano
- `escalate`: discrepancia grave que necesita intervención

La tesis del proyecto, y quiero que el código la refleje: extraer campos de un PDF es la
parte fácil; lo difícil es decidir a quién creer cuando dos documentos se contradicen, y
saber cuándo callarse y preguntar.

## Arquitectura que quiero
Pocos ficheros y responsabilidades claras:

/src/extract     Extracción con modelo de visión. Salida con esquema validado (zod),
                 confianza por campo y posición del dato en la imagen.
                 Caché en disco por hash del fichero: no se vuelve a llamar al modelo.
/src/match       Cruce de líneas entre los dos documentos. Determinista: nada de LLM aquí.
                 Devuelve pares, líneas solo en albarán, líneas solo en factura.
/src/rules       UNA REGLA POR FICHERO + index.ts que las registra.
                 Contrato: { id, severity, description, check(ctx) => Finding[] }
                 Reglas iniciales: cantidad distinta, precio unitario distinto,
                 unidad incompatible (kg vs caja), línea ausente, total que no suma,
                 IVA incoherente.
/src/decide      La política de enrutado pass/ask/escalate. Los umbrales en UN fichero
                 de configuración, no esparcidos por el código.
                 El texto de la pregunta al humano lo redacta el modelo, a partir de los
                 findings. Esa es la parte de IA que de verdad importa.
/src/obs         Envoltorio fino de Langfuse. Una traza por documento procesado, spans
                 por etapa, generations con modelo/tokens/coste, tags por proveedor y
                 tipo de documento.
/evals           dataset.jsonl con pares de documentos y findings esperados + runner +
                 informe. Métricas: precisión y recall por regla, % de pass automático,
                 % de ask, % de escalate, coste por documento, latencia p95.
/seed            Generador de documentos sintéticos: HTML a PDF, con casos limpios y
                 casos sucios sembrados a propósito (precio cambiado, unidad distinta,
                 línea que falta, sello encima de un importe, foto torcida).
/apps/web        Frontend. Next.js, simple y limpio, sin librería de componentes pesada.

## Frontend, lo mínimo imprescindible
- Subir los dos documentos y ver el resultado
- Vista comparada: líneas del albarán y de la factura, con las discrepancias marcadas
  y el recorte de la imagen de donde sale cada dato en disputa
- La decisión visible (pass/ask/escalate) y, si es `ask`, la pregunta al humano con
  botones de resolución
- Cola de revisión con lo pendiente
- Una pantalla de métricas que lea los resultados del último eval

## El bucle que cierra el proyecto
Cuando yo corrijo algo en la interfaz, eso tiene que: escribirse como score en Langfuse
y añadirse como caso al dataset de evals. Quiero poder demostrar en la demo que corregir
a mano mejora el eval. Es el núcleo de la presentación.

## Cómo quiero que trabajes
- **Fase 0: no escribas código todavía.** Proponme el plan: ficheros, contratos de tipos,
  qué librerías y por qué, y qué vas a dejar fuera a propósito. Espera mi OK.
- Después, por fases, parando al final de cada una. Orden: seed y tipos → extracción con
  caché → matching → reglas → decisión → observabilidad → evals → frontend.
- Al cerrar cada fase dime en cinco líneas qué has hecho y, sobre todo: **si quisiera
  cambiar X, qué fichero toco**. Eso es lo que necesito memorizar para el live-coding.

## DECISIONS.md
- Créalo desde la Fase 0 y mantenlo actualizado al cerrar cada fase.
- Formato: una sección por decisión, y cada sección con tres líneas como máximo: qué
  decidí, qué alternativa descarté y por qué. Nada de prosa larga.
- Escríbelo como BORRADOR, en lenguaje llano y factual, solo con decisiones que de verdad
  hayamos tomado en el proyecto. No inventes motivaciones que no hayan salido en nuestra
  conversación: si una decisión la tomaste tú por defecto, dilo así, para que yo pueda
  confirmarla o cambiarla.
- Marca arriba del fichero que es un borrador pendiente de que yo lo reescriba.
- Cuando yo reescriba una sección, no la vuelvas a tocar.

## Lo que NO quiero, y me importa mucho
- Nada de abstracciones por si acaso: ni factories, ni capas de servicio vacías, ni
  interfaces con una sola implementación. Si hay duda, lo simple.
- Nada de comentarios que expliquen lo obvio. Comenta solo decisiones no evidentes
  y el por qué, nunca el qué.
- Nada de ficheros de relleno: ni README genérico de 300 líneas, ni código muerto,
  ni utilidades que nadie llama, ni manejo de errores copiado en todas partes.
- Nada de dependencias que no hagan falta.
- No inventes números ni resultados en ningún sitio. Si hace falta una cifra, la saca
  el eval al ejecutarse.

Empieza por la Fase 0.