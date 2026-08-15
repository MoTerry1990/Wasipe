# Inventario de funcionalidades

**Sprint 1** · 15 de agosto de 2026

Qué funciona hoy, qué está a medias y qué no existe. Sirve para saber
qué hay que preservar en la migración.

Leyenda: ✅ funciona en producción · 🟡 construido y probado, no desplegado ·
🔨 backend listo, falta interfaz · ⛔ no existe

---

## Cuentas y sesión

| Funcionalidad | Estado | Dónde |
|---|:--:|---|
| Registro con rol (comprador, propietario, agente, inmobiliaria) | ✅ | `/registro` |
| Ingreso con cookie httpOnly | ✅ | `/ingresar` |
| Cerrar sesión | ✅ | `/panel` |
| Cerrar sesión en todos los dispositivos | 🔨 | `POST /cuentas/salir-todo` |
| Sesión actual con plan y completitud | ✅ | `GET /cuentas/yo` |
| Editar perfil | ✅ | `/panel` → Mi perfil |
| Cambiar contraseña | 🔨 | `PATCH /cuentas/password` |
| Recuperar contraseña | 🔨 | Genera token, **no se envía** (falta correo) |
| Verificar correo | 🟡 | Desactivado a propósito sin `RESEND_API_KEY` |
| Baja de cuenta | ⛔ | |

**Roles:** comprador, propietario, agente, inmobiliaria, moderador, admin.
**Permisos:** `puede()` en la aplicación, denegar por defecto, 29 pruebas.

---

## Avisos

| Funcionalidad | Estado | Dónde |
|---|:--:|---|
| Crear borrador | ✅ | `/publicar` |
| Asistente de 5 pasos con autoguardado | ✅ | `/publicar/:id` |
| Autocompletado de distrito (alias, sin tildes, typos) | ✅ | Paso 1 |
| Índice en vivo al escribir el precio | ✅ | Paso 4 |
| Publicar con todos los faltantes juntos | ✅ | `POST /:id/publicar` |
| Pausar · reactivar · renovar · cerrar | 🔨 | API lista, falta botón en el panel |
| Duplicar aviso | 🔨 | `POST /:id/duplicar` |
| Precio de cierre para alimentar el índice | 🔨 | `POST /:id/cerrar` |
| Máquina de estados (8 estados) | ✅ | `src/modulos/propiedades/estados.ts` |
| Vencimiento a 90 días | 🟡 | Campo `vence_en` se asigna; **el cron no existe** |
| Ficha pública con slug | ✅ | `/propiedad/:slug` |
| 301 desde slugs viejos | ✅ | Preserva el SEO al cambiar el título |
| Badge "vs mercado" | ✅ | En la ficha |
| Avisos similares | ✅ | En la ficha |
| Vistas deduplicadas por IP y día | ✅ | |

---

## Fotos

| Funcionalidad | Estado | Nota |
|---|:--:|---|
| Firma de subida directa a Cloudinary | 🔨 | **Faltan credenciales** |
| Compresión en el navegador (8 MB → ~600 KB) | 🔨 | Sin probar en móvil real |
| Subida en paralelo con progreso | 🔨 | |
| Reordenar con flechas + elegir portada | 🔨 | |
| Verificación contra la Admin API de Cloudinary | 🔨 | Rechaza ids inventados o ajenos |
| Detección de fotos repetidas por `phash` | 🔨 | |
| Borrado del EXIF (GPS de la casa) | 🔨 | |

**Bloqueante:** sin las 3 variables de Cloudinary no se puede publicar,
porque se exigen 3 fotos.

---

## Búsqueda

| Funcionalidad | Estado |
|---|:--:|
| Filtros: operación, tipo, distrito, precio, área, dormitorios, baños, cocheras | 🟡 |
| Rango de precio **entre monedas** (soles y dólares) | 🟡 |
| Características combinadas con Y | 🟡 |
| Texto libre sin tildes | 🟡 |
| Filtro **dueño directo vs agente** | 🟡 |
| Solo verificados | 🟡 |
| 6 órdenes, incluido precio por m² | 🟡 |
| Facetas que ignoran su propio filtro | 🟡 |
| Badge "vs mercado" en cada resultado | 🟡 |
| Resumen con mediana de precios | 🟡 |

**Todo 🟡: construido, 36 pruebas en verde, pero `/api/v1/buscar` da 404 en producción.**

---

## Índice de precios

| Funcionalidad | Estado |
|---|:--:|
| Tabla por distrito con cuota por rol | ✅ |
| Serie de 24 meses por distrito | 🔨 |
| Estimador de precio con factores | 🔨 |
| Referencia sin consumir cuota (para el asistente) | ✅ |
| Datos | ⚠️ **Provisionales** (`muestras = 0`), 25 distritos |

---

## Ubicaciones

| Funcionalidad | Estado |
|---|:--:|
| 74 ubicaciones: 43 distritos de Lima + 7 de Callao + 24 de provincia | ✅ |
| Autocompletado con alias ("Surco", "SJL", "Chosica") | ✅ |
| Tolerancia a typos por trigramas | ✅ |
| Búsqueda sin tildes | ✅ |
| Árbol departamento → provincia → distrito | ✅ |
| Coordenadas aproximadas para centrar mapa | ✅ |
| Códigos ubigeo del INEI | ⛔ **NULL a propósito** — hay que importar el padrón |
| Zonas dentro del distrito | ⛔ Columnas listas, sin datos |

---

## Contactos y leads

| Funcionalidad | Estado |
|---|:--:|
| Formulario de contacto con honeypot y límite | ✅ |
| Se guarda el lead con destinatario congelado | ✅ |
| **Bandeja para leer los leads** | ⛔ **No existe** |
| Estados del lead | ⛔ |
| Conversación (`mensajes`) | ⛔ Tabla lista |
| Aviso por correo al dueño | ⛔ Falta correo |

**Hoy los contactos se guardan pero nadie puede leerlos.**

---

## Monetización

| Funcionalidad | Estado |
|---|:--:|
| 8 planes sembrados | ✅ En base |
| Topes aplicados en backend (avisos, fotos, índice) | ✅ |
| Error 402 con `plan_sugerido` | ✅ |
| Página de planes | ⛔ |
| Checkout con Culqi | ⛔ |
| Comprobantes SUNAT | ⛔ |
| Créditos y destaques | ⛔ Tablas listas |

---

## Panel y administración

| Funcionalidad | Estado |
|---|:--:|
| Panel: índice, mis inmuebles, mi perfil | ✅ |
| Botón "Publicar inmueble" → asistente | ✅ |
| Favoritos | ⛔ Tabla lista |
| Búsquedas guardadas y alertas | ⛔ Tabla lista |
| Notificaciones | ⛔ Tabla lista |
| Cola de moderación | ⛔ |
| Panel de administración | ⛔ |

---

## Marca y contenido

| | Estado |
|---|:--:|
| Ilustración del skyline de Lima | ✅ **Preservada**, ahora también en `public/marca/skyline-lima.svg` |
| Imagen para compartir `og.png` 1200×630 | ✅ |
| Paleta e identidad tipográfica | ✅ |
| Interfaz íntegramente en español peruano | ✅ Verificado por `npm run idioma` |
| Formatos `S/` y `US$`, fechas es-PE / America/Lima | ✅ 20 pruebas |
| Términos, Privacidad, Libro de Reclamaciones | ⛔ **Enlaces muertos — obligación legal en Perú** |

---

## Resumen

| Estado | Cantidad |
|---|---:|
| ✅ Funciona en producción | 31 |
| 🟡 Listo y probado, sin desplegar | 12 |
| 🔨 Backend listo, falta interfaz o credenciales | 17 |
| ⛔ No existe | 24 |

**Lo más urgente por impacto:**
1. Credenciales de Cloudinary — sin ellas nadie publica
2. Desplegar el módulo de búsqueda — hoy 404
3. Bandeja de leads — los contactos son invisibles
4. Enlaces legales — obligatorios en Perú
