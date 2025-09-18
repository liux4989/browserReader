import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    // Removed setupFiles reference to non-existent file
  },
  resolve: {
    alias: {
      '~': '.',
    },
  },
});