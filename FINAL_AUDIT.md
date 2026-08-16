# Auditoría final

**16 de agosto de 2026** · Sprints 17 y 18 · Wasipe

> **Actualización del sprint 18.** El veredicto no cambió y sigue siendo
> el mismo: listo para desplegarse, no listo para lanzarse. Lo que cambió
> es que ahora se sabe exactamente qué falta, y todo lo que se podía
> adelantar sin infraestructura está hecho.
>
> Puntaje: **5,8 → 6,4**. Subieron almacenamiento y observabilidad;
> infraestructura, copias y flujos críticos siguen igual, porque no
> existe el proyecto de Supabase.
>
> Ver la sección «Sprint 18» al final.

Esta auditoría se escribió para ser útil, no para tranquilizar. Donde algo
no se probó, dice «no se probó», y eso no es lo mismo que «funciona».

---

## Veredicto en una línea

**Wasipe está listo para desplegarse, y no está listo para lanzarse.**

El código está terminado, probado y es seguro dentro de lo que se puede
comprobar sin infraestructura. Pero **no existe el proyecto de Supabase**,
así que nada de esto ha corrido nunca contra una base real: ni un registro,
ni un aviso publicado, ni una foto subida. Lanzar hoy sería estrenar en
producción media docena de caminos que jamás se ejecutaron.

Lo que falta no es código. Son tres cosas de infraestructura, y están en
`PRODUCTION_CHECKLIST.md`.

---

## Puntajes

Escala: **10** = probado contra producción · **7** = probado sin
producción · **4** = escrito, sin probar · **1** = no existe.

| Área | Puntaje | Por qué |
|---|---|---|
| **Calidad del código** | **9** | Compila, tipa, lint limpio, 817 pruebas de unidad y base, 567 de navegador. Nada en rojo |
| **Seguridad — aplicación** | **8** | RLS probado contra Postgres real (PGlite) con las migraciones de verdad. Autorización en tres capas independientes. XSS cerrado en los dos sitios. Sin secretos expuestos. Falta comprobarlo contra Supabase |
| **Seguridad — infraestructura** | **3** | Cabeceras y CSP escritas y sin verificar en línea. Sin gestión de secretos más allá del panel de Vercel. Sin WAF ni protección contra abuso a nivel de red |
| **Base de datos** | **7** | 26 migraciones que corren limpias sobre una base vacía. RLS en toda tabla con datos de personas. **Nunca aplicadas a Supabase** |
| **Flujos críticos** | **4** | De los 19 que pide el sprint, 8 se probaron enteros. Los 11 que necesitan sesión o datos, no. Detalle abajo |
| **Accesibilidad** | **9** | 0 violaciones críticas ni serias en once pantallas, móvil y escritorio, medido con axe-core. Falta un lector de pantalla real |
| **Rendimiento** | **6** | Medido y documentado en los dos tamaños. Pero son estados vacíos: sin datos, los números no predicen nada |
| **SEO** | **8** | Sitemap, canónicas, datos estructurados, 404 de verdad. Sin verificar contra Google |
| **Observabilidad** | **2** | Sentry sin conectar. Sin alertas, sin comprobación de estado. **Es el punto más flojo** |
| **Copias y recuperación** | **3** | El plan de vuelta atrás está escrito y es honesto. Nunca se restauró una copia |
| **Pagos** | **1** | No existe pasarela. El interruptor de cobro real está apagado y declarado |
| **Documentación** | **9** | 26 documentos. Los cinco de este sprint más los de arquitectura, esquema, IA, administración, SEO y rendimiento |

### Promedio ponderado: **5,8 sobre 10**

Y el promedio engaña. Lo que decide si esto se puede lanzar son los tres
números bajos: infraestructura, observabilidad y recuperación. Un sitio
con código impecable que no sabe cuándo se cayó y no puede volver atrás
no está listo, por muy alto que puntúe lo demás.

---

## Los 19 flujos críticos, uno por uno

| Flujo | Estado | Qué se probó de verdad |
|---|---|---|
| Registro | ⚠️ Parcial | El formulario, la validación, el aviso de privacidad. **Crear una cuenta: no** |
| Inicio de sesión | ⚠️ Parcial | La pantalla, el campo oculto, el `noindex`. **Entrar: no** |
| Recuperar contraseña | ⚠️ Parcial | La pantalla. **El correo y su enlace: no** |
| Búsqueda | ✅ | Estados vacíos, filtros que sobreviven a una recarga, parámetros inventados, 404 en rutas inválidas |
| Filtros | ✅ | Los 19 filtros leídos y validados; un valor inválido se cae solo sin romper los demás |
| Mapa | ⚠️ Parcial | La vista abre sin caerse. **Con marcadores: no, no hay avisos** |
| Ficha | ⚠️ Parcial | 404 para códigos inexistentes y direcciones mal formadas. **Una ficha real: no** |
| Favorito | ⚠️ Parcial | Rebota sin sesión. **Guardar uno: no** |
| Comparar | ✅ | Abre, aguanta códigos inventados, no se indexa |
| Contacto | ❌ | **Sin probar.** Necesita un aviso y una sesión |
| Guardar borrador | ❌ | **Sin probar** |
| Enviar a revisión | ❌ | **Sin probar** |
| Moderación | ⚠️ Parcial | Todas las funciones probadas contra Postgres: decisiones, motivos, bitácora inmutable. **La pantalla con datos: no** |
| Descripción con IA | ❌ | **Sin probar.** Nunca se llamó a un proveedor de IA |
| Imagen con IA | ❌ | **Sin probar.** Nunca se llamó a un proveedor de imagen |
| Video con IA | ❌ | **Sin probar.** Nunca se llamó a un proveedor de video |
| Créditos | ⚠️ Parcial | Reserva, consumo y devolución probados contra Postgres. **Comprar: no existe** |
| Cobro de prueba | ❌ | **No existe pasarela** |
| Acceso de administración | ✅ | 15 rutas privadas rebotan sin sesión; los cuatro puestos probados contra Postgres |

**4 completos · 8 parciales · 7 sin probar.**

Los 7 sin probar tienen la misma causa: hacen falta cuentas, avisos o un
proveedor externo, y no hay ninguno de los tres.

---

## Lo que se encontró y se arregló en este sprint

### 1 · P-01 — XSS almacenado en el sitio anterior · **CRÍTICO**

Abierto desde el sprint 1. **Estaba en producción, en un sitio que sigue
en línea.**

Los datos de la API se metían en `innerHTML` sin escapar, y la validación
del título solo comprobaba el largo. Un aviso llamado
`<img src=x onerror=...>` ejecutaba código en el navegador de cualquiera
que abriera el home o la búsqueda. La CSP no lo detenía: lleva
`script-src 'unsafe-inline'` porque las páginas usan scripts en línea.

**Arreglado:** `esc()` y `escUrl()` en `legacy/public/cuenta.js`, aplicados
en **129 interpolaciones** de las siete páginas. `escUrl` va aparte porque
escapar HTML no sirve en un `src`: `javascript:alert(1)` no tiene ningún
carácter especial y corre igual.

Una prueba estática lo vigila: si alguien vuelve a escribir `${p.titulo}`
sin escapar, falla el build.

### 2 · Datos estructurados rompibles · **ALTO**

`JSON.stringify` **no** escapa `<`. Dentro de un `<script>`, el navegador
corta en el primer `</script>` sin importar que esté dentro de una cadena
JSON. Un aviso titulado `Lindo depa </script><img src=x onerror=alert(1)>`
cerraba el bloque y lo de después se dibujaba como HTML. Los títulos los
escribe cualquiera que publique.

**Arreglado:** `lib/seo/json-seguro.ts` escapa `<`, `>` y `&` como
secuencias unicode. El dato es el mismo al leerlo; la etiqueta ya no
existe para el navegador.

*(Al escribir el arreglo, la primera versión tenía una sola barra invertida
—`'<'` es el carácter `<`, no la secuencia— así que el reemplazo no
hacía nada. La prueba lo detectó. Queda anotado en el código porque es
exactamente el tipo de arreglo que parece hecho y no lo está.)*

### 3 · 404 blando en toda la aplicación · **ALTO**

Un `app/loading.tsx` en la raíz hacía que Next empezara a transmitir la
respuesta —con el 200 ya enviado— antes de correr la página. Para cuando
la ficha llamaba a `notFound()`, el estado ya había salido.

**Resultado: toda dirección de propiedad inexistente respondía 200.** El
mismo documento de SEO del sprint 16 dice que es «de los errores más caros
que puede tener un portal», y estaba pasando.

**Arreglado:** se quitó `app/loading.tsx`. Cada página que necesita
esqueleto ya lo tiene dentro de su propio `Suspense`.

### 4 · Segmentos inválidos redirigían en vez de 404 · **MEDIO**

`/comprar/narnia` devolvía 307 a `/comprar`, con 200. Otro 404 blando:
para un buscador, el sitio tenía infinitas direcciones válidas con el
mismo contenido.

**Arreglado:** ahora se deja pasar y la página responde 404. La disyuntiva
entre «ayudar a quien se equivocó» y «no engañar al buscador» era falsa:
desde el sprint 16 el 404 lleva las búsquedas más usadas y el índice
completo, así que quien llega con una errata tiene **más** salidas que
antes.

### 5 · El 404 no tenía `h1` · **BAJO**

Usaba `EstadoVacio`, que rinde `h3`. Una pantalla sin encabezado principal
deja a quien navega por encabezados sin saber dónde cayó.

### 6 · Un webhook de pago repetido acreditaría dos veces · **ALTO, preventivo**

`credit_transactions` no tenía llave de idempotencia. Toda pasarela
reintenta —no es un caso raro, es su funcionamiento normal— así que el
primer reintento de Culqi habría duplicado el saldo.

**Arreglado antes de que exista la pasarela**, que es cuando sale barato:
`provider_event_id` con índice único parcial, tabla `payment_events` con
restricción única por pasarela, y `registrar_evento_de_pago()` que
resuelve la carrera con `on conflict do nothing` en vez de «miro y luego
inserto».

### 7 · `/comparar` se indexaba · **BAJO**

`robots.txt` la bloqueaba pero la página declaraba `index, follow`. Si
alguien la enlazaba desde fuera, entraba igual.

---

## Lo que se revisó y estaba bien

- **RLS**: toda tabla con datos de personas la tiene activa. Un visitante
  anónimo no lee ni una fila de 14 tablas privadas. Probado tabla por tabla.
- **La dirección exacta** solo se ve si quien publicó eligió publicarla.
  Comprobado en los dos sentidos.
- **Autorización en tres capas** que funcionan solas: middleware, guardia
  de servidor (`server-only`), y RLS más funciones `SECURITY DEFINER`.
- **Límites de uso**: el teléfono corta a los 30 por hora por sesión. Sin
  eso, un raspador se lleva la agenda del portal en una tarde.
- **Inyección**: todo va por parámetros. Un distrito con `'; drop table` no
  hace nada.
- **Subidas**: tipos MIME y límite de tamaño declarados en las cubetas, no
  solo en el formulario.
- **Secretos**: 0 credenciales en el código. La clave de servicio vive en
  un solo archivo. Ninguna clave con prefijo de navegador salvo la anónima
  de Supabase, que es pública por diseño.
- **Registros**: ninguno escribe correos, teléfonos ni claves. Un registro
  con datos personales termina en el panel de Vercel, que ve todo el
  equipo, y de ahí no lo borra nadie.
- **Dependencias**: `npm audit --omit=dev` → 0 vulnerabilidades.

---

## Lo que sigue abierto

### Bloquea el lanzamiento

1. **No existe el proyecto de Supabase.** Es la raíz de casi todo lo que
   está sin probar.
2. **Sin Sentry.** Cuando algo falle en producción nos vamos a enterar
   porque alguien escriba. Puede pasar un día entero.
3. **Nunca se restauró una copia de seguridad.** Una copia que no se
   restauró no es una copia.

### No bloquea, pero hay que decirlo

4. **Cloudinary o Supabase Storage**, sin decidir desde el sprint 10. El
   código asume Supabase Storage. Es una decisión del usuario.
5. **`image_hash` está vacía.** La bandera de foto repetida funciona pero
   no encuentra nada hasta que la subida calcule la huella.
6. **Cuatro pantallas de administración sin construir** (`ia`, `pagos`,
   `creditos`, `destacados`). Aparecen apagadas con su motivo.
7. **Ningún proveedor de IA se llamó nunca.** Texto, imagen y video están
   escritos contra un contrato y probados con dobles. La primera llamada
   real va a encontrar algo.
8. **`unsafe-inline` en la CSP del sitio anterior.** No se puede quitar sin
   sacar los scripts en línea a archivos. Con el escapado puesto ya no es
   explotable por esta vía, pero es una red menos.
9. **Los 803 KB de JavaScript de la búsqueda**, sin desarmar.

---

## Los criterios de aceptación, uno por uno

| Criterio | Cumplido | Con qué salvedad |
|---|---|---|
| Todas las pruebas críticas pasan | ✅ | 817 de unidad y base, 567 de navegador. Ninguna en rojo. Pero «críticas» acá quiere decir «las que se pueden correr sin base» |
| Ningún problema crítico de seguridad abierto | ✅ | Los dos críticos (P-01 y el JSON-LD) están cerrados y vigilados por pruebas |
| Ningún secreto expuesto | ✅ | Comprobado con pruebas automáticas sobre todo el código |
| Despliegue verificado en producción | ❌ | **No.** No hay despliegue. La guía está escrita paso a paso |
| Procedimiento de vuelta atrás documentado | ✅ | `ROLLBACK_PLAN.md`, cinco escenarios distintos |
| El sitio anterior sigue recuperable | ✅ | Netlify y Neon intactos. Y ahora, además, sin el XSS |
| El cobro real sigue desactivado | ✅ | `PAGOS_EN_VIVO=no`, y no hay pantalla que lo encienda |
| La auditoría trae puntajes honestos | ✅ | Este documento |

**Seis de ocho.** El que falta —despliegue verificado— no depende del
código.

---

## Qué haría yo la semana que viene

En este orden, y no en otro:

1. **Crear el proyecto de Supabase** y aplicar las 26 migraciones. Es lo
   que desbloquea todo lo demás.
2. **Probar los 7 flujos sin probar** a mano, en la URL de Vercel, antes
   de tocar el DNS. Van a aparecer cosas; siempre aparecen.
3. **Conectar Sentry.** Antes del primer usuario, no después del primer
   problema.
4. **Restaurar una copia** a un proyecto de prueba. Una vez. Para saber.
5. Recién entonces, el DNS, con el TTL bajado y el sitio de Netlify en pie.

Los pagos y Wasi AI pueden esperar. Publicar en Wasipe es gratis, y el
portal funciona entero sin ninguna de las dos cosas.

---

# Sprint 18 — Infraestructura

**Estado: SPRINT BLOQUEADO POR INFRAESTRUCTURA.**

No existe el proyecto de Supabase. Detalle completo en
`INFRASTRUCTURE_REPORT.md`; lo que sigue es cómo cambian los puntajes.

## Puntajes actualizados

| Área | Antes | Ahora | Por qué |
|---|---|---|---|
| Calidad del código | 9 | **9** | 876 pruebas de unidad y base, 567 de navegador. Nada en rojo |
| Seguridad — aplicación | 8 | **8** | Igual. Lo nuevo (validación de subidas) suma; nada se comprobó contra Supabase |
| Seguridad — infraestructura | 3 | **3** | Sin cambios: no hay infraestructura |
| Base de datos | 7 | **7** | 27 migraciones limpias en PGlite. Cero en Supabase |
| **Almacenamiento** | — | **7** | Área nueva. Cinco depósitos separados, originales privados, validación real, huellas. Las políticas de storage sin probar |
| Flujos críticos | 4 | **4** | Los siete siguen sin probar |
| Accesibilidad | 9 | **9** | Sin cambios |
| Rendimiento | 6 | **6** | Sin cambios |
| SEO | 8 | **8** | Sin cambios |
| **Observabilidad** | 2 | **5** | Sentry integrado y con 14 pruebas de que no filtra datos. Falta el DSN y una comprobación externa |
| Copias y recuperación | 3 | **3** | Sigue sin restaurarse ninguna |
| Pagos | 1 | **1** | Sin pasarela, apagado y declarado |
| Documentación | 9 | **10** | 31 documentos. Los cinco del sprint 18 están escritos para llenarse mientras se ejecuta, no después |

### Promedio: **6,4 sobre 10**

Sigue mandando lo bajo. Infraestructura en 3, copias en 3 y flujos en 4
son los que deciden, y los tres tienen la misma causa.

## Lo que se arregló

### Los originales estaban en un bucket público · **ALTO**

Desde el sprint 6. Cualquiera con la dirección se bajaba el archivo tal
como salió del celular: sin comprimir, con sus metadatos EXIF, y **con las
coordenadas GPS del lugar donde se tomó la foto**.

Una persona que publica su departamento eligió mostrar el distrito. La
foto de su sala, sin tocar, dice la cuadra.

Arreglado: bucket `originales` privado, sin política de UPDATE ni de
DELETE. El archivo que subió la persona sigue estando, byte por byte.

### Las imágenes de Wasi AI también · **MEDIO**

Iban al mismo bucket público. Una imagen recién generada no la aprobó
nadie, y el sprint 10 dejó escrito que ninguna sugerencia se publica sin
confirmación. Ahora van a `generados`, privado.

### El tipo de archivo se creía · **MEDIO**

La validación miraba `file.type`, que es lo que el navegador *dice*,
deducido casi siempre de la extensión. Un `.exe` renombrado a `.jpg` llega
declarando `image/jpeg` y entraba.

Ahora se leen los primeros bytes. Probado con un ejecutable de Windows, un
PHP y un SVG: los tres se rechazan.

### `image_hash` llevaba tres sprints vacía · **BAJO**

Se agregó en el sprint 15 y nada la llenaba, así que la bandera de foto
repetida existía pero no encontraba nada. Ahora hay cálculo, función de
anotado idempotente, lote de relleno y una vista de avance.

## Los criterios del sprint 18

| Criterio | |
|---|---|
| Las 27 migraciones aplicadas | ❌ **No hay dónde** |
| RLS verificado contra Supabase real | ❌ |
| Vercel Preview funcional | ❌ No desplegado — decisión, ver informe |
| Los siete flujos probados de verdad | ❌ |
| Sentry recibió un error sin secretos | ❌ Falta el DSN |
| Una copia restaurada y comparada | ❌ |
| Supabase Storage con permisos correctos | ⚠️ Escrito y revisado, sin probar |
| Los originales protegidos | ⚠️ Igual |
| `image_hash` funciona para nuevas imágenes | ✅ Probado |
| Los cobros reales apagados | ✅ |
| Netlify sigue funcionando | ✅ Sin tocar |
| No se cambió el DNS | ✅ Sin tocar |
| Lint, typecheck, pruebas y build verdes | ✅ |
| Sin vulnerabilidades críticas | ✅ `npm audit` → 0 |

**5 de 14.** Los nueve que faltan tienen la misma causa.

## Veredicto

**NO LISTO PARA LANZAMIENTO.**

Y tampoco «listo para lanzamiento controlado», porque un lanzamiento
controlado también necesita una base de datos.

Lo que falta sigue sin ser código. Son las cuatro cosas de la última
sección de `INFRASTRUCTURE_REPORT.md`, y ninguna la puedo hacer yo.
