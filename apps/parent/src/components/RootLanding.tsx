import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ChevronRight, Search } from 'lucide-react'
import { useApi, LoadingScreen, publicTenant, type TenantSummary } from '@wasil/shared'

// The naked root (app.wasilconnect.com) is Wasil-branded, not school-branded —
// its only job is to route a parent to their school. One school → forward
// straight to its subdomain; 2+ → show the picker. Search is built but hidden
// until the list is long enough to need it.
const WASIL_ACCENT = '#6B4A57'
const SEARCH_THRESHOLD = 5

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

// Auto-forward only on the real wasilconnect.com root — never localhost/preview
// (that would yank you to prod) — and `?picker` forces the chooser so it can be
// previewed even with a single school.
function shouldAutoRedirect(count: number): boolean {
  if (typeof window === 'undefined') return false
  if (new URLSearchParams(window.location.search).has('picker')) return false
  return count === 1 && window.location.hostname.endsWith('wasilconnect.com')
}

export function RootLanding() {
  const { data, isLoading } = useApi<TenantSummary[]>(() => publicTenant.list(), [])
  const schools = data ?? []
  const willRedirect = !isLoading && !!data && shouldAutoRedirect(schools.length)

  useEffect(() => {
    if (willRedirect) {
      window.location.replace(`https://${schools[0].slug}.wasilconnect.com`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [willRedirect])

  if (isLoading || willRedirect) return <LoadingScreen />
  return <SchoolPicker schools={schools} />
}

function SchoolPicker({ schools }: { schools: TenantSummary[] }) {
  const [query, setQuery] = useState('')
  const showSearch = schools.length >= SEARCH_THRESHOLD

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return schools
    return schools.filter(
      (s) => s.name.toLowerCase().includes(q) || s.city.toLowerCase().includes(q) || s.slug.includes(q),
    )
  }, [schools, query])

  return (
    <div
      className="min-h-screen flex flex-col items-center px-5 py-14"
      style={{
        background:
          'radial-gradient(120% 80% at 50% -10%, rgba(107,74,87,0.08) 0%, transparent 60%), #F5F0E8',
      }}
    >
      <div className="w-full max-w-[500px] flex flex-col">
        {/* Connect by Wasil wordmark */}
        <div className="flex justify-center mb-8">
          <img src="/connect-by-wasil.png" alt="Connect by Wasil" className="h-[30px] w-auto" />
        </div>

        <h1 className="text-[27px] font-extrabold tracking-tight text-center" style={{ color: '#2A2320' }}>
          Choose your school
        </h1>
        <p className="text-center text-[15px] mt-2.5 mb-6" style={{ color: '#574D45' }}>
          Select your school to continue to sign-in.
        </p>

        {showSearch && (
          <div className="relative mb-4">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: '#AB9F92' }} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search schools…"
              aria-label="Search schools"
              className="w-full h-[50px] rounded-[14px] border pl-11 pr-4 text-[15px] outline-none focus:ring-2 focus:border-transparent"
              style={{ borderColor: '#DBCFBD', borderWidth: '1.5px', ['--tw-ring-color']: WASIL_ACCENT } as CSSProperties}
            />
          </div>
        )}

        {schools.length === 0 ? (
          <div
            className="bg-white rounded-[18px] p-8 text-center"
            style={{ border: '1px solid #E7DDCE' }}
          >
            <p className="font-semibold" style={{ color: '#574D45' }}>No schools are set up yet.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((s) => {
              const accent = s.brandColor || WASIL_ACCENT
              return (
                <a
                  key={s.slug}
                  href={`https://${s.slug}.wasilconnect.com`}
                  className="relative flex items-center gap-4 bg-white rounded-[18px] pl-5 pr-4 py-4 overflow-hidden transition-transform hover:-translate-y-0.5"
                  style={{ border: '1px solid #E7DDCE', boxShadow: '0 20px 46px -26px rgba(60,40,30,.3), 0 2px 6px rgba(0,0,0,.03)' }}
                >
                  <span className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: accent }} />
                  {s.logoUrl ? (
                    <img src={s.logoUrl} alt={s.name} className="w-[52px] h-[52px] rounded-[14px] object-contain flex-none" />
                  ) : (
                    <span
                      className="w-[52px] h-[52px] rounded-[14px] flex items-center justify-center text-white font-extrabold text-[18px] flex-none"
                      style={{ backgroundColor: accent, boxShadow: 'inset 0 0 0 2.5px rgba(255,255,255,.5)' }}
                    >
                      {initialsOf(s.name)}
                    </span>
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="block text-[16px] font-extrabold tracking-tight" style={{ color: '#2A2320' }}>
                      {s.name}
                    </span>
                    <span className="block text-[12.5px] mt-0.5" style={{ color: '#8E8175' }}>
                      {s.city} · {s.slug}.wasilconnect.com
                    </span>
                  </span>
                  <ChevronRight className="h-5 w-5 flex-none" style={{ color: '#AB9F92' }} />
                </a>
              )
            })}
          </div>
        )}

        <p className="text-center text-[13px] mt-6 leading-relaxed" style={{ color: '#8E8175' }}>
          Can't find your school? Ask your school office.
        </p>

        <div className="mt-5 pt-4 flex justify-center" style={{ borderTop: '1px solid #E7DDCE' }}>
          <span className="text-[12px]" style={{ color: '#AB9F92' }}>One place for your child's school</span>
        </div>
      </div>
    </div>
  )
}
