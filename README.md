# Wasipe

Portal inmobiliario del Perú. El precio por m² siempre visible.

## Stack

| Capa      | Herramienta                                       |
| --------- | ------------------------------------------------- |
| Framework | Next.js 16 (App Router) + React 19                |
| Lenguaje  | TypeScript en modo estricto                       |
| Estilos   | Tailwind CSS 4 (`@theme` en `app/globals.css`)    |
| Pruebas   | Vitest + Testing Library (unidad), Playwright (E2E) |
| Despliegue| Vercel                                            |

El stack anterior (Hono + Netlify Functions + Neon) vive en [`legacy/`](legacy/)
como referencia durante la migración. No entra al build ni al despliegue.

## Comandos

```bash
npm install          # instalar dependencias
npm run dev          # servidor de desarrollo en http://localhost:3000
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm test             # pruebas de unidad
npm run test:e2e     # pruebas de extremo a extremo (requiere `npm run build` antes)
npm run build        # build de producción
npm run legacy       # suite del stack anterior (338 pruebas)
```

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
