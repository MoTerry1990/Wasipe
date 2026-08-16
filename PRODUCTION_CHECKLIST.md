# Lista de verificación para producción

Se marca antes de cada despliegue a producción. No es una formalidad: la
mitad de los puntos existen porque son cosas que ya salieron mal en algún
proyecto, y la otra mitad porque romperlas es caro y silencioso.

**Cómo se lee el estado:**

- ☑ **Hecho y comprobado** — hay una prueba automática o se verificó a mano.
- ☐ **Pendiente** — falta hacerlo.
- ⛔ **Bloqueado** — no se puede hacer todavía, y se dice por qué.

---

## 1. Antes de tocar nada

| | Punto | Cómo se comprueba |
|---|---|---|
| ☑ | El árbol de git está limpio | `git status` sin cambios sueltos |
| ☑ | Todo compila | `npm run build` |
| ☑ | TypeScript sin errores | `npm run typecheck` |
| ☑ | Lint sin errores | `npm run lint` |
| ☑ | Pruebas de unidad y base | `npm test` |
| ☑ | Pruebas de navegador | `npx playwright test` |
| ☑ | Sin vulnerabilidades en dependencias | `npm audit --omit=dev` → 0 |

---

## 2. Base de datos

| | Punto | Estado |
|---|---|---|
| ⛔ | El proyecto de Supabase existe | **No existe.** Es el bloqueo raíz de casi todo lo de abajo |
| ☐ | Las migraciones corren en orden sobre una base vacía | Probado en PGlite, nunca en Supabase |
| ☐ | RLS activo en toda tabla con datos de personas | Probado en PGlite |
| ☐ | La copia de seguridad automática está encendida | Supabase la trae; hay que confirmarla |
| ☐ | Se probó **restaurar** una copia, no solo hacerla | Una copia que nunca se restauró no es una copia |
| ☐ | `SUPABASE_DB_URL` apunta a producción, no a la de desarrollo | |

**El orden importa.** Las migraciones se aplican antes de desplegar el
código. Al revés, el código nuevo pide columnas que no existen y el sitio
se cae entero durante la ventana.

---

## 3. Variables de entorno

| | Variable | Dónde | Nota |
|---|---|---|---|
| ☐ | `NEXT_PUBLIC_SUPABASE_URL` | Vercel | Pública |
| ☐ | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel | Pública a propósito: RLS la protege |
| ☐ | `SUPABASE_SERVICE_ROLE_KEY` | Vercel, **solo servidor** | Se salta RLS entera. Nunca con `NEXT_PUBLIC_` |
| ☐ | `NEXT_PUBLIC_URL_SITIO` | Vercel | El dominio real, no el de vista previa |
| ☑ | `PAGOS_EN_VIVO=no` | Vercel | **Se queda en `no`** hasta aprobación expresa |
| ☐ | `ANTHROPIC_API_KEY` | Vercel, solo servidor | Sin ella, Wasi AI aparece apagado |
| ☐ | `SENTRY_DSN` | Vercel | Sin esto no hay registro de errores |

- ☑ Ninguna clave con `NEXT_PUBLIC_` salvo las dos declaradas — *prueba automática*
- ☑ Ninguna credencial escrita en el código — *prueba automática*
- ☑ `.env.example` no trae ni un valor real — *prueba automática*
- ☐ `.env` **no** está en el repositorio — confirmar con `git ls-files | grep .env`

---

## 4. Autenticación en Supabase

| | Punto |
|---|---|
| ☐ | **Site URL** apunta al dominio de producción |
| ☐ | **Redirect URLs** incluye `https://<dominio>/auth/callback` |
| ☐ | Incluye también el dominio de Vercel, para las vistas previas |
| ☐ | **No** incluye `http://localhost` en producción |
| ☐ | La confirmación de correo está encendida |
| ☐ | Las plantillas de correo están en castellano peruano |
| ☐ | El remitente es un dominio propio, no el de Supabase |

Si las Redirect URLs están mal, el registro parece funcionar y el enlace
del correo lleva a una página rota. Es de los fallos que más tarda en
notarse porque nadie prueba el correo de confirmación.

---

## 5. Almacenamiento

| | Punto |
|---|---|
| ☐ | Las seis cubetas existen con los nombres de las migraciones |
| ☐ | `originales` es **privada** — lleva los EXIF con el GPS |
| ☐ | `generados` es **privada** — nadie aprobó esas imágenes todavía |
| ☐ | `videos` es **privada** |
| ☐ | `originales` **no** admite UPDATE ni DELETE desde el navegador |
| ☐ | Las políticas de `storage.objects` están aplicadas |
| ☐ | El límite de tamaño por archivo está puesto |
| ☐ | Los tipos MIME permitidos están puestos |
| ☑ | El tipo se valida por contenido, no por lo que declara el navegador |
| ☑ | Los nombres de archivo no dejan salir de la carpeta |
| ☑ | `image_hash` se calcula para las imágenes nuevas |

Las políticas están en `20260816090200_almacenamiento.sql`. Una cubeta
sin políticas con RLS activo no deja escribir a nadie; una cubeta pública
sin límite de tipo acepta un HTML con script dentro.

---

## 6. Seguridad

| | Punto | Estado |
|---|---|---|
| ☑ | P-01: el sitio anterior escapa lo que dibuja | 129 interpolaciones. *Prueba automática* |
| ☑ | Los datos estructurados no se pueden romper con `</script>` | *Prueba automática* |
| ☑ | Ningún componente de cliente consulta tablas privadas | *Prueba automática* |
| ☑ | Las acciones de administración exigen puesto antes de tocar la base | *Prueba automática* |
| ☑ | Un visitante no lee ninguna tabla con datos de personas | *Prueba contra PGlite* |
| ☑ | Un webhook de pago repetido no acredita dos veces | *Prueba contra PGlite* |
| ☑ | El tope de consultas de teléfono corta a los 30 por hora | *Prueba contra PGlite* |
| ☑ | Ningún registro escribe correos, teléfonos ni claves | *Prueba automática* |
| ☑ | Cabeceras de seguridad en `vercel.json` y `next.config.ts` | |
| ☐ | Las mismas comprobaciones contra Supabase real | **Bloqueado** |

---

## 7. Rendimiento y accesibilidad

| | Punto |
|---|---|
| ☑ | 0 violaciones críticas ni serias de accesibilidad, en once pantallas |
| ☑ | Contraste mínimo 4.5:1 en todo el texto |
| ☑ | Se navega entero con teclado |
| ☑ | Medición de rendimiento documentada, móvil y escritorio |
| ☐ | Volver a medir con datos reales — hoy son estados vacíos |

---

## 8. SEO

| | Punto |
|---|---|
| ☑ | `robots.txt` responde y apunta al sitemap |
| ☑ | El sitemap solo lleva direcciones que responden 200 |
| ☑ | Las búsquedas con filtros no se indexan |
| ☑ | Una dirección inexistente responde **404 de verdad**, no 200 |
| ☐ | Search Console dado de alta y sitemap enviado |
| ☐ | El validador de datos estructurados de Google, corrido |

---

## 9. Observabilidad

| | Punto | Estado |
|---|---|---|
| ⚠️ | Sentry integrado, sin DSN | El código está; falta la credencial |
| ☑ | Los errores no llevan contraseñas, cookies ni datos personales | 14 pruebas |
| ☐ | Sentry recibe un error de verdad | **Sin verificar** |
| ☐ | Hay una alerta cuando la tasa de error sube | |
| ☐ | Hay una comprobación de estado externa | |
| ☑ | Los errores no exponen nada interno a la persona | El 404 y el error dan un mensaje sin traza |

**Sigue siendo el punto más flojo,** aunque ya no esté vacío. Con el
código listo, falta la credencial y una comprobación de estado externa:
si el sitio deja de responder, no hay servidor que mande el error, así
que Sentry no se entera de una caída completa.

---

## 10. Después de desplegar

| | Punto |
|---|---|
| ☐ | La portada carga |
| ☐ | Una búsqueda devuelve resultados |
| ☐ | Una ficha abre |
| ☐ | Crear una cuenta de prueba funciona de punta a punta |
| ☐ | El correo de confirmación llega y su enlace funciona |
| ☐ | Publicar un aviso de prueba funciona |
| ☐ | Moderarlo desde el panel funciona |
| ☐ | Una dirección inexistente responde 404 |
| ☐ | El sitio anterior de Netlify **sigue en pie** |

---

## Qué bloquea el lanzamiento y qué no

**Bloquean:**

1. No existe el proyecto de Supabase. Sin eso no hay nada que desplegar.
2. Sin Sentry, un fallo en producción es invisible.
3. Sin restaurar una copia de seguridad al menos una vez, no sabemos si
   se puede recuperar.

**No bloquean:**

- Que no haya pasarela de pagos. Publicar es gratis; los cobros son para
  destacar avisos, y eso puede esperar.
- Que Wasi AI esté apagado. Se declara apagado y publicar a mano funciona.
- Que falten las cuatro pantallas de administración de `finance`.
