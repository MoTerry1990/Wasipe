# Copia y restauración

**Estado: VERIFICADA en el sprint 22.** Ver la segunda pasada al final.

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

---

## Ejecución — sprint 22 · 6 de setiembre de 2026

**Estado: la copia funciona. La restauración NO quedó demostrada.**

### Lo que sí se hizo

| | |
|---|---|
| Origen | `wasipe-staging` (`kcsditeaaszvmwirjazo`), PostgreSQL **17.6** |
| Herramienta | `pg_dump` **17.11**, instalada localmente |
| Volcado completo | `--schema=public --no-owner --no-privileges` → **183 216 bytes** |
| Volcado de esquema | `--schema-only` → **174 567 bytes** |
| Cadena de conexión dentro del archivo | **no** (comprobado) |
| Archivos | fuera del repositorio, en la carpeta temporal de la sesión |

Conteos de referencia en el origen:

| Objeto | Cantidad |
|---|---:|
| tablas | 28 |
| vistas | 6 |
| índices | 107 |
| políticas | 73 |
| funciones | 66 |
| restricciones | 174 |
| enums | 33 |
| disparadores | 20 |
| **filas** | **0** |

### Lo que no se pudo demostrar

El ensayo se corrió contra **PGlite**, elegido porque es la garantía más
fuerte de que no puede tocar staging: la base no existe fuera del proceso.
Resultado con `scripts/ensayo-restauracion.mjs`:

    sentencias: 470 · aplicadas 389 · fallidas 81

    64 × relation "public.properties" does not exist
    10 × relation "public.property_locations" does not exist
     2 × type "extensions.geography" does not exist
     5 × (otras, en cascada)

Las 81 salen de **dos**. `extensions.geography` no existe porque **PGlite
no trae PostGIS**; sin ese tipo no se crean `properties` ni
`property_locations`, y todo lo que las referencia cae detrás.

Conteos restaurados contra referencia: 26 de 28 tablas, 1 de 6 vistas,
81 de 107 índices, 59 de 73 políticas. Un solo conteo coincidió.

**Conclusión: PGlite no sirve como destino de restauración de este
proyecto.** Sirve para las pruebas de RLS, que es para lo que está, pero
no para un ensayo de recuperación.

### Tres cosas que hay que saber antes de una emergencia

1. **El destino necesita PostGIS.** Sin la extensión no se restauran las
   dos tablas centrales del producto. Cualquier base de recuperación tiene
   que tenerla instalada *antes*.

2. **El volcado se restaura con `psql`, no con un driver.** `pg_dump` 17
   escribe `\restrict` y `\unrestrict` al principio y al final, y cierra
   cada bloque de datos con `\.`. Son metacomandos de psql: alimentar el
   archivo a un cliente de Postgres da `syntax error at or near "\"` y no
   dice por qué.

3. **Los roles no viajan.** Un volcado de `--schema=public` no incluye
   `anon`, `authenticated` ni `service_role`, pero las 73 políticas los
   nombran. Hay que crearlos en el destino antes de restaurar, o usar
   `supabase db dump --role-only`.

### Lo que falta

Un Postgres 17 con PostGIS como destino, y restaurar con `psql`. El
servidor local instalado en este sprint responde en el 5432, pero no se
usó: haría falta su contraseña, y adivinarla no es forma de trabajar.

**`PRODUCTION_CHECKLIST.md` §2 sigue bloqueado.**

---

## Segunda pasada — sprint 22, con PostGIS y contraseña real

**Estado: RESTAURACIÓN VERIFICADA.**

Con PostGIS 3.6 en el Postgres local y `LOCAL_DB_URL` apuntando de verdad
al servidor, `scripts/ensayo-restauracion.mjs` hace el ciclo entero solo:
respalda, crea una base nueva, la prepara, restaura con `psql`, compara y
borra. Sale con código 0.

### Respaldo

| | |
|---|---|
| Origen | `wasipe-staging`, PostgreSQL 17.6, con datos sembrados |
| Herramienta | `pg_dump` 17.11 |
| Tamaño | **201 121 bytes** |
| Cadena de conexión dentro del archivo | **no** |

### Destino

Base `wasipe_restauracion`, creada y eliminada dentro del mismo ensayo.
Antes de restaurar hay que ponerle lo que el volcado **da por sentado y no
trae**:

- **PostGIS en el esquema `extensions`.** El volcado usa
  `extensions.geography`. Sin la extensión no se crean `properties` ni
  `property_locations`, que son las dos tablas centrales del producto.
- **Los roles `anon`, `authenticated` y `service_role`.** Son del clúster,
  no de la base. No viajan en un volcado de `public`, pero las 73
  políticas los nombran.
- **`auth.uid()`, `auth.role()` y `auth.users`.** Las políticas llaman a
  las dos primeras, y las claves foráneas apuntan a la tercera.

### Comparación

| Objeto | Origen | Restaurado | |
|---|---:|---:|---|
| tablas | 28 | 28 | ✓ |
| vistas | 6 | 6 | ✓ |
| índices | 107 | 107 | ✓ |
| políticas | 73 | 73 | ✓ |
| funciones | 66 | 66 | ✓ |
| enums | 33 | 33 | ✓ |
| disparadores | 20 | 20 | ✓ |

| Tabla | Origen | Restaurado | |
|---|---:|---:|---|
| agencies | 1 | 1 | ✓ |
| agency_members | 1 | 1 | ✓ |
| exchange_rates | 1 | 1 | ✓ |
| favorites | 2 | 2 | ✓ |
| inquiries | 1 | 1 | ✓ |
| price_history | 9 | 9 | ✓ |
| profile_districts | 3 | 3 | ✓ |
| profiles | 4 | 4 | ✓ |
| properties | 8 | 8 | ✓ |
| property_features | 16 | 16 | ✓ |
| property_locations | 8 | 8 | ✓ |
| property_media | 24 | 24 | ✓ |
| **TOTAL** | **78** | **78** | ✓ |

**Ninguna tabla restaurada quedó sin RLS.** Que las tablas lleguen no
sirve de nada si llegan desprotegidas, y ese era el riesgo real de dar por
buena una restauración mirando solo el conteo de tablas.

### Lo que hay que saber antes de una emergencia

1. **El destino necesita PostGIS**, instalado *antes* de restaurar.
2. **Se restaura con `psql`, no con un driver.** `pg_dump` 17 escribe
   `\restrict` y `\unrestrict`, y cierra cada bloque de datos con `\.`.
   Son metacomandos de psql: un cliente de Postgres da
   «syntax error at or near "\"» y no dice por qué.
3. **Los roles no viajan.** Hay que crearlos en el destino.
4. **`schema "public" already exists` es ruido.** El volcado trae
   `CREATE SCHEMA public` y toda base nueva ya lo tiene. El ensayo lo
   ignora a propósito: contarlo como error convertía una restauración
   perfecta en un rojo, y ese es el peor falso negativo posible — el día
   que haga falta de verdad, nadie confía en el resultado.

### Verificación de que no se tocó staging

Conteos de staging antes y después del ensayo: **idénticos**, 78 filas.
Ninguna base `wasipe_*` quedó en el servidor local. Ningún archivo de
respaldo quedó en disco.

**`PRODUCTION_CHECKLIST.md` §2 queda desbloqueado.**
