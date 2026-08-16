# Rendimiento

Dos mediciones distintas, que responden preguntas distintas y no conviene
mezclar:

- **La base de datos** (sprint 6): cuánto tarda Postgres en resolver una
  búsqueda con 5.000 avisos, y qué plan elige. Medido en PGlite.
- **El navegador** (sprint 16): cuántos bytes hay que traer para ver una
  pantalla y en cuánto tiempo, más la revisión de accesibilidad. Medido
  con Playwright sobre la compilación de producción.

---

## La base de datos

Medido con **5.000 avisos publicados** repartidos en 10 distritos, 4 tipos de
inmueble, las dos monedas y precios entre US$ 60.000 y US$ 1.650.000.

Los datos los genera `tests/base-datos/rendimiento.test.ts`, que corre con
`npm run test:db`. La generación es determinista —sin azar— así que dos
corridas dan exactamente lo mismo y una regresión se puede comparar contra la
anterior.

### Dónde se midió

**PGlite**: Postgres 17 compilado a WebAssembly, en memoria, un solo proceso.

Esto importa para leer los números: **los tiempos absolutos no son los de
Supabase**. Allá hay red de por medio, disco, y varias conexiones compitiendo.
Lo que sí se traslada es el **plan que elige el planificador**, que es lo que
decide si una consulta escala o se cae cuando la tabla crece.

Por eso cada prueba comprueba dos cosas: que el plan use un índice y no un
recorrido completo de la tabla, y que el tiempo se mantenga dentro de un
techo generoso. La primera es la que vale.

### Resultados

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

### Por qué son rápidas

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

### Lo que hay que vigilar

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

### Cómo volver a medir

```bash
npm run test:db
```

La tabla de tiempos se imprime al terminar. Si algún plan deja de usar índice,
la prueba correspondiente falla con el plan completo en el mensaje.

---

## El navegador

Medido el **16 de agosto de 2026**, sobre la compilación de producción
(`next build` + `next start`), con `scripts/medir-rendimiento.mjs`.

---

### Antes de leer los números: qué NO son

**No hay proyecto de Supabase.** Todas las pantallas se miden con la base
sin conectar, así que se dibujan sus estados vacíos. Los números de abajo
son el peso del armazón —marco, tipografías, estilos, JavaScript de la
interfaz—, no el de una página cargada de avisos y fotos.

Eso los hace útiles para una cosa y no para otra:

- **Sirven** para comparar entre sprints: el armazón es lo que cambia
  cuando se toca una fuente, un paquete o un componente de cliente.
- **No sirven** como pronóstico de lo que va a ver una persona. Cuando
  haya avisos, la portada va a traer veinte fotos, y las fotos van a
  dominar el LCP muy por encima de todo lo que aparece acá.

Tampoco son Core Web Vitals de campo. El CWV real se mide con visitas
reales durante 28 días; esto es un laboratorio con un solo equipo, sin
red simulada, contra `localhost`. Los TTFB de un dígito no se van a
repetir en Netlify.

---

### Móvil (390 × 844, CPU ×4)

| Pantalla | Peticiones | Total | JS | CSS | Fuentes | TTFB | FCP | LCP |
|---|---|---|---|---|---|---|---|---|
| Portada | 25 | 863.7 KB | 496.3 KB | 53.8 KB | 100.1 KB | 191 ms | 484 ms | 484 ms |
| Búsqueda | 24 | 1074.5 KB | 803.1 KB | 53.8 KB | 100.1 KB | 36 ms | 228 ms | 228 ms |
| Landing | 22 | 1086.5 KB | 803.1 KB | 53.8 KB | 100.1 KB | 17 ms | 264 ms | 264 ms |
| Precio por m² | 20 | 697.0 KB | 471.8 KB | 53.8 KB | 69.5 KB | 15 ms | 220 ms | 220 ms |
| Todas las búsquedas | 15 | 931.4 KB | 471.8 KB | 53.8 KB | 69.5 KB | 11 ms | 276 ms | 276 ms |

### Escritorio (1440 × 900, CPU ×1)

| Pantalla | Peticiones | Total | JS | CSS | Fuentes | TTFB | FCP | LCP |
|---|---|---|---|---|---|---|---|---|
| Portada | 38 | 911.7 KB | 496.3 KB | 53.8 KB | 100.1 KB | 13 ms | 132 ms | 132 ms |
| Búsqueda | 40 | 1128.9 KB | 803.1 KB | 53.8 KB | 100.1 KB | 10 ms | 116 ms | 116 ms |
| Landing | 53 | 1144.0 KB | 803.1 KB | 53.8 KB | 100.1 KB | 12 ms | 128 ms | 128 ms |
| Precio por m² | 38 | 745.9 KB | 471.8 KB | 53.8 KB | 69.5 KB | 8 ms | 92 ms | 92 ms |
| Todas las búsquedas | 37 | 1005.0 KB | 471.8 KB | 53.8 KB | 69.5 KB | 8 ms | 128 ms | 128 ms |

Escritorio pide **más** peticiones que móvil, y eso es correcto: hay más
enlaces en pantalla y Next precarga el contenido de cada uno que ve.

---

### Lo que se cambió, y qué dio cada cosa

#### Precarga en «Todas las búsquedas» — sí funcionó

De **43 a 15** peticiones en móvil y de **102 a 37** en escritorio.

La página tiene varios cientos de enlaces y Next pedía por adelantado el
contenido de cada uno que entraba en pantalla. Precargar tiene sentido
cuando hay tres destinos probables, no trescientos. `prefetch={false}`.

#### Fuentes — salió al revés de lo previsto

Se probó pedirlas como fuentes variables (omitiendo `weight`) para bajar
la cantidad de archivos. Medido con dos compilaciones limpias:

| | Archivos | Peso |
|---|---|---|
| Pesos fijos (lo que había) | 11 | **196 KB** |
| Variables | 11 | 212 KB |

Un archivo variable trae todos los pesos intermedios que nadie usa. Se
volvió a los pesos fijos y quedó escrito en `app/layout.tsx` para que
nadie lo intente de nuevo creyendo que mejora.

Lo que sí quedó: **la mono no se precarga**. Solo aparece en cifras y
códigos, debajo del primer pantallazo. Las precargas de fuente en la ruta
crítica bajaron de 3 a 2.

#### El mapa cargado bajo demanda — hecho, sin efecto comprobable

`MapaResultados` pasó a `next/dynamic` con `ssr: false`. La vista por
defecto es la lista y la mayoría nunca abre el mapa, así que su código no
tiene por qué viajar en toda búsqueda.

**No se pudo comprobar el efecto.** Sin base de datos ninguna búsqueda
devuelve resultados, así que `VistaResultados` no se dibuja nunca y la
rama del mapa tampoco. `/comprar` y `/comprar?vista=mapa` piden exactamente
los mismos 12 archivos y 803.1 KB. El corte es correcto por construcción
—el chunk está separado— pero queda sin medir hasta que haya avisos.

Esos 803 KB de la búsqueda contra 471 KB del resto son la deuda más
grande que deja este sprint. Hay que volver cuando haya datos.

#### Imágenes

- `qualities: [72, 85]` y nada más. Cada combinación de tamaño y calidad
  es una imagen que hay que generar y guardar; con la lista abierta, una
  dirección con `?q=73` obliga a rehacer el trabajo entero.
- `deviceSizes` recortado a los seis anchos que el diseño usa de verdad
  (Next trae ocho por defecto).
- `minimumCacheTTL` de 30 días: cuando se reemplaza una foto cambia la
  dirección, así que no hay nada que invalidar.

#### Consultas y caché

- `tipoDeCambio()` envuelto en `cache()` de React. En una misma página lo
  piden la lista, el panel de filtros y la ficha: eran tres consultas
  idénticas por visita.
- `contarAvisos()` también, y hace `head: true` —no trae ni una fila—.
- `/precio-m2` pasó de `force-dynamic` a `revalidate = 3600`. El índice se
  recalcula como mucho una vez al día; servirla de nuevo en cada petición
  era pagar una consulta agregada para devolver lo mismo.
- El sitemap se regenera cada 6 horas en vez de en cada visita de un
  robot, y sus cuatro consultas van en paralelo.

---

### Accesibilidad

Medida con **axe-core** sobre las once pantallas públicas, en móvil y
escritorio, más pruebas de teclado escritas a mano. `tests/e2e/accesibilidad.spec.ts`,
44 pruebas.

El criterio del sprint es «ninguna violación crítica». Acá se exige más:
**ninguna crítica y ninguna seria**. Las dos categorías significan que
alguien no puede usar la página, no que le cueste.

#### Resultado

**0 violaciones críticas, 0 serias** en las once pantallas.

#### Lo que había que arreglar

Todo lo que encontró axe fue **contraste**, y salía de tres tokens de
color:

| Token | Antes | Contraste | Ahora | Contraste |
|---|---|---|---|---|
| `--color-tinta-45` | `#6f7f8c` | 3.81 : 1 | `#5b6973` | **5.22 : 1** |
| `--color-tinta-40` | `#8494a1` | 3.11 : 1 | `#627280` | **4.57 : 1** |
| `--color-fucsia` | `#e11d74` | 4.19 : 1 | `#d51b6e` | **4.60 : 1** |

(Medido sobre niebla `#f4f6f8`, que es el fondo más claro con texto
encima. El mínimo AA es 4.5 : 1.)

El tono es el mismo y se ven casi igual, pero ahora los lee alguien con la
vista cansada y a pleno sol, que es como se mira un portal inmobiliario
desde el celular en la calle.

Quedaba un caso más: fucsia sobre fucsia suave daba 4.35 : 1 en los sellos
y en los estados vacíos. Ahí el texto pasó a `fucsia-osc`.

#### Otros dos defectos encontrados

- **Dos `h1` en `/precio-m2`.** `EnConstruccion` traía su propio `h1` y la
  página ya tenía el suyo. Dos `h1` dejan a quien navega por encabezados
  sin saber de qué trata la página. Bajó a `h2`; las cuatro pantallas que
  lo usan ya tienen su encabezado principal.
- **`id` fijo en el modal.** `aria-labelledby="titulo-modal"` estaba
  escrito a mano, así que dos modales montados a la vez dejaban dos
  elementos con el mismo `id` y el lector de pantalla anunciaba el título
  del otro. Ahora usa `useId()`.

#### Lo que ya estaba bien

- «Saltar al contenido» es el primer elemento del recorrido y funciona.
- Foco visible en todo: contorno fucsia de 3 px con separación.
- `prefers-reduced-motion: reduce` deja todas las transiciones en 0.01 ms.
  Comprobado leyendo `transitionDuration` de cada enlace y botón, tramo
  por tramo.
- Los modales usan `<dialog>` nativo, así que el foco atrapado, el cierre
  con Escape y la capa superior los resuelve el navegador. Reimplementar
  eso a mano es donde se rompe la accesibilidad.
- Ninguna imagen sin `alt`.
- Nada obliga a desplazarse en horizontal en 390 px.

#### Lo que una herramienta automática no ve

axe-core no encuentra todo, y ninguna lo hace. Queda sin comprobar:

- Que los textos alternativos **digan algo útil**. Que exista el atributo
  se comprueba; que diga «Fachada del edificio desde la avenida» y no
  «imagen1» no lo puede juzgar una máquina.
- El recorrido completo con un lector de pantalla real (NVDA, VoiceOver).
- Si el orden de tabulación tiene sentido, más allá de que sea alcanzable.
- Si los mensajes de error de los formularios se entienden.

---

### Qué falta

- **Volver a medir con datos.** Todo lo de arriba es el armazón. Con
  avisos y fotos, el LCP lo va a decidir la imagen de portada, y ahí
  entran `priority`, `sizes` y el formato — que están puestos, pero sin
  comprobar.
- **Los 803 KB de la búsqueda.** Es la cifra más alta y no se pudo
  desarmar sin resultados que renderizar.
- **Core Web Vitals de campo.** Necesita el sitio en línea y 28 días de
  visitas. Hasta entonces cualquier número de CWV que se diga es de
  laboratorio, y hay que decirlo cada vez.
- **Cómo repetir la medición**, cuando exista un despliegue:

```bash
npm run build && npx next start --port 3100
```

```bash
node scripts/medir-rendimiento.mjs
```
