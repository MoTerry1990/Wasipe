# Wasi AI

Cómo está construida la inteligencia artificial de Wasipe y por qué está
construida así.

---

## 1. Wasipe no está atado a ninguna empresa de IA

Todo lo que el producto le pide a un modelo cabe en una interfaz de tres
miembros, `lib/ia/proveedor.ts`:

```ts
type ProveedorDeIA = {
  nombre: string;
  disponible(): boolean;
  generarTexto(peticion: PeticionDeTexto): Promise<RespuestaDeTexto>;
};
```

Ningún otro archivo del proyecto sabe qué empresa hay detrás. Los
adaptadores viven en `lib/ia/proveedores/` y se eligen con una variable
de entorno:

```
IA_PROVEEDOR=anthropic     # el que hay hoy
IA_PROVEEDOR=ninguno       # apaga Wasi AI a propósito
```

**Agregar un proveedor** es escribir un archivo en `lib/ia/proveedores/`
que devuelva un `ProveedorDeIA` y sumar una línea al mapa de
`lib/ia/registro.ts`. No se toca ninguna pantalla, ninguna acción de
servidor ni ninguna migración.

`lib/ia/asistente.ts` —las instrucciones, las prohibiciones, el formato
de la respuesta— está deliberadamente del lado del producto, no del
proveedor: las reglas de Wasipe no cambian si mañana se cambia de
empresa.

### Falla con elegancia

Sin proveedor configurado, sin clave, con un `IA_PROVEEDOR` inventado o
con el proveedor caído, pasa siempre lo mismo: la tarjeta de Wasi AI
aparece apagada, con su explicación, y publicar a mano sigue funcionando
exactamente igual. Nunca hay una pantalla rota ni un error en inglés.

### Las claves se quedan en el servidor

`ANTHROPIC_API_KEY` se lee dentro de su adaptador, que empieza con
`import 'server-only'`. Ninguna variable de IA lleva el prefijo
`NEXT_PUBLIC_`. Hay pruebas estáticas que lo vigilan
(`tests/unidad/ia.test.ts`): si alguien importa un adaptador desde un
componente de cliente, o nombra la clave fuera de su archivo, la prueba
falla antes de que llegue a producción.

---

## 2. Lo que el asistente NO puede afirmar

Wasi AI redacta con los datos que la persona cargó en el formulario y
nada más. Seis prohibiciones van escritas en las instrucciones del
modelo, y cada una tiene su prueba:

| Prohibido inferir       | Por qué                                                   |
| ----------------------- | --------------------------------------------------------- |
| Titularidad legal       | «Saneado», «título inscrito», «libre de gravámenes» son afirmaciones registrales. Nadie las verificó. |
| Estado estructural      | Decir «en buen estado» o «sin humedad» de una foto es adivinar sobre algo que se paga caro. |
| Medidas exactas         | Solo se usan las áreas que la persona escribió. No se estiman ni se convierten. |
| Seguridad de la zona    | «Zona tranquila» es un juicio, y además discrimina distritos. |
| Licencias y permisos    | Licencia de construcción, conformidad de obra y declaratoria de fábrica los emite la municipalidad. |
| Comodidades no declaradas | Ascensor, piscina o cochera solo aparecen si están en la lista que la persona marcó. |

Al modelo tampoco se le manda la dirección exacta, la referencia ni el
celular: no aportan a la redacción y son datos personales (Ley 29733,
principio de minimización). Lo mismo vale para lo que se archiva en
`ai_jobs.input`.

---

## 3. Nada se publica sin confirmación

El asistente **propone**; la persona **decide**. El texto sugerido se
muestra aparte, nunca encima de lo que se escribió, con su aviso a la
vista. Hay que apretar «Usar este texto» para que entre al formulario, y
ese clic es lo que queda registrado.

En la base, `ai_jobs.accepted_at` nace en NULL y solo lo llena
`aceptar_trabajo_ia()`, que exige que el trabajo sea propio, esté en
`succeeded` y no haya sido descartado. La restricción
`aceptado_solo_si_exitoso` impide aceptar un trabajo que nunca corrió.

Y aun después de aceptado, el texto es solo un borrador: el aviso sigue
pasando por revisión antes de publicarse, como cualquier otro.

---

## 4. El ciclo de un pedido

```
iniciar_trabajo_ia()   →  proveedor.generarTexto()  →  terminar_trabajo_ia()
   cupo, saldo,            la única llamada a          resultado + cobro
   idempotencia            una empresa de IA         (o fallar_trabajo_ia)
```

Las tres funciones de la base son `SECURITY DEFINER` y están en
`supabase/migrations/20260821080000_asistente_ia.sql`.

**Un trabajo que falla no cobra.** El descuento ocurre recién en
`terminar_trabajo_ia()`, dentro de la misma transacción que guarda el
resultado: o quedan las dos cosas o no queda ninguna. Además la
restricción `fallo_no_cobra` impide que exista en la base un trabajo
`failed` o `canceled` con costo distinto de cero.

**Un pedido repetido es un solo trabajo.** `huellaDelPedido()` arma una
clave con la operación y los datos que se le mandan al modelo; el índice
único `ai_jobs_idempotencia_idx` la respeta. Dos clics seguidos en el
mismo botón devuelven el mismo trabajo, y si ya había terminado, devuelve
el texto guardado sin volver a llamar al proveedor.

**El navegador no escribe resultados.** El disparador
`ai_jobs_resultado_protegido` rechaza cualquier cambio de `status`,
`output`, `error`, `provider`, `model`, `cost_credits`, `input`, `kind`,
`operation` o `duration_ms` hecho con un token de `authenticated`. Lo
único que la persona puede tocar de su propio trabajo es aceptarlo o
descartarlo. Por eso `terminar_trabajo_ia()` y `fallar_trabajo_ia()` solo
se pueden ejecutar con la clave de servicio.

**Uso limitado.** `LIMITE_POR_HORA` (20) se aplica por persona con
`consumir_cupo()`, la misma función que limita el resto del portal.
Pasarse levanta una excepción con el mensaje ya escrito en castellano.

**Todo queda medido.** Cada trabajo guarda proveedor, modelo, operación,
costo en créditos, duración del proveedor, error si lo hubo, y las marcas
de aceptado o descartado.

---

## 5. Qué está construido y qué no

| Función                     | Estado                                                |
| --------------------------- | ----------------------------------------------------- |
| Redacción del aviso (título, descripción, mejorar) | Construida. Nunca corrió contra un proveedor real: falta la clave y falta el proyecto de Supabase. |
| Mejora de fotos             | No empezada                                           |
| Ambientación virtual        | No empezada                                           |
| Video automático            | No empezada                                           |
| Estimación de precio        | No empezada                                           |
| Búsqueda en lenguaje natural| No empezada                                           |

La página pública `/wasi-ai` dice exactamente esto. Mientras la
redacción no se haya probado end to end contra un proveedor de verdad,
aparece marcada «En pruebas», no «Disponible».
