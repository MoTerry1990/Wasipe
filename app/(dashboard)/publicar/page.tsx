import type { Metadata } from 'next';
import { Contenedor } from '@/components/ui/contenedor';
import { Tarjeta, Insignia } from '@/components/ui/tarjeta';
import { Boton } from '@/components/ui/boton';

export const metadata: Metadata = {
  title: 'Publicar gratis',
  description:
    'Publica tu propiedad en Wasipe. Hasta 2 avisos gratis, para siempre. Propietarios, corredores e inmobiliarias.',
  alternates: { canonical: '/publicar' },
};

const PERFILES = [
  {
    titulo: 'Soy propietario',
    texto: 'Publica desde tu celular, sin intermediarios.',
    destaque: '2 avisos gratis y 5 consultas al índice por mes.',
  },
  {
    titulo: 'Soy corredor inmobiliario',
    texto: 'Tu cartera en un panel, con bandeja de contactos.',
    destaque: 'Índice sin tope y perfil público propio.',
  },
  {
    titulo: 'Somos inmobiliaria',
    texto: 'Proyectos con tipologías, avance de obra y stock.',
    destaque: 'Tu equipo, en un solo panel.',
  },
];

export default function Publicar() {
  return (
    <Contenedor className="py-10 sm:py-14">
      <header className="mx-auto max-w-2xl text-center">
        <h1 className="text-[clamp(1.6rem,4vw,2.25rem)]">Publica gratis, seas quien seas</h1>
        <p className="mx-auto mt-3 max-w-[50ch] text-tinta-60">
          Propietarios, corredores inmobiliarios e inmobiliarias trabajan en el mismo portal,
          cada uno con su panel.
        </p>
      </header>

      <ul className="mt-9 grid gap-4 lg:grid-cols-3">
        {PERFILES.map((p) => (
          <Tarjeta as="li" key={p.titulo} className="flex flex-col gap-2.5 p-6">
            <h2 className="font-display text-[17.5px] font-extrabold">{p.titulo}</h2>
            <p className="text-[14.5px] text-tinta-60">
              {p.texto} <strong className="font-bold text-tinta">{p.destaque}</strong>
            </p>
          </Tarjeta>
        ))}
      </ul>

      {/* El asistente de publicación llega en el Sprint 7, con Storage y cuentas. */}
      <Tarjeta className="mt-8 flex flex-col items-center px-6 py-12 text-center">
        <Insignia tono="fucsia">Muy pronto</Insignia>
        <h2 className="mt-4 font-display text-2xl font-extrabold">
          El asistente de publicación está en camino
        </h2>
        <p className="mt-3 max-w-[46ch] text-tinta-60">
          Cinco pasos, con las fotos primero y el precio por m² de tu distrito a la vista
          mientras decides cuánto pedir.
        </p>
        <Boton href="/precio-m2" variante="secundario" className="mt-6">
          Ver el precio por m²
        </Boton>
      </Tarjeta>
    </Contenedor>
  );
}
