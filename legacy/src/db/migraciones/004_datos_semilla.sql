-- =====================================================================
-- 004 · Datos iniciales
--
-- GENERADO por scripts/generar-semilla.js — no editar a mano.
--
-- Va como migración porque en un deploy manual nadie corre scripts: sin
-- ubicaciones el autocompletado queda vacío y no se puede publicar nada.
-- Todo con ON CONFLICT DO NOTHING, así que es seguro repetirlo.
-- =====================================================================

INSERT INTO ubicaciones (departamento, provincia, distrito, slug, alias, lat, lng, destacado) VALUES
  ('Lima','Lima','Ancón','ancon','{}',-11.775,-77.176,false),
  ('Lima','Lima','Ate','ate',ARRAY['Ate Vitarte','Vitarte'],-12.026,-76.918,false),
  ('Lima','Lima','Barranco','barranco','{}',-12.146,-77.021,true),
  ('Lima','Lima','Breña','brena',ARRAY['Brena'],-12.058,-77.05,false),
  ('Lima','Lima','Carabayllo','carabayllo','{}',-11.897,-77.036,false),
  ('Lima','Lima','Chaclacayo','chaclacayo','{}',-11.985,-76.767,false),
  ('Lima','Lima','Chorrillos','chorrillos','{}',-12.176,-77.016,true),
  ('Lima','Lima','Cieneguilla','cieneguilla','{}',-12.093,-76.809,false),
  ('Lima','Lima','Comas','comas','{}',-11.945,-77.048,false),
  ('Lima','Lima','El Agustino','el-agustino','{}',-12.041,-76.996,false),
  ('Lima','Lima','Independencia','independencia','{}',-11.99,-77.055,false),
  ('Lima','Lima','Jesús María','jesus-maria',ARRAY['Jesus Maria'],-12.075,-77.049,true),
  ('Lima','Lima','La Molina','la-molina','{}',-12.079,-76.943,true),
  ('Lima','Lima','La Victoria','la-victoria','{}',-12.068,-77.017,false),
  ('Lima','Lima','Lima','lima-cercado',ARRAY['Cercado de Lima','Centro de Lima','Cercado'],-12.046,-77.031,false),
  ('Lima','Lima','Lince','lince','{}',-12.084,-77.036,true),
  ('Lima','Lima','Los Olivos','los-olivos','{}',-11.958,-77.07,true),
  ('Lima','Lima','Lurigancho','lurigancho',ARRAY['Chosica','Lurigancho-Chosica'],-11.939,-76.702,false),
  ('Lima','Lima','Lurín','lurin',ARRAY['Lurin'],-12.274,-76.874,false),
  ('Lima','Lima','Magdalena del Mar','magdalena-del-mar',ARRAY['Magdalena'],-12.092,-77.07,true),
  ('Lima','Lima','Miraflores','miraflores','{}',-12.121,-77.03,true),
  ('Lima','Lima','Pachacámac','pachacamac',ARRAY['Pachacamac'],-12.229,-76.86,false),
  ('Lima','Lima','Pucusana','pucusana','{}',-12.481,-76.795,false),
  ('Lima','Lima','Pueblo Libre','pueblo-libre',ARRAY['Magdalena Vieja'],-12.074,-77.063,true),
  ('Lima','Lima','Puente Piedra','puente-piedra','{}',-11.865,-77.076,false),
  ('Lima','Lima','Punta Hermosa','punta-hermosa','{}',-12.336,-76.825,false),
  ('Lima','Lima','Punta Negra','punta-negra','{}',-12.365,-76.797,false),
  ('Lima','Lima','Rímac','rimac',ARRAY['Rimac'],-12.028,-77.029,false),
  ('Lima','Lima','San Bartolo','san-bartolo','{}',-12.389,-76.779,false),
  ('Lima','Lima','San Borja','san-borja','{}',-12.108,-76.999,true),
  ('Lima','Lima','San Isidro','san-isidro','{}',-12.097,-77.036,true),
  ('Lima','Lima','San Juan de Lurigancho','san-juan-de-lurigancho',ARRAY['SJL'],-11.977,-77.008,false),
  ('Lima','Lima','San Juan de Miraflores','san-juan-de-miraflores',ARRAY['SJM'],-12.159,-76.971,false),
  ('Lima','Lima','San Luis','san-luis','{}',-12.075,-76.996,false),
  ('Lima','Lima','San Martín de Porres','san-martin-de-porres',ARRAY['SMP','San Martin de Porres'],-12.021,-77.086,false),
  ('Lima','Lima','San Miguel','san-miguel','{}',-12.077,-77.093,true),
  ('Lima','Lima','Santa Anita','santa-anita','{}',-12.045,-76.966,false),
  ('Lima','Lima','Santa María del Mar','santa-maria-del-mar',ARRAY['Santa Maria'],-12.409,-76.771,false),
  ('Lima','Lima','Santa Rosa','santa-rosa','{}',-11.798,-77.169,false),
  ('Lima','Lima','Santiago de Surco','santiago-de-surco',ARRAY['Surco'],-12.145,-76.997,true),
  ('Lima','Lima','Surquillo','surquillo','{}',-12.112,-77.014,true),
  ('Lima','Lima','Villa El Salvador','villa-el-salvador',ARRAY['VES'],-12.213,-76.937,false),
  ('Lima','Lima','Villa María del Triunfo','villa-maria-del-triunfo',ARRAY['VMT','Villa Maria del Triunfo'],-12.163,-76.939,false),
  ('Callao','Callao','Callao','callao',ARRAY['Callao Cercado'],-12.056,-77.118,true),
  ('Callao','Callao','Bellavista','bellavista','{}',-12.061,-77.104,false),
  ('Callao','Callao','Carmen de la Legua Reynoso','carmen-de-la-legua',ARRAY['Carmen de la Legua'],-12.043,-77.093,false),
  ('Callao','Callao','La Perla','la-perla','{}',-12.07,-77.115,false),
  ('Callao','Callao','La Punta','la-punta','{}',-12.07,-77.164,false),
  ('Callao','Callao','Mi Perú','mi-peru',ARRAY['Mi Peru'],-11.859,-77.128,false),
  ('Callao','Callao','Ventanilla','ventanilla','{}',-11.874,-77.126,false),
  ('Arequipa','Arequipa','Arequipa','arequipa',ARRAY['Arequipa Cercado'],-16.409,-71.537,true),
  ('Arequipa','Arequipa','Cayma','cayma','{}',-16.376,-71.552,false),
  ('Arequipa','Arequipa','Yanahuara','yanahuara','{}',-16.391,-71.548,false),
  ('Arequipa','Arequipa','José Luis Bustamante y Rivero','jose-luis-bustamante-y-rivero',ARRAY['JLByR'],-16.427,-71.523,false),
  ('Arequipa','Arequipa','Cerro Colorado','cerro-colorado','{}',-16.373,-71.583,false),
  ('La Libertad','Trujillo','Trujillo','trujillo','{}',-8.112,-79.029,true),
  ('La Libertad','Trujillo','Víctor Larco Herrera','victor-larco-herrera',ARRAY['Victor Larco'],-8.138,-79.043,false),
  ('Lambayeque','Chiclayo','Chiclayo','chiclayo','{}',-6.772,-79.841,true),
  ('Piura','Piura','Piura','piura','{}',-5.194,-80.632,true),
  ('Piura','Piura','Castilla','castilla','{}',-5.199,-80.617,false),
  ('Cusco','Cusco','Cusco','cusco',ARRAY['Cuzco'],-13.532,-71.967,true),
  ('Cusco','Cusco','Wanchaq','wanchaq','{}',-13.527,-71.955,false),
  ('Cusco','Cusco','San Sebastián','san-sebastian',ARRAY['San Sebastian'],-13.539,-71.918,false),
  ('Junín','Huancayo','Huancayo','huancayo','{}',-12.068,-75.21,true),
  ('Junín','Huancayo','El Tambo','el-tambo','{}',-12.049,-75.216,false),
  ('Áncash','Huaraz','Huaraz','huaraz',ARRAY['Ancash'],-9.529,-77.529,false),
  ('Áncash','Santa','Chimbote','chimbote','{}',-9.075,-78.594,false),
  ('Ica','Ica','Ica','ica','{}',-14.068,-75.729,false),
  ('Tacna','Tacna','Tacna','tacna','{}',-18.014,-70.253,false),
  ('Loreto','Maynas','Iquitos','iquitos','{}',-3.749,-73.253,false),
  ('San Martín','San Martín','Tarapoto','tarapoto',ARRAY['San Martin'],-6.488,-76.365,false),
  ('Cajamarca','Cajamarca','Cajamarca','cajamarca','{}',-7.163,-78.5,false),
  ('Puno','Puno','Puno','puno','{}',-15.84,-70.022,false),
  ('Puno','San Román','Juliaca','juliaca',ARRAY['San Roman'],-15.5,-70.133,false)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO caracteristicas (slug, nombre, grupo, orden) VALUES
  ('ascensor','Ascensor','edificio',0),
  ('cochera','Cochera','edificio',1),
  ('piscina','Piscina','exterior',2),
  ('gimnasio','Gimnasio','edificio',3),
  ('acepta-mascotas','Acepta mascotas','servicios',4),
  ('amoblado','Amoblado','interior',5),
  ('seguridad-24h','Seguridad 24h','seguridad',6),
  ('areas-comunes','Áreas comunes','edificio',7),
  ('balcon','Balcón','exterior',8),
  ('deposito','Depósito','edificio',9),
  ('terraza','Terraza','exterior',10),
  ('jardin','Jardín','exterior',11),
  ('sala-de-juegos','Sala de juegos','edificio',12),
  ('vista-al-mar','Vista al mar','entorno',13),
  ('cerca-al-parque','Cerca a un parque','entorno',14),
  ('agua-caliente','Agua caliente','servicios',15),
  ('cocina-equipada','Cocina equipada','interior',16),
  ('closet-empotrado','Clósets empotrados','interior',17)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO planes (slug, nombre, precio, moneda, periodo, tope_avisos, tope_fotos,
                    tope_asientos, cuota_indice_mes, destacados_mes, dias_vigencia_aviso,
                    telefono_visible, para_rol, orden) VALUES
  ('gratis','Gratis',0,'PEN','gratis',2,8,1,5,0,90,false,ARRAY['comprador','propietario'],1),
  ('dueno-plus','Dueño Plus',39,'PEN','unico',3,30,1,NULL,1,90,true,ARRAY['propietario'],2),
  ('agente-inicial','Agente Inicial',69,'PEN','mensual',8,25,1,NULL,2,90,true,ARRAY['agente'],3),
  ('agente','Agente',139,'PEN','mensual',20,40,1,NULL,6,90,true,ARRAY['agente'],4),
  ('agente-pro','Agente Pro',249,'PEN','mensual',50,60,1,NULL,15,90,true,ARRAY['agente'],5),
  ('inmobiliaria','Inmobiliaria',449,'PEN','mensual',100,60,3,NULL,25,120,true,ARRAY['inmobiliaria'],6),
  ('inmobiliaria-plus','Inmobiliaria Plus',899,'PEN','mensual',300,80,10,NULL,60,120,true,ARRAY['inmobiliaria'],7),
  ('corporativa','Corporativa',1899,'PEN','mensual',NULL,100,30,NULL,150,120,true,ARRAY['inmobiliaria'],8)
ON CONFLICT (slug) DO NOTHING;

-- Tipo de cambio de arranque. El cron lo actualiza a diario.
INSERT INTO tipo_cambio (fecha, usd_a_pen, fuente)
VALUES (CURRENT_DATE, 3.75, 'inicial')
ON CONFLICT (fecha) DO NOTHING;
