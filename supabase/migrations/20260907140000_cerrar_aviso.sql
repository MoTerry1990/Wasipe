-- Cerrar un aviso: vendido, alquilado o retirado.
--
-- Hasta ahora `property_status` existía —available, reserved, sold,
-- rented, withdrawn— y **ninguna parte de la aplicación lo escribía**.
-- Un propietario que vendía su departamento no tenía forma de decirlo:
-- el aviso se quedaba publicado hasta que alguien lo pausara a mano o
-- venciera a los noventa días. Un portal lleno de avisos de cosas que ya
-- no están es lo primero que la gente nota, y lo último que perdona.
--
-- Sacarlo de los listados no hace falta programarlo: la política
-- `el publico ve los avisos publicados` ya exige
-- `publication_status = 'published' AND status = 'available'`, así que en
-- cuanto el estado deja de ser «disponible» el aviso desaparece de la
-- búsqueda y de la ficha pública para todo el mundo, sin una línea más.
--
-- Lo que sí falta es la regla de transición, y va en la base y no solo en
-- la acción de servidor: la acción cubre el camino de la interfaz, y la
-- base cubre todos los caminos.
--
-- Regla: quien no es moderación solo puede cambiar la disponibilidad de
-- un aviso que está **publicado o pausado**. No se puede marcar como
-- vendido un borrador, ni uno en revisión, ni uno archivado.
--
-- El resto de la función queda exactamente como estaba.

create or replace function public.proteger_estados_aviso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Marcas de tiempo del flujo. Se ponen acá y no en la aplicación para
  -- que valgan también cuando el cambio viene de la API o de un script.
  if new.publication_status = 'in_review'
     and old.publication_status is distinct from 'in_review' then
    new.submitted_at := now();
  end if;

  if new.publication_status in ('published', 'rejected')
     and old.publication_status is distinct from new.publication_status then
    new.reviewed_at := now();
    new.reviewed_by := coalesce(new.reviewed_by, auth.uid());
  end if;

  if new.publication_status = 'archived'
     and old.publication_status is distinct from 'archived' then
    new.archived_at := now();
  end if;

  -- Al publicarse por primera vez se fija la fecha de publicación; al
  -- reanudarse una pausa NO se toca, para no falsear la antigüedad.
  if new.publication_status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;

  if public.es_moderador() then
    return new;
  end if;

  if new.verification_status is distinct from old.verification_status then
    raise exception 'La verificación del aviso la realiza el equipo de Wasipe'
      using errcode = '42501';
  end if;

  if new.publication_status = 'published'
     and old.publication_status not in ('published', 'paused') then
    raise exception 'El aviso tiene que pasar por revisión antes de publicarse'
      using errcode = '42501';
  end if;

  if new.publication_status = 'rejected'
     and old.publication_status is distinct from 'rejected' then
    raise exception 'Solo el equipo de Wasipe puede rechazar un aviso'
      using errcode = '42501';
  end if;

  -- Cerrar un aviso, o volver a abrirlo, solo desde publicado o pausado.
  -- Marcar como vendido un borrador no significa nada, y dejarlo pasar
  -- ensucia las estadísticas de mercado, que se calculan sobre lo que se
  -- cerró.
  if new.status is distinct from old.status
     and new.publication_status not in ('published', 'paused') then
    raise exception 'Solo se puede cerrar un aviso publicado o pausado'
      using errcode = '42501';
  end if;

  return new;
end;
$$;
