import React from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink as ExternalLinkIcon } from 'lucide-react'
import { useApi } from '@wasil/shared'
import { useTheme } from '@wasil/shared'
import * as api from '@wasil/shared'
import type { ExternalLink } from '@wasil/shared'

export function LinksPage() {
  const { t } = useTranslation()
  const theme = useTheme()

  const { data: links, isLoading } = useApi<ExternalLink[]>(
    () => api.links.list(),
    []
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: theme.colors.brandColor, borderTopColor: 'transparent' }} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold" style={{ color: theme.colors.brandColor }}>
          {t('links.title')}
        </h1>
        <p className="text-gray-600 mt-1">{t('links.subtitle')}</p>
      </div>

      {/* Links Grid */}
      {links && links.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {links.map((link) => (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow group"
            >
              <div className="flex items-start space-x-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                  style={{ backgroundColor: `${theme.colors.brandColor}15` }}
                >
                  {link.icon || '🔗'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <h3 className="font-semibold text-gray-900 group-hover:text-opacity-80 truncate">
                      {link.title}
                    </h3>
                    <ExternalLinkIcon
                      className="w-4 h-4 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: theme.colors.brandColor }}
                    />
                  </div>
                  {link.description && (
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                      {link.description}
                    </p>
                  )}
                </div>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <ExternalLinkIcon className="h-12 w-12 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">{t('links.noLinks')}</p>
        </div>
      )}
    </div>
  )
}
