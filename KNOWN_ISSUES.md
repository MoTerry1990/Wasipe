# Problemas conocidos

**Sprint 1** · 15 de agosto de 2026 · Ordenados por gravedad.

Ninguno se corrigió en este sprint: la instrucción fue auditar, no cambiar.

---

## 🔴 Críticos

### P-13 · Originales de imágenes en bucket público — **RESUELTO (sprint 18)**

> Los archivos originales vivían en `avisos`, que es público: cualquiera
> con la dirección se bajaba la foto sin comprimir y **con sus
> coordenadas GPS en los metadatos EXIF**. Estaba así desde el sprint 6.
>
> Cerrado con el bucket privado `originales`, sin política de UPDATE ni
> de DELETE. Migración `20260829090000_almacenamiento_separado.sql`.
>
> **Las políticas de storage no están probadas**: PGlite no trae ese
> esquema. Verificar contra Supabase es lo primero del próximo sprint.

### P-14 · El tipo de archivo se leía de lo que declaraba el navegador — **RESUELTO (sprint 18)**

> `file.type` es lo que el navegador *dice*, deducido de la extensión. Un
> `.exe` renombrado a `.jpg` llegaba declarando `image/jpeg`.
>
> Ahora se leen los primeros bytes: `lib/almacenamiento/validacion.ts`.
> 31 pruebas, incluidos un ejecutable de Windows, un PHP y un SVG.

### P-15 · `unsafe-inline` en la CSP del sitio anterior — **ABIERTO**

> El sitio de Netlify lleva `script-src 'self' 'unsafe-inline'` porque sus
> páginas usan scripts en línea. Con el escapado del sprint 17 ya no es
> explotable por la vía de P-01, pero es una red menos.
>
> **La aplicación nueva no tiene `unsafe-inline` y no lo va a tener.**
> Esta deuda es solo del sitio anterior y se cierra cuando se apague, no
> antes: sacar los scripts a archivos en un sitio que va a morir es
> trabajo que no vuelve.

### P-25 · El panel cuenta los avisos de todo el mundo como propios — **ABIERTO · sprint 23**

> Encontrado al verificar P-24. El resumen del panel decía a Rosa
> «8 avisos publicados» cuando tiene tres: dos publicados y uno en
> revisión. Ocho era el total de la base.
>
> La consulta era:
>
>     supabase.from('properties').select('id', { count: 'exact', head: true })
>
> Sin `owner_id` y sin `publication_status`. Contaba **todo lo que RLS le
> deja ver** a quien pregunta —los avisos publicados de todos más los
> suyos— y lo rotulaba como si fueran de la persona.
>
> Lo que lo hace interesante: **RLS lo volvió invisible.** La consulta
> nunca falla y nunca devuelve datos ajenos que no se puedan mostrar; solo
> cuenta de más. Es exactamente lo que advierte `CLAUDE.md`: RLS acota lo
> que se puede leer, no dice de quién es. Esa parte la pone la consulta,
> siempre.
>
> **El propio archivo lo dice al revés.** El docstring de
> `app/(dashboard)/panel/page.tsx` afirma:
>
> > «Las cifras salen de la base con la sesión de la persona, así que la
> > RLS ya filtró: aunque esta consulta no llevara ningún `where`, no
> > podría contar avisos ajenos.»
>
> Eso es falso, y es la creencia que causó el defecto. RLS impide **leer**
> avisos que no correspondan; no impide contar los que sí corresponde leer
> —todos los publicados— y presentarlos como propios. Al arreglarlo hay
> que corregir también ese comentario, o el próximo lo vuelve a creer.
>
> **Se probó el arreglo durante el sprint 22 y se revirtió por alcance:**
> agregar `.eq('owner_id', perfil.id)` y
> `.eq('publication_status', 'published')` deja el contador en «2 avisos
> publicados», que es lo correcto. Queda para el sprint 23.

### P-22 · Sentry no filtra los datos que van dentro del texto del error — **RESUELTO (sprint 22)**

> **Cerrado.** `limpiarTexto()` en `lib/observabilidad/sentry.ts` tapa
> correos, celulares peruanos, coordenadas, secretos escritos como
> `clave=valor`, DNI y RUC, y se aplica a `evento.message`, a cada
> `exception.value` y al texto de las migas de pan. Ocho pruebas nuevas.
>
> Verificado sobre un evento que viajó de verdad desde el Preview: los
> cinco datos salen como `[correo]`, `[teléfono]`, `[coordenada]` y
> `[oculto]`, y el código del aviso, el área y el precio siguen ahí. Un
> mensaje mutilado no sirve para depurar.
>
> Lo de abajo queda como estaba, porque explica qué pasó.

> **Encontrado en el sprint 22**, sobre un evento que viajó de verdad.
>
> Se disparó un error con un correo, un teléfono peruano, unas coordenadas
> de Lima y una contraseña metidos **dentro del mensaje**, y con una cookie
> puesta. En el sobre que salió hacia Sentry:
>
>     cabecera cookie      ausente ✅
>     cookie de prueba     ausente ✅
>     correo               PRESENTE ❌
>     teléfono             PRESENTE ❌
>     coordenadas          PRESENTE ❌
>     contraseña           PRESENTE ❌
>
> `limpiarEvento()` limpia `user`, `request`, `extra`, `contexts` y
> `breadcrumbs`. **Lee** `exception.values[0].value` solo para descartar
> ruido de extensiones del navegador, y nunca lo sanea; a `evento.message`
> ni lo toca.
>
> No es hipotético: los errores de validación y los de Supabase repiten el
> valor que falló, y en este producto ese valor es un correo o un teléfono.
>
> Las 14 pruebas no lo detectaron porque comprueban las rutas
> estructuradas, que sí funcionan.

### P-26 · La prueba de la vista de mapa es inestable — **ABIERTO**

> `tests/e2e/criticos.spec.ts` → «la vista de mapa abre sin caerse» falla
> por tiempo de espera cuando corre junto a otras y pasa cuando corre
> sola. Comprobado en el sprint 23B que **falla igual antes y después** de
> los cambios de ese sprint: es previo.
>
> La causa es el `networkidle` del ayudante `esperar()`. Esperar a que no
> quede ninguna petición es frágil en una página que agrupa marcadores y
> vuelve a pedir datos al mover el mapa.
>
> Una prueba que falla a veces es peor que ninguna: enseña a ignorar el
> rojo.

### P-27 · Sentry pide `onRouterTransitionStart` — **ABIERTO**

> El build avisa:
>
>     ACTION REQUIRED: To instrument navigations, the Sentry SDK requires
>     you to export an `onRouterTransitionStart` hook from your
>     instrumentation-client file.
>
> Sin eso, los errores que ocurren **durante una navegación** no quedan
> asociados a la ruta que se estaba abriendo. No rompe nada y no impide el
> build; es una línea en `instrumentation-client.ts`.

### P-28 · Avatares y logos nombran su bucket a mano — **ABIERTO**

> `features/cuentas/acciones.ts` escribe `.from('avatares')` y
> `.from('logos')` en vez de pasar por `BUCKET_DE`.
>
> Hoy no tiene consecuencia: los dos depósitos son públicos a propósito y
> ahí van fotos de perfil y logotipos, que se muestran en cualquier parte.
> Se anota porque **es el mismo patrón que causó P-13**: el mapa decía una
> cosa y la llamada real decía otra, y nadie las comparó durante cuatro
> sprints. La prueba nueva del sprint 23B solo cubre las fuentes que
> manejan fotos de avisos.

### P-23 · Mensaje de Zod sin traducir en el asistente de publicación — **ABIERTO · sprint 23**

> **Se probó el arreglo durante el sprint 22 y se revirtió por alcance.**
> Queda anotado cómo, para que el sprint 23 no lo investigue de nuevo.
>
> La causa exacta: el campo se declara
> `tipo: z.string().refine(…, 'Elige qué tipo de propiedad es')`, y ese
> mensaje **solo aplica si el valor ya es una cadena**. Mientras no se
> elige nada el valor es `undefined`, falla el `z.string()` de antes, y
> ahí habla Zod en inglés. El mismo patrón se repite en varios campos
> más: cualquier `z.string()` sin mensaje propio que pueda llegar vacío.
>
> Arreglarlos uno por uno deja el próximo sin cubrir. Lo que funciona es
> un mapa global de errores en español con `z.config({ customError })`
> —Zod 4— importado antes de construir los esquemas, más el mensaje
> propio del campo `tipo`. Probado y verde.

> El paso 1 de `/publicar` muestra en pantalla:
>
>     Invalid input: expected string, received undefined
>
> Es el mensaje por defecto de Zod llegando crudo al usuario. Viola la
> regla de idioma, y además no le dice nada a quien lo lee.

### P-24 · El rol de Rosa Quispe quedó en `buyer` en la siembra — **RESUELTO (sprint 22)**

> **Cerrado.** El `update` de Rosa ahora incluye `role`. Verificado en el
> Preview: su panel ya muestra «Mis propiedades».
>
> Lo de abajo queda como estaba, porque explica qué pasó.

> La siembra la trata como propietaria —le asigna avisos, incluido el
> borrador con tres fotos— pero su perfil queda con rol `buyer`.
>
> La causa: el disparador `al_crear_usuario` crea el perfil con el rol por
> defecto, el `insert into profiles` posterior lleva
> `on conflict do nothing` y no hace nada, y el `update` que la ajusta
> pone teléfono, biografía e intención **pero no el rol**. Los `update` de
> Martín y Lucía sí lo ponen.
>
> Consecuencia: su panel no muestra «Mis propiedades», así que desde la
> interfaz no puede enviar su propio borrador a revisión.

### P-21 · Sentry nunca se inicializa en el navegador — **RESUELTO (sprint 22)**

> Cerrado con `withSentryConfig` en `next.config.ts` y el archivo
> `instrumentation-client.ts`. Verificado sobre el Preview: el sobre sale
> por el túnel `/reporte-errores` y Sentry responde 200, con
> `environment: staging`.
>
> Lo de abajo queda como estaba, porque explica por qué pasó.

> **Encontrado en el sprint 22**, con el DSN ya configurado en Preview.
>
> Se descargaron los once paquetes de JavaScript del Preview —621 KB— y
> «sentry» aparece **cero veces**. No es la variable: son dos omisiones de
> configuración.
>
> 1. **`next.config.ts` no envuelve nada con `withSentryConfig`.** Sin eso
>    el plugin no corre: ni source maps, ni inyección del cliente.
> 2. **Falta `instrumentation-client.ts`.** Desde Next 15 la
>    inicialización del navegador se carga de ahí. El proyecto tiene
>    `sentry.client.config.ts`, que era lo de Next 14 y que **Next 16 ya
>    no lee**. Estamos en Next `^16.3.1`.
>
> El servidor sí está enganchado: `instrumentation.ts` importa
> `sentry.server.config` y Next lo llama. Así que **un error del servidor
> probablemente se reporta y uno del navegador no puede reportarse nunca**.
>
> Las 14 pruebas de filtrado no podían detectarlo: prueban el módulo
> aislado con eventos construidos a mano. Ninguna comprueba que el módulo
> llegue a cargarse.
>
> Lanzar así significa no enterarse de ningún error que le ocurra a un
> usuario en su navegador. **Bloqueante.**

### P-19 · El Preview se declara indexable — **RESUELTO (sprint 22)**

> **Cerrado.** `ES_PRODUCCION` en `config/sitio.ts`, usado por
> `app/robots.ts` y por los metadatos del layout. Verificado en el
> Preview: `robots.txt` responde `Disallow: /` y la portada
> `noindex, nofollow`. Dos pruebas nuevas.
>
> Lo de abajo queda como estaba, porque explica qué pasó.

> **Encontrado en el sprint 22**, en el primer despliegue de Preview.
>
> El Preview responde `<meta name="robots" content="index, follow">` y un
> `robots.txt` con `Allow: /`. O sea que se ofrece a Google como si fuera
> el sitio de verdad.
>
> La causa: **`NEXT_PUBLIC_ENTORNO` solo se usa en
> `lib/observabilidad/sentry.ts`.** Ni `app/robots.ts` ni
> `lib/seo/indexable.ts` lo consultan; la decisión de indexar depende solo
> de combinaciones de filtros, nunca del entorno.
>
> **Lo que hace falta:** `robots` debe responder `noindex` y `Disallow`
> cuando `NEXT_PUBLIC_ENTORNO !== 'produccion'`.
>
> Hoy no es explotable porque la protección de despliegue de Vercel bloquea
> el acceso anónimo al Preview. Pero eso es una segunda línea de defensa
> que se apaga con un clic, y entonces queda contenido duplicado
> compitiendo contra el sitio real. **Bloqueante antes de lanzar.**

### P-01 · XSS almacenado en tres páginas públicas — **RESUELTO (sprint 17)**

> **Cerrado el 16 de agosto de 2026.** `esc()` y `escUrl()` en
> `legacy/public/cuenta.js`, aplicados en 129 interpolaciones de las siete
> páginas. Una prueba estática en `tests/unidad/seguridad.test.ts` falla el
> build si alguien vuelve a interpolar un campo de la API sin escapar.
>
> Lo de abajo queda como estaba, porque describe el problema y sirve para
> entender por qué se arregló así.

**Dónde:** `public/index.html:604` · `public/buscar.html:232` · `public/panel.html` (11 puntos)

Los datos de la API se insertan en `innerHTML` sin escapar:

```js
<div class="prop-titulo">${p.titulo}</div>
```

La validación del título solo comprueba longitud (10–140), **no filtra `<` `>` ni comillas**.
Un aviso titulado `<img src=x onerror="...">` ejecuta código en el home y en la búsqueda
para cualquier visitante.

La CSP **no** protege: incluye `script-src 'unsafe-inline'`.

**Atenuante:** la cookie de sesión es `HttpOnly`, así que no se puede robar leyendo
`document.cookie`.
**Impacto real:** peticiones autenticadas en nombre de la víctima, formularios de phishing
inyectados, desfiguración del sitio.

**Arreglo:** `propiedad.html` y `publicar.html` ya traen una función `esc()` correcta.
Falta llevarla a las otras tres páginas. Es un cambio pequeño.

**Riesgo hoy:** bajo en la práctica, porque no hay avisos publicados y solo existe una
cuenta. Sube a alto en cuanto entre el primer usuario real.

---

### P-02 · Producción va atrás del repositorio

| | Repositorio | Producción |
|---|---|---|
| `/api/v1/buscar` | ✅ 36 pruebas en verde | ❌ 404 |
| `exige_verificacion` en `/salud` | ✅ | ❌ |

**Causa:** el despliegue es manual (arrastrar un zip). El último no se subió.

**Consecuencia:** la página `/buscar` carga pero no puede traer resultados.
Aunque hubiera avisos publicados, no se encontrarían.

**Arreglo:** arrastrar `wasipe-deploy.zip`. De fondo: montar despliegue continuo desde git.

---

## 🟠 Altos

### P-03 · Faltan credenciales de Cloudinary → no se puede publicar

`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` no están configuradas.
Publicar exige 3 fotos, así que el asistente se detiene en el paso 2.

**Es el bloqueo funcional número uno.** El plan gratuito de Cloudinary alcanza de sobra.

---

### P-04 · Los leads se guardan pero nadie puede leerlos

El formulario de contacto funciona y escribe en la tabla `leads`. **No existe bandeja.**
Un interesado escribe y el aviso nunca se entera.

Además falta el aviso por correo (`RESEND_API_KEY` sin configurar).

---

### P-05 · Enlaces legales muertos — obligación en Perú

El pie del home enlaza a Términos, Privacidad y **Libro de Reclamaciones**; las tres
apuntan a `#`. El Libro de Reclamaciones es **obligatorio** para todo comercio en Perú,
y un enlace roto ahí es peor que no tenerlo: quien lo busca ya viene con un problema.

---

### P-06 · "Proyectos" en la navegación no puede funcionar

El home enlaza a `/buscar?operacion=proyecto`, pero el esquema solo admite
`venta`, `alquiler` y `traspaso`.

Los proyectos son una entidad aparte (`proyectos` + `tipologias`), con tablas creadas
pero sin código. Ese enlace del menú siempre dará vacío o error.

**Opciones:** ocultar "Proyectos" hasta construirlo, o construirlo.

---

## 🟡 Medios

### P-07 · Sin repositorio git hasta este sprint

No había control de versiones. Ningún historial, ninguna forma de volver atrás.
**Se corrige en este sprint** con el commit base.

### P-08 · El vencimiento de avisos no se ejecuta

`vence_en` se asigna a 90 días, pero **no existe el cron**. Ningún aviso vence nunca.
Rompe la promesa del home: *"Aquí no hay propiedades vendidas hace meses"*.

### P-09 · Datos del índice provisionales

Los 25 distritos del índice se sembraron con `muestras = 0`, que la API reporta como
confianza `provisional`. **No son datos de mercado.** Existen para que el panel y el
badge funcionen. Hay que reemplazarlos con datos reales antes de tener usuarios.

### P-10 · `robots.txt` devuelve 404

El `sitemap.xml` funciona, pero sin `robots.txt` los buscadores no saben dónde está.

### P-11 · `ingresar.html` sin puntos de quiebre

Es la única página con **cero** media queries. Hay que revisarla en móvil.

### P-12 · Códigos ubigeo en NULL

Las 74 ubicaciones no tienen código INEI. Se dejaron vacíos a propósito: escribirlos
de memoria sería sembrar un error silencioso. Hay que importar el padrón oficial antes
de usarlos para algo formal.

---

## 🔵 Bajos

### P-13 · Código muerto

| Elemento | Problema |
|---|---|
| `scripts/sembrar-todo.js` | Referenciado en `package.json`, **no existe** |
| `NAV_MARCA` en `cuenta.js` | Exportado, usado en 0 páginas |
| `estilos.css` | Solo lo usan 4 de 7 páginas |
| `scripts/sembrar-ubicaciones.js` | Duplica la migración 004 |

### P-14 · Estilos duplicados en cada página

Cada HTML repite su bloque `:root` y los estilos base: paleta, botones, tipografía.
Cambiar un color obliga a tocar siete archivos.

### P-15 · Sin herramientas estándar

No hay ESLint, Prettier, Vitest/Jest ni Playwright. Las 338 pruebas son scripts propios
con `node`. Funcionan bien, pero no son las herramientas que pide el stack objetivo.

### P-16 · Accesibilidad sin medir

`lang`, `alt`, `aria-*` y `:focus-visible` están correctos. **Sin verificar**: contraste
de color y recorrido completo con teclado. Requieren herramienta real, no inspección estática.

### P-17 · `publicar.html` con 6 `<h1>` en el código

Solo uno es visible por paso, porque el asistente reemplaza el contenido. No es un
error real, pero conviene revisarlo al migrar a componentes.

### P-18 · Rutas de búsqueda no semánticas

Hoy `/buscar?distrito=miraflores`. Para SEO conviene `/venta/departamentos/miraflores`.

### P-20 · El título de la portada repite «Wasipe»

Visto en el Preview del sprint 22:

    Wasipe · Departamentos, casas y proyectos en venta y alquiler en el Perú · Wasipe

La plantilla de título añade el sufijo del sitio a un título que ya lo
traía. Es la etiqueta que muestra Google, así que conviene arreglarlo,
pero no rompe nada.

---

## Resumen

| Gravedad | Cantidad |
|---|---:|
| 🔴 Crítico | 4 |
| 🟠 Alto | 4 |
| 🟡 Medio | 6 |
| 🔵 Bajo | 7 |

**Los tres que más urgen:**
1. **P-01** — XSS, antes de que entre el primer usuario real
2. **P-03** — Cloudinary, sin eso nadie publica
3. **P-02** — desplegar la búsqueda, hoy da 404

**Bloqueantes antes de lanzar:** ninguno abierto. P-19, P-21, P-22 y P-24
se cerraron en el sprint 22, verificados contra el Preview desplegado y no
solo con pruebas.

**Pendientes para el sprint 23:** P-23 (mensaje de Zod en inglés) y P-25
(el panel cuenta avisos ajenos como propios). Los dos se probaron durante
el sprint 22 y se revirtieron por alcance; el arreglo de cada uno está
anotado en su entrada.

Abierto y sin bloquear: las 19 funciones `SECURITY DEFINER` sin
comprobación interna, `saldo_de_creditos` entre autenticados, el borrado
de EXIF sin implementar, y `fast-uri` en el árbol de producción vía
Sentry.
