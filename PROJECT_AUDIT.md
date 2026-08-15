# Auditoría técnica de Wasipe

**Sprint 1** · 15 de agosto de 2026 · Estado del repositorio antes de cualquier migración.

> Nada se migró ni rediseñó. La ilustración del home sigue intacta y en funcionamiento.

---

## 1. Resumen

| | |
|---|---|
| Estado de compilación | ✅ `typecheck` pasa, 0 errores |
| Pruebas | ✅ **338 aserciones en verde**, 0 rojas |
| Vulnerabilidades npm | ✅ 0 |
| Sitio en producción | ✅ En línea, base de datos conectada |
| Repositorio git | ❌ **No existía** — se crea en este sprint |
| Deriva repo ↔ producción | ⚠️ **Producción va atrás**: le falta el módulo de búsqueda |
| Seguridad | 🔴 **XSS almacenado** en 3 páginas públicas |

---

## 2. Framework y versiones

| Componente | Versión | Nota |
|---|---|---|
| Node | v24.18.0 (`engines: >=20`) | |
| TypeScript | 5.9.3 | `strict: true` activo |
| Hono | 4.13.1 | Framework HTTP del backend |
| @neondatabase/serverless | 0.10.4 | Driver HTTP, sin pool |
| jose | 5.10.0 | Firma de JWT |
| zod | 3.25.76 | Validación |
| esbuild | 0.28.2 | Empaquetado de funciones (dev) |
| @electric-sql/pglite | 0.5.4 | Postgres en WASM para pruebas (dev) |

**No hay** framework de UI. Las páginas son HTML estático con módulos ES nativos.
**No hay** Tailwind, React, Next.js, ni sistema de build para el frontend.

---

## 3. Estructura de carpetas

```
wasipe/
├─ public/                 7 páginas HTML · 2,538 líneas
│  ├─ index.html           home con la ilustración (44 KB, SVG embebido)
│  ├─ buscar.html          resultados y filtros
│  ├─ propiedad.html       ficha pública
│  ├─ publicar.html        asistente de 5 pasos
│  ├─ panel.html           panel del usuario
│  ├─ ingresar.html · registro.html
│  ├─ cuenta.js            cliente de la API + formato peruano
│  ├─ estilos.css          usado por solo 4 de 7 páginas
│  ├─ og.png               imagen para compartir (60 KB)
│  ├─ componentes/subidor-fotos.js
│  └─ marca/skyline-lima.svg   ← extraído en este sprint
├─ src/                    26 archivos TS · 3,837 líneas
│  ├─ app.ts               monta módulos, middleware, errores
│  ├─ lib/                 auth, permisos, errores, validar, limitar, middleware
│  ├─ db/                  cliente, migrar, dividir-sql, asegurar-esquema
│  ├─ modulos/             cuentas, ubicaciones, medios, propiedades, indice, busqueda
│  └─ servicios/           almacenamiento (Cloudinary), limites (planes)
├─ netlify/functions/      api.ts · sitemap.ts
├─ scripts/                13 scripts de prueba + empaquetado + semillas
└─ 12 documentos .md       5,522 líneas
```

---

## 4. Rutas

### Públicas (`netlify.toml`)

| Ruta | Sirve | Producción |
|---|---|---|
| `/` | index.html | ✅ 200 |
| `/buscar` | buscar.html | ✅ 200 |
| `/propiedad/*` | propiedad.html | ✅ 200 |
| `/publicar`, `/publicar/*` | publicar.html | ✅ 200 |
| `/ingresar` · `/registro` · `/panel` | respectivos | ✅ 200 |
| `/sitemap.xml` | función | ✅ 200 |
| `/robots.txt` | — | ❌ **404, no existe** |

### API — 38 endpoints en 7 grupos

| Grupo | Endpoints | Producción |
|---|---|---|
| `/api/v1/cuentas` | 11 | ✅ |
| `/api/v1/perfil` | 2 | ✅ |
| `/api/v1/ubicaciones` | 4 | ✅ 200 |
| `/api/v1/medios` | 4 | ✅ |
| `/api/v1/propiedades` | 12 | ✅ |
| `/api/v1/indice` | 4 | ✅ 401 sin sesión (correcto) |
| `/api/v1/buscar` | 3 | ❌ **404 — no desplegado** |

---

## 5. Sistema de estilos

- CSS propio, **sin framework**. Variables en `:root` por página.
- Paleta: `--fucsia #E11D74` · `--turquesa #0FA3A0` · `--tinta #1B2733` · `--niebla #F4F6F8`
- Tipografías: Bricolage Grotesque (display), Instrument Sans (texto), JetBrains Mono (cifras)
- **Duplicación**: cada página repite el bloque `:root` y los estilos base. `estilos.css` solo lo usan 4 de 7 páginas.

---

## 6. Fuente de datos

| | |
|---|---|
| Motor | Neon Postgres (serverless, driver HTTP) |
| Tablas | 33 |
| Migraciones | 5 archivos, 1,024 líneas |
| Índices | 98 · Claves foráneas 51 · CHECK 288 |
| Extensiones | `pg_trgm`, `unaccent`, `btree_gist` |
| Datos sembrados | 74 ubicaciones · 18 características · 8 planes · índice de 25 distritos |
| PostGIS | ❌ No instalado (planificado para el hito M23) |

**Sin datos falsos en producción.** Todo sale de la base.

---

## 7. Formularios y búsqueda

| Formulario | Estado |
|---|---|
| Buscador del home | ✅ Funciona, arma la URL con los filtros |
| Filtros de `/buscar` | ⚠️ La UI existe; **la API 404 en producción** |
| Asistente de publicación | ✅ 5 pasos con autoguardado cada 800 ms |
| Contacto en la ficha | ✅ Con honeypot y límite de frecuencia |
| Registro e ingreso | ✅ Funcionan en producción |

---

## 8. Autenticación

Implementación propia, **no** Supabase Auth:

- JWT firmado con HS256 (`jose`), en cookie `wasipe_sesion`
- `HttpOnly` · `Secure` · `SameSite=Lax` · 30 días
- Contraseñas con **scrypt** (`node:crypto`), memory-hard
- Revocación por `usuarios.version_token` — sin tabla de sesiones
- Límite de intentos sobre la tabla `intentos_auth`
- Permisos en la aplicación: `puede()` en `src/lib/permisos.ts`, denegar por defecto
- 6 roles: comprador, propietario, agente, inmobiliaria, moderador, admin

**No hay RLS.** Toda la autorización vive en la capa de aplicación.

---

## 9. Despliegue

| | |
|---|---|
| Plataforma | Netlify (cuenta `support-1ifh2zq`) |
| Método | **Arrastre manual de zip** — no hay CI |
| Funciones | Pre-empaquetadas con esbuild, esquema embebido |
| Migraciones | Se aplican solas en el primer request tras un arranque en frío |
| Repositorio | ❌ No hay git → no hay despliegue automático |

**Riesgo:** el zip se arma a mano, así que producción puede quedar atrás sin que nadie lo note. Ya pasó (ver §12).

---

## 10. Variables de entorno

| Variable | Uso | Producción |
|---|---|---|
| `DATABASE_URL` | Neon | ✅ Configurada |
| `JWT_SECRET` | Firma de sesión | ⚠️ Ausente — se autogenera y guarda en `config` |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | Fotos | ❌ **Faltan** → no se puede publicar |
| `RESEND_API_KEY` | Correo | ❌ Falta → verificación desactivada |
| `CULQI_SECRET_KEY` | Pagos | ❌ Falta |
| `URL_SITIO` | Sitemap | ❌ Falta (usa valor por defecto) |

---

## 11. Pruebas existentes

**338 aserciones, 14 suites, todas en verde.** Corren contra Postgres real (PGlite en WASM), sin Docker.

| Suite | Aserciones | Cubre |
|---|---:|---|
| propiedades | 47 | Ciclo completo del aviso |
| cuentas | 36 | Registro, sesión, escalada de privilegios |
| busqueda | 36 | Filtros, rangos entre monedas, facetas |
| ficha | 34 | Privacidad, badge vs mercado, 301 de slugs |
| medios | 31 | Subida firmada, portada, topes |
| humo | 29 | API en memoria |
| invariantes | 29 | Garantías de la base |
| ubicaciones | 25 | Autocompletado con alias y typos |
| autoesquema | 23 | Arranque desde base vacía |
| formato | 20 | Moneda y fechas peruanas |
| bundle | 15 | Empaquetado con esbuild |
| sql | 11 | Divisor de SQL |
| esquema · idioma | 2 | Migraciones · textos en inglés |

**No hay**: Vitest/Jest, Playwright, ESLint, Prettier. Las pruebas son scripts propios con `node`.

---

## 12. Deriva entre repositorio y producción ⚠️

El repositorio tiene código que **no está desplegado**:

| | Repositorio | Producción |
|---|---|---|
| `/api/v1/buscar` | ✅ Existe, 36 pruebas | ❌ 404 |
| `exige_verificacion` en `/salud` | ✅ | ❌ Ausente |

**Causa:** el último zip no se arrastró a Netlify. Con despliegue manual esto no se detecta solo.

---

## 13. Seguridad

### 🔴 Crítico — XSS almacenado

`index.html`, `buscar.html` y `panel.html` insertan datos de la API en `innerHTML` **sin escapar**:

```js
// public/index.html:604  y  public/buscar.html:232
<div class="prop-titulo">${p.titulo}</div>
```

| Página | Escapa | Interpolaciones sin escapar |
|---|---|---|
| index.html | ❌ | 6 |
| buscar.html | ❌ | 16 |
| panel.html | ❌ | 11 |
| propiedad.html | ✅ | — |
| publicar.html | ✅ | — |

La validación del título (`min 10, max 140`) **no filtra `<` `>` ni comillas**. Un aviso titulado
`<img src=x onerror="...">` ejecuta código en el home y en la búsqueda para todo visitante.

La CSP no protege: incluye `script-src 'unsafe-inline'`.

**Atenuante:** la cookie es `HttpOnly`, así que la sesión no se puede robar leyendo `document.cookie`.
**Sigue siendo grave:** el código inyectado puede hacer peticiones autenticadas en nombre del usuario,
inyectar formularios de phishing o desfigurar el sitio.

### ✅ Correcto

- Ningún secreto en el frontend
- Contraseñas con scrypt, nunca en claro
- Tokens guardados como hash SHA-256
- Lista blanca de campos en todos los `PATCH` (probado contra escalada de privilegios)
- CSRF cubierto por `SameSite=Lax` + exigir `Content-Type: application/json`
- Cabeceras: `nosniff`, `X-Frame-Options: DENY`, HSTS, CSP

---

## 14. Accesibilidad

| Comprobación | Resultado |
|---|---|
| `lang="es-PE"` | ✅ En las 7 páginas |
| `<h1>` presente | ✅ En las 7 |
| Imágenes con `alt` | ✅ Ninguna sin `alt` |
| `aria-*` en pestañas y opciones | ✅ `aria-selected`, `aria-pressed`, `aria-invalid` |
| `:focus-visible` | ✅ Definido |
| `prefers-reduced-motion` | ✅ Respetado en el home |
| Múltiples `<h1>` en publicar.html | ⚠️ 6 en el código fuente, pero solo 1 visible por paso |
| Contraste | ⚠️ Sin medir — requiere herramienta real |
| Navegación con teclado | ⚠️ Sin probar de punta a punta |

---

## 15. Responsive

| Página | viewport | media queries |
|---|:--:|:--:|
| index.html | ✅ | 4 |
| buscar.html | ✅ | 2 |
| panel · propiedad · publicar · registro | ✅ | 1 c/u |
| **ingresar.html** | ✅ | ⚠️ **0** |

`ingresar.html` no tiene ningún punto de quiebre — hay que revisarlo en móvil.

---

## 16. SEO

| | |
|---|---|
| `robots.txt` | ❌ **404** |
| `sitemap.xml` | ✅ 77 URLs (3 fijas + 74 distritos) |
| `canonical` | ✅ En home y ficha |
| Open Graph + `og:image` | ✅ 1200×630 propio |
| JSON-LD `RealEstateListing` | ✅ En la ficha · ❌ ausente en el home |
| `<title>` y `meta description` | ✅ En todas |
| Rutas semánticas | ⚠️ `/buscar?distrito=x`, no `/venta/departamentos/miraflores` |

---

## 17. Código muerto y duplicados

| Hallazgo | Detalle |
|---|---|
| `scripts/sembrar-todo.js` | Referenciado en `package.json` pero **no existe** |
| `NAV_MARCA` en `cuenta.js` | Exportado, **usado en 0 páginas** |
| `estilos.css` | Solo lo usan 4 de 7 páginas |
| Bloque `:root` y estilos base | Repetidos en cada HTML |
| `sembrar-ubicaciones.js` | Duplica lo que ya hace la migración 004 |

---

## 18. Inconsistencia funcional

La navegación del home enlaza a `/buscar?operacion=proyecto`, pero el esquema solo admite
`venta`, `alquiler` y `traspaso`. **"Proyectos" no es una operación**: son una entidad aparte
(`proyectos` + `tipologias`), todavía sin construir. Ese enlace no puede devolver resultados.
