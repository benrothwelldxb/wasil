// Mint a partner API token (e.g. for Desk). Stores only the SHA-256 hash; prints
// the plaintext ONCE — hand it to the partner for their env, then it's gone.
//
//   DATABASE_URL=<...> npx tsx scripts/mint-partner-token.ts <name>
import crypto from 'crypto'
import prisma from '../src/services/prisma.js'

const name = process.argv[2]
if (!name) {
  console.error('usage: tsx scripts/mint-partner-token.ts <name>')
  process.exit(1)
}

const token = 'cpk_' + crypto.randomBytes(32).toString('hex')
const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

prisma.partnerToken
  .create({ data: { name, tokenHash } })
  .then((pt) => {
    console.log('PARTNER TOKEN minted — store securely, shown ONCE:')
    console.log(token)
    console.log(`(id=${pt.id} name=${pt.name})`)
    process.exit(0)
  })
  .catch((err) => {
    console.error('MINT FAILED:', err)
    process.exit(1)
  })
