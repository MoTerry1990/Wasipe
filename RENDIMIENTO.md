# Rendimiento de la búsqueda

Medido con **5.000 avisos publicados** repartidos en 10 distritos, 4 tipos de
inmueble, las dos monedas y precios entre US$ 60.000 y US$ 1.650.000.

Los datos los genera `tests/base-datos/rendimiento.test.ts`, que corre con
`npm run test:db`. La generación es determinista —sin azar— así que dos
corridas dan exactamente lo mismo y una regresión se puede comparar contra la
anterior.

## Dónde se midió

**PGlite**: Postgres 17 compilado a WebAssembly, en memoria, un solo proceso.

Esto importa para leer los números: **los tiempos absolutos no son los de
Supabase**. Allá hay red de por medio, disco, y varias conexiones compitiendo.
Lo que sí se traslada es el **plan que elige el planificador**, que es lo que
decide si una consulta escala o se cae cuando la tabla crece.

Por eso cada prueba comprueba dos cosas: que el plan use un índice y no un
recorrido completo de la tabla, y que el tiempo se mantenga dentro de un
techo generoso. La primera es la que vale.

## Resultados

| Consulta | Filas | Tiempo |
| --- | ---: | ---: |
| Operación + distrito, ordenado por fecha | 24 | 0,8 ms |
| Rango de precio sobre la referencia en dólares | 24 | 0,8 ms |
| Orden por precio por m² | 24 | 0,6 ms |
| Solo verificados | 24 | 0,6 ms |
| Conteo total de una búsqueda | 1 | 0,8 ms |
| Página 1 | 24 | 0,5 ms |
| Página 20 (`offset 456`) | 24 | 0,8 ms |
| Seis filtros combinados | 1 | 0,7 ms |

Todas usan `Index Scan`. Ninguna cae en `Seq Scan`.

## Por qué son rápidas

**Los índices son parciales.** Todos llevan
`where publication_status = 'published' and status = 'available'`. Con el
tiempo, los borradores, pausados y vencidos van a ser la mayoría de la tabla;
dejarlos fuera mantiene el índice chico y en memoria. Son siete, en
`supabase/migrations/20260818080000_busqueda.sql`.

**El precio se filtra sobre `price_usd`, nunca sobre `price`.** La lista mezcla
soles y dólares: comparar el número crudo devuelve disparates y además impide
usar un índice único para el rango. La columna la mantiene un trigger con el
tipo de cambio del día.

**La rebaja está en la fila, no en el historial.** `price_dropped_at` se escribe
en el mismo trigger que guarda el historial de precios. Resolver «bajaron de
precio» leyendo `price_history` obligaría a recorrerlo por cada aviso candidato:
con mil anda, con cien mil no.

**El orden viene del índice.** `properties_orden_m2_idx` está ordenado por
`price_usd_per_m2`, así que ordenar por precio por m² —el orden que diferencia
a Wasipe— no necesita un `Sort` sobre el resultado.

## Lo que hay que vigilar

**La paginación es por `offset`.** A la página 20 le cuesta 0,3 ms más que a la
primera, y eso es aceptable. Pero el costo del `offset` crece de forma lineal:
en la página 200 el motor descarta 4.776 filas antes de devolver 24. Cuando
haya volumen de verdad hay que pasar a paginación por cursor —`where
(published_at, id) < (…)`— que cuesta lo mismo en cualquier página.

La prueba «la página 20 no cuesta más que la primera» es la que va a avisar:
está escrita para fallar si la diferencia se dispara.

**El conteo exacto es lo primero que se va a poner caro.** `count(*)` recorre
todas las filas que coinciden, no solo las 24 que se muestran. Con cien mil
avisos y un filtro amplio, eso empieza a pesar. La salida habitual es un conteo
aproximado (`reltuples` o una estimación del planificador) para las búsquedas
muy amplias, y el exacto solo cuando el resultado es chico.

**Falta medir contra Supabase.** Todo esto está medido en WebAssembly. Los
planes deberían ser los mismos —es el mismo Postgres— pero eso no está
comprobado hasta correrlo contra el proyecto real. No afirmo que lo esté.

## Cómo volver a medir

```bash
npm run test:db
```

La tabla de tiempos se imprime al terminar. Si algún plan deja de usar índice,
la prueba correspondiente falla con el plan completo en el mensaje.
