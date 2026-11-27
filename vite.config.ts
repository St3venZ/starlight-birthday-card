import { defineConfig, type Plugin } from 'vite';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Emits static SPA fallback pages so deep links survive on hosts without
 * server-side routing (GitHub Pages project sites, Cloudflare Pages).
 *
 * Two distinct cases are handled, and they are NOT interchangeable:
 *
 *  1. `create/index.html`, `c/index.html` — served as real directories at a
 *     known depth. Because the build uses `base: './'`, asset URLs must be
 *     prefixed with the matching number of `../` segments.
 *
 *  2. `404.html` — served as the body of an arbitrary 404 response, so the
 *     depth of the requested URL is unknown. Relative URLs would break at
 *     `/c/<id>` (bare segment) and absolute `/assets/...` would break on a
 *     GitHub Pages project site hosted under `/<repo>/`. GitHub Pages does not
 *     substitute a `--base-path--` token, so the asset prefix is resolved from
 *     the repository name that the Pages action exposes via GITHUB_REPOSITORY.
 */
function spaFallbackPlugin(): Plugin {
  return {
    name: 'spa-fallback',
    apply: 'build',
    closeBundle() {
      const dist = join(process.cwd(), 'dist');
      const html = readFileSync(join(dist, 'index.html'), 'utf8');

      const depthRoutes = [
        { dir: 'create', depth: 1 },
        { dir: 'c', depth: 1 },
      ];

      for (const { dir, depth } of depthRoutes) {
        const up = '../'.repeat(depth);
        const rewritten = html
          .replace(/(src|href)="\.\//g, (_m, attr) => `${attr}="${up}`)
          .replace(/(src|href)='\.\//g, (_m, attr) => `${attr}='${up}`);
        mkdirSync(join(dist, dir), { recursive: true });
        writeFileSync(join(dist, dir, 'index.html'), rewritten, 'utf8');
      }

      // Resolve the site root path. On a GitHub Pages *project* site the app is
      // served from /<repo>/, so a root-absolute /assets/... would 404.
      const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];
      const isUserSite = Boolean(repo?.toLowerCase().endsWith('.github.io'));
      const basePath =
        process.env.SPA_FALLBACK_BASE ??
        (repo && !isUserSite ? `/${repo}/` : '/');

      const notFound = html.replace(
        /(src|href)="\.\//g,
        (_m, attr) => `${attr}="${basePath}`,
      );
      writeFileSync(join(dist, '404.html'), notFound, 'utf8');

      // Also emit an explicit /c/index.html style fallback for the share prefix
      // already handled above; log the resolved base so CI logs are unambiguous.
      console.log(`[spa-fallback] asset base for 404.html = ${basePath}`);
    },
  };
}

const isCloudflarePages = process.env.CF_PAGES === '1';

export default defineConfig({
  base: isCloudflarePages ? '/' : './',
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
