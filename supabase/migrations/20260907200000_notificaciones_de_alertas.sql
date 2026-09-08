-- El registro de lo que se le avisa a cada persona.
--
-- `saved_searches` tenía `alert_frequency`, `last_run_at` y
-- `last_notified_at` desde el esquema inicial, y **nada los recorría**:
-- las alertas se guardaban y no avisaban nunca. Eran un formulario que no
-- llevaba a ningún lado.
--
-- Esta tabla existe por tres motivos distintos, y ninguno es «guardar por
-- si acaso»:
--
--  1. **Idempotencia.** Correr la tarea dos veces no puede mandar el
--     mismo aviso dos veces. La restricción única sobre
--     (búsqueda, aviso) es lo que lo garantiza: el segundo intento
--     choca contra la base, no contra un `if` que alguien puede mover.
--
--  2. **Verificabilidad.** Hoy el correo no sale de verdad (ver
--     `lib/notificaciones/`). Sin este registro no habría forma de
--     comprobar que la tarea hizo lo que debía, y una tarea programada
--     que nadie puede auditar es una que nadie sabe si corre.
--
--  3. **Cuota.** El día que haya un proveedor real, cada envío cuesta.
--     Poder contar cuántos correos se mandaron por persona y por día es
--     lo que permite no pasarse.

create table if not exists public.notificaciones_de_alerta (
  id bigint generated always as identity primary key,

  busqueda_id uuid not null references public.saved_searches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Qué aviso motivó el correo. Uno por fila: si una corrida encuentra
  -- tres avisos nuevos, quedan tres filas y un solo correo.
  property_id uuid not null references public.properties(id) on delete cascade,

  -- A qué envío pertenece. Las filas de una misma corrida comparten
  -- valor, así que se puede reconstruir qué llevaba cada correo.
  envio_id uuid not null,

  -- Qué hizo el proveedor. `registrado` es lo que devuelve el proveedor
  -- de bitácora, que es el único que hay hoy.
  estado text not null default 'registrado'
    check (estado in ('registrado', 'enviado', 'fallido')),

  proveedor text not null default 'registro',
  error text,

  created_at timestamptz not null default now(),

  -- El corazón de la idempotencia: a nadie se le avisa dos veces del
  -- mismo aviso por la misma búsqueda.
  unique (busqueda_id, property_id)
);

comment on table public.notificaciones_de_alerta is
  'Qué avisos se le notificaron a quién, por qué búsqueda guardada. La restricción única impide avisar dos veces del mismo aviso.';

-- Contar los envíos de una persona en las últimas horas es la consulta
-- del límite de frecuencia, y corre en cada vuelta de la tarea.
create index if not exists notificaciones_por_persona_idx
  on public.notificaciones_de_alerta (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- Quién ve esto
-- ---------------------------------------------------------------------
alter table public.notificaciones_de_alerta enable row level security;

-- Cada quien ve lo que se le notificó a sí mismo. Sirve para poder
-- mostrarle «te avisamos de estos tres avisos» sin que nadie más lo lea.
create policy "cada quien ve sus notificaciones"
  on public.notificaciones_de_alerta
  for select
  using (user_id = auth.uid());

-- Escribir es de la tarea, que corre con la clave de servicio. No hay
-- política de INSERT para anon ni para authenticated a propósito: nadie
-- debe poder fabricarse una notificación, ni impedirse una marcando el
-- aviso como ya enviado.
