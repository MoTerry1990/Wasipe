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
IA_PROVEEDOR=anthropic          # texto: el que hay hoy
IA_PROVEEDOR=ninguno            # apaga la redacción a propósito

IA_PROVEEDOR_IMAGEN=http        # fotos: cualquier endpoint HTTP
IA_PROVEEDOR_IMAGEN=ninguno     # apagado (por defecto)

IA_PROVEEDOR_VIDEO=http         # video: API externa, Remotion o ffmpeg propio
IA_PROVEEDOR_VIDEO=ninguno      # apagado (por defecto)
```

**Los tres se eligen por separado**, porque casi nunca es la misma empresa
la que mejor escribe en castellano, la que mejor amuebla una sala y la que
mejor renderiza video. Que uno esté configurado y los otros no es normal y
no rompe nada.

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

| Función | Estado |
| --- | --- |
| Redacción del aviso (título, descripción, mejorar) | Construida. Nunca corrió contra un proveedor real: falta la clave y falta el proyecto de Supabase. |
| Mejora de fotos (luz, color, perspectiva, resolución, orden) | Construida. Mismo caso: falta el endpoint del proveedor. |
| Ambientación virtual (amoblar, estilo, color de pared) | Construida. Mismo caso. |
| Video automático (3 formatos, 4 plantillas, narración) | Construida. Mismo caso. |
| Evaluación de precio e índice por m² | Construida y funcionando **sin proveedor de IA**: es estadística sobre la base. |
| Búsqueda conversacional (frase → filtros) | Construida y funcionando **sin proveedor de IA**: el parser local no lo necesita. |
| Comparación y recomendación | Construida y funcionando sin proveedor: es aritmética sobre los datos de la base. |

La página pública `/wasi-ai` dice exactamente esto. Mientras algo no se
haya probado end to end contra un proveedor de verdad, aparece marcado
«En pruebas», no «Disponible».


---

# Fotos: mejora y amoblamiento virtual

## 6. Ocho herramientas y ni una más

`lib/ia/imagenes.ts` tiene el catálogo completo. Es cerrado a propósito: el
enumerado `media_edit_kind` de la base tiene los mismos ocho valores, así
que agregar una novena operación obliga a pasar por una migración que
alguien tenga que leer.

| Clave | Qué hace | Créditos |
| --- | --- | --- |
| `lighting` | Luz: sombras y zonas quemadas | 1 |
| `white_balance` | Color: quita la dominante de la luz artificial | 1 |
| `perspective` | Endereza verticales sin agrandar el ambiente | 1 |
| `upscale` | Más resolución, sin inventar detalle | 2 |
| `declutter` | Quita objetos personales **movibles** | 2 |
| `wall_color` | Cómo quedaría pintado | 2 |
| `style` | Otra decoración sobre el mismo ambiente | 3 |
| `staging` | Amoblado virtual de un ambiente vacío | 4 |

Las cuatro últimas muestran algo que no existe, así que llevan otra
etiqueta. Ver la sección 9.

## 7. Las seis prohibiciones de las fotos

`REGLAS` viaja en **todas** las peticiones, sin importar qué se haya
pedido. Cada una tiene su prueba en `tests/unidad/imagenes.test.ts`:

| Prohibido | Por qué |
| --- | --- |
| Reparar, cubrir o disimular daños (humedad, moho, rajaduras, filtraciones) | Es el engaño que más caro le sale a quien compra. |
| Agregar, quitar o agrandar ambientes, ventanas, puertas, escaleras | La cantidad y la posición son las que son. |
| Cambiar dimensiones o proporciones | Nada de lente ancho ni de estirar para que se vea más grande. |
| Tocar lo que se ve por la ventana o fuera del inmueble | El vecino, la calle, los postes y los cables quedan tal cual. |
| Agregar instalaciones permanentes que no existen | Salvo que se haya pedido una visualización, y esa lleva su etiqueta. |
| Meter personas, mascotas, marcas de agua, logos o texto | |

Y el cierre: *«si lo que se te pide choca con alguna de estas reglas,
devuelve la imagen sin cambios»*. Una foto sin mejorar es mejor que una
foto que miente.

## 8. La foto original no se toca. Nunca.

Cuatro cerrojos, en cuatro capas distintas:

1. **Storage.** La política de UPDATE de la cubeta `avisos` excluye la
   subcarpeta `original/`, igual que la de DELETE desde el sprint 8. No se
   sobrescribe ni se borra, ni desde la aplicación ni hablando directo con
   la API de storage.
2. **La fila.** El disparador `property_media_original_protegido` rechaza
   cualquier cambio de `original_storage_path` una vez puesto, y rechaza
   convertir un original en edición.
3. **La llave foránea.** `original_media_id` pasó de `on delete set null` a
   `on delete restrict`: borrar la original dejaría a la edición huérfana y
   sin con qué comparar.
4. **El destino.** Lo que sale de la IA se sube a `avisos/<aviso>/ia/…`,
   una carpeta aparte. Nunca a la ruta de una foto que ya existe.

Una edición **agrega** una fila; no reemplaza ninguna. Va al final del
orden y nunca de portada.

## 9. La etiqueta, otra vez generada por la base

`property_media.ai_label` es una columna generada con dos textos:

```sql
case
  when is_staged then 'Amoblamiento virtual — imagen referencial'
  when ai_edited then 'Imagen modificada con Wasi AI'
  else null
end
```

Ninguna vista puede olvidarse de pintarla, y no se puede escribir a mano:
Postgres rechaza el UPDATE. La restricción `edicion_declara_que_hizo`
además impide que exista una imagen editada que no diga **qué** se le hizo.

## 10. Antes y después, y las tres vistas

- **Quien publica** ve el comparador (`features/wasi-ai/comparador.tsx`)
  antes de decidir: dos imágenes superpuestas y una línea que se arrastra.
  El control es un deslizador nativo invisible, no un gestor de arrastre:
  así funciona con el dedo, con el teclado y con lector de pantalla, y no
  pelea con el desplazamiento de la página en un teléfono.
- **Quien mira el aviso** no ve la misma sala tres veces: las versiones se
  agrupan con su original y aparece un selector **Original · Mejorada ·
  Amoblada** (`agruparVariantes()`, probado aparte de la interfaz). La
  etiqueta de la versión elegida se pinta siempre.

## 11. Confirmación, cola y revisión de imágenes

**Confirmar es obligatorio.** `adjuntar_foto_editada()` exige que el
trabajo esté en `succeeded`, sea de quien lo pide y **ya tenga
`accepted_at`**. Y por si alguien intentara insertar la fila a mano —la
política de `property_media` es `FOR ALL`— el disparador
`property_media_edicion_confirmada` exige lo mismo.

**Reintentos.** `ai_jobs` lleva `attempts` / `max_attempts` (3 por
defecto); el contador lo lleva la base con un disparador, no quien llama.
`reintentar_trabajo_ia()` devuelve NULL cuando se acabaron, y el editor lo
dice con todas sus letras en vez de reintentar para siempre. Una negativa
de moderación del proveedor (HTTP 422) **no** se reintenta: diría lo
mismo. Ningún intento fallido cobra.

**Costo real.** `ai_jobs.provider_cost_micros` y
`property_media.provider_cost_micros` guardan lo que costó en el proveedor,
en millonésimas de dólar, aparte de `cost_credits`, que es lo que se le
cobró a la persona.

**Revisión de seguridad.** Toda imagen generada nace en `pending`.
Moderación la revisa en `/panel/moderacion/imagenes`, viendo el original al
lado, y puede dejarla pasar, observarla o retirarla —con motivo obligatorio
en los dos últimos casos—. **Retirar no borra**: la fila y el archivo se
quedan, la imagen deja de verse para el público, y quien publica ve en su
panel que fue retirada y por qué. Si mañana hay un reclamo, la prueba está.

---

# Video automático del aviso

## 12. Tres contratos, no uno

`lib/ia/proveedor.ts` tiene tres interfaces independientes, y el video es
la más distinta de las tres. Renderizar tarda minutos, así que no es
«pide y espera»:

```ts
type ProveedorDeVideo = {
  encolar(peticion): Promise<{ referencia: string }>;
  consultar(referencia): Promise<EstadoDeRender>;
  cancelar?(referencia): Promise<void>;
};
```

Esa forma es la que tienen por igual **una API externa de render**, **un
servidor propio con Remotion** y **una máquina nuestra con ffmpeg detrás
de un proceso web**. Por eso el adaptador que se incluye —`video-http`—
sirve para los tres: el contrato HTTP está documentado en
`lib/ia/proveedores/video-http.ts` y quien quiera enchufar lo suyo pone
un proceso delante que lo hable.

## 13. Formatos y zonas seguras

| Formato | Píxeles | Para | Margen inferior seguro |
| --- | --- | --- | --- |
| Vertical 9:16 | 1080×1920 | Historias, Reels, TikTok | 420 px |
| Cuadrado 1:1 | 1080×1080 | Feed | 110 px |
| Horizontal 16:9 | 1920×1080 | YouTube, web | 90 px |

El margen inferior del vertical es enorme a propósito: TikTok e Instagram
pintan el nombre de la cuenta, la descripción y los botones **encima** del
video. Un precio que cae ahí queda tapado justo en el formato que más se
comparte. `textoEntraEnZonaSegura()` lo comprueba, y hay una prueba por
cada formato y cada plantilla.

En el estudio, la previa dibuja esa zona en proporción exacta: si un texto
se sale del recuadro punteado en pantalla, se sale también en el video.

## 14. Cuatro plantillas

| Plantilla | Duración por foto | Narración | Créditos |
| --- | --- | --- | --- |
| Mínima | 3 s | No | 5 |
| Reel rápido | 1,6 s | No | 6 |
| Moderna | 3 s | Sí | 8 |
| Premium | 4 s | Sí | 12 |

## 15. La cámara no recorre el inmueble

Es la prohibición de este sprint, y es de la misma familia que las seis de
las fotos. Un recorrido continuo entre fotos sueltas insinúa una
distribución que nadie verificó: que la cocina da a la sala, que hay un
pasillo ahí. Por eso:

- Los únicos movimientos permitidos son `fijo`, `acercar` y `alejar`,
  **dentro de una misma foto**.
- El acercamiento tiene tope duro: `ACERCAMIENTO_MAXIMO = 1.06`. Un 6%
  alcanza para que la imagen no se sienta congelada y no alcanza para
  insinuar que alguien está caminando.
- `MOVIMIENTOS_PROHIBIDOS` enumera lo que no se hace —recorridos,
  paneos, parallax 3D, transiciones de «atravesar una puerta»— y la
  pantalla se lo muestra a quien publica, con el motivo.

## 16. La narración no puede mentir

No hay un modelo escribiendo la narración: `armarNarracion()` rellena una
plantilla con los campos del aviso. Cada frase se rastrea a una columna, y
un dato que falta simplemente no aparece — nunca se rellena con una
suposición. No hay adjetivos de venta: ni «excelente ubicación», ni «zona
tranquila», ni «oportunidad única». Una prueba comprueba que **toda cifra
de la narración está entre las del aviso**.

Como `armarGuion()` es determinista, la **vista previa** que se ve antes
de gastar un crédito no es una aproximación: es el mismo guion que va a
recibir quien renderiza.

## 17. Reserva, devolución, cancelación

Renderizar tarda minutos, así que cobrar al final no sirve: dos pedidos en
paralelo con saldo para uno solo se colarían los dos.

```
reservar_creditos_ia()   →  encolar  →  terminar_trabajo_reservado()
   movimiento negativo        …             la reserva se convierte
   real en el libro mayor                   en costo, sin cobrar otra vez

                falla o cancelación
                          ↓
              devolver_creditos_ia()   ← movimiento positivo
```

- El libro mayor sigue siendo de **solo inserción**: la historia queda
  legible como «reserva» y luego «devolución», sin editar ni borrar nada.
- `devolver_creditos_ia()` es **idempotente**: toma la fila con
  `for update` y pone la reserva en cero en la misma transacción.
- La restricción `sin_reserva_al_cerrar` impide que exista en la base un
  trabajo cerrado que se quedó con la reserva: eso sería un cobro
  silencioso.
- **Cancelar devuelve todo.** Un render a medias no se cobra: lo que se
  lleva la persona es nada.
- `avanzar_trabajo_ia()` sube el progreso y **nunca lo baja**.

## 18. Descarga autorizada y vencimiento

La cubeta `videos` es **privada**. No hay URL pública que reenviar: el
archivo se entrega con un enlace firmado de 5 minutos, y solo después de
que `registrar_descarga_de_video()` diga que sí. Esa función exige tres
cosas a la vez: que el video esté listo, que no haya vencido, y que quien
lo pide administre el aviso.

Los videos **caducan a los 90 días**. Un video con el precio de hace medio
año circulando por WhatsApp es un problema, y no se puede recuperar del
teléfono de nadie — pero sí se puede dejar de repartir. `vencer_videos()`
los marca; borrar el archivo es cosa de la tarea programada, separada a
propósito para que marcar sea barato y borrar pueda reintentarse.

Cada render guarda además `facts`: lo que el video decía, congelado. El
aviso puede cambiar de precio después; el archivo ya salió. Guardar lo que
decía es lo único que permite, meses más tarde, responder «el aviso cambió
el 3 de setiembre, el video es de antes».


---

# Comprar: buscar hablando y comparar

## 19. La IA no devuelve avisos

Es la regla que ordena el sprint entero, y no es una política: es una
decisión de arquitectura que hace imposible el problema.

```
frase en castellano  →  filtros  →  Postgres  →  avisos
                        ↑
                   acá termina la IA
```

Un modelo que redacta resultados inventa direcciones, precios y
distritos: no porque falle, sino porque eso es lo que hace un modelo de
lenguaje. Uno que solo arma un `WHERE` no puede inventar nada, porque no
es él quien devuelve las filas. Por eso en este sprint no hay índice
vectorial ni caché de avisos para la IA.

## 20. Dos intérpretes, una sola puerta

`interpretarLocal()` corre **siempre**. Es un parser en castellano
peruano —distrito, tope de precio, dormitorios, cochera, mascotas, sellos—
que no necesita proveedor, no cuesta nada y responde al instante. Cubre lo
que la gente realmente escribe.

El modelo, cuando está configurado, solo completa lo que el parser dejó
vacío. Y manda el parser: es determinista y no se equivoca en lo que ya
sabe leer.

Venga de donde venga, todo pasa por `validarFiltros()`, que **es el mismo
esquema Zod que valida la URL**. Un `precioMax` negativo, un `dorm` de
9999 o un `{"ownerEmail": "..."}` se caen solos y el resto de los filtros
sobrevive. La IA no tiene una puerta propia más ancha que la de un enlace
pegado a mano.

## 21. Se muestra lo entendido, y se corrige

Nunca se salta directo a los resultados. Antes se pintan los filtros en
castellano —`Distrito: Jesús María · Hasta: US$ 150,000 · Dormitorios: 2 o
más`— y cada uno se quita con un toque. Si entendimos mal, se ve de
inmediato; y si estaba bien, la persona confirma lo que va a buscar.

## 22. Vivienda y discriminación

Un portal que deja filtrar por nacionalidad, religión o si hay niños en la
casa no está dando una función: está organizando una exclusión. En el Perú
eso choca con el artículo 2.2 de la Constitución, con la Ley 28983 de
igualdad de oportunidades y con la Ley 29973 sobre discapacidad.

`CATEGORIAS_PROTEGIDAS` cubre seis: origen y raza, religión, composición
familiar, discapacidad, sexo y orientación, edad. Con tres refuerzos:

1. **No existe el filtro.** El esquema no tiene una clave para eso, así
   que ni el modelo ni un enlace armado a mano pueden crear una.
2. **Se detecta y se explica.** La frase se revisa antes de traducirla, y
   si trae una categoría protegida se dice cuál no se puede usar. **No se
   corta la búsqueda**: se ignora esa parte y se busca con el resto.
   Cortar del todo castigaría a quien escribió una palabra sin mala
   intención.
3. **Las instrucciones del modelo lo prohíben aparte**, y la recomendación
   tiene su propia lista (`NUNCA_EN_UNA_RECOMENDACION`), porque una
   recomendación es donde más fácil se cuela: basta una frase sobre «el
   tipo de gente del barrio».

## 23. Comparar cuatro

`comparar_avisos()` devuelve una fila por aviso **publicado y
disponible**. Un código inventado, uno pausado o uno ya vendido
simplemente no vuelve — la aplicación no tiene forma de agregar una fila a
esa lista.

Se comparan precio, área, precio por m², mantenimiento, dormitorios,
baños, cocheras, antigüedad, promedio del distrito, verificación y las
características declaradas. Los precios se comparan **en dólares**
(`price_usd`): uno en soles y otro en dólares no se comparan por el número
crudo.

Dos detalles que importan:

- **El promedio del distrito no marca ganador.** Un distrito más caro no
  es peor, es otro.
- **Una fila de característica solo aparece si alguno la tiene.** Una fila
  de «— · — · —» ocupa espacio y no ayuda a decidir nada.

## 24. La recomendación es una cuenta, no una opinión

Tampoco la escribe un modelo. `recomendar()` es una suma ponderada de los
mismos números, con las prioridades que la persona eligió, en escala
relativa a los avisos comparados: no existe un «buen precio» absoluto,
existe el más barato de estos cuatro.

- **Sin prioridades elegidas no hay recomendación.** Elegir por la persona
  cuál es su prioridad sería exactamente la opinión que esto evita.
- **Un empate no se desempata a dedo.** «Cualquiera de los dos» es más
  útil que elegir uno por el orden de carga.
- La pantalla separa tres bloques: los **hechos** (contrastables uno por
  uno con la tabla), lo que la comparación **no dice** (calidad de la
  construcción, estado real, gastos no declarados) y la **cuenta** con los
  puntajes a la vista.


---

# Mercado: precio por m², evaluación e historial

## 25. La cifra que no se publica

Este es el diferenciador del producto y, por lo mismo, el archivo donde
más fácil se pierde la confianza. Una cifra publicada sin sustento vale
menos que no publicar nada, así que la mitad del código y de las pruebas
sirve para **no** decir algo.

Cuatro reglas, y las cuatro viven en la base:

1. **Solo entran avisos publicados y disponibles.** Un aviso rechazado,
   pausado, vencido o ya vendido no representa el mercado de hoy. La regla
   está escrita una sola vez, en la vista `avisos_para_mercado`.
2. **Los atípicos quedan fuera**, con vallas intercuartílicas de Tukey
   (Q1 − 1.5·RIC, Q3 + 1.5·RIC). Es el criterio estándar y, sobre todo, es
   explicable: se puede decir cuántos avisos se dejaron fuera y por qué.
3. **Debajo de cinco avisos no se publica un número.** La fila existe con
   `sufficient = false` —para poder decir cuántos hay— pero la pantalla
   muestra «Pocos datos», no un promedio de dos.
4. **Todo agregado dice de cuántos avisos sale, cuándo se calculó y con
   qué tipo de cambio se normalizó.** Sin esas tres cosas la cifra no se
   puede reproducir, y una cifra que no se puede reproducir no es un dato.

`market_stats` es una tabla y no una vista a propósito: una vista siempre
parece fresca aunque los datos tengan un mes.

## 26. Los cortes

Cada distrito se calcula por **operación** (venta / alquiler), por **tipo
de propiedad** (más el corte «todos los tipos») y por **período** (3
meses, 6 meses, 1 año, todo). Un aviso pertenece a todos los períodos que
lo cubren, así que los cortes se resuelven en una sola pasada.

Un detalle de Postgres que costó una prueba: `property_type` **no** puede
ir en la clave primaria, porque una columna de la PK es NOT NULL y el
corte «todos los tipos» es precisamente NULL. La unicidad va en dos
índices parciales. Y el `JOIN` que aplica las vallas usa
`is not distinct from`, no `=`: con `=`, las filas del corte general
desaparecían en silencio.

## 27. Las cinco bandas

| Banda | Cuándo |
| --- | --- |
| Oportunidad | 15% o más debajo de la mediana del distrito |
| Precio competitivo | entre 5% y 15% debajo |
| Precio promedio | de −5% a +10% |
| Precio elevado | más de 10% encima |
| **Pocos datos** | muestra insuficiente, sin mediana o sin precio por m² |

Los cortes **no son simétricos** a propósito: en el mercado peruano se
publica con margen para negociar, así que estar 8% encima de la mediana es
normal y estar 15% debajo no lo es. Un corte simétrico marcaría «elevado»
a casi la mitad del mercado.

La frase nunca es un «Oportunidad» suelto: siempre dice contra qué se
compara y de cuántos avisos sale. `evaluarPrecio()` tiene un doble
cinturón — si la base dice `sufficient` pero hay menos de cinco avisos,
gana el criterio más conservador.

## 28. Los comparables se pueden mirar

«Comparables» que no se pueden abrir no son comparables: son un número que
hay que creer. `comparables_de()` devuelve los avisos del mismo distrito,
tipo y operación, con área dentro de ±40% —la ventana que usan los
tasadores para «similar»—, y la ficha los muestra con enlace. Cualquiera
puede abrir los ocho y rehacer la cuenta.

## 29. Historial que no se puede maquillar

`price_history` la escribe un disparador desde el sprint 3, no la
aplicación: quien publica no puede borrar ni reescribir su propia línea de
tiempo, y hay pruebas que lo comprueban intentándolo.

El gráfico se dibuja **en dólares**, no en la moneda de cada punto: un
aviso que pasó de soles a dólares mostraría un salto absurdo. La etiqueta
sí conserva la moneda original, porque es lo que la persona vio publicado
ese día. Con un solo punto no se dibuja nada: graficar un único precio
sugiere un movimiento que no hubo.

Es un SVG plano, sin librería y sin JavaScript. Traer 40 KB de librería de
gráficos para una polilínea de cinco puntos es lo que hace lenta una ficha
en un teléfono con señal de barrio.

## 30. Cuánto cuesta de verdad

El precio de lista no es lo que se paga. La ficha suma **cuota estimada +
mantenimiento** y muestra el total mensual. El mantenimiento se cobra en
soles aunque el departamento se venda en dólares, así que se convierte con
el tipo de cambio **a la vista**.

La **rentabilidad bruta** sale de la mediana de alquiler del mismo
distrito por el área, y solo se publica si esa muestra de alquileres
alcanza. Además se descarta cualquier resultado por encima de 25% anual:
eso no es una oportunidad, es un aviso de alquiler cargado en la moneda
equivocada. El aviso aclara qué **no** descuenta: mantenimiento, predial,
arbitrios, seguros, corretaje y los meses vacío.

## 31. Recalcular

`recalcular_mercado()` borra y reescribe la tabla entera, así que nunca
queda una fila vieja mezclada con una nueva. Corre con clave de servicio;
el rol se comprueba antes, en la acción de servidor, y la función no está
concedida a `authenticated`. Cada corrida queda en la bitácora de
auditoría con cuántas filas quedaron y con qué tipo de cambio.

La pantalla de administración muestra primero **cuándo se calculó**: un
índice de hace tres semanas se ve igual de convincente que uno de hoy, y
esa es justamente la trampa.
