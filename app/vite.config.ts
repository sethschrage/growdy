/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // '@/' is the src root. Feature folders mean a file can be three
  // levels deep, and '../../../lib/supabaseClient' is both unreadable
  // and wrong the moment a file moves again -- which this restructure
  // has just demonstrated is a thing that happens. The same alias is
  // declared for TypeScript in tsconfig.app.json; both have to agree.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // One config, not two: the tests resolve modules and transform JSX
  // through exactly the same pipeline the build does, so a test can
  // never pass against a module graph the app doesn't have.
  test: {
    // jsdom for everything rather than per-file environment comments:
    // the pure-logic tests don't care, and a component test that
    // silently ran in node would fail in a way that looks like a bug in
    // the component.
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
