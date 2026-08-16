# Wasipe

Portal inmobiliario del Perú. El precio por m² siempre visible.

## Stack

| Capa      | Herramienta                                       |
| --------- | ------------------------------------------------- |
| Framework | Next.js 16 (App Router) + React 19                |
| Lenguaje  | TypeScript en modo estricto                       |
| Estilos   | Tailwind CSS 4 (`@theme` en `app/globals.css`)    |
| Pruebas   | Vitest + Testing Library (unidad), Playwright (E2E) |
| Base      | Supabase (Postgres 17, Auth, RLS, PostGIS)        |
| Despliegue| Vercel                                            |

El stack anterior (Hono + Netlify Functions + Neon) vive en [`legacy/`](legacy/)
como referencia durante la migración. No entra al build ni al despliegue.

## Comandos

```bash
npm install          # instalar dependencias
npm run dev          # servidor de desarrollo en http://localhost:3000
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm test             # pruebas de unidad y de base de datos
npm run test:db      # solo las de base de datos (migraciones y RLS)
npm run test:e2e     # pruebas de extremo a extremo (requiere `npm run build` antes)
npm run build        # build de producción
npm run legacy       # suite del stack anterior (338 pruebas)

npm run db:push      # aplicar migraciones al proyecto de Supabase
npm run db:reset     # rehacer la base local (requiere Docker)
npm run sembrar      # cargar datos de ejemplo (pide confirmación)
npm run tipos        # regenerar types/base-datos desde el esquema real
```

## Base de datos

Las migraciones están en [`supabase/migrations/`](supabase/migrations/), numeradas
por fecha y pensadas para correr en orden sobre una base limpia. Cada cambio de
esquema entra como migración nueva: nunca se edita una ya aplicada.

Puntos que conviene conocer antes de tocar el esquema:

- **El precio por m² lo calcula la base**, no la aplicación. Es una columna
  generada, así que ninguna consulta puede mostrar un número distinto.
- **`price_usd` normaliza soles y dólares.** Todo filtro y todo orden por precio
  usa esa columna; comparar contra `price` mezcla monedas y devuelve disparates.
- **RLS activa en las 18 tablas.** La clave anónima es pública por diseño: lo que
  protege los datos son las políticas, no el secreto de la clave.
- **El rol nunca sale del token.** Los metadatos del JWT los edita el propio
  usuario; el rol se lee de `profiles.role`, y un trigger impide cambiarlo.
- **La dirección exacta vive aparte**, en `property_locations`, y solo se publica
  cuando quien anuncia eligió mostrarla.

Las pruebas levantan un Postgres real en WebAssembly (PGlite), aplican las
migraciones de verdad y comprueban las políticas haciéndose pasar por un
visitante sin sesión, por la dueña de un aviso y por moderación.

> PGlite no incluye PostGIS, así que `20260815120900_geoespacial.sql` no se
> ejecuta en las pruebas locales. El índice espacial y `propiedades_cercanas()`
> se verifican recién contra un Supabase real.

## Cuentas y panel

El registro, el ingreso, la confirmación de correo y la recuperación de contraseña
usan Supabase Auth. Quien se registra entra como **comprador** —el rol que menos
puede hacer— y elige su tipo de cuenta en la bienvenida, una sola vez.

Los cinco tipos de cuenta: comprador, propietario, corredor, inmobiliaria y
administrador. Los dos últimos roles internos (`moderator` y `admin`) los asigna
Wasipe: no se pueden elegir desde el cliente, y hay un trigger en la base que lo
impide aunque alguien llame a la API directamente.

La autorización se comprueba en tres capas, y cada una funciona sola:

1. **Middleware** — redirige a `/ingresar` a quien no tiene sesión. Es comodidad,
   no defensa: una petición directa lo saltea.
2. **Servidor** — cada página y cada Server Action llama a `requiereSeccion()` o
   `requiereRol()` antes de responder. Escribir la URL a mano no alcanza.
3. **Base de datos** — la RLS filtra las filas. Aunque una consulta se escapara
   sin comprobar nada, no devolvería datos ajenos.

Sin proyecto de Supabase conectado el sitio público sigue funcionando, pero todo
lo privado se cierra: ante la duda, no se abre.

## Búsqueda

Tres rutas —`/comprar`, `/alquilar`, `/proyectos`— con dos formas de dirección:

- **Amigable**: `/alquilar/departamento/miraflores`. Es la canónica y la que se
  comparte; los segmentos se aceptan en cualquier orden y el middleware redirige
  a la forma correcta.
- **Con parámetros**: `/alquilar?tipo=departamento&distrito=Miraflores&dorm=2`.
  Es lo que produce el panel de filtros.

**La URL es la única fuente de verdad.** No hay estado de búsqueda guardado en
el navegador: lo que se ve es exactamente lo que dice la dirección, y por eso
una búsqueda se puede pasar por WhatsApp y quien la abre ve lo mismo.

Nada de lo que llega por la URL se confía. Un `?dorm=muchos` desaparece, un
`?dorm=99999` se recorta a 30, un rango escrito al revés se endereza, y el
resto de los filtros sigue funcionando. Ver `lib/busqueda/filtros.ts`.

El precio **siempre** se filtra contra `price_usd`, nunca contra `price`: la
lista mezcla soles y dólares y comparar el número crudo devuelve disparates.

Los tiempos de la búsqueda con 5.000 avisos están en [RENDIMIENTO.md](RENDIMIENTO.md).

## Ficha del aviso

Dirección: `/propiedad/departamento-en-venta-miraflores-92m2-wsp-001247`

El identificador es el **código público** (`WSP-001247`), no el UUID: es el
número que se dicta por teléfono, no filtra un identificador interno y entra en
un mensaje de WhatsApp. El texto de adelante es solo para las personas y los
buscadores; si cambia, el enlace viejo sigue funcionando.

Dos datos que **no** están en el HTML de la ficha, a propósito:

- **El teléfono de quien publica.** La RLS de `profiles` no lo expone a nadie.
  Sale por `telefono_de_contacto()`, una función `SECURITY DEFINER` que lo
  entrega de a uno, para un aviso publicado, con límite por sesión y dejando el
  evento anotado. Sin eso, un script de diez líneas se bajaría todos los números
  del portal.
- **La dirección exacta.** Vive en `property_locations` con su propia política;
  la consulta de la ficha ni la pide.

Contra los envíos automáticos hay tres capas, y ninguna le pone un captcha a
nadie: un campo trampa, un tiempo mínimo de llenado y un cupo por sesión contado
en la base (`consumir_cupo()`), porque en Vercel un contador en memoria no se
comparte entre procesos.

Las estadísticas del aviso (`lead_events`) no guardan IP, correo, teléfono ni
identificador de persona: solo un hash de sesión que caduca a los 30 días.

## Publicar un aviso

El asistente de `/publicar` tiene diez pasos y guarda solo cada pocos segundos.
El borrador vive en la base (`listing_drafts`), no en el navegador: recargar,
cerrar la pestaña o seguir desde el celular no pierde nada.

No está en `properties` a propósito. Un aviso a medio llenar no tiene título ni
precio ni distrito, y esa tabla exige las tres cosas; aflojarlas para poder
guardar borradores sería pagar la integridad de todos los avisos publicados por
poder guardar uno incompleto. Al enviarse, el borrador se valida y recién ahí se
convierte en una fila de `properties`.

Se puede navegar libremente entre pasos aunque falten datos — obligar a
completar en orden es lo que hace que alguien abandone en el paso 3. Lo que sí
está bloqueado es el envío: hasta que no esté todo, el botón no habilita y se
dice exactamente qué falta y en qué paso.

**Las fotos se comprimen en el navegador** (1920 px de lado mayor, WebP, calidad
0,82) y suben directo a Storage, sin pasar por el servidor. **El archivo original
sube igual**, a una subcarpeta `original/` que la política de storage no deja
borrar: se conserva mientras exista el aviso.

**Publicar no se puede saltar la moderación.** Un aviso nace en `in_review` y
solo moderación puede pasarlo a `published`; el trigger de la base lo rechaza
aunque la petición llegue directo a la API. Los seis estados son `draft`,
`in_review`, `published`, `rejected`, `paused` y `archived`. Un rechazo sin un
motivo de al menos diez caracteres no se guarda.

## Variables de entorno

Copiar `.env.example` a `.env` y completar. Ninguna clave real se sube al
repositorio. En Vercel se configuran en **Settings → Environment Variables**.

Para desplegar hoy solo hace falta `NEXT_PUBLIC_URL_SITIO`; el resto se va
activando conforme entren los sprints de base de datos, fotos y pagos.

> `SUPABASE_SERVICE_ROLE_KEY` y `CLOUDINARY_API_SECRET` se saltan toda
> autorización. Nunca deben llevar el prefijo `NEXT_PUBLIC_` ni llegar al
> navegador.

## Idioma

Toda la interfaz va en español peruano: moneda `S/ 450,000` y `US$ 120,000`,
fechas `15 de agosto de 2026`, zona horaria `America/Lima`. El código
(variables, tipos, archivos) puede seguir en inglés.

La regla está automatizada en [`tests/unidad/idioma.test.ts`](tests/unidad/idioma.test.ts):
la suite falla si aparece texto en inglés visible en la interfaz.

## Despliegue en Vercel

El proyecto se importa tal cual: Vercel detecta Next.js y usa `npm run build`.
`vercel.json` fija la región `gru1` (São Paulo), la más cercana a Lima, y
`.vercelignore` deja fuera `legacy/`, la documentación y las pruebas.
