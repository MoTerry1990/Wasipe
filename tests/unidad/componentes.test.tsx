import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Boton } from '@/components/ui/boton';
import { Campo, Selector } from '@/components/ui/campo';
import { Tarjeta, Insignia } from '@/components/ui/tarjeta';
import { EstadoVacio, EnConstruccion } from '@/components/estados/estado-vacio';
import { EstadoError, Aviso } from '@/components/estados/estado-error';
import { SkylineLima } from '@/components/marca/skyline-lima';

describe('Boton', () => {
  it('se renderiza como <button> sin href', () => {
    render(<Boton>Publicar aviso</Boton>);
    const boton = screen.getByRole('button', { name: 'Publicar aviso' });
    // type="button" evita que dentro de un formulario envíe sin querer.
    expect(boton).toHaveAttribute('type', 'button');
  });

  it('se renderiza como enlace cuando recibe href', () => {
    render(<Boton href="/publicar">Publicar aviso</Boton>);
    expect(screen.getByRole('link', { name: 'Publicar aviso' })).toHaveAttribute(
      'href',
      '/publicar',
    );
  });
});

describe('Campo', () => {
  it('enlaza la etiqueta con el control mediante un id propio', () => {
    render(<Campo etiqueta="Correo electrónico" name="correo" />);
    // getByLabelText solo lo encuentra si el for/id está bien puesto.
    expect(screen.getByLabelText('Correo electrónico')).toBeInTheDocument();
  });

  it('marca el control como inválido y describe el error', () => {
    render(<Campo etiqueta="Correo electrónico" name="correo" error="Falta el correo" />);
    const control = screen.getByLabelText('Correo electrónico');
    expect(control).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Falta el correo')).toBeInTheDocument();
  });

  it('el Selector también queda enlazado a su etiqueta', () => {
    render(
      <Selector etiqueta="Distrito" name="distrito">
        <option value="miraflores">Miraflores</option>
      </Selector>,
    );
    expect(screen.getByLabelText('Distrito')).toBeInTheDocument();
  });
});

describe('Tarjeta e Insignia', () => {
  it('muestra su contenido', () => {
    render(
      <Tarjeta>
        <Insignia tono="verde">Verificado</Insignia>
      </Tarjeta>,
    );
    expect(screen.getByText('Verificado')).toBeInTheDocument();
  });
});

describe('estados', () => {
  it('el estado vacío explica qué pasó, en español', () => {
    render(<EstadoVacio titulo="Sin resultados" descripcion="Prueba con menos filtros." />);
    expect(screen.getByText('Sin resultados')).toBeInTheDocument();
    expect(screen.getByText('Prueba con menos filtros.')).toBeInTheDocument();
  });

  it('"En construcción" es honesto: avisa que la sección todavía no está lista', () => {
    render(<EnConstruccion titulo="Proyectos" descripcion="Estamos armando esta sección." />);
    expect(document.body.textContent).toMatch(/Muy pronto/);
    expect(screen.getByText('Estamos armando esta sección.')).toBeInTheDocument();
  });

  it('el aviso de error usa role="alert" para que lo anuncie el lector de pantalla', () => {
    render(<Aviso tono="mal">No se pudo guardar</Aviso>);
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo guardar');
  });

  it('el aviso de confirmación usa role="status", que no interrumpe', () => {
    render(<Aviso tono="bien">Aviso guardado</Aviso>);
    expect(screen.getByRole('status')).toHaveTextContent('Aviso guardado');
  });

  it('el estado de error ofrece reintentar cuando hay a dónde volver', () => {
    render(<EstadoError reintentar={() => {}} />);
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('el estado de error explica en español aunque no reciba mensaje', () => {
    render(<EstadoError />);
    expect(screen.getByRole('alert').textContent).toMatch(/No pudimos cargar/);
  });
});

describe('ilustración de Lima', () => {
  it('queda oculta para lectores de pantalla: es decorativa', () => {
    const { container } = render(<SkylineLima />);
    expect(container.querySelector('[aria-hidden="true"] svg')).not.toBeNull();
  });

  it('conserva la ilustración original completa', () => {
    const { container } = render(<SkylineLima />);
    // El original tiene 161 elementos gráficos; si alguien la simplifica, esto avisa.
    expect(container.querySelectorAll('svg *').length).toBeGreaterThan(120);
  });
});
