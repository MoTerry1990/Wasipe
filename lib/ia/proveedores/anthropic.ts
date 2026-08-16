import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import {
  FallaDeProveedor,
  type PeticionDeTexto,
  type ProveedorDeIA,
  type RespuestaDeTexto,
} from '@/lib/ia/proveedor';

/**
 * Adaptador de Anthropic (Claude).
 *
 * Es un adaptador más, no «el» proveedor: todo lo específico de esta
 * empresa —el nombre del SDK, la forma de los mensajes, los nombres de
 * los modelos— queda encerrado en este archivo. El resto de Wasipe solo
 * conoce `ProveedorDeIA`.
 *
 * `server-only` es una barrera de compilación: si alguien importa esto
 * desde un componente de cliente, el build falla en vez de mandar la
 * clave al navegador.
 */

/** Modelo por defecto. Se puede fijar otro con IA_MODELO. */
const MODELO = 'claude-opus-5';

export function proveedorAnthropic(): ProveedorDeIA {
  const clave = process.env.ANTHROPIC_API_KEY?.trim();
  const modelo = process.env.IA_MODELO?.trim() || MODELO;

  return {
    nombre: 'anthropic',

    disponible: () => Boolean(clave),

    async generarTexto(peticion: PeticionDeTexto): Promise<RespuestaDeTexto> {
      if (!clave) {
        throw new FallaDeProveedor(
          'Wasi AI todavía no está configurado.',
          'Falta ANTHROPIC_API_KEY',
          false,
        );
      }

      const cliente = new Anthropic({
        apiKey: clave,
        maxRetries: 1,
        timeout: peticion.milisegundos ?? 45_000,
      });

      try {
        // Se transmite en lugar de esperar la respuesta entera: con
        // textos largos una petición sin streaming se topa con el tiempo
        // de espera del SDK antes de que el modelo termine.
        const flujo = cliente.messages.stream({
          model: modelo,
          max_tokens: peticion.maximoTokens,
          thinking: { type: 'adaptive' },
          output_config: { effort: 'medium' },
          system: peticion.sistema,
          messages: peticion.mensajes.map((m) => ({
            role: m.rol === 'usuario' ? ('user' as const) : ('assistant' as const),
            content: m.texto,
          })),
        });

        const respuesta = await flujo.finalMessage();

        // Los clasificadores del proveedor pueden negarse a responder.
        // Eso no es una caída: es una respuesta, y hay que tratarla como
        // tal para no reintentar en vano.
        if (respuesta.stop_reason === 'refusal') {
          throw new FallaDeProveedor(
            'Wasi AI no pudo redactar esto. Revisa que el texto describa una propiedad.',
            'stop_reason: refusal',
            false,
          );
        }

        const texto = respuesta.content
          .filter((bloque) => bloque.type === 'text')
          .map((bloque) => bloque.text)
          .join('')
          .trim();

        if (!texto) {
          throw new FallaDeProveedor(
            'Wasi AI devolvió una respuesta vacía. Vuelve a intentarlo.',
            `respuesta sin texto (stop_reason: ${respuesta.stop_reason})`,
          );
        }

        return {
          texto,
          proveedor: 'anthropic',
          modelo: respuesta.model,
          tokens: {
            entrada: respuesta.usage.input_tokens,
            salida: respuesta.usage.output_tokens,
          },
        };
      } catch (error) {
        if (error instanceof FallaDeProveedor) throw error;

        if (error instanceof Anthropic.RateLimitError) {
          throw new FallaDeProveedor(
            'Wasi AI está recibiendo muchos pedidos. Intenta de nuevo en un minuto.',
            'rate_limit',
          );
        }
        if (error instanceof Anthropic.AuthenticationError) {
          throw new FallaDeProveedor(
            'Wasi AI no está disponible en este momento.',
            'credencial rechazada',
            false,
          );
        }
        if (error instanceof Anthropic.APIError) {
          throw new FallaDeProveedor(
            'Wasi AI no está disponible en este momento.',
            `api ${error.status ?? '?'}: ${error.name}`,
          );
        }

        throw new FallaDeProveedor(
          'Wasi AI no está disponible en este momento.',
          error instanceof Error ? error.message : 'error desconocido',
        );
      }
    },
  };
}
