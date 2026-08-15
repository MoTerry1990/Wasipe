# Wasipe — Plan de implementación

26 hitos en orden de dependencia. Cada uno está dimensionado para 1–3 sesiones de Claude Code.

## Estado (2026-08-10)

| Hito | Estado |
|---|---|
| **M0** Desbloquear producción | ⏳ **Falta `DATABASE_URL` y `JWT_SECRET`** en el sitio nuevo. Es lo único que bloquea todo |
| **M1** Repo y código fuente | ✅ Hecho. Hono + TypeScript, runner de migraciones, `001_inicial.sql` **ejecutado y verificado** |
| **M2** Auth portado | ✅ Hecho. Registro, ingreso, sesión, perfil, recuperación, revocación |
| **M3** Correo | ⏳ Falta el envío real (Resend). Los tokens ya se generan y validan |
| **M4** Ubicaciones | ✅ Hecho. 74 ubicaciones sembradas, autocompletado con alias y tolerancia a typos |
| **M5** Subida de imágenes | ✅ **Backend hecho** — firma, verificación contra Cloudinary, portada, topes de plan. **Falta `subidor-fotos.js`** (compresión en navegador + subida en paralelo), que hay que probar en celular real |
| **M6** Avisos + asistente | ✅ **Backend hecho** — borrador, edición, publicar con faltantes, pausar/renovar/cerrar, duplicar. **Falta el asistente** (`publicar.html` + `subidor-fotos.js`) |
| **M7** Ficha pública | ✅ **API hecha** — badge vs mercado, 301 de slugs viejos, vistas deduplicadas, sitemap. **Falta `propiedad.html`** |
| **M8** Moderación · **M9** Leads | ⏳ Siguientes |

**242 pruebas en verde** con `npm run verificar` — typecheck, humo de la API, esquema contra Postgres real (PGlite/WASM), invariantes de la base, cuentas de punta a punta y ubicaciones. Sin Docker ni Neon.

> **Nota sobre los ubigeo:** `scripts/datos/ubicaciones.js` deja el código INEI en NULL a propósito. Son códigos oficiales y escribirlos de memoria es pedir un error silencioso — hay que importar el padrón del INEI antes de usarlos para algo formal.

---

**Documentos de referencia:** `ARQUITECTURA.md` · `ESQUEMA.md` · `API.md` · `AUTENTICACION.md` · `FLUJO-AVISOS.md` · `MONETIZACION.md` · `PANEL-ADMIN.md`

---

## Mapa de dependencias

```
M0 conectar BD ─── M1 repo y fuentes ─── M2 auth ─── M3 correo
                                            │
                          ┌─────────────────┴──────────────┐
                          │                                │
                     M4 ubicaciones                   M5 imágenes
                          │                                │
                          └────────────┬───────────────────┘
                                       │
                               M6 avisos + asistente
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
             M7 ficha pública    M8 moderación       M9 leads
                    │                  │                  │
                    └──────────────────┴──────────────────┘
                                       │
                          M10 ciclo de vida · M11 búsqueda
                          M12 panel · M13 seguridad y legales
                                       │
                              ══ MVP COMPLETO ══
                                       │
                    M14→M22 monetización y crecimiento
                                       │
                    M23→M26 escala y foso competitivo
```

**Ruta crítica:** M0 → M1 → M2 → M4 → M5 → M6 → M7. Todo lo demás puede reordenarse; esta secuencia no.

---

# FASE 0 · Desbloquear

## M0 · Poner la producción en pie

**Meta:** que el backend actual funcione. Hoy está caído.
**Depende de:** nada. **Empezá por acá.**

**Trabajo** — configuración, casi sin código:
1. Crear la base en Neon (o recuperar la existente) y copiar la cadena de conexión
2. En Netlify → Environment variables: `DATABASE_URL`, marcada como secret
3. Generar y cargar `JWT_SECRET`: `openssl rand -base64 48`
4. Redesplegar
5. **Verificar si la base tiene datos** — decide todo el M1:
   ```bash
   psql $DATABASE_URL -c "\dt"
   psql $DATABASE_URL -c "SELECT count(*) FROM usuarios"
   ```
6. Alta en Sentry, Cloudinary, Resend y Culqi (modo prueba). Guardar las llaves
7. Monitor externo (UptimeRobot) apuntando a `/api/salud` cada 5 min

**Pruebas**
```bash
curl https://wasipe.netlify.app/api/salud            # bd: "conectada"
curl https://wasipe.netlify.app/api/propiedades/buscar # 200, no error de BD
```
Registrarse, entrar, abrir `/panel` y ver el índice.

**Listo cuando** · `/api/salud` responde `{"ok":true,"bd":"conectada"}` · se puede crear una cuenta y entrar · el monitor externo avisa si se cae · quedó anotado si la base estaba vacía o con datos.

---

# FASE 1 · MVP

## M1 · Repositorio y código fuente

**Meta:** dejar de tener un bundle minificado sin fuentes. Sin esto, todo cambio posterior es una apuesta.
**Depende de:** M0

> ⚠️ **El riesgo más alto del proyecto.** Estrategia: trabajar en una rama, probar en deploy preview con una rama de Neon, verificar paridad completa, recién ahí mergear. El sitio en producción no se toca hasta que la nueva versión responde igual.

**Archivos**
```
.gitignore  package.json  tsconfig.json  netlify.toml  CLAUDE.md
src/app.ts
src/db/cliente.ts  src/db/migrar.ts
src/db/migraciones/001_inicial.sql        ← ya escrito
src/lib/errores.ts  src/lib/respuesta.ts  src/lib/validar.ts
netlify/functions/api.ts                  ← export default app.fetch
scripts/sembrar-*.ts
```

**Base de datos**
- Runner de migraciones con `pg_advisory_lock` (código en `ARQUITECTURA.md` §10)
- **Si la base está vacía:** correr `001_inicial.sql` tal cual
- **Si tiene datos:** no correrlo. Escribir primero `000_migrar_legado.sql` — `ALTER COLUMN id TYPE uuid`, `precio TYPE NUMERIC(14,2)`, backfill de `ubicaciones` desde los distritos en texto libre
- Correr contra una rama de Neon antes que contra producción

**API** · Hono montado, `/api/v1/salud` respondiendo, redirect de `/api/*` a `/api/v1/*` en `netlify.toml` para no romper el frontend.

**Frontend** · ninguno.

**Pruebas**
- `001_inicial.sql` corre sin errores sobre una base limpia — **es lo primero que hay que verificar; nunca se ejecutó**
- Correr las migraciones dos veces seguidas: la segunda no debe hacer nada
- Deploy preview responde igual que producción en `/api/salud`

**Listo cuando** · el repo está en GitHub con historia · `npm run migrar` es idempotente · el deploy preview levanta con esquema propio · `001_inicial.sql` aplicado y verificado.

---

## M2 · Auth portado

**Meta:** mover cuentas y permisos al código nuevo sin que los usuarios existentes noten nada.
**Depende de:** M1

**Archivos**
```
src/lib/auth.ts        firmar/verificar JWT, cookie, secreto cacheado
src/lib/permisos.ts    puede() — switch, denegar por defecto
src/lib/limitar.ts     rate limiting sobre intentos_auth
src/lib/middleware.ts  conSesion · conVerificado · conRol · conPermiso · conPlan
src/modulos/cuentas/   rutas.ts servicio.ts consultas.ts esquemas.ts
src/modulos/perfiles/  ídem
```

**Base de datos** · ninguna (M1 ya creó las tablas).

**API** · `/cuentas/registro` `ingresar` `salir` `salir-todo` `yo` · `/perfil` GET y PATCH.
`GET /cuentas/yo` amplía la respuesta con `perfil`, `agencia`, `plan` y `perfil_completitud`.

**Frontend** · `cuenta.js` apunta a `/api/v1`. `panel.html` lee los campos nuevos de `/cuentas/yo`.

**Seguridad — tarea obligatoria de este hito**
> Revisar cómo el bundle actual maneja `PATCH /perfil`. Si expande el body dentro del `UPDATE`, es una escalada de privilegios: cualquiera agrega `rol: "admin"` desde las herramientas del navegador. Implementar **lista blanca explícita de campos** (`AUTENTICACION.md` §9).

**Pruebas** (los primeros tests automatizados del proyecto)
- `permisos.test.ts` — la matriz completa de `AUTENTICACION.md` §3. Función pura, fácil de cubrir
- Un usuario creado con el backend viejo puede entrar con el nuevo
- `PATCH /perfil` con `{ rol: "admin" }` **no** cambia el rol
- Al registrarse con `rol: "admin"` → 403
- Cambiar contraseña invalida las demás sesiones
- 9 intentos de login fallidos → 429

**Listo cuando** · registro, login y panel funcionan igual que antes · la lista blanca está puesta y probada · `permisos.test.ts` pasa · `version_token` invalida sesiones de verdad.

---

## M3 · Correo: verificación y recuperación

**Meta:** cerrar el ciclo de cuenta. Lo necesitan M8 y M9.
**Depende de:** M2

**Archivos**
```
src/servicios/correo.ts
src/modulos/notificaciones/plantillas/
  verificar-email · recuperar-password · bienvenida
public/verificar.html  public/recuperar.html
```

**Base de datos** · `tokens_cuenta` ya existe. Cron de limpieza de tokens vencidos.

**API** · `/cuentas/verificar-email` + `/confirmar` · `/cuentas/recuperar` + `/confirmar` · `PATCH /cuentas/password`.

**Frontend** · páginas de verificación y de nueva contraseña · aviso en el panel si el correo no está confirmado.

**Pruebas**
- El token se guarda **hasheado**, nunca en claro
- Token usado dos veces → 410
- Token vencido → 410
- `POST /cuentas/recuperar` con un correo inexistente → **200**, igual que con uno válido
- Reset exitoso → incrementa `version_token` e invalida los demás tokens de reset

**Listo cuando** · llegan los correos con dominio propio · verificar funciona de punta a punta · recuperar no revela qué correos existen.

---

## M4 · Ubicaciones

**Meta:** distritos normalizados. Sin esto la búsqueda se fragmenta apenas alguien escriba "Surco" en vez de "Santiago de Surco".
**Depende de:** M1

**Archivos** · `src/modulos/ubicaciones/` · `scripts/sembrar-ubicaciones.ts` · `public/componentes/selector-ubicacion.js`

**Base de datos** · Sembrar los 43 distritos de Lima + Callao + capitales de provincia, con `alias`, `ubigeo` (INEI), `lat`/`lng`. Verificar que `ix_ubic_trgm` y `unaccent` funcionan.

**API** · `GET /ubicaciones/sugerir?q=` · `GET /ubicaciones` (árbol, caché 24 h).

**Frontend** · `selector-ubicacion.js` con autocompletado, navegable por teclado.

**Pruebas**
- `?q=jesus` encuentra "Jesús María" — **sin tildes**
- `?q=surco` encuentra "Santiago de Surco" por alias
- `?q=mirafores` (con typo) encuentra Miraflores
- El componente funciona con teclado

**Listo cuando** · sembrado y verificado · las tres búsquedas de arriba devuelven resultado · corregido el reclamo de "43 distritos" del home para que coincida con lo cargado.

---

## M5 · Subida de imágenes

**Meta:** que se puedan subir fotos. Es donde más gente abandona.
**Depende de:** M1

**Archivos** · `src/servicios/almacenamiento.ts` · `src/modulos/propiedades/medios.ts` · `public/componentes/subidor-fotos.js`

**Base de datos** · `medios` ya existe. Verificar `ux_medios_portada`.

**API** · `POST /medios/firma` · `POST /propiedades/:id/medios` (**verifica contra la Admin API de Cloudinary**) · `PATCH .../medios` (reordenar + portada) · `DELETE`.

**Frontend — el componente más difícil del proyecto**
- Compresión en el navegador antes de subir (canvas → WebP, lado mayor 2400 px)
- Subida en paralelo, arrancando al elegir el archivo, sin bloquear el formulario
- Progreso por foto · reintento automático
- Reordenar con **flechas ↑↓**, no solo arrastrando (arrastrar en móvil es un desastre)
- Portada explícita
- Avisos, no bloqueos: foto oscura · duplicada · menos de 5 fotos

**Pruebas**
- **Probar en un celular real con datos móviles, no en wifi.** Va a pasar en wifi y fallar en la calle
- Foto de 8 MB → comprimida a <1 MB → sube
- HEIC de iPhone
- `public_id` inventado → 422
- `public_id` de otro usuario → 403
- Dos portadas → la base lo impide
- Se elimina el EXIF (los celulares guardan el GPS de la casa)

**Listo cuando** · 10 fotos suben desde un celular en 4G en menos de 60 s · la verificación contra Cloudinary rechaza ids falsos · reordenar funciona con dedo y con teclado.

---

## M6 · Avisos y asistente de publicación

**Meta:** cerrar el circuito. Hoy `panel.html:293` sigue haciendo `alert('...siguiente paso del proyecto')`.
**Depende de:** M4, M5

**Archivos**
```
src/modulos/propiedades/ rutas · servicio · consultas · esquemas · estados
src/servicios/limites.ts
public/publicar.html
public/componentes/  pasos-asistente.js · campo-precio.js
                     selector-caracteristicas.js · guardado-automatico.js
```

**Base de datos** · migración `002_avisos_workflow.sql` (`FLUJO-AVISOS.md` §6) · sembrar el catálogo de `caracteristicas` · sembrar `tipo_cambio` — **obligatorio**, sin una fila el trigger de `precio_ref_usd` usa el fallback 3.75.

**API** · `POST /propiedades` (borrador) · `PATCH` (parcial, autoguardado) · `/publicar` `/pausar` `/reactivar` `/renovar` `/cerrar` · `DELETE` · `GET /propiedades`.

**Frontend** · asistente de 5 pasos, con las **fotos en el paso 2** · modo rápido para agentes (`?modo=rapido`) · autoguardado con rebote de 800 ms.

> **Este hito sale con auto-aprobación activada para todos.** Los avisos van directo a `activo`. M8 agrega la cola de moderación. Al revés, los avisos quedarían atascados en `revision` sin nadie que los apruebe.

**Pruebas**
- `estados.test.ts` — la tabla de transiciones completa
- `limites.test.ts` — topes de plan
- Publicar sin precio → 422 con **todos** los faltantes, no solo el primero
- Publicar sin correo verificado → 403
- Editar un aviso de otro → 403
- Autoguardado: recargar a mitad del asistente y no perder nada
- Un aviso en soles obtiene `precio_ref_usd` correcto

**Listo cuando** · un usuario nuevo publica un aviso con fotos de punta a punta desde el celular · el borrador sobrevive a recargar la página · el `alert()` de `panel.html` ya no existe.

---

## M7 · Ficha pública

**Meta:** que cada aviso tenga URL propia. **Es lo que trae el tráfico**: 60–80% de las visitas de un portal inmobiliario entran por buscador a fichas individuales.
**Depende de:** M6

**Archivos** · `public/propiedad.html` · `src/modulos/propiedades/publico.ts` · `netlify/functions/sitemap.ts`

**Base de datos** · generación de `slug` y `codigo` · `slugs_historicos` al cambiar el slug.

**API** · `GET /propiedades/:slug` (acepta slug o UUID, **301 si el slug es histórico**) · suma vista deduplicada por IP/día.

**Frontend** · galería · mapa (o ubicación aproximada si `ocultar_mapa`) · características · datos de quien publica · formulario de contacto · avisos similares · **JSON-LD `RealEstateListing`** · Open Graph.

**SEO** · `sitemap.xml` dinámico · `robots.txt` · canonical · rutas `/venta/departamentos/miraflores`.

**Pruebas**
- `direccion` **nunca** aparece en la respuesta pública
- Con `ocultar_mapa`, las coordenadas vienen desplazadas ~300 m
- Aviso no `activo` → 404 (salvo dueño o admin)
- Slug viejo → 301 al nuevo
- JSON-LD valida en la herramienta de Google
- La ficha carga en <2 s en 4G

**Listo cuando** · cada aviso tiene URL propia y compartible · el sitemap lista los activos · Google Search Console no reporta errores · las tarjetas del home enlazan acá y no a `/buscar`.

---

## M8 · Moderación

**Meta:** control de calidad antes de que la oferta crezca.
**Depende de:** M6, M3

**Archivos** · `src/modulos/admin/` rutas · moderacion · reglas · `src/servicios/auditoria.ts` · `public/admin/moderacion.html` · `public/admin/admin.js`

**Base de datos** · `marcas_moderacion` y `auditoria` ya existen · contadores de confianza en `usuarios`.

**API** · `GET /admin/moderacion` · `/aprobar` · `/rechazar` · `POST /admin/propiedades/:id/recalcular`.

**Frontend** · cola por riesgo · pantalla de revisión con **atajos de teclado y avance automático** (200 avisos/hora contra 40) · rechazo con motivo de catálogo cerrado.

**Reglas de riesgo** (`FLUJO-AVISOS.md` §4.2): fotos repetidas por `phash` · precio fuera del índice · contacto en la descripción · cuenta nueva con volumen · discriminación · dirección repetida.

**Pruebas**
- Un usuario no admin no llega a `/api/v1/admin/*` → 403
- Aprobar pone `activo`, `publicado_en` y `vence_en`
- Rechazar sin motivo del catálogo → 422
- Cada acción escribe en `auditoria` con `antes` y `despues`
- Las reglas de riesgo disparan sobre casos armados a propósito
- Los niveles de confianza auto-aprueban a quien corresponde

**Listo cuando** · un moderador procesa la cola solo con teclado · las reglas marcan los casos de prueba · todo queda auditado · la auto-aprobación pasa de "todos" a niveles de confianza.

---

## M9 · Leads

**Meta:** que el contacto llegue y se pueda gestionar.
**Depende de:** M6, M3

**Archivos** · `src/modulos/leads/` · `public/componentes/bandeja-leads.js`

**Base de datos** · `leads` y `mensajes` ya existen · `destinatario_id` **se copia al crear**, no se deduce.

**API** · `POST /propiedades/:id/contacto` (público, rate-limited, honeypot) · `GET /leads` · `PATCH /leads/:id` · `/mensajes`.

**Frontend** · pestaña de leads en el panel · enlace `wa.me` armado · cambio de estado.

**Pruebas**
- 6 contactos en una hora desde la misma IP → 429
- Honeypot con contenido → 201 falso, no se guarda nada
- Contactar el aviso propio → 422
- Llega el correo al dueño
- Cambiar el dueño del aviso **no** reasigna leads viejos

**Listo cuando** · el formulario de `buscar.html` crea leads reales · llega el correo · el dueño los gestiona desde el panel.

---

## M10 · Ciclo de vida y tareas programadas

**Meta:** sostener la promesa del home — *"Aquí no hay propiedades vendidas hace meses"*.
**Depende de:** M6, M3

**Archivos** · `netlify/functions/cron-vencimientos.ts` · `cron-limpieza.ts` · `src/modulos/propiedades/renovacion.ts`

**Base de datos** · `tokens_cuenta.tipo` acepta `renovar_aviso` · índices de cron.

**API** · `POST /propiedades/:id/renovar-token` — **público, sin sesión**, token de un solo uso.

**Frontend** · página de confirmación de renovación · aviso de "vence en X días" en el panel.

**Cron** · día 83 preaviso · día 90 → `vencido` · día 120 → `archivado` · borradores sin actividad: aviso a los 25 días, borrado a los 30 (con sus imágenes en Cloudinary).

**Pruebas**
- Adelantar `vence_en` a mano y correr el cron
- El enlace del correo renueva **sin login**, y solo una vez
- El preaviso no se manda dos veces (`aviso_vencimiento_en`)
- Se borran las imágenes huérfanas de Cloudinary

**Listo cuando** · el cron corre a diario en Netlify · la renovación por correo funciona en un clic · los borradores abandonados se limpian solos.

---

## M11 · Búsqueda mejorada

**Meta:** filtros que sirvan de verdad.
**Depende de:** M4, M6

**Archivos** · `src/modulos/busqueda/` rutas · consultas · filtros · `public/buscar.html` ampliado

**Base de datos** · verificar los índices parciales de `001_inicial.sql` · `EXPLAIN ANALYZE` sobre la consulta principal.

**API** · `GET /buscar` con toda la matriz de filtros (`API.md` §11) · `GET /buscar/facetas` · `GET /caracteristicas`.

**Frontend** · rango de precio y área · dormitorios y baños · características por chips · **filtro dueño directo / agente** · orden · filtros reflejados en la URL.

**Pruebas**
- Rango de precio correcto **mezclando avisos en soles y dólares** (usa `precio_ref_usd`) — si esto falla, la búsqueda entrega resultados equivocados
- `precio_min > precio_max` → 422
- Slug de distrito inexistente → 422 con la lista, no silencio
- `EXPLAIN` confirma que se usan los índices parciales
- La búsqueda responde en <200 ms con 1.000 avisos sembrados

**Listo cuando** · todos los filtros andan · las facetas muestran conteos · la URL es compartible · las consultas usan índice.

---

## M12 · Panel del usuario

**Meta:** que quien publica administre su cartera.
**Depende de:** M6, M9

**Archivos** · `public/panel.html` completo · `public/componentes/tarjeta-aviso.js` · `insignia-estado.js` · `modal-cerrar.js`

**API** · `GET /propiedades/:id/metricas` · `GET /propiedades/:id/completitud` · `POST /propiedades/:id/duplicar`.

**Frontend** · grilla de avisos con estado, métricas y acciones · pausar, reactivar, renovar, cerrar, duplicar · **modal de cierre pidiendo `precio_final`** con el incentivo de consultas extra al índice.

**Pruebas** · pausar libera cupo · reactivar lo revalida (402 si no hay) · duplicar copia todo menos fotos, código y slug · `precio_final` se guarda.

**Listo cuando** · se gestiona la cartera completa sin tocar la base · duplicar funciona (es lo que retiene agentes) · el cierre pide el precio final.

---

## M13 · Seguridad y obligaciones legales

**Meta:** que el sitio se pueda operar sin riesgo legal ni agujeros evidentes.
**Depende de:** M12

**Archivos** · `netlify.toml` con headers · `public/terminos.html` `privacidad.html` `reclamaciones.html` · `src/modulos/legal/`

**API** · `POST /reclamaciones` — **Libro de Reclamaciones, obligatorio en Perú**. Hoy es un enlace muerto en el footer.

**Frontend** · formulario de reclamaciones con código de seguimiento · enlaces reales en el footer · banner de cookies solo si se agrega analítica.

**Seguridad** · CSP · HSTS · `X-Frame-Options` · revisión de todos los rate limits · revisión de que ningún endpoint devuelve datos de otro usuario.

**Pruebas**
- Recorrer la lista de endpoints y probar cada uno **sin sesión y con la sesión equivocada**
- La CSP no rompe Cloudinary ni Google Fonts
- Los datos personales no aparecen en URLs
- El reclamo genera código y correo

**Listo cuando** · headers activos y verificados · Libro de Reclamaciones funcionando · ningún endpoint filtra datos ajenos.

> ## ══ MVP COMPLETO ══
> Publicar, moderar, buscar, contactar y renovar. Suficiente para abrir con usuarios reales y sembrar oferta en 3–4 distritos antes de invertir en captar demanda.

---

# FASE 2 · Monetización y crecimiento

## M14 · Planes y límites
Sembrar los 9 planes (`MONETIZACION.md` §3) · conectar `limites.ts` a `suscripciones` · `GET /planes` filtrado por `para_rol` · `public/planes.html`.
**Listo cuando** los topes se aplican en backend y exceder devuelve 402 con `plan_sugerido`.

## M15 · Pagos con Culqi
`src/modulos/pagos/` · checkout con tarjeta y **Yape** · `netlify/functions/webhook-culqi.ts` idempotente · secuencia de cobranza de 7 días.
**Probar** el webhook duplicado no cobra dos veces · firma inválida → 401 · pago fallido → `morosa`, no corte inmediato.
**Listo cuando** se cobra de verdad en modo prueba y el webhook es idempotente.

## M16 · Comprobantes electrónicos
Integración con Nubefact · boleta y factura con serie y correlativo · nota de crédito para devoluciones.
**Listo cuando** cada pago emite comprobante aceptado por SUNAT.

## M17 · Créditos y destaques
Migración `003_creditos.sql` · billetera con consumo FIFO por vencimiento · destacar en un clic desde la tarjeta · **tope de promocionados y rotación justa** (`MONETIZACION.md` §6).
**Listo cuando** el saldo cuadra con `movimientos_credito` y la búsqueda nunca muestra más de 3 promocionados en los primeros 10.

## M18 · Agencias y equipos
`src/modulos/agencias/` · invitaciones · asientos por plan · permisos por cargo (`dueno`/`admin`/`agente`).
**Listo cuando** un equipo comparte cartera y quitar a un miembro no se lleva sus avisos.

## M19 · Perfiles públicos
`/agente/:slug` y `/inmobiliaria/:slug` con cartera propia. Buen SEO y argumento de venta para el plan Agente.

## M20 · Favoritos, búsquedas guardadas y alertas
`PUT /favoritos/:id` idempotente · `cron-alertas.ts` diario y semanal.

## M21 · Badge "vs. mercado"
El diferenciador. Sale de la **misma consulta** de búsqueda, sin llamadas extra. Requiere el índice poblado.
**Listo cuando** cada tarjeta muestra "12% debajo del promedio de Miraflores" y el asistente de publicación lo muestra en vivo mientras se escribe el precio.

## M22 · Panel de administración completo
Pantalla **Hoy** · reportes · verificaciones · pagos · carga del Índice · métricas · alertas por correo y WhatsApp (`PANEL-ADMIN.md`).
**Listo cuando** la operación diaria se hace sin abrir la base de datos.

---

# FASE 3 · Escala

| # | Hito | Nota |
|---|---|---|
| **M23** | Búsqueda en mapa | PostGIS + MapLibre · migrar `lat`/`lng` a `geography` |
| **M24** | Proyectos y tipologías | Para inmobiliarias: avance de obra, stock, planos |
| **M25** | IA | Los 4 pasos que el home ya promete: fotos, precio, redacción, respuestas |
| **M26** | WhatsApp Business API | El canal real de contacto en Perú · publicar por WhatsApp |

---

# Cómo ejecutar esto con Claude Code

## Un `CLAUDE.md` en la raíz del repo

Se carga solo en cada sesión y evita repetir contexto:

```markdown
# Wasipe
Portal inmobiliario peruano. Netlify Functions + Neon Postgres + Hono + TypeScript.

## Convenciones
- Código y datos en español (rutas, tablas, columnas, mensajes)
- Los mensajes de error se le muestran al usuario tal cual, en español
- Dinero: NUMERIC, nunca float. Fechas: TIMESTAMPTZ
- Estados: TEXT + CHECK, no ENUM nativo
- Permisos: siempre por puede() en lib/permisos.ts, nunca dentro de un handler
- PATCH: lista blanca de campos explícita, jamás expandir el body
- SQL solo en consultas.ts de cada módulo

## Documentos
ARQUITECTURA.md · ESQUEMA.md · API.md · AUTENTICACION.md
FLUJO-AVISOS.md · MONETIZACION.md · PANEL-ADMIN.md
PLAN-IMPLEMENTACION.md  ← el orden de trabajo

## Restricciones de Netlify
- 10 s de timeout: lo pesado va a background functions
- 6 MB de payload: las imágenes NUNCA pasan por la función
- Sin estado en memoria: rate limits y cachés en Postgres
```

## Un hito por sesión

Arrancá cada sesión nombrando el hito y el documento:

> *"Implementá el hito M5 de PLAN-IMPLEMENTACION.md. Leé antes ARQUITECTURA.md §8 y API.md §4."*

Al terminar, commit con el número: `M5: subida de imágenes con Cloudinary`.

## Qué automatizar y qué no

Con un proyecto de una persona, escribir tests de todo se abandona en dos semanas. Cubrí solo lo que **falla en silencio o cuesta plata**:

| Con test automatizado | Verificación manual |
|---|---|
| `permisos.puede()` — función pura, matriz completa | Formularios y flujo del asistente |
| `estados.ts` — tabla de transiciones | Diseño y responsive |
| `limites.ts` — topes de plan | Correos (revisarlos a ojo) |
| Idempotencia del webhook de Culqi | Subida de fotos — **en celular real, con datos móviles** |
| Rangos de precio entre monedas | Moderación |

Lo de arriba rompe callado: un permiso mal puesto no tira error, simplemente deja entrar a quien no debía.

---

# Los cinco riesgos

1. **El backend sin fuentes (M1).** Mientras `api.js` sea un bundle minificado, cada cambio es una apuesta. Es el hito 1 por eso.
2. **`001_inicial.sql` nunca se ejecutó.** Lo revisé a mano y corregí tres errores que lo habrían roto, pero no había Postgres ni Docker en tu máquina para probarlo. **Correlo contra una rama de Neon antes de construir nada encima.**
3. **La subida de fotos (M5).** Es donde se abandona. Probala en un celular real con 4G, no en wifi.
4. **Marketplace vacío.** Sin avisos no hay compradores, y sin compradores no hay quien publique. Sembrá oferta a mano en 3–4 distritos antes de gastar en captar demanda. El Índice ayuda: da una razón para crear cuenta aunque todavía no haya inventario.
5. **Calidad del dato del Índice.** Es el diferenciador. Si los números se sienten inventados se pierde la confianza y con ella el argumento entero. Mostrá siempre `muestras` y nunca lo presentes como tasación.

---

# Resumen

| Fase | Hitos | Qué se consigue |
|---|---|---|
| **0** | M0 | El backend actual funciona |
| **1 · MVP** | M1–M13 | Publicar, moderar, buscar, contactar, renovar |
| **2** | M14–M22 | Cobrar, equipos, el badge diferenciador, operación |
| **3** | M23–M26 | Mapa, proyectos, IA, WhatsApp |

**Empezá por M0.** Son dos variables de entorno y quince minutos, y hasta que estén puestas todo lo demás es teoría: el sitio está publicado, se ve bien, y cada llamada a la API responde *"La base de datos no está conectada todavía."*
