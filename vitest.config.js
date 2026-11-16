// npm test — the unit tests in tests/unit: the shop's own rules (delivery
// charges, stock, sale prices, phone numbers, canonical addresses), checked
// in Node without a browser or the database.
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['tests/unit/**/*.test.js'],
    // The Supabase client is made on import; nothing here reaches it.
    env: { VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_ANON_KEY: 'test' },
  },
})
