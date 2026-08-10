import { serve } from '@hono/node-server'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { createApp } from './app'
import { createPgDb, createPgliteDb, runMigrations, type Db } from './db'
import { maybeSeed } from './seed'

const PORT = Number(process.env.PORT ?? 8080)
const DIST = resolve(process.cwd(), 'dist')

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

async function main() {
  let db: Db
  if (process.env.USE_PGLITE === 'true') {
    console.log('[db] Using PGlite (in-process Postgres) — dev only.')
    db = await createPgliteDb()
  } else {
    const conn = process.env.DATABASE_URL
    if (!conn) {
      console.error('DATABASE_URL is required. On Railway, add a Postgres plugin and it is set for you.')
      process.exit(1)
    }
    db = createPgDb(conn)
  }
  await runMigrations(db)
  await maybeSeed(db)

  const app = createApp(db)

  // Serve the built SPA for everything that isn't an /api route.
  app.get('*', async (c) => {
    const pathname = decodeURIComponent(new URL(c.req.url).pathname)
    if (pathname.startsWith('/api')) return c.notFound()

    const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '')
    let file = join(DIST, safe)
    const hasExt = extname(safe) !== ''
    if (!hasExt || !existsSync(file)) file = join(DIST, 'index.html') // SPA fallback
    if (!file.startsWith(DIST)) file = join(DIST, 'index.html')

    try {
      const body = await readFile(file)
      const type = MIME[extname(file)] ?? 'application/octet-stream'
      const cache = extname(file) === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable'
      return new Response(body, { headers: { 'content-type': type, 'cache-control': cache } })
    } catch {
      return c.text('Not found', 404)
    }
  })

  serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(`🥚 Be a Good Egg listening on http://localhost:${info.port}`)
  })
}

main().catch((err) => {
  console.error('Fatal startup error:', err)
  process.exit(1)
})
