import { useEffect } from 'react'
import { ClipboardList, AlertCircle, Paperclip, AlertTriangle } from 'lucide-react'
import { PageLogo } from '../components/PageHeader'
import { useApi } from '@wasil/shared'
import * as api from '@wasil/shared'
import type { AdminNoticesResponse, AdminNotice } from '@wasil/shared'

/**
 * Admin Notices — messages from the school's departments.
 *
 * Kept out of the feed because a fee reminder and a medication note are not
 * news and should not compete with it. The email a parent gets says only that
 * something is waiting and which desk it came from, so this screen is the only
 * place the content exists — which is why a failed load must never render as
 * "you have no notices".
 */

function formatWhen(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  if (sameDay) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' })
}

function NoticeCard({ notice }: { notice: AdminNotice }) {
  return (
    <article
      style={{
        background: '#fff',
        borderRadius: 18,
        border: notice.isNew ? '1px solid #E4B9C5' : '1px solid #F0E4E6',
        padding: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span
          style={{
            fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
            background: '#F3ECF6', color: '#6A5570',
          }}
        >
          {notice.department || 'School office'}
        </span>
        {notice.isUrgent && (
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
              background: '#FDECEC', color: '#C0392B',
            }}
          >
            <AlertTriangle size={12} /> Urgent
          </span>
        )}
        {notice.isNew && (
          <span style={{ fontSize: 12, fontWeight: 700, color: '#C4506E' }}>New</span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#A8929A' }}>
          {formatWhen(notice.createdAt)}
        </span>
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#2D2225', margin: '10px 0 0' }}>
        {notice.title}
      </h2>
      <div
        style={{ fontSize: 14, color: '#5C4B50', marginTop: 6, lineHeight: 1.55 }}
        dangerouslySetInnerHTML={{ __html: notice.content }}
      />

      {notice.attachments.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
          {notice.attachments.map(a => (
            <a
              key={a.id}
              href={a.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                fontSize: 13, color: '#C4506E', textDecoration: 'none', fontWeight: 600,
              }}
            >
              <Paperclip size={13} /> {a.fileName}
            </a>
          ))}
        </div>
      )}
    </article>
  )
}

export function AdminNoticesPage() {
  const { data, isLoading, error } = useApi<AdminNoticesResponse>(() => api.adminNotices.list(), [])

  // Opening the section is what clears the homepage bar. Fire-and-forget, and
  // only once the notices actually loaded — marking them seen after a failed
  // read would hide the bar while the parent has still seen nothing.
  useEffect(() => {
    if (!data || error) return
    void api.adminNotices.markSeen().catch(() => {})
  }, [data, error])

  return (
    <div style={{ paddingBottom: 24 }}>
      <PageLogo />
      <div style={{ padding: '0 20px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#2D2225', margin: '4px 0 2px' }}>
          Admin notices
        </h1>
        <p style={{ fontSize: 14, color: '#7A6469', margin: '0 0 18px' }}>
          Messages from the school clinic, accounts and other departments.
        </p>

        {isLoading && <div style={{ color: '#A8929A', fontSize: 14 }}>Loading…</div>}

        {error && !isLoading && (
          <div
            style={{
              display: 'flex', gap: 10, alignItems: 'flex-start',
              background: '#FDECEC', borderRadius: 14, padding: '14px 16px',
            }}
          >
            <AlertCircle size={18} color="#C0392B" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontWeight: 700, color: '#C0392B', fontSize: 14 }}>
                Couldn't load your notices
              </div>
              <div style={{ fontSize: 13, color: '#8C4A45', marginTop: 2 }}>
                This is a problem at our end — it doesn't mean you have none. Pull to refresh, and
                contact the office if it keeps happening.
              </div>
            </div>
          </div>
        )}

        {data && data.notices.length === 0 && !isLoading && !error && (
          <div style={{ textAlign: 'center', padding: '48px 16px', color: '#A8929A' }}>
            <ClipboardList size={28} style={{ marginBottom: 10 }} />
            <p style={{ fontSize: 14, margin: 0 }}>No notices right now.</p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {data?.notices.map(n => <NoticeCard key={n.id} notice={n} />)}
        </div>
      </div>
    </div>
  )
}
