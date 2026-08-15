# Plan de migración a Next.js + Supabase

**Sprint 1** · 15 de agosto de 2026 · Propuesta, todavía sin ejecutar.

---

## 1. El punto de partida honesto

El stack objetivo **reemplaza** casi todo lo que existe. No es una evolución.

| Requisito | Hoy | Se conserva |
|---|---|:--:|
| Next.js + App Router + Server Components | HTML estático + módulos ES | ❌ |
| Tailwind CSS | CSS propio | ❌ |
| Supabase Auth | JWT propio + `version_token` | ❌ |
| Supabase RLS | `puede()` en la aplicación | ❌ |
| Supabase Storage | Cloudinary con firma | ❌ |
| Supabase Postgres | Neon Postgres | ⚠️ El SQL sí migra |
| PostGIS | No instalado | ➕ Se agrega |
| Vercel | Netlify | ❌ |
| Vitest/Jest + Playwright | 338 pruebas propias | ⚠️ Se reescriben |

**Se reescriben:** 26 archivos TypeScript (3,837 líneas), 7 páginas HTML (2,538 líneas)
y las 338 aserciones.

**Sobrevive intacto:** el esquema SQL (33 tablas), los datos sembrados, los 12 documentos
de diseño, la identidad visual y —lo más valioso— **las reglas de negocio ya probadas**.

---

## 2. Lo que se conserva, en concreto

### 2.1 Base de datos — migra casi tal cual

Supabase **es** Postgres. Las 5 migraciones se aplican con cambios menores:

| Elemento | Migración |
|---|---|
| 33 tablas, 98 índices, 51 FK, 288 CHECK | Directo |
| `pg_trgm`, `unaccent`, `btree_gist` | Disponibles en Supabase |
| Función `sin_tildes()` inmutable | Directo — sigue siendo necesaria |
| Triggers (`precio_ref_usd`, características) | Directo |
| Constraint `EXCLUDE` de destaques | Directo |
| Semillas: 74 ubicaciones, 18 características, 8 planes, índice | Directo |
| Tabla `usuarios` | ⚠️ **Debe apoyarse en `auth.users` de Supabase** |
| Tabla `intentos_auth` | Se puede retirar: Supabase trae límite de intentos |
| Tabla `tokens_cuenta` | Se puede retirar: Supabase gestiona verificación y recuperación |

**El cambio de fondo:** `usuarios.id` pasa a ser una FK a `auth.users(id)`, y la contraseña
sale de nuestra tabla. Toca todas las claves foráneas que apuntan a `usuarios`.

### 2.2 Reglas de negocio — el activo más caro de reponer

Están probadas y hay que trasladarlas sin perderlas:

| Regla | Dónde vive hoy | Pruebas |
|---|---|---:|
| Precio entre monedas (`precio_ref_usd`) | Trigger + búsqueda | 36 |
| Máquina de estados del aviso (8 estados) | `estados.ts` | 47 |
| Topes de plan (avisos, fotos, índice) | `limites.ts` | — |
| Publicar devuelve **todos** los faltantes | `servicio.ts` | — |
| Teléfono visible solo en planes pagos | `servicio.ts` | — |
| Privacidad: dirección nunca pública, mapa desplazado | `publico.ts` | 34 |
| Badge "vs mercado" en la misma consulta | `publico.ts` + búsqueda | — |
| 301 desde slugs históricos | `rutas.ts` | — |
| Matriz de permisos, 6 roles | `permisos.ts` | 29 |

### 2.3 Identidad visual

- `public/marca/skyline-lima.svg` — **extraído en este sprint**, 161 elementos, 11 animaciones
- `public/og.png` — 1200×630
- Paleta y tipografías documentadas en `PROJECT_AUDIT.md` §5
- Formato peruano (`S/`, `US$`, fechas es-PE) — 20 pruebas que hay que replicar

---

## 3. Riesgos

| # | Riesgo | Impacto | Cómo se reduce |
|---|---|---|---|
| R-01 | **Autenticación**: cambiar a Supabase Auth invalida todas las sesiones y contraseñas | Alto | Hoy hay 1 usuario. Migrar **ahora** cuesta casi nada; con usuarios reales cuesta mucho |
| R-02 | **RLS reemplaza `puede()`**: la lógica es la misma pero el lenguaje es otro | Alto | Portar la matriz de permisos a políticas y **replicar las 29 pruebas** antes de dar por buena la migración |
| R-03 | **Se pierde cobertura de pruebas** al reescribir | Alto | Migrar las 338 aserciones a Vitest suite por suite, no al final |
| R-04 | **PGlite ya no sirve** para probar contra Postgres real sin Docker | Medio | Usar Supabase local (Docker) o una rama de base de datos por PR |
| R-05 | **Cloudinary → Supabase Storage**: se pierde `f_auto`, transformaciones y `phash` | Medio | Storage no transforma. Evaluar mantener Cloudinary o usar `next/image` |
| R-06 | **Sitio caído durante la migración** | Alto | Migrar en paralelo y cambiar el DNS al final, no reemplazar en caliente |
| R-07 | **Netlify → Vercel** deja huérfano el despliegue actual | Medio | Mantener Netlify vivo hasta que Vercel esté verificado |
| R-08 | **El esquema embebido y la automigración ya no aplican** | Bajo | Vercel sí corre build: se usan migraciones normales |
| R-09 | **Los datos del índice son provisionales** y pasan a la base nueva | Medio | Marcarlos igual con `muestras = 0` |
| R-10 | **Se arrastra el XSS (P-01)** si se copian los templates | Alto | React escapa por defecto — el problema desaparece solo si no se usa `dangerouslySetInnerHTML` |

---

## 4. Estrategia propuesta: migración en paralelo

**No** reemplazar el sitio en caliente. Levantar el proyecto Next.js al lado, con la
misma base de datos, y cambiar el dominio recién cuando esté verificado.

```
Hoy         wasipe.netlify.app  →  Neon Postgres
Durante     wasipe.netlify.app  →  Neon Postgres     (sigue vivo)
            preview.vercel.app  →  Supabase Postgres (se construye)
Al final    wasipe.netlify.app  →  redirige a Vercel
```

**Ventaja:** el sitio nunca queda caído y se puede comparar el comportamiento viejo con
el nuevo lado a lado.
**Costo:** dos bases durante la transición. Con un solo usuario y cero avisos, la
sincronización es trivial.

---

## 5. Orden sugerido de sprints

> Propuesta, no ejecución. Cada sprint espera aprobación.

| Sprint | Contenido | Depende de |
|---|---|---|
| **2** | Proyecto Next.js: TypeScript estricto, Tailwind, ESLint, Prettier, Vitest, Playwright, `.env.example`, despliegue en Vercel | — |
| **3** | Supabase: proyecto, migración del esquema (33 tablas), semillas, PostGIS, **RLS con las pruebas de permisos portadas** | 2 |
| **4** | Supabase Auth: registro, ingreso, roles, middleware de sesión, portar las 36 pruebas de cuentas | 3 |
| **5** | Home: preservar la ilustración, buscador funcional, avisos reales debajo, responsive, Lighthouse | 3 |
| **6** | Búsqueda: filtros, entre monedas, facetas, PostGIS, rutas semánticas | 3 |
| **7** | Publicación: asistente, Storage, subida de fotos, estados del aviso | 4 |
| **8** | Ficha pública: SEO, JSON-LD, badge vs mercado, contacto | 6 |
| **9** | Leads, favoritos, búsquedas guardadas, notificaciones | 4 |
| **10** | Wasi AI: publicación asistida, búsqueda en lenguaje natural, comparación | 7 |
| **11** | Mejora de fotos y ambientación virtual, **con etiquetado obligatorio** | 7 |
| **12** | Video automático de propiedades | 11 |
| **13** | Historial de precios y análisis de mercado | 6 |
| **14** | Monetización: planes, pagos, comprobantes | 4 |
| **15** | Panel de administración y moderación | 4 |

---

## 6. Decisiones pendientes

Estas hay que resolverlas antes del Sprint 2:

1. **¿Reescritura completa o migración por partes?** El stack pedido implica reescritura.
   Este plan asume paralelo, que es lo menos riesgoso.

2. **¿Se conserva Neon o se pasa todo a Supabase?** Supabase Postgres es lo coherente
   con Auth y RLS. Neon quedaría solo como respaldo durante la transición.

3. **¿Cloudinary o Supabase Storage?** Storage es más simple y está integrado, pero
   **no transforma imágenes**. Cloudinary da `f_auto`, miniaturas y `phash` para detectar
   fotos robadas. Con `next/image` delante, Storage puede alcanzar.

4. **¿Qué historial de git?** El commit base de este sprint es el estado actual. La
   alternativa es arrancar limpio y guardar esto como referencia.

5. **¿Se corrige el XSS (P-01) antes de migrar?** Si se reescribe en React el problema
   desaparece solo. Pero el sitio actual queda expuesto mientras tanto.

---

## 7. Lo que NO hay que perder

Al terminar la migración, esto debe seguir siendo cierto:

- [ ] El skyline de Lima sigue en el home, sin retoques
- [ ] Todo lo visible en español peruano (`npm run idioma` equivalente)
- [ ] `S/ 450,000` y `US$ 120,000`, fechas `15 de agosto de 2026`, zona America/Lima
- [ ] El rango de precio funciona **mezclando soles y dólares**
- [ ] La dirección exacta nunca sale en público; el mapa se desplaza ~300 m estables
- [ ] Publicar devuelve **todos** los faltantes juntos, no el primero
- [ ] Plan gratuito con **2 avisos**
- [ ] Los 8 estados del aviso y sus transiciones
- [ ] Filtro dueño directo vs agente
- [ ] Slugs viejos responden 301, no 404
- [ ] El badge "vs mercado" sale de la misma consulta, sin llamada extra
- [ ] Una agencia tiene exactamente un dueño
- [ ] Los pagos nunca se borran
