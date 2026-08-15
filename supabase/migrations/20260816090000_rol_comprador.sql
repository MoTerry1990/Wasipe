-- =====================================================================
-- 20260816090000 — Rol "comprador"
--
-- Va solo en su propio archivo a propósito: Postgres no deja usar un
-- valor de enumerado recién agregado dentro de la misma transacción que
-- lo agregó. Cualquier cosa que ya lo use tiene que ir en una migración
-- posterior.
--
-- Es el rol con el que ahora nace toda cuenta nueva: quien se registra
-- para guardar favoritos y recibir alertas, sin publicar nada. Antes se
-- registraba a todo el mundo como 'owner', que otorgaba más de lo que la
-- mayoría necesita.
-- =====================================================================

alter type public.user_role add value if not exists 'buyer' before 'owner';
