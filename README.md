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
