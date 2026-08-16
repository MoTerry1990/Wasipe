# Informe de infraestructura

**16 de agosto de 2026** · Sprint 18

---

## Estado: SPRINT BLOQUEADO POR INFRAESTRUCTURA

Falta el proyecto de Supabase. Sin él no hay base, y sin base no hay
migraciones que aplicar, ni RLS que verificar contra un Postgres real, ni
cuentas que crear, ni fotos que subir, ni copia que restaurar.

Lo que **sí** se hizo está abajo, y no es poco: todo el código que la
infraestructura va a necesitar quedó escrito y probado, así que el día que
existan las credenciales el trabajo es conectar, no construir.

**Lo que necesito de ti está en la última sección.** Son cuatro cosas.

---

## Fase 1 — El repositorio

Todo verde antes de tocar nada, que era la condición para seguir.

| Qué | Valor |
|---|---|
| Rama | `main` |
| Commit de partida | `ee99ffbe98a5fd8682d696e30b99cad3604800f3` |
| Commit del sprint 17 presente | ✅ Sí, es la cabeza |
| Cambios sin confirmar | 0 |
| Node | v24.18.0 |
| npm | 11.16.0 |
| Next.js | 16.3.1 |
| Migraciones antes del sprint | 26 |
| Migraciones después | 27 |

| Comprobación | Resultado |
|---|---|
| `npm install` | ✅ |
| `npm run lint` | ✅ sin errores |
| `npm run typecheck` | ✅ sin errores |
| `npm test` | ✅ 876 pruebas |
| `npm run build` | ✅ compila |

---

## Fase 2 — Variables

`ENVIRONMENT_MATRIX.md` tiene la tabla completa: 20 variables, cada una
con su propósito, en qué entornos va, si es pública o secreta, y **cómo
comprobarla sin ver su valor**.

Se agregó `scripts/comprobar-entorno.mjs`, que imprime para cada variable
si está, cuántos caracteres tiene y sus primeros tres. Nunca el valor: un
secreto impreso en una terminal queda en el historial y en cualquier
captura de pantalla que alguien saque después.

```bash
node scripts/comprobar-entorno.mjs
```

Ejecutado hoy: **faltan 5 obligatorias**, los cobros están apagados, y
ninguna variable secreta lleva prefijo público.

| | Cuántas | Cuáles |
|---|---|---|
| Disponibles | 8 | Las que tienen valor por defecto seguro |
| Faltan y **bloquean** | 4 | Supabase |
| Faltan y no bloquean | 8 | Sentry, IA, mapas, pagos |

---

## Fase 3 — Supabase

**No ejecutada. No existe el proyecto.**

Comprobado: el CLI de Supabase está instalado (2.114.0) pero sin sesión.
No se creó ningún proyecto, y no se va a crear: hace falta la cuenta del
propietario, y la regla 4 del sprint dice que no se crean claves sin
autorización.

Nada de lo siguiente se ejecutó, y por eso **nada de esto se marca como
aprobado**:

- Aplicar las 27 migraciones a un Postgres real
- Verificar tablas, índices, funciones, disparadores y extensiones
- Verificar las políticas de RLS contra Supabase
- Verificar los buckets
- Las siete demostraciones de la fase 3.11

Lo que sí está: las 27 migraciones corren limpias sobre una base vacía en
**PGlite** —Postgres 17 de verdad, compilado a WebAssembly— con 876
pruebas encima. Eso comprueba el esquema y la lógica; no comprueba que
Supabase las acepte en ese orden, ni que sus extensiones estén donde
esperamos.

---

## Fase 4 — Supabase Storage · **hecha**

Esta fase sí se pudo hacer entera, porque es código.

### Lo que estaba mal

**Los archivos originales vivían en un bucket público.** Cualquiera con la
dirección se bajaba el archivo tal como salió del celular: sin comprimir,
con sus metadatos EXIF, y **con las coordenadas GPS del lugar donde se
tomó la foto**.

Una persona que publica su departamento eligió mostrar el distrito. La
foto de su sala, sin tocar, dice la cuadra. Es exactamente lo que la regla
17 del sprint prohíbe, y estaba así desde el sprint 6.

### Los cinco depósitos

| Depósito | Bucket | Acceso | Por qué |
|---|---|---|---|
| `originales` | `originales` | **Privado** | Los EXIF llevan el GPS |
| `publicas` | `avisos` | Público | Es lo que se ve en el aviso |
| `generadas` | `generados` | **Privado** | Wasi AI produce; nadie aprobó todavía |
| `videos` | `videos` | **Privado** | Enlace firmado de 5 minutos |
| `perfiles` | `avatares`, `logos` | Público | Se muestran en todo el portal |

**`originales` no tiene política de UPDATE ni de DELETE**, y ese es el
punto entero: si mañana alguien reclama que su foto fue alterada, el
archivo que subió tiene que seguir estando, byte por byte. El barrido de
un aviso borrado lo hace el servidor con la llave de servicio, que es una
operación deliberada y registrada.

Las políticas leen la ruta (`storage.foldername(name)[1]` = el aviso) y
nunca los metadatos: `storage.objects.metadata` lo escribe quien sube, así
que decidir permisos con eso es dejar que la persona declare sus propios
permisos.

### La interfaz de proveedor

`lib/almacenamiento/proveedor.ts` — cinco operaciones: guardar, url
pública, url firmada, leer, borrar. Escrita sobre lo que **todo**
almacenamiento sabe hacer, no sobre lo que sabe hacer Supabase. Una
interfaz con `crearBucket()` no serviría para Cloudinary.

`lib/almacenamiento/supabase.ts` es el adaptador. Cuando entre Cloudinary
se escribe un archivo hermano y se cambia una línea.

### Validación de archivos

**El tipo se lee del contenido, no de lo que declara el navegador.**
`file.type` es lo que el navegador *dice*, deducido casi siempre de la
extensión: un `.exe` renombrado a `.jpg` llega declarando `image/jpeg`.

`lib/almacenamiento/validacion.ts` lee los primeros bytes y los compara
contra las firmas de JPEG, PNG, WebP, AVIF y HEIC. Lo que no reconoce, no
entra: lista de permitidos, no de prohibidos.

Probado con un ejecutable de Windows, un PHP y un SVG. Los tres se
rechazan.

Los nombres se limpian: sin `..`, sin barras, sin tildes, sin nada que
termine en un atributo HTML, cortados a 80 caracteres.

### `image_hash`

Estaba vacía desde el sprint 15. Ahora:

- `lib/almacenamiento/huella.ts` — SHA-256 del archivo, con la versión del
  algoritmo adelante (`sha256:…`) para poder migrar a un hash perceptual
  sin adivinar cuáles son cuáles
- `anotar_huella()` — solo escribe si estaba vacía, así que el relleno se
  puede correr dos veces sin pisar nada
- `fotos_sin_huella(limite)` — el lote pendiente, las más viejas primero,
  con tope de 500
- `avance_de_huellas` — vista con cuánto falta

**No es un hash perceptual**, y hay que decirlo: encuentra el archivo
idéntico y nada más. Recomprimir la foto da otra huella. Se eligió el
exacto porque es determinista y no tiene falsos positivos: acusar a
alguien de copiar cuando no copió cuesta caro.

### Subidas abandonadas

`subidas_abandonadas(horas)` encuentra los archivos que quedaron en el
bucket sin ninguna fila que los apunte —alguien empezó a publicar y cerró
la pestaña— y **devuelve la lista sin borrar nada**. Un error en la
consulta no se lleva por delante las fotos de nadie.

### Lo que quedó sin probar

**Las políticas de `storage.objects`.** PGlite no trae el esquema
`storage` de Supabase, así que están escritas y revisadas a mano, y eso no
es lo mismo que probadas. Es lo primero que hay que verificar cuando
exista el proyecto.

---

## Fase 5 — Autenticación

**No ejecutada.** Depende de Supabase.

---

## Fase 6 — Vercel Preview

**No ejecutada, y es una decisión, no un olvido.**

El CLI de Vercel está instalado y con sesión (`moterry1990`), así que
técnicamente se podía desplegar. No se hizo porque un Preview sin las
variables de Supabase no verifica nada de lo que esta fase existe para
verificar: sería el mismo estado vacío que ya se prueba en local, con una
URL pública encima.

Desplegar antes de tener las variables también significa que la primera
versión pública de Wasipe sería una que no funciona. Prefiero que la
primera sea una que sí.

**Cuando existan las variables**, el despliegue es un comando y está
documentado en `DEPLOYMENT_GUIDE.md` §5 y §6.

---

## Fase 7 — Sentry · **preparada**

El código está entero. Falta el DSN.

- `@sentry/nextjs` 10.70.0 instalado
- `lib/observabilidad/sentry.ts` — la configuración, en un solo sitio
- `sentry.client.config.ts`, `sentry.server.config.ts`,
  `sentry.edge.config.ts`
- `instrumentation.ts` con `onRequestError`, que es lo que captura los
  fallos de páginas y de acciones de servidor

**Sin DSN no se inicializa nada**: ni una petición, ni peso extra en el
paquete. Es el estado de hoy.

Lo que sí se pudo probar, y es la parte que de verdad importa: **qué sale
de Wasipe hacia Sentry**. Un registro de errores es un lugar donde los
datos personales se quedan para siempre —lo ve todo el equipo, se exporta,
se indexa— así que se limpia a la salida y se limpia de más.

14 pruebas comprueban que no salen: contraseñas, cookies, cabeceras,
correos en la URL, teléfonos, coordenadas exactas, la clave de servicio, o
lo que quedó en las migas de pan. Del usuario solo queda el identificador.

La repetición de sesión está **apagada**: graba la pantalla de la persona,
y en un portal inmobiliario eso incluye su nombre, su teléfono y la
dirección de su casa mientras publica.

**Sin verificar:** que un error llegue de verdad a Sentry. Eso hay que
verlo en Sentry.

---

## Fases 8 y 9 — Flujos pendientes y copia de seguridad

**No ejecutadas.** Las dos dependen de Supabase.

---

## Fase 10 — Pagos · **verificada en local**

| Comprobación | Resultado |
|---|---|
| `PAGOS_EN_VIVO` no está en `si` | ✅ |
| No hay pasarela conectada | ✅ Ninguna clave de Culqi |
| No se puede abrir un cobro | ✅ `exigirPagosEnVivo()` levanta excepción |
| Un webhook repetido no acredita dos veces | ✅ Probado contra Postgres |
| El libro de créditos no duplica | ✅ Índice único parcial |

Sin verificar en Vercel Preview, porque no hay Preview.

---

## Fase 11 — Regresión · **verde**

```
npm run lint       → sin errores
npm run typecheck  → sin errores
npm test           → 35 archivos, 876 pruebas
npx playwright test → 567 pasaron, 5 omitidas
npm run build      → compila
npm audit --omit=dev → 0 vulnerabilidades
```

Lo que se verificó específicamente:

| | |
|---|---|
| XSS del sitio anterior corregido | ✅ Prueba estática, 129 interpolaciones |
| JSON-LD seguro | ✅ |
| 404 de verdad | ✅ |
| `/comparar` con `noindex` | ✅ |
| Privacidad de ubicaciones | ✅ Solo se ve la de quien eligió publicarla |
| Idempotencia de pagos | ✅ |
| Autorización | ✅ 14 tablas cerradas a un visitante |
| Subidas | ✅ 31 pruebas nuevas |
| Límites de uso | ✅ Corta a los 30 por hora |
| Sin `unsafe-inline` en la app nueva | ✅ |

**La deuda de `unsafe-inline` sigue solo en el sitio anterior**, y es por
sus scripts en línea. Con el escapado del sprint 17 ya no es explotable
por esa vía, pero es una red menos. Anotada en `KNOWN_ISSUES.md`.

---

## Lo que necesito de ti

Cuatro cosas, en este orden. Ninguna la puedo hacer yo.

### 1 · Crear el proyecto de Supabase

- Nombre sugerido: `wasipe-staging`
- **Región: `sa-east-1` (São Paulo)** — es la más cercana al Perú. Desde
  Lima son unos 40 ms contra 150 ms si se elige Estados Unidos
- Guarda la contraseña de la base en tu gestor de contraseñas: no se
  vuelve a mostrar

### 2 · Pasarme cuatro valores

De **Settings → API** y **Settings → Database**:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_DB_URL
```

Ponlos en un archivo `.env` en la raíz del proyecto. Está en `.gitignore`,
así que no se sube. **No los pegues en el chat**: con que estén en el
archivo alcanza, y así no quedan en el historial de la conversación.

### 3 · Crear el proyecto de Sentry

- Plataforma: **Next.js**
- Entornos: `preview` y `production`
- Del panel: `NEXT_PUBLIC_SENTRY_DSN`, y si quieres source maps también
  `SENTRY_ORG`, `SENTRY_PROJECT` y `SENTRY_AUTH_TOKEN`

Al mismo `.env`.

### 4 · Decirme si puedo desplegar el Preview

Tengo sesión de Vercel como `moterry1990`. Desplegar un Preview crea una
URL pública, así que prefiero que lo digas explícitamente antes de
hacerlo.

**Lo que no voy a hacer**, aunque tenga acceso: tocar el DNS, encender los
cobros, o apagar Netlify.

---

## Cuando tenga eso

En este orden, y mostrándote el identificador del proyecto y el número de
migraciones pendientes **antes** de aplicar nada:

1. Verificar que apunto al proyecto correcto
2. Comprobar si la base está vacía; si tiene datos, copia primero
3. Aplicar las 27 migraciones, registrando nombre, hora y duración de cada
   una
4. Verificar esquema, RLS, buckets y funciones contra Supabase
5. Configurar las URLs de autenticación
6. Desplegar el Preview
7. Probar los siete flujos pendientes con cuentas marcadas como de prueba
8. Provocar un error controlado y confirmar que Sentry lo recibe sin
   secretos
9. Copia y restauración en una base aparte
10. Regresión completa contra el Preview
