# Plan de vuelta atrás

Se lee **antes** de desplegar, no durante. Cuando algo se cae, nadie está
en condiciones de leer un documento largo por primera vez.

---

## Lo primero: cuál es el problema

Cada tipo de fallo tiene su vuelta atrás, y son distintas. Elegir mal
empeora las cosas.

| Qué pasa | Sección |
|---|---|
| El sitio no carga, o carga mal | §1 · Volver el código |
| Una migración rompió algo | §2 · Volver el esquema |
| Se filtraron datos, o hay una clave comprometida | §3 · Incidente de seguridad |
| El dominio apunta mal | §4 · Volver el DNS |
| Se cobró de más, o dos veces | §5 · Pagos |

---

## §1 · Volver el código — 2 minutos

**Es la vuelta atrás más rápida y la que casi siempre alcanza.**

Vercel guarda cada despliegue. Volver es promover el anterior; no
reconstruye ni recompila nada.

1. Vercel → **Deployments**
2. El último que funcionaba → **⋯** → **Promote to Production**
3. Confirmar

**Qué NO revierte:** las migraciones ya aplicadas. Si el problema es de
esquema, esto solo, ver §2.

**Cuándo alcanza:** un error de JavaScript, una página que revienta, una
variable mal puesta, una regresión visual.

---

## §2 · Volver el esquema — 10 a 40 minutos

**Es la más peligrosa. Se hace despacio.**

Las migraciones de Wasipe no traen script de vuelta atrás, y es una
decisión: un `down` mal escrito borra datos con más confianza que el
problema que venía a arreglar.

### Primero, decidir qué tipo de migración fue

**Si solo agregó** (una tabla, una columna nueva, un índice, una función):

→ **No se revierte.** Se vuelve el código a la versión anterior (§1). Una
columna de más no molesta a nadie. Se limpia después, con calma.

Es el caso de casi todas las migraciones de Wasipe.

**Si cambió o borró algo** (renombró, cambió un tipo, borró una columna,
reescribió una política):

→ Ahí sí hay que actuar, y el orden es:

1. **Parar la escritura.** En Supabase, poner el proyecto en pausa o
   quitarle los permisos al rol `anon`. Cada minuto que pasa entran datos
   nuevos que después hay que conciliar a mano.
2. **Mirar el daño antes de tocar nada:**

```sql
select count(*) from public.properties;
```

3. **Restaurar desde la copia:** Supabase → Database → Backups → el punto
   anterior a la migración.

⚠️ **Restaurar pisa todo lo escrito desde entonces.** Si pasaron cuatro
horas, se pierden cuatro horas de avisos y de cuentas. Por eso el paso 1
importa: cuanto antes se pare, menos se pierde.

4. Volver el código (§1).
5. Reabrir la escritura.

### Si la copia de seguridad no sirve

No hay plan C. Por eso `PRODUCTION_CHECKLIST.md` exige **restaurar una
copia al menos una vez** antes de lanzar: una copia que nunca se restauró
no es una copia, es un archivo.

---

## §3 · Incidente de seguridad

### Una clave se filtró

Rotar **primero**, investigar después. Una clave comprometida se está
usando mientras alguien lee registros.

| Clave | Dónde se rota | Qué se rompe mientras tanto |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → Reset | Las acciones del servidor, hasta redesplegar |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Lo mismo | El sitio entero. Es la más cara de rotar |
| `ANTHROPIC_API_KEY` | console.anthropic.com | Wasi AI queda apagado, y se anuncia solo |
| Culqi | Panel de Culqi | Nada: los cobros están apagados |

Después de rotar: cargar la nueva en Vercel y **redesplegar**. Vercel no
recoge una variable nueva sin redesplegar.

### Se filtraron datos de personas

1. Cortar la fuga: revocar el acceso, apagar la ruta, lo que haga falta.
2. **Leer la bitácora antes de que se llene:**

```sql
select * from public.audit_logs order by created_at desc limit 200;
```

Es inmutable por disparador, así que nadie pudo borrar su rastro.

3. Determinar qué salió y de cuántas personas.
4. **La Ley 29733 obliga a informar.** Si salieron datos personales, hay
   que avisar a la Autoridad Nacional de Protección de Datos Personales y
   a las personas afectadas. No es opcional y no es una decisión técnica:
   la toma el usuario, con la información que le demos.

---

## §4 · Volver el DNS — de 5 minutos a 24 horas

**Por esto el sitio de Netlify no se apaga.**

1. En el registrador, volver los registros a los de Netlify (están
   anotados en el paso 8 de `DEPLOYMENT_GUIDE.md`, con captura).
2. Esperar la propagación.

**Cuánto tarda depende del TTL que había cuando se hizo el cambio.** Con
300 segundos, cinco minutos. Con 3600, una hora. Con 86400, un día
entero, y durante ese día parte del mundo ve un sitio y parte ve el otro.

Por eso la guía dice bajar el TTL a 300 **antes** del cambio y esperar a
que caduque el viejo. Es el paso que más se saltea y el que más caro sale.

```bash
dig wasipe.pe +short
```

**Mientras tanto:** el sitio de Netlify sigue sirviendo con sus datos en
Neon. No es la versión nueva, pero funciona y la gente puede buscar.

---

## §5 · Pagos

Hoy no hay pasarela conectada y `PAGOS_EN_VIVO=no`. Esta sección es para
cuando la haya.

### Se cobró dos veces

1. `PAGOS_EN_VIVO=no` y redesplegar. Corta la sangría en dos minutos.
2. Buscar el duplicado:

```sql
select provider_event_id, count(*) from public.credit_transactions
 where provider_event_id is not null
 group by 1 having count(*) > 1;
```

Si esto devuelve algo, el índice único falló, lo cual no debería poder
pasar. Guardar el resultado: es la evidencia.

3. Devolver desde el panel de la pasarela, no desde Wasipe.
4. Corregir el saldo con un movimiento en contra. **Nunca editando ni
   borrando el anterior:** el libro es de solo inserción, y un ajuste que
   borra la historia hace imposible saber después qué pasó.

### La pasarela reintenta sin parar

Suele ser que el endpoint devuelve 500 después de haber escrito. Se
responde **200** ante un evento ya conocido —`registrar_evento_de_pago()`
devuelve `false`— y eso le dice a la pasarela que deje de reintentar.

---

## Qué se guarda y hasta cuándo

| Qué | Dónde | Hasta cuándo |
|---|---|---|
| Sitio anterior | Netlify | **30 días** después de migrar el DNS |
| Base anterior | Neon | 30 días |
| Registros DNS anteriores | `DEPLOYMENT_GUIDE.md` §8 | Siempre |
| Despliegues de Vercel | Vercel | Los guarda todos |
| Copias de la base | Supabase | Según el plan (7 días en el gratuito) |

**Nada de esto se borra sin decirlo antes.** El sitio anterior es la única
vuelta atrás que no depende de que Vercel o Supabase estén en pie.

---

## A quién avisar

| Situación | Quién decide |
|---|---|
| Volver un despliegue | Quien esté desplegando. No hace falta consultar |
| Restaurar la base | **El usuario.** Se pierden datos |
| Volver el DNS | **El usuario** |
| Filtración de datos | **El usuario**, y probablemente un abogado |
| Encender o apagar pagos | **El usuario**, siempre |

La regla: si la vuelta atrás **pierde datos** o **cambia lo que ve el
público**, la decide el usuario. Si solo repone lo que había hace diez
minutos, se hace y se avisa.
