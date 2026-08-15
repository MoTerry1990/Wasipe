-- =====================================================================
-- 20260816090200 — Almacenamiento: fotos de perfil y logos
--
-- Dos cubetas públicas de lectura. Que sean públicas no significa que
-- cualquiera pueda escribir en ellas: las políticas de storage.objects
-- solo dejan tocar los archivos que están dentro de la carpeta con el
-- identificador de quien sube.
--
--     avatares/<id-de-usuario>/foto.webp
--     logos/<id-de-inmobiliaria>/logo.webp
--
-- El límite de tamaño y los tipos permitidos se declaran en la cubeta,
-- así que el servidor de Supabase rechaza un archivo inválido aunque el
-- cliente esté modificado.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatares', 'avatares', true, 2097152,   -- 2 MB
   array['image/jpeg', 'image/png', 'image/webp']),
  ('logos', 'logos', true, 2097152,
   array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------
-- Fotos de perfil
-- ---------------------------------------------------------------------
create policy "las fotos de perfil son publicas"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'avatares');

create policy "cada quien sube su propia foto"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "cada quien reemplaza su propia foto"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "cada quien borra su propia foto"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------
-- Logos de inmobiliaria
--
-- La carpeta es el id de la inmobiliaria, y solo puede escribir en ella
-- quien la administra.
-- ---------------------------------------------------------------------
create policy "los logos son publicos"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'logos');

create policy "el logo lo sube quien administra la inmobiliaria"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'logos'
    and public.administra_agencia(((storage.foldername(name))[1])::uuid)
  );

create policy "el logo lo reemplaza quien administra la inmobiliaria"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'logos'
    and public.administra_agencia(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'logos'
    and public.administra_agencia(((storage.foldername(name))[1])::uuid)
  );

create policy "el logo lo borra quien administra la inmobiliaria"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'logos'
    and public.administra_agencia(((storage.foldername(name))[1])::uuid)
  );
