# Guía de despliegue

De un repositorio a un sitio en producción, en orden. Cada paso dice qué
se rompe si se saltea, porque el orden es lo único que importa acá.

**Regla que no se negocia: el sitio anterior de Netlify se queda en pie
hasta que producción esté verificada.** No se apaga, no se borra, y el DNS
no se toca. Es la única forma de volver atrás que existe de verdad.

---

## 0. Antes de empezar

Hace falta:

- Cuenta de Vercel con el repositorio conectado
- Cuenta de Supabase
- El dominio (`wasipe.pe` o el que sea) con acceso a su DNS
- `PRODUCTION_CHECKLIST.md` abierto al lado

Y **una decisión tomada del usuario** sobre dos cosas, porque nadie más
puede tomarlas:

1. Cloudinary o Supabase Storage para las fotos. Sigue sin decidirse desde
   el sprint 10; el código asume Supabase Storage.
2. Cuándo se toca el DNS.

---

## 1. Crear el proyecto de Supabase

1. Nuevo proyecto. **Región: `sa-east-1` (São Paulo).** Es la más cercana
   al Perú de las que hay; desde Lima son unos 40 ms contra 150 ms si se
   elige una de Estados Unidos. En una página que hace tres consultas,
   eso es un tercio de segundo de diferencia.
2. Contraseña de base de datos larga, generada, guardada en el gestor de
   contraseñas. No se vuelve a mostrar.
3. Anotar de **Settings → API**:
   - Project URL
   - `anon` key — pública
   - `service_role` key — **nunca sale del servidor**

**Si se saltea:** no hay nada más que hacer. Todo lo de abajo depende de
esto.

---

## 2. Aplicar las migraciones

```bash
npx supabase link --project-ref <ref-del-proyecto>
```

```bash
npx supabase db push
```

Son 20 migraciones y se aplican en orden por su nombre. Se revisa la
salida completa: una que falle a la mitad deja la base a medio camino, y
Supabase **no** hace rollback automático entre migraciones.

Después:

```bash
npx supabase db lint
```

**Cómo verificar que quedó bien:**

```sql
select tablename, rowsecurity from pg_tables
 where schemaname = 'public' order by tablename;
```

Toda tabla con datos de personas tiene que salir con `rowsecurity = true`.
Si alguna sale en `false`, se para acá: esa tabla está abierta a cualquiera
con la llave anónima, que es pública.

**Si se saltea:** el código pide columnas que no existen y el sitio se cae
entero, no a medias.

---

## 3. Configurar la autenticación

**Authentication → URL Configuration:**

| Campo | Valor |
|---|---|
| Site URL | `https://wasipe.pe` |
| Redirect URLs | `https://wasipe.pe/auth/callback` |
| | `https://wasipe.vercel.app/auth/callback` |
| | `https://*-wasipe.vercel.app/auth/callback` |

La tercera es para las vistas previas de cada rama. Sin ella, probar el
registro en una vista previa manda a la persona a producción.

**No poner `http://localhost`.** En desarrollo se usa el proyecto de
desarrollo, no este.

**Authentication → Providers → Email:** confirmación de correo **activada**.

**Authentication → Email Templates:** las cuatro plantillas en castellano
peruano. Vienen en inglés. Un correo de confirmación en inglés en un
portal peruano parece un intento de estafa, y la gente no lo abre.

**Si se saltea:** el registro parece funcionar, el correo llega, y su
enlace lleva a una página rota. Es el fallo que más tarda en descubrirse
porque nadie prueba el correo de confirmación.

---

## 4. Almacenamiento

Las cubetas y sus políticas las crea la migración
`20260816090200_almacenamiento.sql`. Hay que **verificar** en Storage que
existan y que:

- La cubeta de videos figure como **privada**
- Cada una tenga su límite de tamaño y sus tipos MIME

Después, subir un archivo de prueba desde el panel de Supabase y borrarlo.
Si eso falla, falla para todo el mundo.

**Si se saltea:** nadie puede subir una foto, y publicar exige tres.

---

## 5. Conectar Vercel

1. **New Project** → importar el repositorio.
2. Framework: **Next.js** (se detecta solo).
3. Región: **`gru1` (São Paulo)**, la misma que Supabase. Ya está en
   `vercel.json`. Poner el servidor en Estados Unidos y la base en Brasil
   agrega un viaje de ida y vuelta a cada consulta.
4. Cargar las variables de entorno (§6).
5. **No conectar el dominio todavía.** Primero se verifica.

El primer despliegue queda en `wasipe.vercel.app`. Ahí se prueba todo.

---

## 6. Variables de entorno en Vercel

**Settings → Environment Variables.** Cada una hay que decidir en qué
entornos va.

| Variable | Producción | Vista previa | Desarrollo |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✓ | ✓ | ✓ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✓ | ✓ | ✓ |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ | ✓ | ✓ |
| `NEXT_PUBLIC_URL_SITIO` | dominio real | URL de Vercel | localhost |
| `PAGOS_EN_VIVO` | **`no`** | `no` | `no` |
| `ANTHROPIC_API_KEY` | ✓ | — | — |
| `SENTRY_DSN` | ✓ | — | — |

**Dos cosas para no equivocarse:**

- `SUPABASE_SERVICE_ROLE_KEY` **jamás** lleva el prefijo `NEXT_PUBLIC_`.
  Con ese prefijo entra al paquete de JavaScript que descarga todo el
  mundo, y esa clave se salta la seguridad a nivel de fila por completo:
  quien la tenga lee y escribe cualquier tabla. Hay una prueba que falla
  si aparece, pero la prueba mira el código, no el panel de Vercel.
- `NEXT_PUBLIC_URL_SITIO` tiene que ser **distinta** en vista previa. Con
  el dominio real, las canónicas de una vista previa apuntan a producción
  y Google indexa la vista previa como si fuera el sitio.

Wasi AI sin clave aparece apagado, con su explicación. No se cae.

---

## 7. Verificar antes de tocar el DNS

Sobre `wasipe.vercel.app`, la lista de §10 de `PRODUCTION_CHECKLIST.md`
entera. Los que más importan:

```bash
curl -I https://wasipe.vercel.app/esto-no-existe
```

Tiene que devolver **404**, no 200. Un «no existe» que responde 200 le
enseña a Google que el sitio tiene infinitas páginas idénticas.

```bash
curl -s https://wasipe.vercel.app/robots.txt
```

Y a mano: crear una cuenta, recibir el correo, entrar, publicar un aviso,
moderarlo, ver que sale en la búsqueda.

**Hasta que esto pase, no se avanza.**

---

## 8. Migrar el dominio desde Netlify

⚠️ **Este paso necesita aprobación expresa del usuario. No se hace solo.**

Hoy el sitio vive en Netlify. El objetivo es que apunte a Vercel **sin
que deje de funcionar en ningún momento** y pudiendo volver atrás.

### Antes

1. Anotar los registros DNS actuales. Captura de pantalla incluida.
2. Bajar el TTL a **300 segundos** y esperar a que caduque el anterior
   (si estaba en 3600, hay que esperar una hora). Sin esto, un error se
   arrastra un día entero mientras el mundo tiene la respuesta vieja en
   caché.
3. **No apagar Netlify.** Sigue sirviendo en `wasipe.netlify.app`.

### El cambio

En Vercel, **Settings → Domains → Add**. Vercel dice qué registro poner:

| Tipo | Nombre | Valor |
|---|---|---|
| A | `@` | `76.76.21.21` |
| CNAME | `www` | `cname.vercel-dns.com` |

Se cambian en el registrador. Vercel emite el certificado solo, en unos
minutos.

### Después

```bash
dig wasipe.pe +short
```

Cuando propague, verificar en el dominio real:

- La portada carga con HTTPS
- El certificado es válido
- El registro y el correo de confirmación funcionan **con el dominio
  nuevo** — las Redirect URLs de Supabase tienen que tenerlo
- `robots.txt` y `sitemap.xml` responden

Recién ahí subir el TTL a 3600.

### Qué se queda

- **El sitio de Netlify no se apaga.** Sigue accesible en
  `wasipe.netlify.app` durante al menos 30 días.
- La base de Neon del sitio anterior tampoco se borra.
- En Search Console: agregar la propiedad nueva, enviar el sitemap. **No**
  usar la herramienta de cambio de dirección: el dominio es el mismo, solo
  cambió dónde está alojado.

---

## 9. Pagos

**No se encienden en este despliegue.**

`PAGOS_EN_VIVO=no` y sin claves de Culqi. `lib/pagos/interruptor.ts`
levanta excepción ante cualquier intento de cobro.

El día que se aprueben, en este orden:

1. Claves **de prueba** (`pk_test_` / `sk_test_`) en vista previa.
2. Probar el flujo entero, incluido un webhook repetido a mano.
3. Claves de producción en producción.
4. `PAGOS_EN_VIVO=si`.
5. Desplegar.
6. Una compra real de S/ 1 y su devolución.

No hay ninguna pantalla que encienda esto. Hace falta cambiar la variable
y volver a desplegar, a propósito: una cuenta comprometida no puede
empezar a cobrarle a la gente.

---

## 10. Después

- Copias de seguridad: Supabase las hace solo. **Restaurar una** a un
  proyecto de prueba, una vez, para saber que se puede.
- Sentry conectado.
- Una comprobación de estado externa contra la portada.

---

## Volver atrás

Está en `ROLLBACK_PLAN.md`. Léelo **antes** de desplegar, no durante.
