import React, { useMemo, useState } from 'react'
import { FileText, Download, Search, ExternalLink } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import { useTheme } from '../contexts/ThemeContext'
import * as api from '../services/api'

interface Policy {
  id: string
  name: string
  description: string | null
  fileUrl: string
  fileSize: number | null
  updatedAt: string
}

export function PoliciesPage() {
  const theme = useTheme()
  const [searchQuery, setSearchQuery] = useState('')

  const { data: policies, isLoading } = useApi<Policy[]>(
    () => api.policies.list(),
    []
  )

  // Filter and group by first letter
  const groupedPolicies = useMemo(() => {
    if (!policies) return {}

    const filtered = searchQuery
      ? policies.filter((p) =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : policies

    const groups: Record<string, Policy[]> = {}
    filtered.forEach((policy) => {
      const letter = policy.name[0].toUpperCase()
      if (!groups[letter]) {
        groups[letter] = []
      }
      groups[letter].push(policy)
    })

    return groups
  }, [policies, searchQuery])

  const letters = Object.keys(groupedPolicies).sort()

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-burgundy border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold" style={{ color: theme.colors.brandColor }}>
          School Policies
        </h1>
        <p className="text-gray-600 mt-1">
          View and download our school policies and procedures
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search policies..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-burgundy focus:border-transparent"
        />
      </div>

      {/* Policies List */}
      {letters.length > 0 ? (
        <div className="space-y-6">
          {letters.map((letter) => (
            <div key={letter}>
              {/* Letter Header */}
              <div
                className="sticky top-0 bg-cream py-2 z-10"
              >
                <span
                  className="inline-block w-8 h-8 rounded-full text-white font-bold text-center leading-8"
                  style={{ backgroundColor: theme.colors.brandColor }}
                >
                  {letter}
                </span>
              </div>

              {/* Policies */}
              <div className="space-y-2 mt-2">
                {groupedPolicies[letter].map((policy) => (
                  <a
                    key={policy.id}
                    href={policy.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow group"
                  >
                    {/* Icon */}
                    <div
                      className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${theme.colors.brandColor}15` }}
                    >
                      <FileText className="h-6 w-6" style={{ color: theme.colors.brandColor }} />
                    </div>

                    {/* Content */}
                    <div className="ml-4 flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 group-hover:text-burgundy transition-colors">
                        {policy.name}
                      </h3>
                      {policy.description && (
                        <p className="text-sm text-gray-500 truncate">{policy.description}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        Updated: {formatDate(policy.updatedAt)}
                        {policy.fileSize && ` • ${formatFileSize(policy.fileSize)}`}
                      </p>
                    </div>

                    {/* Download Icon */}
                    <ExternalLink className="h-5 w-5 text-gray-400 group-hover:text-burgundy flex-shrink-0 ml-4" />
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <FileText className="h-12 w-12 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">
            {searchQuery ? 'No policies match your search.' : 'No policies available.'}
          </p>
        </div>
      )}
    </div>
  )
}
