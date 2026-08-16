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

---

## Resumen

| Gravedad | Cantidad |
|---|---:|
| 🔴 Crítico | 2 |
| 🟠 Alto | 4 |
| 🟡 Medio | 6 |
| 🔵 Bajo | 6 |

**Los tres que más urgen:**
1. **P-01** — XSS, antes de que entre el primer usuario real
2. **P-03** — Cloudinary, sin eso nadie publica
3. **P-02** — desplegar la búsqueda, hoy da 404
