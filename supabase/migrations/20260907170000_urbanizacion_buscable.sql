-- La urbanización, como nivel de búsqueda.
--
-- El dato ya se pedía al publicar y se guardaba en
-- `property_locations.urbanization`. No se podía buscar por él, y no por
-- olvido: **`lib/consultas/buscar.ts` no toca esa tabla a propósito**,
-- porque ahí vive la dirección exacta y no puede entrar al listado ni por
-- un `select *` distraído. Filtrar con un join habría roto esa regla, y
-- además habría chocado con la política `direccion exacta solo si se
-- autorizo`, que solo abre la fila cuando quien publicó eligió `exact`.
--
-- Así que la urbanización se copia a `properties`, que es donde vive lo
-- publicable: junto a `district` y `province`, no junto a la calle. Una
-- urbanización es un nivel de zona, no una dirección.
--
-- **Y se copia solo si la privacidad elegida lo permite.**
--
-- Ahí está lo que hay que no equivocar. Quien eligió `district_only`
-- pidió que se supiera su distrito y nada más. La urbanización acota
-- muchísimo más que el distrito —de Miraflores entero a unas pocas
-- cuadras— así que publicarla igual sería desdecir su elección con una
-- función nueva. Para esas filas la columna queda en nulo: el aviso
-- existe, se encuentra por distrito, y no aparece en un filtro de zona.
--
-- Con `exact` y con `approximate` sí se copia: las dos ya dicen dónde
-- queda, y en `approximate` el punto del mapa ya viene desplazado.

alter table public.properties
  add column if not exists urbanization text;

comment on column public.properties.urbanization is
  'Zona publicable, copiada de property_locations solo cuando address_privacy lo permite. Nula si quien publicó eligió mostrar solo el distrito.';

-- Relleno de lo que ya existe, con la misma regla.
update public.properties p
   set urbanization = l.urbanization
  from public.property_locations l
 where l.property_id = p.id
   and l.urbanization is not null
   and l.urbanization <> ''
   and p.address_privacy in ('exact', 'approximate');

-- Se busca por texto y sin tildes, igual que el distrito: quien escribe
-- «chacarilla» tiene que encontrar «Chacarilla».
--
-- Con `sin_tildes()` y no con `unaccent()` directo: unaccent es STABLE
-- —depende de un diccionario que en teoría puede cambiar— y Postgres no
-- admite una función STABLE en la expresión de un índice. El envoltorio
-- inmutable ya existía desde la primera migración, y es el que usa el
-- índice del distrito.
create index if not exists properties_urbanizacion_trgm_idx
  on public.properties using gin (public.sin_tildes(urbanization) gin_trgm_ops);
