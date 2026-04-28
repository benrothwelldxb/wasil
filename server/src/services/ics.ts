/**
 * ICS (iCalendar) file generation utility
 * Follows RFC 5545 specification
 */

export interface ICSEvent {
  id: string
  title: string
  description?: string | null
  date: string          // YYYY-MM-DD
  endDate?: string | null // YYYY-MM-DD (for multi-day events)
  startTime?: string | null // HH:MM or HH:MM - HH:MM format
  endTime?: string | null   // HH:MM
  location?: string | null
  allDay?: boolean
}

function escapeICSText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

/**
 * Fold long lines per RFC 5545 (max 75 octets per line).
 * Continuation lines start with a single space.
 */
function foldLine(line: string): string {
  if (line.length <= 75) return line
  const parts: string[] = []
  parts.push(line.substring(0, 75))
  let remaining = line.substring(75)
  while (remaining.length > 0) {
    parts.push(' ' + remaining.substring(0, 74))
    remaining = remaining.substring(74)
  }
  return parts.join('\r\n')
}

function formatDateValue(dateStr: string): string {
  // dateStr is YYYY-MM-DD, output YYYYMMDD
  return dateStr.replace(/-/g, '')
}

/**
 * Parse a time string like "8:30 AM", "14:00", "2:30 PM - 4:00 PM", "08:30"
 * Returns { startTime: "HHMMSS", endTime?: "HHMMSS" } or null
 */
function parseTimeString(timeStr: string): { startTime: string; endTime?: string } | null {
  if (!timeStr) return null

  // Try to split on " - " for time ranges
  const parts = timeStr.split(/\s*-\s*/)

  const parseOne = (t: string): string | null => {
    t = t.trim()

    // Try 12-hour format: "8:30 AM", "2:30 PM"
    const match12 = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
    if (match12) {
      let hours = parseInt(match12[1])
      const minutes = match12[2]
      const ampm = match12[3].toUpperCase()
      if (ampm === 'PM' && hours < 12) hours += 12
      if (ampm === 'AM' && hours === 12) hours = 0
      return `${String(hours).padStart(2, '0')}${minutes}00`
    }

    // Try 24-hour format: "14:00", "08:30"
    const match24 = t.match(/^(\d{1,2}):(\d{2})$/)
    if (match24) {
      const hours = match24[1].padStart(2, '0')
      const minutes = match24[2]
      return `${hours}${minutes}00`
    }

    return null
  }

  const startTime = parseOne(parts[0])
  if (!startTime) return null

  const endTime = parts.length > 1 ? parseOne(parts[1]) : undefined

  return { startTime, endTime: endTime || undefined }
}

/**
 * Generate a valid ICS calendar file string from an array of events.
 */
export function generateICS(events: ICSEvent[], calendarName?: string): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Wasil//School Calendar//EN',
    `X-WR-CALNAME:${escapeICSText(calendarName || 'School Calendar')}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ]

  for (const event of events) {
    const uid = `event-${event.id}@wasil.app`
    const isAllDay = event.allDay !== false && !event.startTime

    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${uid}`)
    lines.push(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`)

    if (isAllDay) {
      // All-day event: use DATE format
      const dtStart = formatDateValue(event.date)
      lines.push(`DTSTART;VALUE=DATE:${dtStart}`)

      if (event.endDate) {
        // ICS all-day DTEND is exclusive, so add one day
        const endDate = new Date(event.endDate)
        endDate.setDate(endDate.getDate() + 1)
        const dtEnd = endDate.toISOString().split('T')[0].replace(/-/g, '')
        lines.push(`DTEND;VALUE=DATE:${dtEnd}`)
      } else {
        // Single all-day event: DTEND is next day
        const nextDay = new Date(event.date)
        nextDay.setDate(nextDay.getDate() + 1)
        const dtEnd = nextDay.toISOString().split('T')[0].replace(/-/g, '')
        lines.push(`DTEND;VALUE=DATE:${dtEnd}`)
      }
    } else {
      // Timed event
      const parsed = event.startTime ? parseTimeString(event.startTime) : null
      const dtStart = formatDateValue(event.date)

      if (parsed) {
        lines.push(`DTSTART:${dtStart}T${parsed.startTime}`)
        if (parsed.endTime) {
          lines.push(`DTEND:${dtStart}T${parsed.endTime}`)
        } else {
          // Default to 1 hour duration
          const startHour = parseInt(parsed.startTime.substring(0, 2))
          const endHour = String(startHour + 1).padStart(2, '0')
          lines.push(`DTEND:${dtStart}T${endHour}${parsed.startTime.substring(2)}`)
        }
      } else {
        // Fallback to all-day if time can't be parsed
        lines.push(`DTSTART;VALUE=DATE:${dtStart}`)
        const nextDay = new Date(event.date)
        nextDay.setDate(nextDay.getDate() + 1)
        const dtEnd = nextDay.toISOString().split('T')[0].replace(/-/g, '')
        lines.push(`DTEND;VALUE=DATE:${dtEnd}`)
      }
    }

    lines.push(foldLine(`SUMMARY:${escapeICSText(event.title)}`))

    if (event.description) {
      lines.push(foldLine(`DESCRIPTION:${escapeICSText(event.description)}`))
    }

    if (event.location) {
      lines.push(foldLine(`LOCATION:${escapeICSText(event.location)}`))
    }

    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')

  return lines.join('\r\n')
}
