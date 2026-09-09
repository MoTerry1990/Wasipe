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

### P-25 · El panel cuenta los avisos de todo el mundo como propios — **RESUELTO (sprint 23B)**

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

### P-30 · La vista de mapa nunca termina de cargar — **RETIRADO: era mi entorno, no el producto**

> **Estaba equivocado, y conviene que quede escrito por qué.**
>
> Se anotó esto sobre la base de que la vista de mapa se quedaba cargando
> para siempre. Eso pasaba **solo en el navegador del panel de
> herramientas**. Bajo Playwright el módulo carga sin problema y el mapa
> se dibuja. No era un defecto del producto: era mi entorno de
> verificación, y lo di por producto durante medio sprint.
>
> El defecto real era otro y sí era mío: el componente esperaba el evento
> `load` de MapLibre, que no llega. Cerrado en el sprint 23D.
>
> La lección que sí vale: **un fallo que solo se ve en una herramienta
> hay que reproducirlo en otra antes de anotarlo.** El control que lo
> resolvió —correr lo mismo bajo Playwright— costó un minuto y lo hice
> tarde.
>
> Lo de abajo queda como se escribió, porque es el ejemplo.

> `/comprar?vista=mapa` se queda para siempre en «Cargando el mapa…». En
> el DOM queda el límite de Suspense sin resolver:
>
>     <template data-dgst="BAILOUT_TO_CLIENT_SIDE_RENDERING">
>     <div role="status">Cargando el mapa…</div>
>
> `vista-resultados.tsx` carga el componente con `next/dynamic` y
> `ssr: false`. Esa promesa nunca resuelve. **`dynamic` no tiene estado de
> error**, así que un módulo que falla al cargarse se ve exactamente igual
> que uno que tarda: cargando, para siempre, sin una línea en consola.
>
> Comprobado en el sprint 23D **guardando los cambios de ese sprint y
> volviendo al código anterior**: falla igual. No lo introdujo la
> cartografía.
>
> Descartado además: WebGL está disponible, React hidrata el resto de la
> página, los fragmentos responden 200 y no hay error en consola ni
> rechazo sin capturar.
>
> Con un `import` estático en vez de `dynamic`, el componente **sí rinde**.
> Ese es el hilo del que tirar.
>
> Mientras esto no se arregle, la cartografía integrada en el sprint 23D
> no se puede ver ni verificar, aunque compile y pase todo lo demás.

### P-31 · Los marcadores del mapa enlazaban a una ruta que no existe — **RESUELTO (sprint 23E)**

> `features/busqueda/mapa-resultados.tsx` enlazaba cada marcador a
> `/aviso/<id>`. **Esa ruta no existe**: la ficha vive en
> `/propiedad/[aviso]`. Cada alfiler del mapa era un enlace muerto, y lo
> era desde que el mapa existe.
>
> Arreglado usando `enlaceDeAviso()`, la misma función que ya usaban la
> lista y los favoritos, en vez de armar la dirección a mano. Ese era el
> fondo del asunto: había dos maneras de construir el enlace de un aviso
> y solo una estaba bien.
>
> La prueba nueva —`tests/e2e/mapa.spec.ts`, «el enlace de un marcador
> lleva a la ficha del aviso»— **no se conforma con que el `href` empiece
> por `/propiedad/`**: navega a esa dirección y exige 200 y que el `h1` no
> sea «Esta página no existe». La anterior también «parecía» una ruta.

### P-32 · «Al instante» no existe: las alertas son diarias — **RESUELTO en código (sprint 23E) · migración sin aplicar**

> `alert_frequency` ofrecía `instant`, y el cron de Vercel en el plan
> gratuito corre una vez al día. La tarea ya trataba `instant` como
> `daily`, pero **la interfaz seguía ofreciendo la opción** y la llamaba
> «Apenas aparezca». Prometer un aviso instantáneo y mandarlo al día
> siguiente es peor que no ofrecerlo: quien lo elige cree que se enteró
> tarde por su culpa.
>
> Se hicieron las dos cosas, porque una sola no alcanzaba:
>
> - **Nada nuevo lo produce.** `features/busqueda/conversacion-acciones.ts`
>   acepta `never`, `daily` y `weekly`; lo que llegue de más cae en
>   `daily`, que es lo que iba a pasar igual.
> - **Lo que ya existía dice la verdad.** La etiqueta de `instant` en
>   `/panel/alertas` es «Un resumen al día». No se borró del mapa de
>   etiquetas: mientras el valor siga siendo posible en la base, borrarlo
>   dejaría filas mostrando «Sin aviso», que sería mentir de nuevo.
>
> El valor sigue en el `CHECK` de la base a propósito: una migración
> aplicada no se modifica.
>
> **Pendiente:** `supabase/migrations/20260908100000_alertas_sin_instantaneo.sql`
> normaliza a `daily` las filas que hubiera en `instant`. Está escrita y
> **no aplicada**, por lo que se explica en P-35. Comprobado por PostgREST
> que hoy hay **cero búsquedas guardadas** en staging, así que la
> migración es un no-operativo y no hay ninguna fila inconsistente
> esperándola.

### P-33 · Las alertas no entregan el correo: solo lo registran — **ABIERTO**

> **Supabase no puede mandar correo transaccional.** Su servicio de correo
> existe y funciona, pero solo para lo que dispara el propio Auth:
> confirmar cuenta, recuperar contraseña, invitar. No hay API de «mandá
> este mensaje a esta dirección», y no es cuestión de configurar una
> variable: no existe el punto de entrada.
>
> Con la regla de costo cero tampoco se abre un servicio dedicado, así que
> el proveedor de bitácora deja escrito el correo completo en
> `notificaciones_de_alerta` y no lo entrega. El estado dice `registrado`
> y no `enviado` justamente para que nadie lo confunda.
>
> Todo lo demás de la tarea funciona y está verificado. Lo único que falta
> es el último tramo, y necesita una decisión de producto: qué proveedor,
> con qué costo. La interfaz `ProveedorDeCorreo` ya está lista para
> recibirlo sin tocar nada más.
>
> **Decidido en el sprint 23E:** cuando haya usuarios reales el proveedor
> será **Resend** (3.000 correos al mes sin costo, que alcanza de sobra
> para el volumen de alertas previsto). No se implementa ahora: hasta que
> alguien reciba esos correos, encenderlo solo agrega una dependencia
> externa y un dominio que verificar. Lo que se implementa es el enchufe,
> y ya está: `ProveedorDeCorreo` no cambia cuando llegue.

### P-29 · Tres pruebas de `busqueda.spec.ts` fallaban — **RESUELTO (sprint 23E)**

> Ninguna de las tres se arregló bajándole la exigencia a la prueba. Dos
> eran del producto y una describía un mundo que ya no existe.
>
> **1 · «la búsqueda no se desborda a lo ancho» — era del producto.**
> Un `<select>` nativo se ancha hasta su opción más larga y no cede: la
> barra de orden medía 267 px por «Precio por m²: de menor a mayor», y al
> lado del contador de resultados se salía de una pantalla de 390,
> desplazando la página entera a lo ancho. Arreglado con `min-w-0` en el
> contenedor y `max-w-full min-w-0` en el `<select>`
> (`features/busqueda/vista-resultados.tsx`). Medido a **390, 360 y
> 320 px** en `/comprar`, `/alquilar` y una búsqueda con filtros:
> `scrollWidth === clientWidth` en los nueve casos.
>
> **2 · «un segmento inventado da 404» — también era del producto.**
> En el sprint 23C la anoté como un localizador impreciso que se
> arreglaba con `.first()`. **Estaba equivocado.** Al medir la página en
> vez de suponerla aparecieron dos encabezados, dos pies y dos `<main>`:
> es P-34, arreglado. La prueba tenía razón; la página estaba mal.
>
> De paso se acotó el localizador, que también hacía falta: el pie ofrece
> las mismas búsquedas populares que el bloque del 404, y eso está bien.
> Lo que hay que comprobar es que **el 404 las ofrezca por su cuenta**,
> sin depender de que alguien baje hasta el pie. Ahora se busca dentro de
> la región «Mientras tanto, las búsquedas más usadas».
>
> **3 · «el orden y la vista se eligen desde la barra» — la prueba estaba
> mal escrita, y de una manera peor que fallar.**
> Comprobaba el texto del estado vacío. O sea que **pasaba en verde sin
> haber tocado nunca la barra de orden**, que es lo que su nombre promete.
> Cuando en el sprint 22 se sembró staging se puso roja, y lo que se rompió
> no fue el producto: fue la suposición de base vacía que traía el archivo
> entero en su cabecera.
>
> Se partió en dos pruebas que sí ejercitan la barra: una cambia el orden
> y exige que quede en la URL —el orden tiene que sobrevivir a compartir
> el enlace—, y otra cambia a vista de mapa y espera el lienzo. Las dos
> llevan un mensaje explícito para que, si algún día el entorno queda sin
> avisos publicados, la falla diga «no hay avisos publicados» y no
> «no se encontró el `select`».
>
> El estado vacío no quedó sin cubrir: la prueba de al lado lo fuerza con
> filtros imposibles, que no depende de lo que haya en la base. Esa es la
> diferencia —una comprueba el estado vacío a propósito, la otra lo
> comprobaba de casualidad.
>
> Las tres juntas fueron el argumento de P-26: una suite con rojos
> crónicos deja de avisar cuando aparece uno nuevo. Acá el rojo llevaba
> dos sprints anotado como «de entorno» y debajo había un defecto real.

### P-34 · El 404 de una sección dibujaba dos encabezados y dos pies — **RESUELTO (sprint 23E)**

> Un `notFound()` lanzado dentro de un grupo de rutas hacía que Next
> dibujara `app/not-found.tsx` **anidado dentro de** la plantilla del
> grupo. Las dos traían `<Encabezado />`, `<main id="contenido">` y
> `<Pie />`, así que salían por duplicado.
>
> No era cosmético: `id="contenido"` repetido dejaba el enlace de «saltar
> al contenido» apuntando a un destino ambiguo, y dos `<main>` y dos
> `contentinfo` en el mismo documento le quitan sentido a la navegación
> por regiones de un lector de pantalla.
>
> **El arreglo.** El contenido del 404 se separó en
> `components/estados/pagina-no-encontrada.tsx`, sin cromo. Quien lo usa
> decide el envoltorio:
>
> - `app/not-found.tsx` pone encabezado, `<main>` y pie, porque cuelga de
>   `app/layout.tsx`, que no trae ninguno.
> - `app/(public)/not-found.tsx`, `app/(dashboard)/not-found.tsx` y
>   `app/(auth)/not-found.tsx` no ponen nada: la plantilla de su grupo ya
>   lo puso.
>
> Se hicieron los tres grupos y no solo el que fallaba. Los tres repetían
> al menos `<main id="contenido">`, y arreglar uno dejando dos rotos es la
> misma manera de trabajar que había causado esto.
>
> **Medido después**, con la etiqueta `robots` de paso, porque el refactor
> movía el `export const metadata`:
>
> | Ruta | Estado | header · footer · main · #contenido | robots |
> |---|---|---|---|
> | `/comprar/narnia` | 404 | 1 · 1 · 1 · 1 | `noindex` |
> | `/ingresar/narnia` | 404 | 1 · 1 · 1 · 1 | `noindex` |
> | `/recuperar/narnia` | 404 | 1 · 1 · 1 · 1 | `noindex` |
> | `/no-existe-en-ninguna-parte` | 404 | 1 · 1 · 1 · 1 | `noindex` |
>
> Uno de cada, no cero: un 404 sin salida es la otra mitad del problema.
>
> **Lo que no pude comprobar:** el 404 del grupo `(dashboard)`. Sin sesión,
> `/panel/<lo que sea>` redirige a `/ingresar` antes de llegar al 404, así
> que ese archivo va por construcción y no por medición. Queda dicho.
>
> Lo cuida `tests/e2e/navegacion.spec.ts` → «el 404 de una sección no
> repite el encabezado ni el pie», que comprueba las dos formas de caer en
> un 404 porque se resuelven por caminos distintos y solo una estaba rota.

### P-35 · El anfitrión directo de Postgres solo publica IPv6 — **RESUELTO (sprint 24, requisito previo)**

> Durante el sprint 23D lo anoté como «dejó de resolver». Era impreciso, y
> la precisión era justo lo que faltaba para arreglarlo:
>
>     nslookup            → 2600:1f16:1e8d:b800:…   (AAAA)
>     nslookup -type=A    → No address (A) records available
>     dns.lookup de Node  → ENOTFOUND
>
> El anfitrión publica **solo AAAA, sin registro A**. No era un DNS caído:
> es que esta máquina no tiene ruta IPv6 y `getaddrinfo` no devolvía nada
> de la familia que sí puede usar. Es el cambio conocido de Supabase: la
> conexión directa pasó a ser solo IPv6, y el camino con IPv4 es el
> *pooler* —o el complemento de IPv4, que es pago y acá no corresponde—.
>
> **La salida, sin costo: el pooler en modo sesión.** Tres cosas cambian
> respecto de la cadena directa, y la segunda es la que no es obvia:
>
> | | Directa | Pooler en modo sesión |
> |---|---|---|
> | Anfitrión | `db.<ref>.supabase.co` | `aws-0-us-east-2.pooler.supabase.com` |
> | Usuario | `postgres` | `postgres.<ref>` — **con el sufijo del proyecto** |
> | Puerto | 5432 | 5432 (el 6543 es modo transacción, que no sirve para migrar) |
>
> El anfitrión correcto se determinó por medición, no por suposición:
> `aws-1-us-east-2` responde en TCP pero rechaza la autenticación con
> «tenant/user not found», y `aws-0-us-east-2` conecta. Probar los dos
> costó menos que adivinar uno.
>
> **Modo sesión y no transacción** porque migrar necesita una conexión que
> conserve estado entre sentencias: el modo transacción devuelve la
> conexión al pool en cada `commit` y rompe cualquier cosa que dependa de
> lo anterior.
>
> Con eso, `db:push` volvió a funcionar y quedó aplicada la migración que
> esperaba desde el sprint 23E (P-32). La base quedó en 35 de 35, con las
> 74 políticas de RLS intactas.

### P-39 · `verificar-proyecto.mjs` no discriminaba: salía 2 siempre — **RESUELTO (sprint 24)**

> `CLAUDE.md` decía que con código 2 no se migra. El guion salía 2 en
> cuanto encontraba tablas, y desde el sprint 21 siempre las hay: el 2 era
> permanente y la regla, leída al pie de la letra, prohibía toda migración
> incremental para siempre. Una comprobación que siempre contesta lo mismo
> dejó de comprobar.
>
> **Antes:** dos respuestas —vacía (0) o con tablas (2)— y la decisión
> mezclada con la petición de red, así que la única forma de saber qué
> haría era apuntarla a una base de verdad y mirar.
>
> **Ahora:** cinco estados, y el bloqueo reservado para lo que no se
> deshace.
>
> | Código | Estado | |
> |---:|---|---|
> | 0 | `base-nueva` · `al-dia` · `con-pendientes` | Se puede continuar; el texto dice cuál |
> | 1 | `configuracion-incompleta` | Faltan variables; no se miró la base |
> | 2 | `proyecto-equivocado` · `entorno-equivocado` | **No se migra** |
> | 3 | `error-de-conexion` | Conectó mal, pero la configuración estaba bien |
>
> La protección no se aflojó: se movió a donde importaba. Producción
> bloquea salvo que se pase `--permitir-produccion`, para que la decisión
> quede escrita en el comando y no en la cabeza de alguien.
>
> **Un detalle que casi deja ciega la protección:** con el *pooler* (P-35)
> el anfitrión es regional y compartido —`aws-0-us-east-2.pooler…`— y no
> dice a qué proyecto se conecta uno. Lo único que lo dice es el usuario,
> `postgres.<ref>`. Un verificador que solo mirara el anfitrión habría
> dado por buena cualquier cadena. Mira los dos.
>
> La decisión vive aparte, en `verificar-proyecto.logica.mjs`, sin entrada
> ni salida, y tiene prueba para cada estado (`tests/unidad/verificar-proyecto.test.ts`)
> sin abrir ninguna conexión ni tocar ningún dato.

### P-26 · Pruebas inestables por tiempo de espera — **RESUELTO (sprint 23F)**

> Tres casos, la misma enfermedad: la prueba esperaba algo que no era el
> hecho que le importaba, y el resultado dependía de cuánto estuviera
> cargado el servidor. Ninguno era un defecto del producto, y por eso
> mismo eran caros: un rojo que aparece y desaparece enseña a ignorar el
> rojo.
>
> **1 · `criticos.spec.ts` → «la vista de mapa abre sin caerse».**
> Usaba `networkidle`, que espera a que no quede ninguna petición en
> vuelo. El mapa pide teselas mientras se dibuja y vuelve a pedirlas al
> moverse, así que ese silencio no llega nunca. Reproducido aislado: dio
> **verde, roja y roja**, siempre agotando el tiempo en `waitForLoadState`.
>
> Ahora espera el lienzo de MapLibre, que es lo que de verdad significa
> «abrió». Exige más que antes: la versión vieja se conformaba con un
> `h1`, que también sale con el mapa roto. Tres corridas aisladas: 6,7 s ·
> 5,8 s · 4,2 s, las tres verdes.
>
> **2 · `navegacion.spec.ts` → «ningún enlace interno de la portada está
> roto».** Recorría los enlaces uno detrás de otro contra el límite de 30
> segundos, y sola tardaba entre 29 y 34. Tres corridas completas del
> sprint 23E dieron **roja, verde y roja** sin que cambiara nada de la
> portada.
>
> Las peticiones ahora van en paralelo: de ~30 s a **8,7 s**. No se
> comprueba menos —los mismos enlaces, la misma petición real, la misma
> exigencia sobre el estado—; se comprueba igual sin rozar el límite. El
> tiempo de espera no se tocó.
>
> **3 · `portada.spec.ts` → las dos de preferencia de moneda.** Esta no
> estaba en el inventario de 26: apareció al estabilizar las otras, en una
> de cada cuatro corridas. Cambiar de moneda es una acción de servidor y
> el botón se deshabilita mientras está en vuelo; la prueba sondeaba
> `aria-pressed` contra el límite de 5 segundos por omisión. Medido cinco
> veces seguidas: **1382, 1526, 1488, 1466 y 1529 ms**, o sea que en una
> corrida tranquila sobra y bajo la suite completa no.
>
> El arreglo no fue subir el número: se espera el hecho observable —que el
> botón vuelva a habilitarse, o sea que la acción terminó— y recién
> entonces se afirma sobre su efecto. Si el cambio de moneda se rompe o se
> cuelga de verdad, esto sigue fallando.
>
> **Cuántos usos del ayudante estaban afectados: uno.** Se midió
> `networkidle` ruta por ruta en vez de razonarlo, que era la manera de
> saberlo sin adivinar:
>
> | Ruta | Asienta en |
> |---|---|
> | `/`, `/proyectos`, `/wasi-ai`, `/busquedas`, `/precio-m2` | 0,5 – 1,3 s |
> | `/comprar`, `/alquilar`, `/comprar` con filtros, ruta amigable | 1,0 – 1,6 s |
> | **`/comprar?vista=mapa`** | **nunca (> 15 s)** |
>
> Once rutas asientan con muchísimo margen y una no asienta jamás. O sea
> que `esperar()` sirve en todas las pantallas del sitio menos la del
> mapa, y no había que cambiarlo en ningún otro sitio.
>
> Para que no vuelva a costar dos sprints, el ayudante ahora **se niega**:
> si lo llaman en la vista de mapa lanza un error que dice qué usar en su
> lugar. Un fallo inmediato y explicado es mejor que treinta segundos de
> espera y un mensaje que no dice nada.

### P-38 · Las pruebas de `robots.txt` afirmaban media garantía por entorno — **RESUELTO (sprint 23F)**

> El primer arreglo de estas pruebas, en este mismo sprint, partía la
> comprobación en dos con un `if (!ES_PRODUCCION)`. Pasaba, pero estaba
> mal: **la mitad que no se ejecuta no comprueba nada**. Contra el
> servidor local solo se afirmaba el contrato de staging, y el de
> producción no lo miraba nadie. Una rama así es un `skip` con otro
> nombre.
>
> Reescrito sin ninguna rama, como equivalencias que valen siempre:
>
>     lo privado  →  nunca rastreable
>     lo público  →  rastreable si y solo si es producción
>     sitemap     →  ofrecido si y solo si es producción
>
> Las tres corren en todos los entornos. Quien contesta si una ruta es
> rastreable es `rastreable()` (`tests/e2e/robots.ts`), que aplica las
> reglas de verdad —gana el patrón más largo, `Allow` gana los empates,
> comodines— en vez de buscar una cadena dentro del archivo, que era lo
> que ataba la prueba a un contrato.
>
> **Tres comprobaciones para que esto no sea humo:**
>
> 1. El evaluador está probado aparte (`tests/unidad/robots.test.ts`, 8
>    pruebas), incluida una que exige que **no conteste siempre lo mismo**:
>    un instrumento roto no avisa, da un número.
> 2. Falsificación: mintiéndole al proceso de prueba
>    (`NEXT_PUBLIC_ENTORNO=produccion` mientras el servidor sirve staging)
>    las dos pruebas **fallan**, con el mensaje
>    `/: rastreable=false con ES_PRODUCCION=true`. No se acomodan.
> 3. El contrato de producción se ejerció de verdad: se construyó con
>    `NEXT_PUBLIC_ENTORNO=produccion` y las once pruebas de `robots.txt`,
>    sitemap y privacidad pasaron contra ese servidor. Los dos contratos
>    quedan comprobados de punta a punta, no uno solo.

### P-36 · La ruta amigable se desbordaba a lo ancho en 360 px y menos — **RESUELTO (sprint 23F)**

> El mismo defecto que la barra de orden del sprint 23E, en otro sitio y
> sin descubrir. Apareció al ampliar la prueba de desborde a tres anchos:
> con un solo ancho, un arreglo que sirve a 390 y falla a 320 pasa en
> verde, y eso era exactamente lo que estaba pasando.
>
> En `/alquilar/departamento/miraflores` —el estado de «no hay resultados,
> mirá estas búsquedas parecidas»— cada fila es un flex con la frase a la
> izquierda y el conteo a la derecha en `whitespace-nowrap`. La frase no
> podía encogerse, así que la fila medía más que la pantalla:
>
>     360 px → scrollWidth 368     320 px → scrollWidth 368
>
> Y el desplazamiento horizontal se lo comía la página entera, no la fila.
> Arreglado con `min-w-0` en la frase (`features/busqueda/pagina-busqueda.tsx`).
>
> 320 px no es un ancho inventado: es el del iPhone SE de primera
> generación y el de varios Android de gama de entrada, que en el Perú son
> una parte real del parque. Ahora la prueba mide **tres anchos por cuatro
> rutas**, incluida la ruta amigable que nadie estaba mirando.

### P-37 · El guardián de P-13 daba su veredicto según los finales de línea — **RESUELTO (sprint 23F)**

> Lo peor de este sprint, y no se buscaba: se destapó solo al revertir el
> commit de formato.
>
> `tests/unidad/seguridad.test.ts` comprueba que el original de una foto
> no termine en un depósito público. Para eso quita los comentarios del
> código con expresiones que terminan en `$`. En JavaScript el retorno de
> carro es un terminador de línea: el punto no lo cruza y el `$` sin la
> bandera `m` exige el final de la cadena, así que **en un archivo con
> CRLF el reemplazo no ocurre** y el comentario se queda.
>
> `core.autocrlf` está en `true`, o sea que en Windows todo archivo recién
> sacado de git llega con CRLF. El guardián venía pasando porque prettier
> había normalizado a LF justo los archivos que mira. Al revertir el
> formato volvió el CRLF y dio un falso positivo inmediato.
>
> En este caso el efecto fue un falso positivo, no un falso negativo —el
> comentario sin quitar nombra el bucket viejo—, pero eso es suerte, no
> diseño: **el veredicto de una prueba de seguridad dependía de con qué
> sistema operativo se hubiera clonado el repositorio.**
>
> Arreglado en `leer()`, que normaliza los finales de línea una sola vez
> para todas las pruebas que analizan fuentes. Verificado reintroduciendo
> el defecto de P-13 a propósito: con la normalización puesta, el guardián
> lo sigue atrapando.

### P-27 · Sentry pedía `onRouterTransitionStart` — **RESUELTO (sprint 24)**

> Next llama a un export con ese nombre en `instrumentation-client.ts` al
> empezar cada navegación del App Router, y Sentry lo necesita para abrir
> ahí la traza. Sin él avisaba por consola y las navegaciones del lado del
> cliente quedaban sin medir: se veían los errores, pero no en qué
> navegación ocurrieron ni cuánto tardaron.
>
> **No hizo falta actualizar nada.** `@sentry/nextjs` 10.70 ya exporta
> `captureRouterTransitionStart` desde su entrada de cliente —comprobado
> en el paquete instalado—; lo que faltaba era el enganche. Se reexporta
> tal cual, sin envolverla: un envoltorio propio se queda atrás cuando
> cambie el de Sentry, y el fallo sería silencioso porque el export
> seguiría existiendo. Hay una prueba que lo exige así.

### P-28 · Avatares y logos nombraban su bucket a mano — **RESUELTO (sprint 24)**

> `features/cuentas/acciones.ts` escribía `.from('avatares')` y
> `.from('logos')` a mano, cuatro veces. Es la misma forma que tenía P-13,
> donde el mapa decía una cosa y la llamada decía otra.
>
> **Pero no era descuido, y eso importa para el arreglo.** El contrato
> tenía un único depósito `perfiles` apuntando a `avatares`, así que **no
> sabía nombrar** el bucket de los logos: subir un logo por esa vía lo
> habría puesto en el bucket equivocado, bajo las políticas equivocadas.
> El código esquivaba el contrato porque el contrato no le servía.
>
> Cambiar cadenas por constantes habría dejado el problema intacto. Lo que
> se hizo fue partir `perfiles` en `avatares` y `logos`, que es lo que hay
> de verdad en Storage: dos buckets con políticas propias. Con eso el
> contrato ya puede expresar lo que el código necesita, y las cuatro
> llamadas pasan por `BUCKET_DE`.
>
> No se tocó ninguna migración ni ninguna política: los identificadores
> que se emiten son los mismos de antes, así que avatares y logos siguen
> cargando por el mismo camino. Los originales siguen privados.
>
> Lo cuida una prueba guardiana nueva en `tests/unidad/seguridad.test.ts`,
> que mira `features/cuentas/` —el guardián anterior solo miraba las
> fuentes de fotos de aviso, por eso no lo veía— y exige además que los
> dos depósitos apunten a buckets distintos: si volvieran a fundirse, la
> prueba de las cadenas pasaría igual y los logos seguirían yendo al lugar
> equivocado. Verificado reintroduciendo la regresión a propósito.

### P-23 · Mensaje de Zod sin traducir en el asistente de publicación — **RESUELTO (sprint 23C)**

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

**Cerrado en el sprint 23:** P-13 y P-25 en 23B; P-23 en 23C; P-31, P-29
—las tres pruebas— y P-34 en 23E. P-32 quedó resuelto en código y espera
solo una migración de normalización que hoy es un no-operativo.

Dos de esos tres rojos de P-29 eran defectos del producto que llevaban
sprints anotados como «de entorno». Vale la pena decirlo así, porque el
costo no fue arreglarlos: fue haberlos clasificado sin medir.

**Abierto al cierre del sprint 23F:**

| | Qué es | Aprieta |
|---|---|---|
| **P-35** | El anfitrión directo de Postgres solo publica IPv6 | Cuando haya que aplicar una migración de verdad |
| **P-33** | Las alertas se registran pero no se entregan | Cuando haya usuarios reales (será Resend) |
| **P-27** | Sentry pide `onRouterTransitionStart` | No |
| **P-28** | Avatares y logos nombran su bucket a mano | No |

**Cerrado en el sprint 23F:** P-26 (las tres pruebas inestables), P-36 (el
desborde de la ruta amigable), P-37 (el guardián que leía según los
finales de línea) y P-38 (las pruebas de `robots.txt` que afirmaban media
garantía por entorno).

**La suite de navegador quedó sin rojos.** 589 pasan, 0 fallan, 5 omitidas
—y esas cinco son una omisión del sprint 6, con motivo escrito: en móvil
los filtros van por el cajón, que tiene su propio bloque de pruebas.

Vale la pena dejar dicho de dónde salieron los 26 rojos que se limpiaron,
porque el reparto sorprende:

| Clase | Cuántos | |
|---|---:|---|
| Pruebas obsoletas | 18 | Codificaban el dominio de Netlify o el `robots.txt` de producción |
| Falso positivo del localizador | 2 | Un hash de Next que parecía un celular |
| Dato de staging supuesto | 2 | Daban por sentada una base vacía |
| Inestabilidad | 4 | `networkidle` y un recorrido secuencial |
| **Defectos del producto** | **0** | de los 26 originales |

Cero de veintiséis. Pero al ampliar la cobertura para arreglarlos
aparecieron **dos defectos reales que ninguna prueba estaba mirando**:
P-36 y P-37. Es el argumento a favor de limpiar los rojos, dicho con
números: mientras la suite tuvo 26 rojos crónicos nadie miró más allá, y
debajo había cosas.

Abierto y sin bloquear: las 19 funciones `SECURITY DEFINER` sin
comprobación interna, `saldo_de_creditos` entre autenticados, el borrado
de EXIF sin implementar, y `fast-uri` en el árbol de producción vía
Sentry.
