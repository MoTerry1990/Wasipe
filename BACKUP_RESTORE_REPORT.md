# Copia y restauración

**Estado: SIN EJECUTAR — no existe la base que copiar.**

---

## Por qué este documento existe

`FINAL_AUDIT.md` viene diciendo desde el sprint 17 que **nunca se restauró
una copia**, y lo marca como bloqueante para el lanzamiento.

El motivo es simple: una copia que nunca se restauró no es una copia, es
un archivo. No se sabe si está completa, si el formato se puede leer, ni
cuánto tarda. Y eso se descubre el peor día posible.

**El objetivo de esta fase no es crear una copia. Es demostrar que se
puede volver de ella.**

---

## Plan

### 1 · Crear la copia

Después de aplicar las migraciones y de cargar los datos de prueba, para
que la restauración tenga algo que comparar.

```bash
npx supabase db dump --db-url "$SUPABASE_DB_URL" -f copia-staging.sql
```

| Dato | Valor |
|---|---|
| Fecha y hora | *(pendiente)* |
| Formato | SQL plano |
| Tamaño | *(pendiente)* |
| Tablas | *(pendiente)* |
| Hash SHA-256 | *(pendiente)* |

El hash importa: es lo que permite saber después si el archivo que se está
restaurando es el mismo que se creó.

### 2 · Contar antes

| Tabla | Filas |
|---|---|
| `properties` | ⬜ |
| `property_media` | ⬜ |
| `profiles` | ⬜ |
| `credit_transactions` | ⬜ |
| `payment_events` | ⬜ |
| `audit_logs` | ⬜ |
| `listing_reviews` | ⬜ |
| `price_history` | ⬜ |

### 3 · Restaurar en otra base

**Nunca encima del staging que funciona.** Un proyecto temporal, o una
base aparte dentro del mismo proyecto.

```bash
psql "$URL_DE_LA_BASE_TEMPORAL" -f copia-staging.sql
```

### 4 · Comparar

| Qué | Origen | Restaurada | ¿Igual? |
|---|---|---|---|
| Tablas | | | ⬜ |
| Índices | | | ⬜ |
| Funciones | | | ⬜ |
| Disparadores | | | ⬜ |
| Políticas de RLS | | | ⬜ |
| Filas por tabla | | | ⬜ |
| Claves foráneas | | | ⬜ |
| Libro de créditos | | | ⬜ |
| Datos de prueba | | | ⬜ |

**Las diferencias se anotan exactamente, no se resumen.** «Casi igual» no
sirve para decidir si se puede confiar en una copia.

Hay dos que casi seguro van a aparecer:

- **Las secuencias** pueden quedar en otro valor. No es grave, pero hay
  que verlo antes de que un `insert` choque con una clave repetida.
- **Los roles de Supabase** (`anon`, `authenticated`, `service_role`)
  pueden no existir en una base creada a mano, y entonces las políticas no
  se aplican.

El segundo es el importante: **si los roles faltan, la restauración parece
correcta y no tiene RLS**. Una base restaurada sin RLS es una base abierta.
Hay que comprobarlo explícitamente:

```sql
select tablename, rowsecurity from pg_tables
 where schemaname = 'public' and rowsecurity = false;
```

### 5 · Limpiar

El entorno temporal se borra **solo si es seguro y está autorizado**. Si
hay cualquier duda, se deja y se anota acá qué es y por qué sigue vivo.

---

## Lo que hay que medir además

| Qué | Por qué |
|---|---|
| Cuánto tarda la copia | Si tarda una hora, no se puede hacer antes de cada despliegue |
| Cuánto tarda la restauración | Es el tiempo de caída en el peor caso |
| Cada cuánto las hace Supabase solo | En el plan gratuito son 7 días de retención |
| **Cuánto se pierde entre copias** | Es lo que se pierde de verdad al restaurar |

El último es el número que hay que saber **antes** de lanzar: al restaurar
se pierde todo lo escrito desde la copia. Con copias diarias, hasta 24
horas de avisos y de cuentas nuevas.

Ese número va en `ROLLBACK_PLAN.md` §2, donde hoy dice «si pasaron cuatro
horas, se pierden cuatro horas» sin haberlo medido.

---

## Cuando esto se ejecute

Se llena esta tabla y `PRODUCTION_CHECKLIST.md` §2 deja de estar
bloqueado. Es uno de los tres puntos que hoy impiden lanzar.
