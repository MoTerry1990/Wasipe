/**
 * Serializa datos para meterlos dentro de un `<script>`.
 *
 * `JSON.stringify` **no** escapa `<`, y eso alcanza para un XSS: dentro
 * de un bloque `<script>` el navegador corta en el primer `</script>` que
 * encuentra, sin importar que esté dentro de una cadena JSON. Un aviso
 * titulado
 *
 *     Lindo depa </script><img src=x onerror=alert(1)>
 *
 * cerraba el bloque de datos estructurados y lo que venía después se
 * dibujaba como HTML. Los títulos los escribe cualquiera que publique.
 *
 * Se escapan tres caracteres, en forma de secuencia unicode. Dentro de
 * una cadena JSON `\u003c` significa exactamente lo mismo que `<`, así
 * que un buscador lee el mismo dato; el navegador, en cambio, ya no ve
 * una etiqueta que cerrar.
 *
 *  · `<` cubre `</script>` y también `<!--`, que abre un comentario y
 *    cambia cómo se interpreta el resto del bloque.
 *  · `>` cubre `-->`.
 *  · `&` evita que una entidad quede a medio formar al concatenar.
 *
 * Es el mismo tratamiento que hacen las bibliotecas serias de JSON-LD, y
 * cuesta tres reemplazos.
 */
export function aJsonSeguro(datos: unknown): string {
  // Las secuencias llevan doble barra a propósito: lo que tiene que
  // quedar en la salida son los seis caracteres de `\u003c`, no el
  // carácter `<` otra vez. Con una sola barra el reemplazo no hace nada,
  // que es peor que no tenerlo, porque parece hecho. Pasó acá.
  return JSON.stringify(datos)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026');
}
