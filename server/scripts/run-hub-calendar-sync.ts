import { syncCalendar, defaultCalendarWindow } from '../src/services/hubCalendarSync.js'

// Manual Hub calendar sync for one Connect school. Dormant (clean no-op) until
// the wsk token gains `calendar:read` scope and the school is Hub-linked.
//
//   tsx scripts/run-hub-calendar-sync.ts <connectSchoolId> [from YYYY-MM-DD] [to YYYY-MM-DD]
const connectSchoolId = process.argv[2]
if (!connectSchoolId) {
  console.error(
    'usage: tsx scripts/run-hub-calendar-sync.ts <connectSchoolId> [from YYYY-MM-DD] [to YYYY-MM-DD]',
  )
  process.exit(1)
}

const def = defaultCalendarWindow()
const from = process.argv[3] || def.from
const to = process.argv[4] || def.to

syncCalendar(connectSchoolId, { from, to })
  .then((summary) => {
    console.log('CALENDAR SYNC OK:', JSON.stringify(summary, null, 2))
    process.exit(0)
  })
  .catch((err) => {
    console.error('CALENDAR SYNC FAILED:', err)
    process.exit(1)
  })
