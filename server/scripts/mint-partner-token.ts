// Mint a partner API token. Stores only the SHA-256 hash; prints the plaintext
// ONCE — hand it to the partner for their env, then it's gone.
//
//   DATABASE_URL=<...> npx tsx scripts/mint-partner-token.ts <name> \
//     --prefixes=/api/partner/groups,/api/partner/activities \
//     --methods=POST,PUT,PATCH,DELETE
//
// Both flags are REQUIRED. Empty lists mean unrestricted in the middleware —
// that default exists only so tokens minted before scoping shipped keep
// working, and it is not something a new token should acquire by someone
// forgetting a flag. Pass `--unrestricted` to say you meant it.
//
// Scope to what the partner actually calls, not to what it might one day want.
// Wasil Active, for instance, writes contact groups, a catalogue entry and
// communication intents, and reads nothing at all — so it gets three prefixes
// and four write methods, and the routes carrying parent correspondence, the
// ILSA safeguarding threads and a family's inspection evidence stay unreachable
// to it even if a prefix is ever mis-typed, because every one of them is a GET.
import crypto from 'crypto'
import prisma from '../src/services/prisma.js'

const args = process.argv.slice(2)
const name = args.find((a) => !a.startsWith('--'))
const flag = (key: string): string | undefined =>
  args.find((a) => a.startsWith(`--${key}=`))?.split('=').slice(1).join('=')
const list = (v: string | undefined): string[] =>
  (v ?? '').split(',').map((x) => x.trim()).filter(Boolean)

const unrestricted = args.includes('--unrestricted')
const allowedPrefixes = list(flag('prefixes'))
const allowedMethods = list(flag('methods')).map((m) => m.toUpperCase())

const usage = `usage: tsx scripts/mint-partner-token.ts <name> --prefixes=<a,b> --methods=<POST,PUT>
       tsx scripts/mint-partner-token.ts <name> --unrestricted`

if (!name) {
  console.error(usage)
  process.exit(1)
}
if (!unrestricted && (allowedPrefixes.length === 0 || allowedMethods.length === 0)) {
  console.error('REFUSING: a new token needs --prefixes and --methods (or an explicit --unrestricted).')
  console.error('An unscoped token reaches every partner route, including parent correspondence.')
  console.error(usage)
  process.exit(1)
}

const bad = allowedPrefixes.filter((p) => !p.startsWith('/api/partner'))
if (bad.length > 0) {
  // A prefix is matched against the full path as the caller writes it. A
  // relative one ("/groups") silently matches nothing, and a token that can
  // call nothing looks exactly like a token that is broken.
  console.error(`REFUSING: prefixes must be full paths starting /api/partner — got ${bad.join(', ')}`)
  process.exit(1)
}

const token = 'cpk_' + crypto.randomBytes(32).toString('hex')
const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

prisma.partnerToken
  .create({ data: { name, tokenHash, allowedPrefixes, allowedMethods } })
  .then((pt) => {
    console.log('PARTNER TOKEN minted — store securely, shown ONCE:')
    console.log(token)
    console.log(`(id=${pt.id} name=${pt.name})`)
    console.log(
      unrestricted
        ? 'scope: UNRESTRICTED — every partner route, every method'
        : `scope: ${allowedMethods.join(' ')} on ${allowedPrefixes.join(' ')}`,
    )
    process.exit(0)
  })
  .catch((err) => {
    console.error('MINT FAILED:', err)
    process.exit(1)
  })
