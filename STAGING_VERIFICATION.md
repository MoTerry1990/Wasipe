# Verificación de staging

**Estado: SIN EJECUTAR — no existe el proyecto de Supabase.**

Este documento está escrito por adelantado, con las casillas vacías. Es a
propósito: cuando lleguen las credenciales, esto se llena **mientras** se
ejecuta, y no se reconstruye de memoria después.

**Ninguna casilla se marca sin haber corrido la comprobación.** Una tabla
llena de ✅ que nadie ejecutó es peor que una tabla vacía, porque la
segunda al menos no miente.

---

## Datos del entorno

| Dato | Valor |
|---|---|
| Proyecto Supabase | *(pendiente)* |
| Identificador | *(pendiente — solo la referencia, nunca claves)* |
| Región | *(pendiente — debería ser `sa-east-1`)* |
| Entorno | staging |
| Versión de PostgreSQL | *(pendiente)* |
| Fecha de creación | *(pendiente)* |
| URL de Vercel Preview | *(pendiente)* |
| Commit desplegado | *(pendiente)* |
| Fecha y hora de la verificación | *(pendiente)* |

---

## Migraciones

27 pendientes. Se registra una fila por migración: nombre, hora de inicio,
duración, resultado y el error si lo hubo.

| # | Migración | Inicio | Duración | Resultado |
|---|---|---|---|---|
| 1 | `20260815120100_plataforma.sql` | | | ⬜ |
| 2 | `20260815120200_perfiles_agencias.sql` | | | ⬜ |
| 3 | `20260815120300_propiedades.sql` | | | ⬜ |
| 4 | `20260815120400_interacciones.sql` | | | ⬜ |
| 5 | `20260815120500_mercado_pagos.sql` | | | ⬜ |
| 6 | `20260815120600_geo.sql` | | | ⬜ |
| 7 | `20260815120700_funciones.sql` | | | ⬜ |
| 8 | `20260815120800_rls.sql` | | | ⬜ |
| 9 | `20260816090200_almacenamiento.sql` | | | ⬜ |
| 10–27 | *(el resto, en orden por nombre)* | | | ⬜ |

**La número 6 es la que hay que mirar con atención.** En PGlite se omite
porque no hay PostGIS, así que va a correr de verdad por primera vez.

---

## Verificación del esquema

| Qué | Cómo se comprueba | Resultado |
|---|---|---|
| Tablas | `select count(*) from information_schema.tables where table_schema='public'` | ⬜ |
| RLS en todas | `select tablename, rowsecurity from pg_tables where schemaname='public'` | ⬜ |
| Índices | `select count(*) from pg_indexes where schemaname='public'` | ⬜ |
| Funciones | `select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'` | ⬜ |
| Disparadores | `select count(*) from pg_trigger where not tgisinternal` | ⬜ |
| Extensiones | `select extname, extversion from pg_extension` | ⬜ |
| PostGIS | `select postgis_version()` | ⬜ |
| Buckets | `select id, public, file_size_limit from storage.buckets` | ⬜ |
| Políticas de storage | `select policyname from pg_policies where schemaname='storage'` | ⬜ |
| Idempotencia de pagos | `select public.registrar_evento_de_pago(...)` dos veces | ⬜ |
| Libro de créditos | `select count(*) from public.credit_transactions` | ⬜ |
| Eventos de pago | `select count(*) from public.payment_events` | ⬜ |
| Historial de precios | `select count(*) from public.price_history` | ⬜ |

**`rowsecurity = true` en toda tabla con datos de personas.** Si alguna
sale en `false`, se para acá: esa tabla está abierta a cualquiera con la
clave anónima, que es pública.

---

## Las siete demostraciones de RLS

Cada una con la clave anónima o una sesión de prueba. **Nunca con la de
servicio**, que se salta RLS por diseño y haría pasar cualquier prueba.

| # | Qué hay que demostrar | Resultado |
|---|---|---|
| 1 | Un visitante solo lee propiedades aprobadas | ⬜ |
| 2 | Nadie edita una propiedad ajena | ⬜ |
| 3 | Los favoritos son de su dueño y de nadie más | ⬜ |
| 4 | La ubicación exacta respeta lo que eligió quien publicó | ⬜ |
| 5 | La clave de servicio no aparece en el paquete del navegador | ⬜ |
| 6 | Un evento de pago repetido no acredita dos veces | ⬜ |
| 7 | Un trabajo de IA fallido devuelve el crédito | ⬜ |

Las siete ya pasan contra PGlite. Repetirlas contra Supabase importa
porque **PGlite no es Supabase**: no trae el esquema `storage`, ni sus
roles, ni sus extensiones. Las políticas se evalúan con el mismo motor
pero sobre otra configuración.

Para la número 5:

```bash
curl -s "https://<preview>/_next/static/chunks/main-app.js" | grep -c service_role
```

Tiene que dar **0**.

---

## Storage

| Qué | Resultado |
|---|---|
| `originales` existe y es **privado** | ⬜ |
| `generados` existe y es **privado** | ⬜ |
| `videos` sigue privado | ⬜ |
| `avisos`, `avatares` y `logos` son públicos | ⬜ |
| Una subida válida entra | ⬜ |
| Un `.exe` renombrado a `.jpg` se rechaza | ⬜ |
| Un archivo de 30 MB se rechaza | ⬜ |
| Otro usuario no lee el original ajeno | ⬜ |
| El original **no** se puede sobreescribir | ⬜ |
| El original **no** se puede borrar desde el navegador | ⬜ |
| La versión de Wasi AI conserva su original | ⬜ |
| La huella se calcula al subir | ⬜ |
| Dos avisos con la misma foto se marcan | ⬜ |

Las políticas de `storage.objects` **nunca se probaron**: PGlite no trae
ese esquema. Es lo primero que hay que verificar.

---

## Autenticación

Con cuentas marcadas como de prueba: `prueba+comprador@wasipe.pe`,
`prueba+propietario@wasipe.pe`. **Nunca correos personales.**

| Qué | Resultado |
|---|---|
| URLs de redirección configuradas para local, Preview y futuro dominio | ⬜ |
| Registro | ⬜ |
| Llega el correo de confirmación | ⬜ |
| Su enlace funciona | ⬜ |
| Inicio de sesión | ⬜ |
| Cierre de sesión | ⬜ |
| Recuperar contraseña | ⬜ |
| La sesión sobrevive a una recarga | ⬜ |
| Una ruta protegida rebota sin sesión | ⬜ |
| Rol de comprador | ⬜ |
| Rol de propietario | ⬜ |
| Administración cerrada a los dos | ⬜ |

Las cuentas de prueba se borran al terminar, o se documentan acá con su
razón de existir.

---

## Vercel Preview

| Qué | Resultado |
|---|---|
| El build pasa | ⬜ |
| Región `gru1` | ⬜ |
| Variables cargadas **solo** en Preview | ⬜ |
| `PAGOS_EN_VIVO=no` | ⬜ |
| La portada carga | ⬜ |
| Recargar una ruta profunda funciona | ⬜ |
| `/sitemap.xml` apunta al Preview, no a producción | ⬜ |
| Una dirección inexistente responde 404 | ⬜ |
| **El dominio principal NO está asignado** | ⬜ |
| **Netlify sigue en pie** | ⬜ |

---

## Los siete flujos pendientes

Los que `FINAL_AUDIT.md` dejó sin probar en el sprint 17. Se ejecutan en
la URL real del Preview, no en local.

| Flujo | Por qué no se probó antes | Qué hace falta | Resultado esperado | Resultado real | Evidencia | Estado |
|---|---|---|---|---|---|---|
| Contacto con anunciante | Necesita un aviso y una sesión | Cuenta de prueba + aviso publicado | La consulta llega y queda registrada | | | ⬜ |
| Guardar borrador | Necesita sesión | Cuenta de propietario | El borrador se guarda y se recupera | | | ⬜ |
| Enviar a revisión | Necesita un borrador completo | Borrador con 3 fotos | Pasa a `in_review` | | | ⬜ |
| Descripción con IA | Nunca se llamó a un proveedor | `ANTHROPIC_API_KEY` | Devuelve texto, no se publica solo | | | ⬜ |
| Imagen con IA | Nunca se llamó a un proveedor | Proveedor de imagen | Conserva el original y etiqueta la editada | | | ⬜ |
| Video con IA | Nunca se llamó a un proveedor | Proveedor de video | Genera, o falla y devuelve el crédito | | | ⬜ |
| Cobro de prueba | No existe pasarela | Claves de prueba de Culqi | **No se ejecuta este sprint** | | | ⬜ |

**Un flujo no se marca como aprobado porque una prueba simulada pase.**
Los tres de IA además necesitan que alguien mire el resultado: que
devuelva texto no quiere decir que el texto sirva.

El de cobro queda fuera a propósito: `PAGOS_EN_VIVO=no` y la regla del
sprint dice que no se activa nada bajo ninguna circunstancia.

---

## Ejecución — sprint 22 · 6 de setiembre de 2026

### Vercel Preview

| Qué | Resultado |
|---|---|
| Proyecto creado | ✅ `wasipe`, nuevo, ámbito `moterry1991` |
| Despliegue | ✅ Preview, nunca producción |
| URL | `https://wasipe-3322qml7j-moterry1991.vercel.app` |
| URL estable de rama | `https://wasipe-git-main-moterry1991.vercel.app` |
| Portada carga | ✅ 187 KB, `lang="es-PE"` |
| Español | ✅ sin Buy, Rent, Search, Sign In, Dashboard, Settings |
| Skyline intacto | ✅ **47 de 47 trazos y 31 de 31 colores**, comparados contra el componente |
| `NEXT_PUBLIC_URL_SITIO` | ✅ sitemap y canónica apuntan al Preview, no a producción |
| Indexable | ❌ responde `index, follow` — **P-19 en `KNOWN_ISSUES.md`** |

El primer despliegue falló: `.vercelignore` traía `supabase/` sin barra
inicial, y ese patrón se llevaba también `lib/supabase/`. Estaba así desde
el sprint 3 y no se notó porque el proyecto nunca se había desplegado.
Corregido anclando los cinco patrones de carpeta.

### Los siete flujos

| Flujo | Estado | Motivo |
|---|---|---|
| Contacto con anunciante | ⬜ no ejecutado | Ver abajo |
| Guardar borrador | ⬜ no ejecutado | Ver abajo |
| Enviar a revisión | ⬜ no ejecutado | Ver abajo |
| Descripción con IA | ➖ no aplica | `IA_PROVEEDOR=ninguno` en Preview; diferido al sprint 25 |
| Imagen con IA | ➖ no aplica | Sin proveedor de imagen |
| Video con IA | ➖ no aplica | Sin proveedor de video |
| Cobro de prueba | ➖ excluido | `PAGOS_EN_VIVO=no`, regla del sprint |

Los tres primeros no corrieron por dos razones concretas:

1. **La aplicación tiene una sola ruta de API** (`app/auth/callback`). Todo
   lo demás va por Server Actions, así que estos flujos solo existen dentro
   de la interfaz y hay que conducir un navegador para probarlos.
2. **El Preview está detrás de la protección de despliegue de Vercel**
   —responde 302 a `vercel.com/sso-api`— y **la base no tiene datos**: 28
   tablas, 0 filas. Sin cuenta ni aviso publicado no hay flujo que probar.

Para ejecutarlos hace falta un token de excepción de la protección y
sembrar datos de prueba en staging.

### Storage y RLS

Verificados en el sprint 21 contra Supabase real, no acá. Ver el reporte
de ese sprint: 28 tablas con RLS, aislamiento entre usuarios demostrado
con dos identidades, originales inaccesibles con objeto presente, y siete
funciones que estaban al alcance de un visitante sin sesión, cerradas con
la migración `20260906200000_permisos_de_funciones.sql`.
