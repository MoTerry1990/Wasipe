-- Devolver EXECUTE a los roles internos de Supabase.
--
-- La migración 20260906200000 cerró un agujero real: 66 funciones estaban
-- al alcance de cualquier visitante sin sesión. Pero lo hizo con
-- `revoke execute ... from public`, y **`public` en Postgres no es el
-- esquema público: es «todos los roles»**, incluidos los internos de
-- Supabase que nadie nombra nunca porque funcionan solos.
--
-- Consecuencia: `supabase_auth_admin`, que es el rol con el que corre la
-- autenticación, perdió EXECUTE sobre `crear_perfil_al_registrarse()`, el
-- disparador que crea el perfil al registrarse. Desde entonces cualquier
-- intento de iniciar sesión responde 500 con
-- «Database error querying schema».
--
-- Se descubrió en el sprint 22, al correr el flujo de guardar un borrador
-- contra el Preview. No lo detectó ninguna prueba: la suite corre contra
-- PGlite, que no tiene los roles de Supabase ni su servicio de
-- autenticación.
--
-- Acá se devuelve el permiso a los roles que lo necesitan, **sin
-- devolvérselo a `anon` ni a `authenticated`**, que es lo que había que
-- cerrar. La lección queda escrita: al revocar sobre `public` hay que
-- volver a conceder explícitamente a quien sí debe poder.

do $$
declare
  f text;
  r text;
begin
  foreach f in array array[
    'public.crear_perfil_al_registrarse()',
    'public.fijar_dueno_consulta()',
    'public.sumar_consulta()',
    'public.exigir_confirmacion_de_edicion()',
    'public.impedir_cambio_de_rol()',
    'public.proteger_estados_aviso()',
    'public.proteger_foto_original()',
    'public.proteger_trabajo_ia()',
    'public.registrar_cambio_precio()'
  ]
  loop
    foreach r in array array[
      'postgres',
      'service_role',
      'supabase_auth_admin',
      'supabase_storage_admin',
      'authenticator'
    ]
    loop
      -- Los roles internos existen en Supabase, no en una base local ni
      -- en PGlite. Si falta uno, se sigue: no es motivo para que la
      -- migración entera falle.
      if exists (select 1 from pg_roles where rolname = r) then
        execute format('grant execute on function %s to %I', f, r);
      end if;
    end loop;
  end loop;
end $$;

-- Las siete funciones de servidor y saldo_de_creditos siguen cerradas
-- para anon y authenticated. Solo se les devuelve a quien opera el
-- sistema, que es para lo que se escribieron.
do $$
declare
  f text;
  r text;
begin
  foreach f in array array[
    'public.registrar_evento_de_pago(text, text, text, jsonb)',
    'public.anotar_huella(uuid, text)',
    'public.fotos_sin_huella(integer)',
    'public.subidas_abandonadas(integer)',
    'public.recalcular_mercado()',
    'public.vencer_videos()',
    'public.limpiar_cupos_vencidos()',
    'public.saldo_de_creditos(uuid)'
  ]
  loop
    foreach r in array array['postgres', 'service_role'] loop
      if exists (select 1 from pg_roles where rolname = r) then
        execute format('grant execute on function %s to %I', f, r);
      end if;
    end loop;
  end loop;
end $$;
