-- Que el bucket público no pueda contener un original.
--
-- El sprint 18 creó el depósito privado `originales` y dio P-13 por
-- cerrado. Lo que quedó a medias fueron las políticas del bucket público
-- `avisos`, y se ve en el detalle:
--
--   DELETE  … AND (storage.foldername(name))[2] IS DISTINCT FROM 'original'
--   UPDATE  … AND (storage.foldername(name))[2] IS DISTINCT FROM 'original'
--   INSERT  … sin esa condición
--   SELECT  bucket_id = 'avisos'      ← sin ninguna condición de ruta
--
-- Quien la escribió pensó en la subcarpeta `original/` para borrar y para
-- reemplazar, y la dejó abierta para escribir y para leer. Por eso el
-- cliente pudo seguir subiendo ahí el archivo sin tocar —con sus
-- metadatos EXIF y las coordenadas GPS de la casa— y cualquiera podía
-- bajárselo adivinando la ruta:
--
--   /storage/v1/object/public/avisos/<aviso>/original/<marca>.bin
--
-- El código ya se corrigió: el original va al depósito privado. Esta
-- migración es la otra mitad, y es la que importa: **aunque alguien
-- vuelva a escribir mal el código, la base ya no lo va a dejar.** Una
-- protección que depende de que nadie se equivoque no es una protección.
--
-- El SELECT también se cierra, y no solo el INSERT: si quedó algún
-- original de antes en ese bucket, deja de ser público en el momento en
-- que esto se aplica.

-- ---------------------------------------------------------------------
-- Escribir
-- ---------------------------------------------------------------------
alter policy "sube fotos quien administra el aviso"
  on storage.objects
  with check (
    bucket_id = 'avisos'
    and administra_carpeta((storage.foldername(name))[1])
    and (storage.foldername(name))[2] is distinct from 'original'
  );

-- ---------------------------------------------------------------------
-- Leer
-- ---------------------------------------------------------------------
alter policy "las fotos de los avisos son publicas"
  on storage.objects
  using (
    bucket_id = 'avisos'
    and (storage.foldername(name))[2] is distinct from 'original'
  );
