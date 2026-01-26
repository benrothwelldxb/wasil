import React from 'react'
import { Building2, Users } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import type { SchoolWithCount } from '../../services/api'

interface SchoolCardProps {
  school: SchoolWithCount
  onEdit: (school: SchoolWithCount) => void
}

export function SchoolCard({ school, onEdit }: SchoolCardProps) {
  const theme = useTheme()

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div
        className="p-4 text-white"
        style={{ backgroundColor: school.brandColor }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {school.logoIconUrl ? (
              <img
                src={school.logoIconUrl}
                alt={school.name}
                className="w-10 h-10 rounded"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
            ) : (
              <div className="w-10 h-10 bg-white bg-opacity-20 rounded flex items-center justify-center">
                <Building2 className="w-6 h-6" />
              </div>
            )}
            <div>
              <h3 className="font-semibold">{school.name}</h3>
              <p className="text-sm opacity-80">{school.shortName} - {school.city}</p>
            </div>
          </div>
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div
                className="w-4 h-4 rounded-full border border-gray-300"
                style={{ backgroundColor: school.brandColor }}
              />
              <span className="text-xs text-gray-500">Brand</span>
            </div>
            <div className="flex items-center space-x-2">
              <div
                className="w-4 h-4 rounded-full border border-gray-300"
                style={{ backgroundColor: school.accentColor }}
              />
              <span className="text-xs text-gray-500">Accent</span>
            </div>
          </div>
          <div className="flex items-center space-x-1 text-gray-500">
            <Users className="w-4 h-4" />
            <span className="text-sm">{school._count?.users || 0}</span>
          </div>
        </div>
        <p className="text-sm text-gray-600 mb-3">
          {school.tagline || 'No tagline set'}
        </p>
        <button
          onClick={() => onEdit(school)}
          className="w-full py-2 px-4 rounded-lg font-medium text-white transition-colors"
          style={{ backgroundColor: theme.colors.brandColor }}
        >
          Edit Branding
        </button>
      </div>
    </div>
  )
}
