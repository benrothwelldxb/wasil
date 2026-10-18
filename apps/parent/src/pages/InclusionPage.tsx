import React, { useMemo, useState } from 'react'
import { HeartHandshake, AlertCircle, FileText, Paperclip } from 'lucide-react'
import { useApi, api, useAuth } from '@wasil/shared'
import type { InclusionChildResponse, InclusionPlan, InclusionTarget, InclusionFileCard } from '@wasil/shared'

/**
 * A child's SEND plan, read from Wasil Inclusion.
 *
 * Connect stores none of this and decides none of it. In particular it does
 * NOT decide what a family may see: a plan reaches this page only because a
 * SENCO shared it, and the rule lives in Inclusion alone. Connect once held a
 * second copy of that rule and published a child's plan by omission; there is
 * deliberately no filtering here to go wrong again.
 *
 * FOUR STATES, and only one of them means "no plan". The other three are a
 * missing Hub link, a family Inclusion has never mirrored, and a missing
 * credential. A page that renders those as "no plan" tells a parent something
 * about their child's support that nobody checked — which is the failure the
 * This Week screen already guards against, and it matters more here.
 */

interface ChildRef { id: string; name: string }

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl p-3" style={{ backgroundColor: '#FBF7F7' }}>
      <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: '#C4506E' }} />
      <p className="text-sm" style={{ color: '#7A6469' }}>{children}</p>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[22px] p-4" style={{ backgroundColor: '#FFFFFF', border: '1.5px solid #F0E4E6' }}>
      <h3 className="text-sm font-extrabold mb-2.5" style={{ color: '#4A3B3F' }}>{title}</h3>
      {children}
    </div>
  )
}

/** A label Inclusion already phrased, with the tone it chose. Never
 *  re-worded: a judgement about a child's progress is the school's sentence,
 *  and Connect turning "working towards" into something breezier would be
 *  Connect editing a professional record. */
function Pill({ label, tone }: { label: string; tone: string }) {
  const palette: Record<string, { bg: string; fg: string }> = {
    positive: { bg: '#E8F3EC', fg: '#2D5136' },
    good: { bg: '#E8F3EC', fg: '#2D5136' },
    neutral: { bg: '#F4F1EC', fg: '#6B6155' },
    caution: { bg: '#FBF3E4', fg: '#7A5B22' },
    negative: { bg: '#FBF0F2', fg: '#8E3A52' },
  }
  const c = palette[tone] ?? palette.neutral
  return (
    <span
      className="inline-block px-2.5 py-1 rounded-full text-xs font-bold"
      style={{ backgroundColor: c.bg, color: c.fg }}
    >
      {label}
    </span>
  )
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value || !value.trim()) return null
  return (
    <div className="mb-3 last:mb-0">
      <p className="text-xs font-bold mb-1" style={{ color: '#A8929A' }}>{label}</p>
      <p className="text-sm whitespace-pre-wrap" style={{ color: '#4A3B3F' }}>{value}</p>
    </div>
  )
}

function dateLabel(iso?: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function Target({ target }: { target: InclusionTarget }) {
  return (
    <div className="py-3 border-t first:border-t-0 first:pt-0" style={{ borderColor: '#F0E4E6' }}>
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <p className="text-sm font-bold" style={{ color: '#4A3B3F' }}>
          {target.target_number}. {target.needs_category_label}
        </p>
        {target.progress && <Pill label={target.progress.label} tone={target.progress.tone} />}
      </div>
      <p className="text-sm mb-1.5" style={{ color: '#4A3B3F' }}>{target.target_statement}</p>
      {target.progress_notes && (
        <p className="text-sm" style={{ color: '#7A6469' }}>{target.progress_notes}</p>
      )}
      {target.outcome_at_review && (
        <div className="mt-2">
          <span className="text-xs font-bold mr-2" style={{ color: '#A8929A' }}>At review</span>
          <Pill label={target.outcome_at_review.label} tone={target.outcome_at_review.tone} />
        </div>
      )}
    </div>
  )
}

function PlanCard({ plan }: { plan: InclusionPlan }) {
  const start = dateLabel(plan.start_date)
  const review = dateLabel(plan.review_date)
  return (
    <Card title="Support plan">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Pill label={plan.stage_label} tone="neutral" />
        <Pill label={plan.status_label} tone="neutral" />
      </div>
      {(start || review) && (
        <p className="text-xs mb-3" style={{ color: '#A8929A' }}>
          {start && <>Started {start}</>}
          {start && review && ' · '}
          {review && <>Next review {review}</>}
        </p>
      )}
      <Field label="Strengths" value={plan.current_strengths} />
      <Field label="Barriers to learning" value={plan.barriers_to_learning} />

      {/* UNDEFINED IS NOT EMPTY. Targets are omitted, not emptied, when the
          credential lacks the grant for them — so "no targets on this plan"
          and "we were not told the targets" are different, and only the first
          may be shown as a plan with nothing in it. Saying neither is the
          safe answer for the second. */}
      {plan.targets !== undefined && plan.targets.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-bold mb-1" style={{ color: '#A8929A' }}>Targets</p>
          {plan.targets.map(t => <Target key={t.id} target={t} />)}
        </div>
      )}
    </Card>
  )
}

function FileRow({ file }: { file: InclusionFileCard }) {
  const when = dateLabel(file.createdAt)

  // PAST RETENTION. The session and the therapist's note still matter, so the
  // file is listed and plainly marked rather than quietly dropped — a parent
  // who remembers a report and cannot find it will ring the office. And never
  // a link that fails when tapped.
  if (file.unavailable || !file.url) {
    return (
      <div className="flex items-center gap-2 py-2">
        <Paperclip className="h-4 w-4 flex-shrink-0" style={{ color: '#A8929A' }} />
        <span className="text-sm" style={{ color: '#7A6469' }}>{file.title}</span>
        <span className="text-xs" style={{ color: '#A8929A' }}>no longer available</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 py-2">
      <Paperclip className="h-4 w-4 flex-shrink-0" style={{ color: '#C4506E' }} />
      <a href={file.url} target="_blank" rel="noreferrer" className="text-sm" style={{ color: '#C4506E' }}>
        {file.title}
      </a>
      {file.typeLabel && <span className="text-xs" style={{ color: '#A8929A' }}>{file.typeLabel}</span>}
      {when && <span className="text-xs" style={{ color: '#A8929A' }}>{when}</span>}
      {file.downloadUrl && (
        <a
          href={file.downloadUrl}
          className="text-xs font-bold ml-auto"
          style={{ color: '#C4506E' }}
        >
          Save
        </a>
      )}
    </div>
  )
}

export function InclusionPage() {
  const { user } = useAuth()

  const children = useMemo<ChildRef[]>(() => {
    const out: ChildRef[] = []
    const seen = new Set<string>()
    user?.studentLinks?.forEach((l) => {
      if (seen.has(l.studentId)) return
      seen.add(l.studentId)
      out.push({ id: l.studentId, name: l.studentName.trim() })
    })
    user?.children?.forEach((c) => {
      if (seen.has(c.id)) return
      seen.add(c.id)
      out.push({ id: c.id, name: c.name.trim() })
    })
    return out
  }, [user])

  const [selectedChildId, setSelectedChildId] = useState<string>(() => children[0]?.id ?? '')
  const activeChildId = children.some(c => c.id === selectedChildId) ? selectedChildId : children[0]?.id ?? ''

  const { data, isLoading, error } = useApi<InclusionChildResponse | null>(
    () => (activeChildId ? api.inclusion.child(activeChildId) : Promise.resolve(null)),
    [activeChildId],
  )

  const childName = data?.childName ?? children.find(c => c.id === activeChildId)?.name ?? 'your child'
  const firstName = childName.split(' ')[0]

  const docs = data?.documents ?? []
  const sessions = data?.therapySessions ?? []
  const hasAnything = !!data?.plan || docs.length > 0 || sessions.length > 0

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <HeartHandshake className="h-5 w-5" style={{ color: '#C4506E' }} />
        <h2 className="text-lg font-bold" style={{ color: '#4A3B3F' }}>Inclusion</h2>
      </div>

      {children.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          {children.map(child => (
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

      {isLoading && <p className="text-sm" style={{ color: '#A8929A' }}>Loading…</p>}

      {/* The request failed outright. Without this the page renders a heading
          and nothing else — a blank screen, which on THIS page reads as "your
          child has no support in place". */}
      {!isLoading && !data && (
        <Notice>
          {error?.message?.includes('404')
            ? "This isn't switched on for your school."
            : "We can't load this right now. Please try again shortly."}
        </Notice>
      )}

      {!isLoading && data?.state === 'no_hub_link' && (
        <Notice>We can't show {firstName}'s inclusion record yet. The school office can help.</Notice>
      )}
      {!isLoading && data?.state === 'not_known' && (
        <Notice>There's nothing to show for {firstName} here. If you expected something, the school office can help.</Notice>
      )}
      {!isLoading && data?.state === 'unavailable' && (
        <Notice>Inclusion isn't available right now. Please try again later.</Notice>
      )}

      {!isLoading && data?.state === 'ok' && (
        <div className="space-y-4">
          {/* INCLUSION'S OWN SENTENCE, rendered exactly as sent. It appears
              when a shared plan has been withdrawn for a reason worth saying —
              never for an explicit stop-sharing, because the case that matters
              is a plan withdrawn BECAUSE IT WENT TO THE WRONG FAMILY, where
              any mark at all would tell this family something true about
              another child. Inclusion decides; Connect types it out. */}
          {data.notice && <Notice>{data.notice}</Notice>}

          {data.plan && <PlanCard plan={data.plan} />}

          {docs.length > 0 && (
            <Card title="Documents">
              {docs.map(f => <FileRow key={f.id} file={f} />)}
            </Card>
          )}

          {sessions.length > 0 && (
            <Card title="Therapy sessions">
              {sessions.map(s => (
                <div key={s.id} className="py-3 border-t first:border-t-0 first:pt-0" style={{ borderColor: '#F0E4E6' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="h-4 w-4" style={{ color: '#C4506E' }} />
                    <p className="text-sm font-bold" style={{ color: '#4A3B3F' }}>
                      {s.provider_name || 'Session'}
                    </p>
                    {dateLabel(s.session_date) && (
                      <span className="text-xs" style={{ color: '#A8929A' }}>{dateLabel(s.session_date)}</span>
                    )}
                  </div>
                  {/* The therapist's own words, shown as written. */}
                  {s.provider_note && (
                    <p className="text-sm mb-1 whitespace-pre-wrap" style={{ color: '#7A6469' }}>{s.provider_note}</p>
                  )}
                  {(s.files ?? []).map(f => <FileRow key={f.id} file={f} />)}
                </div>
              ))}
            </Card>
          )}

          {/* ONLY REACHED when Inclusion answered and genuinely holds nothing
              shared. Every other empty case is caught above and says why. */}
          {!hasAnything && !data.notice && (
            <Notice>
              Nothing is currently shared for {firstName}. The school shares a plan and any
              reports here when they're ready.
            </Notice>
          )}
        </div>
      )}
    </div>
  )
}
