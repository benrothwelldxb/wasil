import prisma from './prisma.js'

interface AttendanceRegisterData {
  activityName: string
  dayOfWeek: number
  timeSlot: string
  location: string | null
  staffName: string | null
  termName: string
  schoolName: string
  sessions: Array<{
    date: string
    students: Array<{
      studentId: string
      studentName: string
      className: string
      status: string | null
      note: string | null
    }>
  }>
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/**
 * Generate HTML for attendance register PDF export
 */
export async function generateAttendanceRegisterHtml(
  activityId: string,
  startDate: Date,
  endDate: Date
): Promise<string> {
  // Get activity with related data
  const activity = await prisma.ecaActivity.findUnique({
    where: { id: activityId },
    include: {
      ecaTerm: {
        include: {
          school: { select: { name: true } },
        },
      },
      staff: { select: { name: true } },
      allocations: {
        where: { status: 'CONFIRMED' },
        include: {
          student: {
            include: {
              class: { select: { name: true } },
            },
          },
        },
        orderBy: { student: { lastName: 'asc' } },
      },
      attendanceRecords: {
        where: {
          sessionDate: {
            gte: startDate,
            lte: endDate,
          },
        },
      },
    },
  })

  if (!activity) {
    throw new Error('Activity not found')
  }

  // Generate session dates based on activity day of week
  const sessionDates: Date[] = []
  const current = new Date(startDate)
  while (current <= endDate) {
    if (current.getDay() === activity.dayOfWeek) {
      sessionDates.push(new Date(current))
    }
    current.setDate(current.getDate() + 1)
  }

  // Build data structure
  const data: AttendanceRegisterData = {
    activityName: activity.name,
    dayOfWeek: activity.dayOfWeek,
    timeSlot: activity.timeSlot === 'BEFORE_SCHOOL' ? 'Before School' : 'After School',
    location: activity.location,
    staffName: activity.staff?.name || null,
    termName: activity.ecaTerm.name,
    schoolName: activity.ecaTerm.school.name,
    sessions: sessionDates.map(date => ({
      date: date.toISOString().split('T')[0],
      students: activity.allocations.map(allocation => {
        const record = activity.attendanceRecords.find(
          r => r.studentId === allocation.studentId &&
               r.sessionDate.toISOString().split('T')[0] === date.toISOString().split('T')[0]
        )
        return {
          studentId: allocation.student.id,
          studentName: `${allocation.student.lastName}, ${allocation.student.firstName}`,
          className: allocation.student.class.name,
          status: record?.status || null,
          note: record?.note || null,
        }
      }),
    })),
  }

  // Generate HTML
  return generateHtml(data)
}

function generateHtml(data: AttendanceRegisterData): string {
  const statusSymbol = (status: string | null): string => {
    switch (status) {
      case 'PRESENT': return '<span style="color: green;">&#10003;</span>'
      case 'ABSENT': return '<span style="color: red;">&#10007;</span>'
      case 'EXCUSED': return '<span style="color: orange;">E</span>'
      case 'LATE': return '<span style="color: blue;">L</span>'
      default: return ''
    }
  }

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
  }

  // Get all unique students
  const students = data.sessions[0]?.students || []

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${data.activityName} - Attendance Register</title>
  <style>
    @page {
      size: landscape;
      margin: 1cm;
    }
    body {
      font-family: Arial, sans-serif;
      font-size: 10pt;
      margin: 0;
      padding: 20px;
    }
    .header {
      text-align: center;
      margin-bottom: 20px;
    }
    .header h1 {
      margin: 0;
      font-size: 18pt;
      color: #333;
    }
    .header p {
      margin: 5px 0;
      color: #666;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 15px;
      font-size: 9pt;
    }
    .info-item {
      display: flex;
      gap: 5px;
    }
    .info-label {
      font-weight: bold;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 6px 4px;
      text-align: center;
    }
    th {
      background-color: #f5f5f5;
      font-weight: bold;
    }
    .student-name {
      text-align: left;
      white-space: nowrap;
    }
    .class-name {
      text-align: left;
      font-size: 8pt;
      color: #666;
    }
    .legend {
      margin-top: 20px;
      font-size: 8pt;
      color: #666;
    }
    .legend span {
      margin-right: 15px;
    }
    .date-header {
      writing-mode: vertical-rl;
      text-orientation: mixed;
      min-width: 30px;
    }
    @media print {
      body {
        padding: 0;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${data.activityName}</h1>
    <p>${data.schoolName}</p>
    <p>${data.termName}</p>
  </div>

  <div class="info-row">
    <div class="info-item">
      <span class="info-label">Day:</span>
      <span>${DAY_NAMES[data.dayOfWeek]}</span>
    </div>
    <div class="info-item">
      <span class="info-label">Time:</span>
      <span>${data.timeSlot}</span>
    </div>
    ${data.location ? `
    <div class="info-item">
      <span class="info-label">Location:</span>
      <span>${data.location}</span>
    </div>
    ` : ''}
    ${data.staffName ? `
    <div class="info-item">
      <span class="info-label">Staff:</span>
      <span>${data.staffName}</span>
    </div>
    ` : ''}
  </div>

  <table>
    <thead>
      <tr>
        <th style="text-align: left;">Student Name</th>
        <th>Class</th>
        ${data.sessions.map(s => `<th><div class="date-header">${formatDate(s.date)}</div></th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${students.map(student => `
        <tr>
          <td class="student-name">${student.studentName}</td>
          <td class="class-name">${student.className}</td>
          ${data.sessions.map(session => {
            const studentRecord = session.students.find(s => s.studentId === student.studentId)
            return `<td>${statusSymbol(studentRecord?.status || null)}</td>`
          }).join('')}
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="legend">
    <span><span style="color: green;">&#10003;</span> Present</span>
    <span><span style="color: red;">&#10007;</span> Absent</span>
    <span><span style="color: orange;">E</span> Excused</span>
    <span><span style="color: blue;">L</span> Late</span>
  </div>
</body>
</html>
`
}

/**
 * Generate a blank attendance register for printing
 */
export async function generateBlankRegisterHtml(
  activityId: string,
  sessionCount: number = 10
): Promise<string> {
  const activity = await prisma.ecaActivity.findUnique({
    where: { id: activityId },
    include: {
      ecaTerm: {
        include: {
          school: { select: { name: true } },
        },
      },
      staff: { select: { name: true } },
      allocations: {
        where: { status: 'CONFIRMED' },
        include: {
          student: {
            include: {
              class: { select: { name: true } },
            },
          },
        },
        orderBy: { student: { lastName: 'asc' } },
      },
    },
  })

  if (!activity) {
    throw new Error('Activity not found')
  }

  const students = activity.allocations.map(a => ({
    name: `${a.student.lastName}, ${a.student.firstName}`,
    className: a.student.class.name,
  }))

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${activity.name} - Blank Register</title>
  <style>
    @page {
      size: landscape;
      margin: 1cm;
    }
    body {
      font-family: Arial, sans-serif;
      font-size: 10pt;
      margin: 0;
      padding: 20px;
    }
    .header {
      text-align: center;
      margin-bottom: 20px;
    }
    .header h1 {
      margin: 0;
      font-size: 18pt;
      color: #333;
    }
    .header p {
      margin: 5px 0;
      color: #666;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
    }
    th, td {
      border: 1px solid #333;
      padding: 8px 4px;
      text-align: center;
    }
    th {
      background-color: #f0f0f0;
      font-weight: bold;
    }
    .student-name {
      text-align: left;
      white-space: nowrap;
    }
    .date-cell {
      height: 30px;
      min-width: 35px;
    }
    .date-header {
      height: 60px;
    }
    @media print {
      body {
        padding: 0;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${activity.name}</h1>
    <p>${activity.ecaTerm.school.name} | ${activity.ecaTerm.name}</p>
    <p>${DAY_NAMES[activity.dayOfWeek]} - ${activity.timeSlot === 'BEFORE_SCHOOL' ? 'Before School' : 'After School'}${activity.location ? ` | ${activity.location}` : ''}</p>
  </div>

  <table>
    <thead>
      <tr>
        <th style="text-align: left;">Student Name</th>
        <th>Class</th>
        ${Array(sessionCount).fill(0).map((_, i) => `<th class="date-header">Date:<br/>_____</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${students.map(student => `
        <tr>
          <td class="student-name">${student.name}</td>
          <td>${student.className}</td>
          ${Array(sessionCount).fill(0).map(() => `<td class="date-cell"></td>`).join('')}
        </tr>
      `).join('')}
    </tbody>
  </table>
</body>
</html>
`
}

export default {
  generateAttendanceRegisterHtml,
  generateBlankRegisterHtml,
}
