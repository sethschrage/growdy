/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
