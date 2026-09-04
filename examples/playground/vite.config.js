import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: {
      '@tigao/organizer-contracts': fileURLToPath(new URL('../../packages/organizer-contracts/src/index.js', import.meta.url)),
      '@tigao/organizer-core': fileURLToPath(new URL('../../packages/organizer-core/src/index.js', import.meta.url)),
      '@tigao/organizer-react': fileURLToPath(new URL('../../packages/organizer-react/src/index.js', import.meta.url)),
      '@tigao/organizer-contract-tests': fileURLToPath(new URL('../../packages/organizer-contract-tests/src/index.js', import.meta.url))
    }
  }
});
