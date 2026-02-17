import React from 'react'
import { FolderOpen } from 'lucide-react'

export function FilesPage() {
  return (
    <div>
      <h2 className="text-xl font-semibold text-slate-900 mb-6">Files</h2>
      <div className="text-center py-12 text-gray-500">
        <FolderOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>File management coming soon</p>
      </div>
    </div>
  )
}
