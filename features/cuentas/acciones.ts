'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import type { ZodError } from 'zod';
import { clienteServidor } from '@/lib/supabase/servidor';
import { requierePerfil, requiereRol } from '@/lib/auth/sesion';
import { mensajeDeError, AVISO_RECUPERACION } from '@/lib/auth/errores';
import { esRolElegible } from '@/lib/auth/roles';
import {
  esquemaIngreso,
  esquemaRegistro,
  esquemaRecuperacion,
  esquemaNuevaClave,
  esquemaBienvenida,
  esquemaPerfil,
  revisarImagen,
  rutaDeImagen,
  TIPOS_AVATAR,
  TIPOS_LOGO,
} from '@/lib/validacion/cuenta';
import { SITIO } from '@/config/sitio';

/**
 * Acciones de cuenta.
 *
 * Todo pasa por el servidor: validación, llamada a Supabase y escritura
 * de cookies. El formulario del navegador es solo la pantalla; si
 * alguien arma la petición a mano, encuentra exactamente las mismas
 * comprobaciones.
 */

export type Estado = {
  ok?: boolean;
  mensaje?: string;
  errores?: Record<string, string>;
};

/** Pasa los errores de Zod a un mapa campo → mensaje. */
function porCampo(error: ZodError): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const issue of error.issues) {
    const campo = issue.path[0];
    if (typeof campo === 'string' && !salida[campo]) salida[campo] = issue.message;
  }
  return salida;
}

/**
 * A dónde vuelve la persona después de confirmar el correo o de cambiar
 * la contraseña. Se arma con el encabezado Host real y no con una
 * constante, para que funcione igual en local, en las vistas previas de
 * Vercel y en producción.
 */
async function urlDeRetorno(ruta: string): Promise<string> {
  const cabeceras = await headers();
  const host = cabeceras.get('x-forwarded-host') ?? cabeceras.get('host');
  const protocolo = cabeceras.get('x-forwarded-proto') ?? 'https';
  const base = host ? `${protocolo}://${host}` : SITIO.url;
  return new URL(ruta, base).toString();
}

// ---------------------------------------------------------------------
// Ingreso y salida
// ---------------------------------------------------------------------

export async function ingresar(_previo: Estado, datos: FormData): Promise<Estado> {
  const revision = esquemaIngreso.safeParse({
    correo: datos.get('correo'),
    clave: datos.get('clave'),
  });

  if (!revision.success) {
    return { ok: false, errores: porCampo(revision.error) };
  }

  const supabase = await clienteServidor();
  const { error } = await supabase.auth.signInWithPassword({
    email: revision.data.correo,
    password: revision.data.clave,
  });

  if (error) {
    return { ok: false, mensaje: mensajeDeError(error) };
  }

  // El destino viene del formulario, pero solo se acepta si es una ruta
  // interna: un `volver` con http:// convertiría el ingreso en un salto
  // abierto hacia cualquier sitio.
  const pedido = String(datos.get('volver') ?? '');
  const destino = pedido.startsWith('/') && !pedido.startsWith('//') ? pedido : '/panel';

  revalidatePath('/', 'layout');
  redirect(destino);
}

export async function cerrarSesion(): Promise<void> {
  const supabase = await clienteServidor();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/');
}

// ---------------------------------------------------------------------
// Registro
// ---------------------------------------------------------------------

export async function registrarse(_previo: Estado, datos: FormData): Promise<Estado> {
  const revision = esquemaRegistro.safeParse({
    nombre: datos.get('nombre'),
    correo: datos.get('correo'),
    clave: datos.get('clave'),
    terminos: datos.get('terminos') === 'on',
  });

  if (!revision.success) {
    return { ok: false, errores: porCampo(revision.error) };
  }

  const supabase = await clienteServidor();
  const { data, error } = await supabase.auth.signUp({
    email: revision.data.correo,
    password: revision.data.clave,
    options: {
      // El nombre viaja en los metadatos y el trigger de la base lo usa
      // para crear el perfil. El rol NO viaja acá: siempre nace en
      // 'buyer' y se elige en la bienvenida.
      data: { full_name: revision.data.nombre },
      emailRedirectTo: await urlDeRetorno('/auth/callback?siguiente=/bienvenida'),
    },
  });

  if (error) {
    return { ok: false, mensaje: mensajeDeError(error) };
  }

  // Con la confirmación de correo activada, signUp no abre sesión.
  if (!data.session) {
    return {
      ok: true,
      mensaje:
        'Te enviamos un correo para confirmar tu cuenta. Ábrelo y sigue el enlace; si no aparece, revisa el correo no deseado.',
    };
  }

  revalidatePath('/', 'layout');
  redirect('/bienvenida');
}

// ---------------------------------------------------------------------
// Recuperación de contraseña
// ---------------------------------------------------------------------

export async function pedirRecuperacion(_previo: Estado, datos: FormData): Promise<Estado> {
  const revision = esquemaRecuperacion.safeParse({ correo: datos.get('correo') });

  if (!revision.success) {
    return { ok: false, errores: porCampo(revision.error) };
  }

  const supabase = await clienteServidor();
  const { error } = await supabase.auth.resetPasswordForEmail(revision.data.correo, {
    redirectTo: await urlDeRetorno('/auth/callback?siguiente=/nueva-clave'),
  });

  // Aunque falle, la respuesta es la misma: decir "ese correo no existe"
  // permitiría averiguar quién tiene cuenta en Wasipe. El único error
  // que sí se muestra es el de demasiados intentos.
  if (error && (error as { code?: string }).code === 'over_email_send_rate_limit') {
    return { ok: false, mensaje: mensajeDeError(error) };
  }

  return { ok: true, mensaje: AVISO_RECUPERACION };
}

export async function cambiarClave(_previo: Estado, datos: FormData): Promise<Estado> {
  const revision = esquemaNuevaClave.safeParse({
    clave: datos.get('clave'),
    repeticion: datos.get('repeticion'),
  });

  if (!revision.success) {
    return { ok: false, errores: porCampo(revision.error) };
  }

  const supabase = await clienteServidor();

  // Cambiar la contraseña exige sesión. Acá la sesión llega del enlace
  // del correo, que el Route Handler ya canjeó por cookies.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      mensaje: 'El enlace venció o ya se usó. Pide uno nuevo desde "Olvidé mi contraseña".',
    };
  }

  const { error } = await supabase.auth.updateUser({ password: revision.data.clave });

  if (error) {
    return { ok: false, mensaje: mensajeDeError(error) };
  }

  revalidatePath('/', 'layout');
  redirect('/panel?clave=lista');
}

// ---------------------------------------------------------------------
// Bienvenida
// ---------------------------------------------------------------------

export async function completarBienvenida(_previo: Estado, datos: FormData): Promise<Estado> {
  const perfil = await requierePerfil('/bienvenida');

  const revision = esquemaBienvenida.safeParse({
    rol: datos.get('rol'),
    nombre: datos.get('nombre'),
    celular: datos.get('celular'),
    contacto: datos.get('contacto'),
    intencion: datos.get('intencion'),
    distritos: datos.getAll('distritos').map(String),
  });

  if (!revision.success) {
    return { ok: false, errores: porCampo(revision.error) };
  }

  const { rol, nombre, celular, contacto, intencion, distritos } = revision.data;

  // Segunda comprobación del rol, ahora contra la lista blanca. La base
  // tiene la tercera: un trigger que rechaza 'admin' y 'moderator'.
  if (!esRolElegible(rol)) {
    return { ok: false, errores: { rol: 'Ese tipo de cuenta no se puede elegir' } };
  }

  const supabase = await clienteServidor();

  const { error } = await supabase
    .from('profiles')
    .update({
      role: rol,
      full_name: nombre,
      phone: celular,
      whatsapp: contacto === 'whatsapp' ? celular : null,
      preferred_contact: contacto,
      intent: intencion,
      onboarded_at: new Date().toISOString(),
    })
    .eq('id', perfil.id);

  if (error) {
    return { ok: false, mensaje: mensajeDeError(error) };
  }

  if (distritos.length > 0) {
    await supabase.from('profile_districts').delete().eq('user_id', perfil.id);
    await supabase.from('profile_districts').insert(
      distritos.map((district) => ({
        user_id: perfil.id,
        district,
        province: 'Lima',
        department: 'Lima',
      })),
    );
  }

  revalidatePath('/', 'layout');
  redirect('/panel?bienvenida=lista');
}

// ---------------------------------------------------------------------
// Configuración del perfil
// ---------------------------------------------------------------------

export async function guardarPerfil(_previo: Estado, datos: FormData): Promise<Estado> {
  const perfil = await requierePerfil('/panel/configuracion');

  const revision = esquemaPerfil.safeParse({
    nombre: datos.get('nombre'),
    celular: datos.get('celular') ?? '',
    whatsapp: datos.get('whatsapp') ?? '',
    contacto: datos.get('contacto'),
    bio: datos.get('bio') ?? '',
  });

  if (!revision.success) {
    return { ok: false, errores: porCampo(revision.error) };
  }

  const supabase = await clienteServidor();
  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: revision.data.nombre,
      phone: revision.data.celular || null,
      whatsapp: revision.data.whatsapp || null,
      preferred_contact: revision.data.contacto,
      bio: revision.data.bio || null,
    })
    .eq('id', perfil.id);

  if (error) {
    return { ok: false, mensaje: mensajeDeError(error) };
  }

  revalidatePath('/panel', 'layout');
  return { ok: true, mensaje: 'Listo, guardamos tus datos.' };
}

// ---------------------------------------------------------------------
// Imágenes
// ---------------------------------------------------------------------

export async function subirAvatar(_previo: Estado, datos: FormData): Promise<Estado> {
  const perfil = await requierePerfil('/panel/configuracion');
  const archivo = datos.get('avatar');

  if (!(archivo instanceof File)) {
    return { ok: false, mensaje: 'Elige una imagen para subir.' };
  }

  const revision = revisarImagen(archivo, TIPOS_AVATAR);
  if (!revision.ok) {
    return { ok: false, mensaje: revision.error };
  }

  const supabase = await clienteServidor();
  const ruta = rutaDeImagen(perfil.id, revision.extension, Date.now());

  const { error: errorSubida } = await supabase.storage
    .from('avatares')
    .upload(ruta, archivo, { contentType: archivo.type, upsert: true });

  if (errorSubida) {
    return { ok: false, mensaje: 'No pudimos subir la imagen. Reintenta en un momento.' };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from('avatares').getPublicUrl(ruta);

  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: publicUrl })
    .eq('id', perfil.id);

  if (error) {
    return { ok: false, mensaje: mensajeDeError(error) };
  }

  revalidatePath('/panel', 'layout');
  return { ok: true, mensaje: 'Listo, cambiamos tu foto.' };
}

export async function subirLogo(_previo: Estado, datos: FormData): Promise<Estado> {
  await requiereRol(['agency_admin', 'admin']);

  const idAgencia = String(datos.get('agencia') ?? '');
  const archivo = datos.get('logo');

  if (!idAgencia) {
    return { ok: false, mensaje: 'Falta indicar de qué inmobiliaria es el logo.' };
  }

  if (!(archivo instanceof File)) {
    return { ok: false, mensaje: 'Elige una imagen para subir.' };
  }

  const revision = revisarImagen(archivo, TIPOS_LOGO);
  if (!revision.ok) {
    return { ok: false, mensaje: revision.error };
  }

  const supabase = await clienteServidor();
  const ruta = rutaDeImagen(idAgencia, revision.extension, Date.now());

  // Que esta persona administre esta inmobiliaria lo comprueba la
  // política de storage, no este código: la carpeta tiene que ser una
  // agencia suya o la subida se rechaza en la base.
  const { error: errorSubida } = await supabase.storage
    .from('logos')
    .upload(ruta, archivo, { contentType: archivo.type, upsert: true });

  if (errorSubida) {
    return {
      ok: false,
      mensaje: 'No pudimos subir el logo. Revisa que administres esta inmobiliaria.',
    };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from('logos').getPublicUrl(ruta);

  const { error } = await supabase
    .from('agencies')
    .update({ logo_url: publicUrl })
    .eq('id', idAgencia);

  if (error) {
    return { ok: false, mensaje: mensajeDeError(error) };
  }

  revalidatePath('/panel/inmobiliaria');
  return { ok: true, mensaje: 'Listo, cambiamos el logo.' };
}
