-- ---------------------------------------------------------------------
-- Idempotencia de los movimientos de crédito
--
-- Todavía no hay pasarela de pagos conectada. Esta migración existe
-- justamente por eso: es mucho más barato hacer que la duplicación sea
-- imposible antes de que llegue el primer webhook que descubrirlo
-- después, con el libro mayor ya torcido y sin forma de saber qué
-- movimiento era el bueno.
--
-- Toda pasarela reintenta. Culqi, Stripe, Niubiz: si tu endpoint tarda o
-- devuelve un 500 después de haber escrito, el webhook vuelve. No es un
-- caso raro, es el funcionamiento normal, y la única defensa que sirve es
-- que el segundo intento no pueda escribir nada.
--
-- La defensa no puede vivir en el código del endpoint —«miro si ya
-- existe y si no, inserto» tiene una carrera entre las dos operaciones—.
-- Tiene que ser una restricción de la base, que es lo único que resuelve
-- dos peticiones simultáneas.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- El identificador del evento de la pasarela
--
-- Nulo para todo lo que no viene de un pago: consumos de Wasi AI,
-- devoluciones, ajustes hechos a mano. El índice único es parcial, así
-- que esos nulos no se estorban entre sí.
-- ---------------------------------------------------------------------
alter table public.credit_transactions
  add column if not exists provider_event_id text;

comment on column public.credit_transactions.provider_event_id is
  'Identificador del evento en la pasarela. Único: un webhook repetido no puede acreditar dos veces.';

create unique index if not exists credit_transactions_evento_unico
  on public.credit_transactions (provider_event_id)
  where provider_event_id is not null;

alter table public.subscriptions
  add column if not exists provider_event_id text;

create unique index if not exists subscriptions_evento_unico
  on public.subscriptions (provider_event_id)
  where provider_event_id is not null;

-- ---------------------------------------------------------------------
-- payment_events — el registro crudo de lo que mandó la pasarela
--
-- Se guarda el cuerpo entero, tal como llegó, antes de interpretarlo.
-- Cuando un cobro sale mal, la pregunta siempre es «¿qué nos mandaron
-- exactamente?», y sin esta tabla la respuesta es «no sabemos».
--
-- Es de solo inserción y solo la escribe el servidor con la llave de
-- servicio. Nadie más la lee: un evento de pago trae los últimos cuatro
-- dígitos de una tarjeta y el correo de quien pagó.
-- ---------------------------------------------------------------------
create table if not exists public.payment_events (
  id bigint generated always as identity primary key,
  provider text not null check (length(trim(provider)) between 2 and 40),
  event_id text not null,
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text,

  constraint evento_unico_por_pasarela unique (provider, event_id)
);

comment on table public.payment_events is
  'Webhooks de pago tal como llegaron. La restricción única hace que un reintento de la pasarela no se procese dos veces.';

create index if not exists payment_events_sin_procesar_idx
  on public.payment_events (received_at)
  where processed_at is null;

alter table public.payment_events enable row level security;

-- Ninguna política para `authenticated` ni para `anon`: con RLS activo y
-- sin políticas, nadie lee ni escribe. Solo la llave de servicio, que se
-- salta RLS por diseño, y finanzas a través de la política de abajo.
create policy "finanzas ve los eventos de pago"
  on public.payment_events for select
  to authenticated
  using (public.es_personal('finance'));

-- ---------------------------------------------------------------------
-- registrar_evento_de_pago — la puerta de entrada
--
-- Devuelve `true` si el evento es nuevo y hay que procesarlo, `false` si
-- ya se había recibido. El endpoint del webhook llama a esto PRIMERO y,
-- si devuelve false, responde 200 sin hacer nada más: eso es lo que le
-- dice a la pasarela «recibido, deja de reintentar».
--
-- `on conflict do nothing` es lo que hace el trabajo. Dos peticiones
-- simultáneas con el mismo evento: una inserta, la otra no, y la segunda
-- se entera porque `found` es falso. No hay ventana entre comprobar e
-- insertar, porque no se comprueba nada.
-- ---------------------------------------------------------------------
create or replace function public.registrar_evento_de_pago(
  p_provider text,
  p_event_id text,
  p_event_type text,
  p_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  nuevo boolean := false;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Solo el servidor registra eventos de pago' using errcode = '42501';
  end if;

  insert into public.payment_events (provider, event_id, event_type, payload)
  values (p_provider, p_event_id, p_event_type, p_payload)
  on conflict (provider, event_id) do nothing;

  get diagnostics nuevo = row_count;
  return nuevo;
end;
$$;

revoke all on function public.registrar_evento_de_pago(text, text, text, jsonb) from public;
grant execute on function public.registrar_evento_de_pago(text, text, text, jsonb)
  to service_role;
