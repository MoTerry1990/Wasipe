-- Quitar EXECUTE a anon y authenticated sobre las funciones que solo debe
-- llamar el servidor.
--
-- Postgres concede EXECUTE a PUBLIC en cada función nueva, y PUBLIC incluye
-- a `anon`. Ninguna migración anterior lo revocó, así que las 66 funciones
-- de `public` quedaron al alcance de cualquier visitante sin sesión. Las que
-- comprueban por dentro quién llama —revisar_aviso, verificar_anunciante,
-- resolver_bandera— se defienden solas. Las de acá abajo no comprueban nada,
-- porque nacieron para que las llame el servidor con la clave de servicio.
--
-- Verificado contra el proyecto real, no supuesto. Con el rol `anon`:
--
--     limpiar_cupos_vencidos()      ejecuta  → borra los límites de frecuencia
--     recalcular_mercado()          ejecuta  → recalcula estadísticas globales
--     vencer_videos()               ejecuta  → vence videos de todo el mundo
--     subidas_abandonadas(1)        ejecuta  → lee storage.objects entero
--     registrar_evento_de_pago(…)   ejecuta  → inyecta eventos de pago falsos
--     fotos_sin_huella(…)           ejecuta  → recorre fotos ajenas
--     saldo_de_creditos(uuid)       ejecuta  → lee el saldo de cualquiera
--
-- La peor de todas es `limpiar_cupos_vencidos()`: los límites de frecuencia
-- son la defensa contra el abuso, y cualquiera podía barrerlos con una
-- llamada. Después de eso, el resto de los límites no valen nada.
--
-- `service_role` conserva EXECUTE porque es quien las usa de verdad: los
-- webhooks de pago, las huellas de fotos y los barridos de archivos son
-- operaciones del servidor sobre datos de terceros, sin sesión a la que
-- atribuirlas.

-- ---------------------------------------------------------------------
-- 1. Operaciones del servidor sobre datos de terceros
-- ---------------------------------------------------------------------

revoke execute on function public.registrar_evento_de_pago(text, text, text, jsonb)
  from public, anon, authenticated;
grant  execute on function public.registrar_evento_de_pago(text, text, text, jsonb)
  to service_role;

revoke execute on function public.anotar_huella(uuid, text)
  from public, anon, authenticated;
grant  execute on function public.anotar_huella(uuid, text)
  to service_role;

revoke execute on function public.fotos_sin_huella(integer)
  from public, anon, authenticated;
grant  execute on function public.fotos_sin_huella(integer)
  to service_role;

revoke execute on function public.subidas_abandonadas(integer)
  from public, anon, authenticated;
grant  execute on function public.subidas_abandonadas(integer)
  to service_role;

-- ---------------------------------------------------------------------
-- 2. Mantenimiento: barridos y recálculos que no pide ningún usuario
-- ---------------------------------------------------------------------

revoke execute on function public.recalcular_mercado()
  from public, anon, authenticated;
grant  execute on function public.recalcular_mercado() to service_role;

revoke execute on function public.vencer_videos()
  from public, anon, authenticated;
grant  execute on function public.vencer_videos() to service_role;

revoke execute on function public.limpiar_cupos_vencidos()
  from public, anon, authenticated;
grant  execute on function public.limpiar_cupos_vencidos() to service_role;

-- ---------------------------------------------------------------------
-- 3. Saldo de créditos: solo fuera del alcance del visitante
-- ---------------------------------------------------------------------
--
-- Recibe el identificador de usuario por parámetro y no comprueba que sea
-- el de quien llama, así que un autenticado todavía puede leer el saldo de
-- otro. Eso se arregla dentro de la función, no con permisos, y va en su
-- propia migración. Acá al menos deja de estar abierta a quien no tiene
-- sesión.

revoke execute on function public.saldo_de_creditos(uuid) from public, anon;
grant  execute on function public.saldo_de_creditos(uuid) to service_role;

-- ---------------------------------------------------------------------
-- 4. Funciones de disparador
-- ---------------------------------------------------------------------
--
-- Un disparador no se invoca con EXECUTE: lo dispara la tabla y corre con
-- los permisos de su dueño. Que anon pudiera llamarlas sueltas no servía
-- para nada bueno.

revoke execute on function public.crear_perfil_al_registrarse()    from public, anon, authenticated;
revoke execute on function public.fijar_dueno_consulta()           from public, anon, authenticated;
revoke execute on function public.sumar_consulta()                 from public, anon, authenticated;
revoke execute on function public.exigir_confirmacion_de_edicion() from public, anon, authenticated;
revoke execute on function public.impedir_cambio_de_rol()          from public, anon, authenticated;
revoke execute on function public.proteger_estados_aviso()         from public, anon, authenticated;
revoke execute on function public.proteger_foto_original()         from public, anon, authenticated;
revoke execute on function public.proteger_trabajo_ia()            from public, anon, authenticated;
revoke execute on function public.registrar_cambio_precio()        from public, anon, authenticated;
