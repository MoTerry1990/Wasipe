# Wasipe — Análisis competitivo y modelo revisado

Urbania.pe y Adondevivir.com · agosto 2026

> **Nota de método:** ambos dominios bloquean el acceso automatizado (403), así que esto sale de búsqueda web, prensa peruana y foros de corredores — no de inspección directa. Los precios concretos hay que confirmarlos pidiendo una cotización antes de fijar los tuyos.

---

## 1. El hallazgo que cambia la estrategia

**Urbania y Adondevivir son la misma empresa.** Se fusionaron bajo Navent; un aviso se publica en simultáneo en ambos portales. No son dos competidores, es un monopolio de hecho.

Y acaba de hacer algo muy poco habitual: **subió los precios ~5× y empeoró el servicio.**

| Paquete semestral | Antes | Después |
|---|---|---|
| Contenido | 20 destacados + 20 premium + 60 simples | 20 destacados + **8** súper destacados |
| Precio | **S/ 3,300** | **~S/ 16,000** |

Aviso simple individual: **S/ 65 → S/ 105**.

El resultado está documentado en prensa peruana: *"corredores comienzan a dejar el portal"*. Más de 40 comentarios de corredores en una sola nota; uno lo resume así: *"eso no es cobrar, es robar"*. Los que se van están migrando a LaEncontre, Properati y Lamudi.

**Esto no es un mercado con un líder fuerte. Es un mercado con un líder odiado y clientes buscando salida.** Es la mejor condición posible para entrar.

---

## 2. Debilidades concretas del líder

Cada una es una función de Wasipe.

| # | Problema documentado | Qué hace Wasipe |
|---|---|---|
| 1 | **No existe publicación gratuita permanente.** Ningún plan gratis | **2 propiedades gratis, para siempre.** El motor de captación |
| 2 | **Los precios se muestran en soles por defecto**; el dólar solo aparece al abrir el aviso — y la mayoría de las operaciones en Perú son en dólares | `precio_ref_usd` + selector de moneda. **Ya está diseñado en el esquema** |
| 3 | **La búsqueda no se subdivide por urbanización ni zona.** En distritos con miles de avisos es inusable | Extender `ubicaciones` a un nivel más: distrito → zona/urbanización |
| 4 | **Bloquean el teléfono en el aviso** para forzar la captura del lead. Los corredores lo resienten abiertamente | Ver §4 — acá me contradigo a mí mismo |
| 5 | **502 Bad Gateway en horas pico**, desde hace ~3 años | Serverless + Neon. Es un piso bajísimo de superar |
| 6 | **Avisos marcados como publicados que no aparecen** en la búsqueda | Estado visible y verificable desde el panel |
| 7 | **Fotos que no cargan** tras publicar | Verificación contra la Admin API de Cloudinary (ya diseñada) |
| 8 | **Renovación automática que cobra sin consentimiento claro** | Renovación explícita, aviso a los 83 días, cancelable en un clic |
| 9 | **Soporte telefónico eliminado**; solo contesta ventas. Respuestas por correo en días, negando el problema | WhatsApp de soporte. En Perú es el canal real |
| 10 | **Avisos con datos fuera de rango** para colarse en filtros | Reglas de riesgo + reportes (ya diseñadas) |

Los puntos 2, 3 y 4 son los que más citan los corredores. Dos ya están resueltos en el diseño; el tercero exige cambiar de opinión.

---

## 3. Tamaño del mercado

| Dato | Valor |
|---|---|
| Propiedades en Adondevivir | ~37,900 (29,600 en venta) |
| Departamentos en venta en Urbania | ~14,800 |
| Inmobiliarias registradas | ~685 |
| Agentes registrados | ~731 |
| Visitas mensuales | ~2 millones |

**~1,400 profesionales pagando** es el mercado direccionable inmediato. Si Wasipe captura 100 a S/ 139 promedio, son **S/ 13,900 al mes**. No hace falta ganarle al líder: alcanza con recoger a los que ya se están yendo.

---

## 4. Donde me contradigo: el teléfono en el aviso

En `FLUJO-AVISOS.md` puse esta regla:

> `contacto-en-descripcion` → **422**, se bloquea. Es el abuso más común.

**Estaba equivocado, y es exactamente lo que los corredores odian de Urbania.** Bloquear el teléfono sirve al portal (capturar el lead), no al que paga. Copiarlo sería copiar el motivo por el que están migrando.

Modelo mejor, que además vende planes:

| Plan | Teléfono en el aviso |
|---|---|
| Gratis | Oculto — el contacto pasa por el formulario |
| Cualquier plan pago | **Visible, y con botón directo de WhatsApp** |

El teléfono visible pasa de castigo a **beneficio de pago**. Alineás el interés del portal con el del corredor en vez de enfrentarlos, y tenés un argumento de venta que el líder no puede igualar sin desarmar su propio modelo de datos.

Lo que sí se sigue bloqueando: teléfonos en avisos **gratuitos** (si no, nadie paga) y datos de contacto en el **título** (ensucia los resultados).

---

## 5. Modelo revisado: 2 gratis + escalones + publicidad

Reemplaza la pista ARRANQUE de `MONETIZACION.md`. Los planes de agente e inmobiliaria siguen igual.

### 5.1 Gratis — el motor de captación

| | |
|---|---|
| Precio | **S/ 0, para siempre** |
| Avisos activos | **2** |
| Fotos por aviso | 8 |
| Índice de precios | 5 consultas/mes |
| Teléfono visible | No — contacto por formulario |
| Vigencia del aviso | 90 días, renovable |

**Por qué 2 y no 1:** con 1 aviso el dueño de dos propiedades tiene que elegir, se frustra y se va. Con 2 cubrís al ~90% de los propietarios reales, y el techo aparece recién cuando alguien empieza a comportarse como profesional — que es justo cuando conviene cobrarle.

Y sobre todo: **el líder no tiene nada gratis.** Es la única puerta de entrada del mercado.

### 5.2 Escalones

| Plan | Precio | Avisos | Para |
|---|---|---|---|
| **Gratis** | S/ 0 | 2 | Propietarios |
| **Dueño Plus** | S/ 39 · 90 días | 3 | Propietario apurado — destacado + teléfono visible |
| **Agente Inicial** | S/ 69/mes | 8 | Agente que empieza |
| **Agente** ⭐ | S/ 139/mes | 20 | Agente activo |
| **Agente Pro** | S/ 249/mes | 50 | Agente con cartera grande |
| **Inmobiliaria** | S/ 449/mes | 100 · 3 asientos | Inmobiliaria chica |
| **Inmobiliaria Plus** | S/ 899/mes | 300 · 10 asientos | Inmobiliaria mediana |
| **Corporativa** | desde S/ 1,899/mes | sin tope · 30 asientos | Grandes |

**Comparación directa que sirve para vender:**

> Urbania: **S/ 16,000 por semestre** → 28 avisos con visibilidad.
> Wasipe Agente Pro: **S/ 1,494 por semestre** → 50 avisos, 90 destacados, índice sin tope.
>
> Diez veces más barato, con más avisos.

Ese cuadro va en `/planes`. Es el argumento comercial completo.

### 5.3 Publicidad — la tercera fuente de ingreso

El líder ya vende banners. Wasipe puede hacerlo mejor porque tiene el dato del índice: **segmentación por distrito y por intención real de compra**.

| Espacio | Dónde | Formato | Referencia |
|---|---|---|---|
| `home-hero` | Bajo el buscador del home | 970×250 | S/ 900/mes |
| `resultados-inline` | Cada 8 resultados de búsqueda | tarjeta nativa | S/ 0.55 por mil impresiones |
| `ficha-lateral` | Columna de la ficha | 300×600 | S/ 700/mes |
| `distrito` | Solo en un distrito | tarjeta nativa | S/ 350/mes por distrito |
| `patrocinio-indice` | Junto a la tabla del índice | logo + texto | S/ 1,200/mes |

**Quién compra esto en Perú:** bancos y financieras (BCP, Interbank, Mibanco — crédito hipotecario), constructoras con proyectos nuevos, mudanzas, seguros de hogar, empresas de remodelación, estudios de arquitectura.

**`patrocinio-indice` es el espacio más valioso que tenés.** Un banco quiere aparecer exactamente donde alguien acaba de averiguar cuánto vale un departamento — es el momento previo a pedir un crédito. Ese inventario no lo tiene ningún competidor porque ninguno tiene el índice.

**Tres reglas que protegen el producto:**

1. **Máximo un anuncio cada 8 resultados**, y nunca en los primeros 4. Un buscador que parece publicidad pierde compradores, y sin compradores los planes no valen nada.
2. **Siempre etiquetado "Publicidad".** Encubrirlo es mala práctica y roza la publicidad engañosa.
3. **Nada de publicidad en el panel del que paga.** Ya te está pagando.

**Cuándo empezar:** no antes de ~20,000 visitas al mes. Vender publicidad sin tráfico quema la relación con el anunciante y no deja plata. Fase 2 tardía, después de los planes.

---

## 6. Qué cambia en lo ya escrito

| Documento | Cambio |
|---|---|
| `MONETIZACION.md` §3 | Gratis pasa de 1 a **2 avisos**. Dueño Plus a S/ 39/90 días con 3 |
| `MONETIZACION.md` | Nueva sección de publicidad (§5.3 de acá) |
| `FLUJO-AVISOS.md` §4.2 | `contacto-en-descripcion` deja de ser bloqueo duro: se oculta en gratis, se muestra en pago |
| `ESQUEMA.md` | `planes` necesita `telefono_visible BOOLEAN`; tablas nuevas `espacios_ad`, `campanias`, `impresiones_ad` |
| `ESQUEMA.md` | `ubicaciones` necesita un nivel más: `zona` dentro del distrito |
| `API.md` | `GET /buscar` acepta `zona`; `GET /anuncios/:espacio` |

---

## 7. Posicionamiento en una frase

> **Urbania cobra S/ 16,000 por semestre y sus corredores se están yendo.
> Wasipe publica gratis hasta 2 propiedades, muestra el precio en dólares, dice cuánto vale cada m² y cuesta diez veces menos.**

Los tres pilares, en orden de fuerza:

1. **Gratis de verdad** — el líder no tiene respuesta posible sin romper su modelo
2. **El Índice** — nadie más lo tiene, y sostiene el badge "12% debajo del mercado"
3. **Precio diez veces menor** — con el líder subiendo, la brecha se agranda sola

---

## Fuentes

- [Fusión de Urbania-Adondevivir decepciona por su avaricia y corredores comienzan a dejar el portal — ConNuestroPerú](https://connuestroperu.com/consumidor/fusion-de-urbania-adondevivir-decepciona-por-su-avaricia-y-corredores-comienzan-a-dejar-el-portal/)
- [Urbania se burla de sus anunciantes con servicio pésimo — ConNuestroPerú](https://connuestroperu.com/consumidor/urbania-se-burla-de-sus-anunciantes-con-servicio-pesimo/)
- [Publica tu inmueble — Urbania](https://urbania.pe/publica-tu-aviso)
- [Publica tu proyecto inmobiliario — Adondevivir](https://proyectos.adondevivir.com/)
- [Inmuebles en Perú — Adondevivir](https://www.adondevivir.com/)
- [Publicar en Urbania gratis en Perú — Houcify](https://houcify.com/publicar-en-urbania-gratis-en-peru/)
