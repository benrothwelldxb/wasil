import React, { useState, useEffect } from 'react'
import {
  Folder,
  File,
  FileText,
  Image,
  FileSpreadsheet,
  Film,
  Music,
  Archive,
  Search,
  ChevronRight,
  Home,
  Download,
  Grid,
  List,
  X,
} from 'lucide-react'
import { useApi } from '@wasil/shared'
import { useTheme } from '@wasil/shared'
import * as api from '@wasil/shared'

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

const FILE_ICONS: Record<string, React.ComponentType<any>> = {
  pdf: FileText,
  doc: FileText,
  docx: FileText,
  xls: FileSpreadsheet,
  xlsx: FileSpreadsheet,
  csv: FileSpreadsheet,
  jpg: Image,
  jpeg: Image,
  png: Image,
  gif: Image,
  webp: Image,
  mp4: Film,
  mov: Film,
  avi: Film,
  mp3: Music,
  wav: Music,
  zip: Archive,
  rar: Archive,
}

const FOLDER_COLORS: Record<string, string> = {
  blue: '#3b82f6',
  green: '#22c55e',
  purple: '#9333ea',
  orange: '#f97316',
  pink: '#ec4899',
  yellow: '#eab308',
}

export function FilesPage() {
  const theme = useTheme()
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SchoolFile[] | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  // Fetch root contents or folder contents
  const { data: contents, isLoading, refetch } = useApi<FolderContents>(
    () => currentFolderId
      ? api.files.getFolder(currentFolderId)
      : api.files.list(),
    [currentFolderId]
  )

  // Search debounce
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null)
      return
    }

    const timer = setTimeout(async () => {
      setIsSearching(true)
      try {
        const results = await api.files.search(searchQuery)
        setSearchResults(results.files)
      } catch (error) {
        console.error('Search error:', error)
      } finally {
        setIsSearching(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery])

  const getFileIcon = (fileType: string) => {
    const ext = fileType.toLowerCase().split('/').pop() || fileType.toLowerCase()
    const IconComponent = FILE_ICONS[ext] || File
    return IconComponent
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

  const navigateToFolder = (folderId: string | null) => {
    setCurrentFolderId(folderId)
    setSearchQuery('')
    setSearchResults(null)
  }

  const clearSearch = () => {
    setSearchQuery('')
    setSearchResults(null)
  }

  const folders = contents?.subfolders || contents?.folders || []
  const files = searchResults || contents?.files || []
  const breadcrumbs = contents?.breadcrumbs || []

  if (isLoading && !contents) {
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
          Files
        </h1>
        <p className="text-gray-600 mt-1">
          School documents, forms, and resources
        </p>
      </div>

      {/* Search and View Toggle */}
      <div className="flex items-center space-x-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-10 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-burgundy focus:border-transparent"
          />
          {searchQuery && (
            <button
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
        <div className="flex items-center bg-white rounded-lg border border-gray-200">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-l-lg ${viewMode === 'grid' ? 'bg-gray-100' : ''}`}
          >
            <Grid className="h-5 w-5 text-gray-600" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-r-lg ${viewMode === 'list' ? 'bg-gray-100' : ''}`}
          >
            <List className="h-5 w-5 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Breadcrumbs */}
      {!searchResults && (currentFolderId || breadcrumbs.length > 0) && (
        <div className="flex items-center space-x-2 text-sm">
          <button
            onClick={() => navigateToFolder(null)}
            className="flex items-center text-gray-600 hover:text-burgundy"
          >
            <Home className="h-4 w-4" />
          </button>
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={crumb.id}>
              <ChevronRight className="h-4 w-4 text-gray-400" />
              <button
                onClick={() => navigateToFolder(crumb.id)}
                className={`hover:text-burgundy ${
                  idx === breadcrumbs.length - 1 ? 'font-medium text-gray-900' : 'text-gray-600'
                }`}
              >
                {crumb.name}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Search Results Label */}
      {searchResults && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">
            {isSearching ? 'Searching...' : `${searchResults.length} results for "${searchQuery}"`}
          </p>
          <button
            onClick={clearSearch}
            className="text-sm text-burgundy hover:underline"
          >
            Clear search
          </button>
        </div>
      )}

      {/* Folders Grid (only when not searching) */}
      {!searchResults && folders.length > 0 && (
        <div className={viewMode === 'grid'
          ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
          : "space-y-2"
        }>
          {folders.map((folder) => {
            const folderColor = folder.color ? FOLDER_COLORS[folder.color] || theme.colors.brandColor : theme.colors.brandColor

            return viewMode === 'grid' ? (
              <button
                key={folder.id}
                onClick={() => navigateToFolder(folder.id)}
                className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow text-left group"
              >
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center mb-3"
                  style={{ backgroundColor: `${folderColor}20` }}
                >
                  {folder.icon ? (
                    <span className="text-2xl">{folder.icon}</span>
                  ) : (
                    <Folder className="h-6 w-6" style={{ color: folderColor }} />
                  )}
                </div>
                <h3 className="font-medium text-gray-900 group-hover:text-burgundy truncate">
                  {folder.name}
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  {folder.fileCount} files
                  {folder.subfolderCount > 0 && `, ${folder.subfolderCount} folders`}
                </p>
              </button>
            ) : (
              <button
                key={folder.id}
                onClick={() => navigateToFolder(folder.id)}
                className="w-full flex items-center bg-white rounded-xl shadow-sm border border-gray-100 p-3 hover:shadow-md transition-shadow group"
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${folderColor}20` }}
                >
                  {folder.icon ? (
                    <span className="text-xl">{folder.icon}</span>
                  ) : (
                    <Folder className="h-5 w-5" style={{ color: folderColor }} />
                  )}
                </div>
                <div className="ml-3 flex-1 text-left">
                  <h3 className="font-medium text-gray-900 group-hover:text-burgundy">
                    {folder.name}
                  </h3>
                  <p className="text-xs text-gray-500">
                    {folder.fileCount} files
                    {folder.subfolderCount > 0 && `, ${folder.subfolderCount} folders`}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-400" />
              </button>
            )
          })}
        </div>
      )}

      {/* Files */}
      {files.length > 0 && (
        <>
          {!searchResults && folders.length > 0 && (
            <h3 className="font-semibold text-gray-700 mt-6">Files</h3>
          )}
          <div className={viewMode === 'grid'
            ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
            : "space-y-2"
          }>
            {files.map((file) => {
              const FileIcon = getFileIcon(file.fileType)

              return viewMode === 'grid' ? (
                <a
                  key={file.id}
                  href={file.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow group"
                >
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center mb-3"
                    style={{ backgroundColor: `${theme.colors.accentColor}20` }}
                  >
                    <FileIcon className="h-6 w-6" style={{ color: theme.colors.accentColor }} />
                  </div>
                  <h3 className="font-medium text-gray-900 group-hover:text-burgundy truncate text-sm">
                    {file.name}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    {formatFileSize(file.fileSize)}
                  </p>
                  {searchResults && file.folder && (
                    <p className="text-xs text-gray-400 mt-1 truncate">
                      in {file.folder.name}
                    </p>
                  )}
                </a>
              ) : (
                <a
                  key={file.id}
                  href={file.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center bg-white rounded-xl shadow-sm border border-gray-100 p-3 hover:shadow-md transition-shadow group"
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${theme.colors.accentColor}20` }}
                  >
                    <FileIcon className="h-5 w-5" style={{ color: theme.colors.accentColor }} />
                  </div>
                  <div className="ml-3 flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 group-hover:text-burgundy truncate">
                      {file.name}
                    </h3>
                    <p className="text-xs text-gray-500">
                      {formatFileSize(file.fileSize)} • {formatDate(file.uploadedAt)}
                      {searchResults && file.folder && ` • in ${file.folder.name}`}
                    </p>
                  </div>
                  <Download className="h-5 w-5 text-gray-400 group-hover:text-burgundy flex-shrink-0 ml-2" />
                </a>
              )
            })}
          </div>
        </>
      )}

      {/* Empty State */}
      {!isLoading && folders.length === 0 && files.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <Folder className="h-12 w-12 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">
            {searchResults ? 'No files match your search.' : 'No files in this folder.'}
          </p>
        </div>
      )}
    </div>
  )
}
