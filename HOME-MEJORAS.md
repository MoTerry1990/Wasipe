# Wasipe — Mejoras al home

Revisión de `public/index.html` (660 líneas). Solo ajustes puntuales: nada de rediseño, misma estructura, mismas secciones, mismo skyline.

---

## Lo que ya está bien y no hay que tocar

Antes de proponer cambios, vale marcar lo que funciona, porque es más de lo que parece:

- **El skyline de Lima dibujado a mano.** Parapentes, faro de la Marina, palmeras del malecón, la Costa Verde. Es identidad propia, no se parece a Urbania ni a Adondevivir, y ningún competidor lo puede copiar sin que se note. **No tocar.**
- **La paleta y la tipografía.** Fucsia + turquesa sobre tinta, con Bricolage Grotesque. Distintivo y coherente.
- **La sección del Índice con el candado.** El "efecto persiana" con los precios tapados y una fila abierta es un buen gancho visual para registro.
- **El estado vacío de la grilla** ("Sé el primero en publicar"). Bien resuelto para un portal que recién abre.
- **La estructura de secciones.** El orden tiene lógica y no hay nada de más.

El problema del home no es el diseño. Es que **la propuesta de valor diferenciada está escrita en el footer, a 13.5 px**, y el titular dice casi lo mismo que la competencia.

---

## 1. Correcciones obligatorias

### 1.1 · Bloque de script duplicado — líneas 633-650

Hay un copy-paste que quedó a medias dentro del handler de las pestañas:

```js
document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{
  const OPS = {...};                                    // ← duplicado
  const TPS = {...};                                    // ← duplicado
  document.getElementById('busca-hero').addEventListener('submit', ...);  // ← BUG
  document.querySelectorAll('.tab').forEach(x=>x.setAttribute('aria-selected',String(x===t)));
}));
```

**Cada clic en una pestaña registra otro listener de `submit`.** Tras cinco clics, el formulario dispara cinco navegaciones. Reemplazar todo el bloque por:

```js
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(x => x.setAttribute('aria-selected', String(x === t)));
}));
```

### 1.2 · El reclamo de "43 distritos" — líneas 455 y 469

El home promete 43 distritos; el código tiene 16 (`panel.html:157`) y 17 (`buscar.html:167`). Es publicidad no sustentada. Corregir el número al real hasta sembrar los datos.

### 1.3 · Enlaces muertos en el footer — línea 554

`Términos · Privacidad · Libro de reclamaciones` no llevan a ningún lado. El **Libro de Reclamaciones es obligatorio en Perú** y un enlace roto ahí es peor que no tenerlo: quien lo busca es justamente alguien con un problema.

---

## 2. Mensajes

### 2.1 · El titular — línea 226

```
Actual:    Encuentra tu próximo hogar en el Perú
```

Es prácticamente la línea de Urbania. Cualquier portal del mundo puede firmarla. Y mientras tanto, la frase que sí es tuya está enterrada en el footer (línea 540):

> *"El portal inmobiliario peruano donde ves el precio antes de preguntar."*

Esa es la posición. Hay que subirla al titular.

```html
<!-- línea 226-227 -->
<h1>Encuentra tu próximo hogar sabiendo cuánto vale</h1>
<p>Departamentos, casas y terrenos en todo el Perú. Con precio a la vista
   y el valor por m² de cada distrito.</p>
```

Dice qué es el sitio **y** por qué es distinto, en la misma frase. "Sabiendo cuánto vale" es algo que ningún portal peruano puede decir hoy, porque ninguno tiene el dato.

**Alternativas** si preferís algo más directo:
- `Ve el precio antes de preguntar`
- `Tu próximo hogar, con el precio a la vista`

### 2.2 · Grilla de propiedades — líneas 422-423

```
Actual:  h2  Propiedades publicadas
         sub Avisos vigentes, con fecha de vencimiento. Aquí no hay propiedades
             vendidas hace meses.
```

El subtítulo es excelente y el titular lo desperdicia. Subir la promesa:

```html
<h2>Publicadas y confirmadas</h2>
<p class="sub">Cada aviso se confirma cada 90 días. Acá no vas a encontrar
   propiedades que se vendieron hace meses.</p>
```

### 2.3 · Sección de IA — líneas 513-519 ⚠️

Los cuatro pasos están escritos en presente, como si ya funcionaran: *"Ordena tus fotos"*, *"Sugiere el precio"*, *"Escribe el aviso"*, *"Responde por ti"*. Tres de los cuatro son Fase 3 — meses de distancia.

Alguien que se registra por esto y no lo encuentra pierde la confianza en todo lo demás. Y sin embargo **el segundo paso sí existe hoy**: el estimador de precio ya funciona en `panel.html`.

La solución honesta, y que además genera expectativa:

```html
<h2>La parte difícil de publicar la hace Wasipe</h2>
<p class="sub">Fotos, precio y redacción: resuelto antes de que tu aviso salga.</p>
```

Y una etiqueta por paso. En el paso 2, `Disponible`; en los otros tres, `Muy pronto`:

```css
.paso-estado{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.04em;
  text-transform:uppercase;padding:3px 8px;border-radius:6px;margin-bottom:8px}
.paso-ya{background:var(--turquesa-suave);color:var(--turquesa)}
.paso-pronto{background:var(--niebla);color:var(--tinta-40)}
```

Prometer menos y cumplirlo vale más que prometer cuatro cosas y entregar una.

---

## 3. Señales de confianza

### 3.1 · Barra de garantías bajo el buscador

Tres promesas estructurales, todas verdaderas, cada una un golpe directo a lo que la gente odia de los portales grandes. Va donde hoy están los botones duplicados (líneas 254-257, ver §5.1):

```html
<ul class="garantias">
  <li>Precio siempre visible</li>
  <li>Sin propiedades ya vendidas</li>
  <li>Publicar es gratis</li>
</ul>
```

```css
.garantias{display:flex;gap:18px;justify-content:center;flex-wrap:wrap;
  margin-top:20px;list-style:none;font-size:13.5px;font-weight:600;color:var(--tinta-60)}
.garantias li{display:flex;align-items:center;gap:7px}
.garantias li::before{content:"";width:15px;height:15px;border-radius:50%;flex:none;
  background:var(--turquesa-suave);
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%230FA3A0' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 6 9 17l-5-5'/%3E%3C/svg%3E");
  background-size:10px;background-position:center;background-repeat:no-repeat}
```

### 3.2 · Quién publica, en cada tarjeta

`buscar.html:231` ya distingue **Dueño directo · Agente · Inmobiliaria** con insignia de verificado. El home no lo muestra y es de las señales que más pesan: mucha gente busca explícitamente sin intermediario.

En el template de tarjeta (línea 574 en adelante), agregar bajo `.prop-lugar`:

```js
<div class="prop-quien">${
  p.publica_rol === 'inmobiliaria' ? 'Inmobiliaria'
: p.publica_rol === 'agente'       ? 'Agente'
:                                    'Dueño directo'
}${p.publica_verificado ? ' <span class="ver">✓</span>' : ''}</div>
```

```css
.prop-quien{font-size:12.5px;color:var(--tinta-40);display:flex;align-items:center;gap:5px}
.prop-quien .ver{color:var(--turquesa);font-weight:700}
```

### 3.3 · Imagen para compartir — falta por completo

No hay `og:image`. **En Perú se comparte todo por WhatsApp**, y hoy un enlace a Wasipe aparece como un rectángulo gris sin imagen. Es de las cosas más baratas de arreglar con más retorno.

```html
<meta property="og:image" content="https://wasipe.netlify.app/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="https://wasipe.netlify.app/">
<meta property="og:site_name" content="Wasipe">
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="https://wasipe.netlify.app/">
```

Para `og.png` (1200×630): exportá el skyline que ya tenés con el logo y la frase *"Ve el precio antes de preguntar"*. Ya está dibujado, es cuestión de recortarlo.

### 3.4 · Lo que NO hay que hacer

La tentación al lanzar es inventar prueba social: *"+10,000 propiedades"*, *"Más de 500 agentes confían en nosotros"*.

**No.** Con la grilla mostrando tres avisos, el número se desmiente solo en la misma pantalla. Se pierde exactamente lo que se quería ganar.

Mientras no haya volumen, las señales de confianza tienen que ser **estructurales** (garantías sobre cómo funciona el producto), no **sociales** (números que todavía no existen). Las tres de §3.1 son verdaderas desde el día uno y no caducan cuando crezcas.

---

## 4. La oferta: propietario, agente, inmobiliaria

La sección de tres perfiles (líneas 475-508) está bien planteada. Tres detalles la mejoran:

### 4.1 · Preseleccionar el rol en el registro

Los tres enlaces van a `/registro` pelado. Se pierde la intención que el usuario acaba de declarar:

```html
<a href="/registro?rol=propietario">Publicar mi propiedad →</a>
<a href="/registro?rol=agente">Crear cuenta de agente →</a>
<a href="/registro?rol=inmobiliaria">Publicar un proyecto →</a>
```

`registro.html` lee el parámetro y marca la opción. Un paso menos.

### 4.2 · Beneficios paralelos y concretos

Hoy cada tarjeta habla de algo distinto y no se pueden comparar. Igualar la estructura: **qué hacés + cuánto índice tenés**.

| | Ahora | Propuesta |
|---|---|---|
| Propietario | "…sin intermediarios. Incluye 5 consultas al índice por mes." | "Publica desde tu celular, sin intermediarios. **1 aviso gratis + 5 consultas al índice por mes.**" |
| Agente | "Maneja tu cartera en un panel, recibe contactos filtrados y consulta el índice sin tope." | "Tu cartera en un panel, con bandeja de contactos. **Índice sin tope y perfil público propio.**" |
| Inmobiliaria | "Publica proyectos con tipologías, avance de obra y stock. Tu equipo trabaja el mismo panel." | "Proyectos con tipologías, avance de obra y stock. **Tu equipo, en un solo panel.**" |

### 4.3 · Un enlace a planes

Con nueve planes definidos, el home no menciona precios en ninguna parte. Alguien que evalúa Wasipe como agente no encuentra qué cuesta. Una línea bajo las tres tarjetas alcanza:

```html
<p style="text-align:center;margin-top:20px;font-size:14.5px;color:var(--tinta-60)">
  Publicar es gratis siempre.
  <a href="/planes" style="color:var(--fucsia);font-weight:700">Ver planes para agentes e inmobiliarias →</a>
</p>
```

"Publicar es gratis siempre" antes del enlace evita que el precio asuste a un propietario que solo quiere subir su departamento.

---

## 5. Ajustes visuales

### 5.1 · Quitar los botones duplicados del hero — líneas 254-257

`Crear cuenta gratis` e `Ingresar` repiten exactamente los dos botones de la barra superior, y están justo debajo del buscador, compitiendo con él. El hero termina con tres llamados a la acción distintos y ninguno gana.

Eliminar ese bloque y poner en su lugar la barra de garantías de §3.1. El buscador queda como único foco.

### 5.2 · Las tarjetas enlazan a `/buscar` — línea 575

```js
<a class="prop" href="/buscar">        // todas van al mismo lado
<a class="prop" href="/propiedad/${p.slug}">   // ← cuando exista la ficha (M7)
```

Hoy es el mismo destino para todas las tarjetas. Corregir en cuanto la ficha pública exista.

### 5.3 · Fecha de actualización en la tarjeta

Refuerza la promesa de avisos vivos, y es un dato que ya tenés:

```js
${p.actualizado_hace_dias != null
  ? `<span class="prop-fresco">Actualizado hace ${p.actualizado_hace_dias} d</span>` : ''}
```

### 5.4 · Detalles menores

| Dónde | Ajuste |
|---|---|
| `<head>` | `<link rel="preload" as="style">` para la hoja de Google Fonts — el hero depende de Bricolage |
| Línea 14 | JetBrains Mono carga 500 y 700; en el home solo se usa 700. Un archivo menos |
| `.chip` (248-252) | Agregar `type="button"`: están dentro del flujo del hero y sin el atributo algunos navegadores los tratan como submit |
| `.prop-foto` | `background` gris mientras carga la imagen para evitar el salto de layout |
| `.vacio` | Cuando la API falla (hoy, todo el tiempo) se muestra "Sé el primero en publicar". Mientras el backend esté caído, el mensaje miente |

---

## 6. Un reordenamiento opcional

**No es rediseño: es mover un bloque `<section>` completo.**

Hoy el orden es:

```
Hero → Propiedades → Distritos → Índice → Publica → IA → Cierre
```

Con inventario cerca de cero, lo primero que ve un visitante después del hero es una grilla vacía. Es la peor primera impresión posible, y encima el Índice —tu diferenciador y el gancho para crear cuenta— queda cuarto.

Mientras haya pocos avisos:

```
Hero → Índice → Propiedades → Distritos → Publica → IA → Cierre
```

Es cortar el `<section id="indice">` (líneas 446-472) y pegarlo antes de `<section id="propiedades">`. **Cuando la grilla tenga 30 o 40 avisos, se vuelve al orden original** — ahí las propiedades venden solas y conviene mostrarlas primero.

Reversible en dos minutos, sin tocar CSS.

---

## 7. Orden de aplicación

| # | Cambio | Esfuerzo | Impacto |
|---|---|---|---|
| 1 | Script duplicado (§1.1) | 2 min | Corrige un bug real |
| 2 | `og:image` + canonical (§3.3) | 20 min | **Alto** — cada enlace compartido por WhatsApp |
| 3 | Titular y subtítulo (§2.1) | 5 min | **Alto** — es lo que te separa de Urbania |
| 4 | Quitar CTAs duplicados + barra de garantías (§5.1, §3.1) | 15 min | **Alto** |
| 5 | Etiquetas "Muy pronto" en IA (§2.3) | 15 min | Confianza |
| 6 | Corregir "43 distritos" (§1.2) | 2 min | Legal |
| 7 | Rol preseleccionado + enlace a planes (§4.1, §4.3) | 10 min | Conversión |
| 8 | Titular de la grilla (§2.2) | 3 min | Medio |
| 9 | Quién publica en la tarjeta (§3.2) | 15 min | Medio |
| 10 | Reordenar Índice (§6) | 5 min | Medio, mientras haya poco inventario |
| 11 | Enlaces legales del footer (§1.3) | — | Depende del hito M13 |
| 12 | Tarjetas a `/propiedad/:slug` (§5.2) | — | Depende del hito M7 |

Los diez primeros son **menos de dos horas en total** y no tocan la estructura, ni el skyline, ni la paleta, ni una sola media query.

---

## 8. Lo esencial

1. **Tu mejor frase está en el footer a 13.5 px.** *"Donde ves el precio antes de preguntar"* es la posición completa del producto y hoy la lee nadie. Subila al titular.
2. **El titular actual podría ser de cualquier portal**, incluido el de tu competencia. Ese es el único punto donde el home no se siente propio — todo lo demás, empezando por el skyline, sí lo es.
3. **Confianza estructural, no social.** Tres garantías verdaderas valen más que un "+10,000 propiedades" que la grilla desmiente dos pantallas más abajo.
4. **La sección de IA promete cuatro cosas y hoy existe una.** Etiquetarlas cuesta quince minutos y evita la decepción que sí se paga cara.
5. **Sin `og:image`, cada vez que alguien comparte Wasipe por WhatsApp aparece un rectángulo gris.** En Perú, ese es el canal.
