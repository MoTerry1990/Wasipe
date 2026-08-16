-- =====================================================================
-- 20260820080000 — Estado "archivado"
--
-- Va solo en su archivo: Postgres no deja usar un valor de enumerado
-- recién agregado dentro de la misma transacción que lo agregó.
--
-- Archivar no es borrar. El aviso deja de aparecer en cualquier lado
-- pero se conserva con su historial de precios y sus consultas: quien
-- vendió su departamento en marzo puede querer volver a publicarlo el
-- año que viene, y quien recibió una consulta necesita poder buscarla
-- aunque el aviso ya no exista para el público.
-- =====================================================================

alter type public.publication_status add value if not exists 'archived' after 'expired';
