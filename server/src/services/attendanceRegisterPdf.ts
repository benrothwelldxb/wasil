import prisma from './prisma.js'

interface ClassRegister {
  className: string
  yearGroupName: string | null
  students: Array<{
    firstName: string
    lastName: string
    status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED' | null
    notes: string | null
  }>
}

interface DailyRegistersData {
  schoolName: string
  date: string
  classes: ClassRegister[]
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

export async function generateDailyRegistersHtml(
  schoolId: string,
  date: string,
): Promise<string> {
  const [school, classes, records] = await Promise.all([
    prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } }),
    prisma.class.findMany({
      where: { schoolId },
      include: {
        yearGroup: { select: { name: true } },
        students: {
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.attendanceRecord.findMany({
      where: { schoolId, date },
      select: { studentId: true, status: true, notes: true },
    }),
  ])

  const recordMap = new Map(records.map(r => [r.studentId, r]))

  const data: DailyRegistersData = {
    schoolName: school?.name ?? '',
    date,
    classes: classes.map(c => ({
      className: c.name,
      yearGroupName: c.yearGroup?.name ?? null,
      students: c.students.map(s => {
        const rec = recordMap.get(s.id)
        return {
          firstName: s.firstName,
          lastName: s.lastName,
          status: rec?.status ?? null,
          notes: rec?.notes ?? null,
        }
      }),
    })),
  }

  return renderHtml(data)
}

function renderHtml(data: DailyRegistersData): string {
  const dateLabel = formatLongDate(data.date)

  const recordedMark = (status: string | null, target: string) =>
    status === target ? '<span class="mark">&#10003;</span>' : ''

  const classPages = data.classes
    .map((cls, idx) => {
      const heading = cls.yearGroupName && cls.yearGroupName !== cls.className
        ? `${escapeHtml(cls.className)} <span class="year-group">(${escapeHtml(cls.yearGroupName)})</span>`
        : escapeHtml(cls.className)

      const rows = cls.students.length === 0
        ? `<tr><td colspan="11" class="empty">No students in this class.</td></tr>`
        : cls.students.map((s, i) => `
          <tr>
            <td class="num">${i + 1}</td>
            <td class="student-name">${escapeHtml(s.lastName)}, ${escapeHtml(s.firstName)}</td>
            <td class="rec">${recordedMark(s.status, 'PRESENT')}</td>
            <td class="rec">${recordedMark(s.status, 'ABSENT')}</td>
            <td class="rec">${recordedMark(s.status, 'LATE')}</td>
            <td class="rec">${recordedMark(s.status, 'EXCUSED')}</td>
            <td class="tick"></td>
            <td class="tick"></td>
            <td class="tick"></td>
            <td class="tick"></td>
            <td class="notes">${escapeHtml(s.notes ?? '')}</td>
          </tr>
        `).join('')

      return `
        <section class="register" ${idx > 0 ? 'style="page-break-before: always;"' : ''}>
          <header class="page-head">
            <div class="school">${escapeHtml(data.schoolName)}</div>
            <h1>Daily Attendance Register</h1>
            <div class="meta">
              <span class="class-label">${heading}</span>
              <span class="date-label">${escapeHtml(dateLabel)}</span>
            </div>
          </header>

          <table class="register-table">
            <thead>
              <tr class="group-row">
                <th rowspan="2" class="num">#</th>
                <th rowspan="2" class="student-name">Student</th>
                <th colspan="4" class="group-recorded">Recorded</th>
                <th colspan="4" class="group-tick">Tick now</th>
                <th rowspan="2" class="notes">Notes</th>
              </tr>
              <tr>
                <th class="rec">P</th>
                <th class="rec">A</th>
                <th class="rec">L</th>
                <th class="rec">E</th>
                <th class="tick">P</th>
                <th class="tick">A</th>
                <th class="tick">L</th>
                <th class="tick">E</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>

          <footer class="page-foot">
            <div class="legend">
              <strong>Key:</strong> P = Present &nbsp; A = Absent &nbsp; L = Late &nbsp; E = Excused
            </div>
            <div class="sig">
              Teacher signature: ____________________________
              &nbsp;&nbsp; Time: __________
            </div>
          </footer>
        </section>
      `
    })
    .join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Daily Registers &mdash; ${escapeHtml(dateLabel)}</title>
  <style>
    @page { size: A4 portrait; margin: 14mm 12mm; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      color: #1a1a1a;
      margin: 0;
      padding: 0;
    }
    .toolbar {
      position: sticky;
      top: 0;
      background: #fff;
      border-bottom: 1px solid #e2e8f0;
      padding: 10px 16px;
      display: flex;
      gap: 8px;
      align-items: center;
      justify-content: flex-end;
    }
    .toolbar button {
      background: #C4506E;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    .toolbar .hint { color: #64748b; font-size: 12px; margin-right: auto; }
    .register {
      padding: 18px 16px 0;
      max-width: 210mm;
      margin: 0 auto;
    }
    .page-head { text-align: center; margin-bottom: 12px; }
    .page-head .school {
      font-size: 11pt;
      color: #475569;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .page-head h1 {
      font-size: 18pt;
      margin: 2px 0 6px;
      color: #0f172a;
    }
    .page-head .meta {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      border-top: 2px solid #0f172a;
      border-bottom: 2px solid #0f172a;
      padding: 6px 4px;
      font-size: 11pt;
    }
    .page-head .class-label { font-weight: 700; font-size: 13pt; }
    .page-head .year-group { color: #64748b; font-weight: 400; font-size: 11pt; }
    .page-head .date-label { font-weight: 600; }

    table.register-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
      font-size: 10pt;
    }
    table.register-table th,
    table.register-table td {
      border: 1px solid #94a3b8;
      padding: 4px 6px;
      vertical-align: middle;
    }
    table.register-table thead th {
      background: #f1f5f9;
      font-weight: 700;
      text-align: center;
    }
    table.register-table th.group-recorded { background: #e2e8f0; }
    table.register-table th.group-tick { background: #fef3c7; }
    table.register-table th.rec,
    table.register-table td.rec { width: 22px; text-align: center; background: #f8fafc; }
    table.register-table th.tick,
    table.register-table td.tick { width: 28px; text-align: center; }
    table.register-table td.tick { height: 22px; }
    table.register-table td.num { width: 24px; text-align: center; color: #64748b; }
    table.register-table td.student-name {
      text-align: left;
      font-weight: 600;
      white-space: nowrap;
    }
    table.register-table td.notes { min-width: 110px; }
    table.register-table td.empty {
      text-align: center;
      color: #94a3b8;
      font-style: italic;
      padding: 18px;
    }
    table.register-table tbody tr:nth-child(even) td:not(.tick) { background: #fafafa; }
    table.register-table .mark { color: #0f766e; font-weight: 700; }

    .page-foot {
      margin-top: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 9pt;
      color: #334155;
    }
    .page-foot .legend strong { color: #0f172a; }

    @media print {
      .toolbar { display: none; }
      .register { padding: 0; }
      body { margin: 0; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <span class="hint">${data.classes.length} class${data.classes.length === 1 ? '' : 'es'} &middot; ${escapeHtml(dateLabel)}</span>
    <button onclick="window.print()">Print / Save as PDF</button>
  </div>
  ${classPages || '<section class="register"><p style="text-align:center;color:#64748b;padding:40px;">No classes found.</p></section>'}
</body>
</html>`
}

export default { generateDailyRegistersHtml }
