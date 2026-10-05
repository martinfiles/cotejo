# cotejo

Concilia el albarán y la factura de un mismo pedido y decide, por caso, si pasa solo, si hay que preguntar a una persona o si hay que escalar. Las decisiones de diseño, con su porqué, están en `DECISIONS.md`.

## Arrancar

Hace falta Node 22 o superior.

```bash
npm install
npm run reset   # deja la demo en su punto de partida: 26 casos sin resolver, nada aprendido
npm run web     # interfaz en http://localhost:3000
```

Las extracciones y las preguntas del seed están en `cache/`, así que `reset`, `eval` y la interfaz sobre esos casos no llaman al modelo. Para documentos nuevos y para enviar trazas a Langfuse hace falta un `.env` en la raíz con `ANTHROPIC_API_KEY`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` y `LANGFUSE_BASE_URL`.

## Otros comandos

```bash
npm test                          # tests de cruce, reglas, política y pregunta
npm run eval                      # eval desde caché; informe en evals/results/latest.md
npm run eval -- --refresh         # llama al modelo para lo que falte en caché
npm run seed -- --force           # regenera los documentos sintéticos (necesita: npx playwright install chromium)
npm run experiment:consistency    # segunda lectura de los 52 documentos (cuesta alrededor de 1 USD)
```
