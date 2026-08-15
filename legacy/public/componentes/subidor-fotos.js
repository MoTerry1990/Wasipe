/**
 * Subidor de fotos.
 *
 * Es el paso donde más gente abandona, así que hace tres cosas que no son
 * obvias:
 *
 *  1. Comprime en el navegador ANTES de subir. Una foto de celular pasa de
 *     ~8 MB a ~600 KB. En 4G peruano eso es la diferencia entre 40 s y 4 s.
 *  2. Sube en paralelo y arranca al elegir el archivo, sin bloquear el
 *     formulario: se puede seguir llenando mientras suben.
 *  3. Reordena con flechas, no solo arrastrando. Arrastrar en móvil es
 *     un desastre.
 *
 * Las imágenes van DIRECTO a Cloudinary: Netlify corta en 6 MB.
 */
import { api } from '/cuenta.js';

const MAX_LADO = 2400;
const CALIDAD = 0.82;
const EN_PARALELO = 3;

export function crearSubidor({ contenedor, propiedadId, onCambio }) {
  const estado = { fotos: [], subiendo: 0, restantes: null };

  contenedor.innerHTML = `
    <div class="sf">
      <label class="sf-soltar" tabindex="0">
        <input type="file" accept="image/*" multiple hidden>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 16V4m0 0L8 8m4-4 4 4" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" stroke="currentColor"
                stroke-width="2" stroke-linecap="round"/>
        </svg>
        <b>Sube tus fotos</b>
        <span>Desde tu celular o computadora. Se comprimen solas.</span>
      </label>
      <p class="sf-aviso" role="status" aria-live="polite"></p>
      <ul class="sf-lista"></ul>
    </div>`;

  const input = contenedor.querySelector('input[type=file]');
  const zona = contenedor.querySelector('.sf-soltar');
  const lista = contenedor.querySelector('.sf-lista');
  const aviso = contenedor.querySelector('.sf-aviso');

  zona.addEventListener('click', () => input.click());
  zona.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
  });
  ['dragover', 'dragenter'].forEach((ev) =>
    zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add('encima'); }));
  ['dragleave', 'drop'].forEach((ev) =>
    zona.addEventListener(ev, () => zona.classList.remove('encima')));
  zona.addEventListener('drop', (e) => {
    e.preventDefault();
    encolar([...e.dataTransfer.files].filter((f) => f.type.startsWith('image/')));
  });
  input.addEventListener('change', () => { encolar([...input.files]); input.value = ''; });

  /* ------------------------- compresión ------------------------- */

  async function comprimir(archivo) {
    // HEIC de iPhone: createImageBitmap suele fallar, se sube tal cual.
    let bitmap;
    try {
      bitmap = await createImageBitmap(archivo);
    } catch {
      return archivo;
    }

    const escala = Math.min(1, MAX_LADO / Math.max(bitmap.width, bitmap.height));
    if (escala === 1 && archivo.size < 900_000) { bitmap.close?.(); return archivo; }

    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(bitmap.width * escala);
    lienzo.height = Math.round(bitmap.height * escala);
    lienzo.getContext('2d').drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
    bitmap.close?.();

    const blob = await new Promise((res) =>
      lienzo.toBlob(res, 'image/webp', CALIDAD) ?? res(null));
    if (!blob || blob.size >= archivo.size) return archivo;

    return new File([blob], archivo.name.replace(/\.\w+$/, '.webp'), { type: 'image/webp' });
  }

  /* --------------------------- subida --------------------------- */

  async function encolar(archivos) {
    if (!archivos.length) return;
    if (estado.restantes !== null && archivos.length > estado.restantes) {
      mostrar(`Tu plan permite ${estado.restantes} foto(s) más.`, 'mal');
      archivos = archivos.slice(0, Math.max(0, estado.restantes));
      if (!archivos.length) return;
    }

    const nuevas = archivos.map((archivo) => {
      const foto = {
        id: `tmp-${Math.random().toString(36).slice(2)}`,
        archivo, estado: 'espera', progreso: 0,
        vista: URL.createObjectURL(archivo),
      };
      estado.fotos.push(foto);
      return foto;
    });
    pintar();

    // De a EN_PARALELO: más conexiones simultáneas en 4G empeoran todo.
    for (let i = 0; i < nuevas.length; i += EN_PARALELO) {
      await Promise.all(nuevas.slice(i, i + EN_PARALELO).map(subirUna));
    }
    onCambio?.(estado.fotos);
  }

  async function subirUna(foto, reintento = 0) {
    try {
      foto.estado = 'comprimiendo'; pintar();
      const listo = await comprimir(foto.archivo);

      foto.estado = 'subiendo'; pintar();
      const firma = await api('/medios/firma', {
        method: 'POST',
        body: { propiedad_id: propiedadId, cantidad: 1 },
      });
      estado.restantes = firma.restantes;

      const fd = new FormData();
      fd.append('file', listo);
      fd.append('api_key', firma.api_key);
      fd.append('timestamp', String(firma.timestamp));
      fd.append('signature', firma.firma);
      fd.append('folder', firma.folder);
      fd.append('exif', 'false');

      const subida = await enviarConProgreso(firma.url, fd, (p) => {
        foto.progreso = p; pintar();
      });

      const { medio } = await api(`/medios/${propiedadId}`, {
        method: 'POST',
        body: { public_id: subida.public_id },
      });

      Object.assign(foto, {
        id: medio.id, estado: 'listo', progreso: 100,
        url: medio.url, es_portada: medio.es_portada,
      });
      revisarCalidad(foto, subida);
    } catch (e) {
      // Un fallo de red se reintenta una vez; el resto no se cae.
      if (reintento < 1 && !e.estado) return subirUna(foto, reintento + 1);
      foto.estado = 'error';
      foto.mensaje = e.message ?? 'No se pudo subir.';
      if (e.estado === 402) mostrar(e.message, 'mal');
    }
    pintar();
  }

  function enviarConProgreso(url, formData, onProgreso) {
    return new Promise((resolver, rechazar) => {
      const x = new XMLHttpRequest();
      x.open('POST', url);
      x.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgreso(Math.round((e.loaded / e.total) * 100));
      };
      x.onload = () =>
        x.status < 300
          ? resolver(JSON.parse(x.responseText))
          : rechazar(new Error('No se pudo subir la foto. Revisa tu conexión.'));
      x.onerror = () => rechazar(new Error('Se cortó la conexión al subir.'));
      x.send(formData);
    });
  }

  /** Avisos, nunca bloqueos. */
  function revisarCalidad(foto, subida) {
    if (subida.width && subida.width < 800) foto.nota = 'Esta foto salió pequeña.';
  }

  /* ------------------------- orden y portada -------------------- */

  async function guardarOrden() {
    const ids = estado.fotos.filter((f) => f.estado === 'listo').map((f) => f.id);
    if (!ids.length) return;
    const portada = estado.fotos.find((f) => f.es_portada)?.id ?? ids[0];
    try {
      await api(`/medios/${propiedadId}`, { method: 'PATCH', body: { orden: ids, portada } });
      onCambio?.(estado.fotos);
    } catch (e) {
      mostrar(e.message, 'mal');
    }
  }

  function mover(i, delta) {
    const j = i + delta;
    if (j < 0 || j >= estado.fotos.length) return;
    [estado.fotos[i], estado.fotos[j]] = [estado.fotos[j], estado.fotos[i]];
    pintar(); guardarOrden();
  }

  function hacerPortada(i) {
    estado.fotos.forEach((f, k) => { f.es_portada = k === i; });
    pintar(); guardarOrden();
  }

  async function quitar(i) {
    const foto = estado.fotos[i];
    if (foto.estado === 'listo') {
      try {
        await api(`/medios/${propiedadId}/${foto.id}`, { method: 'DELETE' });
      } catch (e) { return mostrar(e.message, 'mal'); }
    }
    URL.revokeObjectURL(foto.vista);
    estado.fotos.splice(i, 1);
    pintar(); onCambio?.(estado.fotos);
  }

  /* ---------------------------- pintar -------------------------- */

  function mostrar(texto, tono = '') {
    aviso.textContent = texto;
    aviso.className = `sf-aviso ${tono}`;
  }

  function pintar() {
    const listas = estado.fotos.filter((f) => f.estado === 'listo').length;
    lista.innerHTML = estado.fotos
      .map((f, i) => {
        const barra =
          f.estado === 'subiendo' || f.estado === 'comprimiendo'
            ? `<div class="sf-barra"><i style="width:${f.estado === 'comprimiendo' ? 8 : f.progreso}%"></i></div>`
            : '';
        return `
        <li class="sf-item ${f.estado}" data-i="${i}">
          <img src="${f.url ?? f.vista}" alt="">
          ${f.es_portada ? '<span class="sf-portada">Portada</span>' : ''}
          ${barra}
          ${f.estado === 'error' ? `<span class="sf-error">${f.mensaje}</span>` : ''}
          ${f.nota ? `<span class="sf-nota">${f.nota}</span>` : ''}
          <div class="sf-acciones">
            <button type="button" data-a="izq" ${i === 0 ? 'disabled' : ''} aria-label="Mover antes">↑</button>
            <button type="button" data-a="der" ${i === estado.fotos.length - 1 ? 'disabled' : ''} aria-label="Mover después">↓</button>
            ${f.estado === 'listo' && !f.es_portada
              ? '<button type="button" data-a="portada">Portada</button>' : ''}
            <button type="button" data-a="quitar" aria-label="Quitar">✕</button>
          </div>
        </li>`;
      })
      .join('');

    if (listas === 0) mostrar('');
    else if (listas < 3) mostrar(`Llevas ${listas} de las 3 fotos mínimas.`, '');
    else if (listas < 5) mostrar(`${listas} fotos. Con 5 o más recibirás bastantes más contactos.`, '');
    else mostrar(`${listas} fotos. Así está muy bien.`, 'bien');
  }

  lista.addEventListener('click', (e) => {
    const boton = e.target.closest('button[data-a]');
    if (!boton) return;
    const i = Number(boton.closest('.sf-item').dataset.i);
    const a = boton.dataset.a;
    if (a === 'izq') mover(i, -1);
    else if (a === 'der') mover(i, 1);
    else if (a === 'portada') hacerPortada(i);
    else if (a === 'quitar') quitar(i);
  });

  return {
    fotos: () => estado.fotos,
    listas: () => estado.fotos.filter((f) => f.estado === 'listo').length,
    cargar(medios = []) {
      estado.fotos = medios.map((m) => ({
        id: m.id, estado: 'listo', progreso: 100,
        url: m.url, es_portada: m.es_portada,
      }));
      pintar();
    },
  };
}
