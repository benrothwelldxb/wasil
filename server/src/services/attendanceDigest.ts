import prisma from './prisma.js'
import { sendEmail } from './email.js'

export interface DigestRow {
  studentName: string
  className: string
  status: 'ABSENT' | 'LATE' | 'EXCUSED'
  notes: string | null
}

export interface DigestData {
  schoolName: string
  date: string // YYYY-MM-DD
  formattedDate: string
  absent: DigestRow[]
  late: DigestRow[]
  excused: DigestRow[]
  totalStudents: number
  totalMarked: number
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatLongDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export async function buildDigestData(schoolId: string, date: string): Promise<DigestData> {
  const [school, records, totalStudents] = await Promise.all([
    prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } }),
    prisma.attendanceRecord.findMany({
      where: {
        schoolId,
        date,
        status: { in: ['ABSENT', 'LATE', 'EXCUSED'] },
      },
      include: {
        student: {
          select: {
            firstName: true,
            lastName: true,
            class: { select: { name: true } },
          },
        },
      },
      orderBy: [{ student: { class: { name: 'asc' } } }, { student: { lastName: 'asc' } }],
    }),
    prisma.student.count({ where: { schoolId } }),
  ])

  const totalMarked = await prisma.attendanceRecord.count({ where: { schoolId, date } })

  const rows: DigestRow[] = records.map(r => ({
    studentName: `${r.student.lastName}, ${r.student.firstName}`,
    className: r.student.class.name,
    status: r.status as 'ABSENT' | 'LATE' | 'EXCUSED',
    notes: r.notes,
  }))

  return {
    schoolName: school?.name ?? '',
    date,
    formattedDate: formatLongDate(date),
    absent: rows.filter(r => r.status === 'ABSENT'),
    late: rows.filter(r => r.status === 'LATE'),
    excused: rows.filter(r => r.status === 'EXCUSED'),
    totalStudents,
    totalMarked,
  }
}

function renderRowsHtml(rows: DigestRow[]): string {
  if (rows.length === 0) {
    return '<p style="margin: 4px 0 12px; color: #64748b; font-style: italic;">None.</p>'
  }
  const trs = rows
    .map(
      r => `
      <tr>
        <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${escapeHtml(r.studentName)}</td>
        <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; color: #475569;">${escapeHtml(r.className)}</td>
        <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; color: #475569;">${escapeHtml(r.notes ?? '')}</td>
      </tr>`,
    )
    .join('')
  return `
    <table style="width: 100%; border-collapse: collapse; margin: 6px 0 18px; font-size: 14px;">
      <thead>
        <tr style="background: #f1f5f9;">
          <th style="text-align: left; padding: 6px 10px; border-bottom: 1px solid #cbd5e1;">Student</th>
          <th style="text-align: left; padding: 6px 10px; border-bottom: 1px solid #cbd5e1;">Class</th>
          <th style="text-align: left; padding: 6px 10px; border-bottom: 1px solid #cbd5e1;">Notes</th>
        </tr>
      </thead>
      <tbody>${trs}</tbody>
    </table>
  `
}

function renderRowsText(rows: DigestRow[]): string {
  if (rows.length === 0) return '  (none)\n'
  return (
    rows
      .map(r => {
        const note = r.notes ? ` — ${r.notes}` : ''
        return `  • ${r.studentName} (${r.className})${note}`
      })
      .join('\n') + '\n'
  )
}

export function renderDigestHtml(data: DigestData): string {
  return `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #0f172a; padding: 24px; max-width: 720px; margin: 0 auto;">
  <h1 style="font-size: 20px; margin: 0 0 4px;">${escapeHtml(data.schoolName)}</h1>
  <h2 style="font-size: 16px; color: #475569; margin: 0 0 18px; font-weight: 500;">Daily Attendance Digest &middot; ${escapeHtml(data.formattedDate)}</h2>

  <p style="margin: 0 0 18px; color: #475569; font-size: 14px;">
    ${data.totalMarked} of ${data.totalStudents} students marked today.
  </p>

  <h3 style="font-size: 14px; margin: 14px 0 4px; color: #b91c1c;">Absent (${data.absent.length})</h3>
  ${renderRowsHtml(data.absent)}

  <h3 style="font-size: 14px; margin: 14px 0 4px; color: #c2410c;">Late (${data.late.length})</h3>
  ${renderRowsHtml(data.late)}

  <h3 style="font-size: 14px; margin: 14px 0 4px; color: #4338ca;">Excused (${data.excused.length})</h3>
  ${renderRowsHtml(data.excused)}

  <p style="margin: 24px 0 0; color: #94a3b8; font-size: 12px;">
    This digest is sent automatically. You can change the time or recipients in the admin settings.
  </p>
</body>
</html>`
}

export function renderDigestText(data: DigestData): string {
  return [
    `${data.schoolName} — Daily Attendance Digest`,
    data.formattedDate,
    `${data.totalMarked} of ${data.totalStudents} students marked today.`,
    '',
    `Absent (${data.absent.length}):`,
    renderRowsText(data.absent),
    `Late (${data.late.length}):`,
    renderRowsText(data.late),
    `Excused (${data.excused.length}):`,
    renderRowsText(data.excused),
  ].join('\n')
}

/**
 * Sends the digest for `date` to all admins of `schoolId`. Returns the number of
 * recipients sent to. Does not check timing — caller decides when to call.
 */
export async function sendDigestForSchool(schoolId: string, date: string): Promise<number> {
  const admins = await prisma.user.findMany({
    where: { schoolId, role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
    select: { email: true },
  })
  if (admins.length === 0) return 0

  const data = await buildDigestData(schoolId, date)
  const subject = `Attendance digest — ${data.formattedDate}`
  const html = renderDigestHtml(data)
  const text = renderDigestText(data)

  await Promise.all(
    admins.map(a =>
      sendEmail({ to: a.email, subject, html, text }).catch(err =>
        console.error(`[AttendanceDigest] Failed to send to ${a.email}:`, err),
      ),
    ),
  )

  return admins.length
}

/**
 * Returns the date in the given IANA timezone as YYYY-MM-DD, plus current HH:MM.
 * Falls back to UTC if the timezone is invalid.
 */
function nowInTimezone(timezone: string): { date: string; time: string } {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    const parts = fmt.formatToParts(new Date())
    const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
    const date = `${get('year')}-${get('month')}-${get('day')}`
    const hour = get('hour') === '24' ? '00' : get('hour')
    const time = `${hour}:${get('minute')}`
    return { date, time }
  } catch {
    const now = new Date()
    return {
      date: now.toISOString().slice(0, 10),
      time: now.toISOString().slice(11, 16),
    }
  }
}

/**
 * Cron entry point — call hourly. For each school with the digest enabled,
 * sends if the current school-local time is within a 60-minute window after
 * the configured send time, and we haven't already sent for the school-local
 * date. Idempotent.
 */
export async function sendDueAttendanceDigests(): Promise<void> {
  try {
    const schools = await prisma.school.findMany({
      where: {
        archived: false,
        attendanceEnabled: true,
        attendanceDigestEnabled: true,
        attendanceDigestTime: { not: null },
      },
      select: {
        id: true,
        name: true,
        timezone: true,
        attendanceDigestTime: true,
        attendanceDigestLastSentDate: true,
      },
    })

    for (const school of schools) {
      if (!school.attendanceDigestTime) continue

      const { date: schoolDate, time: schoolTime } = nowInTimezone(school.timezone)

      // Already sent today
      if (school.attendanceDigestLastSentDate === schoolDate) continue

      // Send if we're at or past the configured time today
      if (schoolTime < school.attendanceDigestTime) continue

      const count = await sendDigestForSchool(school.id, schoolDate)
      await prisma.school.update({
        where: { id: school.id },
        data: { attendanceDigestLastSentDate: schoolDate },
      })
      console.log(`[AttendanceDigest] Sent ${schoolDate} digest for ${school.name} to ${count} admin(s)`)
    }
  } catch (error) {
    console.error('[AttendanceDigest] sendDueAttendanceDigests error:', error)
  }
}
