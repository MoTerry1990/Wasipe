# Wasipe

Portal inmobiliario peruano. Netlify Functions + Neon Postgres + Hono + TypeScript.

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

Usar siempre los helpers de `public/cuenta.js`: `dinero()`, `dineroExacto()`,
`porMetro()`, `mensual()`, `numero()`, `fecha()`, `fechaCorta()`, `hace()`.
Ninguna página debe redefinirlos ni usar `toLocaleDateString` suelto.

### Cobertura
Perú → departamento → provincia → distrito. Prioridad Lima y Callao, pero la
base soporta todos los departamentos. Monedas: PEN y USD.

## Convenciones técnicas
- Rutas, tablas y columnas en español, coherente con lo que ya existe.
- Dinero en NUMERIC, nunca float. Fechas en TIMESTAMPTZ.
- Estados: TEXT + CHECK, no ENUM nativo.
- Permisos siempre por `puede()` en `src/lib/permisos.ts`, nunca dentro de un handler.
- PATCH con lista blanca explícita de campos, jamás expandir el body.
- SQL solo en el `consultas.ts` de cada módulo.
- Una migración aplicada NUNCA se modifica: crear una nueva.

## Comandos
    npm run verificar    todo: typecheck, idioma, formato, esquema y módulos
    npm run idioma       detecta textos en inglés en lo visible
    npm run formato      fija moneda, fechas y zona horaria
    npm run empaquetar   arma wasipe-deploy.zip para arrastrar a Netlify

## Restricciones de Netlify
- 10 s de timeout: lo pesado va a background functions.
- 6 MB de payload: las imágenes NUNCA pasan por la función.
- Sin estado en memoria: rate limits y cachés en Postgres.
- Deploy manual: no corre el build, por eso las funciones van pre-empaquetadas
  y el esquema viaja embebido dentro de ellas.

## Documentos
ROADMAP · ARQUITECTURA · ESQUEMA · API · AUTENTICACION · FLUJO-AVISOS ·
MONETIZACION · PANEL-ADMIN · COMPETENCIA · HOME-MEJORAS ·
PLAN-IMPLEMENTACION (el orden de trabajo)
