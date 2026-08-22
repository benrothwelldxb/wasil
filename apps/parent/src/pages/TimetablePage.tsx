import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Clock, MapPin, User, CalendarDays, Sun } from 'lucide-react'
import { PageLogo } from '../components/PageHeader'
import { useApi, useAuth } from '@wasil/shared'
import * as api from '@wasil/shared'
import type { ChildTimetableWeek, ChildTimetableBlock } from '@wasil/shared'

// A parent's child, resolved from the newer studentLinks then legacy children.
interface ChildRef {
  id: string
  name: string
  className: string
}

// ── Date helpers (UTC-anchored string arithmetic, matching the server) ────────
function mondayOf(dateISO: string): string {
  const anchor = new Date(`${dateISO}T00:00:00.000Z`)
  const dow = anchor.getUTCDay() // 0=Sun … 6=Sat
  const mondayOffset = dow === 0 ? -6 : 1 - dow
  anchor.setUTCDate(anchor.getUTCDate() + mondayOffset)
  return anchor.toISOString().slice(0, 10)
}
function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
function todayISO(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
function fmtDay(dateISO: string) {
  const d = new Date(`${dateISO}T00:00:00`)
  return {
    weekday: d.toLocaleDateString('en-GB', { weekday: 'short' }),
    dayMonth: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
  }
}

// ── Colour handling ───────────────────────────────────────────────────────────
const HEX_RE = /^#[0-9a-fA-F]{6}$/
// A stable warm-neutral palette used when Hub gives no subject colour.
const PALETTE = [
  '#5B8EC4', // blue
  '#5BA97B', // green
  '#C4506E', // burgundy
  '#E8A54B', // amber
  '#8B6EC4', // violet
  '#4FB3BE', // teal
  '#D4708A', // rose
]
function hashIndex(s: string, n: number): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h % n
}
/** The accent colour for a lesson block: Hub's subject colour when it's a clean
 * hex, otherwise a stable palette colour hashed from the subject name. */
function accentFor(block: ChildTimetableBlock): string {
  const c = block.subject?.color
  if (c && HEX_RE.test(c)) return c
  const key = block.subject?.name ?? block.label
  return PALETTE[hashIndex(key.toLowerCase(), PALETTE.length)]
}

export function TimetablePage() {
  const { t } = useTranslation()
  const { user } = useAuth()

  // Deduplicated children (studentLinks preferred, then legacy children).
  const children = useMemo<ChildRef[]>(() => {
    const out: ChildRef[] = []
    const seen = new Set<string>()
    user?.studentLinks?.forEach((l) => {
      if (seen.has(l.studentId)) return
      seen.add(l.studentId)
      out.push({ id: l.studentId, name: l.studentName.trim(), className: l.className })
    })
    user?.children?.forEach((c) => {
      if (seen.has(c.id)) return
      seen.add(c.id)
      out.push({ id: c.id, name: c.name.trim(), className: c.className })
    })
    return out
  }, [user])

  const [selectedChildId, setSelectedChildId] = useState<string>(() => children[0]?.id ?? '')
  const [weekOf, setWeekOf] = useState<string>(() => mondayOf(todayISO()))

  // Fall back to the first child if the selection is stale (e.g. after load).
  const activeChildId = children.some((c) => c.id === selectedChildId)
    ? selectedChildId
    : children[0]?.id ?? ''

  const { data, isLoading } = useApi<ChildTimetableWeek | null>(
    () => (activeChildId ? api.timetable.childWeek(activeChildId, weekOf) : Promise.resolve(null)),
    [activeChildId, weekOf],
  )

  const today = todayISO()
  const weekStart = data?.weekOf ?? weekOf
  const weekEnd = addDaysISO(weekStart, 4)
  const rangeLabel = `${fmtDay(weekStart).dayMonth} – ${fmtDay(weekEnd).dayMonth}`
  const isCurrentWeek = weekOf === mondayOf(today)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <PageLogo />
        <h1 className="text-[26px] font-extrabold" style={{ color: '#2D2225' }}>
          {t('timetable.title', 'Timetable')}
        </h1>
        <p className="text-sm font-medium mt-1" style={{ color: '#7A6469' }}>
          {t('timetable.subtitle', "Your child's weekly classes")}
        </p>
      </div>

      {/* Child selector (only when there's more than one) */}
      {children.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          {children.map((child) => (
            <button
              key={child.id}
              onClick={() => setSelectedChildId(child.id)}
              className="px-4 py-2 rounded-full text-sm font-bold transition-colors"
              style={
                activeChildId === child.id
                  ? { backgroundColor: '#C4506E', color: '#FFFFFF' }
                  : { backgroundColor: '#FFFFFF', color: '#7A6469', border: '1.5px solid #F0E4E6' }
              }
            >
              {child.name}
            </button>
          ))}
        </div>
      )}

      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setWeekOf((w) => addDaysISO(w, -7))}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ backgroundColor: '#F5EEF0' }}
          aria-label="Previous week"
        >
          <ChevronLeft className="w-5 h-5" style={{ color: '#7A6469' }} />
        </button>
        <div className="text-center">
          <h2 className="text-base font-bold" style={{ color: '#2D2225' }}>
            {rangeLabel}
          </h2>
          {!isCurrentWeek && (
            <button
              onClick={() => setWeekOf(mondayOf(today))}
              className="text-xs font-semibold"
              style={{ color: '#C4506E' }}
            >
              {t('timetable.thisWeek', 'Back to this week')}
            </button>
          )}
          {isCurrentWeek && (
            <p className="text-xs font-semibold" style={{ color: '#A8929A' }}>
              {t('timetable.thisWeekLabel', 'This week')}
            </p>
          )}
        </div>
        <button
          onClick={() => setWeekOf((w) => addDaysISO(w, 7))}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ backgroundColor: '#F5EEF0' }}
          aria-label="Next week"
        >
          <ChevronRight className="w-5 h-5" style={{ color: '#7A6469' }} />
        </button>
      </div>

      {/* Body */}
      {isLoading ? (
        <WeekSkeleton />
      ) : data?.outOfTerm ? (
        // Hub's timetable pattern repeats every week, so a holiday/half-term week
        // would otherwise render a full grid. Parent-facing: hide the grid and
        // show only the notice, so it can't read as "school is on this week".
        <OutOfTermNotice resumeDate={data.resumeDate} t={t} />
      ) : !data || !data.hubAvailable || data.days.length === 0 ? (
        <EmptyState t={t} />
      ) : (
        <div className="space-y-5">
          {data.days.map((day) => {
            const isToday = day.date === today
            const meta = fmtDay(day.date)
            return (
              <div key={day.date}>
                {/* Day heading */}
                <div className="flex items-center gap-2 mb-2">
                  <h3
                    className="text-sm font-extrabold"
                    style={{ color: isToday ? '#C4506E' : '#2D2225' }}
                  >
                    {meta.weekday} {meta.dayMonth}
                  </h3>
                  {isToday && (
                    <span
                      className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: '#FFF0F3', color: '#C4506E' }}
                    >
                      {t('timetable.today', 'Today')}
                    </span>
                  )}
                </div>

                {day.blocks.length === 0 ? (
                  <div
                    className="bg-white px-4 py-3 text-sm font-medium"
                    style={{ borderRadius: '16px', border: '1.5px solid #F0E4E6', color: '#A8929A' }}
                  >
                    {t('timetable.noClasses', 'No classes')}
                  </div>
                ) : (
                  <div
                    className="bg-white overflow-hidden"
                    style={{
                      borderRadius: '18px',
                      border: isToday ? '1.5px solid #E9B9C7' : '1.5px solid #F0E4E6',
                    }}
                  >
                    {day.blocks.map((block, idx) => (
                      <BlockRow
                        key={block.id || `${day.date}-${idx}`}
                        block={block}
                        first={idx === 0}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {/* Footer note */}
          <p className="text-[12px] font-medium text-center pt-1" style={{ color: '#C0B2B6' }}>
            {t('timetable.footer', "From your school's timetable — managed in Wasil Hub")}
          </p>
        </div>
      )}
    </div>
  )
}

// ── One timetable block row ───────────────────────────────────────────────────
function BlockRow({ block, first }: { block: ChildTimetableBlock; first: boolean }) {
  const isLesson = block.subject !== null
  const accent = isLesson ? accentFor(block) : '#D8CDD0'
  const title = block.subject?.name ?? block.label
  const teacher = block.teacher ? `${block.teacher.firstName} ${block.teacher.lastName}`.trim() : null

  return (
    <div
      className="flex items-stretch gap-3 px-3 py-2.5"
      style={{
        borderTop: first ? undefined : '1px solid #F5EEF0',
        backgroundColor: isLesson ? undefined : '#FBF8F9',
      }}
    >
      {/* Accent bar */}
      <div className="flex-shrink-0 rounded-full" style={{ width: '4px', backgroundColor: accent }} />

      {/* Time */}
      <div className="flex-shrink-0 text-right" style={{ width: '52px' }}>
        <div className="text-[13px] font-bold" style={{ color: isLesson ? '#2D2225' : '#A8929A' }}>
          {block.start}
        </div>
        <div className="text-[11px] font-semibold" style={{ color: '#B7A7AC' }}>
          {block.end}
        </div>
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="flex items-center gap-2 min-w-0">
          {isLesson && (
            <span
              className="flex-shrink-0 rounded-full"
              style={{ width: '8px', height: '8px', backgroundColor: accent }}
            />
          )}
          <span
            className="text-[14px] font-bold truncate"
            style={{ color: isLesson ? '#2D2225' : '#8A797E' }}
          >
            {title}
          </span>
          {block.specialist && (
            <span
              className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
              style={{ backgroundColor: '#FFF7EC', color: '#8B5E0F' }}
            >
              Specialist
            </span>
          )}
        </div>
        {(teacher || block.room) && (
          <div className="flex flex-wrap items-center gap-3 mt-0.5">
            {teacher && (
              <span className="flex items-center gap-1 text-[12px] font-medium" style={{ color: '#7A6469' }}>
                <User className="h-3 w-3" />
                {teacher}
              </span>
            )}
            {block.room && (
              <span className="flex items-center gap-1 text-[12px] font-medium" style={{ color: '#7A6469' }}>
                <MapPin className="h-3 w-3" />
                {block.room}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── States ────────────────────────────────────────────────────────────────────
function WeekSkeleton() {
  return (
    <div className="space-y-5">
      {[0, 1, 2].map((i) => (
        <div key={i}>
          <div className="h-4 w-28 rounded-full mb-2" style={{ backgroundColor: '#F0E4E6' }} />
          <div
            className="bg-white overflow-hidden"
            style={{ borderRadius: '18px', border: '1.5px solid #F0E4E6' }}
          >
            {[0, 1, 2].map((j) => (
              <div
                key={j}
                className="flex items-center gap-3 px-3 py-3"
                style={{ borderTop: j === 0 ? undefined : '1px solid #F5EEF0' }}
              >
                <div className="rounded-full" style={{ width: '4px', height: '32px', backgroundColor: '#F0E4E6' }} />
                <div className="h-8 w-12 rounded-lg" style={{ backgroundColor: '#F5EEF0' }} />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-32 rounded-full" style={{ backgroundColor: '#F0E4E6' }} />
                  <div className="h-2.5 w-20 rounded-full" style={{ backgroundColor: '#F5EEF0' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function OutOfTermNotice({
  resumeDate,
  t,
}: {
  resumeDate: string | null
  t: (key: string, fallback: string) => string
}) {
  const resume = resumeDate ? fmtDay(resumeDate) : null
  return (
    <div
      className="p-8 text-center"
      style={{ borderRadius: '22px', border: '1.5px solid #EAD9B0', backgroundColor: '#FFF9EC' }}
    >
      <Sun className="h-12 w-12 mx-auto mb-4" style={{ color: '#D79A2B' }} />
      <p className="font-bold text-[15px]" style={{ color: '#7A5A12' }}>
        {t('timetable.outOfTermTitle', 'Outside term time — no lessons this week')}
      </p>
      {resume && (
        <p className="text-sm font-semibold mt-2" style={{ color: '#A07B2E' }}>
          {t('timetable.outOfTermResume', 'Lessons resume')} {resume.weekday} {resume.dayMonth}
        </p>
      )}
    </div>
  )
}

function EmptyState({ t }: { t: (key: string, fallback: string) => string }) {
  return (
    <div
      className="bg-white p-12 text-center"
      style={{ borderRadius: '22px', border: '1.5px solid #F0E4E6' }}
    >
      <CalendarDays className="h-12 w-12 mx-auto mb-4" style={{ color: '#D8CDD0' }} />
      <p className="font-semibold" style={{ color: '#7A6469' }}>
        {t('timetable.emptyTitle', "Your school hasn't published a timetable yet")}
      </p>
      <p className="text-sm font-medium mt-1" style={{ color: '#A8929A' }}>
        {t('timetable.emptyBody', 'Check back soon — your child’s weekly classes will appear here.')}
      </p>
    </div>
  )
}
