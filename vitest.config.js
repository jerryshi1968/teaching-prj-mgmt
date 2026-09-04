import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@tigao/organizer-contracts': fileURLToPath(new URL('./packages/organizer-contracts/src/index.js', import.meta.url)),
      '@tigao/organizer-core': fileURLToPath(new URL('./packages/organizer-core/src/index.js', import.meta.url)),
      '@tigao/organizer-react': fileURLToPath(new URL('./packages/organizer-react/src/index.js', import.meta.url)),
      '@tigao/organizer-contract-tests': fileURLToPath(new URL('./packages/organizer-contract-tests/src/index.js', import.meta.url))
    }
  },
  test: {
    environment: 'node',
    include: ['packages/*/test/**/*.test.{js,jsx}'],
    coverage: {
      reporter: ['text', 'html']
    }
  }
});
