import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { Search, X, MessageSquare, Calendar, FileText, BookOpen, Newspaper, GraduationCap, UserCog, UserPlus } from 'lucide-react'
import { useAuth, useTheme } from '@wasil/shared'
import * as api from '@wasil/shared'
import type { SearchResult } from '@wasil/shared'
import { Sidebar } from './Sidebar'

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  post: { icon: MessageSquare, color: '#C4506E', label: 'Post' },
  event: { icon: Calendar, color: '#5BA97B', label: 'Event' },
  form: { icon: FileText, color: '#8B6EAE', label: 'Form' },
  weekly_update: { icon: Newspaper, color: '#E8A54B', label: 'Update' },
  article: { icon: BookOpen, color: '#5B8EC4', label: 'Article' },
  student: { icon: GraduationCap, color: '#2D8B4E', label: 'Student' },
  staff: { icon: UserCog, color: '#C47A5B', label: 'Staff' },
  parent: { icon: UserPlus, color: '#7A6469', label: 'Parent' },
}

export function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const { user } = useAuth()
  const theme = useTheme()
  const navigate = useNavigate()

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<NodeJS.Timeout>()

  const initials = user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?'

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setSearchResults([])
      setShowResults(false)
      return
    }
    setIsSearching(true)
    try {
      const data = await api.search.query(q)
      setSearchResults(data.results)
      setShowResults(true)
    } catch {
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }, [])

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(value), 300)
  }

  const handleResultClick = (result: SearchResult) => {
    if (result.route) navigate(result.route)
    setShowResults(false)
    setSearchQuery('')
    setSearchResults([])
  }

  // Close dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FAFAF8' }}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />

      {/* Main area */}
      <div
        className="transition-all duration-300 ease-in-out"
        style={{ marginLeft: collapsed ? 68 : 260 }}
      >
        {/* Top bar */}
        <header className="h-16 bg-white border-b border-warm-border sticky top-0 z-20 flex items-center justify-between px-6">
          <div className="flex items-center space-x-3">
            <h1 className="text-[15px] font-extrabold text-warm-text-primary">
              {theme.schoolName}
            </h1>
            <span className="text-warm-text-tertiary">|</span>
            <span className="text-[13px] text-warm-text-secondary">
              {theme.city}
            </span>
          </div>

          <div className="flex items-center space-x-4">
            {/* Search */}
            <div ref={searchRef} className="relative">
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                style={{ backgroundColor: '#F5F5F3', border: '1px solid transparent', width: '280px' }}
              >
                <Search className="w-4 h-4 shrink-0" style={{ color: '#A8929A' }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => handleSearchChange(e.target.value)}
                  onFocus={() => searchResults.length > 0 && setShowResults(true)}
                  placeholder="Search..."
                  className="flex-1 bg-transparent text-sm outline-none"
                  style={{ color: '#2D2225' }}
                />
                {searchQuery && (
                  <button onClick={() => { setSearchQuery(''); setSearchResults([]); setShowResults(false) }}>
                    <X className="w-3.5 h-3.5" style={{ color: '#A8929A' }} />
                  </button>
                )}
              </div>

              {/* Results dropdown */}
              {showResults && (
                <div
                  className="absolute top-full right-0 mt-1 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden"
                  style={{ width: '380px', maxHeight: '420px', overflowY: 'auto' }}
                >
                  {isSearching && (
                    <div className="flex justify-center py-6">
                      <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: '#F0E4E6', borderTopColor: '#C4506E' }} />
                    </div>
                  )}

                  {!isSearching && searchResults.length === 0 && (
                    <div className="py-6 text-center">
                      <p className="text-sm text-slate-400">No results for "{searchQuery}"</p>
                    </div>
                  )}

                  {!isSearching && searchResults.length > 0 && (
                    <div className="py-1">
                      {searchResults.map(result => {
                        const config = TYPE_CONFIG[result.type] || TYPE_CONFIG.post
                        const Icon = config.icon
                        return (
                          <button
                            key={`${result.type}-${result.id}`}
                            onClick={() => handleResultClick(result)}
                            className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors"
                          >
                            <div
                              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                              style={{ backgroundColor: config.color + '15' }}
                            >
                              <Icon className="w-4 h-4" style={{ color: config.color }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-900 truncate">{result.title}</p>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-bold uppercase" style={{ color: config.color }}>{config.label}</span>
                                {result.subtitle && (
                                  <span className="text-xs text-slate-400 truncate">{result.subtitle}</span>
                                )}
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* User info */}
            <div className="flex items-center space-x-3">
              <div className="text-right hidden sm:block">
                <p className="text-[13px] font-semibold text-warm-text-primary leading-tight">
                  {user?.name}
                </p>
                <p className="text-[11px] text-warm-text-tertiary leading-tight">
                  {user?.role === 'SUPER_ADMIN' ? 'Super Admin' : user?.role === 'ADMIN' ? 'Admin' : 'Staff'}
                </p>
              </div>
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold"
                style={{ backgroundColor: theme.colors.brandColor }}
              >
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                  initials
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
