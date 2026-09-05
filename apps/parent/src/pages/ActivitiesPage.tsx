import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock, MapPin, Users, Lock, ExternalLink, Sparkles } from 'lucide-react'
import { PageLogo } from '../components/PageHeader'
import { useApi, useAuth } from '@wasil/shared'
import * as api from '@wasil/shared'
import type { ParentProgramme, ParentProgrammeActivity } from '@wasil/shared'

/**
 * The school's activity programme, as a parent reads it.
 *
 * Display only. The choice, the ranking and the allocation moved out of
 * Connect; this screen says what runs, when, and where a parent signs up.
 *
 * Laid out by day like the timetable, because that is the question a parent is
 * actually asking — "what is on after school on Wednesday" — and because a club
 * that meets twice is one club on two days. The screen this replaced held a
 * single day per activity and rendered a twice-weekly club as once-weekly.
 */

interface ChildRef {
  id: string
  name: string
  className: string
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function genderLabel(g: ParentProgrammeActivity['eligibleGender']): string | null {
  if (g === 'BOYS_ONLY') return 'Boys'
  if (g === 'GIRLS_ONLY') return 'Girls'
  return null
}

export function ActivitiesPage() {
  const { t } = useTranslation()
  const { user } = useAuth()

  // Deduplicated children (studentLinks preferred, then legacy children) —
  // same resolution as the timetable, so the two screens agree about who a
  // parent's children are.
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
  const activeChildId = children.some((c) => c.id === selectedChildId)
    ? selectedChildId
    : children[0]?.id ?? ''

  const { data, isLoading } = useApi<ParentProgramme | null>(
    () => api.eca.parentProgramme(activeChildId || undefined),
    [activeChildId],
  )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <PageLogo />
        <h1 className="text-[26px] font-extrabold" style={{ color: '#2D2225' }}>
          {t('activities.title', 'Activities')}
        </h1>
        <p className="text-sm font-medium mt-1" style={{ color: '#7A6469' }}>
          {data?.term
            ? `${data.term.name} · ${data.term.academicYear}`
            : t('activities.subtitle', 'After-school clubs and activities')}
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

      {/* Body */}
      {isLoading ? (
        <ProgrammeSkeleton />
      ) : !data || !data.term ? (
        // No term running is a different answer from a term with nothing in it,
        // and saying so beats an empty list that reads as "no clubs".
        <NoTermNotice t={t} />
      ) : data.days.length === 0 ? (
        <EmptyState t={t} />
      ) : (
        <div className="space-y-5">
          {data.days.map((day) => (
            <div key={day.dayOfWeek}>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-extrabold" style={{ color: '#2D2225' }}>
                  {t(`days.${day.dayOfWeek}`, DAY_NAMES[day.dayOfWeek] ?? '')}
                </h3>
              </div>

              <div
                className="bg-white overflow-hidden"
                style={{ borderRadius: '18px', border: '1.5px solid #F0E4E6' }}
              >
                {day.activities.map((activity, idx) => (
                  <ActivityRow
                    key={`${activity.id}-${day.dayOfWeek}`}
                    activity={activity}
                    first={idx === 0}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Sign-up, once, at the foot — not a button on every card. A parent
              reads the programme first and joins second, and repeating the link
              on every row would imply each one is a separate sign-up. */}
          {data.signUpUrl && (
            <a
              href={data.signUpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3.5 text-sm font-bold"
              style={{ backgroundColor: '#C4506E', color: '#FFFFFF', borderRadius: '16px' }}
            >
              {t('activities.signUp', 'Sign up for activities')}
              <ExternalLink className="w-4 h-4" />
            </a>
          )}

          <p className="text-[12px] font-medium text-center" style={{ color: '#C0B2B6' }}>
            {t(
              'activities.footer',
              'Places and times are set by the school — this list shows what is running this term.',
            )}
          </p>
        </div>
      )}
    </div>
  )
}

// ── One activity row ─────────────────────────────────────────────────────────
function ActivityRow({ activity, first }: { activity: ParentProgrammeActivity; first: boolean }) {
  const gender = genderLabel(activity.eligibleGender)
  const time = activity.startTime && activity.endTime
    ? `${activity.startTime}–${activity.endTime}`
    : activity.startTime || null

  return (
    <div
      className="px-3.5 py-3"
      style={{
        borderTop: first ? undefined : '1px solid #F5EEF0',
        // A cancelled club is greyed but still legible: a parent who saw it
        // last week needs to find it and read why, not discover it missing.
        backgroundColor: activity.isCancelled ? '#FBF8F9' : undefined,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h4
              className="text-[15px] font-bold"
              style={{
                color: activity.isCancelled ? '#A8929A' : '#2D2225',
                textDecoration: activity.isCancelled ? 'line-through' : undefined,
              }}
            >
              {activity.name}
            </h4>
            {activity.inviteOnly && (
              // The flag that says a child cannot put themselves in this. A
              // squad listed alongside choosable clubs, with nothing marking
              // it, only produces a parent asking why they can't sign up.
              <span
                className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                style={{ backgroundColor: '#F5EEF0', color: '#7A6469' }}
              >
                <Lock className="w-2.5 h-2.5" />
                Invitation
              </span>
            )}
          </div>

          <div
            className="flex items-center gap-3 flex-wrap mt-1 text-[12px] font-semibold"
            style={{ color: '#7A6469' }}
          >
            {time && (
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {time}
              </span>
            )}
            {activity.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {activity.location}
              </span>
            )}
            {activity.yearGroupNames.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <Users className="w-3 h-3" />
                {activity.yearGroupNames.join(', ')}
              </span>
            )}
            {gender && <span>{gender}</span>}
          </div>

          {activity.description && !activity.isCancelled && (
            <p className="text-[12px] font-medium mt-1.5" style={{ color: '#8A797E' }}>
              {activity.description}
            </p>
          )}

          {activity.isCancelled && (
            <p className="text-[12px] font-semibold mt-1.5" style={{ color: '#C4506E' }}>
              {activity.cancelReason?.trim() || 'This activity is no longer running.'}
            </p>
          )}
        </div>

        {activity.categoryName && !activity.isCancelled && (
          <span
            className="shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
            style={{ backgroundColor: '#FFF0F3', color: '#C4506E' }}
          >
            {activity.categoryName}
          </span>
        )}
      </div>
    </div>
  )
}

// ── States ───────────────────────────────────────────────────────────────────
function ProgrammeSkeleton() {
  return (
    <div className="space-y-5">
      {[0, 1, 2].map((i) => (
        <div key={i}>
          <div className="h-4 w-24 rounded mb-2" style={{ backgroundColor: '#F0E4E6' }} />
          <div
            className="bg-white"
            style={{ borderRadius: '18px', border: '1.5px solid #F0E4E6', height: '96px' }}
          />
        </div>
      ))}
    </div>
  )
}

function NoTermNotice({ t }: { t: (key: string, fallback: string) => string }) {
  return (
    <div
      className="bg-white px-5 py-8 text-center"
      style={{ borderRadius: '18px', border: '1.5px solid #F0E4E6' }}
    >
      <Sparkles className="w-8 h-8 mx-auto mb-3" style={{ color: '#E9B9C7' }} />
      <p className="text-sm font-bold" style={{ color: '#2D2225' }}>
        {t('activities.noTerm', 'No activity term is running')}
      </p>
      <p className="text-[13px] font-medium mt-1" style={{ color: '#8A797E' }}>
        {t('activities.noTermHint', "The school will publish next term's clubs here.")}
      </p>
    </div>
  )
}

function EmptyState({ t }: { t: (key: string, fallback: string) => string }) {
  return (
    <div
      className="bg-white px-5 py-8 text-center"
      style={{ borderRadius: '18px', border: '1.5px solid #F0E4E6' }}
    >
      <Sparkles className="w-8 h-8 mx-auto mb-3" style={{ color: '#E9B9C7' }} />
      <p className="text-sm font-bold" style={{ color: '#2D2225' }}>
        {t('activities.empty', 'Nothing published yet')}
      </p>
      <p className="text-[13px] font-medium mt-1" style={{ color: '#8A797E' }}>
        {t('activities.emptyHint', "This term's activities haven't been published yet.")}
      </p>
    </div>
  )
}
