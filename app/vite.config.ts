/// <reference types="vitest/config" />
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * Keeps the `zz-` measuring harnesses out of the build.
 *
 * `public/` is copied into `dist/` wholesale, which is exactly why it is
 * the convenient place to put a page that renders real components
 * against the real stylesheet (see `.gitignore`) -- and also means the
 * harnesses ship. They did: 200KB of glass experiments sat in `dist/`,
 * and `npx cap sync` copied every one of them into the iOS bundle. The
 * gitignore rule kept them out of git, so Vercel -- which builds from
 * git -- was never affected. The build that carried them was the one
 * installed on the producer's phone.
 *
 * Deleting after the copy rather than filtering before it, because Vite
 * has no hook for the second: `publicDir` is all-or-nothing.
 */
function dropScratchHarnesses(): Plugin {
  return {
    name: 'growdy:drop-scratch-harnesses',
    apply: 'build',
    closeBundle() {
      const outDir = fileURLToPath(new URL('./dist', import.meta.url))
      if (!existsSync(outDir)) return
      for (const entry of readdirSync(outDir)) {
        if (entry.startsWith('zz-')) rmSync(join(outDir, entry), { recursive: true, force: true })
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), dropScratchHarnesses()],
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
