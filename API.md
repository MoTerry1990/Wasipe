# Wasipe — Especificación de la API REST

Base: `https://wasipe.netlify.app/api/v1` · ~65 endpoints
Campos y estados corresponden exactamente a [`001_inicial.sql`](src/db/migraciones/001_inicial.sql).

---

## 0. Convenciones

### Autenticación

Cookie `wasipe_sesion` (httpOnly, Secure, SameSite=Lax, 30 días). El navegador la manda sola — el frontend nunca toca el token. El cliente que ya tenés en `cuenta.js` funciona sin cambios.

Cada endpoint lleva una etiqueta de requisito:

| Etiqueta | Significa |
|---|---|
| `público` | Sin sesión |
| `sesión` | Cualquier usuario autenticado |
| `verificado` | Sesión + `email_verificado_en IS NOT NULL` |
| `dueño` | Titular del recurso, o miembro de su agencia |
| `plan` | Además sujeto a los topes del plan (puede dar 402) |
| `moderador` | `rol IN ('moderador','admin')` |
| `admin` | `rol = 'admin'` |

### Respuestas

```jsonc
// Recurso único
{ "propiedad": { … } }

// Colección paginada — misma forma que ya consume buscar.html
{ "resultados": [ … ], "total": 142, "pagina": 1, "paginas": 6, "por_pagina": 24 }

// Acción sin cuerpo
{ "ok": true, "mensaje": "Tu aviso ya está publicado." }
```

### Errores

```jsonc
{
  "error":  "Ese correo ya tiene una cuenta.",  // se muestra al usuario, tal cual
  "codigo": "EMAIL_DUPLICADO",                   // lo consume el código
  "campo":  "email"                              // opcional: el front enfoca el input
}
```

`error` **siempre** es texto listo para mostrar, en español. `cuenta.js` ya lanza `Object.assign(new Error(datos.error), { estado, datos })` y `panel.html` ya lee `err.datos.campo` — este contrato mantiene ambos.

| Código HTTP | Cuándo |
|---|---|
| `400` | Body malformado |
| `401` | Sin sesión o sesión vencida |
| `403` | Con sesión pero sin permiso |
| `402` | Excede el plan → incluye `plan_sugerido` |
| `404` | No existe, o no es visible para vos |
| `409` | Conflicto de estado (email duplicado, aviso ya publicado) |
| `422` | Validación fallida → incluye `campo` o `faltantes[]` |
| `429` | Rate limit → header `Retry-After` |

### Paginación

`?pagina=1` (1-indexado), `por_pagina` fijo por endpoint. El `total` sale de `COUNT(*) OVER()` en la misma consulta, no en una segunda.

### Límites de frecuencia

| Clase | Límite |
|---|---|
| `POST /cuentas/ingresar` | 8 / 15 min por email + IP |
| `POST /cuentas/registro` | 3 / hora por IP |
| `POST /cuentas/recuperar` | 3 / hora por email |
| `POST /propiedades/:id/contacto` | 5 / hora por IP + propiedad |
| `GET /buscar` | 120 / min por IP |
| Resto autenticado | 300 / min por usuario |

Se apoyan en la tabla `intentos_auth` que ya existe.

### Reglas de validación transversales

| Regla | Valor |
|---|---|
| `email` | RFC básico, ≤254, se guarda en minúsculas |
| `password` | 8–72 caracteres (72 = tope de bcrypt), no puede ser igual al email |
| `telefono` / `whatsapp` | `+51` + 9 dígitos, celular empieza en `9` |
| `ruc` | exactamente 11 dígitos |
| `moneda` | `USD` \| `PEN` |
| Todo texto | se recorta (`trim`); cadena vacía → `null` |
| Campos desconocidos | se ignoran, no dan error |

---

## 1. Autenticación · `/cuentas`

### `POST /cuentas/registro` — `público`
Crea la cuenta e inicia sesión. Envía el correo de verificación.

```jsonc
// Body
{ "email": "ana@correo.com", "password": "…", "nombre": "Ana Quispe",
  "rol": "propietario",            // comprador|propietario|agente|inmobiliaria
  "telefono": "+51987654321" }     // opcional
```
**Validación** · `nombre` 2–120 · `rol` no puede ser `moderador` ni `admin` (403 si se intenta) · email único ignorando cuentas dadas de baja.
**201** → `{ "usuario": {…}, "mensaje": "Te mandamos un correo para confirmar tu cuenta." }`
**409** `EMAIL_DUPLICADO`

### `POST /cuentas/ingresar` — `público`
```jsonc
{ "email": "ana@correo.com", "password": "…", "recordarme": true }
```
**200** → `{ "usuario": {…} }` + cookie. `recordarme:false` → cookie de sesión del navegador.
**401** `CREDENCIALES_INVALIDAS` — mensaje idéntico para email inexistente y contraseña mala (no filtrar qué cuentas existen).
**403** `CUENTA_SUSPENDIDA` · **429** `DEMASIADOS_INTENTOS`

### `POST /cuentas/salir` — `sesión`
Borra la cookie. **200** `{ "ok": true }`

### `POST /cuentas/salir-todo` — `sesión`
Incrementa `version_token`: invalida **todas** las sesiones del usuario en todos los dispositivos.

### `GET /cuentas/yo` — `sesión`
El endpoint que el frontend llama al cargar cada página.
```jsonc
{
  "usuario": { "id":"…","email":"…","nombre":"Ana Quispe","rol":"agente",
               "verificado":true,"email_verificado":true,"creado_en":"…" },
  "perfil":  { "foto_url":null,"bio":null,"whatsapp":"…","ubicacion":{…} },
  "agencia": { "id":"…","nombre":"…","slug":"…","rol_en_agencia":"agente" }, // o null
  "plan":    { "slug":"agente","nombre":"Agente",
               "avisos_usados":7,"tope_avisos":15,
               "indice_usadas":3,"cuota_indice_mes":null,
               "vence_en":"2026-09-04" }
}
```
Trae el plan de una vez para que el panel no tenga que pedirlo aparte. **401** si no hay sesión.

### `POST /cuentas/verificar-email` — `sesión`
Reenvía el correo. Máx 3/hora. **200** `{ "ok": true }`

### `POST /cuentas/verificar-email/confirmar` — `público`
`{ "token": "…" }` → marca `email_verificado_en`. **410** `TOKEN_VENCIDO` (24 h de validez).

### `POST /cuentas/recuperar` — `público`
`{ "email": "…" }` → **200 siempre**, exista o no la cuenta (no filtrar registros). Token válido 1 h.

### `POST /cuentas/recuperar/confirmar` — `público`
`{ "token": "…", "password": "…" }` → cambia contraseña, incrementa `version_token`, marca el token usado.

### `PATCH /cuentas/password` — `sesión`
`{ "password_actual": "…", "password_nueva": "…" }` → cierra las demás sesiones. **422** `PASSWORD_INCORRECTA`

### `PATCH /cuentas/email` — `sesión`
`{ "email": "…", "password": "…" }` → guarda pendiente y manda verificación al **nuevo** correo. El email no cambia hasta confirmar.

### `DELETE /cuentas` — `sesión`
`{ "password": "…", "motivo": "…" }` → baja lógica: `eliminado_en = now()`, avisos a `archivado`, se anonimizan los leads emitidos. Pagos y comprobantes se conservan (obligación contable).

---

## 2. Perfiles · `/perfil`, `/agencias`

### `GET /perfil` — `sesión` · `PATCH /perfil` — `sesión`
```jsonc
// PATCH: todos opcionales, null borra el valor
{ "nombre":"…", "telefono":"+51…", "whatsapp":"+51…",
  "foto_url":"https://res.cloudinary.com/…", "bio":"…",
  "ubicacion_id":"uuid", "sitio_web":"https://…" }
```
**Validación** · `bio` ≤600 · `foto_url` debe ser del dominio de tu Cloudinary (rechazar URLs arbitrarias) · `sitio_web` http/https.
**200** → `{ "perfil": {…}, "mensaje": "Guardamos tus cambios." }`

### `GET /perfil/agente` · `PATCH /perfil/agente` — `sesión` + rol `agente|inmobiliaria`
```jsonc
{ "slug":"ana-quispe", "colegiatura":"…", "anios_experiencia":6,
  "zonas":["uuid-miraflores","uuid-barranco"],
  "especialidades":["residencial"], "idiomas":["es","en"], "acepta_leads":true }
```
**Validación** · `slug` `^[a-z0-9-]{3,60}$`, único, inmutable una vez que tiene avisos publicados (rompería SEO) · `zonas` ≤10 ubicaciones existentes.

### `GET /agentes/:slug` — `público`
Perfil público + cartera activa. Alimenta `/agente/:slug`.
```jsonc
{ "agente": { "nombre":"…","foto_url":"…","bio":"…","verificado":true,
              "anios_experiencia":6,"zonas":[…],"agencia":{…},
              "whatsapp":"+51…","avisos_activos":12,
              "miembro_desde":"2026-03-01" },
  "propiedades": [ … ] }          // primeras 12
```
**404** si el usuario está suspendido o dado de baja.

### `GET /inmobiliarias/:slug` — `público`
Igual, más `proyectos[]` y `equipo[]`.

### `POST /agencias` — `verificado` + rol `inmobiliaria`
```jsonc
{ "nombre":"Grupo Andino","ruc":"20123456789","telefono":"+51…",
  "ubicacion_id":"uuid","direccion":"…","sitio_web":"…" }
```
El creador queda como `dueno` en `agencia_miembros`. Nace con `verificada=false`.
**409** `RUC_DUPLICADO`

### `PATCH /agencias/:id` — `dueño|admin` de la agencia
### `GET /agencias/:id/miembros` — `miembro`
### `POST /agencias/:id/miembros` — `dueño|admin` + `plan`
`{ "email":"…", "rol":"agente" }` → invitación por correo (token en `tokens_cuenta`, tipo `invitacion`).
**402** `TOPE_ASIENTOS` si supera `planes.tope_asientos`.
### `DELETE /agencias/:id/miembros/:usuarioId` — `dueño|admin`
Los avisos del removido **quedan en la agencia**. No se puede quitar al último `dueno` (**409** `AGENCIA_SIN_DUENO`).

---

## 3. Avisos · `/propiedades`

> Asimetría deliberada: `GET /propiedades` (sin id) devuelve **mis** avisos y pide sesión — así lo llama hoy `panel.html`. `GET /propiedades/:slug` es **público**. Se mantiene por compatibilidad con el frontend existente.

### `GET /propiedades` — `sesión`
Mi cartera (o la de mi agencia).
`?estado=activo&pagina=1&orden=recientes`
```jsonc
{ "resultados": [{
    "id":"…","codigo":"WSP-10428","slug":"…","titulo":"…",
    "estado":"activo","operacion":"venta","tipo":"departamento",
    "precio":185000,"moneda":"USD",
    "distrito":"Miraflores","area_m2":92,"dormitorios":3,
    "portada":"https://res.cloudinary.com/…",
    "vistas":842,"leads":11,"leads_nuevos":3,
    "destacado_hasta":null,"vence_en":"2026-11-03",
    "dias_para_vencer":21 }],
  "total":7, "pagina":1, "paginas":1, "por_pagina":24 }
```

### `POST /propiedades` — `verificado` + `plan`
Crea un borrador. **Solo pide lo mínimo**: el wizard guarda paso a paso con `PATCH`.
```jsonc
{ "operacion":"venta", "tipo":"departamento", "ubicacion_id":"uuid" }
```
**201** → `{ "propiedad": { "id":"…","codigo":"WSP-10429","estado":"borrador" } }`
**402** `TOPE_AVISOS` → `{ "error":"Llegaste a los 15 avisos de tu plan.", "codigo":"TOPE_AVISOS", "plan_sugerido":"agente-pro" }`
**403** `EMAIL_NO_VERIFICADO`

### `GET /propiedades/:slug` — `público`
Ficha pública. Acepta slug **o** UUID. Suma vista (deduplicada por IP/día) y actualiza `vistas_propiedad`.
```jsonc
{ "propiedad": {
    "id":"…","codigo":"WSP-10428","slug":"…",
    "titulo":"…","descripcion":"…",
    "operacion":"venta","tipo":"departamento",
    "precio":185000,"moneda":"PEN|USD","precio_ref_usd":185000,
    "mantenimiento":280,"moneda_mant":"PEN","precio_negociable":false,
    "area_m2":92,"area_techada_m2":88,
    "dormitorios":3,"banos":2,"medio_bano":1,"cocheras":1,
    "piso":8,"pisos_edificio":15,"antiguedad":4,
    "estado_inmueble":"buen-estado","amoblado":"no",
    "ubicacion":{ "distrito":"Miraflores","provincia":"Lima",
                  "departamento":"Lima","slug":"miraflores" },
    "referencia":"A media cuadra del parque Kennedy",
    "lat":-12.12,"lng":-77.03,          // null si ocultar_mapa
    "caracteristicas":["ascensor","gimnasio","acepta-mascotas"],
    "medios":[{ "id":"…","tipo":"foto","url":"…","ambiente":"sala",
                "ancho":1600,"alto":1200,"es_portada":true }],
    "vs_mercado": { "porcentaje":-12, "precio_m2":2011,
                    "indice_m2":2285, "periodo":"2026-08",
                    "muestras":184 },     // ← el diferenciador
    "publica": { "tipo":"agente","nombre":"Ana Quispe","slug":"ana-quispe",
                 "foto_url":"…","verificado":true,
                 "agencia":{ "nombre":"…","slug":"…" },
                 "responde_en":"~2 horas" },
    "publicado_en":"…","actualizado_en":"…","vence_en":"…" },
  "similares":[ … ]   // 4 avisos parecidos, mismo distrito y rango
}
```
`direccion` **nunca** se expone públicamente; solo `referencia`. Si `ocultar_mapa`, se devuelven `lat`/`lng` desplazados ~300 m.
**404** si el estado no es `activo` (salvo que seas el dueño o admin).
**301** si el slug está en `slugs_historicos` → redirige al vigente.

### `PATCH /propiedades/:id` — `dueño`
Todos los campos opcionales. Editar un aviso `activo` con cambios sustanciales (precio, área, ubicación) lo devuelve a `revision`; cambios menores no.
```jsonc
{ "titulo":"…","descripcion":"…","precio":185000,"moneda":"USD",
  "area_m2":92,"dormitorios":3,"banos":2,"piso":8,"antiguedad":4,
  "mantenimiento":280,"precio_negociable":false,
  "ubicacion_id":"uuid","referencia":"…","lat":-12.12,"lng":-77.03,
  "ocultar_mapa":false,
  "caracteristicas":["ascensor","gimnasio"] }   // reemplaza el conjunto completo
```
**Validación** (espeja los CHECK del esquema) · `titulo` 10–140 · `descripcion` ≤5000 · `precio` >0, ≤14 dígitos con 2 decimales · `area_m2` >0 y <1 000 000 · `dormitorios`/`banos`/`cocheras` 0–30 · `piso` −5–120 · `antiguedad` 0–200 · `lat` −90–90 · `lng` −180–180 · `caracteristicas` deben existir en el catálogo y aplicar al `tipo`.
**Además** · teléfonos o correos dentro de `descripcion` → **422** `CONTACTO_EN_DESCRIPCION` (evade el registro de leads) · `ubicacion_id` debe estar `activo`.

### `POST /propiedades/:id/publicar` — `dueño` + `verificado` + `plan`
`borrador|rechazado → revision`. Si el usuario está verificado y sin historial de rechazos, salta directo a `activo`.

Cuando falta algo devuelve la lista completa, no el primer error — el wizard los muestra todos juntos:
```jsonc
// 422
{ "error":"A tu aviso le falta información.",
  "codigo":"AVISO_INCOMPLETO",
  "faltantes":[
    { "campo":"precio",  "mensaje":"Ponle precio. En Wasipe el precio siempre se ve." },
    { "campo":"medios",  "mensaje":"Sube al menos 3 fotos." },
    { "campo":"titulo",  "mensaje":"El título necesita al menos 10 caracteres." }] }
```
**Requisitos** · precio, título, ≥3 fotos, portada elegida, ubicación, área, y `dormitorios` salvo `terreno`/`cochera`.
**200** → `{ "estado":"revision", "mensaje":"Tu aviso está en revisión. Suele tomar menos de 2 horas." }`

### `POST /propiedades/:id/pausar` · `/reactivar` — `dueño`
`activo ↔ pausado`. Reactivar revalida el tope del plan (**402**).

### `POST /propiedades/:id/renovar` — `dueño`
Empuja `vence_en` según `planes.dias_vigencia_aviso`, setea `renovado_en`. Permitido desde 15 días antes de vencer o hasta 30 días después.
**200** → `{ "vence_en":"2027-02-01", "mensaje":"Renovado por 90 días más." }`

### `POST /propiedades/:id/cerrar` — `dueño`
```jsonc
{ "motivo":"vendida",           // vendida|alquilada|desistio|otro
  "precio_final":178000,        // opcional pero muy valioso
  "moneda":"USD" }
```
`precio_final` alimenta `indice_precios` con cierres reales en vez de solo precios pedidos. Pedirlo con un incentivo (una consulta extra de índice) mejora mucho la calidad del dato.

### `DELETE /propiedades/:id` — `dueño`
Baja lógica (`eliminado_en`). Los leads se conservan.

### `GET /propiedades/:id/metricas` — `dueño`
`?desde=2026-07-01&hasta=2026-08-05`
```jsonc
{ "totales":{ "vistas":842,"vistas_unicas":610,"contactos":11,
              "favoritos":24,"tasa_contacto":1.8 },
  "por_dia":[{ "dia":"2026-08-01","vistas":42,"contactos":1 }],
  "comparacion":{ "vistas_promedio_distrito":315,
                  "posicion":"por encima del promedio" } }
```

---

## 4. Media · `/medios`

> **Las imágenes nunca pasan por la API.** Netlify Functions corta en 6 MB y 10 s. Subida directa firmada, en tres pasos.

### `POST /medios/firma` — `dueño` + `plan`
Paso 1: pedir permiso para subir.
```jsonc
// Body
{ "propiedad_id":"uuid", "cantidad":5 }
```
```jsonc
// 200
{ "firma":"a3f…", "timestamp":1785000000,
  "api_key":"…", "cloud_name":"wasipe",
  "carpeta":"wasipe/propiedades/<uuid>",
  "restantes":15 }        // fotos que aún caben en el plan
```
**402** `TOPE_FOTOS` · **403** si el aviso no es tuyo.
El `api_secret` nunca sale del servidor. La firma vence a los 10 minutos.

*Paso 2 (sin backend):* el navegador sube directo a `https://api.cloudinary.com/v1_1/<cloud>/image/upload`. Barra de progreso real, sin tope de 6 MB.

### `POST /propiedades/:id/medios` — `dueño`
Paso 3: confirmar. El backend **consulta la Admin API de Cloudinary** para comprobar que el `public_id` existe y está en la carpeta esperada. Sin esa verificación cualquiera manda un id inventado o ajeno.
```jsonc
{ "public_id":"wasipe/propiedades/abc/xyz",
  "tipo":"foto", "ambiente":"sala", "texto_alt":"Sala con vista al parque" }
```
**201** → `{ "medio": { "id":"…","url":"…","ancho":1600,"alto":1200,"es_portada":false } }`
**422** `MEDIO_NO_ENCONTRADO` si Cloudinary no lo tiene · **409** `MEDIO_DUPLICADO` si el `phash` coincide con otro aviso.

### `PATCH /propiedades/:id/medios` — `dueño`
Reordenar y elegir portada en una sola llamada (evita N requests al arrastrar).
```jsonc
{ "orden":["uuid-3","uuid-1","uuid-2"], "portada":"uuid-3" }
```
`portada` debe estar en `orden`. La base garantiza una sola portada por aviso.

### `DELETE /propiedades/:id/medios/:medioId` — `dueño`
Borra la fila y encola el borrado en Cloudinary. Si era la portada, la siguiente foto la asume. **409** `MINIMO_FOTOS` si el aviso está `activo` y quedarían menos de 3.

---

## 5. Favoritos y búsquedas guardadas

### `GET /favoritos` — `sesión`
Devuelve el aviso completo más `estado_actual`, para poder avisar *"esta propiedad ya se vendió"*.

### `PUT /favoritos/:propiedadId` — `sesión`
**PUT, no POST**: idempotente. Un doble clic no da 409.
`{ "nota":"Preguntar si acepta mascotas" }` (opcional) → **200** `{ "ok":true, "favorito":true }`

### `DELETE /favoritos/:propiedadId` — `sesión` → **200** `{ "ok":true, "favorito":false }`

### `GET|POST /busquedas-guardadas` — `sesión`
```jsonc
{ "nombre":"Depa 3 dorm en Miraflores",
  "filtros":{ "operacion":"venta","tipo":"departamento",
              "ubicaciones":["miraflores","barranco"],
              "precio_max":220000,"dormitorios_min":3 },
  "frecuencia":"diaria" }        // nunca|diaria|semanal
```
**Validación** · máx 20 por usuario · `filtros` debe pasar el mismo validador que `GET /buscar`.
**201** → incluye `coincidencias_actuales` para mostrar *"hay 14 avisos así ahora"*.

### `PATCH|DELETE /busquedas-guardadas/:id` — `dueño`

---

## 6. Leads y contacto

### `POST /propiedades/:id/contacto` — `público` (rate-limited)
El endpoint más expuesto de la API.
```jsonc
{ "nombre":"Carlos Ríos", "telefono":"+51987654321",
  "email":"carlos@correo.com", "mensaje":"¿Sigue disponible?",
  "canal":"web",
  "_hp":"" }                   // honeypot: si viene con algo, 201 falso y se descarta
```
**Validación** · `nombre` 2–120 · al menos uno entre `telefono` y `email` · `mensaje` ≤1000 · la propiedad debe estar `activo` · no podés contactarte a vos mismo (**422** `AVISO_PROPIO`).
**201** → `{ "ok":true, "mensaje":"¡Listo! Tu mensaje llegó a quien publica. Te van a contactar pronto." }`
Efectos: crea el lead con `destinatario_id` copiado, notifica por email, incrementa `vistas_propiedad.contactos`, calcula `puntaje`.
**429** `DEMASIADOS_CONTACTOS` (5/hora por IP+propiedad).

### `GET /leads` — `sesión`
`?estado=nuevo&propiedad_id=…&desde=…&pagina=1`
```jsonc
{ "resultados":[{ "id":"…","estado":"nuevo","puntaje":78,
    "nombre":"Carlos Ríos","telefono":"+51987654321","email":"…",
    "mensaje":"…","canal":"web",
    "propiedad":{ "id":"…","titulo":"…","codigo":"WSP-10428","portada":"…" },
    "de_usuario":{ "id":"…","verificado":true },   // null si no tenía cuenta
    "creado_en":"…","respondido_en":null,
    "whatsapp_url":"https://wa.me/51987654321?text=…" }],  // link listo
  "total":11, "no_leidos":3 }
```

### `PATCH /leads/:id` — `destinatario`
`{ "estado":"contactado", "nota_interna":"Quedamos en visitar el sábado" }`
Pasar a `contactado` setea `respondido_en`. Marcar `spam` alimenta el filtro.

### `GET|POST /leads/:id/mensajes` — `destinatario` o `de_usuario_id`
`{ "cuerpo":"Sí, sigue disponible. ¿Te viene bien el sábado?" }` ≤2000 caracteres.

---

## 7. Planes · `/planes`

### `GET /planes` — `público`
```jsonc
{ "planes":[{ "slug":"agente","nombre":"Agente","descripcion":"…",
    "precio":89,"moneda":"PEN","periodo":"mensual",
    "limites":{ "tope_avisos":15,"tope_fotos":30,"tope_asientos":1,
                "destacados_mes":2,"cuota_indice_mes":null,
                "dias_vigencia_aviso":90 },
    "beneficios":["Perfil público","Bandeja de leads","Índice sin tope"],
    "para_rol":["agente"],
    "es_actual":false }]}       // marcado si hay sesión
```
`cuota_indice_mes: null` significa ilimitado — documentarlo, es la convención en todo el esquema.

### `GET /planes/:slug` — `público`

---

## 8. Suscripciones · `/suscripcion`

### `GET /suscripcion` — `sesión`
```jsonc
{ "suscripcion":{ "id":"…","estado":"activa",
    "plan":{ "slug":"agente","nombre":"Agente","precio":89,"moneda":"PEN" },
    "inicio":"…","fin":"2026-09-04","gracia_hasta":null,
    "renovacion_automatica":true,
    "titular":{ "tipo":"usuario","id":"…" } },
  "uso":{ "avisos":{ "usados":7,"tope":15 },
          "destacados":{ "usados":1,"tope":2 },
          "indice":{ "usadas":12,"tope":null },
          "asientos":{ "usados":1,"tope":1 } } }
```
`suscripcion: null` para el plan gratuito, con `uso` igual poblado. Este endpoint es el que debe consultar el frontend antes de mostrar botones de "publicar".

### `POST /suscripciones` — `verificado`
Inicia la contratación. **No cobra**: devuelve lo necesario para el checkout de Culqi.
```jsonc
// Body   · header opcional Idempotency-Key
{ "plan_slug":"agente", "periodo":"mensual",
  "agencia_id":null,
  "comprobante":{ "tipo":"boleta", "dni":"09876543" } }
  // o { "tipo":"factura", "ruc":"20…", "razon_social":"…", "direccion":"…" }
```
**200** → `{ "pago_id":"…", "monto":89.00, "moneda":"PEN",
  "culqi":{ "public_key":"pk_…","order_id":"…" } }`
**409** `SUSCRIPCION_ACTIVA` si ya tiene una vigente (usar cambio de plan).
**422** `PLAN_NO_APLICA` si el plan no admite su rol.

### `POST /suscripciones/:id/cancelar` — `titular`
`{ "motivo":"…" }` → apaga `renovacion_automatica`. **Sigue activa hasta `fin`** — no se corta al instante ni se devuelve proporcional.

### `POST /suscripciones/:id/reactivar` — `titular`
Vuelve a activar la renovación antes de `fin`.

### `POST /suscripciones/:id/cambiar-plan` — `titular`
`{ "plan_slug":"agente-pro" }`
Subida: cobro prorrateado inmediato. Bajada: se aplica al vencer. Si el plan nuevo tiene menos avisos, la respuesta avisa cuáles pasarán a `pausado`:
```jsonc
{ "aviso":"Al bajar de plan, 3 avisos quedarán pausados.",
  "afectados":[{ "id":"…","titulo":"…" }] }
```

---

## 9. Pagos · `/pagos`

### `GET /pagos` — `sesión`
Historial. Incluye `comprobante:{ tipo, serie, numero, pdf_url, estado_sunat }` cuando existe.

### `GET /pagos/:id` — `dueño`

### `POST /pagos/destacado` — `dueño del aviso` + `verificado`
```jsonc
{ "propiedad_id":"uuid", "tipo":"destacado", "dias":7 }
```
**Validación** · el aviso debe estar `activo` · `tipo` ∈ `destacado|super|portada` · no puede solaparse con un destaque vigente del mismo tipo (**409** `DESTAQUE_SOLAPADO`, lo garantiza el `EXCLUDE` del esquema).
Si el plan trae destacados incluidos, se descuenta de ahí y el monto es 0.
**200** → mismo formato de checkout que `POST /suscripciones`.

### `POST /webhooks/culqi` — `público`, firma verificada
Función aparte (`webhook-culqi.ts`), no pasa por el router principal.
Verifica HMAC, es **idempotente** vía `ux_pagos_proveedor (proveedor, proveedor_ref)`, y responde **200 siempre** que la firma sea válida — un 500 hace que Culqi reintente en bucle. Los errores se registran y se procesan aparte.
Eventos: `charge.succeeded` → activa suscripción o destaque y emite comprobante · `charge.failed` → `morosa` + `gracia_hasta = now() + 7 días` · `charge.refunded`, `chargeback`.

### `GET /comprobantes/:id` — `dueño`
`{ "pdf_url":"…","xml_url":"…","estado_sunat":"aceptado" }` — URLs firmadas, 15 min de validez.

---

## 10. Moderación y admin · `/admin`

### `GET /admin/moderacion` — `moderador`
Cola ordenada por riesgo (usa `ix_prop_moderacion`).
```jsonc
{ "resultados":[{ "id":"…","codigo":"WSP-10430","titulo":"…",
    "riesgo":72, "creado_en":"…","esperando_horas":3.5,
    "usuario":{ "nombre":"…","verificado":false,
                "avisos_previos":0,"rechazos_previos":0 },
    "marcas":[
      { "regla":"precio-fuera-de-indice","severidad":4,
        "detalle":{ "precio_m2":890,"indice_m2":2285,"desvio":-61 } },
      { "regla":"telefono-en-descripcion","severidad":3 }],
    "vista_previa":{ "precio":82000,"moneda":"USD","distrito":"Miraflores",
                     "area_m2":92,"medios":["…"] } }],
  "total":14, "sla_vencidos":2 }
```

### `POST /admin/propiedades/:id/aprobar` — `moderador`
`{ "nota_interna":"…" }` → `activo`, setea `publicado_en` y `vence_en`, resuelve las marcas, notifica al dueño, escribe en `auditoria`.

### `POST /admin/propiedades/:id/rechazar` — `moderador`
```jsonc
{ "motivo":"fotos-no-corresponden",   // catálogo cerrado
  "mensaje":"Las fotos parecen de otro inmueble. Súbelas de nuevo.",
  "nota_interna":"phash coincide con WSP-9981" }
```
`mensaje` se le envía al usuario; `nota_interna` nunca sale. **422** si `motivo` no está en el catálogo — un rechazo sin causa clasificada no se puede medir.

### `POST /admin/propiedades/:id/archivar` — `admin`
Para fraude. Puede suspender de paso al usuario.

### `GET|PATCH /admin/reportes` — `moderador`
`PATCH { "estado":"resuelto", "accion":"aviso-archivado", "nota_interna":"…" }`
Regla automática: 3 reportes de `vendida` sobre el mismo aviso lo pasan a `pausado` y le piden confirmación al dueño.

### `GET /admin/usuarios` — `moderador` · `GET /admin/usuarios/:id` — `moderador`
Búsqueda por email, nombre, RUC o teléfono. El detalle trae avisos, leads, pagos, reportes y últimos accesos.

### `POST /admin/usuarios/:id/verificar` — `admin`
`{ "verificado":true, "nota":"RUC validado en SUNAT el 2026-08-05" }`

### `POST /admin/usuarios/:id/suspender` — `admin`
`{ "motivo":"…", "archivar_avisos":true }` → incrementa `version_token` (lo saca de todos sus dispositivos al instante).

### `POST /admin/indice/cargar` — `admin`
`{ "periodo":"2026-08", "filas":[{ "distrito_slug":"miraflores",
    "precio_m2_usd":2285,"alquiler_2d_pen":3400,"var_12m":4.2,"muestras":184 }],
  "publicar":false }`
Con `publicar:false` queda en borrador y la respuesta trae el diff contra el período anterior para revisar outliers antes de publicar.

### `GET /admin/metricas` — `moderador`
Avisos por estado, altas por día, leads y tasa de contacto, MRR, suscripciones activas y bajas, top distritos, tiempo medio de moderación, embudo registro→publica→aprobado.

### `GET /admin/auditoria` — `admin`
`?entidad=propiedades&entidad_id=…&actor_id=…&accion=…` — solo lectura, append-only.

---

## 11. Búsqueda y filtros · `/buscar`

### `GET /buscar` — `público`
El endpoint más usado del producto.

| Parámetro | Tipo | Nota |
|---|---|---|
| `q` | texto | Full-text sin tildes sobre título y descripción |
| `operacion` | `venta\|alquiler\|traspaso` | |
| `tipo` | enum, separado por comas | `departamento,casa` |
| `ubicaciones` | slugs por coma | `miraflores,barranco` |
| `precio_min` / `precio_max` | número | **Se comparan contra `precio_ref_usd`** |
| `moneda_vista` | `USD\|PEN` | Solo afecta cómo se muestra |
| `area_min` / `area_max` | número | |
| `dormitorios_min` / `dormitorios_max` | 0–30 | |
| `banos_min`, `cocheras_min` | 0–30 | |
| `antiguedad_max` | 0–200 | |
| `caracteristicas` | slugs por coma | AND: `ascensor,gimnasio` |
| `estado_inmueble`, `amoblado` | enum | |
| `publica` | `dueno\|agente\|inmobiliaria` | **Filtro diferenciador** |
| `solo_verificados` | bool | |
| `con_precio` | bool (por defecto `true`) | |
| `cerca_de` | `lat,lng,radio_km` | |
| `orden` | `relevancia\|recientes\|precio_asc\|precio_desc\|area_desc\|m2_asc` | |
| `pagina` | ≥1 | 24 por página |

**Validación** · `precio_min ≤ precio_max` (si no, **422** `RANGO_INVALIDO`) · slugs desconocidos → **422** con la lista de inválidos, no se ignoran en silencio · `radio_km` ≤50 · `q` ≤120 caracteres.

```jsonc
{ "resultados":[{
    "id":"…","slug":"…","codigo":"WSP-10428","titulo":"…",
    "operacion":"venta","tipo":"departamento",
    "precio":185000,"moneda":"USD","precio_ref_usd":185000,
    "precio_m2":2011, "mantenimiento":280,
    "area_m2":92,"dormitorios":3,"banos":2,"cocheras":1,
    "distrito":"Miraflores","provincia":"Lima",
    "portada":"…","fotos":8,
    "caracteristicas":["ascensor","gimnasio"],
    "vs_mercado":-12,                       // ← sale de la misma consulta SQL
    "destacado":false,
    "publica":{ "tipo":"agente","nombre":"Ana Quispe",
                "slug":"ana-quispe","verificado":true },
    "publicado_en":"…","actualizado_hace_dias":3,
    "favorito":false }],                    // solo con sesión
  "total":142, "pagina":1, "paginas":6, "por_pagina":24,
  "orden":"relevancia",
  "resumen":{ "precio_min":95000,"precio_max":420000,
              "precio_mediano":198000,"indice_m2_zona":2285 } }
```
Mantiene `resultados` + `total` tal como los lee hoy `buscar.html`.

### `GET /buscar/facetas` — `público`
Conteos para pintar los filtros sin ejecutar la búsqueda seis veces. Acepta los mismos parámetros; cada faceta se cuenta **ignorando su propio filtro** (comportamiento estándar de facetas).
```jsonc
{ "tipo":{ "departamento":98,"casa":31,"terreno":13 },
  "dormitorios":{ "1":12,"2":44,"3":61,"4+":25 },
  "caracteristicas":{ "ascensor":88,"gimnasio":34,"acepta-mascotas":21 },
  "rangos_precio":[{ "hasta":100000,"conteo":18 },
                   { "desde":100000,"hasta":200000,"conteo":74 }] }
```

### `GET /ubicaciones/sugerir` — `público`
`?q=jesus&limite=8` — tolera typos y falta de tildes (`pg_trgm` + `sin_tildes`).
```jsonc
{ "sugerencias":[{ "slug":"jesus-maria","distrito":"Jesús María",
    "provincia":"Lima","departamento":"Lima",
    "etiqueta":"Jesús María, Lima","avisos_activos":34 }]}
```

### `GET /ubicaciones` — `público`
Árbol departamento → provincia → distrito, cacheado 24 h.

### `GET /caracteristicas` — `público`
Catálogo agrupado para armar la UI de filtros. `?tipo=departamento` filtra por `aplica_a`. Cache 24 h.

---

## 12. Índice de precios · `/indice`

### `GET /indice` — `sesión` · consume cuota
```jsonc
{ "periodo":"2026-08",
  "distritos":[{ "slug":"miraflores","distrito":"Miraflores",
    "precio_m2_usd":2285,"alquiler_2d_pen":3400,
    "var_12m":4.2,"muestras":184,"confianza":"alta" }],
  "cuota":{ "tope":5,"usadas":3,"restantes":2 },   // tope null = ilimitado
  "aviso":"Referenciales, calculados con avisos activos y cierres reportados en Wasipe. No reemplazan una tasación." }
```
**429** `CUOTA_INDICE_AGOTADA` → `{ "plan_sugerido":"agente" }`

### `GET /indice/distrito/:slug` — `sesión` · consume cuota
Serie de 24 meses para graficar.

### `POST /indice/estimar` — `sesión` · consume cuota
```jsonc
{ "ubicacion_id":"uuid", "operacion":"venta", "area_m2":92,
  "dormitorios":3, "antiguedad":4, "piso":8,
  "caracteristicas":["ascensor","cochera"] }
```
```jsonc
{ "distrito":"Miraflores", "moneda":"USD",
  "rango":{ "min":178000,"sugerido":196000,"max":214000 },
  "base_m2_usd":2285,
  "factores":[{ "nota":"Piso 8 con ascensor","valor":0.04 },
              { "nota":"4 años de antigüedad","valor":-0.02 }],
  "confianza":"alta","muestras":184,
  "aviso":"Es una referencia, no una tasación." }
```
**Validación** · `area_m2` 10–2000 · `antiguedad` 0–120 · `piso` 0–60 · la ubicación debe tener índice publicado para el período (**404** `SIN_INDICE`).

---

## 13. Integración con el frontend

`cuenta.js` ya sirve tal cual — solo hay que apuntarlo a `/api/v1`:

```js
export const api = async (ruta, opciones = {}) => {
  const r = await fetch(`/api/v1${ruta}`, {
    credentials: 'same-origin',
    headers: opciones.body ? { 'Content-Type': 'application/json' } : {},
    ...opciones,
    body: opciones.body ? JSON.stringify(opciones.body) : undefined,
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(datos.error || 'Algo falló.'),
                                 { estado: r.status, datos });
  return datos;
};
```

Manejo de los tres errores que importan:

```js
try {
  await api('/propiedades', { method: 'POST', body: { operacion, tipo, ubicacion_id } });
} catch (e) {
  if (e.estado === 402) mostrarUpgrade(e.datos.plan_sugerido);   // tope de plan
  else if (e.estado === 403 && e.datos.codigo === 'EMAIL_NO_VERIFICADO') pedirVerificacion();
  else if (e.datos.faltantes) marcarCampos(e.datos.faltantes);   // wizard incompleto
  else mostrarError(e.message);                                   // ya viene en español
}
```

### Compatibilidad con lo que ya existe

| Hoy | Cambio |
|---|---|
| `/api/*` | Redirect 200 a `/api/v1/*` en `netlify.toml`. Nada se rompe |
| `GET /propiedades` = mis avisos | **Se mantiene** |
| `{error: "…"}` | **Se mantiene**, se le suman `codigo` y `campo` |
| `{resultados, total}` en búsqueda | **Se mantiene** — `buscar.html` sigue paginando igual |
| `GET /cuentas/yo` | Ahora trae también `plan` y `agencia` |
| `POST /propiedades/:id/contacto` | **Se mantiene** |

Lo único que hay que tocar en el frontend actual: la constante base en `cuenta.js` y los `fetch('/api/…')` sueltos de `index.html` y `buscar.html`.

---

## 14. Resumen

| Dominio | Endpoints | Notas |
|---|---|---|
| Auth | 12 | Cookie httpOnly + `version_token`, sin refresh tokens |
| Perfiles y agencias | 11 | Perfiles públicos con slug propio |
| Avisos | 11 | Máquina de estados; `publicar` devuelve todos los faltantes juntos |
| Media | 4 | Subida directa firmada — obligada por el límite de 6 MB |
| Favoritos y alertas | 7 | `PUT` idempotente |
| Leads | 5 | Público + rate limit + honeypot |
| Planes y suscripciones | 7 | `GET /suscripcion` expone el uso vs. los topes |
| Pagos | 5 | Culqi, webhook idempotente, comprobante SUNAT |
| Admin | 12 | Todo pasa por `auditoria` |
| Búsqueda | 5 | Facetas aparte; `vs_mercado` incluido |
| Índice | 3 | Con cuota por rol |

**Las cuatro decisiones que más afectan al frontend:**

1. `GET /cuentas/yo` devuelve usuario + perfil + agencia + plan en una llamada. Una sola petición al cargar cualquier página.
2. `POST /propiedades/:id/publicar` devuelve **todos** los campos faltantes, no el primero. El wizard los marca de una vez.
3. `402` siempre trae `plan_sugerido`. El modal de upgrade se arma solo.
4. `vs_mercado` viene dentro de cada resultado de búsqueda, calculado en la misma consulta SQL. El badge diferenciador no cuesta ninguna llamada extra.
