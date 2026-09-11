import React, { useState, useRef } from 'react'
import {
  FolderOpen, FolderPlus, Upload, Trash2, ChevronRight, Home,
  FileText, FileSpreadsheet, Image as ImageIcon, Film, Music, Archive, File as FileIcon,
} from 'lucide-react'
import { useTheme, useApi, api, ConfirmModal, useToast } from '@wasil/shared'

interface FileFolder {
  id: string
  name: string
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
}

/** The root listing returns `folders`; a folder's contents return `subfolders`
 *  plus breadcrumbs. Same shape otherwise, so the page normalises the two. */
interface FolderContents {
  folders?: FileFolder[]
  subfolders?: FileFolder[]
  files: SchoolFile[]
  breadcrumbs?: Array<{ id: string; name: string }>
}

// What the server actually accepts (see ALLOWED_MIME_TYPES in routes/files.ts).
// Given to the picker so the OS dialog greys out files that would be rejected,
// rather than letting someone choose a 25MB .dmg and find out after the upload.
const ACCEPT = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.csv', '.txt',
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
  '.mp4', '.mov', '.mp3', '.wav', '.zip', '.rar',
].join(',')

const MAX_BYTES = 25 * 1024 * 1024

function iconFor(file: SchoolFile) {
  const t = `${file.fileType} ${file.fileName}`.toLowerCase()
  if (t.includes('image') || /\.(jpe?g|png|gif|webp|svg)$/.test(t)) return ImageIcon
  if (t.includes('video') || /\.(mp4|mov)$/.test(t)) return Film
  if (t.includes('audio') || /\.(mp3|wav)$/.test(t)) return Music
  if (t.includes('zip') || t.includes('rar')) return Archive
  if (t.includes('sheet') || t.includes('excel') || t.includes('csv')) return FileSpreadsheet
  if (t.includes('pdf') || t.includes('word') || t.includes('text')) return FileText
  return FileIcon
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FilesPage() {
  const theme = useTheme()
  const toast = useToast()

  // null = the root listing. Folders are the "categories" files go into.
  const [folderId, setFolderId] = useState<string | null>(null)
  const { data, refetch, isLoading } = useApi<FolderContents>(
    () => (folderId ? api.files.getFolder(folderId) : api.files.list()),
    [folderId],
  )

  const [newFolderName, setNewFolderName] = useState('')
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<
    { kind: 'file' | 'folder'; id: string; name: string } | null
  >(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const folders = data?.folders ?? data?.subfolders ?? []
  const files = data?.files ?? []
  const breadcrumbs = data?.breadcrumbs ?? []

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newFolderName.trim()
    if (!name) return
    setIsCreating(true)
    try {
      // Created inside whatever is open, so a category can hold sub-categories.
      await api.files.createFolder({ name, parentId: folderId || undefined })
      setNewFolderName('')
      setShowNewFolder(false)
      refetch()
    } catch (error) {
      toast.error(`Could not create the folder: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsCreating(false)
    }
  }

  const handleUpload = async (picked: FileList | null) => {
    const chosen = picked?.[0]
    // Reset the input either way, so picking the same file twice still fires.
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (!chosen) return
    // Checked here as well as on the server: a 25MB cap that only announces
    // itself after the whole upload has gone up is a slow way to say no.
    if (chosen.size > MAX_BYTES) {
      toast.error(`${chosen.name} is ${formatSize(chosen.size)} — the limit is 25 MB.`)
      return
    }
    setIsUploading(true)
    try {
      const form = new FormData()
      form.append('file', chosen)
      form.append('name', chosen.name)
      // Omitted at the root, where a file simply has no folder.
      if (folderId) form.append('folderId', folderId)
      await api.files.upload(form)
      toast.success(`${chosen.name} uploaded`)
      refetch()
    } catch (error) {
      toast.error(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsUploading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    setIsDeleting(true)
    try {
      if (deleteConfirm.kind === 'file') {
        await api.files.deleteFile(deleteConfirm.id)
      } else {
        await api.files.deleteFolder(deleteConfirm.id)
      }
      setDeleteConfirm(null)
      refetch()
    } catch (error) {
      // The folder route refuses a folder that still has anything in it, and
      // says so — pass that through rather than a generic failure.
      toast.error(error instanceof Error ? error.message : 'Delete failed')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-slate-900">Files</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNewFolder(v => !v)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            <FolderPlus className="h-4 w-4" />
            New folder
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-50"
            style={{ backgroundColor: theme.colors.brandColor }}
          >
            <Upload className="h-4 w-4" />
            {isUploading ? 'Uploading…' : 'Upload file'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={e => handleUpload(e.target.files)}
          />
        </div>
      </div>

      {/* Where an upload will land. Said out loud because the button doesn't
          ask, and "which folder did that go in" is the obvious next question. */}
      <div className="flex items-center flex-wrap gap-1 text-sm text-slate-500 mb-4">
        <button
          onClick={() => setFolderId(null)}
          className="flex items-center gap-1 hover:text-slate-900"
        >
          <Home className="h-3.5 w-3.5" />
          All files
        </button>
        {breadcrumbs.map((crumb, i) => (
          <React.Fragment key={crumb.id}>
            <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
            <button
              onClick={() => setFolderId(crumb.id)}
              className={i === breadcrumbs.length - 1 ? 'font-medium text-slate-900' : 'hover:text-slate-900'}
            >
              {crumb.name}
            </button>
          </React.Fragment>
        ))}
      </div>

      {showNewFolder && (
        <form onSubmit={handleCreateFolder} className="flex items-center gap-2 mb-4 p-3 rounded-lg border border-slate-200 bg-slate-50">
          <input
            autoFocus
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            placeholder={folderId ? 'Folder name (inside this one)' : 'Folder name, e.g. Newsletters'}
            className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg"
          />
          <button
            type="submit"
            disabled={isCreating || !newFolderName.trim()}
            className="px-3 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-50"
            style={{ backgroundColor: theme.colors.brandColor }}
          >
            {isCreating ? 'Creating…' : 'Create'}
          </button>
          <button
            type="button"
            onClick={() => { setShowNewFolder(false); setNewFolderName('') }}
            className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700"
          >
            Cancel
          </button>
        </form>
      )}

      {isLoading && <p className="text-sm text-slate-400 py-6 text-center">Loading…</p>}

      {!isLoading && folders.length === 0 && files.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          <FolderOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-sm">
            {folderId ? 'This folder is empty.' : 'No files yet. Make a folder, or upload a file straight to the top level.'}
          </p>
        </div>
      )}

      {folders.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
          {folders.map(folder => (
            <div
              key={folder.id}
              className="group flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-white hover:border-slate-300"
            >
              <button onClick={() => setFolderId(folder.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                <FolderOpen className="h-5 w-5 flex-shrink-0" style={{ color: theme.colors.brandColor }} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{folder.name}</p>
                  <p className="text-xs text-slate-400">
                    {folder.fileCount} file{folder.fileCount !== 1 ? 's' : ''}
                    {folder.subfolderCount > 0 && `, ${folder.subfolderCount} folder${folder.subfolderCount !== 1 ? 's' : ''}`}
                  </p>
                </div>
              </button>
              <button
                onClick={() => setDeleteConfirm({ kind: 'folder', id: folder.id, name: folder.name })}
                className="p-1.5 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100"
                title="Delete folder"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map(file => {
            const Icon = iconFor(file)
            return (
              <div key={file.id} className="group flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-white">
                <Icon className="h-5 w-5 text-slate-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <a
                    href={file.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-slate-900 hover:underline truncate block"
                  >
                    {file.name}
                  </a>
                  <p className="text-xs text-slate-400">
                    {formatSize(file.fileSize)} · {new Date(file.uploadedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <button
                  onClick={() => setDeleteConfirm({ kind: 'file', id: file.id, name: file.name })}
                  className="p-1.5 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100"
                  title="Delete file"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {deleteConfirm && (
        <ConfirmModal
          title={deleteConfirm.kind === 'file' ? 'Delete file?' : 'Delete folder?'}
          message={
            deleteConfirm.kind === 'file'
              ? `"${deleteConfirm.name}" will be removed for parents too. This cannot be undone.`
              : `"${deleteConfirm.name}" will be removed. A folder still holding files or sub-folders can't be deleted until those are cleared out.`
          }
          confirmLabel="Delete"
          variant="danger"
          isLoading={isDeleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  )
}
