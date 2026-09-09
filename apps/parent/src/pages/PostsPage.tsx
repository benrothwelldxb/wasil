import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Newspaper } from 'lucide-react'
import { PageLogo } from '../components/PageHeader'
import { MessageCard } from '../components/messages'
import { useAuth } from '@wasil/shared'
import * as api from '@wasil/shared'
import type { Message } from '@wasil/shared'

/**
 * Everything the school has posted, oldest included.
 *
 * The dashboard shows what's current — a home screen carrying a year of posts
 * asked parents to scroll past a book fair from September to reach today. This
 * is where the rest lives, so nothing is lost to a parent looking for the
 * letter about the trip in March.
 *
 * Grouped by month, because that's how someone searches their memory for a
 * thing the school sent: roughly when, not roughly where in a list.
 */
function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

export function PostsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()

  const [posts, setPosts] = useState<Message[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = useCallback(async (after: string | null) => {
    setError(false)
    try {
      const page = await api.messages.archive(after)
      // Appended, never replaced: a page arriving while the parent is reading
      // must not move what is under their thumb.
      setPosts(prev => (after ? [...prev, ...page.messages] : page.messages))
      setCursor(page.nextCursor)
      setHasMore(page.nextCursor !== null)
    } catch {
      // A failed page is not an empty archive, and must not render as one.
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(null) }, [load])

  const handleAcknowledge = async (id: string) => {
    await api.messages.acknowledge(id)
    setPosts(prev => prev.map(p => (p.id === id ? { ...p, acknowledged: true } : p)))
  }

  // Month headings, computed as we go so a post never lands under the wrong one.
  let lastMonth = ''

  return (
    <div className="space-y-5">
      <div>
        <PageLogo />
        <h1 className="text-[26px] font-extrabold" style={{ color: '#2D2225' }}>
          {t('posts.title', 'Posts')}
        </h1>
        <p className="text-sm font-medium mt-1" style={{ color: '#7A6469' }}>
          {t('posts.subtitle', 'Everything the school has shared')}
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="bg-white" style={{ borderRadius: '18px', border: '1.5px solid #F0E4E6', height: '120px' }} />
          ))}
        </div>
      ) : error && posts.length === 0 ? (
        // Said out loud, because an empty list would read as "the school has
        // never posted anything" — which is a different and much stranger fact.
        <div className="bg-white px-5 py-8 text-center" style={{ borderRadius: '18px', border: '1.5px solid #F0E4E6' }}>
          <p className="text-sm font-bold" style={{ color: '#2D2225' }}>
            {t('posts.error', 'Posts could not be loaded')}
          </p>
          <button
            onClick={() => { setLoading(true); load(null) }}
            className="mt-3 px-4 py-2 rounded-xl text-sm font-bold"
            style={{ backgroundColor: '#C4506E', color: '#FFFFFF' }}
          >
            {t('common.tryAgain', 'Try again')}
          </button>
        </div>
      ) : posts.length === 0 ? (
        <div className="bg-white px-5 py-8 text-center" style={{ borderRadius: '18px', border: '1.5px solid #F0E4E6' }}>
          <Newspaper className="w-8 h-8 mx-auto mb-3" style={{ color: '#E9B9C7' }} />
          <p className="text-sm font-bold" style={{ color: '#2D2225' }}>
            {t('posts.empty', 'Nothing posted yet')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map(post => {
            const month = monthLabel(post.createdAt)
            const heading = month !== lastMonth ? month : null
            lastMonth = month
            return (
              <div key={post.id} className="space-y-3">
                {heading && (
                  <h2 className="text-sm font-extrabold pt-2" style={{ color: '#2D2225' }}>
                    {heading}
                  </h2>
                )}
                <MessageCard
                  message={post}
                  onAcknowledge={handleAcknowledge}
                  showAcknowledgeButton={false}
                />
              </div>
            )
          })}

          {hasMore && (
            <button
              onClick={() => load(cursor)}
              className="w-full py-3 text-sm font-bold"
              style={{ backgroundColor: '#FFFFFF', color: '#C4506E', borderRadius: '16px', border: '1.5px solid #F0E4E6' }}
            >
              {t('posts.loadMore', 'Load older posts')}
            </button>
          )}

          {/* A failure part-way through, where the list is not empty: the page
              above is still good, and only the next page is missing. */}
          {error && posts.length > 0 && (
            <p className="text-center text-[12px] font-semibold" style={{ color: '#C4506E' }}>
              {t('posts.loadMoreError', 'Could not load older posts. Tap again to retry.')}
            </p>
          )}

          {!hasMore && (
            <p className="text-center text-[12px] font-medium py-2" style={{ color: '#C0B2B6' }}>
              {t('posts.end', "That's everything.")}
            </p>
          )}
        </div>
      )}

      {!user && null}
    </div>
  )
}
