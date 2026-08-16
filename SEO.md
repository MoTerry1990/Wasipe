# SEO

Qué se indexa, qué no, y por qué. La decisión de fondo de este sprint es
una sola y de ella sale todo lo demás: **se indexa poco y a propósito**.

Un portal inmobiliario genera millones de direcciones válidas —seis tipos
por doscientos distritos por veinte rangos de precio por cinco
ordenamientos— y casi todas devuelven lo mismo o casi nada. Dejarlas
entrar al índice no trae tráfico: reparte la autoridad del dominio entre
miles de páginas flacas y hunde las pocas que valen.

---

## 1. La regla, en un solo archivo

`lib/seo/indexable.ts` es el único lugar donde se decide. El sitemap, los
metadatos y las pruebas leen de ahí, así que no pueden discrepar.

Una dirección entra al índice si cumple **las cuatro**:

1. No lleva filtros de detalle. Solo tipo y lugar.
2. Es la primera página.
3. No cambia nada de presentación (orden, vista, moneda).
4. Tiene al menos **3 avisos** detrás.

| Motivo | Qué lo dispara |
|---|---|
| `filtros-de-detalle` | precio, dormitorios, baños, área, antigüedad, amoblado, mascotas, verificados, rebajados, nuevos |
| `pagina-interior` | `?pagina=2` en adelante |
| `presentacion` | `?orden=`, `?vista=`, `?moneda=` |
| `poco-contenido` | menos de 3 avisos |
| `sin-conexion` | la base no respondió, así que no sabemos qué hay |

**`follow` se mantiene siempre.** Una página de filtros no merece estar en
el índice, pero los enlaces que tiene adentro llevan a fichas que sí, y
cortarlos dejaría avisos huérfanos.

### La excepción: las páginas troncales

`/comprar` y `/alquilar` sin nada más se indexan **pase lo que pase**,
incluso si la base no responde. Son navegación del sitio, no una
combinación generada. Sacarlas del índice por un mal minuto de la base
costaría semanas de recuperación.

### Dónde se cuenta

`generateMetadata()` corre antes que la página y no puede ver su
resultado, así que el conteo va aparte: `contarAvisos()` hace un
`head: true` que no trae ni una fila y lo envuelve `cache()` de React,
para que la página reciba el mismo número sin volver a preguntar.

Y solo se cuenta cuando la página **podría** indexarse. Preguntarle a la
base por una búsqueda de siete filtros que va a quedar fuera igual es una
consulta regalada en cada visita de un robot.

---

## 2. Las canónicas

La regla: **una landing canoniza a su ruta bonita**, nunca a la de
parámetros.

```
/comprar?tipo=departamento&donde=miraflores
        ↓ canonical
/comprar/departamento/miraflores
```

Esto era un defecto real hasta este sprint: la canónica se declaraba en la
forma de parámetros, que es la misma página con otra dirección, o sea
justo lo que una canónica existe para evitar.

El segundo defecto era peor. Cualquier filtro sacaba la página del
índice, y como el segmento `/miraflores` **es** un filtro, las landings
que el sprint pide indexar estaban todas en `noindex`.

Detalle que costó encontrar: `leerSegmentos()` deduce la provincia y el
departamento a partir del distrito, para poder consultar. No los pidió
nadie. Tratarlos como filtros propios hacía que la landing volviera a caer
en la rama de parámetros.

Las pestañas de `/precio-m2/[distrito]` (operación × período = seis
direcciones con el mismo tema) canonizan todas a la versión limpia.

---

## 3. Las landings

Se generan, no se escriben a mano: `lib/seo/landings.ts`. Escritas a mano
quedarían desfasadas el día que se agregue un distrito, y nadie lo notaría
hasta que un enlace del sitemap devolviera 404.

Tres familias, de lo general a lo específico:

1. Operación + tipo — «Departamentos en venta»
2. Operación + distrito — «Propiedades en alquiler en Barranco»
3. Operación + tipo + distrito — «Departamentos en venta en Miraflores»

**Qué no se cruza.** Seis tipos × 34 distritos × 2 operaciones da más de
cuatrocientas páginas, casi todas vacías. Solo entran los cuatro tipos que
la gente busca por nombre (departamento, casa, terreno, oficina): «cocheras
en alquiler en Végueta» no la escribe nadie y no tiene qué mostrar. Los
proyectos tampoco generan landings, porque se buscan por el nombre del
proyecto.

Las cuatro que nombra el sprint existen y responden 200:

- `/comprar/departamento/miraflores`
- `/alquilar/departamento/jesus-maria`
- `/comprar/casa`
- `/precio-m2/san-isidro`

**`/busquedas`** las enlista todas. Sin esa página serían huérfanas: el
sitemap dice «esta página existe», pero un enlace desde una página real
dice «esta página importa», y sin ningún enlace interno la primera
afirmación vale poco. Además, cada landing enlaza a sus hermanas —otros
tipos en el mismo distrito, el mismo tipo en otros distritos—, que es lo
que de verdad busca quien está mirando departamentos en Miraflores.

---

## 4. El sitemap

Un solo criterio: **si está acá, la dirección existe, responde 200 y tiene
contenido**. Un sitemap con enlaces muertos o páginas vacías no es un
sitemap incompleto; es una señal activa de descuido, y Google la usa.

Por eso **no** está `/publicar` —es un formulario, no contenido— ni
`/comparar` —cada combinación de cuatro avisos es una dirección distinta y
ninguna es contenido— ni ninguna landing con menos de tres avisos.

Contenido: rutas fijas, landings con avisos, distritos con índice de
precio, fichas publicadas (tope 5.000) e inmobiliarias activas. Se
regenera cada 6 horas.

**Cuando la base no responde queda el esqueleto fijo.** Es corto, pero
cada línea es verdad, que es lo único que un sitemap tiene que ser.

El conteo de las landings lo hace Postgres, no JavaScript:
`conteo_de_landings()` usa `grouping sets` para devolver los tres cortes
en una sola pasada. Pedir trescientos conteos por HTTP es inaceptable, y
traerse todos los avisos para contarlos en el servidor deja de funcionar
el día que haya cincuenta mil. Es `security invoker` y además filtra por
estado, así que un borrador nunca engorda el conteo de su distrito.

---

## 5. robots.txt

Hay que no confundir dos cosas:

- **`Disallow`** impide **rastrear**. Una página bloqueada así puede
  seguir apareciendo en resultados si alguien la enlaza, porque el robot
  nunca entra a leer el `noindex`.
- **`noindex`** impide **indexar**, y para eso el robot tiene que poder
  entrar.

De ahí que la lista de bloqueos sea corta: solo lo privado (`/panel`,
`/ingresar`, `/auth`, `/api`), `/comparar`, y los parámetros de pura
presentación. Las búsquedas con filtros **no** se bloquean: se dejan
rastrear para que se lea su `noindex` y para que los enlaces a las fichas
se sigan.

---

## 6. Datos estructurados

Una regla sin excepción: **acá no se afirma nada que la página no
muestre**. Un `aggregateRating` inventado o un precio que no es el que ve
la persona son motivo de penalización manual, y con razón. Una prueba
recorre todas las páginas y falla si aparece una calificación, porque
nadie calificó nada todavía.

| Página | Qué declara |
|---|---|
| Portada | `Organization` + `WebSite` con `SearchAction` |
| Búsqueda y landings | `ItemList` + `BreadcrumbList` |
| Ficha | `RealEstateListing` con precio, área y fotos + `BreadcrumbList` |
| Inmobiliaria | `RealEstateAgent` + `ItemList` |
| Precio por m² | `Dataset` con muestra y fecha |

El `ItemList` lleva **solo las direcciones**, sin repetir precio ni área:
cada ficha ya los declara, y duplicarlos abre la puerta a que los dos
números se contradigan cuando alguien edite su aviso.

El `Dataset` del índice de precio es `Dataset` y no `Product` porque es
una estadística, no algo que se venda, y declara su muestra y su fecha
porque una cifra de mercado sin eso no se puede evaluar.

Las migas se dibujan y se declaran desde **la misma lista**
(`components/ui/migas.tsx`). Son dos cosas que tienen que decir lo mismo, y
tenerlas en archivos distintos garantiza que algún día no lo digan.

---

## 7. Compartir

En el Perú los avisos se pasan por WhatsApp, no por Twitter. Ahí se ve una
imagen y una línea de texto, así que la imagen dice qué es, dónde y
cuánto. Un logo bonito no sirve en ese momento.

- **Ficha**: `opengraph-image.tsx` con el precio y el precio por m².
- **Landings**: `/og/busqueda?tipo=&lugar=&op=` con la cantidad de avisos.
  Va como ruta con parámetros y no como archivo de imagen porque las
  landings viven bajo un segmento comodín, y Next no admite un
  `opengraph-image.tsx` ahí adentro.

Cada landing tiene su **propia descripción**, no una plantilla con el
título metido dentro: doscientas páginas con la misma frase son
doscientas páginas que Google lee como la misma.

---

## 8. El 404

Responde **404 de verdad**. Una página de «no existe» que responde 200 le
enseña a Google que el sitio tiene miles de páginas idénticas, y es de los
errores más caros que puede tener un portal.

En un portal inmobiliario el 404 más común es un aviso que ya se vendió, y
quien llega ahí sigue buscando departamento. Por eso lleva las búsquedas
más usadas y un enlace a `/busquedas`, no un «volver al inicio» a secas.

---

## 9. Qué falta

- **Nada de esto se ha verificado contra Google.** No hay Search Console
  porque no hay dominio propio ni proyecto de Supabase. Las pruebas
  comprueban que el HTML dice lo que tiene que decir; que Google lo
  interprete como esperamos es otra cosa, y se sabrá recién cuando el
  sitio esté en línea.
- **El validador de datos estructurados no se corrió** contra la
  herramienta de Google, por lo mismo. Lo que sí está probado es que todo
  nodo es JSON válido, declara `@context` y `@type`, y no afirma nada
  falso.
- **`hreflang` no existe** y no debería por ahora: Wasipe es solo para el
  Perú y solo en castellano. El día que haya inglés, va acá.
- **Sin partición del sitemap.** Al pasar de 50.000 direcciones hay que
  partirlo en varios archivos con un índice. El tope de 5.000 fichas está
  escrito para que ese día el archivo no se corte solo por donde caiga.
