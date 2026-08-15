import { describe, it, expect } from 'vitest';
import { mensajeDeError, AVISO_RECUPERACION } from '@/lib/auth/errores';
import {
  navegacionPanel,
  accedeA,
  puedePublicar,
  esInmobiliaria,
  esRolElegible,
  ROLES_ELEGIBLES,
} from '@/lib/auth/roles';
import {
  esquemaRegistro,
  esquemaIngreso,
  esquemaNuevaClave,
  esquemaBienvenida,
  revisarImagen,
  rutaDeImagen,
  TIPOS_AVATAR,
  TIPOS_LOGO,
  PESO_MAXIMO,
} from '@/lib/validacion/cuenta';

/** Un error de Supabase, con su código, como llega de verdad. */
function errorAuth(code: string, message = 'algo en inglés') {
  return Object.assign(new Error(message), { code, name: 'AuthApiError', status: 400 });
}

describe('errores de autenticación', () => {
  it('traduce credenciales inválidas sin decir cuál de las dos falló', () => {
    const mensaje = mensajeDeError(errorAuth('invalid_credentials'));
    expect(mensaje).toContain('no coinciden');
    // Decir "ese correo no existe" permitiría averiguar quién tiene cuenta.
    expect(mensaje).not.toMatch(/correo no existe|no está registrado/i);
  });

  it('explica el correo sin confirmar y dónde buscarlo', () => {
    expect(mensajeDeError(errorAuth('email_not_confirmed'))).toContain('correo no deseado');
  });

  it('reconoce el error por el texto cuando no viene el código', () => {
    expect(mensajeDeError(new Error('Invalid login credentials'))).toContain('no coinciden');
    expect(mensajeDeError(new Error('fetch failed'))).toContain('internet');
  });

  it('nunca devuelve el texto en inglés de Supabase', () => {
    const casos = [
      errorAuth('weak_password', 'Password should be at least 6 characters'),
      errorAuth('desconocido', 'Something went terribly wrong'),
      new Error('AuthApiError: unexpected_failure'),
    ];
    for (const caso of casos) {
      const mensaje = mensajeDeError(caso);
      expect(mensaje).not.toMatch(/password|error|failed|invalid/i);
      expect(mensaje.length).toBeGreaterThan(20);
    }
  });

  it('da un mensaje incluso sin error', () => {
    expect(mensajeDeError(null)).toBeTruthy();
  });

  it('el aviso de recuperación no confirma si la cuenta existe', () => {
    expect(AVISO_RECUPERACION).toMatch(/^Si esa dirección tiene una cuenta/);
  });
});

describe('validación de formularios', () => {
  it('acepta un registro completo', () => {
    const resultado = esquemaRegistro.safeParse({
      nombre: 'Rosa Quispe',
      correo: 'ROSA@Ejemplo.PE',
      clave: 'micasaenlima',
      terminos: true,
    });
    expect(resultado.success).toBe(true);
    // El correo se normaliza a minúsculas para que no haya cuentas dobles.
    if (resultado.success) expect(resultado.data.correo).toBe('rosa@ejemplo.pe');
  });

  it('exige aceptar los términos', () => {
    const resultado = esquemaRegistro.safeParse({
      nombre: 'Rosa Quispe',
      correo: 'rosa@ejemplo.pe',
      clave: 'micasaenlima',
      terminos: false,
    });
    expect(resultado.success).toBe(false);
  });

  it('pide al menos 8 caracteres de contraseña', () => {
    const corta = esquemaRegistro.safeParse({
      nombre: 'Rosa Quispe',
      correo: 'rosa@ejemplo.pe',
      clave: 'corta12',
      terminos: true,
    });
    expect(corta.success).toBe(false);
    if (!corta.success) {
      expect(corta.error.issues[0]?.message).toMatch(/8 caracteres/);
    }
  });

  it('no exige mayúsculas ni símbolos: una frase alcanza', () => {
    const frase = esquemaRegistro.safeParse({
      nombre: 'Rosa Quispe',
      correo: 'rosa@ejemplo.pe',
      clave: 'la casa de mi abuela',
      terminos: true,
    });
    expect(frase.success).toBe(true);
  });

  it('avisa en castellano cuando el correo está incompleto', () => {
    const resultado = esquemaIngreso.safeParse({ correo: 'rosa@', clave: 'lo que sea' });
    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0]?.message).toMatch(/Revisa que tenga @/);
    }
  });

  it('detecta que las dos contraseñas no coinciden', () => {
    const resultado = esquemaNuevaClave.safeParse({
      clave: 'micasaenlima',
      repeticion: 'micasaenlimaa',
    });
    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0]?.path[0]).toBe('repeticion');
    }
  });

  it('exige un celular peruano en la bienvenida', () => {
    const base = {
      rol: 'owner',
      nombre: 'Rosa Quispe',
      contacto: 'whatsapp',
      intencion: 'sell',
      distritos: [],
    };

    expect(esquemaBienvenida.safeParse({ ...base, celular: '987654321' }).success).toBe(true);
    // Fijo de Lima, no celular.
    expect(esquemaBienvenida.safeParse({ ...base, celular: '014567890' }).success).toBe(false);
    expect(esquemaBienvenida.safeParse({ ...base, celular: '98765432' }).success).toBe(false);
  });

  it('la bienvenida no deja elegir un rol de Wasipe', () => {
    const datos = {
      rol: 'admin',
      nombre: 'Alguien con ambiciones',
      celular: '987654321',
      contacto: 'whatsapp',
      intencion: 'buy',
      distritos: [],
    };
    expect(esquemaBienvenida.safeParse(datos).success).toBe(false);
    expect(esquemaBienvenida.safeParse({ ...datos, rol: 'moderator' }).success).toBe(false);
  });

  it('limita los distritos a doce', () => {
    const datos = {
      rol: 'buyer',
      nombre: 'Rosa Quispe',
      celular: '987654321',
      contacto: 'whatsapp',
      intencion: 'buy',
      distritos: Array.from({ length: 13 }, (_, i) => `Distrito ${i}`),
    };
    expect(esquemaBienvenida.safeParse(datos).success).toBe(false);
  });
});

describe('roles', () => {
  it('solo se pueden elegir cuatro tipos de cuenta', () => {
    expect(ROLES_ELEGIBLES).toEqual(['buyer', 'owner', 'agent', 'agency_admin']);
    expect(esRolElegible('admin')).toBe(false);
    expect(esRolElegible('moderator')).toBe(false);
    expect(esRolElegible('owner')).toBe(true);
  });

  it('quien solo busca no publica', () => {
    expect(puedePublicar('buyer')).toBe(false);
    expect(puedePublicar('owner')).toBe(true);
    expect(puedePublicar('agent')).toBe(true);
  });

  it('reconoce a la inmobiliaria', () => {
    expect(esInmobiliaria('agency_admin')).toBe(true);
    expect(esInmobiliaria('agent')).toBe(false);
  });
});

describe('menú del panel según el rol', () => {
  it('al comprador no le muestra secciones que no puede usar', () => {
    const rutas = navegacionPanel('buyer').map((e) => e.href);
    expect(rutas).toContain('/panel');
    expect(rutas).toContain('/panel/favoritos');
    expect(rutas).toContain('/panel/alertas');
    expect(rutas).not.toContain('/panel/mis-propiedades');
    expect(rutas).not.toContain('/panel/contactos');
    expect(rutas).not.toContain('/panel/inmobiliaria');
  });

  it('al propietario le suma sus avisos y sus contactos', () => {
    const rutas = navegacionPanel('owner').map((e) => e.href);
    expect(rutas).toContain('/panel/mis-propiedades');
    expect(rutas).toContain('/panel/contactos');
    expect(rutas).not.toContain('/panel/inmobiliaria');
  });

  it('solo la inmobiliaria ve su sección', () => {
    expect(navegacionPanel('agency_admin').map((e) => e.href)).toContain('/panel/inmobiliaria');
    expect(navegacionPanel('agent').map((e) => e.href)).not.toContain('/panel/inmobiliaria');
  });

  it('el permiso se comprueba por ruta, no solo al pintar el menú', () => {
    // Escribir la URL a mano tiene que dar el mismo resultado que el menú.
    expect(accedeA('buyer', '/panel/mis-propiedades')).toBe(false);
    expect(accedeA('buyer', '/panel/favoritos')).toBe(true);
    expect(accedeA('agent', '/panel/inmobiliaria')).toBe(false);
    expect(accedeA('admin', '/panel/inmobiliaria')).toBe(true);
  });

  it('todo rol conserva el resumen y la configuración', () => {
    for (const rol of [
      'buyer',
      'owner',
      'agent',
      'agency_admin',
      'moderator',
      'admin',
    ] as const) {
      const rutas = navegacionPanel(rol).map((e) => e.href);
      expect(rutas, `rol ${rol}`).toContain('/panel');
      expect(rutas, `rol ${rol}`).toContain('/panel/configuracion');
    }
  });

  it('el menú está íntegramente en castellano', () => {
    const textos = navegacionPanel('admin').map((e) => e.texto);
    expect(textos).toEqual([
      'Resumen',
      'Mis propiedades',
      'Favoritos',
      'Contactos',
      'Alertas',
      'Inmobiliaria',
      'Wasi AI',
      'Configuración',
    ]);
  });
});

describe('imágenes de perfil y logos', () => {
  const foto = (extra: Partial<{ name: string; size: number; type: string }> = {}) => ({
    name: 'foto.jpg',
    size: 180_000,
    type: 'image/jpeg',
    ...extra,
  });

  it('acepta una foto normal', () => {
    const revision = revisarImagen(foto(), TIPOS_AVATAR);
    expect(revision).toEqual({ ok: true, extension: 'jpg' });
  });

  it('rechaza lo que pasa de 2 MB, y dice cuánto pesa', () => {
    const revision = revisarImagen(foto({ size: PESO_MAXIMO + 1 }), TIPOS_AVATAR);
    expect(revision.ok).toBe(false);
    if (!revision.ok) {
      expect(revision.error).toContain('2 MB');
      expect(revision.error).toMatch(/2\.0 MB/);
    }
  });

  it('rechaza un archivo vacío', () => {
    expect(revisarImagen(foto({ size: 0 }), TIPOS_AVATAR).ok).toBe(false);
  });

  it('rechaza un PDF disfrazado y cualquier cosa que no sea imagen', () => {
    const revision = revisarImagen(
      foto({ name: 'cv.pdf', type: 'application/pdf' }),
      TIPOS_AVATAR,
    );
    expect(revision.ok).toBe(false);
    if (!revision.ok) expect(revision.error).toContain('JPG, PNG, WEBP');
  });

  it('no acepta SVG como foto de perfil, pero sí como logo', () => {
    const svg = foto({ name: 'logo.svg', type: 'image/svg+xml' });
    // Un SVG puede traer scripts adentro: como avatar no aporta y suma riesgo.
    expect(revisarImagen(svg, TIPOS_AVATAR).ok).toBe(false);
    expect(revisarImagen(svg, TIPOS_LOGO)).toEqual({ ok: true, extension: 'svg' });
  });

  it('guarda cada archivo en la carpeta de su dueño', () => {
    const ruta = rutaDeImagen(
      '11111111-1111-4111-8111-111111111111',
      'webp',
      1_755_000_000_000,
    );
    // La política de storage exige que la primera carpeta sea el id.
    expect(ruta).toBe('11111111-1111-4111-8111-111111111111/1755000000000.webp');
    expect(ruta.split('/')[0]).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('no reutiliza el nombre original del archivo', () => {
    // Un nombre como "../../otro/foto.jpg" saldría de la carpeta.
    const ruta = rutaDeImagen('abc', 'jpg', 1);
    expect(ruta).not.toContain('foto');
    expect(ruta).not.toContain('..');
  });
});
