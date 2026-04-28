import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ArrowLeft, MessageSquare, Calendar, FileText, BookOpen, Newspaper, X } from 'lucide-react'
import * as api from '@wasil/shared'
import type { SearchResult } from '@wasil/shared'

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  post: { icon: MessageSquare, color: '#C4506E', label: 'Post' },
  event: { icon: Calendar, color: '#5BA97B', label: 'Event' },
  form: { icon: FileText, color: '#8B6EAE', label: 'Form' },
  weekly_update: { icon: Newspaper, color: '#E8A54B', label: 'Update' },
  article: { icon: BookOpen, color: '#5B8EC4', label: 'Article' },
}

function formatDate(dateStr?: string) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function SearchPage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<NodeJS.Timeout>()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([])
      setHasSearched(false)
      return
    }
    setIsSearching(true)
    try {
      const data = await api.search.query(q)
      setResults(data.results)
      setHasSearched(true)
    } catch {
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }, [])

  const handleChange = (value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(value), 300)
  }

  const handleResultClick = (result: SearchResult) => {
    if (result.route) {
      navigate(result.route)
    }
  }

  return (
    <div className="fixed inset-0 bg-cream z-50 flex flex-col safe-area-top">
      {/* Search header */}
      <div
        className="shrink-0 flex items-center gap-3 px-4"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
          paddingBottom: '12px',
          borderBottom: '1px solid #F0E4E6',
        }}
      >
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: '#F5EEF0' }}
        >
          <ArrowLeft className="w-5 h-5" style={{ color: '#7A6469' }} />
        </button>
        <div
          className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-2xl"
          style={{ backgroundColor: '#FFFFFF', border: '1.5px solid #F0E4E6' }}
        >
          <Search className="w-4 h-4 shrink-0" style={{ color: '#A8929A' }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => handleChange(e.target.value)}
            placeholder="Search posts, events, forms..."
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: '#2D2225' }}
          />
          {query && (
            <button onClick={() => { setQuery(''); setResults([]); setHasSearched(false); inputRef.current?.focus() }}>
              <X className="w-4 h-4" style={{ color: '#A8929A' }} />
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {isSearching && (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: '#F0E4E6', borderTopColor: '#C4506E' }} />
          </div>
        )}

        {!isSearching && hasSearched && results.length === 0 && (
          <div className="text-center py-12">
            <Search className="w-10 h-10 mx-auto mb-3" style={{ color: '#D8CDD0' }} />
            <p className="text-sm font-medium" style={{ color: '#A8929A' }}>
              No results found for "{query}"
            </p>
          </div>
        )}

        {!isSearching && results.length > 0 && (
          <div className="space-y-1.5">
            {results.map(result => {
              const config = TYPE_CONFIG[result.type] || TYPE_CONFIG.post
              const Icon = config.icon
              return (
                <button
                  key={`${result.type}-${result.id}`}
                  onClick={() => handleResultClick(result)}
                  className="w-full text-left flex items-center gap-3 p-3 rounded-[16px] transition-colors active:bg-gray-50"
                  style={{ backgroundColor: '#FFFFFF', border: '1px solid #F5EEF0' }}
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: config.color + '15' }}
                  >
                    <Icon className="w-[18px] h-[18px]" style={{ color: config.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: '#2D2225' }}>
                      {result.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: config.color + '15', color: config.color }}
                      >
                        {config.label}
                      </span>
                      {result.subtitle && (
                        <span className="text-xs truncate" style={{ color: '#A8929A' }}>
                          {result.subtitle}
                        </span>
                      )}
                      {result.date && (
                        <span className="text-xs shrink-0" style={{ color: '#C9BCC0' }}>
                          {formatDate(result.date)}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {!isSearching && !hasSearched && (
          <div className="text-center py-12">
            <Search className="w-10 h-10 mx-auto mb-3" style={{ color: '#D8CDD0' }} />
            <p className="text-sm font-medium" style={{ color: '#A8929A' }}>
              Search across all school content
            </p>
            <p className="text-xs mt-1" style={{ color: '#C9BCC0' }}>
              Posts, events, forms, updates, knowledge base
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
