# Manual de operación

Qué hacer cuando pasa algo. Escrito para leerse a las once de la noche,
apurado: primero qué hacer, después por qué.

---

## Cada semana

| Qué | Dónde | Qué buscar |
|---|---|---|
| Avisos por revisar | `/panel/admin/avisos` | Que la cola no crezca. Un aviso que espera tres días es un anunciante que se va a Urbania |
| Banderas abiertas | `/panel/admin/banderas` | Duplicados y precios raros. Muchas son falsas |
| Denuncias | `/panel/admin/denuncias` | Las más antiguas primero |
| Errores | Sentry | Cualquier error nuevo que se repita |
| Trabajos de IA fallidos | `ai_jobs` con `status = 'failed'` | Que el crédito se haya devuelto |

## Cada mes

- Recalcular el índice de mercado (`/panel/moderacion/mercado`)
- `npm audit` y actualizar lo que tenga aviso
- Revisar el gasto de Supabase, Vercel y del proveedor de IA
- **Restaurar una copia de seguridad a un proyecto de prueba.** Una copia
  que nunca se restauró no es una copia

---

## Consultas que se usan seguido

### Estado general

```sql
select
  (select count(*) from public.properties where publication_status = 'published') as publicados,
  (select count(*) from public.properties where publication_status = 'in_review') as por_revisar,
  (select count(*) from public.moderation_flags where status = 'open') as banderas,
  (select count(*) from public.reports where status = 'open') as denuncias,
  (select count(*) from public.profiles) as cuentas;
```

### Avisos esperando moderación hace más de un día

```sql
select code, title, district, created_at
  from public.properties
 where publication_status = 'in_review'
   and created_at < now() - interval '24 hours'
 order by created_at;
```

### Qué hizo el equipo esta semana

```sql
select action, count(*), max(created_at) as ultima
  from public.audit_logs
 where created_at > now() - interval '7 days'
 group by action order by 2 desc;
```

### Trabajos de IA que fallaron y si se devolvió el crédito

```sql
select j.id, j.kind, j.status, j.error, j.created_at,
       (select count(*) from public.credit_transactions t
         where t.reason ilike '%devoluci%' and t.created_at > j.created_at) as devoluciones
  from public.ai_jobs j
 where j.status = 'failed' and j.created_at > now() - interval '7 days'
 order by j.created_at desc;
```

---

## Cuando algo se rompe

### El sitio no carga

1. ¿Está caído Vercel? → `vercel-status.com`
2. ¿Está caída Supabase? → `status.supabase.com`
3. Si los dos están bien, es nuestro: **volver el despliegue** (§1 de
   `ROLLBACK_PLAN.md`). Dos minutos, y después se investiga con calma.

**No se depura en producción.** Primero se repone lo que funcionaba.

### El sitio carga pero no hay avisos

Casi siempre es Supabase, no el código. La aplicación está hecha para no
caerse sin base: cada pantalla muestra su estado vacío.

```sql
select count(*) from public.properties where publication_status = 'published';
```

- Devuelve un número > 0 → el problema es de conexión o de RLS
- Da error → la base no responde
- Devuelve 0 → alguien despublicó en masa; mirar `audit_logs`

### Todo el mundo ve «sin conexión con la base»

Las variables de entorno. Suele ser una clave rotada sin redesplegar:
Vercel no recoge una variable nueva sin un despliegue.

### Wasi AI no responde

Es lo más benigno: se declara apagado y publicar a mano sigue igual.

1. ¿Hay saldo en el proveedor?
2. ¿La clave sigue viva?
3. ¿Hay trabajos atascados?

```sql
select id, kind, status, created_at from public.ai_jobs
 where status = 'running' and created_at < now() - interval '1 hour';
```

Un trabajo colgado más de una hora está muerto. Cancelarlo devuelve el
crédito:

```sql
select public.cancelar_trabajo_ia('<id>');
```

### Alguien dice que su aviso desapareció

En orden:

```sql
select code, publication_status, status, rejection_reason, reviewed_by
  from public.properties where code = 'WSP-000123';
```

- `rejected` → hay motivo escrito. Se le lee tal cual; para eso se exige
- `draft` con motivo → moderación pidió cambios; tiene que corregir y
  reenviar
- `paused` → o lo pausó la persona, o moderación
- `expired` → no confirmó a los 90 días. Se reactiva desde su panel
- `published` pero no aparece → es de búsqueda, no de moderación

---

## Cosas que se hacen a mano

### Dar un puesto a alguien del equipo

```sql
insert into public.staff_members (user_id, role, note)
values ('<uuid>', 'moderator', 'Se suma al equipo de moderación');
```

Cuatro puestos: `moderator`, `support`, `finance`, `super_admin`. Se dan
por separado y se suman. **`super_admin` solo a quien de verdad tenga que
poder todo**, incluido nombrar a otros.

Quitarlo:

```sql
delete from public.staff_members where user_id = '<uuid>' and role = 'moderator';
```

### Devolver créditos a mano

**Nunca editando el movimiento anterior.** El libro es de solo inserción:

```sql
insert into public.credit_transactions (user_id, amount, balance_after, reason)
values ('<uuid>', 5, <saldo_actual + 5>, 'Devolución por fallo del proveedor de video');
```

El `reason` lo va a leer alguien dentro de seis meses tratando de
entender un saldo. Que diga algo.

### Recalcular el índice de mercado

Desde `/panel/moderacion/mercado`, o:

```sql
select public.recalcular_mercado();
```

Tarda. Solo publica cortes con al menos 5 avisos.

---

## Lo que NO se hace nunca

| | Por qué |
|---|---|
| `delete from public.audit_logs` | Falla por disparador. Si alguien lo intenta, es la pregunta |
| Editar `listing_reviews` | Lo mismo. Un motivo cambiado a posteriori no vale nada |
| Cambiar `publication_status` con un `update` directo | Se salta la bitácora. Se usa `revisar_aviso()` |
| Usar la llave de servicio para arreglar algo rápido | Se salta RLS entera. Si hace falta, es que falta una función |
| Encender `PAGOS_EN_VIVO` sin aprobación expresa | Es dinero de otras personas |
| Borrar el sitio de Netlify | Es la única vuelta atrás que no depende de Vercel |

---

## A quién se le pregunta

| Situación | Quién decide |
|---|---|
| Volver un despliegue | Quien esté operando |
| Cancelar un trabajo de IA colgado | Quien esté operando |
| Devolver créditos por un fallo nuestro | Quien esté operando |
| Bajar un aviso denunciado | Moderación, con motivo escrito |
| Restaurar la base | **El usuario** |
| Tocar el DNS | **El usuario** |
| Encender los pagos | **El usuario** |
| Filtración de datos | **El usuario** y un abogado (Ley 29733) |

---

## Números que conviene mirar

Ninguno es una alarma automática todavía —falta conectar Sentry— pero
son los que dicen si el portal está sano.

| Qué | Bien | Mal |
|---|---|---|
| Avisos esperando moderación | menos de 20 | más de 50 |
| Tiempo hasta moderar | menos de 24 h | más de 72 h |
| Banderas abiertas | menos de 30 | crecen sin parar |
| Trabajos de IA fallidos | menos del 5 % | más del 20 % |
| Avisos vencidos por semana | pocos | muchos: la gente no confirma y el catálogo envejece |

El último es el que de verdad importa a largo plazo. Un portal
inmobiliario muere por avisos viejos, no por caídas.
