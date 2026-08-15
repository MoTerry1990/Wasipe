# Wasipe — Arquitectura del Backend

Diseño técnico listo para implementar. Continúa el backend que ya existe en `wasipe-v10` (Netlify Function + Neon Postgres + JWT en cookie), no lo reemplaza.

Fecha: 2026-08-05 · Complemento de `ROADMAP.md`

---

## 0. Las restricciones que mandan en todo el diseño

Antes de elegir nada: Netlify Functions corre sobre AWS Lambda, y sus límites deciden la arquitectura. Todo lo que sigue sale de aquí.

| Límite | Valor | Qué obliga |
|---|---|---|
| Timeout síncrono | **10 s** | Nada pesado en el request. Exportaciones, emails masivos y reprocesos van a background |
| Background functions | **15 min** | Sufijo `-background` en el nombre del archivo. Responden 202 al instante |
| Payload request/response | **6 MB** | **Las fotos NO pueden pasar por la función.** Esto define toda la estrategia de storage |
| Conexiones a BD | Sin pool persistente | Obliga driver HTTP serverless (Neon `@neondatabase/serverless`), no `pg` con pool |
| Cold start | ~200–600 ms | Conviene **una** función API grande y caliente, no veinte pequeñas y frías |
| Estado en memoria | No persiste | Rate limiting y cachés van en Postgres, no en variables |

> Verificá estos números contra la documentación vigente de Netlify antes de cerrar decisiones de plan — son estables pero cambian con el tier.

Dos consecuencias que la gente descubre tarde y duelen:

1. **Subir imágenes proxeadas por el backend es imposible.** 6 MB de límite y 10 s de timeout. La única salida es subida directa firmada del navegador a Cloudinary. Está resuelto en §8.
2. **Un solo Lambda caliente sirve mejor que muchos fríos.** Partir la API en `api-cuentas`, `api-propiedades`, `api-admin` fragmenta el calentamiento y multiplica cold starts. Se mantiene **una función API** + funciones aparte solo para webhooks, cron y trabajos largos.

---

## 1. Opciones de stack

### Opción A — Netlify Functions + Neon + Hono ⭐ **recomendada**

```
Navegador → Netlify CDN (public/) → Netlify Function (Hono) → Neon Postgres
                                          ↓
                            Cloudinary · Culqi · Resend
```

| ✅ A favor | ⚠️ En contra |
|---|---|
| Continúa lo que ya está desplegado y funcionando | 10 s de timeout obliga a background jobs |
| Un solo deploy: front y back juntos | Cold starts en tráfico bajo |
| Escala a cero — costo casi nulo al arrancar | Sin conexiones persistentes (no WebSockets) |
| Neon branching por deploy preview | |
| Postgres completo: FTS, PostGIS, JSONB | |

**Costo al arrancar:** ~US$ 0–25/mes (Netlify free/pro + Neon free + Cloudinary free).

### Opción B — Supabase

Postgres + Auth + Storage + Realtime + RLS en un solo producto.

| ✅ A favor | ⚠️ En contra |
|---|---|
| Auth, storage y realtime resueltos de fábrica | **Tirás a la basura el auth que ya funciona** |
| RLS da seguridad a nivel de fila | RLS con roles + membresía de agencia + propiedad del recurso se vuelve difícil de razonar |
| Buen panel de administración de datos | Storage sin transformaciones de imagen — igual necesitás Cloudinary |
| | Lógica de negocio termina en Edge Functions (Deno) igual |

**Cuándo sí:** si estuvieras arrancando de cero. No es tu caso — tenés auth, esquema y rutas andando.

### Opción C — Contenedor Node en Railway / Render / Fly

| ✅ A favor | ⚠️ En contra |
|---|---|
| Sin timeouts ni cold starts | Costo fijo desde el día 1 (~US$ 20–40/mes) |
| Pool de conexiones normal, cron interno, WebSockets | Dos deploys separados (Netlify + backend) |
| Cualquier librería de Node sin fricción | CORS, cookies cross-origin, dominio aparte |
| | Escalado y monitoreo a tu cargo |

**Cuándo sí:** cuando el timeout de 10 s se vuelva un problema real y recurrente. Es la ruta de escape natural, y **Hono migra sin reescribir** (corre igual en Node con `@hono/node-server`).

---

## 2. La elección para un MVP con foco en velocidad

**Opción A: Netlify Functions + Neon Postgres + Hono + TypeScript.**

| Pieza | Elección | Por qué esta y no otra |
|---|---|---|
| Runtime | Netlify Functions 2.0 | Usa `Request`/`Response` estándar → `export default app.fetch` funciona directo |
| Framework | **Hono** | ~14 KB, hecho para serverless, routing + middleware + validación. Portable a Node/Cloudflare/Deno sin reescribir |
| Lenguaje | **TypeScript** | Ver nota abajo |
| Validación | **Zod** + `@hono/zod-validator` | Un solo esquema valida y tipa. Mensajes de error en español |
| Driver BD | `@neondatabase/serverless` | HTTP, sin pool — el único que funciona bien en Lambda |
| Consultas | SQL a mano con tagged templates | Sin ORM: las consultas de búsqueda facetada son el corazón del producto y un ORM estorba |
| Migraciones | Archivos `.sql` numerados + runner propio | 60 líneas, cero dependencias, control total |
| Imágenes | Cloudinary (subida firmada directa) | Obligado por el límite de 6 MB |
| Pagos | **Culqi** | Peruano, soporta **Yape** y tarjetas locales. Stripe no sirve para Perú |
| Email | Resend | API simple, buen deliverability |
| Errores | Sentry | Hoy no hay ninguna visibilidad |

**Sobre TypeScript.** Netlify lo compila solo con esbuild, sin configuración extra. Con ~20 tablas relacionadas y código generado con IA, TS atrapa exactamente los errores que se cuelan silenciosos: un campo mal escrito, un `null` no contemplado, un rol que no existe. Si preferís JavaScript plano, **la estructura de carpetas es idéntica** — cambiá las extensiones y seguí. No es un bloqueo.

**Lo que descarto a propósito:**
- **ORM (Prisma/Drizzle).** Prisma pesa mucho en Lambda y su cliente sufre sin pool. La búsqueda con rangos, facetas y geo se escribe mejor en SQL. Drizzle es una alternativa razonable si querés tipado en las consultas.
- **GraphQL.** Un cliente (tu propio front), consultas predecibles. Suma complejidad sin pagar nada.
- **Microservicios.** A esta escala son puro costo.

---

## 3. Base de datos: Neon Postgres

**Ya la elegiste bien.** Solo hay que conectarla — hoy `DATABASE_URL` no está configurada y el backend está muerto en producción.

### Por qué Postgres y no otra cosa

La búsqueda de un portal inmobiliario es el caso relacional de manual:

```sql
-- Departamentos en venta, Miraflores o San Isidro,
-- US$120k–250k, 2-3 dorm, ≥80 m², con ascensor, ordenados por precio
WHERE estado='activo' AND operacion='venta' AND tipo='departamento'
  AND ubicacion_id = ANY($1) AND precio BETWEEN $2 AND $3
  AND dormitorios BETWEEN 2 AND 3 AND area_m2 >= 80
  AND caracteristicas @> '{"ascensor":true}'
ORDER BY precio ASC
```

Rangos + facetas + orden + geo + conteo total. Eso pide un motor relacional con índices compuestos.

| Alternativa | Por qué no |
|---|---|
| MongoDB / Firestore | Rangos combinados con facetas y ordenamientos arbitrarios son su punto débil. Terminás manteniendo índices a mano para cada combinación |
| PlanetScale (MySQL) | Sin PostGIS (mapa), sin JSONB con índices GIN, FTS más pobre. Sin claves foráneas |
| Supabase | Es Postgres también — la diferencia no es la BD, es el resto del producto (§1) |

**Extensiones que necesitás activar desde el día 1:**

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- tolerancia a typos
CREATE EXTENSION IF NOT EXISTS unaccent;   -- "Jesus Maria" = "Jesús María" ← crítico en español
CREATE EXTENSION IF NOT EXISTS postgis;    -- Fase 3, mapa
```

`unaccent` no es opcional en un producto en español peruano. Sin eso, quien escriba "jesus maria" o "san borja" sin tilde no encuentra nada.

**Ventaja concreta con Netlify:** Neon branching. Cada deploy preview levanta una rama de la base con datos reales copiados, y se destruye al mergear. Probás migraciones sin tocar producción.

---

## 4. Servicios / módulos

Doce módulos. Cada uno es una carpeta con sus rutas, su lógica y sus consultas.

| Módulo | Responsabilidad | Rutas principales |
|---|---|---|
| **cuentas** | Registro, login, sesión, verificación de email, reset de contraseña | `/cuentas/*` |
| **perfiles** | Perfil de usuario, foto, datos de contacto | `/perfil` |
| **agencias** | Inmobiliarias, miembros, asientos, verificación de RUC | `/agencias/*` |
| **propiedades** | CRUD de avisos, ciclo de vida (borrador→revisión→activo→vencido), fotos | `/propiedades/*` |
| **ubicaciones** | Departamento/provincia/distrito normalizados, alias, autocompletado | `/ubicaciones/*` |
| **busqueda** | Búsqueda pública facetada, orden, paginación, conteos | `/buscar` |
| **leads** | Formularios de contacto, bandeja, estados, mensajes | `/leads/*`, `/propiedades/:id/contacto` |
| **indice** | Índice de precios por m², cuotas por rol, estimador | `/indice/*` |
| **planes** | Catálogo, suscripciones, aplicación de límites | `/planes`, `/suscripciones/*` |
| **pagos** | Culqi, webhooks, destacados, boleta electrónica | `/pagos/*`, `/webhooks/culqi` |
| **admin** | Moderación, verificación, reportes, métricas, auditoría | `/admin/*` |
| **notificaciones** | Email (Resend), luego WhatsApp; plantillas | interno |

### Servicios transversales (`src/servicios/`)

- **`limites.ts`** — la única fuente de verdad de las cuotas del plan. `puedePublicar()`, `topeFotos()`, `cuotaIndice()`. **Siempre en backend, nunca solo en la UI.**
- **`auditoria.ts`** — registra toda acción administrativa. Una línea por operación sensible.
- **`almacenamiento.ts`** — firma subidas de Cloudinary y verifica que el asset exista.
- **`correo.ts`** — plantillas y envío.
- **`trabajos.ts`** — encolar tareas para background functions.

---

## 5. Estructura de carpetas

```
wasipe/
├─ public/                          # frontend actual, sin cambios de estructura
│  ├─ index.html  buscar.html  panel.html
│  ├─ registro.html  ingresar.html
│  ├─ propiedad.html                # NUEVA — ficha de detalle (Fase 1)
│  ├─ publicar.html                 # NUEVA — wizard de publicación (Fase 1)
│  ├─ admin/                        # NUEVA — panel admin (Fase 1)
│  ├─ cuenta.js  estilos.css
│
├─ netlify/functions/
│  ├─ api.ts                        # ÚNICA función API — export default app.fetch
│  ├─ webhook-culqi.ts              # webhooks aparte: otra auth, respuesta rápida
│  ├─ cron-vencimientos.ts          # programada: vence avisos, avisa 7 días antes
│  ├─ cron-alertas.ts               # programada: búsquedas guardadas
│  └─ trabajo-correos-background.ts # background (15 min): envíos masivos
│
├─ src/
│  ├─ app.ts                        # arma Hono, middleware global, monta módulos
│  │
│  ├─ modulos/
│  │  ├─ cuentas/       rutas.ts  servicio.ts  consultas.ts  esquemas.ts
│  │  ├─ perfiles/      …
│  │  ├─ agencias/      …
│  │  ├─ propiedades/   rutas.ts  servicio.ts  consultas.ts  esquemas.ts  estados.ts
│  │  ├─ ubicaciones/   …
│  │  ├─ busqueda/      rutas.ts  consultas.ts  filtros.ts
│  │  ├─ leads/         …
│  │  ├─ indice/        rutas.ts  servicio.ts  estimador.ts
│  │  ├─ planes/        …
│  │  ├─ pagos/         rutas.ts  culqi.ts  webhooks.ts  facturacion.ts
│  │  ├─ admin/         rutas.ts  moderacion.ts  metricas.ts  reglas.ts
│  │  └─ notificaciones/ correo.ts  plantillas/
│  │
│  ├─ lib/
│  │  ├─ auth.ts                    # firmar/verificar JWT, cookies, sesión
│  │  ├─ permisos.ts                # puede(usuario, accion, recurso)
│  │  ├─ errores.ts                 # ErrorHTTP, mensajes en español
│  │  ├─ validar.ts                 # helpers Zod (RUC, celular peruano, distrito)
│  │  ├─ limitar.ts                 # rate limiting sobre tabla intentos_auth
│  │  └─ respuesta.ts               # envelope uniforme
│  │
│  ├─ servicios/
│  │  ├─ almacenamiento.ts          # Cloudinary: firma + verificación
│  │  ├─ correo.ts                  # Resend
│  │  ├─ limites.ts                 # cuotas de plan ← fuente única de verdad
│  │  ├─ auditoria.ts
│  │  └─ trabajos.ts
│  │
│  └─ db/
│     ├─ cliente.ts                 # neon() + helpers sql
│     ├─ migrar.ts                  # runner con advisory lock
│     └─ migraciones/
│        ├─ 001_inicial.sql         # el esquema actual, extraído del bundle
│        ├─ 002_ubicaciones.sql
│        ├─ 003_propiedades_extra.sql
│        ├─ 004_agencias.sql
│        ├─ 005_planes_pagos.sql
│        └─ 006_moderacion.sql
│
├─ scripts/
│  ├─ sembrar-ubicaciones.ts        # distritos del Perú
│  ├─ sembrar-indice.ts             # CSV mensual → indice_precios
│  └─ sembrar-planes.ts
│
├─ netlify.toml
├─ package.json
└─ tsconfig.json
```

**La regla que mantiene esto ordenado:** `rutas.ts` solo valida entrada y llama a `servicio.ts`. `servicio.ts` tiene la lógica de negocio y llama a `consultas.ts`. `consultas.ts` es el único lugar donde se escribe SQL. Un módulo nunca importa `consultas.ts` de otro módulo — pasa por su servicio.

---

## 6. Arquitectura de la API

REST sobre recursos, nombres en español (coherente con lo que ya existe: `/cuentas`, `/propiedades`, `/perfil`, `/indice`).

### Versionado

`/api/v1/...` desde ahora. Cuesta una tarde hoy y es carísimo cuando ya haya app móvil o feed XML para inmobiliarias. Mantené `/api/*` redirigiendo a `/api/v1/*` para no romper las páginas actuales.

### Superficie completa

```
PÚBLICO (sin sesión)
  GET    /api/v1/salud
  GET    /api/v1/buscar                       ?operacion&tipo&distrito&precio_min&precio_max
                                              &area_min&dormitorios&banos&caracteristicas
                                              &dueno_directo&orden&pagina
  GET    /api/v1/propiedades/:slug            ficha pública (suma vista)
  POST   /api/v1/propiedades/:id/contacto     crear lead (rate-limited + honeypot)
  GET    /api/v1/ubicaciones/sugerir          ?q=  autocompletado
  GET    /api/v1/agentes/:slug                perfil público + cartera
  GET    /api/v1/inmobiliarias/:slug
  GET    /api/v1/planes

CUENTA
  POST   /api/v1/cuentas/registro
  POST   /api/v1/cuentas/ingresar
  POST   /api/v1/cuentas/salir
  GET    /api/v1/cuentas/yo
  POST   /api/v1/cuentas/verificar            ?token
  POST   /api/v1/cuentas/recuperar
  POST   /api/v1/cuentas/password
  GET    /PATCH /api/v1/perfil

AVISOS (dueño del recurso)
  GET    /api/v1/propiedades                  mi cartera
  POST   /api/v1/propiedades                  crear borrador
  PATCH  /api/v1/propiedades/:id
  POST   /api/v1/propiedades/:id/publicar     borrador → revision
  POST   /api/v1/propiedades/:id/pausar
  POST   /api/v1/propiedades/:id/renovar
  DELETE /api/v1/propiedades/:id
  POST   /api/v1/subidas/firma                firma de Cloudinary  ← §8
  POST   /api/v1/propiedades/:id/fotos        confirmar foto subida
  PATCH  /api/v1/propiedades/:id/fotos        reordenar / portada
  DELETE /api/v1/propiedades/:id/fotos/:fid

LEADS · ÍNDICE · PLANES
  GET    /api/v1/leads                        ?estado
  PATCH  /api/v1/leads/:id                    cambiar estado
  GET    /api/v1/indice                       consume cuota
  GET    /api/v1/indice/distrito/:slug
  POST   /api/v1/indice/estimar
  GET    /api/v1/suscripcion
  POST   /api/v1/suscripciones                iniciar pago
  POST   /api/v1/destaques                    comprar destacado

ADMIN (rol=admin)
  GET    /api/v1/admin/moderacion             cola por riesgo
  POST   /api/v1/admin/propiedades/:id/aprobar
  POST   /api/v1/admin/propiedades/:id/rechazar   { motivo }
  GET    /api/v1/admin/usuarios               ?q&rol&estado
  POST   /api/v1/admin/usuarios/:id/verificar
  POST   /api/v1/admin/usuarios/:id/suspender
  GET    /api/v1/admin/reportes
  POST   /api/v1/admin/indice/cargar          CSV mensual
  GET    /api/v1/admin/metricas

WEBHOOKS (función aparte, sin sesión, firma verificada)
  POST   /api/webhooks/culqi
```

### Contrato de respuesta

Uniforme, y **los mensajes de error son texto que se le muestra al usuario, en español**. Eso ya lo venías haciendo bien (*"La base de datos no está conectada todavía. Estamos en eso."*) — vale formalizarlo.

```ts
// Éxito
{ "propiedades": [...], "total": 142, "pagina": 1 }

// Error
{
  "error":  "Ese correo ya tiene una cuenta.",   // se muestra tal cual
  "codigo": "EMAIL_DUPLICADO",                    // lo consume el código
  "campo":  "email"                               // el front marca el input
}
```

`panel.html` ya lee `err.datos.campo` para enfocar el input con error — el contrato mantiene esa mecánica.

### Middleware, en orden

```
1. requestId + Sentry
2. Headers de seguridad (CSP, HSTS, X-Frame-Options)
3. Parseo de cookie de sesión → c.set('usuario')
4. Rate limiting por clase de ruta
5. Validación Zod del body/query
6. Handler
7. Captura de errores → envelope en español
```

### Detalles que evitan dolor después

- **Paginación:** `?pagina=` para búsqueda (la gente no pasa de la página 5). Cursor solo si aparece una vista de scroll infinito.
- **Idempotencia en pagos:** header `Idempotency-Key` en `POST /suscripciones`. Los webhooks de Culqi llegan repetidos — guardá `proveedor_ref` con índice único y descartá duplicados.
- **Rate limits:** contacto 5/hora por IP+propiedad · login 8/15 min · registro 3/hora por IP · búsqueda 120/min. Usa la tabla `intentos_auth` que ya tenés.
- **Conteo total en búsqueda:** `COUNT(*) OVER()` en la misma consulta, no una segunda query.

---

## 7. Autenticación y autorización

### Lo que ya tenés y hay que conservar

JWT en cookie httpOnly, `version_token` por usuario para invalidar sesiones, rate limiting en `intentos_auth`, secreto autogenerado guardado en `config`. Es un diseño correcto. Tres ajustes:

1. **Mover el secreto a `JWT_SECRET` (env var)**, dejando el fallback a `config` solo para arranque en frío. Leer el secreto de la BD en cada verificación agrega una consulta a cada request.
2. **Hash con `bcrypt` coste 12** o Argon2id. Verificá cuál usa el bundle actual.
3. **Verificación de email obligatoria** antes de poder publicar (no antes de navegar).

### Sesión

Una sola cookie de sesión, sin refresh tokens. Para un marketplace con frontend estático eso alcanza y evita complejidad que no compra nada.

```ts
// Cookie
nombre:   'wasipe_sesion'
httpOnly: true
secure:   true
sameSite: 'Lax'          // Lax basta: front y API son el mismo origen
path:     '/'
maxAge:   30 días

// Payload del JWT — mínimo, sin datos mutables
{ sub: usuario_id, rol, ver: version_token, exp }
```

**Invalidación:** al cambiar contraseña, cerrar sesión en todos los dispositivos o suspender un usuario, se incrementa `usuarios.version_token`. Cualquier JWT con `ver` distinto se rechaza. Sin tabla de sesiones ni Redis.

**CSRF:** cookie `SameSite=Lax` + exigir `Content-Type: application/json` en toda mutación. Un form cross-site no puede mandar ese content-type sin preflight CORS, y CORS está cerrado a tu propio origen. Suficiente para este caso.

### Autorización — tres capas que se combinan

Esta es la parte que se suele hacer mal. En Wasipe conviven tres cosas distintas:

```
1. ROL DE USUARIO         propietario · agente · inmobiliaria · admin
2. MEMBRESÍA DE AGENCIA   dueno · admin · agente   (tabla agencia_miembros)
3. PROPIEDAD DEL RECURSO  ¿este aviso es suyo, o de su agencia?
```

Un solo punto de decisión, `src/lib/permisos.ts`:

```ts
export function puede(u: Sesion, accion: Accion, recurso?: Recurso): boolean {
  if (u.rol === 'admin') return true;

  switch (accion) {
    case 'aviso.editar':
      return esDueno(u, recurso) || esDeSuAgencia(u, recurso);
    case 'aviso.publicar':
      return u.email_verificado && dentroDelPlan(u) && esDueno(u, recurso);
    case 'agencia.invitar':
      return esRolAgencia(u, recurso.agencia_id, ['dueno', 'admin']);
    case 'indice.consultar':
      return quedaCuota(u);
    default:
      return false;
  }
}
```

Nunca chequees permisos dentro de un handler. Siempre `puede()`. Cuando en Fase 2 aparezcan las agencias con equipos, cambiás una función y no cincuenta handlers.

### Los límites del plan viven en el backend

```ts
// src/servicios/limites.ts — fuente única de verdad
await limites.verificar(usuario, 'publicar_aviso');  // lanza 402 si excede
await limites.verificar(usuario, 'subir_foto', { propiedad_id });
await limites.consumirCuotaIndice(usuario);          // reusa consultas_indice
```

Ocultar el botón en la UI no es un control de acceso. La cuota del índice ya la tenés bien resuelta con la tabla `consultas_indice` — el mismo patrón aplica a avisos, fotos y destacados.

---

## 8. Almacenamiento de archivos

### La regla que no se negocia

**Las imágenes nunca pasan por la Netlify Function.** Límite de 6 MB y 10 s de timeout: una foto de celular de 8 MB rompe el request, y diez fotos garantizan timeout.

### Flujo: subida directa firmada a Cloudinary

```
1. Navegador → POST /api/v1/subidas/firma  { propiedad_id, cantidad: 5 }

2. Backend:
     - verifica sesión y que el aviso sea suyo
     - verifica cuota de fotos del plan
     - genera firma HMAC con CLOUDINARY_API_SECRET
     - responde { firma, timestamp, carpeta, api_key, cloud_name }
     ↑ el secreto nunca sale del servidor

3. Navegador → POST directo a Cloudinary (sin pasar por Netlify)
     - barra de progreso real
     - sin límite de 6 MB
     - Cloudinary devuelve { public_id, secure_url, width, height, bytes, phash }

4. Navegador → POST /api/v1/propiedades/:id/fotos  { public_id }

5. Backend:
     - consulta la Admin API de Cloudinary por ese public_id
     - confirma que existe y está en la carpeta esperada  ← evita URLs falsificadas
     - guarda en tabla `fotos`
```

El paso 5 es el que suele faltar. Sin esa verificación, cualquiera manda un `public_id` inventado o ajeno y tu base guarda basura.

### Configuración

```
Carpetas:   wasipe/propiedades/{propiedad_id}/{uuid}
            wasipe/perfiles/{usuario_id}
            wasipe/agencias/{agencia_id}

Transformaciones (eager, al subir):
  miniatura  400×300   f_auto q_auto:eco   ← tarjetas de búsqueda
  ficha     1200×900   f_auto q_auto:good  ← galería del detalle
  og        1200×630   f_auto              ← redes sociales

Reglas: máx 12 MB por imagen · solo jpg/png/webp/heic
        strip EXIF (los celulares guardan GPS de la casa ← privacidad)
        pHash guardado para detectar fotos robadas o duplicadas
```

`f_auto` sirve AVIF/WebP según el navegador. En un portal con 20 fotos por aviso eso es la diferencia entre una ficha que carga en 1 s y una que carga en 6 s — y pesa directo en el SEO.

**Limpieza:** un cron semanal borra assets de Cloudinary sin fila en `fotos` (subidas abandonadas a mitad del wizard).

**Alternativa evaluada:** Netlify Blobs. Está integrado y es más barato, pero **no transforma imágenes** — tendrías que generar miniaturas vos y servirlas sin `f_auto`. Para un portal inmobiliario, donde la foto *es* el producto, Cloudinary se paga solo.

---

## 9. Búsqueda

### Fase 1–2: Postgres. Sin motor externo.

Con menos de ~100.000 avisos, Postgres bien indexado responde en menos de 50 ms. Meter Meilisearch antes de eso es sumar un sistema que sincronizar sin ganar nada.

### Los índices que hacen la diferencia

```sql
-- Índice parcial: el 95% de las búsquedas solo tocan avisos activos.
-- Filtrar por estado achica el índice muchísimo.
CREATE INDEX ix_busqueda_activos ON propiedades
  (operacion, tipo, ubicacion_id, precio)
  WHERE estado = 'activo';

CREATE INDEX ix_busqueda_orden ON propiedades (publicado_en DESC)
  WHERE estado = 'activo';

-- Filtros por características (ascensor, piscina, mascotas…)
CREATE INDEX ix_caracteristicas ON propiedades USING GIN (caracteristicas jsonb_path_ops);

-- Texto libre, sin tildes, tolerante a typos
ALTER TABLE propiedades ADD COLUMN busqueda_tsv tsvector
  GENERATED ALWAYS AS (
    to_tsvector('spanish',
      unaccent(coalesce(titulo,'') || ' ' || coalesce(descripcion,'')))
  ) STORED;
CREATE INDEX ix_tsv ON propiedades USING GIN (busqueda_tsv);

-- Autocompletado de distritos tolerante a errores
CREATE INDEX ix_ubic_trgm ON ubicaciones USING GIN (distrito gin_trgm_ops);
```

El **índice parcial** (`WHERE estado='activo'`) y **`unaccent`** son las dos decisiones que más rinden. Sin `unaccent`, buscar "jesus maria" devuelve cero resultados y el usuario se va.

### Forma de la consulta

```sql
SELECT p.*, u.distrito, u.provincia,
       (SELECT url FROM fotos f WHERE f.propiedad_id = p.id
        ORDER BY es_portada DESC, orden LIMIT 1) AS portada,
       COUNT(*) OVER() AS total,                    -- total en la misma query
       ROUND(100.0 * (p.precio / NULLIF(p.area_m2,0) - i.precio_m2_usd)
                   / NULLIF(i.precio_m2_usd,0)) AS vs_mercado   -- ← el diferenciador
FROM propiedades p
JOIN ubicaciones u ON u.id = p.ubicacion_id
LEFT JOIN indice_precios i ON i.distrito = u.distrito AND i.periodo = $periodo
WHERE p.estado = 'activo'
  AND ($operacion  IS NULL OR p.operacion = $operacion)
  AND ($ubicaciones IS NULL OR p.ubicacion_id = ANY($ubicaciones))
  AND ($precio_min IS NULL OR p.precio >= $precio_min)
  AND ($caracteristicas IS NULL OR p.caracteristicas @> $caracteristicas)
ORDER BY
  CASE WHEN p.destacado_hasta > now() THEN 0 ELSE 1 END,   -- destacados primero
  CASE $orden WHEN 'precio_asc' THEN p.precio END ASC NULLS LAST,
  p.publicado_en DESC
LIMIT 24 OFFSET $offset;
```

Fijate que `vs_mercado` — el badge *"12% debajo del promedio de Miraflores"* — **sale de la misma consulta**, sin llamadas extra. Ese es el argumento fuerte de tener el índice en la misma base que los avisos.

### Cuándo migrar a Meilisearch

Cuando el p95 de búsqueda pase de ~300 ms de forma sostenida, o cuando quieras búsqueda con typo-tolerancia real sobre texto libre. Momento estimado: 50–100k avisos activos, o sea bastante después del lanzamiento. Para entonces el patrón es: Postgres sigue siendo la verdad, Meilisearch se sincroniza con un background job.

**No** uses Algolia: cobra por operación y una búsqueda inmobiliaria dispara muchas consultas por sesión.

---

## 10. Despliegue

### `netlify.toml`

```toml
[build]
  command   = "npm run build && npm run migrar"
  publish   = "public"
  functions = "netlify/functions"

[functions]
  node_bundler = "esbuild"

[functions."cron-vencimientos"]
  schedule = "0 8 * * *"        # 08:00 UTC = 03:00 Lima, todos los días

[functions."cron-alertas"]
  schedule = "0 13 * * *"       # 08:00 Lima

[[redirects]]
  from = "/api/v1/*"
  to   = "/.netlify/functions/api/:splat"
  status = 200
  force = true

[[redirects]]                    # compatibilidad con las páginas actuales
  from = "/api/*"
  to   = "/.netlify/functions/api/:splat"
  status = 200
  force = true

[[redirects]]
  from = "/api/webhooks/culqi"
  to   = "/.netlify/functions/webhook-culqi"
  status = 200
  force = true

# Rutas limpias del frontend
[[redirects]] from = "/buscar"          to = "/buscar.html"     status = 200
[[redirects]] from = "/propiedad/*"     to = "/propiedad.html"  status = 200
[[redirects]] from = "/agente/*"        to = "/agente.html"     status = 200
[[redirects]] from = "/publicar"        to = "/publicar.html"   status = 200

[[headers]]
  for = "/*"
  [headers.values]
    X-Content-Type-Options   = "nosniff"
    X-Frame-Options          = "DENY"
    Referrer-Policy          = "strict-origin-when-cross-origin"
    Strict-Transport-Security = "max-age=31536000; includeSubDomains"
    Content-Security-Policy  = "default-src 'self'; img-src 'self' https://res.cloudinary.com data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self' https://api.cloudinary.com https://pago.culqi.com"
```

### Migraciones — el punto delicado

Corren en el build, **con advisory lock** para que dos deploys simultáneos no choquen:

```ts
// src/db/migrar.ts
const sql = neon(process.env.DATABASE_URL!);

await sql`SELECT pg_advisory_lock(20260805)`;         // serializa deploys
try {
  await sql`CREATE TABLE IF NOT EXISTS migraciones (
    nombre TEXT PRIMARY KEY, aplicada_en TIMESTAMPTZ DEFAULT now())`;

  const hechas = new Set((await sql`SELECT nombre FROM migraciones`).map(r => r.nombre));

  for (const archivo of listarOrdenadas('src/db/migraciones')) {
    if (hechas.has(archivo)) continue;
    console.log(`→ aplicando ${archivo}`);
    await sql.transaction([...sentenciasDe(archivo)]);
    await sql`INSERT INTO migraciones (nombre) VALUES (${archivo})`;
  }
} finally {
  await sql`SELECT pg_advisory_unlock(20260805)`;
}
```

Si una migración falla, el build falla y **el deploy no sale**. Esa es la propiedad que querés: nunca desplegar código que espera un esquema que no existe.

> Migrá lo que ya tenés a `001_inicial.sql` extrayendo los `CREATE TABLE` del bundle actual, y marcala como aplicada en la base de producción antes del primer deploy — si no, intentará recrear tablas existentes.

### Entornos

| Contexto | Base de datos | Cloudinary | Culqi |
|---|---|---|---|
| `production` | Neon rama `main` | carpeta `wasipe/` | llaves live |
| `deploy-preview` | **rama Neon efímera** | carpeta `wasipe-dev/` | llaves test |
| local (`netlify dev`) | rama Neon `dev` | carpeta `wasipe-dev/` | llaves test |

Neon branching + deploy previews de Netlify significa que cada PR levanta su propia base con datos reales copiados y se destruye al mergear. Probás migraciones sin riesgo.

### Variables de entorno

```
DATABASE_URL              ← FALTA HOY. Nada funciona sin esto.
JWT_SECRET                ← generar: openssl rand -base64 48
CLOUDINARY_CLOUD_NAME  CLOUDINARY_API_KEY  CLOUDINARY_API_SECRET
CULQI_PUBLIC_KEY  CULQI_SECRET_KEY  CULQI_WEBHOOK_SECRET
RESEND_API_KEY
SENTRY_DSN
URL_SITIO=https://wasipe.netlify.app
```

Marcá todas como **secret** en Netlify (no se imprimen en logs de build) salvo `URL_SITIO` y las llaves públicas.

### Observabilidad mínima

- **Sentry** en la función API, con `requestId` en cada error.
- `GET /api/v1/salud` verifica BD + Cloudinary + Culqi (ya existe el endpoint, hay que ampliarlo).
- Monitor externo (UptimeRobot) pegándole a `/salud` cada 5 min — hoy tu backend está caído en producción y nadie se enteró.
- Alerta si la cola de moderación pasa de 50 avisos o si algún pago queda `pendiente` más de 1 h.

### Rollback

Netlify guarda todos los deploys: "Publish deploy" anterior revierte en segundos. **Cuidado:** el código vuelve atrás, la base no. Por eso las migraciones deben ser **compatibles hacia atrás** — agregar columnas, no renombrarlas ni borrarlas. Para eliminar una columna: dejá de usarla en un deploy, borrala en el siguiente.

---

## 11. Orden de construcción

```
SEMANA 1 — cimientos
  1. Conectar DATABASE_URL en Netlify        ← el backend está caído hoy
  2. Repo git + esqueleto TypeScript + Hono
  3. Extraer el esquema del bundle → 001_inicial.sql + runner de migraciones
  4. Portar cuentas/ y perfiles/ a la nueva estructura, verificar paridad
  5. Sentry + /salud ampliado + monitor externo

SEMANA 2 — el circuito del aviso
  6. ubicaciones/ + siembra de distritos + autocompletado
  7. servicios/almacenamiento.ts (firma Cloudinary + verificación)
  8. propiedades/ CRUD + máquina de estados
  9. lib/permisos.ts + servicios/limites.ts

SEMANA 3 — que se vea
  10. busqueda/ con los índices de §9
  11. Ficha pública /propiedad/:slug + JSON-LD
  12. leads/ + bandeja
  13. notificaciones/ (Resend)

SEMANA 4 — control
  14. admin/ moderación + reglas de riesgo + auditoría
  15. cron-vencimientos + cron-alertas
  16. Headers de seguridad, rate limits, CSP

FASE 2
  17. planes/ + límites aplicados
  18. pagos/ Culqi + webhook idempotente + boleta electrónica
  19. agencias/ + membresías
```

**El orden respeta dependencias reales:** migraciones antes que cualquier módulo · ubicaciones antes que búsqueda · almacenamiento antes que el CRUD de avisos · permisos y límites antes que publicar · todo lo anterior antes que pagos.

---

## 12. Las tres decisiones que más importan

1. **Una función API, no muchas.** Un Lambda caliente sirve todo; partirlo multiplica cold starts. Solo se separan webhooks (otra auth), cron (schedule propio) y trabajos largos (background, 15 min).

2. **Las imágenes no tocan el backend.** El límite de 6 MB no es negociable. Subida directa firmada, con verificación posterior contra la Admin API de Cloudinary.

3. **El índice vive en la misma base que los avisos.** Por eso el badge *"12% debajo del mercado"* sale gratis en la misma consulta de búsqueda. Si algún día movés el índice a otro servicio, perdés eso — y eso es el producto.
