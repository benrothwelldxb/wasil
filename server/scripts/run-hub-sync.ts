import { syncSchoolFromHub } from '../src/services/hubSync.js'

const connectSchoolId = process.argv[2]
if (!connectSchoolId) {
  console.error('usage: tsx scripts/run-hub-sync.ts <connectSchoolId>')
  process.exit(1)
}

syncSchoolFromHub(connectSchoolId)
  .then(summary => {
    console.log('SYNC OK:', JSON.stringify(summary, null, 2))
    process.exit(0)
  })
  .catch(err => {
    console.error('SYNC FAILED:', err)
    process.exit(1)
  })
