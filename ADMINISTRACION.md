# Administración, moderación y confianza

Cómo se decide, quién decide y qué queda escrito cuando Wasipe toca el
aviso de alguien. Es el documento que hay que leer antes de nombrar a la
primera persona del equipo.

---

## 1. Los cuatro puestos

El puesto va **aparte del rol de la cuenta**. Una persona puede ser
propietaria —publicar su departamento, recibir consultas— y además
moderadora. Mezclarlos obligaría a que quien modera deje de poder usar el
producto, y eso termina en cuentas compartidas.

| Puesto | Qué ve | Qué no ve |
|---|---|---|
| `moderator` | Avisos, banderas, imágenes de Wasi AI, denuncias, inmobiliarias | Pagos, créditos, destacados |
| `support` | Cuentas | Denuncias, plata, moderación |
| `finance` | Pagos, créditos, destacados, costos de Wasi AI | Denuncias, avisos por revisar |
| `super_admin` | Todo, incluido nombrar y quitar personal | — |

La separación no es desconfianza. Es que el dato personal de alguien no
tiene por qué pasar por más manos de las necesarias (Ley 29733). Quien
modera un aviso no necesita ver una tarjeta; quien lleva finanzas no
necesita leer una denuncia con nombre y apellido.

Los puestos viven en `staff_members (user_id, role)`. Una persona puede
tener más de uno; los permisos se suman. `super_admin` los tiene todos sin
listarse.

**Solo `super_admin` escribe en esa tabla**, y la política de la base dice
lo mismo que el servidor: un moderador que llame a la tabla directo choca
con RLS.

---

## 2. Las tres capas de autorización

Cada una funciona sola. Ninguna depende de la anterior.

1. **El middleware** manda a `/ingresar` a quien no tiene sesión. Es
   comodidad: evita pintar una pantalla vacía.
2. **El guardia del servidor** (`lib/auth/personal.ts`, `import 'server-only'`)
   comprueba el puesto antes de consultar nada. `requiereSeccionDeAdmin()`
   redirige a `/panel?aviso=sin-permiso`; `requierePuesto()` es lo que
   abre cada acción.
3. **RLS y las funciones de la base** son la defensa de verdad. Aunque
   alguien se saltara las dos anteriores con la llave pública en la mano,
   `revisar_aviso()` levanta excepción si quien llama no es moderador.

Una prueba estática recorre `app/(dashboard)/panel/admin/**` y falla si
alguna pantalla no llama a un guardia, y otra falla si alguna función
exportada de `features/admin/acciones.ts` no empieza con
`await requierePuesto(...)`.

---

## 3. Las cuatro decisiones

`revisar_aviso(p_property_id, p_decision, p_motivo)` es el **único** camino
para mover el estado de publicación de un aviso desde moderación. No hay
un `update` suelto en ninguna parte del código.

| Decisión | El aviso queda | ¿Motivo? |
|---|---|---|
| `approve` | `published` | No |
| `request_changes` | `draft` | Sí, ≥ 10 caracteres |
| `reject` | `rejected` | Sí, ≥ 10 caracteres |
| `pause` | `paused` | Sí, ≥ 10 caracteres |

**Pedir cambios devuelve el aviso a borrador**, que es el único estado
desde el que la persona puede corregirlo y reenviarlo sin perder nada.

El mínimo de 10 caracteres está en tres sitios y los tres tienen que estar
de acuerdo: la restricción `decision_con_motivo` de `listing_reviews`, la
excepción dentro de la función, y `MOTIVO_MINIMO` en el navegador. Un «no
cumple» de nueve letras deja a la persona sin saber qué corregir y a
Wasipe sin poder defender la decisión si reclama.

En la interfaz el motivo va **antes** que los botones, y cada botón está
apagado hasta que el motivo alcanza. No se puede rechazar de un clic.

### Lo que ve quien publicó

El motivo se copia a `properties.rejection_reason` y sale en
`/panel/mis-propiedades`, con un encabezado distinto según lo que pasó:
«Por qué se rechazó», «Qué hay que corregir», «Por qué lo pausamos». Un
aviso devuelto a borrador no es un rechazo, y pintarlo del mismo rojo hace
que la persona lo baje en vez de arreglarlo.

---

## 4. Todo queda escrito

Dos libros, los dos inmutables:

- **`listing_reviews`** — cada decisión sobre un aviso: quién, cuándo, qué
  decidió y por qué.
- **`audit_logs`** — toda acción sensible de administración, ya existía
  desde el sprint 8 y ahora la escriben también `revisar_aviso()`,
  `verificar_anunciante()` y `resolver_bandera()`.

Un disparador `before update or delete` sobre las dos tablas levanta
excepción:

```
La bitácora de auditoría no se edita ni se borra
```

No es una política de RLS: es un disparador. Una política se puede
desactivar con la llave de servicio; el disparador corre igual. Ni siquiera
el dueño de la base puede editar una línea sin borrar el disparador
primero, y eso deja rastro en las migraciones.

La escritura pasa siempre por `registrar_auditoria()`, en la **misma
transacción** que el cambio. Un aviso rechazado sin su línea de bitácora
no puede existir: si falla una, se cae la otra.

---

## 5. Las banderas no deciden

`marcar_aviso(p_property_id)` corre tres comprobaciones y pone las
banderas que correspondan. Devuelve cuántas puso.

| Bandera | Cómo se calcula | Qué mirar |
|---|---|---|
| `duplicate` | `similarity()` sobre el título + mismo distrito + área parecida | Puede ser el mismo inmueble, o dos departamentos parecidos del mismo edificio, que es normal |
| `suspicious_price` | Contra `market_stats`, y solo si la muestra alcanza | Casi siempre es un cero de más o la moneda equivocada |
| `repeated_image` | Misma `image_hash` en otro aviso | Puede ser la misma inmobiliaria republicando, o una foto sacada de internet |
| `manual` | Alguien del equipo lo marcó | El motivo está en el detalle |

**Una bandera no despublica nada y no le llega a quien publicó.** Es una
señal para que una persona mire. Automatizar la baja por un puntaje sería
castigar a quien publicó dos departamentos parecidos en el mismo edificio.
Ese texto está en `LAS_BANDERAS_NO_DECIDEN` y se muestra en la pantalla,
no solo en este documento.

Un índice único parcial impide dos banderas abiertas del mismo tipo sobre
el mismo aviso, así que volver a marcar no ensucia la cola.

Cerrar una bandera (`resolver_bandera`) exige una nota de al menos 5
caracteres, por restricción de la tabla. Sin la nota, la cola de banderas
se convierte en un botón de «descartar» que nadie puede auditar.

`precio_sospechoso()` **exige que el índice de mercado tenga muestra
suficiente**. Sin eso marcaría por caro cualquier departamento de un
distrito con cuatro avisos.

---

## 6. Lo que no sale del servidor

- La lista de personas **no pide `phone`, `email` ni `whatsapp`**. Soporte
  necesita el teléfono cuando atiende un caso puntual, no en una lista de
  doscientas cuentas.
- La lista de denuncias **no muestra `reporter_id`**. Con el nombre a la
  vista, nadie vuelve a denunciar el aviso de su vecino.
- Ningún componente de cliente consulta `profiles`, `staff_members`,
  `audit_logs`, `moderation_flags`, `listing_reviews`, `subscriptions`,
  `credit_transactions` ni `reports`. Hacerlo pondría los datos —y la
  forma de pedirlos— dentro del paquete de JavaScript.

Las tres cosas las vigila una prueba que lee el código fuente, no una
convención escrita en un documento.

---

## 7. Qué falta

- `/panel/admin/ia`, `/panel/admin/pagos`, `/panel/admin/creditos` y
  `/panel/admin/destacados` están declaradas en `SECCIONES` con
  `construida: false`. Aparecen apagadas en la portada, con el motivo a la
  vista, en vez de ser enlaces rotos.
- `image_hash` es una columna nueva y **está vacía**: nada la llena
  todavía. La bandera `repeated_image` funciona, pero no encuentra nada
  hasta que el flujo de subida calcule la huella.
- Nada de esto se ha ejecutado contra un proyecto de Supabase real. Todo
  lo que dice este documento está probado contra PGlite corriendo las
  migraciones de verdad, que es lo más cerca que se llega sin proyecto.
