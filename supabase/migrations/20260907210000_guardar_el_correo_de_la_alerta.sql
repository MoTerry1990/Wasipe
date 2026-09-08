-- Guardar el correo que se compuso, no solo que se compuso.
--
-- La migración anterior dejaba constancia de a quién y por qué aviso,
-- pero no de QUÉ decía. Con el proveedor de bitácora —el único que hay
-- mientras no exista uno que entregue de verdad— eso deja el registro a
-- medias: se puede comprobar que la tarea corrió y no que el correo
-- estuviera bien escrito, que es justo lo que no se puede verificar de
-- otra forma sin un buzón.
--
-- El cuerpo no lleva nada que no sea público: títulos, distritos, precios
-- y enlaces de avisos publicados. La dirección de correo NO se guarda
-- acá; está en auth.users y se resuelve al enviar.

alter table public.notificaciones_de_alerta
  add column if not exists asunto text,
  add column if not exists cuerpo text;

comment on column public.notificaciones_de_alerta.cuerpo is
  'El correo tal como se compuso. Solo datos públicos de avisos publicados; la dirección del destinatario no se guarda acá.';
