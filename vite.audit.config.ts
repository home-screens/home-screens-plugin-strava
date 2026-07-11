import { defineConfig } from 'vite';

// Audit harness build: a normal self-contained page (React bundled), unlike
// the shipped IIFE bundle. Output is git-ignored.
export default defineConfig({
  root: 'audit',
  base: './',
  build: {
    outDir: '../audit-dist',
    emptyOutDir: true,
  },
  esbuild: {
    jsx: 'automatic',
  },
});
