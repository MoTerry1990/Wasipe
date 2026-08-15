import vitalesWeb from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

/**
 * eslint-config-next 16 exporta config plano nativo, así que no hace
 * falta FlatCompat (que además rompe con esta versión).
 */
const configuracion = [
  {
    // El proyecto anterior queda como referencia: no se somete a las
    // reglas nuevas ni bloquea el build.
    ignores: ['legacy/**', '.next/**', 'node_modules/**', 'tests/e2e/**', 'next-env.d.ts'],
  },
  ...vitalesWeb,
  ...typescript,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
];

export default configuracion;
