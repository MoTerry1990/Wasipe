'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Campo } from '@/components/ui/campo';
import { Tarjeta, Insignia } from '@/components/ui/tarjeta';
import { Aviso } from '@/components/estados/estado-error';
import { Opciones, Etiquetas } from '@/features/cuentas/campos';
import { AutocompletadoUbicacion } from '@/features/busqueda/autocompletado-ubicacion';
import { Fotos, type FotoDelAviso } from '@/features/publicar/fotos';
import { AsistenteDeTexto } from '@/features/wasi-ai/asistente-de-texto';
import type { OperacionDeAsistente } from '@/lib/ia/asistente';
import { guardarBorrador, enviarARevision } from '@/features/publicar/acciones';
import {
  PASOS,
  revisarPaso,
  pasosIncompletos,
  sePuedeEnviar,
  type BorradorDeAviso,
  type ClaveDePaso,
} from '@/lib/validacion/aviso';
import { TIPOS_INMUEBLE } from '@/config/sitio';
import { ubicacionPorTexto } from '@/config/ubicaciones';
import { CARACTERISTICA } from '@/lib/etiquetas';
import { dinero, metros } from '@/lib/formato';
import { cn } from '@/lib/cn';
import type { Estado } from '@/features/cuentas/acciones';

/**
 * Asistente de publicación.
 *
 * Diez pasos con un solo estado en memoria y guardado automático contra
 * la base. Recargar la página, cerrar el navegador o seguir desde el
 * celular no pierde nada: el borrador vive en el servidor desde el
 * primer campo que se escribe.
 *
 * Se puede navegar libremente entre pasos aunque falten datos. Obligar a
 * completar en orden es lo que hace que alguien abandone en el paso 3
 * porque todavía no sabe el número exacto de metros. Lo que sí está
 * bloqueado es el envío: hasta que no esté todo, el botón no habilita y
 * se dice exactamente qué falta.
 */

const CADA = 2500;

type Props = {
  borradorInicial: string | null;
  datosIniciales: BorradorDeAviso;
  pasoInicial: number;
  /** Cuando se está editando un aviso ya creado. */
  avisoEnEdicion?: { code: string; motivoRechazo: string | null } | null;
  /** false cuando no hay proveedor de IA: el asistente se muestra apagado. */
  iaEncendida?: boolean;
};

export function Asistente({
  borradorInicial,
  datosIniciales,
  pasoInicial,
  avisoEnEdicion = null,
  iaEncendida = false,
}: Props) {
  const [datos, setDatos] = useState<BorradorDeAviso>(datosIniciales);
  const [paso, setPaso] = useState(pasoInicial);
  const [borradorId, setBorradorId] = useState(borradorInicial);
  const [guardado, setGuardado] = useState<'listo' | 'guardando' | 'error' | null>(null);
  const [envio, setEnvio] = useState<Estado>({});
  const [enviando, empezarEnvio] = useTransition();

  const sucio = useRef(false);
  const ultimo = useRef<string>(JSON.stringify(datosIniciales));

  const actual = PASOS[paso]!;
  const revision = revisarPaso(actual.clave, datos);
  const faltantes = pasosIncompletos(datos);

  function cambiar(parche: Partial<BorradorDeAviso>) {
    setDatos((previos) => ({ ...previos, ...parche }));
    sucio.current = true;
  }

  /** Guarda si algo cambió. Se llama sola y también al cambiar de paso. */
  const guardar = useCallback(
    async (pasoActual: number) => {
      const serializado = JSON.stringify(datos);
      if (serializado === ultimo.current) return;

      setGuardado('guardando');
      const resultado = await guardarBorrador(borradorId, datos, pasoActual);

      if (resultado.ok) {
        ultimo.current = serializado;
        sucio.current = false;
        if (resultado.id && !borradorId) setBorradorId(resultado.id);
        setGuardado('listo');
      } else {
        setGuardado('error');
      }
    },
    [datos, borradorId],
  );

  // Guardado automático. El temporizador se reinicia con cada cambio, así
  // que solo se escribe cuando la persona deja de escribir un momento.
  useEffect(() => {
    const reloj = window.setTimeout(() => void guardar(paso), CADA);
    return () => window.clearTimeout(reloj);
  }, [guardar, paso]);

  // Si se cierra la pestaña con algo sin guardar, se avisa.
  useEffect(() => {
    function alSalir(evento: BeforeUnloadEvent) {
      if (sucio.current) evento.preventDefault();
    }
    window.addEventListener('beforeunload', alSalir);
    return () => window.removeEventListener('beforeunload', alSalir);
  }, []);

  function ir(destino: number) {
    const siguiente = Math.min(Math.max(destino, 0), PASOS.length - 1);
    void guardar(siguiente);
    setPaso(siguiente);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function enviar() {
    if (!borradorId) return;
    empezarEnvio(async () => {
      await guardar(paso);
      const resultado = await enviarARevision(borradorId, datos);
      setEnvio(resultado);
    });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[clamp(1.5rem,3.4vw,2.125rem)]">
            {avisoEnEdicion ? 'Editar aviso' : 'Publicar una propiedad'}
          </h1>
          <p className="text-tinta-60 mt-1 text-[14.5px]">
            Paso <span className="cifra font-bold">{paso + 1}</span> de{' '}
            <span className="cifra">{PASOS.length}</span> · {actual.titulo}
          </p>
        </div>

        <p className="text-tinta-45 text-[13px]" aria-live="polite">
          {guardado === 'guardando' && 'Guardando…'}
          {guardado === 'listo' && 'Guardado'}
          {guardado === 'error' && 'No se pudo guardar. Reintentando…'}
        </p>
      </div>

      {avisoEnEdicion?.motivoRechazo && (
        <div className="mb-5">
          <Aviso tono="mal">
            <strong className="block">Este aviso fue rechazado.</strong>
            {avisoEnEdicion.motivoRechazo}
            <span className="mt-1 block">
              Corrige lo que te indicamos y vuelve a enviarlo: lo revisamos de nuevo.
            </span>
          </Aviso>
        </div>
      )}

      {/* Los pasos son navegables: se puede ir y volver sin perder nada. */}
      <nav aria-label="Pasos" className="mb-6 flex gap-1.5 overflow-x-auto pb-1">
        {PASOS.map((p, i) => {
          const incompleto = faltantes.includes(p.clave);
          return (
            <button
              key={p.clave}
              type="button"
              onClick={() => ir(i)}
              aria-current={i === paso ? 'step' : undefined}
              className={cn(
                'shrink-0 rounded-xl px-3 py-2 text-[13.5px] font-bold transition-colors',
                i === paso
                  ? 'bg-tinta text-white'
                  : incompleto
                    ? 'bg-fucsia-suave text-fucsia-osc'
                    : 'bg-turquesa-suave text-turquesa-osc',
              )}
            >
              {i + 1}. {p.titulo}
            </button>
          );
        })}
      </nav>

      <Tarjeta className="p-5 sm:p-6">
        <PasoActual
          clave={actual.clave}
          datos={datos}
          errores={revision.errores}
          carpeta={borradorId}
          faltantes={faltantes}
          iaEncendida={iaEncendida}
          cambiar={cambiar}
          ir={ir}
        />
      </Tarjeta>

      {envio.mensaje && (
        <div className="mt-4">
          <Aviso tono={envio.ok ? 'bien' : 'mal'}>{envio.mensaje}</Aviso>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => ir(paso - 1)}
          disabled={paso === 0}
          className="border-linea text-tinta-60 hover:border-tinta-40 rounded-xl border-[1.5px] bg-white px-5 py-3 text-[15px] font-bold transition-colors disabled:opacity-40"
        >
          Atrás
        </button>

        {paso < PASOS.length - 1 ? (
          <button
            type="button"
            onClick={() => ir(paso + 1)}
            className="bg-fucsia hover:bg-fucsia-osc rounded-xl px-6 py-3 text-[15px] font-bold text-white transition-colors"
          >
            Continuar
          </button>
        ) : (
          <button
            type="button"
            onClick={enviar}
            disabled={!sePuedeEnviar(datos) || enviando || !borradorId}
            className="bg-fucsia hover:bg-fucsia-osc rounded-xl px-6 py-3 text-[15px] font-bold text-white transition-colors disabled:opacity-50"
          >
            {enviando ? 'Enviando…' : 'Enviar a revisión'}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Los pasos
// ---------------------------------------------------------------------

/**
 * Paso de descripción, con Wasi AI al lado.
 *
 * Los campos son no controlados —se guardan al salir del campo, no en
 * cada tecla— así que aplicar un texto de la IA no basta con cambiar el
 * estado: hay que volver a montarlos. Eso hace `version`. Es más simple
 * que controlar dos campos de texto largos y volver a renderizar el
 * formulario entero con cada letra.
 */
function PasoDescripcion({
  datos,
  errores,
  iaEncendida,
  cambiar,
}: {
  datos: BorradorDeAviso;
  errores: Record<string, string>;
  iaEncendida: boolean;
  cambiar: (parche: Partial<BorradorDeAviso>) => void;
}) {
  const [version, setVersion] = useState(0);

  function aplicar(operacion: OperacionDeAsistente, texto: string) {
    cambiar(operacion === 'titulo' ? { titulo: texto } : { descripcion: texto });
    setVersion((n) => n + 1);
  }

  return (
    <div className="flex flex-col gap-5">
      <Campo
        key={`titulo-${version}`}
        etiqueta="Título del aviso"
        defaultValue={datos.titulo ?? ''}
        onBlur={(e) => cambiar({ titulo: e.target.value })}
        maxLength={120}
        placeholder="Departamento de 92 m² a dos cuadras del parque Kennedy"
        pista="Lo primero que se lee. Di qué es, cuánto mide y dónde queda."
        error={errores.titulo}
      />

      <div>
        <label
          htmlFor="descripcion"
          className="text-tinta mb-1.5 block text-[14.5px] font-bold"
        >
          Descripción
        </label>
        <textarea
          key={`descripcion-${version}`}
          id="descripcion"
          rows={8}
          defaultValue={datos.descripcion ?? ''}
          onBlur={(e) => cambiar({ descripcion: e.target.value })}
          maxLength={6000}
          placeholder="Cuenta cómo es: los ambientes, la luz, el edificio, el barrio. Lo que a ti te gustó."
          className="border-linea bg-niebla text-tinta focus:border-fucsia w-full rounded-xl border-[1.5px] px-3.5 py-3 text-[15px] focus:bg-white focus:outline-none"
        />
        {errores.descripcion && (
          <p className="text-fucsia-osc mt-1.5 text-[13.5px] font-semibold" role="alert">
            {errores.descripcion}
          </p>
        )}
      </div>

      <AsistenteDeTexto
        datos={datos}
        operaciones={
          (datos.descripcion ?? '').trim().length >= 40
            ? (['titulo', 'descripcion', 'mejorar'] as const)
            : (['titulo', 'descripcion'] as const)
        }
        aplicar={aplicar}
        encendido={iaEncendida}
      />
    </div>
  );
}

type PasoProps = {
  clave: ClaveDePaso;
  datos: BorradorDeAviso;
  errores: Record<string, string>;
  carpeta: string | null;
  faltantes: ClaveDePaso[];
  iaEncendida: boolean;
  cambiar: (parche: Partial<BorradorDeAviso>) => void;
  ir: (destino: number) => void;
};

function PasoActual({
  clave,
  datos,
  errores,
  carpeta,
  faltantes,
  iaEncendida,
  cambiar,
  ir,
}: PasoProps) {
  switch (clave) {
    case 'operacion':
      return (
        <div className="flex flex-col gap-6">
          <Opciones
            nombre="operacion"
            leyenda="¿Qué quieres hacer?"
            valorInicial={datos.operacion}
            columnas={2}
            error={errores.operacion}
            opciones={[
              { valor: 'sale', titulo: 'Vender', detalle: 'Casa, departamento o terreno.' },
              { valor: 'rent', titulo: 'Alquilar', detalle: 'Por mes, con contrato.' },
              { valor: 'project', titulo: 'Proyecto', detalle: 'En preventa o construcción.' },
            ]}
          />
          {/* Los grupos de opciones son campos nativos: se leen del DOM. */}
          <div
            onChange={(e) => {
              const control = e.target as HTMLInputElement;
              if (control.name === 'operacion') {
                cambiar({ operacion: control.value as BorradorDeAviso['operacion'] });
              }
              if (control.name === 'tipo') cambiar({ tipo: control.value });
            }}
          >
            <Opciones
              nombre="tipo"
              leyenda="¿Qué tipo de propiedad es?"
              valorInicial={datos.tipo}
              columnas={2}
              error={errores.tipo}
              opciones={TIPOS_INMUEBLE.map((t) => ({ valor: t.valor, titulo: t.texto }))}
            />
          </div>
        </div>
      );

    case 'ubicacion':
      return (
        <div className="flex flex-col gap-5">
          <div>
            <label className="text-tinta mb-1.5 block text-[14.5px] font-bold">Distrito</label>
            <div
              onBlur={(e) => {
                const valor = (e.target as HTMLInputElement).value;
                const ubicacion = ubicacionPorTexto(valor);
                cambiar({
                  distrito: ubicacion?.nombre ?? valor,
                  provincia: ubicacion?.provincia ?? datos.provincia,
                  departamento: ubicacion?.departamento ?? datos.departamento,
                });
              }}
            >
              <AutocompletadoUbicacion nombre="distrito" valorInicial={datos.distrito ?? ''} />
            </div>
            {errores.distrito && (
              <p className="text-fucsia-osc mt-1.5 text-[13.5px] font-semibold" role="alert">
                {errores.distrito}
              </p>
            )}
          </div>

          <Campo
            etiqueta="Dirección"
            defaultValue={datos.direccion ?? ''}
            onBlur={(e) => cambiar({ direccion: e.target.value })}
            placeholder="Calle Berlín 245"
            pista="La necesitamos para ubicar la propiedad. Abajo eliges cuánto se muestra."
            error={errores.direccion}
          />

          <Campo
            etiqueta="Urbanización o edificio (opcional)"
            defaultValue={datos.urbanizacion ?? ''}
            onBlur={(e) => cambiar({ urbanizacion: e.target.value })}
          />

          <Campo
            etiqueta="Referencia (opcional)"
            defaultValue={datos.referencia ?? ''}
            onBlur={(e) => cambiar({ referencia: e.target.value })}
            placeholder="A media cuadra del parque Kennedy"
          />

          <div
            onChange={(e) => {
              const control = e.target as HTMLInputElement;
              if (control.name === 'privacidad') {
                cambiar({ privacidad: control.value as BorradorDeAviso['privacidad'] });
              }
            }}
          >
            <Opciones
              nombre="privacidad"
              leyenda="¿Cuánto de la dirección quieres mostrar?"
              valorInicial={datos.privacidad ?? 'approximate'}
              error={errores.privacidad}
              opciones={[
                {
                  valor: 'approximate',
                  titulo: 'Ubicación aproximada',
                  detalle: 'Lo más común: el mapa muestra un punto a unos 300 m del real.',
                },
                {
                  valor: 'district_only',
                  titulo: 'Solo el distrito',
                  detalle: 'Sin punto en el mapa. Se coordina la dirección al conversar.',
                },
                {
                  valor: 'exact',
                  titulo: 'Dirección exacta',
                  detalle: 'Se publica la calle y el número. Útil para locales comerciales.',
                },
              ]}
            />
          </div>
        </div>
      );

    case 'precio':
      return (
        <div className="flex flex-col gap-5">
          <div
            onChange={(e) => {
              const control = e.target as HTMLInputElement;
              if (control.name === 'moneda') {
                cambiar({ moneda: control.value as BorradorDeAviso['moneda'] });
              }
            }}
          >
            <Opciones
              nombre="moneda"
              leyenda="¿En qué moneda?"
              valorInicial={datos.moneda ?? 'USD'}
              columnas={2}
              error={errores.moneda}
              opciones={[
                { valor: 'USD', titulo: 'Dólares', detalle: 'Lo habitual en venta.' },
                { valor: 'PEN', titulo: 'Soles', detalle: 'Lo habitual en alquiler.' },
              ]}
            />
          </div>

          <Campo
            etiqueta="Precio"
            type="number"
            inputMode="numeric"
            defaultValue={datos.precio ?? ''}
            onBlur={(e) => cambiar({ precio: Number(e.target.value) || undefined })}
            placeholder="195000"
            error={errores.precio}
          />

          <Campo
            etiqueta="Mantenimiento mensual (opcional)"
            type="number"
            inputMode="numeric"
            defaultValue={datos.mantenimiento ?? ''}
            onBlur={(e) => cambiar({ mantenimiento: Number(e.target.value) || undefined })}
            pista="Lo que se paga al edificio cada mes, en la misma moneda del precio."
            error={errores.mantenimiento}
          />
        </div>
      );

    case 'areas':
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            etiqueta="Área total (m²)"
            type="number"
            inputMode="numeric"
            defaultValue={datos.areaTotal ?? ''}
            onBlur={(e) => cambiar({ areaTotal: Number(e.target.value) || undefined })}
            error={errores.areaTotal}
          />
          <Campo
            etiqueta="Área techada (m²)"
            type="number"
            inputMode="numeric"
            defaultValue={datos.areaTechada ?? ''}
            onBlur={(e) => cambiar({ areaTechada: Number(e.target.value) || undefined })}
            pista="Lo construido. En un departamento suele ser igual al total."
            error={errores.areaTechada}
          />
          <Campo
            etiqueta="Dormitorios"
            type="number"
            inputMode="numeric"
            defaultValue={datos.dormitorios ?? ''}
            onBlur={(e) => cambiar({ dormitorios: Number(e.target.value) || undefined })}
            error={errores.dormitorios}
          />
          <Campo
            etiqueta="Baños"
            type="number"
            inputMode="numeric"
            defaultValue={datos.banos ?? ''}
            onBlur={(e) => cambiar({ banos: Number(e.target.value) || undefined })}
            error={errores.banos}
          />
          <Campo
            etiqueta="Cocheras"
            type="number"
            inputMode="numeric"
            defaultValue={datos.cocheras ?? ''}
            onBlur={(e) => cambiar({ cocheras: Number(e.target.value) || undefined })}
            error={errores.cocheras}
          />
          <Campo
            etiqueta="Antigüedad (años)"
            type="number"
            inputMode="numeric"
            defaultValue={datos.antiguedad ?? ''}
            onBlur={(e) => cambiar({ antiguedad: Number(e.target.value) || undefined })}
            pista="0 si es a estrenar."
            error={errores.antiguedad}
          />
        </div>
      );

    case 'caracteristicas':
      return (
        <div className="flex flex-col gap-6">
          <div
            onChange={(e) => {
              const control = e.target as HTMLInputElement;
              if (control.name === 'amoblado') {
                cambiar({ amoblado: control.value as BorradorDeAviso['amoblado'] });
              }
              if (control.name === 'mascotas') {
                cambiar({ mascotas: control.value as BorradorDeAviso['mascotas'] });
              }
            }}
          >
            <Opciones
              nombre="amoblado"
              leyenda="¿Está amoblado?"
              valorInicial={datos.amoblado ?? 'none'}
              columnas={2}
              opciones={[
                { valor: 'none', titulo: 'Sin amoblar' },
                { valor: 'partial', titulo: 'Parcialmente' },
                { valor: 'full', titulo: 'Amoblado' },
              ]}
            />

            <div className="mt-6">
              <Opciones
                nombre="mascotas"
                leyenda="¿Acepta mascotas?"
                valorInicial={datos.mascotas}
                columnas={2}
                opciones={[
                  { valor: 'allowed', titulo: 'Sí' },
                  { valor: 'not_allowed', titulo: 'No' },
                  { valor: 'negotiable', titulo: 'A conversar' },
                ]}
              />
            </div>
          </div>

          <div
            onChange={(e) => {
              const control = e.target as HTMLInputElement;
              if (control.name !== 'caracteristicas') return;
              const actuales = new Set(datos.caracteristicas ?? []);
              if (control.checked) actuales.add(control.value);
              else actuales.delete(control.value);
              cambiar({ caracteristicas: [...actuales] });
            }}
          >
            <Etiquetas
              nombre="caracteristicas"
              leyenda="¿Qué más tiene?"
              ayuda="Toca todo lo que corresponda."
              opciones={Object.keys(CARACTERISTICA)}
              seleccionadas={datos.caracteristicas ?? []}
            />
          </div>
        </div>
      );

    case 'descripcion':
      return (
        <PasoDescripcion
          datos={datos}
          errores={errores}
          iaEncendida={iaEncendida}
          cambiar={cambiar}
        />
      );

    case 'fotos':
      return (
        <div className="flex flex-col gap-5">
          {carpeta ? (
            <Fotos
              carpeta={carpeta}
              fotos={(datos.fotos ?? []) as FotoDelAviso[]}
              onCambio={(fotos) => cambiar({ fotos })}
            />
          ) : (
            <Aviso tono="mal">
              Escribe algo en cualquier paso anterior para que guardemos el borrador. Recién ahí
              podemos subir tus fotos.
            </Aviso>
          )}

          {errores.fotos && <Aviso tono="mal">{errores.fotos}</Aviso>}

          <Campo
            etiqueta="Video (opcional)"
            defaultValue={datos.video ?? ''}
            onBlur={(e) => cambiar({ video: e.target.value })}
            placeholder="https://www.youtube.com/watch?v=…"
            pista="Un recorrido en video multiplica las consultas."
            error={errores.video}
          />
        </div>
      );

    case 'contacto':
      return (
        <div className="flex flex-col gap-5">
          <Campo
            etiqueta="Tu celular"
            type="tel"
            inputMode="numeric"
            defaultValue={datos.celular ?? ''}
            onBlur={(e) => cambiar({ celular: e.target.value })}
            placeholder="987654321"
            pista="Se muestra recién cuando alguien toca «ver teléfono»."
            error={errores.celular}
          />

          <div
            onChange={(e) => {
              const control = e.target as HTMLInputElement;
              if (control.name === 'contacto') {
                cambiar({ contacto: control.value as BorradorDeAviso['contacto'] });
              }
            }}
          >
            <Opciones
              nombre="contacto"
              leyenda="¿Cómo prefieres que te escriban?"
              valorInicial={datos.contacto ?? 'whatsapp'}
              columnas={2}
              error={errores.contacto}
              opciones={[
                { valor: 'whatsapp', titulo: 'WhatsApp' },
                { valor: 'phone', titulo: 'Llamada' },
                { valor: 'email', titulo: 'Correo' },
              ]}
            />
          </div>
        </div>
      );

    case 'vista-previa':
      return <VistaPrevia datos={datos} />;

    case 'envio':
      return (
        <div className="flex flex-col gap-4">
          <h2 className="text-lg">Enviar a revisión</h2>

          {faltantes.length === 0 ? (
            <>
              <Aviso tono="bien">Tu aviso está completo y listo para enviarse.</Aviso>
              <p className="text-tinta-60 text-[14.5px]">
                Lo revisa una persona del equipo antes de que salga publicado. Suele tomar unas
                horas. Te avisamos cuando esté, y si hay algo que corregir te decimos qué.
              </p>
              <p className="text-tinta-45 text-[13.5px]">
                Publicar es gratis. No pedimos tarjeta ni hay plan mínimo.
              </p>
            </>
          ) : (
            <>
              <Aviso tono="mal">
                Falta completar{' '}
                {faltantes.length === 1 ? 'un paso' : `${faltantes.length} pasos`}.
              </Aviso>
              <ul className="flex flex-col gap-2">
                {faltantes.map((clave) => {
                  const indice = PASOS.findIndex((p) => p.clave === clave);
                  return (
                    <li key={clave}>
                      <button
                        type="button"
                        onClick={() => ir(indice)}
                        className="border-linea hover:border-fucsia flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors"
                      >
                        <span className="text-tinta text-[14.5px] font-semibold">
                          {indice + 1}. {PASOS[indice]?.titulo}
                        </span>
                        <span className="text-fucsia text-[13.5px] font-bold">Completar →</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      );

    default:
      return null;
  }
}

/**
 * Vista previa.
 *
 * Se arma con los mismos datos que va a guardar el envío, así que lo que
 * se ve acá es lo que va a quedar publicado. No es una maqueta aparte:
 * una vista previa que no coincide con el resultado es peor que no
 * tenerla.
 */
function VistaPrevia({ datos }: { datos: BorradorDeAviso }) {
  const portada = (datos.fotos ?? []).find((f) => f.portada) ?? datos.fotos?.[0];
  const area = datos.areaTechada ?? datos.areaTotal;
  const porM2 = datos.precio && area ? Math.round(datos.precio / area) : null;

  return (
    <div>
      <h2 className="mb-4 text-lg">Así se va a ver tu aviso</h2>

      <div className="border-linea overflow-hidden rounded-2xl border">
        <div className="bg-niebla relative aspect-[16/10]">
          {portada ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={portada.url} alt={portada.alt || ''} className="size-full object-cover" />
          ) : (
            <div className="text-tinta-40 grid h-full place-items-center text-[14px]">
              Todavía no subiste fotos
            </div>
          )}
        </div>

        <div className="p-5">
          <div className="flex flex-wrap items-center gap-2">
            {datos.tipo && (
              <Insignia tono="neutro">
                {TIPOS_INMUEBLE.find((t) => t.valor === datos.tipo)?.texto ?? datos.tipo}
              </Insignia>
            )}
            <Insignia tono="maiz">Se publica tras la revisión</Insignia>
          </div>

          <p className="cifra text-tinta mt-3 text-2xl font-extrabold">
            {datos.precio && datos.moneda
              ? dinero(datos.precio, datos.moneda)
              : 'Falta el precio'}
          </p>

          {porM2 && datos.moneda && (
            <p className="cifra text-turquesa-osc text-[14px] font-bold">
              {dinero(porM2, datos.moneda)} por m²
            </p>
          )}

          <h3 className="font-texto text-tinta mt-2 text-[17px] font-bold">
            {datos.titulo || 'Falta el título'}
          </h3>

          <p className="text-tinta-60 mt-1 text-[14px]">
            {datos.distrito ?? 'Falta el distrito'}
            {datos.areaTotal ? ` · ${metros(datos.areaTotal)}` : ''}
            {datos.dormitorios !== undefined ? ` · ${datos.dormitorios} dorm.` : ''}
          </p>

          <p className="text-tinta-70 mt-3 text-[14.5px] whitespace-pre-line">
            {datos.descripcion || 'Falta la descripción'}
          </p>
        </div>
      </div>

      <p className="text-tinta-45 mt-3 text-[13px]">
        La dirección exacta no se publica:{' '}
        {datos.privacidad === 'exact'
          ? 'elegiste mostrarla, así que sí se verá completa.'
          : datos.privacidad === 'district_only'
            ? 'elegiste mostrar solo el distrito.'
            : 'el mapa mostrará un punto a unos 300 m del real.'}{' '}
        <Link href="/#confianza" className="text-fucsia font-semibold hover:underline">
          Cómo cuidamos tus datos
        </Link>
      </p>
    </div>
  );
}
