import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

const root = import.meta.dirname

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/tests/**/*.test.ts', 'tests/**/*.test.ts']
  },
  resolve: {
    alias: {
      '@': resolve(root, 'src'),
      '@core': resolve(root, 'src/core'),
      '@main': resolve(root, 'src/main'),
      '@shared': resolve(root, 'src/shared')
    }
  }
})
