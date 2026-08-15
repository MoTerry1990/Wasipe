# Wasipe — Roadmap e Implementación

Portal inmobiliario del Perú. Plan técnico y de producto, en orden de ejecución.

Fecha: 2026-08-05 · Basado en el código de `wasipe-v10` y el estado real de `wasipe.netlify.app`.

---

## 0. Diagnóstico del estado actual

### Lo que ya existe (mejor de lo que parece)

**Frontend** (`public/`, HTML estático + JS módulos, sin framework):

| Archivo | Qué hace | Estado |
|---|---|---|
| `index.html` | Home: hero, buscador, grilla de propiedades desde API, zonas, sección Índice, perfiles, IA | Completo, buen diseño |
| `buscar.html` | Resultados + filtros + paginación + modal de contacto | Completo y funcional |
| `panel.html` | Panel: Índice, Mis inmuebles, Mi perfil | Funcional, **falta publicar** |
| `registro.html` / `ingresar.html` | Alta y login | Completo |
| `cuenta.js` | Cliente API (cookies httpOnly) | Correcto |
| `estilos.css` | Sistema de diseño compartido | Correcto |

**Backend** (`netlify/functions/api.js`): un único Netlify Function, Neon serverless Postgres, con fallback a PGlite.

- Auth: JWT en cookie httpOnly, hash de password, rate-limit por tabla `intentos_auth`, `version_token` para invalidar sesiones, secreto JWT autogenerado y guardado en tabla `config`.
- Rutas ya implementadas:
  ```
  GET  /api/salud
  POST /api/cuentas/registro       POST /api/cuentas/ingresar
  POST /api/cuentas/salir          GET  /api/cuentas/yo
  POST /api/cuentas/password
  GET/PATCH /api/perfil
  GET  /api/propiedades            GET  /api/propiedades/buscar
  POST /api/propiedades/:id/contacto
  GET  /api/indice                 POST /api/indice/estimar
  GET  /api/indice/distrito/:d
  ```
- Tablas ya creadas: `usuarios`, `perfiles`, `propiedades`, `fotos`, `indice_precios`, `consultas_indice`, `leads`, `config`, `intentos_auth`.

El modelo de datos ya anticipa moderación (`estado='revision'`), vencimiento de avisos (`vence_en` +90 días), y cuota de índice por rol (propietario 5/mes, agente e inmobiliaria sin tope). **Eso es una base sólida.**

### Bloqueadores críticos (en orden de gravedad)

1. **La base de datos no está conectada en producción.**
   `GET /api/salud` → `{"ok":false,"bd":"sin-conexion","vars":["NETLIFY_FUNCTIONS_TOKEN","NODE_ENV"]}`
   El código busca `DATABASE_URL`, `NETLIFY_DATABASE_URL` o `NETLIFY_DB_URL`. Ninguna está configurada.
   **Todo el backend está muerto en el sitio live.** Nada más importa hasta arreglar esto.

2. **No existe el código fuente del backend.** `api.js` es un bundle minificado de esbuild (105 KB en 103 líneas). No hay repo, no hay git, no hay fuentes. No se puede mantener ni extender. Riesgo estructural máximo.

3. **No se puede publicar un inmueble.** `panel.html:293` literalmente hace:
   ```js
   alert('El formulario de publicación es el siguiente paso del proyecto.')
   ```
   El circuito del marketplace está roto: la gente se registra y no puede publicar.

4. **No hay carga de imágenes.** La tabla `fotos` existe, pero solo acepta URLs. `foto_url` del perfil es un campo de texto. No hay storage.

5. **No hay página de detalle de propiedad.** Las tarjetas de `index.html` enlazan a `/buscar`; las de `buscar.html` no enlazan a nada. **Esto es fatal para SEO** — en un portal inmobiliario el 60–80% del tráfico entra por búsqueda orgánica a fichas individuales.

6. **Cero monetización.** No hay tablas de planes, suscripciones ni pagos.

7. **No hay admin.** El rol `admin` existe en el CHECK constraint pero no hay rutas ni interfaz.

### Deudas menores detectadas

- `index.html:633-650` — bloque duplicado por copy-paste dentro del handler de tabs. Cada clic en una pestaña registra **otro** listener de `submit` en el buscador. Se acumulan navegaciones duplicadas.
- **Riesgo legal:** `index.html:455,469` promete *"43 distritos"*, pero `panel.html:157` tiene 16 y `buscar.html:167` tiene 17. Publicidad no sustentada — corregir el número o cargar los datos.
- Distritos como texto libre → `Surco` vs `Santiago de Surco` fragmentarán la búsqueda. Hay que normalizar ubicaciones antes de tener volumen.
- `Referrer-Policy: same-origin` y `X-Content-Type-Options` están; falta CSP, HSTS y `X-Frame-Options`.

---

## 1. Diferenciadores — que Wasipe no sea un clon

Urbania y Adondevivir son catálogos grandes y sucios. Su debilidad no es el tamaño, es **la confianza**: avisos muertos, precios ocultos, agentes disfrazados de dueños. Ahí está el hueco.

El home ya promete cuatro de estas cosas. La estrategia es **cumplirlas**, no inventar nuevas.

### 1.1 Índice Wasipe (el activo principal) — ya construido, hay que amplificarlo

Precio por m² por distrito, gratis con cuenta. Ningún portal peruano lo pone al frente así.

El salto real: **no dejarlo como una tabla aparte, sino inyectarlo en cada aviso**.
> `US$ 185,000 · 12% debajo del promedio de Miraflores`

Un badge automático de mercado en cada tarjeta es algo que ningún competidor local muestra, y convierte el índice de "una sección" en "la razón por la que la gente usa Wasipe".

Derivados: histórico de 12 meses por distrito, alerta "bajó el precio en tu zona", y — más adelante — **el índice como producto B2B** para bancos y tasadores.

### 1.2 Avisos que vencen (ya está en el esquema)

`vence_en DATE DEFAULT CURRENT_DATE + 90 days` ya existe. Hay que activarlo de verdad:
- Cron que pasa a `estado='cerrado'` lo vencido.
- Email a los 7 días: "¿sigue disponible?" → un clic renueva.
- Mostrar **"actualizado hace X días"** en cada aviso.
- Métrica pública: *"98% de los avisos de Wasipe se confirmaron este mes."*

Es el reclamo del home (*"Aquí no hay propiedades vendidas hace meses"*) y es el dolor #1 del comprador peruano.

### 1.3 Precio siempre visible

El footer ya dice *"donde ves el precio antes de preguntar"*. Convertirlo en regla: sin precio no se publica, o los avisos "Consultar precio" van al fondo de todo orden. Diferenciador brutal y de costo cero.

### 1.4 Dueño directo vs. agente, como filtro de primera clase

`buscar.html:231` ya pinta `Dueño directo / Agente / Inmobiliaria`. Falta el **filtro**. Mucha gente busca explícitamente sin intermediario; nadie se lo permite filtrar hoy.

### 1.5 Costo real de vivir ahí

`mantenimiento` ya está en la tabla. Sumarle arbitrios estimados por distrito y servicios:
> `US$ 1,200 alquiler + S/ 280 mant. + ~S/ 90 arbitrios = costo real S/ 4,850/mes`

Nadie lo hace. Es la pregunta que todo inquilino hace por WhatsApp.

### 1.6 Verificación real

`usuarios.verificado` ya existe. Validar RUC de inmobiliarias contra SUNAT, badge visible, y filtro "solo verificados".

### 1.7 IA que hace lo aburrido (ya prometido en el home, 4 pasos)

Ordenar fotos, sugerir precio contra el índice, redactar el aviso, responder las preguntas de siempre. Es Fase 3 — pero el home ya lo vende, así que o se construye o se baja del home.

---

## 2. Arquitectura

**Recomendación: mantener Netlify + Neon. No reescribir.** Está desplegado, el stack sirve, y Postgres da full-text search y PostGIS cuando haga falta. Lo que sí es obligatorio es **reconstruir el código fuente**.

```
wasipe/
├─ public/                    # frontend estático (como está hoy)
├─ src/
│  ├─ rutas/                  # cuentas.js, propiedades.js, indice.js, admin.js, pagos.js
│  ├─ db/
│  │  ├─ cliente.js
│  │  └─ migraciones/         # 001_inicial.sql, 002_planes.sql, ...
│  ├─ servicios/              # imagenes.js, correo.js, indice.js, pagos.js
│  └─ lib/                    # auth.js, validar.js, errores.js
├─ netlify/functions/api.js   # entrypoint delgado → src/rutas
└─ netlify.toml
```

| Necesidad | Elección | Por qué |
|---|---|---|
| Base de datos | **Neon Postgres** | Ya integrado, serverless, escala a cero |
| Imágenes | **Cloudinary** (uploads firmados) | Transformaciones, WebP automático, marca de agua, free tier generoso |
| Email | **Resend** | Simple, buen deliverability, dominio propio |
| Pagos | **Culqi** (principal) + Mercado Pago | Peruano, soporta **Yape** y tarjetas locales. Stripe **no** sirve bien para Perú |
| Búsqueda | Postgres FTS + `pg_trgm` → Meilisearch en Fase 3 | No meter un motor externo antes de tener volumen |
| Mapas | PostGIS + MapLibre + tiles OSM | Sin costo de Google Maps |
| Monitoreo | Sentry | Hoy no hay visibilidad de errores |

**Migraciones:** hoy el esquema se crea con `CREATE TABLE IF NOT EXISTS` en cada arranque. Sirve para empezar, no para evolucionar. Pasar a archivos `.sql` numerados con tabla `migraciones` desde el día uno de la Fase 1.

---

## 3. Modelo de datos completo

### 3.1 Tablas existentes que hay que extender

**`propiedades`** — agregar:
```sql
slug            TEXT UNIQUE          -- depa-3-dorm-miraflores-wsp1042
codigo          TEXT UNIQUE          -- WSP-1042, referencia pública
lat             DOUBLE PRECISION
lng             DOUBLE PRECISION
caracteristicas JSONB DEFAULT '{}'   -- ascensor, piscina, mascotas, amoblado...
destacado_hasta TIMESTAMPTZ
publicado_en    TIMESTAMPTZ
renovado_en     TIMESTAMPTZ
agencia_id      TEXT REFERENCES agencias(id)
moderado_por    TEXT REFERENCES usuarios(id)
motivo_rechazo  TEXT
```

**`usuarios`** — agregar `email_verificado_en`, `ultimo_acceso`, `origen`.
**`leads`** — agregar `respondido_en`, `puntaje` (calidad del lead), `canal` (web/whatsapp).

### 3.2 Tablas nuevas

```sql
-- Ubicaciones normalizadas: elimina "Surco" vs "Santiago de Surco"
CREATE TABLE ubicaciones (
  id SERIAL PRIMARY KEY,
  departamento TEXT NOT NULL, provincia TEXT NOT NULL, distrito TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL, alias TEXT[],       -- {'Surco','Santiago de Surco'}
  lat DOUBLE PRECISION, lng DOUBLE PRECISION,
  activo BOOLEAN DEFAULT true,
  UNIQUE (departamento, provincia, distrito));

-- Agencias como entidad real (hoy 'empresa' es solo texto en perfiles)
CREATE TABLE agencias (
  id TEXT PRIMARY KEY, nombre TEXT NOT NULL, slug TEXT UNIQUE NOT NULL,
  ruc TEXT UNIQUE, logo_url TEXT, descripcion TEXT, sitio_web TEXT,
  telefono TEXT, whatsapp TEXT, distrito TEXT,
  verificada BOOLEAN DEFAULT false, verificada_en TIMESTAMPTZ,
  creado_en TIMESTAMPTZ DEFAULT now());

CREATE TABLE agencia_miembros (
  agencia_id TEXT REFERENCES agencias(id) ON DELETE CASCADE,
  usuario_id TEXT REFERENCES usuarios(id) ON DELETE CASCADE,
  rol TEXT CHECK (rol IN ('dueno','admin','agente')),
  PRIMARY KEY (agencia_id, usuario_id));

-- Planes y monetización
CREATE TABLE planes (
  id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL, nombre TEXT NOT NULL,
  precio_pen NUMERIC(10,2) NOT NULL, periodo TEXT CHECK (periodo IN ('mensual','anual','unico')),
  tope_avisos INTEGER, tope_fotos INTEGER DEFAULT 8,
  destacados_incluidos INTEGER DEFAULT 0,
  indice_ilimitado BOOLEAN DEFAULT false,
  para_rol TEXT, activo BOOLEAN DEFAULT true,
  beneficios JSONB DEFAULT '[]', orden INTEGER DEFAULT 0);

CREATE TABLE suscripciones (
  id TEXT PRIMARY KEY,
  usuario_id TEXT REFERENCES usuarios(id) ON DELETE CASCADE,
  agencia_id TEXT REFERENCES agencias(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES planes(id),
  estado TEXT CHECK (estado IN ('activa','vencida','cancelada','morosa','prueba')),
  inicio TIMESTAMPTZ NOT NULL DEFAULT now(), fin TIMESTAMPTZ NOT NULL,
  renovacion_automatica BOOLEAN DEFAULT true,
  proveedor TEXT, proveedor_ref TEXT,
  CHECK (usuario_id IS NOT NULL OR agencia_id IS NOT NULL));

CREATE TABLE pagos (
  id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  suscripcion_id TEXT REFERENCES suscripciones(id),
  concepto TEXT NOT NULL,                        -- plan | destacado | renovacion
  monto NUMERIC(10,2) NOT NULL, moneda TEXT DEFAULT 'PEN',
  estado TEXT CHECK (estado IN ('pendiente','pagado','fallido','reembolsado')),
  proveedor TEXT NOT NULL, proveedor_ref TEXT,   -- id de cargo en Culqi
  respuesta JSONB, comprobante_url TEXT,         -- boleta/factura SUNAT
  creado_en TIMESTAMPTZ DEFAULT now());

CREATE TABLE destaques (
  id TEXT PRIMARY KEY,
  propiedad_id TEXT REFERENCES propiedades(id) ON DELETE CASCADE,
  tipo TEXT CHECK (tipo IN ('destacado','super','portada')),
  inicio TIMESTAMPTZ DEFAULT now(), fin TIMESTAMPTZ NOT NULL,
  pago_id TEXT REFERENCES pagos(id));

-- Compradores
CREATE TABLE favoritos (
  usuario_id TEXT REFERENCES usuarios(id) ON DELETE CASCADE,
  propiedad_id TEXT REFERENCES propiedades(id) ON DELETE CASCADE,
  creado_en TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (usuario_id, propiedad_id));

CREATE TABLE busquedas_guardadas (
  id TEXT PRIMARY KEY,
  usuario_id TEXT REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre TEXT, filtros JSONB NOT NULL,
  frecuencia TEXT CHECK (frecuencia IN ('nunca','diaria','semanal')) DEFAULT 'diaria',
  ultimo_envio TIMESTAMPTZ);

-- Moderación y confianza
CREATE TABLE reportes (
  id TEXT PRIMARY KEY,
  propiedad_id TEXT REFERENCES propiedades(id) ON DELETE CASCADE,
  reportado_por TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
  motivo TEXT CHECK (motivo IN ('vendida','precio_falso','duplicada','estafa','fotos_ajenas','otro')),
  detalle TEXT,
  estado TEXT CHECK (estado IN ('nuevo','revisando','resuelto','descartado')) DEFAULT 'nuevo',
  resuelto_por TEXT REFERENCES usuarios(id), nota_interna TEXT,
  creado_en TIMESTAMPTZ DEFAULT now());

CREATE TABLE auditoria (
  id BIGSERIAL PRIMARY KEY,
  actor_id TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
  accion TEXT NOT NULL,                          -- aviso.aprobado, usuario.suspendido
  entidad TEXT NOT NULL, entidad_id TEXT,
  datos JSONB, ip TEXT, creado_en TIMESTAMPTZ DEFAULT now());
CREATE INDEX ix_auditoria_entidad ON auditoria(entidad, entidad_id);

-- Conversaciones (hoy 'leads' es de un solo disparo)
CREATE TABLE mensajes (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  de_usuario_id TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
  cuerpo TEXT NOT NULL, leido_en TIMESTAMPTZ,
  creado_en TIMESTAMPTZ DEFAULT now());

-- Analítica real (hoy solo hay un contador 'vistas')
CREATE TABLE vistas_propiedad (
  propiedad_id TEXT REFERENCES propiedades(id) ON DELETE CASCADE,
  dia DATE NOT NULL, vistas INTEGER DEFAULT 0, contactos INTEGER DEFAULT 0,
  PRIMARY KEY (propiedad_id, dia));

CREATE TABLE notificaciones (
  id TEXT PRIMARY KEY,
  usuario_id TEXT REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL, titulo TEXT NOT NULL, cuerpo TEXT, enlace TEXT,
  leida_en TIMESTAMPTZ, creado_en TIMESTAMPTZ DEFAULT now());

-- Proyectos de inmobiliaria (un proyecto ≠ una unidad)
CREATE TABLE proyectos (
  id TEXT PRIMARY KEY, agencia_id TEXT REFERENCES agencias(id),
  nombre TEXT NOT NULL, slug TEXT UNIQUE, distrito TEXT NOT NULL,
  direccion TEXT, lat DOUBLE PRECISION, lng DOUBLE PRECISION,
  entrega DATE, avance_obra INTEGER,             -- 0-100
  descripcion TEXT, estado TEXT DEFAULT 'borrador');

CREATE TABLE tipologias (
  id TEXT PRIMARY KEY, proyecto_id TEXT REFERENCES proyectos(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,                          -- "2 dorm - Flat B"
  dormitorios INTEGER, banos INTEGER,
  area_m2 DOUBLE PRECISION, area_techada_m2 DOUBLE PRECISION,
  precio_desde NUMERIC(12,2), moneda TEXT DEFAULT 'USD',
  unidades_totales INTEGER, unidades_disponibles INTEGER, plano_url TEXT);
```

---

## 4. Workflows de administración

### 4.1 Cola de moderación (el más importante)

```
Usuario publica → estado='revision'
   ↓
Reglas automáticas marcan riesgo
   ↓
Admin ve la cola ordenada por riesgo
   ↓
Aprobar → estado='activo', publicado_en=now(), email al dueño
Rechazar → estado='borrador' + motivo_rechazo, email con qué corregir
Bloquear → estado='archivado' + suspensión de usuario si reincide
   ↓
Todo queda en 'auditoria'
```

**Reglas de auto-marcado** (calculan un puntaje de riesgo, no bloquean solos):
- Precio > 60% fuera del índice del distrito → posible error o carnada
- Teléfono, email o WhatsApp dentro de `descripcion` → evade el tracking de leads
- Fotos con hash perceptual repetido de otro aviso → fotos robadas
- Mismo `direccion` en varios avisos activos
- Palabras prohibidas (discriminación en vivienda — ilegal en Perú)
- Cuenta creada hace < 24 h publicando > 3 avisos
- Sin precio, o `area_m2` incoherente con dormitorios

**Meta de servicio:** aprobación en < 2 h en horario laboral. Auto-aprobar a usuarios verificados con historial limpio y moderar por muestreo.

### 4.2 Verificación de agentes e inmobiliarias
Solicitud → admin valida RUC contra SUNAT y documento → `verificada=true` → badge y filtro. Reverificación anual.

### 4.3 Cola de reportes
Usuario reporta ("ya se vendió", "precio falso", "estafa") → si un aviso junta ≥3 reportes de "vendida" se pausa automáticamente y se pide confirmación al dueño.

### 4.4 Gestión del Índice
Cargar CSV mensual de `indice_precios` → previsualizar variación vs. período anterior → marcar outliers → publicar período. Fuente inicial: promedio de avisos activos + cierres reportados, con `muestras` visible para que el usuario juzgue la confianza.

### 4.5 Usuarios y facturación
Buscar usuario, ver avisos/leads/pagos, suspender, forzar cambio de contraseña, **entrar como** (impersonar, siempre auditado), acreditar plan manualmente, reembolsar, reenviar boleta.

### 4.6 Tablero de métricas
Avisos por estado · nuevos por día · leads y tasa de contacto · ingresos MRR · suscripciones activas y bajas · top distritos · avisos por vencer · tiempo medio de moderación · funnel registro→publica→aprobado.

### 4.7 Contenido
Destacados de portada, textos de distritos (SEO), banners, planes y precios sin deploy.

---

## 5. Monetización

Piso del mercado peruano: Urbania y Adondevivir cobran packs de avisos + destacados a agentes. Wasipe entra con **el índice como gancho** y cobra por volumen y visibilidad.

### Planes

| Plan | Precio | Para | Incluye |
|---|---|---|---|
| **Gratis** | S/ 0 | Propietario | 1 aviso activo, 8 fotos, 5 consultas de índice/mes, orden estándar |
| **Dueño Plus** | S/ 49 / 60 días | Propietario | 1 aviso, 20 fotos, 7 días destacado, índice ilimitado en el período, badge "precio verificado" |
| **Agente** | S/ 89 / mes | Agente | 15 avisos, 30 fotos c/u, índice ilimitado, perfil público, bandeja de leads, 2 destacados/mes |
| **Agente Pro** | S/ 179 / mes | Agente | 40 avisos, 6 destacados, orden prioritario, alertas a sus compradores, exportar leads a CSV/CRM |
| **Inmobiliaria** | desde S/ 399 / mes | Inmobiliaria | Avisos ilimitados, páginas de proyecto con tipologías, 5 asientos de equipo, perfil de agencia, carga masiva |

### A la carta
- Destacado 7 días — **S/ 25** · Súper destacado (tope de resultados) — **S/ 45** · Portada del home — **S/ 60**
- Renovación anticipada — S/ 15 · Paquete de 5 avisos sueltos — S/ 99
- Servicios de terceros con comisión: fotografía profesional, tour 360, saneamiento legal, mudanza

### Ingresos posteriores (mayor margen)
1. **Leads hipotecarios a bancos.** En real estate es el lead mejor pagado del mercado. Encaja natural con el índice: "con este precio, tu cuota sería S/ X".
2. **API del Índice Wasipe** para bancos, tasadores y aseguradoras. El dato ya se está generando; es un producto B2B por sí solo y es defendible.
3. **Certificación de aviso verificado** (visita física, S/ 120).

### Reglas de negocio
- El plan controla `tope_avisos`, `tope_fotos` y cuota de índice — validado **en el backend**, nunca solo en la UI.
- Al bajar de plan, los avisos excedentes pasan a `pausado`, no se borran.
- Período de gracia de 7 días en pagos fallidos antes de despublicar.
- Emisión de **boleta/factura electrónica** (obligatorio en Perú) — integrar con Nubefact o similar en Fase 2.

---

## 6. Fases

### FASE 0 — Desbloquear (2–4 días) · antes que todo lo demás

| # | Tarea | Detalle |
|---|---|---|
| 0.1 | **Conectar la base de datos** | Configurar `DATABASE_URL` en Netlify. Verificar `/api/salud` → `bd:"conectada"` |
| 0.2 | **Repo git + código fuente** | Crear repo, reconstruir el backend desde el bundle a módulos legibles. Sin esto no hay Fase 1 |
| 0.3 | Sembrar `indice_precios` | Datos reales de al menos los distritos que se prometen |
| 0.4 | Corregir el reclamo de "43 distritos" | Alinear el número con los datos reales cargados |
| 0.5 | Arreglar `index.html:633-650` | Eliminar el bloque duplicado del handler de tabs |
| 0.6 | Sentry + backups de Neon | Visibilidad de errores y recuperación |
| 0.7 | Migraciones versionadas | Pasar de `CREATE TABLE IF NOT EXISTS` a archivos `.sql` numerados |

**Salida:** el sitio actual funciona de verdad de punta a punta.

---

### FASE 1 — MVP: cerrar el circuito del marketplace (3–5 semanas)

> Objetivo único: **que alguien pueda publicar un inmueble con fotos y que un comprador lo vea en su propia página y lo contacte.** Nada más entra en esta fase.

| # | Entrega | Notas |
|---|---|---|
| 1.1 | **Formulario de publicación** (wizard 4 pasos) | Tipo/operación → ubicación → detalles y precio → fotos. Guardar borrador en cada paso. `POST/PATCH /api/propiedades` |
| 1.2 | **Carga de imágenes** | Cloudinary con firma desde el backend. Reordenar, elegir portada, borrar. Límite por plan. Auto-WebP y thumbnails |
| 1.3 | **Página de detalle** `/propiedad/:slug` | **La pieza más importante para SEO.** Galería, mapa, características, datos del que publica, formulario de contacto, JSON-LD `RealEstateListing`, OG tags |
| 1.4 | **Ciclo de vida del aviso** | Publicar, pausar, reactivar, renovar, cerrar. Cron diario que vence a los 90 días + aviso 7 días antes |
| 1.5 | **Moderación mínima** | Cola en `/admin`, aprobar/rechazar con motivo, `auditoria`. Reglas automáticas básicas |
| 1.6 | **Bandeja de leads** en el panel | Ver contactos, marcar estado (`nuevo→contactado→visita→cerrado`), enlace directo a WhatsApp |
| 1.7 | **Emails transaccionales** (Resend) | Verificar correo, recuperar contraseña, nuevo lead, aviso aprobado/rechazado, aviso por vencer |
| 1.8 | **Ubicaciones normalizadas** | Tabla `ubicaciones` + autocompletado. Migrar los distritos de texto libre |
| 1.9 | Búsqueda mejorada | Rango de precio y área, dormitorios, orden (reciente / precio / m²), dueño-directo, `pg_trgm` para tolerar tildes y typos |
| 1.10 | Legales (obligatorio en Perú) | Términos, Privacidad, **Libro de Reclamaciones** funcional — hoy son enlaces muertos en el footer |
| 1.11 | SEO base | `sitemap.xml` dinámico, `robots.txt`, canonical, páginas `/venta/departamentos/miraflores` |
| 1.12 | Seguridad | CSP, HSTS, `X-Frame-Options`, rate-limit en contacto, honeypot anti-spam |

**Definición de terminado:** un propietario se registra, publica con fotos, un admin aprueba, el aviso sale en Google con su propia URL, y un comprador envía un contacto que llega por email y a la bandeja.

---

### FASE 2 — Monetización y retención (4–6 semanas)

| # | Entrega |
|---|---|
| 2.1 | **Planes y suscripciones** — tablas `planes`, `suscripciones`, límites aplicados en backend |
| 2.2 | **Pagos con Culqi** — checkout, webhooks, reintentos, gracia de 7 días, panel de facturación |
| 2.3 | **Boleta/factura electrónica** (Nubefact) — requisito legal |
| 2.4 | **Destacados** — compra a la carta, ordenamiento y badges |
| 2.5 | **Agencias reales** — `agencias` + `agencia_miembros`, asientos de equipo, cartera compartida |
| 2.6 | **Perfiles públicos** `/agente/:slug` y `/inmobiliaria/:slug` — página propia con su cartera. Muy buen SEO y argumento de venta |
| 2.7 | **Favoritos y búsquedas guardadas** + alertas por email |
| 2.8 | **Badge "vs. mercado"** en cada aviso usando el índice — *el diferenciador clave* |
| 2.9 | **Admin completo** — usuarios, reportes, verificación, métricas, gestión del índice, planes editables |
| 2.10 | **Analítica para el que publica** — vistas y contactos por día, comparación con avisos similares |
| 2.11 | Reportes de usuarios + auto-pausa por reportes de "ya se vendió" |
| 2.12 | Costo real de vivir ahí (mantenimiento + arbitrios estimados) |

---

### FASE 3 — Escala y foso competitivo (6–10 semanas)

| # | Entrega |
|---|---|
| 3.1 | **Búsqueda en mapa** — PostGIS + MapLibre, dibujar zona, buscar por cercanía |
| 3.2 | **Proyectos con tipologías** para inmobiliarias — avance de obra, stock, planos |
| 3.3 | **IA**: redacción del aviso, orden y control de calidad de fotos, sugerencia de precio, respuesta automática a preguntas frecuentes (los 4 pasos que ya promete el home) |
| 3.4 | **Puntaje de calidad de lead** — filtrar curiosos de compradores reales |
| 3.5 | **WhatsApp Business API** — el canal real de contacto en Perú |
| 3.6 | Conversaciones (`mensajes`) en vez de leads de un disparo |
| 3.7 | Motor de búsqueda dedicado (Meilisearch) — solo si Postgres empieza a sufrir |
| 3.8 | PWA instalable con notificaciones push |
| 3.9 | Carga masiva / API para inmobiliarias (XML tipo feed) |
| 3.10 | Histórico de precios por distrito con gráficos |

---

### MÁS ADELANTE

- Marketplace de créditos hipotecarios (leads a bancos)
- API del Índice Wasipe como producto B2B
- Marketplace de servicios (fotografía, legal, mudanza, remodelación)
- Herramientas de gestión de alquiler (contratos, cobros, mantenimiento)
- Tours 3D / video walkthrough
- App nativa
- Expansión a provincias fuera de Lima, luego región andina

---

## 7. Cambios en el home (mínimos, como pediste)

El home se queda como está. Solo esto:

| # | Cambio | Cuándo | Por qué |
|---|---|---|---|
| H1 | Tarjetas enlazan a `/propiedad/:slug` en vez de `/buscar` (`index.html:575`) | Fase 1 | Hoy toda tarjeta va al mismo sitio |
| H2 | Eliminar el bloque duplicado en `index.html:633-650` | Fase 0 | Bug: acumula listeners de submit |
| H3 | Ajustar "43 distritos" al número real (`index.html:455,469`) | Fase 0 | Riesgo de publicidad no sustentada |
| H4 | Enlaces reales de Términos, Privacidad y Libro de Reclamaciones | Fase 1 | Obligación legal en Perú |
| H5 | Badge "X% vs. mercado" en las tarjetas | Fase 2 | Único cambio visual nuevo — y es el diferenciador |
| H6 | Reemplazar `alert()` del panel por el formulario real (`panel.html:293`) | Fase 1 | — |

Nada de rediseño. El hero, el skyline de Lima, la paleta y la tipografía se quedan intactos — el skyline dibujado a mano ya es identidad propia y no se parece a Urbania ni a Adondevivir.

---

## 8. Orden de implementación (la lista corta)

```
FASE 0  ── 1. Conectar DATABASE_URL en Netlify          ← nada funciona sin esto
        ── 2. Repo git + reconstruir fuentes del backend ← nada es mantenible sin esto
        ── 3. Migraciones versionadas
        ── 4. Sembrar índice + corregir "43 distritos"
        ── 5. Sentry + backups

FASE 1  ── 6. Ubicaciones normalizadas
        ── 7. Carga de imágenes (Cloudinary)
        ── 8. Formulario de publicación (wizard)
        ── 9. Página de detalle /propiedad/:slug  ← la que trae el tráfico
        ── 10. Emails transaccionales (Resend)
        ── 11. Moderación mínima + auditoría
        ── 12. Bandeja de leads
        ── 13. Ciclo de vida y vencimiento (cron)
        ── 14. Búsqueda mejorada + SEO + legales + seguridad

FASE 2  ── 15. Planes y límites en backend
        ── 16. Culqi + webhooks + boleta electrónica
        ── 17. Destacados
        ── 18. Agencias y equipos
        ── 19. Perfiles públicos de agente/agencia
        ── 20. Favoritos, búsquedas guardadas y alertas
        ── 21. Badge "vs. mercado"
        ── 22. Admin completo + métricas

FASE 3  ── 23. Mapa (PostGIS)
        ── 24. Proyectos y tipologías
        ── 25. IA (redacción, fotos, precio, respuestas)
        ── 26. WhatsApp Business API
        ── 27. Escalar búsqueda si hace falta
```

**El orden importa por dependencias reales:**
ubicaciones antes que búsqueda · imágenes antes que el formulario · el formulario antes que moderación · el detalle antes que SEO · planes antes que pagos · el índice poblado antes que el badge de mercado.

---

## 9. Los tres riesgos que hay que vigilar

1. **El backend sin fuentes.** Mientras `api.js` siga siendo un bundle minificado, cada cambio es una apuesta. Es la tarea 2 por una razón.
2. **Marketplace vacío.** Un portal sin avisos no atrae compradores, y sin compradores no atrae quien publique. Hay que sembrar oferta a mano en 3–4 distritos antes de invertir en captar demanda. El índice ayuda: da una razón para crear cuenta aunque todavía no haya inventario.
3. **Calidad del dato del índice.** Es el diferenciador principal; si los números se sienten inventados, se pierde la confianza y con ella el argumento entero. Mostrar siempre `muestras` y el nivel de confianza, y nunca presentarlo como tasación.
