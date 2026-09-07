# Observabilidad

**Estado: CÓDIGO LISTO, SIN CONECTAR — falta el DSN de Sentry.**

---

## Qué se hizo

`@sentry/nextjs` 10.70.0, configurado para los tres entornos de ejecución:

| Archivo | Qué cubre |
|---|---|
| `sentry.client.config.ts` | El navegador |
| `sentry.server.config.ts` | Páginas y acciones de servidor |
| `sentry.edge.config.ts` | El middleware |
| `instrumentation.ts` | El arranque, y `onRequestError` |
| `lib/observabilidad/sentry.ts` | La configuración, en un solo sitio |

La configuración está centralizada a propósito. Con tres copias, el día
que se agrega un campo a la lista de cosas que hay que ocultar, se agrega
en dos y la tercera sigue mandando datos personales durante meses.

**Sin `NEXT_PUBLIC_SENTRY_DSN` no se inicializa nada:** ni una petición,
ni peso extra en el paquete que descarga la gente. Es el estado de hoy.

---

## Lo que sí se verificó

La parte que importa y que no necesita a Sentry: **qué sale de Wasipe**.

Un registro de errores es un lugar donde los datos personales se quedan
**para siempre**. Lo ve todo el equipo, se exporta, se indexa, y borrarlo
una vez que entró es casi imposible. Así que se limpia a la salida, antes
de mandar, y se limpia de más.

14 pruebas en `tests/unidad/observabilidad.test.ts`, todas verdes.

| Qué NO puede salir | |
|---|---|
| Contraseñas de un formulario | ✅ |
| Cookies enteras | ✅ |
| Cabeceras, incluida `authorization` | ✅ |
| Un correo metido en la dirección | ✅ |
| Teléfonos | ✅ |
| Coordenadas exactas de una propiedad | ✅ |
| La clave de servicio | ✅ |
| Lo que quedó en las migas de pan | ✅ |
| Del usuario, todo salvo el identificador | ✅ |

| Qué SÍ sale | |
|---|---|
| El mensaje del error y su traza | ✅ |
| La ruta donde ocurrió | ✅ |
| El código del aviso, para poder reproducir | ✅ |
| El entorno y la versión del código | ✅ |

Y lo que se descarta por ruido: los errores de extensiones del navegador y
el `ResizeObserver loop`. No son fallos de Wasipe y llenan el registro
hasta que los errores de verdad no se ven.

### Un detalle del diseño que vale la pena

La limpieza está en su propia función (`limpiarEvento`) y aparte del
interruptor (`antesDeEnviar`). Al principio estaban juntas, y eso hacía
que la limpieza —que es la que protege a las personas— solo se pudiera
probar teniendo Sentry conectado.

Son dos decisiones distintas: «¿mandamos algo?» y «¿qué le sacamos?». La
segunda ahora se prueba siempre.

### Dos decisiones que conviene revisar

**`sendDefaultPii: false`.** Varias plantillas de Sentry lo traen en
`true`: manda la dirección IP y el correo sin que nadie lo pida.

**La repetición de sesión está apagada.** Graba la pantalla de la persona,
y en un portal inmobiliario eso incluye su nombre, su teléfono y la
dirección de su casa mientras publica un aviso. Si algún día se enciende,
tiene que ser con enmascarado de todos los campos y dicho en la política
de privacidad.

### Muestreo

| Qué | Cuánto | Por qué |
|---|---|---|
| Errores | 100 % | Si algo falló, hay que verlo |
| Trazas de rendimiento | 10 % en producción | Son continuas y ahí se va la cuota |

---

## Lo que NO se verificó

**Que un error llegue de verdad a Sentry.** Eso hay que verlo en Sentry, y
no hay proyecto.

Sin ejecutar, y por eso sin marcar:

- Generar un error controlado
- Confirmar que aparece en el panel
- Confirmar que trae entorno, versión, ruta y una traza útil
- Confirmar que no trae secretos — probado en el código, no en el panel
- Retirar la ruta que provoca el error

**No se creó la ruta de error de prueba.** Una ruta que revienta a
propósito, desplegada y sin proteger, es una forma cómoda de que alguien
llene el registro. Se crea cuando haya DSN, se usa una vez, y se borra en
el mismo commit.

---

## Lo que falta después de conectar

| | Qué | Por qué |
|---|---|---|
| ⬜ | Alerta cuando la tasa de error suba | Sin alerta, Sentry es un archivo que nadie abre |
| ⬜ | **Comprobación de estado externa** | Sentry no avisa si el sitio no responde |
| ⬜ | Source maps | Sin ellos la traza apunta a código comprimido |
| ⬜ | Retención acorde a la Ley 29733 | Un registro con datos de personas no se guarda para siempre |

El segundo es el hueco más grande, y conviene entenderlo bien: **una caída
completa no genera ningún evento**. Si el servidor no responde, no hay
nadie que mande el error. Sentry sirve para los fallos *dentro* de una
aplicación que funciona; para saber que dejó de funcionar hace falta algo
que pregunte desde afuera.

---

## Ejecución — sprint 22 · 6 de setiembre de 2026

**Estado: SIN VERIFICAR. Sentry no está configurado en Vercel.**

El proyecto `wasipe-web` puede existir en Sentry, pero **no hay ninguna
variable de Sentry en el proyecto de Vercel**, ni en Preview ni en
Production. Comprobado con `vercel env ls`: las nueve variables del
Preview son las de Supabase, la aplicación, los adaptadores de IA y el
interruptor de pagos. Ninguna de Sentry.

Sin `NEXT_PUBLIC_SENTRY_DSN`, Sentry **no se inicializa**: ni una
petición, ni peso extra en el paquete. Es el comportamiento previsto y
está probado, pero significa que el Preview hoy **no reporta nada**.

Queda sin verificar, y hay que decirlo entero:

| Qué | Estado |
|---|---|
| El evento llega a Sentry | ⬜ sin verificar |
| Entorno `staging` | ⬜ sin verificar |
| Sin cookies, contraseñas, teléfonos, correos ni coordenadas | ⬜ **sin verificar contra un evento real** |

Sobre el último punto, para que no se lea de más: hay **14 pruebas de
unidad** que comprueban el filtrado sobre eventos construidos a mano, y
siguen en verde. Lo que no existe es la comprobación sobre un evento que
haya viajado de verdad hasta Sentry, que es lo que este sprint pedía.

Para desbloquearlo hace falta, en Vercel → wasipe → Environment
Variables, ámbito **Preview**:

    NEXT_PUBLIC_SENTRY_DSN     el DSN del proyecto wasipe-web

Y opcionalmente, para que las trazas no salgan minificadas:

    SENTRY_ORG · SENTRY_PROJECT · SENTRY_AUTH_TOKEN
