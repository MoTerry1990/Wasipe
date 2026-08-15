# Wasipe — Autenticación y sistema de roles

Diseño para el MVP, con el camino de crecimiento marcado. Continúa el auth que ya funciona en `wasipe-v10` (JWT en cookie httpOnly + `version_token`), no lo reemplaza.

---

## 1. La idea central: cuatro ejes, no uno

Casi todos los sistemas de permisos se enredan porque meten todo en "el rol". En Wasipe conviven cuatro cosas distintas:

```
1. ROL DE CUENTA        usuarios.rol             qué tipo de usuario sos
2. CARGO EN LA AGENCIA  agencia_miembros.rol     qué podés hacer dentro de tu inmobiliaria
3. PROPIEDAD            usuario_id / agencia_id  ¿este aviso es tuyo?
4. HABILITACIONES       email verificado · plan · estado de cuenta
```

El eje 4 es el que más confusión causa. **"Puede publicar" no es un rol.** Es:

```
rol permite publicar   Y   email verificado   Y   dentro del tope del plan   Y   cuenta activa
```

Mezclar eso con el rol lleva a inventar roles falsos como `agente_verificado_con_plan`. Separado, cada eje se evalúa por su cuenta y todo se mantiene simple.

### Comprar no es un rol

Aunque pediste roles para *buyer* y *seller*, **no conviene que sean excluyentes**. Alguien que entró a buscar departamento y seis meses después quiere alquilar el suyo no debería necesitar otra cuenta.

Por eso:

> **Todas las capacidades de comprador (favoritos, búsquedas guardadas, contactar, consultar el índice) las tiene cualquier usuario autenticado, sin importar su rol.**
> **El rol solo controla vender**: publicar, recibir leads, tener perfil público, manejar equipo.

`comprador` es el rol por defecto y el piso de permisos. Subir a `propietario` es autoservicio e instantáneo — un clic en "Publicar mi propiedad". Nunca hay que modelar usuarios con doble rol.

### "Agencia" no es un rol, es una entidad

No se puede iniciar sesión como una inmobiliaria. Lo que existe es:

| Cosa | Dónde vive | Qué es |
|---|---|---|
| `usuarios.rol = 'inmobiliaria'` | usuario | Una **persona** que opera para una inmobiliaria y puede crear una |
| `agencias` | entidad | La **organización** |
| `agencia_miembros.rol` | dueno · admin · agente | Su **cargo** dentro de esa organización |

---

## 2. Los seis roles

| Rol | Quién es | Puede vender | Perfil público | Panel admin |
|---|---|---|---|---|
| `comprador` | Busca. Rol por defecto al registrarse | — | — | — |
| `propietario` | Dueño que publica lo suyo, sin intermediarios | ✓ limitado | — | — |
| `agente` | Agente inmobiliario independiente o de agencia | ✓ | `/agente/:slug` | — |
| `inmobiliaria` | Persona que opera una inmobiliaria | ✓ | `/inmobiliaria/:slug` | — |
| `moderador` | Staff: aprueba avisos y resuelve reportes | — | — | ✓ parcial |
| `admin` | Staff: todo, incluido dinero y roles | — | — | ✓ total |

**`moderador` existe separado de `admin` a propósito.** Moderar avisos es tarea de alto volumen que vas a delegar; reembolsar pagos y cambiar roles, no. Un moderador que se equivoca rechaza un aviso; un admin que se equivoca devuelve plata.

### Cambio de rol

| Camino | Cómo |
|---|---|
| `comprador → propietario` | Autoservicio, instantáneo |
| `propietario → agente` | Autoservicio. La **insignia de verificado** sí pasa por revisión de admin |
| `→ inmobiliaria` | Autoservicio; crear la agencia exige RUC válido |
| `→ moderador` o `admin` | **Solo un admin**, jamás autoservicio, siempre en `auditoria` |

```ts
// El agujero clásico: aceptar el rol que venga en el body
const ROLES_AUTOSERVICIO = ['comprador','propietario','agente','inmobiliaria'] as const;

if (!ROLES_AUTOSERVICIO.includes(body.rol)) {
  throw new ErrorHTTP(403, 'Ese tipo de cuenta no se puede crear desde acá.');
}
```

Aplica igual en `POST /cuentas/registro` y en `PATCH /cuentas/rol`.

---

## 3. Matriz de permisos

`✓` permitido · `✓*` solo sobre recursos propios (o de su agencia) · `—` denegado

| Acción | comprador | propietario | agente | inmobiliaria | moderador | admin |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| **Buscar y ver** |
| `buscar.publico` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `favorito.gestionar` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `busqueda.guardar` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `aviso.contactar` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `indice.consultar` | ✓ cuota | ✓ cuota | ✓ | ✓ | ✓ | ✓ |
| `reporte.crear` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Publicar** |
| `aviso.crear` | — | ✓ | ✓ | ✓ | — | ✓ |
| `aviso.editar` | — | ✓* | ✓* | ✓* | — | ✓ |
| `aviso.publicar` | — | ✓* | ✓* | ✓* | — | ✓ |
| `aviso.pausar` / `renovar` / `cerrar` | — | ✓* | ✓* | ✓* | — | ✓ |
| `aviso.eliminar` | — | ✓* | ✓* | ✓* | — | ✓ |
| `medio.subir` | — | ✓* | ✓* | ✓* | — | ✓ |
| `lead.ver` / `lead.responder` | — | ✓* | ✓* | ✓* | — | ✓ |
| `metricas.propias` | — | ✓* | ✓* | ✓* | — | ✓ |
| **Perfil profesional** |
| `perfil.publico` | — | — | ✓ | ✓ | — | ✓ |
| `agencia.crear` | — | — | — | ✓ | — | ✓ |
| `agencia.editar` | — | — | — | ✓* | — | ✓ |
| `agencia.invitar` / `remover` | — | — | — | ✓* | — | ✓ |
| `proyecto.gestionar` | — | — | — | ✓* | — | ✓ |
| **Dinero** |
| `plan.contratar` | — | ✓ | ✓ | ✓ | — | ✓ |
| `pago.ver_propio` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `destaque.comprar` | — | ✓* | ✓* | ✓* | — | ✓ |
| **Moderación** |
| `aviso.moderar` | — | — | — | — | ✓ | ✓ |
| `reporte.resolver` | — | — | — | — | ✓ | ✓ |
| `usuario.ver` | — | — | — | — | ✓ | ✓ |
| `metricas.plataforma` | — | — | — | — | ✓ | ✓ |
| `aviso.archivar` | — | — | — | — | — | ✓ |
| `usuario.verificar` / `suspender` | — | — | — | — | — | ✓ |
| `usuario.cambiar_rol` | — | — | — | — | — | ✓ |
| `pago.reembolsar` | — | — | — | — | — | ✓ |
| `plan.editar` | — | — | — | — | — | ✓ |
| `indice.cargar` | — | — | — | — | — | ✓ |
| `auditoria.ver` | — | — | — | — | — | ✓ |

**Diferencia entre `propietario` y `agente`:** no está en el permiso, está en el **tope del plan**. Un propietario puede publicar 1 aviso gratis; un agente paga y publica 15. La acción es la misma, el límite es distinto. Por eso el plan es un eje aparte del rol.

### Cargos dentro de una agencia

| Acción | dueno | admin | agente |
|---|:--:|:--:|:--:|
| Editar datos de la agencia | ✓ | ✓ | — |
| Invitar / remover miembros | ✓ | ✓ | — |
| Contratar o cambiar el plan | ✓ | — | — |
| Ver y editar avisos de la agencia | ✓ | ✓ | ✓ |
| Ver leads de toda la agencia | ✓ | ✓ | solo los suyos |
| Transferir la propiedad de la agencia | ✓ | — | — |

Una agencia siempre tiene exactamente un `dueno`, garantizado por la base:
```sql
CREATE UNIQUE INDEX ux_agencia_dueno ON agencia_miembros (agencia_id) WHERE rol = 'dueno';
```

---

## 4. Estrategia de sesión: JWT en cookie, sin refresh tokens

**Mantené lo que ya tenés.** Es la decisión correcta y ya está funcionando.

```
Cookie   wasipe_sesion
         httpOnly · Secure · SameSite=Lax · Path=/ · Max-Age=30 días

Payload  { sub: usuario_id, rol, ver: version_token, iat, exp }
```

### Por qué no refresh tokens

Los refresh tokens existen para que el access token dure poco cuando se guarda en un lugar accesible desde JavaScript (localStorage). **Una cookie httpOnly no es accesible desde JavaScript**, así que ese modelo de amenaza no aplica. Sumarlos acá agrega dos endpoints, una tabla y una clase entera de bugs de renovación, sin comprar seguridad.

### Por qué `SameSite=Lax` y no `Strict`

`Strict` parece más seguro y **rompe el flujo de verificación por correo**: el usuario hace clic en el enlace del email, llega a Wasipe y la cookie no viaja, así que aparece deslogueado. `Lax` manda la cookie en navegaciones GET de primer nivel, que es exactamente ese caso, y la sigue bloqueando en peticiones cross-site.

### Revocación instantánea sin tabla de sesiones

`usuarios.version_token` es un entero. El JWT lleva ese valor en `ver`. Si no coinciden, se rechaza.

```ts
// Cierra sesión en todos los dispositivos, al instante
await sql`UPDATE usuarios SET version_token = version_token + 1 WHERE id = ${id}`;
```

Se incrementa al: cambiar contraseña · usar un reset · `POST /cuentas/salir-todo` · suspender la cuenta · cambiar el rol.

### La pregunta honesta: ¿el JWT compra algo si igual consultás la base?

Sí, aunque menos de lo que parece. La verificación es en dos pasos:

```
1. Verificar firma  →  sin base de datos. Un token falso o vencido muere acá.
2. Cargar el usuario →  solo si el handler necesita datos frescos.
```

La mayoría de los handlers ya necesitan la fila del usuario (nombre, rol, estado, plan), así que comprobar `ver` **viaja gratis en una consulta que ibas a hacer igual**. Y los endpoints que no necesitan datos del usuario se resuelven sin tocar la base.

Lo que el JWT te ahorra de verdad: escritura en cada login, tabla de sesiones que limpiar, y un punto de fallo menos.

**El costo real:** una cookie robada sirve hasta 30 días, salvo que se incremente `version_token`. Se mitiga con `Secure` + `httpOnly` + incremento en todo cambio sensible. Si más adelante querés "ver mis dispositivos activos" y cerrar sesiones una por una, se agrega una tabla `sesiones` **sin tocar el cliente** — el frontend nunca ve el token.

### El secreto de firma

El código actual genera el secreto solo y lo guarda en la tabla `config`. Ingenioso para arrancar sin configuración, pero significa leer la base en cada verificación y complica rotarlo.

```ts
// src/lib/auth.ts
let secretoCache: string | null = null;

async function secreto(): Promise<string> {
  if (secretoCache) return secretoCache;
  if (process.env.JWT_SECRET) return (secretoCache = process.env.JWT_SECRET);

  // Fallback solo para el primer arranque sin configurar
  const [fila] = await sql`SELECT valor FROM config WHERE clave = 'jwt_secret'`;
  if (fila) return (secretoCache = fila.valor);

  const nuevo = crypto.randomBytes(48).toString('base64');
  await sql`INSERT INTO config (clave, valor) VALUES ('jwt_secret', ${nuevo})
            ON CONFLICT (clave) DO NOTHING`;
  return (secretoCache = nuevo);
}
```

`JWT_SECRET` primero, cacheado en memoria del módulo. Generalo con `openssl rand -base64 48`.

---

## 5. Registro e inicio de sesión

### Contraseñas

**bcrypt, coste 12.** Tarda ~250 ms en Lambda: molesto para un atacante, invisible para el usuario, y lejos del timeout de 10 s.

```ts
// bcrypt trunca a 72 BYTES, no 72 caracteres.
// "contraseña" son 10 caracteres pero 11 bytes en UTF-8.
if (Buffer.byteLength(password, 'utf8') > 72) {
  throw new ErrorHTTP(422, 'Esa contraseña es demasiado larga.', { campo: 'password' });
}
```

Reglas: mínimo 8 caracteres, máximo 72 **bytes**, no puede ser igual al email. Nada de exigir mayúsculas y símbolos — empuja a la gente a `Password1!` y no suma. Sí conviene rechazar las 10.000 contraseñas más filtradas.

### Registro

```
POST /cuentas/registro  { email, password, nombre, rol }
  ↓
1. Rate limit: 3/hora por IP
2. rol ∈ ROLES_AUTOSERVICIO         ← si no, 403
3. email normalizado a minúsculas y único (ignorando cuentas dadas de baja)
4. bcrypt(password, 12)
5. INSERT usuarios + perfiles (fila vacía) en una transacción
6. Token de verificación → correo
7. Emitir cookie: queda logueado de una
```

Se inicia sesión al registrarse. Obligar a verificar el correo **antes** de entrar hace que la gente abandone. La verificación se exige recién al publicar.

### Login

```
POST /cuentas/ingresar  { email, password, recordarme }
  ↓
1. Rate limit: 8 / 15 min por email+IP  (tabla intentos_auth, ya existe)
2. Buscar usuario. Si no existe → ejecutar igual un bcrypt.compare contra un
   hash falso, para que el tiempo de respuesta no delate qué correos existen
3. Comparar hash
4. estado = 'activo'?  suspendido → 403 con motivo
5. Emitir cookie nueva (nunca reutilizar la anterior: evita fijación de sesión)
6. Registrar ultimo_acceso
```

**Un solo mensaje de error para email inexistente y contraseña mala:**

```ts
throw new ErrorHTTP(401, 'Correo o contraseña incorrectos.', { codigo: 'CREDENCIALES_INVALIDAS' });
```

Mensajes distintos convierten el login en un verificador de qué correos tienen cuenta.

---

## 6. Tokens de un solo uso

Verificación de correo, recuperación de contraseña e invitaciones usan el mismo mecanismo y la misma tabla `tokens_cuenta`.

```ts
// Emitir
const token = crypto.randomBytes(32).toString('base64url');   // lo que va en el enlace
const hash  = crypto.createHash('sha256').update(token).digest('hex');

await sql`INSERT INTO tokens_cuenta (usuario_id, tipo, token_hash, expira_en)
          VALUES (${id}, ${tipo}, ${hash}, ${expira})`;
// Se envía `token`. En la base solo queda `hash`.
```

**En la base nunca se guarda el token en claro.** Si alguien filtra la tabla, no puede usarla: es el mismo principio que con las contraseñas.

| Tipo | Vigencia | Al usarse |
|---|---|---|
| `verificar_email` | 24 h | Marca `email_verificado_en` |
| `recuperar_password` | **1 h** | Cambia la contraseña, incrementa `version_token`, **invalida los demás tokens de reset del usuario** |
| `invitacion` | 7 días | Agrega a `agencia_miembros` |

Verificación:
```ts
const hash = sha256(tokenRecibido);
const [t] = await sql`SELECT * FROM tokens_cuenta
                      WHERE token_hash = ${hash} AND tipo = ${tipo}
                        AND usado_en IS NULL AND expira_en > now()`;
if (!t) throw new ErrorHTTP(410, 'Ese enlace ya venció o no es válido. Pide uno nuevo.');
await sql`UPDATE tokens_cuenta SET usado_en = now() WHERE id = ${t.id}`;   // un solo uso
```

### Recuperar contraseña sin filtrar quién tiene cuenta

```
POST /cuentas/recuperar  { email }
  ↓
Siempre responde 200 con el mismo mensaje, exista o no la cuenta.
El envío del correo se hace después de responder.
```

```jsonc
{ "ok": true,
  "mensaje": "Si esa cuenta existe, te llegará un correo con las instrucciones." }
```

Responder 404 cuando el correo no existe convierte el endpoint en un enumerador de usuarios.

---

## 7. Habilitaciones: lo que no es un rol

Cuatro comprobaciones que se evalúan aparte del rol.

| Habilitación | Se pide para | Error si falla |
|---|---|---|
| `email_verificado_en IS NOT NULL` | Publicar, contratar plan, crear agencia | `403 EMAIL_NO_VERIFICADO` |
| `estado = 'activo'` | Todo lo autenticado | `403 CUENTA_SUSPENDIDA` |
| Tope del plan | Crear aviso, subir fotos, invitar miembros | `402` + `plan_sugerido` |
| Datos de perfil | Recibir leads (`telefono` o `whatsapp`) | `422` con el campo que falta |

**Buscar, favoritear y contactar no exigen correo verificado.** Poner una barrera ahí espanta compradores sin ganar nada — no hay nada que abusar. La verificación se pide recién donde el contenido se vuelve público.

---

## 8. Flujo de completitud del perfil

No hay un booleano "perfil completo". Lo que existe es **qué necesitás según lo que querés hacer**, y eso cambia por rol.

```
Registro (mínimo)          email · password · nombre · rol
        ↓
Comprar                    nada más
        ↓
Publicar                   + correo verificado + teléfono
        ↓
Recibir leads bien         + whatsapp
        ↓
Perfil público (agente)    + slug + foto + bio + zonas
        ↓
Insignia verificado        + RUC/documento → revisión de admin
```

`GET /cuentas/yo` devuelve el estado y el siguiente paso, para que la UI empuje sin bloquear:

```jsonc
{
  "perfil_completitud": {
    "porcentaje": 60,
    "puede_publicar": false,
    "puede_recibir_leads": true,
    "siguiente_paso": {
      "campo": "email",
      "accion": "verificar_email",
      "mensaje": "Confirma tu correo para publicar tu primer aviso.",
      "bloquea": ["aviso.publicar"]
    },
    "pendientes": [
      { "campo":"email","mensaje":"Confirma tu correo","peso":30 },
      { "campo":"foto_url","mensaje":"Sube una foto: los avisos con foto de perfil reciben 40% más contactos","peso":10 }
    ]
  }
}
```

Cada pendiente dice **por qué conviene**, no solo qué falta. "Sube una foto" se ignora; "los avisos con foto reciben 40% más contactos" se hace.

**Nunca bloquear la navegación por perfil incompleto.** Se pide el dato en el momento exacto en que hace falta.

---

## 9. Implementación

### Un solo punto de decisión

```ts
// src/lib/permisos.ts
type Accion = 'aviso.crear' | 'aviso.editar' | 'aviso.moderar' | 'agencia.invitar' | …;

export function puede(u: Sesion, accion: Accion, recurso?: Recurso): boolean {
  if (u.estado !== 'activo') return false;
  if (u.rol === 'admin') return true;

  switch (accion) {
    case 'aviso.crear':
      return ['propietario','agente','inmobiliaria'].includes(u.rol);

    case 'aviso.editar':
    case 'aviso.publicar':
    case 'medio.subir':
      return esSuyo(u, recurso) || esDeSuAgencia(u, recurso);

    case 'lead.ver':
      return recurso.destinatario_id === u.id || esAdminDeAgencia(u, recurso.agencia_id);

    case 'agencia.invitar':
      return cargoEnAgencia(u, recurso.agencia_id, ['dueno','admin']);

    case 'aviso.moderar':
    case 'reporte.resolver':
      return u.rol === 'moderador';

    // favoritos, búsquedas guardadas, contactar: cualquier sesión activa
    case 'favorito.gestionar':
    case 'busqueda.guardar':
    case 'aviso.contactar':
      return true;

    default:
      return false;   // denegar por defecto
  }
}
```

**Denegar por defecto.** Una acción nueva sin caso escrito queda cerrada, no abierta.

Nunca chequees permisos dentro de un handler. Siempre `puede()`.

### Middleware (Hono)

```ts
export const conSesion    = () => async (c, next) => { /* 401 si no hay */ };
export const conVerificado = () => async (c, next) => { /* 403 EMAIL_NO_VERIFICADO */ };
export const conRol   = (...roles) => async (c, next) => { /* 403 */ };
export const conPermiso = (accion, cargar?) => async (c, next) => { /* 403 */ };
export const conPlan  = (limite)     => async (c, next) => { /* 402 + plan_sugerido */ };
```

```ts
propiedades.post('/',
  conSesion(), conVerificado(), conPermiso('aviso.crear'), conPlan('avisos'),
  crearAviso);

propiedades.patch('/:id',
  conSesion(), conPermiso('aviso.editar', cargarAviso),
  editarAviso);

admin.post('/propiedades/:id/aprobar',
  conSesion(), conPermiso('aviso.moderar'),
  aprobar);
```

Se lee de corrido y el permiso está a la vista en la definición de la ruta.

### Escalada de privilegios por asignación masiva

El agujero más común, y tu frontend actual lo deja servido. `panel.html` hace:

```js
const d = Object.fromEntries(new FormData(fp));
await api('/perfil', { method: 'PATCH', body: d });   // manda lo que haya en el form
```

Si el backend expande ese objeto dentro del `UPDATE`, cualquiera abre las herramientas de desarrollo, agrega un campo y se asciende. **Verificá cómo lo hace el bundle actual.**

```ts
// Mal: lo que llegue termina en la base
await sql`UPDATE perfiles SET ${sql(body)} WHERE usuario_id = ${u.id}`;

// Bien: lista blanca explícita
const CAMPOS = ['foto_url','bio','ubicacion_id','whatsapp','sitio_web'] as const;
const datos = Object.fromEntries(
  CAMPOS.filter(k => k in body).map(k => [k, body[k]])
);
```

`rol`, `verificado`, `estado`, `version_token`, `email_verificado_en` y `password_hash` **nunca** se escriben desde un endpoint de perfil. El cambio de rol tiene su propio endpoint, con su propia validación y su registro en `auditoria`.

### CSRF

`SameSite=Lax` + exigir `Content-Type: application/json` en toda mutación. Un formulario cross-site no puede mandar ese content-type sin disparar preflight CORS, y CORS está cerrado a tu origen. Alcanza para este caso, sin tokens CSRF.

---

## 10. Qué construir ahora y qué después

### MVP — lo mínimo completo

- [x] Cookie httpOnly + JWT + `version_token` *(ya existe)*
- [x] Rate limiting con `intentos_auth` *(ya existe)*
- [ ] `JWT_SECRET` en variable de entorno, cacheado
- [ ] Verificación de correo (token de 24 h)
- [ ] Recuperación de contraseña (token de 1 h, respuesta que no filtra)
- [ ] `lib/permisos.ts` con `puede()` y denegar por defecto
- [ ] Middleware `conSesion` / `conVerificado` / `conPermiso` / `conPlan`
- [ ] Lista blanca de campos en todo `PATCH` — **revisar el bundle actual**
- [ ] Rol `comprador` por defecto + subida de rol autoservicio
- [ ] `perfil_completitud` en `GET /cuentas/yo`

### Fase 2 — cuando haya ingresos

- **Ingreso con Google.** El mayor aumento de conversión de registro que vas a conseguir. `usuarios.password_hash` pasa a nullable y se agrega `identidades_oauth`.
- **2FA para `admin` y `moderador`.** TOTP. Cuando el panel mueve dinero, la cuenta de staff vale robarla.
- **Tabla `sesiones`.** Solo si querés "mis dispositivos activos" y cierre selectivo. El cliente no cambia: nunca ve el token.
- **Rotación de claves.** `kid` en el header del JWT y dos secretos activos durante la transición.

### Fase 3 — solo si aparece la necesidad

- Permisos por usuario que pisen el rol (empezá con roles fijos: seis alcanzan)
- Registro de accesos por dispositivo e IP con alertas de inicio de sesión inusual
- SSO para inmobiliarias grandes

**Lo que no vale la pena:** tablas `roles`/`permisos` dinámicas. Seis roles fijos no justifican RBAC configurable. Un `switch` en TypeScript se lee, se versiona en git y no tiene una interfaz de administración que mantener. El día que de verdad necesites permisos dinámicos, **la firma de `puede()` no cambia** — solo su cuerpo.

---

## 11. Resumen

| Decisión | Elección | Razón |
|---|---|---|
| Sesión | JWT en cookie httpOnly | Ya funciona; sin refresh tokens, que acá no compran nada |
| Revocación | `version_token` | Cierre global instantáneo, sin tabla de sesiones |
| Cookie | `SameSite=Lax`, no `Strict` | `Strict` rompe los enlaces de verificación por correo |
| Contraseñas | bcrypt coste 12 | ~250 ms: caro de atacar, imperceptible al usar. Validar 72 **bytes** |
| Tokens | 32 bytes aleatorios, se guarda el SHA-256 | Filtrar la tabla no sirve de nada |
| Roles | 6 fijos en `CHECK` | Cambiar un CHECK es trivial; quitar un valor de un ENUM nativo, casi imposible |
| Permisos | Un `switch` en `puede()` | Se lee y se versiona. Denegar por defecto |
| Comprar | Sin rol | Todo usuario autenticado puede favoritear y contactar. El rol solo gobierna vender |
| Perfil | Sin flag "completo" | Se pide cada dato en el momento en que hace falta |

**Lo más importante de todo el diseño:** separar el rol de las habilitaciones. "Puede publicar" no es un rol — es rol **y** correo verificado **y** dentro del plan **y** cuenta activa. Mantener esos cuatro ejes sueltos es lo que evita que el sistema se pudra cuando lleguen los planes pagos y los equipos de inmobiliaria.
