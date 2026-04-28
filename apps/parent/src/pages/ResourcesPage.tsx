import React, { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Search,
  BookOpen,
  FileText,
  Folder,
  ExternalLink as ExternalLinkIcon,
  ChevronRight,
  ChevronDown,
  Download,
  X,
  File,
  Image,
  FileSpreadsheet,
  Film,
  Music,
  Archive,
} from 'lucide-react'
import { useApi } from '@wasil/shared'
import * as api from '@wasil/shared'
import type { KnowledgeCategory, KnowledgeArticle, LinksResponse, ExternalLink } from '@wasil/shared'

interface Policy {
  id: string
  name: string
  description: string | null
  fileUrl: string
  fileSize: number | null
  updatedAt: string
}

interface FileFolder {
  id: string
  name: string
  icon?: string
  color?: string
  fileCount: number
  subfolderCount: number
}

interface SchoolFile {
  id: string
  name: string
  fileName: string
  fileUrl: string
  fileType: string
  fileSize: number
  uploadedAt: string
  folder?: { id: string; name: string }
}

interface FolderContents {
  folder?: { id: string; name: string; icon?: string; color?: string }
  breadcrumbs?: { id: string; name: string }[]
  folders: FileFolder[]
  subfolders?: FileFolder[]
  files: SchoolFile[]
}

type ActiveTab = 'info' | 'documents' | 'links'

const FILE_TYPE_ICONS: Record<string, typeof FileText> = {
  pdf: FileText, doc: FileText, docx: FileText,
  xls: FileSpreadsheet, xlsx: FileSpreadsheet, csv: FileSpreadsheet,
  jpg: Image, jpeg: Image, png: Image, gif: Image, webp: Image,
  mp4: Film, mov: Film, mp3: Music, wav: Music,
  zip: Archive, rar: Archive,
}

export function ResourcesPage() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<ActiveTab>('info')
  const [searchQuery, setSearchQuery] = useState('')

  // ===== Knowledge Base =====
  const { data: kbCategories } = useApi<KnowledgeCategory[]>(() => api.knowledge.list(), [])
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
  const [selectedArticle, setSelectedArticle] = useState<KnowledgeArticle | null>(null)

  // ===== Policies =====
  const { data: policies } = useApi<Policy[]>(() => api.policies.list(), [])

  // ===== Files =====
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const { data: fileContents, isLoading: filesLoading } = useApi<FolderContents>(
    () => currentFolderId ? api.files.getFolder(currentFolderId) : api.files.list(),
    [currentFolderId]
  )

  // ===== Links =====
  const { data: linksData } = useApi<LinksResponse>(() => api.links.list(), [])

  // Search across everything
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null
    const q = searchQuery.toLowerCase()
    const results: Array<{ type: 'article' | 'policy' | 'link'; item: any }> = []

    // Search knowledge articles
    kbCategories?.forEach(cat => {
      cat.articles.forEach(article => {
        if (article.title.toLowerCase().includes(q) || article.content.toLowerCase().includes(q)) {
          results.push({ type: 'article', item: { ...article, categoryName: cat.name, categoryIcon: cat.icon } })
        }
      })
    })

    // Search policies
    policies?.forEach(policy => {
      if (policy.name.toLowerCase().includes(q) || (policy.description && policy.description.toLowerCase().includes(q))) {
        results.push({ type: 'policy', item: policy })
      }
    })

    // Search links
    linksData?.categories?.forEach(cat => {
      cat.links.forEach(link => {
        if (link.title.toLowerCase().includes(q) || (link.description && link.description.toLowerCase().includes(q))) {
          results.push({ type: 'link', item: link })
        }
      })
    })
    linksData?.uncategorized?.forEach(link => {
      if (link.title.toLowerCase().includes(q) || (link.description && link.description.toLowerCase().includes(q))) {
        results.push({ type: 'link', item: link })
      }
    })

    return results
  }, [searchQuery, kbCategories, policies, linksData])

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const getFileIcon = (fileType: string) => {
    const ext = fileType.toLowerCase().split('/').pop() || fileType.toLowerCase()
    return FILE_TYPE_ICONS[ext] || File
  }

  const folders = fileContents?.subfolders || fileContents?.folders || []
  const files = fileContents?.files || []
  const breadcrumbs = fileContents?.breadcrumbs || []

  const tabs: { key: ActiveTab; label: string }[] = [
    { key: 'info', label: 'School Info' },
    { key: 'documents', label: 'Documents' },
    { key: 'links', label: 'Links' },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-[26px] font-extrabold" style={{ color: '#2D2225' }}>
          Resources
        </h1>
        <p className="text-sm font-medium mt-1" style={{ color: '#7A6469' }}>
          School information, documents and useful links
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search
          className="absolute left-4 top-1/2 -translate-y-1/2 h-[18px] w-[18px]"
          style={{ color: '#A8929A' }}
        />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search everything..."
          className="w-full pl-11 pr-10 py-3.5 rounded-[18px] text-[15px] font-medium outline-none"
          style={{
            border: '1.5px solid #F0E4E6',
            backgroundColor: '#FFFFFF',
            color: '#2D2225',
          }}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-4 top-1/2 -translate-y-1/2"
            style={{ color: '#A8929A' }}
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        )}
      </div>

      {/* Search Results */}
      {searchResults && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#A8929A' }}>
            {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for "{searchQuery}"
          </p>
          {searchResults.length === 0 ? (
            <div
              className="bg-white p-8 text-center"
              style={{ borderRadius: '22px', border: '1.5px solid #F0E4E6' }}
            >
              <p className="font-medium" style={{ color: '#A8929A' }}>No results found</p>
            </div>
          ) : (
            <div
              className="bg-white overflow-hidden"
              style={{ borderRadius: '22px', border: '1.5px solid #F0E4E6' }}
            >
              {searchResults.map((result, idx) => (
                <div
                  key={`${result.type}-${idx}`}
                  className="px-5 py-4 flex items-center gap-3 cursor-pointer"
                  style={{ borderBottom: idx < searchResults.length - 1 ? '1px solid #F0E4E6' : 'none' }}
                  onClick={() => {
                    if (result.type === 'article') {
                      setSelectedArticle(result.item)
                    } else if (result.type === 'policy') {
                      window.open(result.item.fileUrl, '_blank')
                    } else if (result.type === 'link') {
                      window.open(result.item.url, '_blank')
                    }
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-[12px] flex items-center justify-center flex-shrink-0"
                    style={{
                      backgroundColor: result.type === 'article' ? '#EDF4FC'
                        : result.type === 'policy' ? '#FFF0F3'
                        : '#EDFAF2',
                    }}
                  >
                    {result.type === 'article' && <BookOpen className="h-[18px] w-[18px]" style={{ color: '#5B8EC4' }} />}
                    {result.type === 'policy' && <FileText className="h-[18px] w-[18px]" style={{ color: '#C4506E' }} />}
                    {result.type === 'link' && <ExternalLinkIcon className="h-[18px] w-[18px]" style={{ color: '#5BA97B' }} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-[14px] font-bold truncate" style={{ color: '#2D2225' }}>
                      {result.item.title || result.item.name}
                    </h4>
                    <p className="text-[12px] font-medium truncate" style={{ color: '#A8929A' }}>
                      {result.type === 'article' ? result.item.categoryName
                        : result.type === 'policy' ? 'Policy'
                        : result.item.description || result.item.url}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 flex-shrink-0" style={{ color: '#D8CDD0' }} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab navigation (only when not searching) */}
      {!searchResults && (
        <>
          <div className="flex gap-2">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => { setActiveTab(tab.key); setCurrentFolderId(null) }}
                className="px-4 py-2 rounded-full text-[13px] font-bold transition-colors"
                style={
                  activeTab === tab.key
                    ? { backgroundColor: '#C4506E', color: '#FFFFFF' }
                    : { backgroundColor: '#FFFFFF', color: '#7A6469', border: '1.5px solid #F0E4E6' }
                }
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ===== SCHOOL INFO TAB ===== */}
          {activeTab === 'info' && (
            <div className="space-y-3">
              {(!kbCategories || kbCategories.length === 0) ? (
                <div
                  className="bg-white p-10 text-center"
                  style={{ borderRadius: '22px', border: '1.5px solid #F0E4E6' }}
                >
                  <BookOpen className="h-10 w-10 mx-auto mb-3" style={{ color: '#D8CDD0' }} />
                  <p className="font-medium" style={{ color: '#A8929A' }}>No information available yet</p>
                </div>
              ) : (
                kbCategories.map(cat => (
                  <div
                    key={cat.id}
                    className="bg-white overflow-hidden"
                    style={{ borderRadius: '22px', border: '1.5px solid #F0E4E6' }}
                  >
                    <button
                      onClick={() => setExpandedCategory(expandedCategory === cat.id ? null : cat.id)}
                      className="w-full px-5 py-4 text-left flex items-center gap-3"
                    >
                      <div
                        className="w-10 h-10 rounded-[12px] flex items-center justify-center flex-shrink-0 text-lg"
                        style={{ backgroundColor: '#EDF4FC' }}
                      >
                        {cat.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-[15px] font-bold" style={{ color: '#2D2225' }}>{cat.name}</h4>
                        <p className="text-[12px] font-medium" style={{ color: '#A8929A' }}>
                          {cat.articles.length} article{cat.articles.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <ChevronDown
                        className="h-4 w-4 flex-shrink-0 transition-transform"
                        style={{
                          color: '#A8929A',
                          transform: expandedCategory === cat.id ? 'rotate(180deg)' : 'rotate(0deg)',
                        }}
                      />
                    </button>
                    {expandedCategory === cat.id && cat.articles.length > 0 && (
                      <div style={{ borderTop: '1px solid #F0E4E6' }}>
                        {cat.articles.map((article, idx) => (
                          <button
                            key={article.id}
                            onClick={() => setSelectedArticle(article)}
                            className="w-full text-left px-5 py-3.5 flex items-center gap-3"
                            style={{ borderBottom: idx < cat.articles.length - 1 ? '1px solid #F0E4E6' : 'none' }}
                          >
                            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#C4506E' }} />
                            <span className="text-[14px] font-semibold flex-1" style={{ color: '#4A3A40' }}>
                              {article.title}
                            </span>
                            <ChevronRight className="h-4 w-4 flex-shrink-0" style={{ color: '#D8CDD0' }} />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}

              {/* Policies inline */}
              {policies && policies.length > 0 && (
                <>
                  <p className="text-xs font-bold uppercase tracking-wider mt-4" style={{ color: '#A8929A' }}>
                    School Policies
                  </p>
                  <div
                    className="bg-white overflow-hidden"
                    style={{ borderRadius: '22px', border: '1.5px solid #F0E4E6' }}
                  >
                    {policies.map((policy, idx) => (
                      <a
                        key={policy.id}
                        href={policy.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 px-5 py-4"
                        style={{ borderBottom: idx < policies.length - 1 ? '1px solid #F0E4E6' : 'none' }}
                      >
                        <div
                          className="w-10 h-10 rounded-[12px] flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: '#FFF0F3' }}
                        >
                          <FileText className="h-[18px] w-[18px]" style={{ color: '#C4506E' }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-[14px] font-bold truncate" style={{ color: '#2D2225' }}>
                            {policy.name}
                          </h4>
                          {policy.description && (
                            <p className="text-[12px] font-medium truncate" style={{ color: '#A8929A' }}>
                              {policy.description}
                            </p>
                          )}
                        </div>
                        <span className="text-[11px] font-semibold flex-shrink-0" style={{ color: '#D8CDD0' }}>
                          {formatFileSize(policy.fileSize)}
                        </span>
                      </a>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ===== DOCUMENTS TAB ===== */}
          {activeTab === 'documents' && (
            <div className="space-y-3">
              {/* Breadcrumbs */}
              {(currentFolderId || breadcrumbs.length > 0) && (
                <div className="flex items-center gap-1.5 text-[13px] font-semibold flex-wrap">
                  <button
                    onClick={() => setCurrentFolderId(null)}
                    style={{ color: '#C4506E' }}
                  >
                    All Files
                  </button>
                  {breadcrumbs.map(crumb => (
                    <React.Fragment key={crumb.id}>
                      <ChevronRight className="h-3.5 w-3.5" style={{ color: '#D8CDD0' }} />
                      <button
                        onClick={() => setCurrentFolderId(crumb.id)}
                        style={{ color: '#C4506E' }}
                      >
                        {crumb.name}
                      </button>
                    </React.Fragment>
                  ))}
                </div>
              )}

              {/* Folders */}
              {folders.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  {folders.map(folder => (
                    <button
                      key={folder.id}
                      onClick={() => setCurrentFolderId(folder.id)}
                      className="bg-white text-left p-4"
                      style={{ borderRadius: '18px', border: '1.5px solid #F0E4E6' }}
                    >
                      <div
                        className="w-11 h-11 rounded-[14px] flex items-center justify-center mb-2.5"
                        style={{ backgroundColor: '#EDF4FC' }}
                      >
                        {folder.icon ? (
                          <span className="text-xl">{folder.icon}</span>
                        ) : (
                          <Folder className="h-5 w-5" style={{ color: '#5B8EC4' }} />
                        )}
                      </div>
                      <h4 className="text-[14px] font-bold truncate" style={{ color: '#2D2225' }}>
                        {folder.name}
                      </h4>
                      <p className="text-[12px] font-medium" style={{ color: '#A8929A' }}>
                        {folder.fileCount} file{folder.fileCount !== 1 ? 's' : ''}
                      </p>
                    </button>
                  ))}
                </div>
              )}

              {/* Files */}
              {files.length > 0 && (
                <div
                  className="bg-white overflow-hidden"
                  style={{ borderRadius: '22px', border: '1.5px solid #F0E4E6' }}
                >
                  {files.map((file, idx) => {
                    const FileIcon = getFileIcon(file.fileType)
                    return (
                      <a
                        key={file.id}
                        href={file.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 px-5 py-4"
                        style={{ borderBottom: idx < files.length - 1 ? '1px solid #F0E4E6' : 'none' }}
                      >
                        <div
                          className="w-10 h-10 rounded-[12px] flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: '#FFF7EC' }}
                        >
                          <FileIcon className="h-[18px] w-[18px]" style={{ color: '#E8A54B' }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-[14px] font-bold truncate" style={{ color: '#2D2225' }}>
                            {file.name}
                          </h4>
                          <p className="text-[12px] font-medium" style={{ color: '#A8929A' }}>
                            {formatFileSize(file.fileSize)}
                          </p>
                        </div>
                        <Download className="h-4 w-4 flex-shrink-0" style={{ color: '#D8CDD0' }} />
                      </a>
                    )
                  })}
                </div>
              )}

              {/* Empty */}
              {!filesLoading && folders.length === 0 && files.length === 0 && (
                <div
                  className="bg-white p-10 text-center"
                  style={{ borderRadius: '22px', border: '1.5px solid #F0E4E6' }}
                >
                  <Folder className="h-10 w-10 mx-auto mb-3" style={{ color: '#D8CDD0' }} />
                  <p className="font-medium" style={{ color: '#A8929A' }}>No files available</p>
                </div>
              )}
            </div>
          )}

          {/* ===== LINKS TAB ===== */}
          {activeTab === 'links' && (
            <div className="space-y-4">
              {linksData?.categories?.filter(c => c.links.length > 0).map(category => (
                <div key={category.id}>
                  <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#A8929A' }}>
                    {category.name}
                  </p>
                  <div
                    className="bg-white overflow-hidden"
                    style={{ borderRadius: '22px', border: '1.5px solid #F0E4E6' }}
                  >
                    {category.links.map((link, idx) => (
                      <a
                        key={link.id}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 px-5 py-4"
                        style={{ borderBottom: idx < category.links.length - 1 ? '1px solid #F0E4E6' : 'none' }}
                      >
                        <div
                          className="w-10 h-10 rounded-[12px] flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: '#EDFAF2' }}
                        >
                          {link.imageUrl ? (
                            <img
                              src={link.imageUrl}
                              alt=""
                              className="w-6 h-6 object-contain"
                              onError={e => {
                                (e.target as HTMLImageElement).style.display = 'none'
                              }}
                            />
                          ) : link.icon ? (
                            <span className="text-lg">{link.icon}</span>
                          ) : (
                            <ExternalLinkIcon className="h-[18px] w-[18px]" style={{ color: '#5BA97B' }} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-[14px] font-bold truncate" style={{ color: '#2D2225' }}>
                            {link.title}
                          </h4>
                          {link.description && (
                            <p className="text-[12px] font-medium truncate" style={{ color: '#A8929A' }}>
                              {link.description}
                            </p>
                          )}
                        </div>
                        <ExternalLinkIcon className="h-4 w-4 flex-shrink-0" style={{ color: '#D8CDD0' }} />
                      </a>
                    ))}
                  </div>
                </div>
              ))}

              {linksData?.uncategorized && linksData.uncategorized.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#A8929A' }}>
                    Other Links
                  </p>
                  <div
                    className="bg-white overflow-hidden"
                    style={{ borderRadius: '22px', border: '1.5px solid #F0E4E6' }}
                  >
                    {linksData.uncategorized.map((link, idx) => (
                      <a
                        key={link.id}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 px-5 py-4"
                        style={{ borderBottom: idx < linksData.uncategorized.length - 1 ? '1px solid #F0E4E6' : 'none' }}
                      >
                        <div
                          className="w-10 h-10 rounded-[12px] flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: '#EDFAF2' }}
                        >
                          {link.icon ? (
                            <span className="text-lg">{link.icon}</span>
                          ) : (
                            <ExternalLinkIcon className="h-[18px] w-[18px]" style={{ color: '#5BA97B' }} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-[14px] font-bold truncate" style={{ color: '#2D2225' }}>{link.title}</h4>
                          {link.description && (
                            <p className="text-[12px] font-medium truncate" style={{ color: '#A8929A' }}>{link.description}</p>
                          )}
                        </div>
                        <ExternalLinkIcon className="h-4 w-4 flex-shrink-0" style={{ color: '#D8CDD0' }} />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty */}
              {(!linksData || (!linksData.categories?.some(c => c.links.length > 0) && !linksData.uncategorized?.length)) && (
                <div
                  className="bg-white p-10 text-center"
                  style={{ borderRadius: '22px', border: '1.5px solid #F0E4E6' }}
                >
                  <ExternalLinkIcon className="h-10 w-10 mx-auto mb-3" style={{ color: '#D8CDD0' }} />
                  <p className="font-medium" style={{ color: '#A8929A' }}>No links available</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Article Modal */}
      {selectedArticle && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          onClick={() => setSelectedArticle(null)}
        >
          <div
            className="bg-white w-full sm:max-w-lg max-h-[85vh] overflow-auto"
            style={{
              borderRadius: '22px 22px 0 0',
              borderTop: '1.5px solid #F0E4E6',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full" style={{ backgroundColor: '#E8DDE0' }} />
            </div>
            <div className="px-5 pb-6">
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-[18px] font-extrabold pr-4" style={{ color: '#2D2225' }}>
                  {selectedArticle.title}
                </h3>
                <button
                  onClick={() => setSelectedArticle(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-xl flex-shrink-0"
                  style={{ color: '#A8929A' }}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div>
                {selectedArticle.content.split('\n').map((p, i) => (
                  <p key={i} className="text-[15px] leading-relaxed mb-3" style={{ color: '#4A3A40' }}>
                    {p}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
