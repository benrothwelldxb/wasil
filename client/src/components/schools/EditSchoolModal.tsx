import React, { useState } from 'react'
import { Palette, Building2, Save } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import { ColorPicker } from '../ui/ColorPicker'
import type { SchoolWithCount } from '../../services/api'

export interface SchoolFormData {
  name: string
  shortName: string
  brandColor: string
  accentColor: string
  tagline: string
  logoUrl: string
  logoIconUrl: string
}

interface EditSchoolModalProps {
  school: SchoolWithCount
  onClose: () => void
  onSave: (id: string, data: SchoolFormData) => Promise<void>
}

export function EditSchoolModal({ school, onClose, onSave }: EditSchoolModalProps) {
  const theme = useTheme()
  const [formData, setFormData] = useState<SchoolFormData>({
    name: school.name,
    shortName: school.shortName,
    brandColor: school.brandColor,
    accentColor: school.accentColor,
    tagline: school.tagline || '',
    logoUrl: school.logoUrl || '',
    logoIconUrl: school.logoIconUrl || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave(school.id, formData)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-auto">
        <div
          className="p-6 text-white sticky top-0"
          style={{ backgroundColor: formData.brandColor }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Palette className="w-6 h-6" />
              <h2 className="text-xl font-bold">Edit School Branding</h2>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white hover:bg-opacity-20 p-2 rounded-lg"
            >
              &times;
            </button>
          </div>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column - Form */}
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-800 mb-3">School Details</h3>

              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">School Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Short Name</label>
                <input
                  type="text"
                  value={formData.shortName}
                  onChange={(e) => setFormData({ ...formData, shortName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Tagline</label>
                <input
                  type="text"
                  value={formData.tagline}
                  onChange={(e) => setFormData({ ...formData, tagline: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="e.g., Stay Connected"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <ColorPicker
                  label="Brand Color"
                  value={formData.brandColor}
                  onChange={(v) => setFormData({ ...formData, brandColor: v })}
                />
                <ColorPicker
                  label="Accent Color"
                  value={formData.accentColor}
                  onChange={(v) => setFormData({ ...formData, accentColor: v })}
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Logo URL (Login Page)</label>
                <input
                  type="url"
                  value={formData.logoUrl}
                  onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="https://example.com/logo.png"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Icon URL (Header, 48x48)</label>
                <input
                  type="url"
                  value={formData.logoIconUrl}
                  onChange={(e) => setFormData({ ...formData, logoIconUrl: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="https://example.com/icon.png"
                />
              </div>
            </div>

            {/* Right Column - Preview */}
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-800 mb-3">Preview</h3>

              {/* Header Preview */}
              <div className="rounded-lg overflow-hidden shadow-sm border border-gray-200">
                <div
                  className="p-3"
                  style={{ backgroundColor: formData.brandColor }}
                >
                  <div className="flex items-center space-x-2">
                    {formData.logoIconUrl ? (
                      <img
                        src={formData.logoIconUrl}
                        alt="Icon"
                        className="w-8 h-8"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                        }}
                      />
                    ) : (
                      <div className="w-8 h-8 bg-white bg-opacity-20 rounded flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-white" />
                      </div>
                    )}
                    <div>
                      <p className="text-white font-semibold text-sm">{formData.name}</p>
                      <p
                        className="text-xs"
                        style={{ color: formData.accentColor }}
                      >
                        {formData.tagline || 'Tagline'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Login Preview */}
              <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
                <p className="text-xs text-gray-500 mb-2">Login Page Preview</p>
                <div className="bg-white rounded-lg p-4 text-center">
                  {formData.logoUrl ? (
                    <img
                      src={formData.logoUrl}
                      alt="Logo"
                      className="h-16 mx-auto mb-2"
                      onError={(e) => {
                        e.currentTarget.src = '/school-logo.png'
                      }}
                    />
                  ) : (
                    <div className="h-16 flex items-center justify-center mb-2">
                      <Building2 className="w-12 h-12 text-gray-300" />
                    </div>
                  )}
                  <p
                    className="font-semibold"
                    style={{ color: formData.brandColor }}
                  >
                    Welcome
                  </p>
                </div>
              </div>

              {/* Button Preview */}
              <div className="space-y-2">
                <p className="text-xs text-gray-500">Button Styles</p>
                <button
                  className="w-full py-2 rounded-lg text-white font-medium"
                  style={{ backgroundColor: formData.brandColor }}
                >
                  Primary Button
                </button>
                <button
                  className="w-full py-2 rounded-lg font-medium"
                  style={{
                    backgroundColor: formData.accentColor,
                    color: formData.brandColor
                  }}
                >
                  Secondary Button
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-3 mt-6 pt-6 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-white font-medium flex items-center space-x-2 disabled:opacity-50"
              style={{ backgroundColor: theme.colors.brandColor }}
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
