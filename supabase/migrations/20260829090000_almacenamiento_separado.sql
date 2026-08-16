-- ---------------------------------------------------------------------
-- Separar los originales de lo que se publica
--
-- Hasta ahora el archivo original y la versión que se muestra vivían en
-- el mismo bucket `avisos`, que es público. Funcionaba, pero significa
-- que cualquiera con la dirección se baja el archivo tal como salió del
-- celular: sin comprimir, con sus metadatos EXIF, y —esto es lo grave—
-- **con las coordenadas GPS del lugar donde se tomó**.
--
-- Una persona que publica su departamento eligió mostrar el distrito.
-- La foto de su sala, sin tocar, dice la cuadra.
--
-- Así que el original pasa a un bucket privado y ahí se queda: no se
-- sirve nunca, no se sobreescribe nunca, y solo lo abre quien administra
-- el aviso o el equipo de moderación cuando alguien reclama que su foto
-- fue alterada. Lo público es siempre una versión derivada.
--
-- Cinco buckets, uno por nivel de acceso:
--
--   originales   privado   el archivo tal como se subió
--   avisos       público   la versión que se muestra
--   generados    privado   lo que produjo Wasi AI, hasta que se apruebe
--   videos       privado   ya existía
--   avatares     público   ya existían
--   logos        público
--
-- `generados` es privado a propósito. Una imagen que Wasi AI acaba de
-- producir todavía no la aprobó nadie, y el sprint 10 dejó escrito que
-- ninguna sugerencia se publica sin confirmación. Un bucket público la
-- haría accesible por dirección aunque la interfaz no la muestre.
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  -- 25 MB: una foto de celular sin comprimir puede pasar los 15 que
  -- admite el bucket público, y el original se guarda entero o no sirve.
  ('originales', 'originales', false, 26214400,
   array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic']),
  ('generados', 'generados', false, 15728640,
   array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------
-- Quién toca qué
--
-- La ruta manda: `<uuid del aviso>/<archivo>`. `storage.foldername()`
-- devuelve los tramos, y el primero es el aviso. `administra_aviso()` ya
-- resuelve si quien pregunta es la dueña, la inmobiliaria o un agente.
--
-- Nada de metadatos: `storage.objects.metadata` lo escribe quien sube,
-- así que decidir permisos con eso es dejar que la persona declare sus
-- propios permisos.
-- ---------------------------------------------------------------------

create policy "el original lo ve quien administra el aviso"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'originales'
    and public.administra_aviso((storage.foldername(name))[1]::uuid)
  );

create policy "moderacion ve los originales"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'originales' and public.es_moderador());

create policy "sube originales quien administra el aviso"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'originales'
    and public.administra_aviso((storage.foldername(name))[1]::uuid)
  );

-- Sin política de UPDATE ni de DELETE sobre `originales`, y es el punto
-- entero de este bucket: **el original no se corrige ni se borra**. Si
-- mañana alguien reclama que su foto fue alterada, el archivo que subió
-- tiene que seguir estando, byte por byte.
--
-- Cuando se borra un aviso, el barrido lo hace el servidor con la llave
-- de servicio, que se salta RLS. Es una operación deliberada y registrada,
-- no algo que ocurra por accidente desde el navegador.

create policy "lo generado lo ve quien administra el aviso"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'generados'
    and public.administra_aviso((storage.foldername(name))[1]::uuid)
  );

create policy "moderacion ve lo generado"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'generados' and public.es_moderador());

create policy "escribe lo generado quien administra el aviso"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'generados'
    and public.administra_aviso((storage.foldername(name))[1]::uuid)
  );

create policy "borra lo generado quien administra el aviso"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'generados'
    and public.administra_aviso((storage.foldername(name))[1]::uuid)
  );

-- ---------------------------------------------------------------------
-- Dónde vive cada archivo
--
-- `property_media.storage_path` guardaba la ruta pero no en qué bucket.
-- Con un solo bucket alcanzaba; con cinco, no: hay que saber a cuál
-- pedirle el archivo, y adivinarlo por la ruta es empezar a inventar.
-- ---------------------------------------------------------------------
alter table public.property_media
  add column if not exists storage_bucket text
    check (storage_bucket in ('avisos', 'originales', 'generados', 'videos')),
  add column if not exists original_path text,
  add column if not exists byte_size bigint check (byte_size > 0),
  add column if not exists mime_type text;

comment on column public.property_media.original_path is
  'Ruta del archivo tal como se subió, en el bucket privado `originales`. Nunca se sobreescribe.';

-- Lo que ya existe está en `avisos`: es de donde venimos.
update public.property_media
   set storage_bucket = 'avisos'
 where storage_bucket is null and storage_path is not null;

-- ---------------------------------------------------------------------
-- La huella de la imagen
--
-- `image_hash` la agregó el sprint 15 para detectar la misma foto en dos
-- avisos, y quedó vacía porque nada la llenaba. Acá se le pone el índice
-- que hace que la búsqueda sirva, y una vista que dice cuánto falta por
-- rellenar: sin eso, el trabajo de relleno no se puede seguir.
-- ---------------------------------------------------------------------
create index if not exists property_media_huella_idx
  on public.property_media (image_hash)
  where image_hash is not null;

create or replace view public.avance_de_huellas as
  select
    count(*) as total,
    count(image_hash) as con_huella,
    count(*) - count(image_hash) as sin_huella,
    case when count(*) = 0 then 100
         else round(100.0 * count(image_hash) / count(*), 1)
    end as porcentaje
  from public.property_media
  where kind = 'photo';

comment on view public.avance_de_huellas is
  'Cuántas fotos tienen huella calculada. Lo usa el proceso de relleno para saber si terminó.';

-- ---------------------------------------------------------------------
-- fotos_sin_huella — el lote que le toca al proceso de relleno
--
-- Devuelve de a poco y siempre las más viejas primero, para que el
-- proceso se pueda cortar y retomar sin repetir ni saltear. Solo el
-- servidor: recorre fotos de todo el mundo.
-- ---------------------------------------------------------------------
create or replace function public.fotos_sin_huella(p_limite integer default 100)
returns table (id uuid, property_id uuid, storage_bucket text, storage_path text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- La comprobación va DENTRO y no solo en los permisos. Quitar el
  -- `grant` es una capa, pero una capa sola: basta que alguien conceda
  -- `execute on all functions` —cosa que Supabase hace por defecto sobre
  -- el esquema public— para que desaparezca sin que nadie lo note.
  --
  -- Esta función devuelve fotos de todo el mundo: es un listado del
  -- catálogo entero, y no puede depender de un permiso que se puede
  -- reconceder por descuido.
  if auth.role() <> 'service_role' then
    raise exception 'Solo el servidor pide el lote de huellas pendientes'
      using errcode = '42501';
  end if;

  return query
    select m.id, m.property_id, m.storage_bucket, m.storage_path
      from public.property_media m
     where m.kind = 'photo'
       and m.image_hash is null
       and m.storage_path is not null
     order by m.created_at
     limit greatest(1, least(p_limite, 500));
end;
$$;

revoke all on function public.fotos_sin_huella(integer) from public;
grant execute on function public.fotos_sin_huella(integer) to service_role;

-- ---------------------------------------------------------------------
-- anotar_huella — escribe una huella ya calculada
--
-- Solo escribe si estaba vacía. Un relleno que se corre dos veces no
-- pisa nada, y una huella recalculada distinta —porque cambió el
-- algoritmo— no se cuela sin que alguien lo decida.
-- ---------------------------------------------------------------------
create or replace function public.anotar_huella(p_media_id uuid, p_huella text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  escrita boolean := false;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Solo el servidor anota huellas' using errcode = '42501';
  end if;

  if p_huella is null or length(trim(p_huella)) < 8 then
    raise exception 'Esa huella no parece una huella' using errcode = '22023';
  end if;

  update public.property_media
     set image_hash = trim(p_huella)
   where id = p_media_id and image_hash is null;

  get diagnostics escrita = row_count;
  return escrita;
end;
$$;

revoke all on function public.anotar_huella(uuid, text) from public;
grant execute on function public.anotar_huella(uuid, text) to service_role;

-- ---------------------------------------------------------------------
-- subidas_abandonadas — lo que quedó a medio camino
--
-- Alguien empieza a publicar, sube cuatro fotos y cierra la pestaña. Los
-- archivos quedan en el bucket sin ninguna fila que los apunte, ocupando
-- espacio que se paga, para siempre.
--
-- Esta función los encuentra. No los borra: devuelve la lista para que
-- el proceso de limpieza decida, y así un error en la consulta no se
-- lleva por delante las fotos de alguien.
-- ---------------------------------------------------------------------
create or replace function public.subidas_abandonadas(p_horas integer default 48)
returns table (bucket_id text, name text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, storage
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Solo el servidor lista subidas abandonadas'
      using errcode = '42501';
  end if;

  return query
    select o.bucket_id, o.name, o.created_at
      from storage.objects o
     where o.bucket_id in ('avisos', 'originales', 'generados')
       and o.created_at < now() - make_interval(hours => greatest(1, p_horas))
       and not exists (
         select 1 from public.property_media m
          where m.storage_path = o.name or m.original_path = o.name
       )
     order by o.created_at
     limit 1000;
end;
$$;

revoke all on function public.subidas_abandonadas(integer) from public;
grant execute on function public.subidas_abandonadas(integer) to service_role;

comment on function public.subidas_abandonadas(integer) is
  'Archivos en storage sin fila que los apunte. Devuelve la lista; no borra nada.';
