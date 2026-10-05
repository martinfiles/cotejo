# Informe del eval

Ejecutado el 2026-10-05T09:17:32.069Z, llamando al modelo para lo que faltaba en caché.

Dataset: 26 casos del seed (4 holdout y 2 en la frontera del umbral) y 1 de correcciones a mano. Hechos aprendidos vigentes: 0.

**Esto son señales, no estadística.** Son casos sintéticos y pocos, y el esperado lo escribió el mismo generador que los documentos: un acierto alto dice que el sistema coincide con mis supuestos, no con la realidad. Cada regla se mide sobre el número de casos que aparece en su tabla.

## Cabecera: casos resueltos solos

Lo que mejora al aprender es la autonomía, no la corrección. El acierto de decisión tiene que ser alto en los dos estados: sin un hecho, preguntar es la respuesta correcta.

| Estado | Resueltos solos (pass) | Preguntados (ask) | Escalados | Acierto de decisión | Acierto de motivo |
|---|---|---|---|---|---|
| Sin hechos aprendidos | 25 % (6 de 24) | 54.2 % (13 de 24) | 20.8 % (5 de 24) | 100 % (24 de 24) | 100 % (24 de 24) |
| Con los hechos aprendidos hasta ahora | 25 % (6 de 24) | 54.2 % (13 de 24) | 20.8 % (5 de 24) | 100 % (24 de 24) | 100 % (24 de 24) |

Techo de autonomía en este dataset: 41.7 % (10 de 24) de los casos pasarían solos si se supiera todo lo que necesitan.

No hay hechos aprendidos: los dos estados coinciden.

Excluye los casos de frontera y las correcciones, que van aparte.

## Holdout: casos que nadie ha corregido a mano

Comparten proveedor y problema con los casos que se resuelven en la demo. La mejora aquí es el único número que demuestra que lo aprendido generaliza.

| Estado | Resueltos solos | Escalados | Acierto de decisión |
|---|---|---|---|
| Sin hechos aprendidos | 0 % (0 de 4) | 0 % (0 de 4) | 100 % (4 de 4) |
| Con los hechos aprendidos hasta ahora | 0 % (0 de 4) | 0 % (0 de 4) | 100 % (4 de 4) |

Un holdout que pasa a escalado no es un fallo: es una discrepancia real que solo se veía sabiendo el hecho.

## Precisión y recall por regla

Un finding cuenta como acierto si coinciden la regla y el producto. "Esperados" es el número de veces que la regla debía saltar: con tan pocos, un solo fallo mueve mucho el porcentaje.

### Sin hechos aprendidos

| Regla | Esperados | Aciertos | Falsos positivos | No detectados | Precisión | Recall |
|---|---|---|---|---|---|---|
| line-arithmetic | 1 | 1 | 0 | 0 | 100 % | 100 % |
| missing-line | 5 | 5 | 0 | 0 | 100 % | 100 % |
| quantity-mismatch | 3 | 3 | 0 | 0 | 100 % | 100 % |
| total-mismatch | 1 | 1 | 0 | 0 | 100 % | 100 % |
| unit-incompatible | 3 | 3 | 0 | 0 | 100 % | 100 % |
| unit-price-mismatch | 3 | 3 | 0 | 0 | 100 % | 100 % |
| unreadable-amount | 2 | 2 | 0 | 0 | 100 % | 100 % |
| vat-inconsistent | 1 | 1 | 0 | 0 | 100 % | 100 % |

## Alineamiento de líneas

Líneas esperadas que el resolvedor del eval no pudo asignar a ninguna línea extraída: 0.

## Casos que fallan

### Sin hechos aprendidos

Ninguno.

## Frontera del umbral

Fuera de la cabecera. Muestran qué pasa justo alrededor del umbral de escalado.

| Caso | Estado | | Esperado | Obtenido | Coincide |
|---|---|---|---|---|---|
| carballo-frontera-bajo | sin-hechos |  | ask minor_discrepancy | ask minor_discrepancy | sí |
| carballo-frontera-sobre | sin-hechos |  | escalate overcharge | escalate overcharge | sí |
| carballo-frontera-bajo | con-hechos |  | ask minor_discrepancy | ask minor_discrepancy | sí |
| carballo-frontera-sobre | con-hechos |  | escalate overcharge | escalate overcharge | sí |

## Correcciones a mano

Fuera de la cabecera: son etiquetas puestas por una persona al responder, más ruidosas que las del seed. Solo las que enseñan un hecho cambian el comportamiento del pipeline.

| Caso | Estado | Respuesta | Esperado | Obtenido | Coincide |
|---|---|---|---|---|---|
| correccion-carballo-precio | sin-hechos | claim | escalate  | escalate overcharge | sí |
| correccion-carballo-precio | con-hechos | claim | escalate  | escalate overcharge | sí |

## Coste y latencia

Lo que costó y tardó cada llamada al modelo cuando se hizo, aunque hoy venga de caché (100 % (54 de 54) de los documentos en esta ejecución).

| Documento | Documentos | Modelo | Coste medio | Latencia media | Latencia p95 |
|---|---|---|---|---|---|
| albaran | 27 | claude-sonnet-5-5 | 0.0196 USD | 6.6 s | 9.0 s |
| factura | 27 | claude-sonnet-5-5 | 0.0190 USD | 6.7 s | 8.9 s |

- Coste medio por documento: 0.0193 USD
- Coste medio por caso, con la pregunta: 0.0388 USD
- Coste de redactar las preguntas, en total: 0.0072 USD
- Coste total del dataset: 1.0488 USD
- Latencia p95 por documento: 8.9 s; por caso: 9.9 s
