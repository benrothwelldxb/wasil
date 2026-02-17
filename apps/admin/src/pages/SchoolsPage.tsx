import React, { useState } from 'react'
import { Building2, Users, Palette, Save, RefreshCw } from 'lucide-react'
import { useTheme, useApi, api, ColorPicker } from '@wasil/shared'
import type { SchoolWithCount } from '@wasil/shared'

interface EditSchoolModalProps {
  school: SchoolWithCount
  onClose: () => void
  onSaved: () => void
}

function EditSchoolModal({ school, onClose, onSaved }: EditSchoolModalProps) {
  const [name, setName] = useState(school.name)
  const [shortName, setShortName] = useState(school.shortName)
  const [tagline, setTagline] = useState(school.tagline || '')
  const [brandColor, setBrandColor] = useState(school.brandColor)
  const [accentColor, setAccentColor] = useState(school.accentColor)
  const [logoUrl, setLogoUrl] = useState(school.logoUrl || '')
  const [logoIconUrl, setLogoIconUrl] = useState(school.logoIconUrl || '')
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await api.schools.updateBranding(school.id, {
        name,
        shortName,
        tagline: tagline || undefined,
        brandColor,
        accentColor,
        logoUrl: logoUrl || undefined,
        logoIconUrl: logoIconUrl || undefined,
      })
      onSaved()
      onClose()
    } catch (error) {
      alert(`Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
            <Palette className="h-5 w-5" />
            <span>Edit School Branding</span>
          </h3>
        </div>

        <div className="p-6 grid grid-cols-2 gap-6">
          {/* Form */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">School Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Short Name</label>
              <input
                type="text"
                value={shortName}
                onChange={e => setShortName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tagline</label>
              <input
                type="text"
                value={tagline}
                onChange={e => setTagline(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g. Learning Together, Growing Together"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Brand Colour</label>
              <ColorPicker value={brandColor} onChange={setBrandColor} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Accent Colour</label>
              <ColorPicker value={accentColor} onChange={setAccentColor} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Logo URL</label>
              <input
                type="text"
                value={logoUrl}
                onChange={e => setLogoUrl(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Logo Icon URL</label>
              <input
                type="text"
                value={logoIconUrl}
                onChange={e => setLogoIconUrl(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="https://..."
              />
            </div>
          </div>

          {/* Live Preview */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">Live Preview</h4>
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="h-24 flex items-center justify-center px-4" style={{ backgroundColor: brandColor }}>
                {logoUrl ? (
                  <img src={logoUrl} alt={name} className="h-12 object-contain" />
                ) : (
                  <span className="text-white text-lg font-bold">{shortName || name}</span>
                )}
              </div>
              <div className="p-4">
                <h4 className="font-semibold text-gray-900">{name}</h4>
                {tagline && <p className="text-sm text-gray-500 mt-1">{tagline}</p>}
                <div className="flex items-center space-x-2 mt-3">
                  <div className="w-6 h-6 rounded-full" style={{ backgroundColor: brandColor }} title="Brand" />
                  <div className="w-6 h-6 rounded-full" style={{ backgroundColor: accentColor }} title="Accent" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center space-x-2 px-4 py-2 rounded-lg text-white disabled:opacity-50"
            style={{ backgroundColor: brandColor }}
          >
            {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

interface SchoolCardProps {
  school: SchoolWithCount
  onEdit: () => void
}

function SchoolCard({ school, onEdit }: SchoolCardProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="h-20 flex items-center justify-center px-4" style={{ backgroundColor: school.brandColor }}>
        {school.logoUrl ? (
          <img src={school.logoUrl} alt={school.name} className="h-10 object-contain" />
        ) : (
          <span className="text-white text-lg font-bold">{school.shortName || school.name}</span>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-gray-900">{school.name}</h3>
        {school.tagline && <p className="text-sm text-gray-500 mt-0.5">{school.tagline}</p>}
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-1">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: school.brandColor }} />
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: school.accentColor }} />
            </div>
            {school._count && (
              <span className="flex items-center space-x-1 text-sm text-gray-500">
                <Users className="h-3.5 w-3.5" />
                <span>{school._count.users}</span>
              </span>
            )}
          </div>
          <button
            onClick={onEdit}
            className="text-sm px-3 py-1 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Edit
          </button>
        </div>
      </div>
    </div>
  )
}

export function SchoolsPage() {
  const { data: schools, refetch: refetchSchools } = useApi<SchoolWithCount[]>(() => api.schools.list(), [])
  const [editingSchool, setEditingSchool] = useState<SchoolWithCount | null>(null)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-slate-900 flex items-center space-x-2">
          <Building2 className="h-6 w-6" />
          <span>Schools</span>
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {schools?.map(school => (
          <SchoolCard
            key={school.id}
            school={school}
            onEdit={() => setEditingSchool(school)}
          />
        ))}
      </div>

      {(!schools || schools.length === 0) && (
        <div className="text-center py-12 text-gray-500">
          <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No schools found</p>
        </div>
      )}

      {editingSchool && (
        <EditSchoolModal
          school={editingSchool}
          onClose={() => setEditingSchool(null)}
          onSaved={refetchSchools}
        />
      )}
    </div>
  )
}
