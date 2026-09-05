# Wasipe

Portal inmobiliario peruano. Next.js (App Router) + React + TypeScript,
sobre Supabase. Se despliega en Vercel.

## REGLA DE IDIOMA — obligatoria

Todo el proyecto va en **español peruano**. Tiene prioridad sobre cualquier
texto anterior en inglés.

- **Responder en español**, incluido el reporte final de cada sprint.
- **Todo lo visible en español**: navegación, botones, formularios, filtros,
  mensajes de confirmación, errores, estados vacíos, correos, notificaciones,
  paneles y lo que genere Wasi AI.
- **Nunca** dejar visibles: Buy, Rent, Projects, Search, Get Info,
  Publish for Free, Sign In, Dashboard, Settings.
  Usar: Comprar, Alquilar, Proyectos, Buscar, Más información,
  Publicar gratis, Iniciar sesión, Mi panel, Configuración.
- **El código sí puede ir en inglés** (variables, tablas, funciones). La regla
  aplica solo a lo que lee el usuario.
- **No traducir** nombres propios, marcas, calles, urbanizaciones,
  condominios ni proyectos inmobiliarios.

### Términos del mercado peruano
departamento (no "apartamento") · cochera o estacionamiento ·
distrito, provincia y departamento · mantenimiento ·
área total y área construida · inmobiliaria · corredor inmobiliario ·
propietario directo · proyecto inmobiliario · precio por m².

### Formatos
    S/ 450,000        US$ 120,000       (con US$, nunca "USD")
    S/ 2,500 mensuales                  US$ 1,750 por m²
    15 de agosto de 2026                locale es-PE, zona America/Lima

Usar siempre los helpers de `lib/formato.ts`: `dinero()`, `dineroExacto()`,
`porMetro()`, `mensual()`, `numero()`, `fecha()`, `fechaCorta()`, `hace()`,
`metros()`. La conversión y la moneda mostrada salen de `lib/moneda.ts`
(`precioMostrado()`, `porMetroMostrado()`, `convertir()`).
Ningún componente debe redefinirlos ni usar `toLocaleDateString` suelto.

### Cobertura
Perú → departamento → provincia → distrito. Prioridad Lima y Callao, pero la
base soporta todos los departamentos. Monedas: PEN y USD.

## AISLAMIENTO CON ATHEOS — no negociable

Existe un **segundo proyecto, Atheos**, en `C:\Users\mauri\Projects\atheos`.
No forma parte de este trabajo y **está prohibido tocarlo**.

| | Puerto | Regla |
|---|---|---|
| **Wasipe** | `localhost:3001` | El único que se levanta acá |
| **Atheos** | `localhost:3000` | **No se toca** |

Sobre Atheos: **no modificar archivos, no detener ni reiniciar su servidor,
no desplegarlo ni redesplegarlo, no ejecutar comandos desde su carpeta, no
reutilizar su repositorio, su Supabase, su proyecto de Vercel, su Sentry ni
sus variables.** `atheos-test` permanece pausado.

- Antes de reiniciar el 3001 hay que confirmar **por la línea de comandos del
  proceso** que apunta a `Projects\wasipe`. Si apunta a otra cosa, no se mata:
  se usa otro puerto.
- **Nunca matar procesos solo para liberar puertos.**
- La cuenta de Vercel es la misma que la de Atheos (`moterry1990`). Al
  desplegar hay que **crear un proyecto nuevo llamado `wasipe`** y nunca
  aceptar el que Vercel proponga por defecto.

Al cerrar cada fase se entrega esta confirmación literal:

> «Atheos no fue modificado, detenido, reiniciado ni redesplegado.»

Detalle completo en `PROJECT_ISOLATION_REPORT.md`.

## ILUSTRACIÓN DE LA PORTADA — congelada

La ilustración del hero de la página principal —el skyline de Lima, en
`components/marca/skyline-lima.tsx` y `public/marca-skyline-lima.svg`— viene
del sitio anterior y **se queda exactamente como está**.

**No se puede reemplazar, regenerar, recolorear, reposicionar ni cambiarle la
composición, ni en escritorio ni en móvil.** Tampoco redibujar sus trazos,
cambiar su paleta, recortarla, escalarla de otro modo, invertirla ni
sustituirla por una versión «mejorada» o generada.

Lo único que sigue siendo ajustable es el espacio alrededor: el relleno
inferior del hero, que en móvil se achica para que el skyline no se coma la
pantalla y el buscador quede visible sin desplazar. Eso es del contenedor,
no de la ilustración.

Si algún cambio parece exigir tocarla, se pregunta primero.

## Arquitectura

- **Next.js App Router.** `app/` con grupos de rutas `(public)`, `(auth)` y
  `(dashboard)`. Server Components por defecto; cliente solo donde hace falta.
- **React + TypeScript.** Validación con **Zod**. Estilos con **Tailwind**.
- **Supabase** — Postgres, Auth, Storage y **RLS**. Se habla por HTTP con
  `@supabase/supabase-js` y `@supabase/ssr`; la aplicación no abre cadenas de
  conexión. Los clientes viven en `lib/supabase/`.
- **Vercel** es el despliegue principal.
- **Netlify** queda **solo como vuelta atrás temporal**. No es el destino, no
  se desarrolla contra él y no se agregan funciones nuevas ahí. El código de
  esa etapa vive aislado en `legacy/` y no se toca salvo para el rollback.
- **Sentry** (`@sentry/nextjs`) en los tres runtimes. Inerte mientras no haya
  DSN. Nunca debe salir por ahí una contraseña, cookie, correo, teléfono,
  coordenada ni la clave de servicio; hay pruebas que lo verifican.
- **Anthropic SDK** para Wasi AI, en `lib/ia/`. El adaptador **siempre** pasa
  `baseURL` explícita: sin ella el SDK lee `ANTHROPIC_BASE_URL` del entorno y
  la llamada se va a otro servidor con la clave adentro. Hay pruebas de
  regresión; no quitarlas.

## Convenciones técnicas
- Rutas, tablas y columnas en español, coherente con lo que ya existe.
- Dinero en NUMERIC, nunca float. Fechas en TIMESTAMPTZ.
- Estados: TEXT + CHECK, no ENUM nativo.
- **Los permisos son de dos capas y ninguna reemplaza a la otra:** RLS en la
  base es la que manda, y las funciones de `lib/admin/permisos.ts`
  (`accedeASeccion()`, `seccionesDe()`) deciden qué se muestra. Nunca escribir
  la comprobación suelta dentro de un handler ni de un componente.
- La clave de servicio se salta RLS entera: **jamás con prefijo
  `NEXT_PUBLIC_`**, y solo para operaciones del servidor sobre datos de
  terceros (webhooks de pago, huellas de fotos, barridos de archivos).
- PATCH con lista blanca explícita de campos, jamás expandir el body.
- SQL solo en `lib/consultas/`, un archivo por módulo. Ningún componente
  arma consultas por su cuenta.
- Las imágenes no pasan por la aplicación: se suben directo a Supabase
  Storage con URL firmada. El tipo se valida por los primeros bytes del
  archivo, no por `file.type`.
- **Una migración aplicada NUNCA se modifica: crear una nueva.** Están en
  `supabase/migrations/`, con nombre `AAAAMMDDHHMMSS_descripcion.sql`.
- `PAGOS_EN_VIVO=no` por defecto. No hay pantalla que lo encienda: exige
  cambiar la variable en producción y volver a desplegar. Es a propósito.
- El DNS no se toca sin aprobación expresa.

## Comandos
    npm run dev -- -p 3001    Next en desarrollo. El puerto va SIEMPRE explícito:
                              el script es `next dev` a secas y sin `-p` intenta
                              el 3000, que es el de Atheos. `.claude/launch.json`
                              ya lo pasa; a mano hay que escribirlo.
    npm run build        build de producción
    npm run lint         eslint
    npm run typecheck    tsc --noEmit
    npm run format       prettier

    npm run test         vitest: unidad y base de datos
    npm run test:db      solo las de base de datos
    npm run test:e2e     playwright

    npm run db:push      aplica migraciones      (destructivo: ver abajo)
    npm run db:reset     rehace la base local    (destructivo: borra datos)
    npm run tipos        regenera types/base-datos.generado.ts
    npm run sembrar      datos de prueba

    node scripts/comprobar-entorno.mjs    qué variables faltan, sin imprimir valores
    node scripts/verificar-proyecto.mjs   solo lectura, previo a migrar

Antes de `db:push` contra un proyecto real se corre siempre
`scripts/verificar-proyecto.mjs`: confirma a qué proyecto apunta y si la base
está vacía. **Si sale con código 2, no se migra.**

## Pruebas — y qué no cubren
- **Vitest** para unidad y base de datos. Las de base corren contra
  **PGlite**, en memoria.
- **Playwright** para navegador, con `@axe-core/playwright` para accesibilidad.
- **PGlite no trae el esquema `storage`.** O sea: las políticas de
  `storage.objects` y buena parte del comportamiento real de RLS **no están
  probadas** por la suite verde. Eso se verifica contra Supabase de verdad, y
  hasta que se haga no se da por bueno.

## Documentos
Producto y arquitectura: ROADMAP · ARQUITECTURA · ESQUEMA · API ·
AUTENTICACION · FLUJO-AVISOS · MONETIZACION · PANEL-ADMIN · ADMINISTRACION ·
COMPETENCIA · HOME-MEJORAS · SEO · WASI-AI · RENDIMIENTO ·
FEATURE_INVENTORY · PLAN-IMPLEMENTACION (el orden de trabajo).

Infraestructura y lanzamiento: INFRASTRUCTURE_REPORT ·
PROJECT_ISOLATION_REPORT · ENVIRONMENT_MATRIX · STAGING_VERIFICATION ·
BACKUP_RESTORE_REPORT · OBSERVABILITY_REPORT · DEPLOYMENT_GUIDE ·
OPERATIONS_RUNBOOK · ROLLBACK_PLAN · MIGRATION_PLAN · PRODUCTION_CHECKLIST ·
FINAL_AUDIT · PROJECT_AUDIT · KNOWN_ISSUES.
