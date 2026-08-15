import { Contenedor } from '@/components/ui/contenedor';
import { Esqueleto, EsqueletoGrilla } from '@/components/ui/esqueleto';

export default function Cargando() {
  return (
    <Contenedor className="py-10 sm:py-14">
      <Esqueleto className="mb-3 h-9 w-72" />
      <Esqueleto className="mb-8 h-5 w-96" />
      <EsqueletoGrilla cantidad={8} />
    </Contenedor>
  );
}
