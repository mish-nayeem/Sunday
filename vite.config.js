import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // The Supabase URL and key are baked into the bundle at build time. A build
  // without them deploys a blank page ("supabaseUrl is required"), so fail
  // the build instead — set them under Cloudflare → Settings → Builds →
  // Variables and secrets, or in .env.local for a local build.
  if (command === 'build') {
    const env = loadEnv(mode, process.cwd(), '')
    const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'].filter((k) => !env[k])
    if (missing.length) throw new Error(`Missing build variables: ${missing.join(', ')}`)
  }

  // The site's own address, for the share preview (og:image must be a full
  // URL) and the canonical link. Set VITE_SITE_URL once the shop has its
  // own domain (e.g. https://sunday.com.bd).
  const siteUrl = (loadEnv(mode, process.cwd(), '').VITE_SITE_URL || 'https://sunday.mish-nayeem.workers.dev').replace(/\/+$/, '')
  const siteUrlPlugin = {
    name: 'site-url',
    transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', siteUrl),
  }

  return {
    plugins: [react(), siteUrlPlugin],
    resolve: {
      alias: {
        '@': '/src',
      },
    },
    build: {
      rollupOptions: {
        output: {
          // Big libraries get their own files: they change far less often
          // than the site's code, so returning visitors keep them cached.
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            supabase: ['@supabase/supabase-js'],
            motion: ['framer-motion'],
          },
        },
      },
    },
  }
});
