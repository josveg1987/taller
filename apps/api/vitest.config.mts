import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Los tests usan el codigo fuente de @taller/shared (no su version compilada en dist), asi nunca
// prueban reglas de calculo viejas aunque se haya olvidado recompilar el paquete compartido.
export default defineConfig({
  resolve: {
    alias: {
      '@taller/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    },
  },
});
