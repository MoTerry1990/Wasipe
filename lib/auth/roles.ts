import type { RolUsuario } from '@/types/base-datos';

/**
 * Roles y qué ve cada uno en el panel.
 *
 * El rol se decide siempre en el servidor, leyéndolo de `profiles.role`.
 * Esta lista solo dice qué mostrar; no autoriza nada. Ocultar un enlace
 * no protege una ruta: cada página del panel comprueba el rol por su
 * cuenta antes de responder.
 */

/** Los cuatro tipos de cuenta que se pueden elegir en la bienvenida. */
export const TIPOS_DE_CUENTA = [
  {
    rol: 'buyer',
    titulo: 'Comprador o inquilino',
    detalle: 'Busco departamento o casa. Quiero guardar favoritos y recibir alertas.',
  },
  {
    rol: 'owner',
    titulo: 'Propietario directo',
    detalle: 'Quiero vender o alquilar mi propiedad, sin intermediarios.',
  },
  {
    rol: 'agent',
    titulo: 'Corredor inmobiliario',
    detalle: 'Trabajo por mi cuenta y manejo varios inmuebles a la vez.',
  },
  {
    rol: 'agency_admin',
    titulo: 'Inmobiliaria',
    detalle: 'Represento a una empresa con un equipo de corredores.',
  },
] as const satisfies readonly { rol: RolUsuario; titulo: string; detalle: string }[];

/** Roles que una persona puede elegir. `moderator` y `admin` no están: los asigna Wasipe. */
export const ROLES_ELEGIBLES = TIPOS_DE_CUENTA.map((t) => t.rol);

export type RolElegible = (typeof TIPOS_DE_CUENTA)[number]['rol'];

export function esRolElegible(valor: unknown): valor is RolElegible {
  return typeof valor === 'string' && (ROLES_ELEGIBLES as readonly string[]).includes(valor);
}

/** ¿Este rol puede publicar avisos? */
export function puedePublicar(rol: RolUsuario): boolean {
  return rol !== 'buyer';
}

/** ¿Este rol administra una inmobiliaria? */
export function esInmobiliaria(rol: RolUsuario): boolean {
  return rol === 'agency_admin';
}

export function esPersonalDeWasipe(rol: RolUsuario): boolean {
  return rol === 'admin' || rol === 'moderator';
}

// ---------------------------------------------------------------------
// Navegación del panel
// ---------------------------------------------------------------------

export type EntradaPanel = {
  href: string;
  texto: string;
  /** Qué roles la ven. Sin lista, la ven todos. */
  roles?: readonly RolUsuario[];
};

const PANEL: readonly EntradaPanel[] = [
  { href: '/panel', texto: 'Resumen' },
  {
    href: '/panel/mis-propiedades',
    texto: 'Mis propiedades',
    roles: ['owner', 'agent', 'agency_admin', 'moderator', 'admin'],
  },
  { href: '/panel/favoritos', texto: 'Favoritos' },
  {
    href: '/panel/contactos',
    texto: 'Contactos',
    roles: ['owner', 'agent', 'agency_admin', 'moderator', 'admin'],
  },
  { href: '/panel/alertas', texto: 'Alertas' },
  {
    href: '/panel/inmobiliaria',
    texto: 'Inmobiliaria',
    roles: ['agency_admin', 'admin'],
  },
  { href: '/panel/wasi-ai', texto: 'Wasi AI' },
  {
    href: '/panel/moderacion/imagenes',
    texto: 'Revisión de imágenes',
    roles: ['moderator', 'admin'],
  },
  { href: '/panel/configuracion', texto: 'Configuración' },
];

/**
 * Menú del panel para un rol.
 *
 * Quien solo busca no tiene "Mis propiedades" ni "Contactos": mostrarle
 * secciones vacías da la sensación de un producto a medio hacer.
 */
export function navegacionPanel(rol: RolUsuario): EntradaPanel[] {
  return PANEL.filter((entrada) => !entrada.roles || entrada.roles.includes(rol));
}

/** ¿Este rol tiene permitida esta ruta del panel? */
export function accedeA(rol: RolUsuario, ruta: string): boolean {
  const entrada = PANEL.find((e) => e.href === ruta);
  if (!entrada) return true;
  return !entrada.roles || entrada.roles.includes(rol);
}
