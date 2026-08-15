-- =====================================================================
-- 005 · Índice de arranque
--
-- GENERADO por scripts/generar-semilla.js — no editar a mano.
--
-- muestras = 0  =>  la API lo reporta como confianza "provisional".
-- NO son datos de mercado: existen para que el panel y el badge
-- "vs mercado" funcionen desde el primer día. Reemplazar con el CSV
-- mensual real antes de tener usuarios de verdad.
-- =====================================================================

INSERT INTO indice_precios (ubicacion_id, periodo, precio_m2_usd, alquiler_2d_pen,
                            muestras, publicado) VALUES
  ((SELECT id FROM ubicaciones WHERE slug = 'san-isidro'), to_char(now(),'YYYY-MM'), 2600, 4200, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'miraflores'), to_char(now(),'YYYY-MM'), 2300, 3900, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'barranco'), to_char(now(),'YYYY-MM'), 2150, 3500, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'san-borja'), to_char(now(),'YYYY-MM'), 1950, 3100, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'santiago-de-surco'), to_char(now(),'YYYY-MM'), 1850, 3000, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'la-molina'), to_char(now(),'YYYY-MM'), 1700, 2900, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'jesus-maria'), to_char(now(),'YYYY-MM'), 1600, 2500, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'magdalena-del-mar'), to_char(now(),'YYYY-MM'), 1600, 2450, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'lince'), to_char(now(),'YYYY-MM'), 1550, 2350, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'pueblo-libre'), to_char(now(),'YYYY-MM'), 1500, 2300, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'surquillo'), to_char(now(),'YYYY-MM'), 1500, 2250, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'san-miguel'), to_char(now(),'YYYY-MM'), 1450, 2200, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'callao'), to_char(now(),'YYYY-MM'), 1050, 1500, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'chorrillos'), to_char(now(),'YYYY-MM'), 1250, 1900, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'los-olivos'), to_char(now(),'YYYY-MM'), 1100, 1500, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'brena'), to_char(now(),'YYYY-MM'), 1200, 1750, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'ate'), to_char(now(),'YYYY-MM'), 950, 1350, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'comas'), to_char(now(),'YYYY-MM'), 900, 1200, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'san-martin-de-porres'), to_char(now(),'YYYY-MM'), 1000, 1350, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'santa-anita'), to_char(now(),'YYYY-MM'), 950, 1300, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'arequipa'), to_char(now(),'YYYY-MM'), 1100, 1500, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'trujillo'), to_char(now(),'YYYY-MM'), 1000, 1400, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'cusco'), to_char(now(),'YYYY-MM'), 1150, 1500, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'chiclayo'), to_char(now(),'YYYY-MM'), 900, 1250, 0, true),
  ((SELECT id FROM ubicaciones WHERE slug = 'piura'), to_char(now(),'YYYY-MM'), 900, 1200, 0, true)
ON CONFLICT (ubicacion_id, periodo) DO NOTHING;
