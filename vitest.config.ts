import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/preparar.ts'],
    include: ['tests/unidad/**/*.test.{ts,tsx}', 'tests/base-datos/**/*.test.ts'],
    // Levantar Postgres en WebAssembly y aplicar todas las migraciones
    // toma bastante más que una prueba de componente.
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './'),
      // Ver tests/vacio.ts: 'server-only' revienta a propósito fuera de
      // Next, y sin esto no se podría probar nada del servidor.
      'server-only': resolve(__dirname, './tests/vacio.ts'),
    },
  },
});
