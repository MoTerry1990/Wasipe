# Matriz de variables de entorno

Qué necesita Wasipe para funcionar, dónde va cada cosa y **cómo
comprobarla sin verla**.

Lo último es la parte importante. Un secreto que se imprime en una
terminal queda en el historial, en el desplazamiento, y en cualquier
captura de pantalla que alguien saque después. Así que ninguna
comprobación de esta tabla muestra un valor: muestran su longitud, su
prefijo, o si la petición funcionó.

---

## Cómo leer la tabla

| Columna | Qué dice |
|---|---|
| **Pública** | Sí = viaja al navegador a propósito. No = jamás sale del servidor |
| **Local** / **Preview** / **Producción** | Si hace falta en ese entorno |
| **Disponible** | Si hoy la tenemos |

Estado a **16 de agosto de 2026**: ninguna variable de infraestructura
está disponible. No existe el proyecto de Supabase ni el de Sentry.

---

## 1. Supabase — base, autenticación y almacenamiento

| Variable | Para qué | Pública | Local | Preview | Prod. | Disponible |
|---|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | La dirección del proyecto | **Sí** | ✓ | ✓ | ✓ | ❌ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Autenticar desde el navegador | **Sí** | ✓ | ✓ | ✓ | ❌ |
| `SUPABASE_SERVICE_ROLE_KEY` | Lo que se salta RLS | **No** | ✓ | ✓ | ✓ | ❌ |
| `SUPABASE_DB_URL` | Conexión directa, para migrar y sembrar | **No** | ✓ | — | — | ❌ |

**Origen:** Supabase → Settings → API, y Settings → Database.

**Cómo comprobarlas sin verlas:**

```bash
node -e "const v=process.env.NEXT_PUBLIC_SUPABASE_URL||''; console.log(v?'ok, host: '+new URL(v).host:'FALTA')"
```

```bash
node -e "const k=process.env.SUPABASE_SERVICE_ROLE_KEY||''; console.log(k?'ok, '+k.length+' caracteres, empieza en '+k.slice(0,3):'FALTA')"
```

**Las tres cosas que hay que no equivocar:**

1. **`SUPABASE_SERVICE_ROLE_KEY` nunca lleva el prefijo `NEXT_PUBLIC_`.**
   Con ese prefijo entra al paquete de JavaScript que descarga todo el
   mundo, y esa clave se salta la seguridad a nivel de fila por completo:
   quien la tenga lee y escribe cualquier tabla. Hay una prueba
   automática que falla si aparece en el código, pero **la prueba mira el
   código, no el panel de Vercel**. Eso hay que mirarlo a ojo.
2. **La clave anónima es pública y está bien que lo sea.** Va en el
   paquete a propósito: sin ella el navegador no puede autenticar a
   nadie. No da más permisos que los que RLS concede a un visitante.
3. **`SUPABASE_DB_URL` contiene la contraseña de la base.** Solo en local,
   para migrar. Nunca en Vercel.

### ¿Hace falta de verdad la clave de servicio?

La regla del sprint dice «solo si es verdaderamente necesaria». Sí lo es,
y para cuatro cosas concretas:

- `registrar_evento_de_pago()` — los webhooks llegan sin sesión
- `anotar_huella()` y `fotos_sin_huella()` — recorren fotos de todo el mundo
- `subidas_abandonadas()` — lee `storage.objects` entero
- El barrido de archivos cuando se borra un aviso

Las cuatro son operaciones del servidor sobre datos de terceros. No hay
sesión a la que atribuirlas, así que no hay forma de hacerlas con RLS.

### Pooler o conexión directa

Vercel abre y cierra conexiones todo el tiempo, así que corresponde el
**pooler en modo transacción** (puerto 6543) para la aplicación, y la
**conexión directa** (puerto 5432) solo para migrar, porque las
migraciones usan sentencias que el pooler en modo transacción no admite.

Hoy la aplicación no usa ninguna cadena de conexión: habla con Supabase
por HTTP a través de su cliente, que no tiene este problema. La fila de
`SUPABASE_DB_URL` es solo para el CLI.

---

## 2. La aplicación

| Variable | Para qué | Pública | Local | Preview | Prod. | Disponible |
|---|---|---|---|---|---|---|
| `NEXT_PUBLIC_URL_SITIO` | Canónicas, sitemap, Open Graph | **Sí** | ✓ | ✓ | ✓ | ✅ |
| `NEXT_PUBLIC_ENTORNO` | Separar Preview de producción | **Sí** | ✓ | ✓ | ✓ | ✅ |

**`NEXT_PUBLIC_URL_SITIO` tiene que ser distinta en cada entorno.** Con
el dominio real puesto en Preview, las canónicas de una vista previa
apuntan a producción y Google puede indexar la vista previa como si fuera
el sitio.

```bash
curl -s https://<preview>/sitemap.xml | head -3
```

Si las direcciones del sitemap no empiezan por la URL del Preview, la
variable está mal.

---

## 3. Sentry

| Variable | Para qué | Pública | Local | Preview | Prod. | Disponible |
|---|---|---|---|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | Dónde mandar los errores | **Sí** | — | ✓ | ✓ | ❌ |
| `SENTRY_ORG` | Subir source maps | **No** | — | ✓ | ✓ | ❌ |
| `SENTRY_PROJECT` | Lo mismo | **No** | — | ✓ | ✓ | ❌ |
| `SENTRY_AUTH_TOKEN` | Lo mismo | **No** | — | ✓ | ✓ | ❌ |

**El DSN no es un secreto** y por eso lleva prefijo público. Es una
dirección de solo escritura: sirve para mandar eventos y para nada más.
El navegador necesita conocerla para reportar sus propios errores.

**`SENTRY_AUTH_TOKEN` sí lo es.** Sube los source maps durante el build y
tiene permiso de escritura sobre el proyecto.

Sin DSN, Sentry **no se inicializa**: ni una petición, ni peso extra en el
paquete. Comprobable:

```bash
npx vitest run tests/unidad/observabilidad.test.ts
```

---

## 4. Wasi AI

| Variable | Para qué | Pública | Local | Preview | Prod. | Disponible |
|---|---|---|---|---|---|---|
| `IA_PROVEEDOR` | Qué adaptador de texto | No | ✓ | ✓ | ✓ | ✅ |
| `ANTHROPIC_API_KEY` | La clave del proveedor | **No** | — | — | ✓ | ❌ |
| `IA_MODELO` | Qué modelo | No | — | — | — | ✅ |
| `IA_PROVEEDOR_IMAGEN` | Adaptador de imagen | No | ✓ | ✓ | ✓ | ✅ (`ninguno`) |
| `IA_IMAGEN_URL` · `IA_IMAGEN_CLAVE` | Proveedor de imagen | **No** | — | — | — | ❌ |
| `IA_PROVEEDOR_VIDEO` | Adaptador de video | No | ✓ | ✓ | ✓ | ✅ (`ninguno`) |
| `IA_VIDEO_URL` · `IA_VIDEO_CLAVE` | Proveedor de video | **No** | — | — | — | ❌ |

**Ninguna lleva prefijo público, y no es negociable.** Una clave de un
proveedor de IA en el navegador se convierte en una factura de cuatro
cifras en un fin de semana.

Sin clave, Wasi AI **aparece apagado con su explicación**. Publicar a mano
funciona igual. Es el estado en el que está hoy y no bloquea nada.

---

## 5. Mapas

| Variable | Para qué | Pública | Local | Preview | Prod. | Disponible |
|---|---|---|---|---|---|---|
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Cartografía de fondo | **Sí** | — | — | ✓ | ❌ |

Es pública porque el navegador dibuja el mapa. **Un token público de
mapas tiene que llevar restricción de dominio en el panel del
proveedor**: sin eso, cualquiera lo copia del paquete y consume la cuota.

Hoy el mapa dibuja los marcadores y la agrupación sobre un fondo liso, y
lo avisa. Funciona sin esta variable.

---

## 6. Pagos

| Variable | Para qué | Pública | Local | Preview | Prod. | Disponible |
|---|---|---|---|---|---|---|
| `PAGOS_EN_VIVO` | El interruptor | No | ✓ `no` | ✓ `no` | ✓ `no` | ✅ |
| `CULQI_PUBLIC_KEY` | Formulario de tarjeta | **Sí** | — | — | — | ❌ |
| `CULQI_SECRET_KEY` | Cobrar | **No** | — | — | — | ❌ |
| `CULQI_WEBHOOK_SECRET` | Firmar webhooks | **No** | — | — | — | ❌ |

**`PAGOS_EN_VIVO=no` en los tres entornos, y se queda así.** No hay
ninguna pantalla que lo encienda: hace falta cambiar la variable en
producción y volver a desplegar. Una cuenta comprometida no puede empezar
a cobrarle a la gente.

```bash
node -e "console.log(process.env.PAGOS_EN_VIVO === 'si' ? 'PELIGRO: ENCENDIDO' : 'apagado, correcto')"
```

---

## 7. Lo del sitio anterior

Estas siguen vivas en **Netlify** y no se tocan. El sitio anterior tiene
que seguir funcionando.

| Variable | Dónde | Nota |
|---|---|---|
| `DATABASE_URL` | Netlify | Apunta a Neon. **No borrar** |
| `JWT_SECRET` | Netlify | Sesiones del sitio anterior |
| `CLOUDINARY_*` | Netlify | Las fotos del sitio anterior |
| `RESEND_API_KEY` | Netlify | Sus correos |

**Cloudinary se queda donde está.** La decisión del sprint 18 es usar
Supabase Storage en Wasipe; el sitio anterior sigue con Cloudinary hasta
que se apague, y apagarlo no es parte de este sprint.

---

## Resumen: qué falta

| | Cuántas | Cuáles |
|---|---|---|
| ✅ Disponibles | 8 | Las que tienen valor por defecto seguro |
| ❌ Faltan y **bloquean** | 4 | Las de Supabase |
| ❌ Faltan y **no bloquean** | 8 | Sentry, IA, mapas, pagos |

**Las cuatro que bloquean** son las de Supabase. Sin ellas no hay base, y
sin base no hay registro, ni avisos, ni fotos, ni nada que verificar.

Las de Sentry no bloquean el despliegue pero **sí bloquean el
lanzamiento**: sin ellas, un fallo en producción es invisible hasta que
alguien escriba.

---

## Comprobación completa, sin ver ningún valor

```bash
node scripts/comprobar-entorno.mjs
```

Imprime, para cada variable: si está, cuántos caracteres tiene y su
prefijo. Nunca el valor. Si algo tiene prefijo `NEXT_PUBLIC_` y no
debería, lo marca como error.
