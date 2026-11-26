import { defineConfig } from 'vite';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Emits static SPA fallback pages (`/create/index.html`, `/c/index.html`,
 * `404.html`) so deep links work on hosts without server-side routing such as
 * GitHub Pages and Cloudflare Pages.
 *
 * The build uses `base: './'`, so a copy of index.html inside a subdirectory
 * would resolve `./assets/...` relative to that subdirectory and 404. Asset
 * URLs are therefore rewritten to the correct depth.
 */
function spaFallbackPlugin() {
  return {
    name: 'spa-fallback',
    apply: 'build' as const,
    closeBundle() {
      const dist = join(process.cwd(), 'dist');
      const html = readFileSync(join(dist, 'index.html'), 'utf8');

      const routes = [
        { dir: 'create', depth: 1 },
        { dir: 'c', depth: 1 },
      ];

      for (const { dir, depth } of routes) {
        const up = '../'.repeat(depth);
        const rewritten = html
          .replace(/(src|href)="\.\//g, (_m, attr) => `${attr}="${up}`)
          .replace(/(src|href)='\.\//g, (_m, attr) => `${attr}='${up}`);
        mkdirSync(join(dist, dir), { recursive: true });
        writeFileSync(join(dist, dir, 'index.html'), rewritten, 'utf8');
      }

      // 404 fallback: absolute-from-root so it resolves regardless of depth.
      writeFileSync(
        join(dist, '404.html'),
        html.replace(/(src|href)="\.\//g, (_m, attr) => `${attr}="/`),
        'utf8',
      );
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [spaFallbackPlugin()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
  },
});
