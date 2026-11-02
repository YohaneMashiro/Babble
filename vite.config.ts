import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Relative assets work locally; verify the actual repository before Pages deployment.
  base: './',
  // Keep lazy dictionaries and glyph resources as separately fetched assets.
  build: { assetsInlineLimit: 0 },
  worker: { format: 'es' },
  // This checkout lives on a Windows drive in WSL, where file events can be missed.
  server: { watch: { usePolling: true, interval: 400 } },
  test: { include: ['tests/**/*.test.{ts,mjs}'] },
})
