import React from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink as ExternalLinkIcon } from 'lucide-react'
import { useApi } from '@wasil/shared'
import { useTheme } from '@wasil/shared'
import * as api from '@wasil/shared'
import type { LinksResponse, ExternalLink } from '@wasil/shared'

export function LinksPage() {
  const { t } = useTranslation()
  const theme = useTheme()

  const { data, isLoading } = useApi<LinksResponse>(
    () => api.links.list(),
    []
  )

  const categories = data?.categories || []
  const uncategorized = data?.uncategorized || []
  const hasLinks = categories.some(c => c.links.length > 0) || uncategorized.length > 0

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: theme.colors.brandColor, borderTopColor: 'transparent' }} />
      </div>
    )
  }

  const renderLinkIcon = (link: ExternalLink) => {
    if (link.imageUrl) {
      return (
        <img
          src={link.imageUrl}
          alt=""
          className="w-12 h-12 rounded-xl object-contain bg-white"
          onError={(e) => {
            // Fallback to emoji or default
            const target = e.target as HTMLImageElement
            target.style.display = 'none'
            target.nextElementSibling?.classList.remove('hidden')
          }}
        />
      )
    }
    return (
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
        style={{ backgroundColor: `${theme.colors.brandColor}15` }}
      >
        {link.icon || '🔗'}
      </div>
    )
  }

  const LinkCard = ({ link }: { link: ExternalLink }) => (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow group flex items-center space-x-4"
    >
      <div className="flex-shrink-0">
        {link.imageUrl ? (
          <>
            <img
              src={link.imageUrl}
              alt=""
              className="w-12 h-12 rounded-xl object-contain bg-gray-50"
              onError={(e) => {
                const target = e.target as HTMLImageElement
                target.style.display = 'none'
                const sibling = target.nextElementSibling as HTMLElement
                if (sibling) sibling.style.display = 'flex'
              }}
            />
            <div
              className="w-12 h-12 rounded-xl items-center justify-center text-2xl hidden"
              style={{ backgroundColor: `${theme.colors.brandColor}15` }}
            >
              {link.icon || '🔗'}
            </div>
          </>
        ) : (
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
            style={{ backgroundColor: `${theme.colors.brandColor}15` }}
          >
            {link.icon || '🔗'}
          </div>
        )}
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
          <p className="text-sm text-gray-500 line-clamp-1">
            {link.description}
          </p>
        )}
      </div>
    </a>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold" style={{ color: theme.colors.brandColor }}>
          {t('links.title')}
        </h1>
        <p className="text-gray-600 mt-1">{t('links.subtitle')}</p>
      </div>

      {hasLinks ? (
        <>
          {/* Categorized Links */}
          {categories.map(category => category.links.length > 0 && (
            <div key={category.id}>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">{category.name}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {category.links.map(link => (
                  <LinkCard key={link.id} link={link} />
                ))}
              </div>
            </div>
          ))}

          {/* Uncategorized Links */}
          {uncategorized.length > 0 && (
            <div>
              {categories.some(c => c.links.length > 0) && (
                <h2 className="text-lg font-semibold text-gray-900 mb-3">{t('links.otherLinks') || 'Other Links'}</h2>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {uncategorized.map(link => (
                  <LinkCard key={link.id} link={link} />
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <ExternalLinkIcon className="h-12 w-12 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">{t('links.noLinks')}</p>
        </div>
      )}
    </div>
  )
}
