-- «Al instante» no existe: la tarea corre una vez al día.
--
-- `alert_frequency` ofrecía `instant` y el panel lo mostraba como «Apenas
-- aparezca». La tarea de alertas corre con el cron de Vercel, una vez al
-- día, y trataba `instant` como diario. O sea que quien elegía esa opción
-- se enteraba al día siguiente y creía que había llegado tarde por su
-- culpa.
--
-- Prometer un aviso instantáneo y mandarlo mañana es peor que no
-- ofrecerlo: rompe la confianza justo en lo único que hace útil a una
-- alerta, que es llegar a tiempo.
--
-- El valor se queda en el enum porque una migración aplicada no se toca y
-- quitar un valor de un enum obliga a recrearlo entero. Lo que se hace es
-- que nada lo produzca:
--
--   · la acción que guarda búsquedas ya no lo acepta y cae en `daily`;
--   · el panel lo muestra como «Un resumen al día», que es la verdad;
--   · y las filas que ya existían se normalizan acá.
--
-- El día que haya una frecuencia instantánea de verdad —una cola, un
-- disparador, un cron más fino— se vuelve a ofrecer y esta migración
-- queda como la constancia de por qué no estaba.

update public.saved_searches
   set alert_frequency = 'daily'
 where alert_frequency = 'instant';
