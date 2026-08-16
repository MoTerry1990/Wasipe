'use client';

import { useState } from 'react';
import { dinero } from '@/lib/formato';
import {
  calcularHipoteca,
  ingresoSugerido,
  AVISO_HIPOTECA,
  CUOTA_INICIAL_POR_DEFECTO,
  PLAZO_POR_DEFECTO,
  TASA_POR_DEFECTO,
} from '@/lib/hipoteca';
import type { Moneda } from '@/types/base-datos';

/**
 * Cuánto saldría la cuota.
 *
 * Es lo primero que se pregunta cualquiera que mira una casa en el Perú,
 * y hoy hay que irse a la calculadora de un banco para averiguarlo.
 *
 * El aviso legal va arriba y no escondido al final: es una cuenta
 * referencial, no una oferta de crédito, y decirlo en letra chica sería
 * exactamente lo que hace la competencia.
 */
export function Hipoteca({ precio, moneda }: { precio: number; moneda: Moneda }) {
  const [inicial, setInicial] = useState(CUOTA_INICIAL_POR_DEFECTO * 100);
  const [anios, setAnios] = useState(PLAZO_POR_DEFECTO);
  const [tasa, setTasa] = useState(TASA_POR_DEFECTO);

  const resultado = calcularHipoteca({
    precio,
    porcentajeInicial: inicial / 100,
    anios,
    tasaAnual: tasa,
  });

  if (!resultado) return null;

  return (
    <section className="border-linea rounded-2xl border bg-white p-5">
      <h2 className="text-lg">¿Cuánto sería la cuota?</h2>
      <p className="text-tinta-45 mt-1.5 text-[12.5px]">{AVISO_HIPOTECA}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="hipoteca-inicial" className="text-tinta block text-[14px] font-bold">
            Cuota inicial: <span className="cifra">{inicial}%</span>
          </label>
          <input
            id="hipoteca-inicial"
            type="range"
            min={10}
            max={60}
            step={5}
            value={inicial}
            onChange={(e) => setInicial(Number(e.target.value))}
            className="accent-fucsia mt-2 w-full"
          />
          <p className="cifra text-tinta-60 text-[13px]">
            {dinero(resultado.cuotaInicial, moneda)}
          </p>
        </div>

        <div>
          <label htmlFor="hipoteca-plazo" className="text-tinta block text-[14px] font-bold">
            Plazo: <span className="cifra">{anios}</span> años
          </label>
          <input
            id="hipoteca-plazo"
            type="range"
            min={5}
            max={30}
            step={1}
            value={anios}
            onChange={(e) => setAnios(Number(e.target.value))}
            className="accent-fucsia mt-2 w-full"
          />
          <p className="text-tinta-60 text-[13px]">
            <span className="cifra">{anios * 12}</span> cuotas
          </p>
        </div>

        <div>
          <label htmlFor="hipoteca-tasa" className="text-tinta block text-[14px] font-bold">
            Tasa anual: <span className="cifra">{tasa}%</span>
          </label>
          <input
            id="hipoteca-tasa"
            type="range"
            min={5}
            max={16}
            step={0.5}
            value={tasa}
            onChange={(e) => setTasa(Number(e.target.value))}
            className="accent-fucsia mt-2 w-full"
          />
          <p className="text-tinta-60 text-[13px]">Tasa efectiva anual</p>
        </div>
      </div>

      <div className="bg-niebla mt-5 grid gap-4 rounded-xl p-4 sm:grid-cols-3">
        <div>
          <p className="text-tinta-60 text-[13px]">Cuota mensual estimada</p>
          <p className="cifra text-tinta text-2xl font-extrabold">
            {dinero(resultado.cuota, moneda)}
          </p>
        </div>
        <div>
          <p className="text-tinta-60 text-[13px]">Monto a financiar</p>
          <p className="cifra text-tinta text-lg font-bold">
            {dinero(resultado.monto, moneda)}
          </p>
        </div>
        <div>
          <p className="text-tinta-60 text-[13px]">Intereses en todo el plazo</p>
          <p className="cifra text-tinta text-lg font-bold">
            {dinero(resultado.intereses, moneda)}
          </p>
        </div>
      </div>

      <p className="text-tinta-60 mt-3 text-[13.5px]">
        Con esta cuota, los bancos suelen pedir un ingreso familiar de al menos{' '}
        <span className="cifra font-bold">
          {dinero(ingresoSugerido(resultado.cuota), moneda)}
        </span>{' '}
        al mes, porque no dejan que la cuota pase del 30% de lo que entra.
      </p>
    </section>
  );
}
